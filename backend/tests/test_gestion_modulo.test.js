// Pruebas de la gestión editable de un módulo (Fase B): agregar, editar y quitar
// estudiantes y fechas a mano o por Excel, antes o después de activar el módulo.
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
let tokenEstudiante;
let modulo; // módulo ACTIVO con Ana (con asistencia) y Carlos (sin asistencia)
let sesion; // fecha con la asistencia de Ana
let ana;
let carlos;

const ENC_ESTUDIANTES = ['Número de registro', 'Nombre completo', 'Correo electrónico'];

async function crearExcel(filas) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Hoja1');
  filas.forEach((f) => hoja.addRow(f));
  return Buffer.from(await libro.xlsx.writeBuffer());
}

const post = (ruta, cuerpo, token = tokenAdmin) =>
  request(app).post(ruta).set(auth(token)).send(cuerpo);
const put = (ruta, cuerpo) => request(app).put(ruta).set(auth(tokenAdmin)).send(cuerpo);
const del = (ruta) => request(app).delete(ruta).set(auth(tokenAdmin));
const get = (ruta) => request(app).get(ruta).set(auth(tokenAdmin));

const agregarEst = (codigo, nombre, email, id = modulo.id) =>
  post(`/api/modulos/${id}/estudiantes`, { codigo, nombre, email });

const importar = (ruta, buffer, campos = {}) => {
  let r = request(app).post(`/api/importacion/${ruta}`).set(auth(tokenAdmin));
  Object.entries({ modulo_id: modulo.id, ...campos }).forEach(([k, v]) => {
    r = r.field(k, String(v));
  });
  return r.attach('archivo', buffer, 'lista.xlsx');
};

// Acciones de gestión registradas (sin los LOGIN de la preparación de cada prueba).
const acciones = async () =>
  (await Actividad.findAll({ order: [['id', 'ASC']] }))
    .map((a) => a.accion)
    .filter((a) => a !== 'LOGIN' && a !== 'LOGOUT');

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
  modulo = await Modulo.create({
    nombre: 'Módulo 1',
    gestion: '2-2026',
    activo: true,
    activado_en: new Date(),
    creado_por: admin.id,
  });
  ana = await Usuario.create({
    codigo: '1001', nombre: 'Ana Pérez', email: 'ana@gmail.com', rol: 'ESTUDIANTE', activo: true,
  });
  carlos = await Usuario.create({
    codigo: '1003', nombre: 'Carlos Solo', email: 'carlos@gmail.com', rol: 'ESTUDIANTE', activo: true,
  });
  await Inscripcion.bulkCreate([
    { modulo_id: modulo.id, estudiante_id: ana.id },
    { modulo_id: modulo.id, estudiante_id: carlos.id },
  ]);
  sesion = await SesionClase.create({
    modulo_id: modulo.id, fecha: '2026-10-05', hora_inicio: '18:00:00', hora_fin: '21:00:00',
  });
  await Asistencia.create({
    sesion_id: sesion.id,
    estudiante_id: ana.id,
    estado: 'PRESENTE',
    hora_registro: new Date(),
    origen: 'ESTUDIANTE',
  });

  tokenAdmin = (
    await request(app).post('/api/auth/login').send({ identificador: 'admin@test.com', password: 'secreto123' })
  ).body.access_token;
  tokenEstudiante = (
    await request(app).post('/api/auth/login').send({ identificador: '1001' })
  ).body.access_token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Permisos', () => {
  test('sin token 401 y un estudiante 403', async () => {
    const ruta = `/api/modulos/${modulo.id}/estudiantes`;
    expect((await request(app).get(ruta)).status).toBe(401);
    expect((await request(app).get(ruta).set(auth(tokenEstudiante))).status).toBe(403);
    expect((await post(`/api/modulos/${modulo.id}/sesiones`, {}, tokenEstudiante)).status).toBe(403);
  });
});

describe('Estudiantes a mano', () => {
  test('se pueden agregar más de 50 estudiantes sin tope y se listan paginados', async () => {
    for (let i = 0; i < 55; i += 1) {
      const res = await agregarEst(`9${String(i).padStart(3, '0')}`, `Estudiante ${i}`, `e${i}@gmail.com`);
      expect(res.status).toBe(201);
    }
    const lista = await get(`/api/modulos/${modulo.id}/estudiantes?pagina=3`);
    expect(lista.status).toBe(200);
    expect(lista.body).toMatchObject({ total: 57, limite: 20, totalPaginas: 3, pagina: 3 });
    expect(lista.body.estudiantes).toHaveLength(17);
    const modulos = await get(`/api/modulos/${modulo.id}`);
    expect(Number(modulos.body.modulo.inscritos)).toBe(57);
  });

  test('el listado indica el origen, ordena lo nuevo primero y busca por nombre, registro o correo', async () => {
    await agregarEst('2001', 'Beatriz Nueva', 'bea@gmail.com');
    const lista = await get(`/api/modulos/${modulo.id}/estudiantes`);
    expect(lista.body.estudiantes[0]).toMatchObject({ codigo: '2001', origen: 'MANUAL' });
    expect(lista.body.estudiantes.find((e) => e.codigo === '1001').origen).toBe('EXCEL');

    const porCorreo = await get(`/api/modulos/${modulo.id}/estudiantes?buscar=carlos@`);
    expect(porCorreo.body.estudiantes.map((e) => e.codigo)).toEqual(['1003']);
  });

  test('un registro que ya es de otra persona devuelve 409 con su nombre', async () => {
    const res = await agregarEst('1001', 'Otra Persona', 'otra@gmail.com');
    expect(res.status).toBe(409);
    expect(res.body.detalle).toBe('El registro 1001 ya pertenece a Ana Pérez');
  });

  test('un correo que ya es de otra persona devuelve 409 con su nombre', async () => {
    const res = await agregarEst('5555', 'Otra Persona', 'ana@gmail.com');
    expect(res.status).toBe(409);
    expect(res.body.detalle).toBe('El correo ana@gmail.com ya pertenece a Ana Pérez');
  });

  test('si el usuario existe (mismo registro y correo) solo se inscribe, sin duplicarlo', async () => {
    const otro = await Modulo.create({ nombre: 'Módulo 2', gestion: '1-2027', activo: false });
    const res = await agregarEst('1003', 'Carlos Solo', 'CARLOS@gmail.com', otro.id);
    expect(res.status).toBe(201);
    expect(await Usuario.count({ where: { codigo: '1003' } })).toBe(1);
    expect(await Inscripcion.count({ where: { modulo_id: otro.id } })).toBe(1);

    const repetido = await agregarEst('1003', 'Carlos Solo', 'carlos@gmail.com', otro.id);
    expect(repetido.status).toBe(409);
  });

  test('datos inválidos devuelven 400', async () => {
    const res = await agregarEst('', 'Sin registro', 'no-es-correo');
    expect(res.status).toBe(400);
  });

  test('editar con un correo repetido devuelve 409 y con datos nuevos guarda y deja historial', async () => {
    const repetido = await put(`/api/modulos/${modulo.id}/estudiantes/${carlos.id}`, { email: 'ana@gmail.com' });
    expect(repetido.status).toBe(409);
    expect(repetido.body.detalle).toBe('El correo ana@gmail.com ya pertenece a Ana Pérez');

    const ok = await put(`/api/modulos/${modulo.id}/estudiantes/${carlos.id}`, {
      nombre: 'Carlos Editado',
      codigo: '1999',
    });
    expect(ok.status).toBe(200);
    expect((await Usuario.findByPk(carlos.id)).nombre).toBe('Carlos Editado');
    expect(await acciones()).toEqual(['EDITAR_ESTUDIANTE']);
  });

  test('quitar a un estudiante con asistencias sin forzar devuelve 409 y no cambia nada', async () => {
    const res = await del(`/api/modulos/${modulo.id}/estudiantes/${ana.id}`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ asistencias: 1, requiere_forzar: true });
    expect(await Inscripcion.count({ where: { modulo_id: modulo.id, estudiante_id: ana.id } })).toBe(1);
  });

  test('con forzar se quita la inscripción pero las asistencias y el usuario se conservan (RN-08)', async () => {
    const res = await del(`/api/modulos/${modulo.id}/estudiantes/${ana.id}?forzar=true`);
    expect(res.status).toBe(200);
    expect(await Inscripcion.count({ where: { modulo_id: modulo.id, estudiante_id: ana.id } })).toBe(0);
    expect(await Asistencia.count({ where: { estudiante_id: ana.id } })).toBe(1);
    expect(await Usuario.count({ where: { id: ana.id } })).toBe(1);
    expect(await acciones()).toEqual(['QUITAR_ESTUDIANTE']);
  });

  test('quitar a uno sin asistencias no pide confirmación', async () => {
    const res = await del(`/api/modulos/${modulo.id}/estudiantes/${carlos.id}`);
    expect(res.status).toBe(200);
    expect((await del(`/api/modulos/${modulo.id}/estudiantes/${carlos.id}`)).status).toBe(404);
  });

  test('en un módulo ACTIVO el estudiante agregado puede ingresar de inmediato', async () => {
    expect((await request(app).post('/api/auth/login').send({ identificador: '7001' })).status).toBe(401);
    expect((await agregarEst('7001', 'Nuevo Alumno', 'nuevo@gmail.com')).status).toBe(201);
    const login = await request(app).post('/api/auth/login').send({ identificador: '7001' });
    expect(login.status).toBe(200);
    expect(login.body.usuario.rol).toBe('ESTUDIANTE');
  });
});

describe('Fechas de clase', () => {
  const ruta = () => `/api/modulos/${modulo.id}/sesiones`;

  test('se pueden agregar más de 20 fechas con repetición semanal, sin tope', async () => {
    const res = await post(ruta(), {
      fecha: '2026-11-02',
      hora_inicio: '19:00',
      hora_fin: '21:00',
      repetir_semanal_hasta: '2027-04-19', // 25 lunes
    });
    expect(res.status).toBe(201);
    expect(res.body.creadas).toHaveLength(25);
    expect(res.body.omitidas).toEqual([]);
    const lista = await get(ruta());
    expect(lista.body.sesiones).toHaveLength(26);
    expect(await acciones()).toEqual(['AGREGAR_FECHA']);
  });

  test('la repetición semanal crea N fechas y omite las que ya existen', async () => {
    await post(ruta(), { fecha: '2026-11-09', hora_inicio: '18:00', hora_fin: '20:00' });
    const res = await post(ruta(), {
      fecha: '2026-11-02',
      hora_inicio: '18:00',
      hora_fin: '20:00',
      repetir_semanal_hasta: '2026-11-23',
    });
    expect(res.status).toBe(201);
    expect(res.body.creadas.map((s) => s.fecha)).toEqual(['2026-11-02', '2026-11-16', '2026-11-23']);
    expect(res.body.omitidas).toEqual(['2026-11-09']);
  });

  test('una fecha repetida o con horas al revés es rechazada', async () => {
    const repetida = await post(ruta(), { fecha: '2026-10-05', hora_inicio: '18:00', hora_fin: '20:00' });
    expect(repetida.status).toBe(409);
    const alReves = await post(ruta(), { fecha: '2026-12-01', hora_inicio: '20:00', hora_fin: '18:00' });
    expect(alReves.status).toBe(400);
    const finAntes = await post(ruta(), {
      fecha: '2026-12-10', hora_inicio: '18:00', hora_fin: '20:00', repetir_semanal_hasta: '2026-12-01',
    });
    expect(finAntes.status).toBe(400);
  });

  test('el listado trae el estado de cada fecha y si tiene asistencias', async () => {
    const lista = await get(ruta());
    expect(lista.body.sesiones[0]).toMatchObject({
      fecha: '2026-10-05',
      estado_fecha: 'DICTADA',
      tiene_asistencias: true,
    });
    await post(ruta(), { fecha: '2099-01-05', hora_inicio: '18:00', hora_fin: '20:00' });
    const nueva = (await get(ruta())).body.sesiones.find((s) => s.fecha === '2099-01-05');
    expect(nueva).toMatchObject({ estado_fecha: 'PROXIMA', tiene_asistencias: false });
  });

  test('una fecha con asistencias no se puede quitar ni mover, pero sí cambiar su horario', async () => {
    expect((await del(`${ruta()}/${sesion.id}`)).status).toBe(409);
    expect((await put(`${ruta()}/${sesion.id}`, { fecha: '2026-10-06' })).status).toBe(409);
    const horario = await put(`${ruta()}/${sesion.id}`, { hora_inicio: '19:00', hora_fin: '22:00' });
    expect(horario.status).toBe(200);
    expect(horario.body.sesion).toMatchObject({ fecha: '2026-10-05', hora_inicio: '19:00:00', hora_fin: '22:00:00' });
    expect(await acciones()).toEqual(['EDITAR_FECHA']);
  });

  test('una fecha sin asistencias se puede mover y quitar', async () => {
    const nueva = await post(ruta(), { fecha: '2026-12-01', hora_inicio: '18:00', hora_fin: '20:00' });
    const id = nueva.body.creadas[0].id;
    expect((await put(`${ruta()}/${id}`, { fecha: '2026-12-02' })).status).toBe(200);
    expect((await put(`${ruta()}/${id}`, { fecha: '2026-10-05' })).status).toBe(409); // ya existe
    expect((await del(`${ruta()}/${id}`)).status).toBe(200);
    expect(await SesionClase.count({ where: { id } })).toBe(0);
    expect(await acciones()).toEqual(['AGREGAR_FECHA', 'EDITAR_FECHA', 'QUITAR_FECHA']);
  });
});

describe('Importación por Excel (AGREGAR / REEMPLAZAR)', () => {
  test('AGREGAR omite a los ya inscritos y suma solo los nuevos', async () => {
    const buffer = await crearExcel([
      ENC_ESTUDIANTES,
      ['1001', 'Ana Pérez', 'ana@gmail.com'],
      ['3001', 'Nuevo Uno', 'uno@gmail.com'],
      ['3002', 'Nuevo Dos', 'dos@gmail.com'],
    ]);
    const revision = await importar('estudiantes/revisar', buffer);
    expect(revision.status).toBe(200);
    expect(revision.body.modo).toBe('AGREGAR');
    expect(revision.body.resumen).toEqual({ nuevos: 2, omitidos: 1, errores: 0 });
    expect(revision.body.filas.map((f) => f.resultado)).toEqual(['YA_INSCRITO', 'NUEVO', 'NUEVO']);

    const res = await importar('estudiantes', buffer);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ modo: 'AGREGAR', creados: 2, inscritos: 2, yaInscritos: 1 });
    expect(await Inscripcion.count({ where: { modulo_id: modulo.id } })).toBe(4);
    const nuevo = await Inscripcion.findOne({ where: { estudiante_id: (await Usuario.findOne({ where: { codigo: '3001' } })).id } });
    expect(nuevo.origen).toBe('EXCEL');
  });

  test('AGREGAR mantiene el todo o nada: con una fila con error no se importa nada', async () => {
    const buffer = await crearExcel([
      ENC_ESTUDIANTES,
      ['1001', 'Ana Pérez', 'ana@gmail.com'],
      ['3001', 'Nuevo Uno', 'uno@gmail.com'],
      ['3002', '', 'dos@gmail.com'],
    ]);
    const revision = await importar('estudiantes/revisar', buffer);
    expect(revision.body.resumen).toEqual({ nuevos: 1, omitidos: 1, errores: 1 });
    const filaError = revision.body.filas.find((f) => f.resultado === 'ERROR');
    expect(filaError).toMatchObject({ fila: 4, codigo: '3002', mensaje: 'Falta el nombre completo' });

    const res = await importar('estudiantes', buffer);
    expect(res.status).toBe(400);
    expect(res.body.errores).toHaveLength(1);
    expect(await Usuario.count({ where: { codigo: '3001' } })).toBe(0);
    expect(await Inscripcion.count({ where: { modulo_id: modulo.id } })).toBe(2);
  });

  test('REEMPLAZAR en un módulo con asistencias devuelve 409', async () => {
    const buffer = await crearExcel([ENC_ESTUDIANTES, ['3001', 'Nuevo Uno', 'uno@gmail.com']]);
    const revisar = await importar('estudiantes/revisar', buffer, { modo: 'REEMPLAZAR' });
    expect(revisar.status).toBe(409);
    const res = await importar('estudiantes', buffer, { modo: 'REEMPLAZAR' });
    expect(res.status).toBe(409);
    expect(await Inscripcion.count({ where: { modulo_id: modulo.id } })).toBe(2);

    const fechas = await crearExcel([['Fecha', 'Hora inicio', 'Hora fin'], ['01/12/2026', '18:00', '20:00']]);
    expect((await importar('fechas', fechas, { modo: 'REEMPLAZAR' })).status).toBe(409);
  });

  test('REEMPLAZAR en un módulo sin asistencias sustituye la lista de estudiantes y de fechas', async () => {
    const vacio = await Modulo.create({ nombre: 'Módulo 2', gestion: '1-2027', activo: false });
    const est1 = await crearExcel([ENC_ESTUDIANTES, ['4001', 'Uno', 'u1@gmail.com'], ['4002', 'Dos', 'u2@gmail.com']]);
    const est2 = await crearExcel([ENC_ESTUDIANTES, ['4003', 'Tres', 'u3@gmail.com']]);
    const opciones = { modulo_id: vacio.id };
    await importar('estudiantes', est1, opciones);
    const res = await importar('estudiantes', est2, { ...opciones, modo: 'REEMPLAZAR' });
    expect(res.status).toBe(201);
    expect(res.body.modo).toBe('REEMPLAZAR');
    const inscritos = await Inscripcion.findAll({ where: { modulo_id: vacio.id } });
    expect(inscritos).toHaveLength(1);
    expect((await Usuario.findByPk(inscritos[0].estudiante_id)).codigo).toBe('4003');

    const f1 = await crearExcel([['Fecha', 'Hora inicio', 'Hora fin'], ['01/12/2026', '18:00', '20:00'], ['02/12/2026', '18:00', '20:00']]);
    const f2 = await crearExcel([['Fecha', 'Hora inicio', 'Hora fin'], ['03/12/2026', '18:00', '20:00']]);
    await importar('fechas', f1, opciones);
    expect((await importar('fechas', f2, { ...opciones, modo: 'REEMPLAZAR' })).status).toBe(201);
    const fechas = await SesionClase.findAll({ where: { modulo_id: vacio.id } });
    expect(fechas.map((s) => s.fecha)).toEqual(['2026-12-03']);
  });

  test('un modo desconocido devuelve 400', async () => {
    const buffer = await crearExcel([ENC_ESTUDIANTES, ['3001', 'Nuevo Uno', 'uno@gmail.com']]);
    expect((await importar('estudiantes/revisar', buffer, { modo: 'BORRAR' })).status).toBe(400);
  });
});

describe('Módulo: edición e historial', () => {
  test('editar nombre y gestión deja historial; una gestión mal escrita devuelve 400', async () => {
    const mala = await request(app).patch(`/api/modulos/${modulo.id}`).set(auth(tokenAdmin)).send({ gestion: '2026-2' });
    expect(mala.status).toBe(400);
    const ok = await request(app).patch(`/api/modulos/${modulo.id}`).set(auth(tokenAdmin)).send({ nombre: 'Módulo Uno', gestion: '1-2027' });
    expect(ok.status).toBe(200);
    expect(ok.body.modulo).toMatchObject({ nombre: 'Módulo Uno', gestion: '1-2027', activo: true });
    expect(await acciones()).toEqual(['EDITAR_MODULO']);
  });

  test('un módulo ya reemplazado es solo de lectura', async () => {
    const viejo = await Modulo.create({ nombre: 'Viejo', gestion: '1-2025', activo: false, activado_en: new Date() });
    expect((await agregarEst('8001', 'Tarde', 'tarde@gmail.com', viejo.id)).status).toBe(409);
    expect((await get(`/api/modulos/${viejo.id}/estudiantes`)).status).toBe(200);
    const nombre = await request(app).patch(`/api/modulos/${viejo.id}`).set(auth(tokenAdmin)).send({ nombre: 'Otro' });
    expect(nombre.status).toBe(409);
  });

  test('cada operación deja su registro en actividad, dentro del módulo gestionado', async () => {
    await agregarEst('6001', 'Alta Manual', 'alta@gmail.com');
    const id = (await Usuario.findOne({ where: { codigo: '6001' } })).id;
    await put(`/api/modulos/${modulo.id}/estudiantes/${id}`, { nombre: 'Alta Editada' });
    await del(`/api/modulos/${modulo.id}/estudiantes/${id}`);
    const f = await post(`/api/modulos/${modulo.id}/sesiones`, { fecha: '2026-12-15', hora_inicio: '18:00', hora_fin: '20:00' });
    await put(`/api/modulos/${modulo.id}/sesiones/${f.body.creadas[0].id}`, { hora_fin: '21:00' });
    await del(`/api/modulos/${modulo.id}/sesiones/${f.body.creadas[0].id}`);
    expect(await acciones()).toEqual([
      'AGREGAR_ESTUDIANTE',
      'EDITAR_ESTUDIANTE',
      'QUITAR_ESTUDIANTE',
      'AGREGAR_FECHA',
      'EDITAR_FECHA',
      'QUITAR_FECHA',
    ]);
    const registros = await Actividad.findAll();
    expect(registros.filter((a) => a.accion !== "LOGIN").every((a) => a.modulo_id === modulo.id && a.detalle)).toBe(true);
  });
});

describe('Resumen público del módulo activo (login)', () => {
  test('sin token devuelve solo nombre y gestión', async () => {
    const res = await request(app).get('/api/modulos/activo/resumen');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ nombre: 'Módulo 1', gestion: '2-2026' });
  });

  test('sin módulo activo responde 204', async () => {
    await Modulo.update({ activo: false }, { where: {} });
    const res = await request(app).get('/api/modulos/activo/resumen');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });
});
