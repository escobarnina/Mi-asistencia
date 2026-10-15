// RF-09: GET /api/actividades devuelve el registro afectado en texto legible
// (campo nuevo `registro_afectado`) sin quitar los campos que ya tenía.
process.env.NODE_ENV = 'test';

const request = require('supertest');
const ExcelJS = require('exceljs');
const app = require('../src/server');
const { sequelize, Usuario, Modulo, Inscripcion, SesionClase } = require('../src/models');
const { hashPassword } = require('../src/core/security');
const { hoyLaPaz } = require('../src/services/asistenciaService');

const auth = (t) => ({ Authorization: `Bearer ${t}` });

let tokenAdmin;
let tokenEst;
let modulo;
let est;
let sesion;

function diaMesHoy() {
  return hoyLaPaz().split('-').reverse().slice(0, 2).join('/');
}

const actividades = async (params = '') =>
  (await request(app).get(`/api/actividades?limite=100${params}`).set(auth(tokenAdmin))).body.actividades;
const de = (lista, accion) => lista.find((a) => a.accion === accion);

beforeAll(async () => {
  await sequelize.sync({ force: true });
  const admin = await Usuario.create({
    nombre: 'Admin Prueba',
    email: 'admin@test.com',
    rol: 'ADMIN',
    password_hash: await hashPassword('secreto123'),
  });
  modulo = await Modulo.create({
    nombre: 'Módulo RF9',
    gestion: '1-2026',
    activo: true,
    activado_en: new Date(),
    creado_por: admin.id,
  });
  est = await Usuario.create({ codigo: '3001', nombre: 'Lucía Quispe', email: 'lucia@test.com', rol: 'ESTUDIANTE' });
  await Inscripcion.create({ modulo_id: modulo.id, estudiante_id: est.id });
  sesion = await SesionClase.create({
    modulo_id: modulo.id,
    fecha: hoyLaPaz(),
    hora_inicio: '00:00:00',
    hora_fin: '23:59:00',
  });

  tokenAdmin = (await request(app).post('/api/auth/login').send({ identificador: 'admin@test.com', password: 'secreto123' })).body.access_token;
  tokenEst = (await request(app).post('/api/auth/login').send({ identificador: '3001' })).body.access_token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Registro afectado en el historial (RF-09)', () => {
  test('una marca de asistencia indica la asistencia del estudiante y la fecha', async () => {
    expect((await request(app).post('/api/asistencia/marcar').set(auth(tokenEst))).status).toBe(201);
    const marca = de(await actividades(), 'MARCAR_ASISTENCIA');
    expect(marca.registro_afectado).toBe(`Asistencia de Lucía Quispe · ${diaMesHoy()}`);
  });

  test('una corrección indica el cambio de estado', async () => {
    const res = await request(app)
      .put(`/api/admin/asistencias/${sesion.id}/${est.id}`)
      .set(auth(tokenAdmin))
      .send({ estado: 'FALTA', motivo: 'Certificado médico' });
    expect(res.status).toBe(200);
    const correccion = de(await actividades(), 'MODIFICAR_ASISTENCIA');
    expect(correccion.registro_afectado).toBe(`Asistencia de Lucía Quispe · ${diaMesHoy()}: Presente → Falta`);
  });

  test('una importación indica el número y el archivo', async () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Hoja1');
    hoja.addRow(['Número de registro', 'Nombre completo', 'Correo electrónico']);
    hoja.addRow(['3002', 'Pedro Mamani', 'pedro@test.com']);
    const buffer = Buffer.from(await libro.xlsx.writeBuffer());
    const imp = await request(app)
      .post('/api/importacion/estudiantes')
      .set(auth(tokenAdmin))
      .attach('archivo', buffer, 'segunda_lista.xlsx');
    expect(imp.status).toBe(201);
    const registro = de(await actividades(), 'IMPORTAR_ESTUDIANTES');
    expect(registro.registro_afectado).toBe(`Importación #${imp.body.importacion.id} (segunda_lista.xlsx)`);
  });

  test('módulo y estudiante tienen su texto y el login no tiene registro afectado', async () => {
    await request(app).patch(`/api/modulos/${modulo.id}`).set(auth(tokenAdmin)).send({ nombre: 'Módulo RF9 bis' });
    await request(app)
      .post(`/api/modulos/${modulo.id}/estudiantes`)
      .set(auth(tokenAdmin))
      .send({ codigo: '3003', nombre: 'Ana Rojas', email: 'ana@test.com' });
    const lista = await actividades();
    expect(de(lista, 'EDITAR_MODULO').registro_afectado).toBe('Módulo Módulo RF9 bis (1-2026)');
    expect(de(lista, 'AGREGAR_ESTUDIANTE').registro_afectado).toBe('Ana Rojas (3003)');
    expect(de(lista, 'LOGIN').registro_afectado).toBeNull();
  });

  test('los campos que ya existían se conservan', async () => {
    const [primera] = await actividades();
    ['id', 'accion', 'entidad', 'entidad_id', 'detalle', 'ip', 'creado_en', 'Usuario', 'Modulo'].forEach((campo) =>
      expect(primera).toHaveProperty(campo)
    );
  });
});
