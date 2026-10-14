// Pruebas de asistencia del estudiante (RF-03, RF-04, RF-05).
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
  Actividad,
} = require('../src/models');
const { hashPassword } = require('../src/core/security');
const { hoyLaPaz } = require('../src/services/asistenciaService');

let tokenAdmin;
let tokenEst1;
let tokenEst2;
let tokenEst3;
let modulo;
let est1;
let est3;

async function login(identificador, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ identificador, password });
  return res.body.access_token;
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });

// 'AAAA-MM-DD' de hoy (La Paz) + n días.
function dia(n) {
  const [a, m, d] = hoyLaPaz().split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

function crearSesion(fecha, extra = {}) {
  return SesionClase.create({
    modulo_id: modulo.id,
    fecha,
    hora_inicio: '18:00:00',
    hora_fin: '21:00:00',
    ...extra,
  });
}

const hoy = (t) => request(app).get('/api/asistencia/hoy').set(auth(t));
const marcar = (t) => request(app).post('/api/asistencia/marcar').set(auth(t));
const historial = (t) => request(app).get('/api/asistencia/mis-asistencias').set(auth(t));

beforeAll(async () => {
  await sequelize.sync({ force: true });

  const admin = await Usuario.create({
    nombre: 'Admin Prueba',
    email: 'admin@test.com',
    rol: 'ADMIN',
    password_hash: await hashPassword('secreto123'),
  });
  modulo = await Modulo.create({
    nombre: 'Módulo Prueba',
    activo: true,
    activado_en: new Date(),
    creado_por: admin.id,
  });

  const crearEstudiante = async (codigo, nombre) => {
    const e = await Usuario.create({
      codigo,
      nombre,
      email: `${codigo}@test.com`,
      rol: 'ESTUDIANTE',
    });
    await Inscripcion.create({ modulo_id: modulo.id, estudiante_id: e.id });
    return e;
  };
  est1 = await crearEstudiante('1001', 'Uno');
  await crearEstudiante('1002', 'Dos');
  est3 = await crearEstudiante('1003', 'Tres');

  tokenAdmin = await login('admin@test.com', 'secreto123');
  tokenEst1 = await login('1001');
  tokenEst2 = await login('1002');
  tokenEst3 = await login('1003');
});

afterAll(async () => {
  await sequelize.close();
});

describe('Permisos', () => {
  test('sin token devuelve 401', async () => {
    const res = await request(app).get('/api/asistencia/hoy');
    expect(res.status).toBe(401);
  });

  test('un admin recibe 403', async () => {
    const res = await hoy(tokenAdmin);
    expect(res.status).toBe(403);
  });

  test('un estudiante que ya no está inscrito recibe 403', async () => {
    await Inscripcion.destroy({ where: { estudiante_id: est3.id } });
    const res = await marcar(tokenEst3);
    expect(res.status).toBe(403);
    expect(res.body.detalle).toBe('No estás inscrito en el módulo activo');
  });
});

describe('Día sin clase', () => {
  test('el botón queda deshabilitado y no se puede marcar', async () => {
    const res = await hoy(tokenEst1);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fecha: hoyLaPaz(),
      sesion: null,
      puedeMarcar: false,
      motivo: 'Hoy no hay clase programada',
    });

    const m = await marcar(tokenEst1);
    expect(m.status).toBe(409);
    expect(m.body.detalle).toBe('Hoy no hay clase programada');
  });

  test('tener clase mañana no habilita marcar hoy', async () => {
    await crearSesion(dia(1));
    const res = await hoy(tokenEst1);
    expect(res.body.puedeMarcar).toBe(false);
  });
});

describe('Día con clase', () => {
  let sesionHoy;

  beforeAll(async () => {
    sesionHoy = await crearSesion(dia(0));
  });

  test('el botón se habilita', async () => {
    const res = await hoy(tokenEst1);
    expect(res.body).toMatchObject({
      puedeMarcar: true,
      motivo: null,
      asistencia: null,
      sesion: { id: sesionHoy.id, fecha: dia(0), hora_inicio: '18:00:00' },
    });
  });

  test('marcar guarda PRESENTE con la hora real e historial', async () => {
    const antes = Date.now();
    const res = await marcar(tokenEst1);
    expect(res.status).toBe(201);
    expect(res.body.detalle).toBe('Asistencia registrada correctamente');
    expect(res.body.asistencia).toMatchObject({ estado: 'PRESENTE', origen: 'ESTUDIANTE' });

    const a = await Asistencia.findOne({
      where: { sesion_id: sesionHoy.id, estudiante_id: est1.id },
    });
    expect(a.estado).toBe('PRESENTE');
    // Hora real: dentro de unos segundos de ahora.
    expect(Math.abs(a.hora_registro.getTime() - antes)).toBeLessThan(10000);

    const act = await Actividad.findOne({ where: { accion: 'MARCAR_ASISTENCIA' } });
    expect(act).toMatchObject({ usuario_id: est1.id, entidad_id: a.id, modulo_id: modulo.id });
  });

  test('no se puede marcar dos veces', async () => {
    const res = await marcar(tokenEst1);
    expect(res.status).toBe(409);
    expect(res.body.detalle).toBe('Ya registraste tu asistencia de hoy');
    expect(await Asistencia.count({ where: { estudiante_id: est1.id } })).toBe(1);
  });

  test('después de marcar, hoy muestra la marca y el botón se deshabilita', async () => {
    const res = await hoy(tokenEst1);
    expect(res.body.puedeMarcar).toBe(false);
    expect(res.body.asistencia.estado).toBe('PRESENTE');
  });

  test('si la clase de hoy está cerrada no se puede marcar', async () => {
    await sesionHoy.update({ cerrada: true });
    const res = await marcar(tokenEst2);
    expect(res.status).toBe(409);
    expect(res.body.detalle).toBe('La clase de hoy ya fue cerrada');
    await sesionHoy.update({ cerrada: false });
  });
});

describe('Historial personal', () => {
  beforeAll(async () => {
    // Dos clases pasadas: est1 marcó en una (registro hecho a mano) y faltó a la otra.
    const pasadaConMarca = await crearSesion(dia(-3));
    await crearSesion(dia(-2));
    await Asistencia.create({
      sesion_id: pasadaConMarca.id,
      estudiante_id: est1.id,
      estado: 'PRESENTE',
      hora_registro: new Date(),
    });
  });

  test('lista las fechas con su estado y el resumen', async () => {
    const res = await historial(tokenEst1);
    expect(res.status).toBe(200);
    expect(res.body.modulo.nombre).toBe('Módulo Prueba');

    const estados = res.body.fechas.map((f) => [f.fecha, f.estado]);
    expect(estados).toEqual([
      [dia(-3), 'PRESENTE'],
      [dia(-2), 'FALTA'], // pasada sin marca
      [dia(0), 'PRESENTE'],
      [dia(1), 'PROXIMA'],
    ]);
    expect(res.body.fechas[0].hora_registro).not.toBeNull();
    expect(res.body.fechas[1].hora_registro).toBeNull();
    expect(res.body.resumen).toEqual({ total: 4, presentes: 2, faltas: 1, pendientes: 1 });
  });

  test('para quien no marcó, hoy aparece como PENDIENTE', async () => {
    const res = await historial(tokenEst2);
    const hoyItem = res.body.fechas.find((f) => f.fecha === dia(0));
    expect(hoyItem.estado).toBe('PENDIENTE');
    expect(res.body.resumen).toEqual({ total: 4, presentes: 0, faltas: 2, pendientes: 2 });
  });

  test('no muestra fechas de otros módulos', async () => {
    const otro = await Modulo.create({ nombre: 'Otro', activo: false });
    await SesionClase.create({
      modulo_id: otro.id,
      fecha: dia(-1),
      hora_inicio: '08:00:00',
      hora_fin: '10:00:00',
    });
    const res = await historial(tokenEst1);
    expect(res.body.fechas).toHaveLength(4);
  });
});
