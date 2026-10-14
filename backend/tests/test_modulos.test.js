// Pruebas de módulos (RF-13): permisos, crear, editar y activar (solo uno activo).
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/server');
const { sequelize, Usuario, Modulo, Inscripcion, Actividad } = require('../src/models');
const { hashPassword } = require('../src/core/security');

let tokenAdmin;
let tokenEstudiante;
let moduloInicial;

async function login(identificador, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ identificador, password });
  return res.body.access_token;
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  await sequelize.sync({ force: true });

  const admin = await Usuario.create({
    nombre: 'Admin Prueba',
    email: 'admin@test.com',
    rol: 'ADMIN',
    password_hash: await hashPassword('secreto123'),
    activo: true,
  });

  moduloInicial = await Modulo.create({
    nombre: 'Módulo Inicial',
    gestion: '2-2026',
    activo: true,
    activado_en: new Date(),
    creado_por: admin.id,
  });

  const est = await Usuario.create({
    codigo: '990001',
    nombre: 'Estudiante',
    email: 'uno@test.com',
    rol: 'ESTUDIANTE',
    activo: true,
  });
  await Inscripcion.create({ modulo_id: moduloInicial.id, estudiante_id: est.id });

  tokenAdmin = await login('admin@test.com', 'secreto123');
  tokenEstudiante = await login('uno@test.com');
});

afterAll(async () => {
  await sequelize.close();
});

describe('Permisos', () => {
  test('sin token devuelve 401', async () => {
    const res = await request(app).get('/api/modulos');
    expect(res.status).toBe(401);
  });

  test('un estudiante no puede listar ni crear módulos (403)', async () => {
    const lista = await request(app).get('/api/modulos').set(auth(tokenEstudiante));
    expect(lista.status).toBe(403);

    const crear = await request(app)
      .post('/api/modulos')
      .set(auth(tokenEstudiante))
      .send({ nombre: 'Intruso' });
    expect(crear.status).toBe(403);
  });

  test('un estudiante sí puede consultar el módulo activo', async () => {
    const res = await request(app).get('/api/modulos/activo').set(auth(tokenEstudiante));
    expect(res.status).toBe(200);
    expect(res.body.modulo.id).toBe(moduloInicial.id);
  });
});

describe('Crear y listar', () => {
  test('el admin crea un módulo inactivo', async () => {
    const res = await request(app)
      .post('/api/modulos')
      .set(auth(tokenAdmin))
      .send({ nombre: '  Módulo 2  ', gestion: '1-2027' });

    expect(res.status).toBe(201);
    expect(res.body.modulo.nombre).toBe('Módulo 2');
    expect(res.body.modulo.activo).toBe(false);
  });

  test('sin nombre devuelve 400 en español', async () => {
    const res = await request(app)
      .post('/api/modulos')
      .set(auth(tokenAdmin))
      .send({ gestion: '1-2027' });
    expect(res.status).toBe(400);
    expect(res.body.detalle).toBe('El nombre es obligatorio');
  });

  test('nombre y gestión repetidos devuelve 409', async () => {
    const res = await request(app)
      .post('/api/modulos')
      .set(auth(tokenAdmin))
      .send({ nombre: 'Módulo 2', gestion: '1-2027' });
    expect(res.status).toBe(409);
  });

  test('el listado trae el activo primero y cuenta inscritos', async () => {
    const res = await request(app).get('/api/modulos').set(auth(tokenAdmin));
    expect(res.status).toBe(200);
    expect(res.body.modulos.length).toBe(2);
    expect(res.body.modulos[0].activo).toBe(true);
    expect(Number(res.body.modulos[0].inscritos)).toBe(1);
  });

  test('un id inválido devuelve 400 y uno inexistente 404', async () => {
    const malo = await request(app).get('/api/modulos/abc').set(auth(tokenAdmin));
    expect(malo.status).toBe(400);
    const noExiste = await request(app).get('/api/modulos/9999').set(auth(tokenAdmin));
    expect(noExiste.status).toBe(404);
  });
});

describe('Editar', () => {
  test('cambia el nombre', async () => {
    const lista = await request(app).get('/api/modulos').set(auth(tokenAdmin));
    const modulo2 = lista.body.modulos.find((m) => m.nombre === 'Módulo 2');

    const res = await request(app)
      .patch(`/api/modulos/${modulo2.id}`)
      .set(auth(tokenAdmin))
      .send({ nombre: 'Módulo 2 editado' });
    expect(res.status).toBe(200);
    expect(res.body.modulo.nombre).toBe('Módulo 2 editado');
    expect(res.body.modulo.gestion).toBe('1-2027');
  });

  test('sin campos devuelve 400', async () => {
    const res = await request(app)
      .patch(`/api/modulos/${moduloInicial.id}`)
      .set(auth(tokenAdmin))
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('Activar', () => {
  test('activar otro módulo desactiva el anterior y deja historial', async () => {
    const lista = await request(app).get('/api/modulos').set(auth(tokenAdmin));
    const otro = lista.body.modulos.find((m) => !m.activo);

    const res = await request(app)
      .post(`/api/modulos/${otro.id}/activar`)
      .set(auth(tokenAdmin));
    expect(res.status).toBe(200);
    expect(res.body.modulo.activo).toBe(true);
    expect(res.body.modulo.activado_en).toBeTruthy();

    // Solo uno activo.
    const activos = await Modulo.count({ where: { activo: true } });
    expect(activos).toBe(1);
    const anterior = await Modulo.findByPk(moduloInicial.id);
    expect(anterior.activo).toBe(false);

    const registro = await Actividad.findOne({
      where: { accion: 'ACTIVAR_MODULO', entidad_id: otro.id },
    });
    expect(registro).not.toBeNull();
    expect(registro.modulo_id).toBe(otro.id);
  });

  test('activar el que ya está activo no duplica el historial', async () => {
    const activo = await Modulo.findOne({ where: { activo: true } });
    const antes = await Actividad.count({ where: { accion: 'ACTIVAR_MODULO' } });

    const res = await request(app)
      .post(`/api/modulos/${activo.id}/activar`)
      .set(auth(tokenAdmin));
    expect(res.status).toBe(200);

    const despues = await Actividad.count({ where: { accion: 'ACTIVAR_MODULO' } });
    expect(despues).toBe(antes);
  });

  test('un módulo inexistente devuelve 404', async () => {
    const res = await request(app).post('/api/modulos/9999/activar').set(auth(tokenAdmin));
    expect(res.status).toBe(404);
  });

  test('un estudiante no inscrito en el nuevo módulo activo ya no puede entrar', async () => {
    // El módulo activo ahora es "Módulo 2 editado", donde el estudiante no está.
    const res = await request(app).post('/api/auth/login').send({ identificador: 'uno@test.com' });
    expect(res.status).toBe(401);
    expect(res.body.detalle).toBe('No estás inscrito en el módulo activo');
  });
});
