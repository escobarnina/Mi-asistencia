// Pruebas de GET /api/asistencia/mis-asistencias para el calendario del estudiante (Fase C):
// campos nuevos (`corregida`), campos existentes intactos y estado igual al de la pantalla "Hoy".
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/server');
const { sequelize, Usuario, Modulo, Inscripcion, SesionClase } = require('../src/models');
const { hashPassword } = require('../src/core/security');
const { hoyLaPaz } = require('../src/services/asistenciaService');

const auth = (t) => ({ Authorization: `Bearer ${t}` });

let tokenAdmin;
let tokenEst;
let modulo;
let sesiones; // { ayer, hoy, manana }

// 'AAAA-MM-DD' de hoy (La Paz) + n días.
function dia(n) {
  const [a, m, d] = hoyLaPaz().split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

const historial = () => request(app).get('/api/asistencia/mis-asistencias').set(auth(tokenEst));
const marcar = () => request(app).post('/api/asistencia/marcar').set(auth(tokenEst));

beforeAll(async () => {
  await sequelize.sync({ force: true });
  const admin = await Usuario.create({
    nombre: 'Admin Prueba',
    email: 'admin@test.com',
    rol: 'ADMIN',
    password_hash: await hashPassword('secreto123'),
  });
  modulo = await Modulo.create({
    nombre: 'Módulo Calendario',
    gestion: '1-2026',
    activo: true,
    activado_en: new Date(),
    creado_por: admin.id,
  });
  const est = await Usuario.create({ codigo: '2001', nombre: 'Cal Endario', email: '2001@test.com', rol: 'ESTUDIANTE' });
  await Inscripcion.create({ modulo_id: modulo.id, estudiante_id: est.id });
  const crear = (fecha, inicio, fin) =>
    SesionClase.create({ modulo_id: modulo.id, fecha, hora_inicio: inicio, hora_fin: fin });
  sesiones = {
    ayer: await crear(dia(-1), '18:00:00', '21:00:00'),
    hoy: await crear(dia(0), '18:30:00', '20:30:00'),
    manana: await crear(dia(1), '19:00:00', '21:00:00'),
  };

  tokenAdmin = (await request(app).post('/api/auth/login').send({ identificador: 'admin@test.com', password: 'secreto123' })).body.access_token;
  tokenEst = (await request(app).post('/api/auth/login').send({ identificador: '2001' })).body.access_token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/asistencia/mis-asistencias (calendario)', () => {
  test('los campos nuevos aparecen: corregida, horario y hora de la marca', async () => {
    const res = await historial();
    expect(res.status).toBe(200);
    const [ayer, hoy, manana] = res.body.fechas;
    expect(ayer).toMatchObject({ estado: 'FALTA', corregida: false, hora_registro: null, hora_inicio: '18:00:00', hora_fin: '21:00:00' });
    expect(hoy).toMatchObject({ estado: 'PENDIENTE', corregida: false, hora_inicio: '18:30:00', hora_fin: '20:30:00' });
    expect(manana).toMatchObject({ estado: 'PROXIMA', corregida: false });

    await marcar();
    const tras = (await historial()).body.fechas[1];
    expect(tras).toMatchObject({ estado: 'PRESENTE', corregida: false });
    expect(typeof tras.hora_registro).toBe('string');
  });

  test('corregida es true después de una corrección del admin y solo en esa fecha', async () => {
    const est = await Usuario.findOne({ where: { codigo: '2001' } });
    const corregir = await request(app)
      .put(`/api/admin/asistencias/${sesiones.ayer.id}/${est.id}`)
      .set(auth(tokenAdmin))
      .send({ estado: 'PRESENTE', motivo: 'Certificado médico' });
    expect(corregir.status).toBe(200);

    const fechas = (await historial()).body.fechas;
    expect(fechas[0]).toMatchObject({ estado: 'PRESENTE', corregida: true });
    expect(fechas[1].corregida).toBe(false); // la marca propia de hoy no es una corrección
    expect(fechas[2].corregida).toBe(false);
    // El motivo no se expone al estudiante.
    expect(JSON.stringify(fechas)).not.toMatch(/Certificado/);
  });

  test('los campos que ya existían no cambian y el resumen cuadra con las fechas', async () => {
    const res = await historial();
    expect(Object.keys(res.body).sort()).toEqual(['fechas', 'hoy', 'modulo', 'resumen']);
    expect(res.body.modulo).toEqual({ id: modulo.id, nombre: 'Módulo Calendario', gestion: '1-2026' });
    expect(res.body.hoy).toBe(hoyLaPaz());
    expect(Object.keys(res.body.fechas[0]).sort()).toEqual(
      ['cerrada', 'corregida', 'estado', 'fecha', 'hora_fin', 'hora_inicio', 'hora_registro', 'id'].sort()
    );
    expect(res.body.resumen).toEqual({ total: 3, presentes: 2, faltas: 0, pendientes: 1 });
  });

  test('el estado del calendario coincide con el de la pantalla Hoy', async () => {
    const hoyRes = await request(app).get('/api/asistencia/hoy').set(auth(tokenEst));
    const deHoy = (await historial()).body.fechas.find((f) => f.fecha === hoyRes.body.fecha);
    expect(hoyRes.body.asistencia.estado).toBe(deHoy.estado);
  });
});
