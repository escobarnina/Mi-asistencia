// Pruebas del panel de asistencias del administrador (RF-06 a RF-08, RF-17).
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/server');
const {
  sequelize,
  Usuario,
  Modulo,
  Inscripcion,
  SesionClase,
  Asistencia,
  AsistenciaCambio,
  Actividad,
  TokenRevocado,
} = require('../src/models');
const { hashPassword } = require('../src/core/security');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const fechaHoy = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

let tokenAdmin;
let tokenEstudiante;
let admin;
let modulo;
let sesion;
let estudiantePresente;
let estudianteAusente;

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

beforeEach(async () => {
  await AsistenciaCambio.destroy({ where: {} });
  await Asistencia.destroy({ where: {} });
  await Actividad.destroy({ where: {} });
  await TokenRevocado.destroy({ where: {} });
  await SesionClase.destroy({ where: {} });
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
  modulo = await Modulo.create({
    nombre: 'Módulo activo',
    activo: true,
    activado_en: new Date(),
    creado_por: admin.id,
  });
  estudiantePresente = await Usuario.create({
    codigo: '990001',
    nombre: 'Ana Presente',
    email: 'ana@test.com',
    rol: 'ESTUDIANTE',
    activo: true,
  });
  estudianteAusente = await Usuario.create({
    codigo: '990002',
    nombre: 'Luis Ausente',
    email: 'luis@test.com',
    rol: 'ESTUDIANTE',
    activo: true,
  });
  await Inscripcion.bulkCreate([
    { modulo_id: modulo.id, estudiante_id: estudiantePresente.id },
    { modulo_id: modulo.id, estudiante_id: estudianteAusente.id },
  ]);
  sesion = await SesionClase.create({
    modulo_id: modulo.id,
    fecha: fechaHoy,
    hora_inicio: '00:00:00',
    hora_fin: '00:01:00',
  });

  const loginAdmin = await request(app)
    .post('/api/auth/login')
    .send({ identificador: 'admin@test.com', password: 'secreto123' });
  tokenAdmin = loginAdmin.body.access_token;
  const loginEstudiante = await request(app)
    .post('/api/auth/login')
    .send({ identificador: 'ana@test.com' });
  tokenEstudiante = loginEstudiante.body.access_token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Panel de asistencias', () => {
  test('requiere administrador', async () => {
    const sinToken = await request(app).get('/api/admin/asistencias');
    const estudiante = await request(app)
      .get('/api/admin/asistencias')
      .set(auth(tokenEstudiante));

    expect(sinToken.status).toBe(401);
    expect(estudiante.status).toBe(403);
  });

  test('lista la sesión con todos los inscritos, incluidos los sin registro', async () => {
    const res = await request(app)
      .get(`/api/admin/asistencias?fecha=${fechaHoy}`)
      .set(auth(tokenAdmin));

    expect(res.status).toBe(200);
    expect(res.body.sesiones).toHaveLength(1);
    expect(res.body.sesiones[0]).toMatchObject({
      id: sesion.id,
      presentes: 0,
      faltas: 0,
      sin_registro: 2,
    });
    expect(res.body.sesiones[0].asistencias.map((a) => a.estado)).toEqual([
      'SIN_REGISTRO',
      'SIN_REGISTRO',
    ]);
  });

  test('rechaza filtros de fecha inválidos', async () => {
    const res = await request(app)
      .get('/api/admin/asistencias?fecha=2026-02-30')
      .set(auth(tokenAdmin));

    expect(res.status).toBe(400);
  });

  test('corrige o crea asistencia y guarda motivo, auditoría y actividad', async () => {
    const res = await request(app)
      .put(`/api/admin/asistencias/${sesion.id}/${estudiantePresente.id}`)
      .set(auth(tokenAdmin))
      .send({ estado: 'PRESENTE', motivo: 'Se verificó la lista firmada' });

    expect(res.status).toBe(200);
    expect(res.body.asistencia.estado).toBe('PRESENTE');

    const asistencia = await Asistencia.findOne({
      where: { sesion_id: sesion.id, estudiante_id: estudiantePresente.id },
    });
    const cambio = await AsistenciaCambio.findOne({
      where: { asistencia_id: asistencia.id },
    });
    const actividad = await Actividad.findOne({
      where: { accion: 'MODIFICAR_ASISTENCIA', entidad_id: asistencia.id },
    });
    expect(asistencia.origen).toBe('ADMIN');
    expect(cambio).toMatchObject({
      usuario_id: admin.id,
      estado_anterior: null,
      estado_nuevo: 'PRESENTE',
      motivo: 'Se verificó la lista firmada',
    });
    expect(actividad).not.toBeNull();
  });

  test('al corregir una marca existente, audita el estado anterior y limpia su hora al marcar falta', async () => {
    const marca = await Asistencia.create({
      sesion_id: sesion.id,
      estudiante_id: estudiantePresente.id,
      estado: 'PRESENTE',
      hora_registro: new Date(),
      origen: 'ESTUDIANTE',
    });

    const res = await request(app)
      .put(`/api/admin/asistencias/${sesion.id}/${estudiantePresente.id}`)
      .set(auth(tokenAdmin))
      .send({ estado: 'FALTA', motivo: 'La lista firmada confirma la ausencia' });

    expect(res.status).toBe(200);
    const actualizada = await Asistencia.findByPk(marca.id);
    const cambio = await AsistenciaCambio.findOne({ where: { asistencia_id: marca.id } });
    expect(actualizada.estado).toBe('FALTA');
    expect(actualizada.hora_registro).toBeNull();
    expect(cambio.estado_anterior).toBe('PRESENTE');
    expect(cambio.estado_nuevo).toBe('FALTA');
  });

  test('exige un motivo para corregir la asistencia', async () => {
    const res = await request(app)
      .put(`/api/admin/asistencias/${sesion.id}/${estudiantePresente.id}`)
      .set(auth(tokenAdmin))
      .send({ estado: 'PRESENTE', motivo: '   ' });

    expect(res.status).toBe(400);
    expect(await Asistencia.count()).toBe(0);
  });

  test('genera faltas solo para quienes no tienen asistencia y registra la acción', async () => {
    await Asistencia.create({
      sesion_id: sesion.id,
      estudiante_id: estudiantePresente.id,
      estado: 'PRESENTE',
      hora_registro: new Date(),
      origen: 'ESTUDIANTE',
    });

    const res = await request(app)
      .post('/api/admin/faltas/generar')
      .set(auth(tokenAdmin));

    expect(res.status).toBe(200);
    expect(res.body.generadas).toBe(1);
    const falta = await Asistencia.findOne({
      where: { sesion_id: sesion.id, estudiante_id: estudianteAusente.id },
    });
    expect(falta).toMatchObject({ estado: 'FALTA', origen: 'SISTEMA' });
    expect(await Asistencia.count()).toBe(2);
    expect(
      await Actividad.count({ where: { accion: 'GENERAR_FALTAS' } })
    ).toBe(1);
  });

  test('exporta CSV compatible con Excel y registra EXPORTAR', async () => {
    await Asistencia.create({
      sesion_id: sesion.id,
      estudiante_id: estudiantePresente.id,
      estado: 'PRESENTE',
      hora_registro: new Date(),
      origen: 'ESTUDIANTE',
    });

    const res = await request(app)
      .get('/api/admin/asistencias/exportar')
      .set(auth(tokenAdmin));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('.csv');
    expect(res.text).toContain('Ana Presente');
    expect(res.text).toContain('990001');
    expect(
      await Actividad.count({ where: { accion: 'EXPORTAR' } })
    ).toBe(1);
  });
});
