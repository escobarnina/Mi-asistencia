// Pruebas del historial de actividades del administrador (RF-10).
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/server');
const {
  sequelize,
  Usuario,
  Modulo,
  Inscripcion,
  Actividad,
  TokenRevocado,
} = require('../src/models');
const { hashPassword } = require('../src/core/security');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
// Instante en La Paz (UTC-4, sin horario de verano).
const laPaz = (fechaHora) => new Date(`${fechaHora}-04:00`);

let tokenAdmin;
let tokenEstudiante;
let admin;
let ana;
let luis;
let moduloActivo;
let moduloAnterior;

async function actividad(usuario, accion, creado_en, modulo = moduloActivo, extra = {}) {
  return Actividad.create({
    modulo_id: modulo.id,
    usuario_id: usuario.id,
    accion,
    creado_en,
    ...extra,
  });
}

const listar = (query = {}) => request(app)
  .get('/api/actividades')
  .query(query)
  .set(auth(tokenAdmin));

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

beforeEach(async () => {
  await Actividad.destroy({ where: {} });
  await TokenRevocado.destroy({ where: {} });
  await Inscripcion.destroy({ where: {} });
  await Modulo.destroy({ where: {} });
  await Usuario.destroy({ where: {} });

  admin = await Usuario.create({
    nombre: 'Admin Prueba',
    email: 'admin@test.com',
    rol: 'ADMIN',
    password_hash: await hashPassword('secreto123'),
    activo: true,
  });
  moduloAnterior = await Modulo.create({
    nombre: 'Módulo anterior',
    activo: false,
    creado_por: admin.id,
  });
  moduloActivo = await Modulo.create({
    nombre: 'Módulo activo',
    activo: true,
    activado_en: new Date(),
    creado_por: admin.id,
  });
  ana = await Usuario.create({
    codigo: '990001', nombre: 'Ana Presente', email: 'ana@test.com', rol: 'ESTUDIANTE', activo: true,
  });
  luis = await Usuario.create({
    codigo: '990002', nombre: 'Luis Ausente', email: 'luis@test.com', rol: 'ESTUDIANTE', activo: true,
  });
  await Inscripcion.bulkCreate([
    { modulo_id: moduloActivo.id, estudiante_id: ana.id },
    { modulo_id: moduloActivo.id, estudiante_id: luis.id },
  ]);

  const loginAdmin = await request(app)
    .post('/api/auth/login')
    .send({ identificador: 'admin@test.com', password: 'secreto123' });
  tokenAdmin = loginAdmin.body.access_token;
  const loginEstudiante = await request(app)
    .post('/api/auth/login')
    .send({ identificador: 'ana@test.com' });
  tokenEstudiante = loginEstudiante.body.access_token;
  // Los LOGIN de arriba no forman parte de lo que se prueba.
  await Actividad.destroy({ where: {} });
});

afterAll(async () => {
  await sequelize.close();
});

describe('Historial de actividades (RF-10)', () => {
  test('solo el administrador puede consultarlo', async () => {
    const sinToken = await request(app).get('/api/actividades');
    const estudiante = await request(app)
      .get('/api/actividades')
      .set(auth(tokenEstudiante));
    const admin200 = await listar();

    expect(sinToken.status).toBe(401);
    expect(estudiante.status).toBe(403);
    expect(admin200.status).toBe(200);
  });

  test('lista por defecto solo el módulo activo, con usuario y módulo', async () => {
    await actividad(ana, 'MARCAR_ASISTENCIA', laPaz('2026-10-13T19:00:00'), moduloActivo, {
      entidad: 'asistencia', entidad_id: 7, detalle: 'Clase del 2026-10-13',
    });
    await actividad(ana, 'LOGIN', laPaz('2026-05-01T10:00:00'), moduloAnterior);

    const res = await listar();

    expect(res.status).toBe(200);
    expect(res.body.modulo).toMatchObject({ id: moduloActivo.id, nombre: 'Módulo activo' });
    expect(res.body.total).toBe(1);
    expect(res.body.actividades[0]).toMatchObject({
      accion: 'MARCAR_ASISTENCIA',
      entidad: 'asistencia',
      entidad_id: 7,
      Usuario: expect.objectContaining({ nombre: 'Ana Presente', codigo: '990001' }),
      Modulo: expect.objectContaining({ id: moduloActivo.id }),
    });
  });

  test('ya no acepta elegir otro módulo con modulo_id', async () => {
    await actividad(ana, 'LOGIN', laPaz('2026-05-01T10:00:00'), moduloAnterior);
    const res = await listar({ modulo_id: moduloAnterior.id });

    expect(res.body.total).toBe(0);
  });

  test('sin módulo activo devuelve una lista vacía', async () => {
    await actividad(ana, 'LOGIN', laPaz('2026-10-13T10:00:00'));
    await moduloActivo.update({ activo: false });

    const res = await listar();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ modulo: null, total: 0, actividades: [] });
  });

  test('filtra por estudiante, por nombre o por número de registro', async () => {
    await actividad(ana, 'LOGIN', laPaz('2026-10-13T10:00:00'));
    await actividad(luis, 'LOGIN', laPaz('2026-10-13T11:00:00'));
    await actividad(luis, 'LOGOUT', laPaz('2026-10-13T12:00:00'));

    const porNombre = await listar({ estudiante: 'luis' });
    const porRegistro = await listar({ estudiante: '990001' });
    const ninguno = await listar({ estudiante: 'nadie' });
    const comodin = await listar({ estudiante: '%' });

    expect(porNombre.body.total).toBe(2);
    expect(porNombre.body.actividades.every((a) => a.Usuario.nombre === 'Luis Ausente')).toBe(true);
    expect(porRegistro.body.total).toBe(1);
    expect(porRegistro.body.actividades[0].Usuario.codigo).toBe('990001');
    expect(ninguno.body.total).toBe(0);
    expect(comodin.body.total).toBe(0);
  });

  test('el filtro por fecha usa el día de La Paz: 23:30 no pasa al día siguiente', async () => {
    // 23:30 del 13 en La Paz = 03:30 del 14 en UTC.
    await actividad(ana, 'MARCAR_ASISTENCIA', laPaz('2026-10-13T23:30:00'));
    // 00:30 del 14 en La Paz = 04:30 del 14 en UTC.
    await actividad(ana, 'LOGOUT', laPaz('2026-10-14T00:30:00'));

    const dia13 = await listar({ fecha: '2026-10-13' });
    const dia14 = await listar({ fecha: '2026-10-14' });

    expect(dia13.body.actividades.map((a) => a.accion)).toEqual(['MARCAR_ASISTENCIA']);
    expect(dia14.body.actividades.map((a) => a.accion)).toEqual(['LOGOUT']);
  });

  test('los extremos del día (00:00:00 y 23:59:59) quedan dentro de su día', async () => {
    await actividad(ana, 'LOGIN', laPaz('2026-10-13T00:00:00'));
    await actividad(ana, 'LOGOUT', laPaz('2026-10-13T23:59:59'));
    await actividad(ana, 'EXPORTAR', laPaz('2026-10-12T23:59:59'));
    await actividad(ana, 'IMPORTAR_FECHAS', laPaz('2026-10-14T00:00:00'));

    const res = await listar({ fecha: '2026-10-13' });

    expect(res.body.actividades.map((a) => a.accion).sort()).toEqual(['LOGIN', 'LOGOUT']);
  });

  test('filtra por rango desde / hasta incluyendo ambos días', async () => {
    await actividad(ana, 'LOGIN', laPaz('2026-10-12T10:00:00'));
    await actividad(ana, 'LOGOUT', laPaz('2026-10-13T23:30:00'));
    await actividad(ana, 'EXPORTAR', laPaz('2026-10-14T08:00:00'));
    await actividad(ana, 'IMPORTAR_FECHAS', laPaz('2026-10-15T08:00:00'));

    const res = await listar({ desde: '2026-10-13', hasta: '2026-10-14' });
    const soloDesde = await listar({ desde: '2026-10-14' });

    expect(res.body.actividades.map((a) => a.accion).sort()).toEqual(['EXPORTAR', 'LOGOUT']);
    expect(soloDesde.body.total).toBe(2);
  });

  test('rechaza fechas inválidas o invertidas', async () => {
    const mala = await listar({ fecha: '13/10/2026' });
    expect(mala.status).toBe(400);
    expect(mala.body.detalle).toContain('La fecha debe tener el formato');
    expect((await listar({ fecha: '2026-02-30' })).status).toBe(400);
    expect((await listar({ desde: '2026-10-14', hasta: '2026-10-13' })).status).toBe(400);
  });

  test('combina estudiante, fecha y acción', async () => {
    await actividad(ana, 'LOGIN', laPaz('2026-10-13T10:00:00'));
    await actividad(ana, 'LOGOUT', laPaz('2026-10-13T11:00:00'));
    await actividad(luis, 'LOGIN', laPaz('2026-10-13T12:00:00'));

    const res = await listar({ estudiante: 'ana', fecha: '2026-10-13', accion: 'LOGIN' });

    expect(res.body.total).toBe(1);
    expect(res.body.actividades[0]).toMatchObject({ accion: 'LOGIN' });
  });

  test('pagina los resultados, del más reciente al más antiguo', async () => {
    for (let i = 1; i <= 5; i += 1) {
      await actividad(ana, 'LOGIN', laPaz(`2026-10-13T1${i}:00:00`), moduloActivo, {
        detalle: `n${i}`,
      });
    }

    const p1 = await listar({ limite: 2, pagina: 1 });
    const p3 = await listar({ limite: 2, pagina: 3 });

    expect(p1.body).toMatchObject({ total: 5, pagina: 1, limite: 2, totalPaginas: 3 });
    expect(p1.body.actividades.map((a) => a.detalle)).toEqual(['n5', 'n4']);
    expect(p3.body.actividades.map((a) => a.detalle)).toEqual(['n1']);
  });

  test('las acciones reales quedan en el historial del módulo activo', async () => {
    await request(app).post('/api/auth/login').send({ identificador: 'ana@test.com' });

    const res = await listar({ estudiante: 'ana', accion: 'LOGIN' });

    expect(res.body.total).toBe(1);
    expect(res.body.actividades[0].Modulo.id).toBe(moduloActivo.id);
  });
});
