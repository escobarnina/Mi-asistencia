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
const ExcelJS = require('exceljs');
const { hashPassword } = require('../src/core/security');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const fechaHoy = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
// Ayer en La Paz: una clase ya pasada.
const fechaAyer = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(
  new Date(new Date(`${fechaHoy}T12:00:00Z`).getTime() - 24 * 60 * 60 * 1000)
);

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

  test('lista la sesión de hoy con todos los inscritos como pendientes', async () => {
    const res = await request(app)
      .get(`/api/admin/asistencias?fecha=${fechaHoy}`)
      .set(auth(tokenAdmin));

    expect(res.status).toBe(200);
    expect(res.body.sesiones).toHaveLength(1);
    expect(res.body.sesiones[0]).toMatchObject({
      id: sesion.id,
      presentes: 0,
      faltas: 0,
      pendientes: 2,
    });
    expect(res.body.sesiones[0].asistencias.map((a) => a.estado)).toEqual([
      'PENDIENTE',
      'PENDIENTE',
    ]);
    expect(res.body.totales).toMatchObject({ presentes: 0, faltas: 0, pendientes: 2 });
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

  describe('faltas automáticas (RF-04 / RN-05)', () => {
    let sesionAyer;

    beforeEach(async () => {
      sesionAyer = await SesionClase.create({
        modulo_id: modulo.id,
        fecha: fechaAyer,
        hora_inicio: '18:00:00',
        hora_fin: '21:00:00',
      });
    });

    const reporte = async () => (
      await request(app).get('/api/admin/asistencias').set(auth(tokenAdmin))
    ).body;
    const filaDe = (rep, fecha, codigo) => rep.sesiones
      .find((s) => s.fecha === fecha)
      .asistencias.find((a) => a.estudiante.codigo === codigo);

    test('una fecha pasada sin marca es FALTA para todos, sin acción del admin', async () => {
      const rep = await reporte();
      const ayer = rep.sesiones.find((s) => s.fecha === fechaAyer);

      expect(ayer.asistencias.map((a) => a.estado)).toEqual(['FALTA', 'FALTA']);
      expect(ayer.asistencias.every((a) => a.automatica && a.origen === 'SISTEMA')).toBe(true);
      expect(ayer).toMatchObject({ presentes: 0, faltas: 2, pendientes: 0 });
      // No se guardó nada: la falta es derivada.
      expect(await Asistencia.count()).toBe(0);
    });

    test('hoy sin marca es PENDIENTE y los totales suman ambas fechas', async () => {
      await Asistencia.create({
        sesion_id: sesion.id,
        estudiante_id: estudiantePresente.id,
        estado: 'PRESENTE',
        hora_registro: new Date(),
        origen: 'ESTUDIANTE',
      });
      const rep = await reporte();

      expect(filaDe(rep, fechaHoy, '990001').estado).toBe('PRESENTE');
      expect(filaDe(rep, fechaHoy, '990002').estado).toBe('PENDIENTE');
      expect(filaDe(rep, fechaAyer, '990001').estado).toBe('FALTA');
      expect(rep.totales).toMatchObject({ total: 4, presentes: 1, faltas: 2, pendientes: 1 });
    });

    test('la corrección manual prevalece sobre la falta automática y se audita', async () => {
      const res = await request(app)
        .put(`/api/admin/asistencias/${sesionAyer.id}/${estudiantePresente.id}`)
        .set(auth(tokenAdmin))
        .send({ estado: 'PRESENTE', motivo: 'Lista firmada en papel' });
      expect(res.status).toBe(200);

      const rep = await reporte();
      expect(filaDe(rep, fechaAyer, '990001')).toMatchObject({
        estado: 'PRESENTE',
        origen: 'ADMIN',
        automatica: false,
      });
      expect(filaDe(rep, fechaAyer, '990002').estado).toBe('FALTA');
      const cambio = await AsistenciaCambio.findOne();
      expect(cambio).toMatchObject({
        usuario_id: admin.id,
        estado_anterior: 'FALTA',
        estado_nuevo: 'PRESENTE',
      });
    });

    test('marcar FALTA una falta automática no cambia nada', async () => {
      const res = await request(app)
        .put(`/api/admin/asistencias/${sesionAyer.id}/${estudianteAusente.id}`)
        .set(auth(tokenAdmin))
        .send({ estado: 'FALTA', motivo: 'Confirmado' });

      expect(res.status).toBe(200);
      expect(res.body.sin_cambios).toBe(true);
      expect(await Asistencia.count()).toBe(0);
      expect(await AsistenciaCambio.count()).toBe(0);
    });

    test('los estados del admin coinciden con la vista y el resumen del estudiante', async () => {
      await Asistencia.create({
        sesion_id: sesion.id,
        estudiante_id: estudiantePresente.id,
        estado: 'PRESENTE',
        hora_registro: new Date(),
        origen: 'ESTUDIANTE',
      });
      const propio = await request(app)
        .get('/api/asistencia/mis-asistencias')
        .set(auth(tokenEstudiante));
      const rep = await reporte();
      const delAdmin = rep.sesiones.map(
        (s) => s.asistencias.find((a) => a.estudiante.codigo === '990001').estado
      );

      expect(propio.body.fechas.map((f) => f.estado)).toEqual(delAdmin);
      expect(propio.body.resumen).toMatchObject({ presentes: 1, faltas: 1, pendientes: 0 });
    });

    test('la exportación .xlsx usa los mismos estados que la pantalla', async () => {
      const res = await request(app)
        .get('/api/admin/asistencias/exportar')
        .set(auth(tokenAdmin))
        .buffer(true)
        .parse((r, cb) => {
          const trozos = [];
          r.on('data', (t) => trozos.push(t));
          r.on('end', () => cb(null, Buffer.concat(trozos)));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('.xlsx');
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(res.body);
      const hoja = libro.getWorksheet('Asistencias');
      const texto = (celda) => (celda.value && celda.value.richText
        ? celda.value.richText.map((p) => p.text).join('')
        : celda.value);
      const filas = [];
      hoja.eachRow((fila, n) => {
        if (n > 1) {
          filas.push({
            fecha: texto(fila.getCell(1)),
            estado: texto(fila.getCell(5)),
          });
        }
      });

      expect(texto(hoja.getRow(1).getCell(5))).toBe('Estado');
      expect(filas).toHaveLength(4);
      expect(filas.filter((f) => f.fecha === fechaAyer && f.estado === 'Falta')).toHaveLength(2);
      expect(filas.filter((f) => f.fecha === fechaHoy && f.estado === 'Pendiente')).toHaveLength(2);
      expect(await Actividad.count({ where: { accion: 'EXPORTAR' } })).toBe(1);
    });

    test('el endpoint manual de generar faltas ya no existe', async () => {
      const res = await request(app).post('/api/admin/faltas/generar').set(auth(tokenAdmin));
      expect(res.status).toBe(404);
      expect(await Asistencia.count()).toBe(0);
    });
  });

  describe('lista de estudiantes (RF-06)', () => {
    const buscar = (q) => request(app)
      .get('/api/admin/estudiantes')
      .query(q === undefined ? {} : { q })
      .set(auth(tokenAdmin));

    test('requiere administrador', async () => {
      const res = await request(app).get('/api/admin/estudiantes').set(auth(tokenEstudiante));
      expect(res.status).toBe(403);
    });

    test('lista los inscritos con registro, nombre y correo, ordenados por nombre', async () => {
      const res = await buscar();
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.estudiantes).toEqual([
        expect.objectContaining({ codigo: '990001', nombre: 'Ana Presente', email: 'ana@test.com' }),
        expect.objectContaining({ codigo: '990002', nombre: 'Luis Ausente', email: 'luis@test.com' }),
      ]);
    });

    test('busca por nombre o por número de registro', async () => {
      expect((await buscar('luis')).body.estudiantes.map((e) => e.codigo)).toEqual(['990002']);
      expect((await buscar('990001')).body.estudiantes.map((e) => e.nombre)).toEqual(['Ana Presente']);
      expect((await buscar('nadie')).body.total).toBe(0);
    });

    test('toma % y _ literalmente y excluye a quienes no están en el módulo activo', async () => {
      await Usuario.create({
        codigo: '990003',
        nombre: 'Fuera Módulo',
        email: 'fuera@test.com',
        rol: 'ESTUDIANTE',
        activo: true,
      });
      expect((await buscar('%')).body.total).toBe(0);
      expect((await buscar('_')).body.total).toBe(0);
      expect((await buscar('Fuera')).body.total).toBe(0);
    });

    test('sin módulo activo devuelve lista vacía', async () => {
      await modulo.update({ activo: false });
      const res = await buscar();
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ modulo: null, total: 0, estudiantes: [] });
    });
  });
});
