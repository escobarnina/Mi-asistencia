// Pruebas del flujo de un módulo nuevo (RF-13): crear inactivo, importar estudiantes
// y fechas a ESE módulo, y activarlo solo cuando ya tiene datos.
process.env.NODE_ENV = 'test';

const request = require('supertest');
const ExcelJS = require('exceljs');
const app = require('../src/server');
const {
  sequelize,
  Usuario,
  Modulo,
  Inscripcion,
  SesionClase,
  Asistencia,
  Importacion,
  Actividad,
  TokenRevocado,
} = require('../src/models');
const { hashPassword } = require('../src/core/security');

const auth = (t) => ({ Authorization: `Bearer ${t}` });

let tokenAdmin;
let modulo1;
let sesion1;
let estA; // inscrito en el módulo 1 y que se vuelve a inscribir en el 2
let estC; // inscrito solo en el módulo 1

async function crearExcel(filas) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Hoja1');
  filas.forEach((f) => hoja.addRow(f));
  return Buffer.from(await libro.xlsx.writeBuffer());
}

const ENC_ESTUDIANTES = ['Número de registro', 'Nombre completo', 'Correo electrónico'];
const ENC_FECHAS = ['Fecha', 'Hora inicio', 'Hora fin'];

const enviar = (ruta, buffer, moduloId) => {
  let r = request(app).post(`/api/importacion/${ruta}`).set(auth(tokenAdmin));
  if (moduloId !== undefined) r = r.field('modulo_id', String(moduloId));
  return r.attach('archivo', buffer, 'datos.xlsx');
};

const crearModulo = async (nombre, gestion) => (
  await request(app).post('/api/modulos').set(auth(tokenAdmin)).send({ nombre, gestion })
).body.modulo;

const activar = (id) => request(app).post(`/api/modulos/${id}/activar`).set(auth(tokenAdmin));
const loginEstudiante = (identificador) => request(app)
  .post('/api/auth/login')
  .send({ identificador });

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

beforeEach(async () => {
  await Actividad.destroy({ where: {} });
  await TokenRevocado.destroy({ where: {} });
  await Asistencia.destroy({ where: {} });
  await Importacion.destroy({ where: {} });
  await SesionClase.destroy({ where: {} });
  await Inscripcion.destroy({ where: {} });
  await Modulo.destroy({ where: {} });
  await Usuario.destroy({ where: {} });

  const admin = await Usuario.create({
    nombre: 'Admin Prueba',
    email: 'admin@test.com',
    rol: 'ADMIN',
    password_hash: await hashPassword('secreto123'),
    activo: true,
  });
  modulo1 = await Modulo.create({
    nombre: 'Módulo 1',
    gestion: '2-2026',
    activo: true,
    activado_en: new Date(),
    creado_por: admin.id,
  });
  estA = await Usuario.create({
    codigo: '1001', nombre: 'Ana Pérez', email: 'ana@gmail.com', rol: 'ESTUDIANTE', activo: true,
  });
  estC = await Usuario.create({
    codigo: '1003', nombre: 'Carlos Solo', email: 'carlos@gmail.com', rol: 'ESTUDIANTE', activo: true,
  });
  await Inscripcion.bulkCreate([
    { modulo_id: modulo1.id, estudiante_id: estA.id },
    { modulo_id: modulo1.id, estudiante_id: estC.id },
  ]);
  sesion1 = await SesionClase.create({
    modulo_id: modulo1.id, fecha: '2026-10-05', hora_inicio: '18:00:00', hora_fin: '21:00:00',
  });
  await Asistencia.create({
    sesion_id: sesion1.id,
    estudiante_id: estA.id,
    estado: 'PRESENTE',
    hora_registro: new Date(),
    origen: 'ESTUDIANTE',
  });

  tokenAdmin = (
    await request(app)
      .post('/api/auth/login')
      .send({ identificador: 'admin@test.com', password: 'secreto123' })
  ).body.access_token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Importar a un módulo nuevo (inactivo)', () => {
  test('la vista previa y el guardado usan el módulo destino, no el activo', async () => {
    const modulo2 = await crearModulo('Módulo 2', '1-2027');
    expect(modulo2.activo).toBe(false);
    const buf = await crearExcel([
      ENC_ESTUDIANTES,
      [1001, 'Ana Pérez', 'ana@gmail.com'], // ya existe, pero no está en el módulo 2
      [1002, 'Beto Nuevo', 'beto@gmail.com'],
    ]);

    const previa = await enviar('estudiantes/revisar', buf, modulo2.id);
    expect(previa.status).toBe(200);
    expect(previa.body.validas.map((v) => v.estado)).toEqual(['EXISTENTE', 'NUEVO']);

    const res = await enviar('estudiantes', buf, modulo2.id);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ creados: 1, inscritos: 2 });

    expect(await Inscripcion.count({ where: { modulo_id: modulo2.id } })).toBe(2);
    expect(await Inscripcion.count({ where: { modulo_id: modulo1.id } })).toBe(2);
    expect((await Modulo.findByPk(modulo1.id)).activo).toBe(true);
    const importacion = await Importacion.findOne({ where: { tipo: 'ESTUDIANTES' } });
    expect(importacion.modulo_id).toBe(modulo2.id);
    const actividad = await Actividad.findOne({ where: { accion: 'IMPORTAR_ESTUDIANTES' } });
    expect(actividad.modulo_id).toBe(modulo2.id);
  });

  test('el mismo número de registro puede inscribirse en el módulo nuevo (RN-02 por módulo)', async () => {
    const modulo2 = await crearModulo('Módulo 2', '1-2027');
    const buf = await crearExcel([ENC_ESTUDIANTES, [1001, 'Ana Pérez', 'ana@gmail.com']]);

    const res = await enviar('estudiantes', buf, modulo2.id);

    expect(res.status).toBe(201);
    expect(await Usuario.count({ where: { codigo: '1001' } })).toBe(1);
    expect(await Inscripcion.count({ where: { estudiante_id: estA.id } })).toBe(2);
  });

  test('las fechas se validan contra el módulo destino', async () => {
    const modulo2 = await crearModulo('Módulo 2', '1-2027');
    // 05/10/2026 ya existe en el módulo 1, pero no en el 2.
    const buf = await crearExcel([ENC_FECHAS, ['05/10/2026', '18:00', '21:00']]);

    const previa = await enviar('fechas/revisar', buf, modulo2.id);
    expect(previa.status).toBe(200);
    expect(previa.body.errores).toEqual([]);
    expect(previa.body.validas).toHaveLength(1);

    const res = await enviar('fechas', buf, modulo2.id);
    expect(res.status).toBe(201);
    expect(await SesionClase.count({ where: { modulo_id: modulo2.id } })).toBe(1);

    // Repetir en el mismo módulo sí es un error.
    const repetida = await enviar('fechas', buf, modulo2.id);
    expect(repetida.status).toBe(400);
    expect(repetida.body.errores[0].mensaje).toContain('en este módulo');
  });

  test('sin modulo_id importa al módulo activo (compatibilidad)', async () => {
    const buf = await crearExcel([ENC_ESTUDIANTES, [1002, 'Beto Nuevo', 'beto@gmail.com']]);

    const res = await enviar('estudiantes', buf);

    expect(res.status).toBe(201);
    expect(await Inscripcion.count({ where: { modulo_id: modulo1.id } })).toBe(3);
  });

  test('rechaza un módulo inexistente, inválido o ya reemplazado', async () => {
    const buf = await crearExcel([ENC_ESTUDIANTES, [1002, 'Beto Nuevo', 'beto@gmail.com']]);
    const modulo2 = await crearModulo('Módulo 2', '1-2027');
    const buf2 = await crearExcel([ENC_FECHAS, ['06/10/2026', '18:00', '21:00']]);
    await enviar('estudiantes', buf, modulo2.id);
    await enviar('fechas', buf2, modulo2.id);
    await activar(modulo2.id); // el módulo 1 queda como historia

    expect((await enviar('estudiantes', buf, 9999)).status).toBe(404);
    expect((await enviar('estudiantes', buf, 'abc')).status).toBe(400);
    const historico = await enviar('estudiantes', buf, modulo1.id);
    expect(historico.status).toBe(409);
    expect(historico.body.detalle).toMatch(/ya se usó y fue reemplazado/);
    expect(await Inscripcion.count({ where: { modulo_id: modulo1.id } })).toBe(2);
  });
});

describe('Activar con validación (RF-13)', () => {
  test('sin estudiantes o sin fechas responde 400 y no cambia el módulo activo', async () => {
    const modulo2 = await crearModulo('Módulo 2', '1-2027');

    const vacio = await activar(modulo2.id);
    expect(vacio.status).toBe(400);
    expect(vacio.body.detalle).toMatch(/estudiantes inscritos ni fechas de clase/);

    await enviar(
      'estudiantes',
      await crearExcel([ENC_ESTUDIANTES, [1002, 'Beto Nuevo', 'beto@gmail.com']]),
      modulo2.id
    );
    const sinFechas = await activar(modulo2.id);
    expect(sinFechas.status).toBe(400);
    expect(sinFechas.body.detalle).toMatch(/fechas de clase/);
    expect(sinFechas.body.detalle).not.toMatch(/estudiantes inscritos/);

    const modulo3 = await crearModulo('Módulo 3', '1-2027');
    await enviar(
      'fechas',
      await crearExcel([ENC_FECHAS, ['06/10/2026', '18:00', '21:00']]),
      modulo3.id
    );
    const sinEstudiantes = await activar(modulo3.id);
    expect(sinEstudiantes.status).toBe(400);
    expect(sinEstudiantes.body.detalle).toMatch(/estudiantes inscritos/);

    expect((await Modulo.findByPk(modulo1.id)).activo).toBe(true);
    expect(await Modulo.count({ where: { activo: true } })).toBe(1);
    expect(await Actividad.count({ where: { accion: 'ACTIVAR_MODULO' } })).toBe(0);
  });

  test('el listado informa inscritos y fechas de cada módulo', async () => {
    const modulo2 = await crearModulo('Módulo 2', '1-2027');
    await enviar(
      'estudiantes',
      await crearExcel([ENC_ESTUDIANTES, [1002, 'Beto Nuevo', 'beto@gmail.com']]),
      modulo2.id
    );

    const lista = (await request(app).get('/api/modulos').set(auth(tokenAdmin))).body.modulos;

    const m1 = lista.find((m) => m.id === modulo1.id);
    const m2 = lista.find((m) => m.id === modulo2.id);
    expect([Number(m1.inscritos), Number(m1.fechas)]).toEqual([2, 1]);
    expect([Number(m2.inscritos), Number(m2.fechas)]).toEqual([1, 0]);
  });

  test('activar el módulo completo deja el anterior intacto y el nuevo sin asistencias', async () => {
    const modulo2 = await crearModulo('Módulo 2', '1-2027');
    await enviar(
      'estudiantes',
      await crearExcel([
        ENC_ESTUDIANTES,
        [1001, 'Ana Pérez', 'ana@gmail.com'],
        [1002, 'Beto Nuevo', 'beto@gmail.com'],
      ]),
      modulo2.id
    );
    await enviar(
      'fechas',
      await crearExcel([ENC_FECHAS, ['12/10/2026', '18:00', '21:00']]),
      modulo2.id
    );

    const res = await activar(modulo2.id);

    expect(res.status).toBe(200);
    expect(res.body.modulo).toMatchObject({ id: modulo2.id, activo: true });
    expect(await Modulo.count({ where: { activo: true } })).toBe(1);

    // El módulo anterior sigue ahí con todos sus datos (RN-08).
    const anterior = await Modulo.findByPk(modulo1.id);
    expect(anterior.activo).toBe(false);
    expect(await Inscripcion.count({ where: { modulo_id: modulo1.id } })).toBe(2);
    expect(await SesionClase.count({ where: { modulo_id: modulo1.id } })).toBe(1);
    expect(await Asistencia.count({ where: { sesion_id: sesion1.id } })).toBe(1);

    // El nuevo empieza sin registros de asistencia.
    const sesiones2 = await SesionClase.findAll({ where: { modulo_id: modulo2.id } });
    expect(sesiones2).toHaveLength(1);
    expect(await Asistencia.count({ where: { sesion_id: sesiones2.map((s) => s.id) } })).toBe(0);

    const registro = await Actividad.findOne({ where: { accion: 'ACTIVAR_MODULO' } });
    expect(registro.modulo_id).toBe(modulo2.id);
    expect(registro.detalle).toContain('2 estudiantes, 1 fechas');
  });

  test('tras activar, entran los estudiantes del módulo nuevo y no los del anterior', async () => {
    const modulo2 = await crearModulo('Módulo 2', '1-2027');
    await enviar(
      'estudiantes',
      await crearExcel([
        ENC_ESTUDIANTES,
        [1001, 'Ana Pérez', 'ana@gmail.com'],
        [1002, 'Beto Nuevo', 'beto@gmail.com'],
      ]),
      modulo2.id
    );
    await enviar(
      'fechas',
      await crearExcel([ENC_FECHAS, ['12/10/2026', '18:00', '21:00']]),
      modulo2.id
    );
    // Antes de activar, Beto (solo del módulo 2) no puede entrar y Carlos sí.
    expect((await loginEstudiante('beto@gmail.com')).status).toBe(401);
    expect((await loginEstudiante('1003')).status).toBe(200);

    await activar(modulo2.id);

    expect((await loginEstudiante('beto@gmail.com')).status).toBe(200);
    expect((await loginEstudiante('1001')).status).toBe(200);
    const carlos = await loginEstudiante('1003');
    expect(carlos.status).toBe(401);
    expect(carlos.body.detalle).toBe('No estás inscrito en el módulo activo');
  });
});
