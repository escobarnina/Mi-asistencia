// Pruebas de login/logout e historial de actividad.
// Usa la base asistencia_test (creada en tests/crearBaseTest.js).
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/server');
const {
  sequelize,
  Usuario,
  Modulo,
  Inscripcion,
  Actividad,
} = require('../src/models');
const { hashPassword } = require('../src/core/security');

const PASSWORD_ADMIN = 'secreto123';

beforeAll(async () => {
  // Reconstruye el esquema en la base de pruebas.
  await sequelize.sync({ force: true });

  const admin = await Usuario.create({
    nombre: 'Admin Prueba',
    email: 'admin@test.com',
    rol: 'ADMIN',
    password_hash: await hashPassword(PASSWORD_ADMIN),
    activo: true,
  });

  const modulo = await Modulo.create({
    nombre: 'Módulo Prueba',
    gestion: '2-2026',
    activo: true,
    activado_en: new Date(),
    creado_por: admin.id,
  });

  // Estudiante inscrito en el módulo activo.
  const inscrito = await Usuario.create({
    codigo: '990001',
    nombre: 'Estudiante Inscrito',
    email: 'uno@test.com',
    rol: 'ESTUDIANTE',
    activo: true,
  });
  await Inscripcion.create({ modulo_id: modulo.id, estudiante_id: inscrito.id });

  // Estudiante NO inscrito.
  await Usuario.create({
    codigo: '990002',
    nombre: 'Estudiante Sin Inscripción',
    email: 'dos@test.com',
    rol: 'ESTUDIANTE',
    activo: true,
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('Login de administrador', () => {
  test('con contraseña correcta devuelve token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identificador: 'admin@test.com', password: PASSWORD_ADMIN });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.token_type).toBe('bearer');
    expect(res.body.usuario.rol).toBe('ADMIN');
  });

  test('con contraseña incorrecta devuelve 401 genérico', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identificador: 'admin@test.com', password: 'mala' });

    expect(res.status).toBe(401);
    expect(res.body.detalle).toBe('Credenciales incorrectas');
  });
});

describe('Login de estudiante', () => {
  test('por correo (inscrito) devuelve token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identificador: 'uno@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe('ESTUDIANTE');
    expect(res.body.usuario.codigo).toBe('990001');
  });

  test('por código (inscrito) devuelve token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identificador: '990001' });

    expect(res.status).toBe(200);
    expect(res.body.usuario.email).toBe('uno@test.com');
  });

  test('no inscrito en el módulo activo es rechazado', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identificador: 'dos@test.com' });

    expect(res.status).toBe(401);
    expect(res.body.detalle).toBe('No estás inscrito en el módulo activo');
  });
});

describe('Logout', () => {
  test('invalida el token usado', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificador: 'admin@test.com', password: PASSWORD_ADMIN });
    const token = login.body.access_token;

    const me1 = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me1.status).toBe(200);

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);

    // El mismo token ya no sirve.
    const me2 = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me2.status).toBe(401);
  });
});

describe('Historial de actividad', () => {
  test('registra LOGIN, LOGOUT y LOGIN_FALLIDO', async () => {
    // LOGIN_FALLIDO
    await request(app)
      .post('/api/auth/login')
      .send({ identificador: 'noexiste@test.com', password: 'x' });

    // LOGIN (estudiante) + LOGOUT
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificador: 'uno@test.com' });
    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.access_token}`);

    const fallidos = await Actividad.count({ where: { accion: 'LOGIN_FALLIDO' } });
    const logins = await Actividad.count({ where: { accion: 'LOGIN' } });
    const logouts = await Actividad.count({ where: { accion: 'LOGOUT' } });

    expect(fallidos).toBeGreaterThanOrEqual(1);
    expect(logins).toBeGreaterThanOrEqual(1);
    expect(logouts).toBeGreaterThanOrEqual(1);
  });
});
