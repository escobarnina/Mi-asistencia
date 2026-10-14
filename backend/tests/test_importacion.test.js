// Pruebas de importación (RF-11, RF-16): revisión del Excel de estudiantes.
process.env.NODE_ENV = 'test';

const request = require('supertest');
const ExcelJS = require('exceljs');
const app = require('../src/server');
const {
  sequelize,
  Usuario,
  Modulo,
  Inscripcion,
  Importacion,
  Actividad,
  SesionClase,
} = require('../src/models');
const { aFecha, aHora } = require('../src/schemas/importacion');
const { hashPassword } = require('../src/core/security');

let tokenAdmin;
let tokenEstudiante;
let moduloActivo;

async function login(identificador, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ identificador, password });
  return res.body.access_token;
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });

// Arma un .xlsx en memoria con las filas dadas (la primera son los encabezados).
async function crearExcel(filas) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Hoja1');
  filas.forEach((f) => hoja.addRow(f));
  return Buffer.from(await libro.xlsx.writeBuffer());
}

const ENCABEZADOS = ['Número de registro', 'Nombre completo', 'Correo electrónico'];

function revisar(buffer, token = tokenAdmin, nombre = 'estudiantes.xlsx') {
  return request(app)
    .post('/api/importacion/estudiantes/revisar')
    .set(auth(token))
    .attach('archivo', buffer, nombre);
}

beforeAll(async () => {
  await sequelize.sync({ force: true });

  const admin = await Usuario.create({
    nombre: 'Admin Prueba',
    email: 'admin@test.com',
    rol: 'ADMIN',
    password_hash: await hashPassword('secreto123'),
    activo: true,
  });
  const modulo = await Modulo.create({
    nombre: 'Módulo Prueba',
    activo: true,
    activado_en: new Date(),
    creado_por: admin.id,
  });
  moduloActivo = modulo;
  // Estudiante que ya existe e inscrito en el módulo activo.
  const est = await Usuario.create({
    codigo: '1001',
    nombre: 'Juan Pérez',
    email: 'juan@gmail.com',
    rol: 'ESTUDIANTE',
  });
  await Inscripcion.create({ modulo_id: modulo.id, estudiante_id: est.id });
  // Estudiante que existe pero no está en el módulo activo.
  await Usuario.create({
    codigo: '2000',
    nombre: 'Ana Antigua',
    email: 'ana@gmail.com',
    rol: 'ESTUDIANTE',
  });

  tokenAdmin = await login('admin@test.com', 'secreto123');
  tokenEstudiante = await login('juan@gmail.com');
});

afterAll(async () => {
  await sequelize.close();
});

describe('Permisos', () => {
  test('sin token devuelve 401', async () => {
    const res = await request(app).post('/api/importacion/estudiantes/revisar');
    expect(res.status).toBe(401);
  });

  test('un estudiante recibe 403', async () => {
    const buf = await crearExcel([ENCABEZADOS]);
    const res = await revisar(buf, tokenEstudiante);
    expect(res.status).toBe(403);
  });
});

describe('Archivo inválido', () => {
  test('sin archivo devuelve 400', async () => {
    const res = await request(app)
      .post('/api/importacion/estudiantes/revisar')
      .set(auth(tokenAdmin));
    expect(res.status).toBe(400);
    expect(res.body.detalle).toBe('Debes adjuntar un archivo Excel');
  });

  test('extensión que no es .xlsx devuelve 400', async () => {
    const res = await revisar(Buffer.from('a,b,c'), tokenAdmin, 'lista.csv');
    expect(res.status).toBe(400);
    expect(res.body.detalle).toBe('Solo se aceptan archivos Excel (.xlsx)');
  });

  test('contenido que no es Excel devuelve 400', async () => {
    const res = await revisar(Buffer.from('no soy excel'));
    expect(res.status).toBe(400);
    expect(res.body.detalle).toBe('El archivo no es un Excel válido (.xlsx)');
  });

  test('faltan columnas devuelve 400', async () => {
    const buf = await crearExcel([['Nombre completo'], ['Juan']]);
    const res = await revisar(buf);
    expect(res.status).toBe(400);
    expect(res.body.detalle).toMatch(/Faltan columnas/);
  });
});

describe('Revisión de filas (vista previa)', () => {
  test('clasifica filas válidas y reporta errores sin guardar nada', async () => {
    const antes = await Usuario.count();
    const buf = await crearExcel([
      ENCABEZADOS,
      [1001, 'Juan Pérez', 'juan@gmail.com'], // ya inscrito
      [2000, 'Ana Antigua', 'ANA@gmail.com'], // existe, no inscrita
      [1002, 'María López', 'maria@gmail.com'], // nueva
      [1003, '', 'malcorreo'], // faltan datos
      [1002, 'Otra María', 'otra@gmail.com'], // número repetido en el archivo
      [1001, 'Juan Pérez', 'otro@gmail.com'], // repetido en archivo
      [3000, 'Impostor', 'admin@test.com'], // correo de un admin
      [4000, 'Cruzado', 'juan2@gmail.com'],
    ]);
    const res = await revisar(buf);

    expect(res.status).toBe(200);
    expect(res.body.archivo).toBe('estudiantes.xlsx');
    expect(res.body.total).toBe(8);

    const estados = Object.fromEntries(res.body.validas.map((v) => [v.codigo, v.estado]));
    expect(estados).toEqual({
      1001: 'YA_INSCRITO',
      2000: 'EXISTENTE',
      1002: 'NUEVO',
      4000: 'NUEVO',
    });

    const errores = Object.fromEntries(res.body.errores.map((e) => [e.fila, e.mensaje]));
    expect(errores[5]).toBe('Falta el nombre completo; El correo electrónico no es válido');
    expect(errores[6]).toMatch(/1002 está repetido \(ya aparece en la fila 4\)/);
    expect(errores[7]).toMatch(/1001 está repetido/);
    expect(errores[8]).toBe('El correo o número de registro pertenece a un administrador');

    // La revisión no guarda nada.
    expect(await Usuario.count()).toBe(antes);
  });

  test('número existente con otro correo es error', async () => {
    const buf = await crearExcel([ENCABEZADOS, [2000, 'Ana', 'distinto@gmail.com']]);
    const res = await revisar(buf);
    expect(res.body.validas).toHaveLength(0);
    expect(res.body.errores[0].mensaje).toMatch(/ya está registrado con otro correo/);
  });
});

function importar(buffer, token = tokenAdmin) {
  return request(app)
    .post('/api/importacion/estudiantes')
    .set(auth(token))
    .attach('archivo', buffer, 'estudiantes.xlsx');
}

describe('Importar estudiantes (guardar)', () => {
  test('un estudiante recibe 403', async () => {
    const buf = await crearExcel([ENCABEZADOS, [5000, 'X', 'x@gmail.com']]);
    const res = await importar(buf, tokenEstudiante);
    expect(res.status).toBe(403);
  });

  test('con un solo error no guarda nada y devuelve la lista', async () => {
    const usuarios = await Usuario.count();
    const inscripciones = await Inscripcion.count();
    const buf = await crearExcel([
      ENCABEZADOS,
      [5001, 'Válido', 'valido@gmail.com'],
      [5002, '', 'sin-nombre@gmail.com'],
    ]);
    const res = await importar(buf);

    expect(res.status).toBe(400);
    expect(res.body.errores).toEqual([{ fila: 3, mensaje: 'Falta el nombre completo' }]);
    expect(await Usuario.count()).toBe(usuarios);
    expect(await Inscripcion.count()).toBe(inscripciones);
    expect(await Importacion.count()).toBe(0);
  });

  test('guarda nuevos, inscribe existentes y omite ya inscritos', async () => {
    const buf = await crearExcel([
      ENCABEZADOS,
      [1001, 'Juan Pérez', 'juan@gmail.com'], // ya inscrito
      [2000, 'Ana Antigua', 'ana@gmail.com'], // existente
      [6001, 'Nuevo Uno', 'nuevo1@gmail.com'], // nuevo
      [6002, 'Nuevo Dos', 'nuevo2@gmail.com'], // nuevo
    ]);
    const res = await importar(buf);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ creados: 2, inscritos: 3, yaInscritos: 1 });
    expect(res.body.detalle).toBe('Se importaron 3 estudiantes correctamente');

    // Los 4 quedan inscritos en el módulo activo, sin duplicados.
    const inscritos = await Inscripcion.count({ where: { modulo_id: moduloActivo.id } });
    expect(inscritos).toBe(4);

    // Resumen en la tabla importacion.
    const imp = await Importacion.findByPk(res.body.importacion.id);
    expect(imp).toMatchObject({
      tipo: 'ESTUDIANTES',
      archivo: 'estudiantes.xlsx',
      filas_ok: 4,
      filas_error: 0,
      modulo_id: moduloActivo.id,
    });

    // Historial de actividad.
    const act = await Actividad.findOne({ where: { accion: 'IMPORTAR_ESTUDIANTES' } });
    expect(act).not.toBeNull();
    expect(act.entidad_id).toBe(imp.id);
  });

  test('el estudiante importado ya puede iniciar sesión', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identificador: '6001' });
    expect(res.status).toBe(200);
    expect(res.body.usuario.nombre).toBe('Nuevo Uno');
  });

  test('importar el mismo archivo otra vez no duplica nada', async () => {
    const usuarios = await Usuario.count();
    const buf = await crearExcel([ENCABEZADOS, [6001, 'Nuevo Uno', 'nuevo1@gmail.com']]);
    const res = await importar(buf);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ creados: 0, inscritos: 0, yaInscritos: 1 });
    expect(await Usuario.count()).toBe(usuarios);
  });

  test('sin módulo activo devuelve 409', async () => {
    await moduloActivo.update({ activo: false });
    const buf = await crearExcel([ENCABEZADOS, [7001, 'Y', 'y@gmail.com']]);
    const res = await importar(buf);
    expect(res.status).toBe(409);
    expect(res.body.detalle).toMatch(/No hay un módulo activo/);
    await moduloActivo.update({ activo: true });
  });
});

describe('Conversión de fechas y horas de Excel', () => {
  test('fechas: texto DD/MM/AAAA, Date, número de serie y AAAA-MM-DD', () => {
    expect(aFecha('05/10/2026')).toBe('2026-10-05'); // 5 de octubre, no 10 de mayo
    expect(aFecha('5-10-2026')).toBe('2026-10-05');
    expect(aFecha(new Date(Date.UTC(2026, 9, 5)))).toBe('2026-10-05');
    expect(aFecha(46300)).toBe('2026-10-05');
    expect(aFecha('2026-10-05')).toBe('2026-10-05');
  });

  test('fechas imposibles o con formato raro son inválidas', () => {
    expect(aFecha('31/02/2026')).toBeNull();
    expect(aFecha('13/13/2026')).toBeNull();
    expect(aFecha('mañana')).toBeNull();
  });

  test('horas: texto, Date de Excel y fracción del día', () => {
    expect(aHora('18:00')).toBe('18:00:00');
    expect(aHora('8:30')).toBe('08:30:00');
    expect(aHora('21:00:00')).toBe('21:00:00');
    expect(aHora(new Date(Date.UTC(1899, 11, 30, 18, 0)))).toBe('18:00:00');
    expect(aHora(0.75)).toBe('18:00:00');
    expect(aHora('25:00')).toBeNull();
    expect(aHora('tarde')).toBeNull();
  });
});

describe('Revisión de fechas (vista previa)', () => {
  const ENC_FECHAS = ['Fecha', 'Hora inicio', 'Hora fin'];

  function revisarFechas(buffer, token = tokenAdmin) {
    return request(app)
      .post('/api/importacion/fechas/revisar')
      .set(auth(token))
      .attach('archivo', buffer, 'fechas.xlsx');
  }

  beforeAll(async () => {
    // Una clase ya cargada en el módulo activo.
    await SesionClase.create({
      modulo_id: moduloActivo.id,
      fecha: '2026-10-07',
      hora_inicio: '18:00:00',
      hora_fin: '21:00:00',
    });
  });

  test('un estudiante recibe 403', async () => {
    const buf = await crearExcel([ENC_FECHAS, ['05/10/2026', '18:00', '21:00']]);
    const res = await revisarFechas(buf, tokenEstudiante);
    expect(res.status).toBe(403);
  });

  test('clasifica filas válidas y reporta errores sin guardar nada', async () => {
    const antes = await SesionClase.count();
    const buf = await crearExcel([
      ENC_FECHAS,
      ['12/10/2026', '18:00', '21:00'], // válida (texto)
      [new Date(Date.UTC(2026, 9, 5)), '18:00', '21:00'], // válida (fecha de Excel)
      ['07/10/2026', '18:00', '21:00'], // ya existe en el módulo
      ['31/02/2026', '18:00', '21:00'], // fecha imposible
      ['14/10/2026', '21:00', '18:00'], // fin antes que inicio
      ['05/10/2026', '19:00', '22:00'], // repetida en el archivo
      ['16/10/2026', '', '21:00'], // falta hora de inicio
    ]);
    const res = await revisarFechas(buf);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    // Ordenadas por fecha.
    expect(res.body.validas).toEqual([
      { fila: 3, fecha: '2026-10-05', hora_inicio: '18:00:00', hora_fin: '21:00:00' },
      { fila: 2, fecha: '2026-10-12', hora_inicio: '18:00:00', hora_fin: '21:00:00' },
    ]);
    expect(res.body.errores).toEqual([
      { fila: 4, mensaje: 'Ya existe una clase el 07/10/2026 en el módulo activo' },
      { fila: 5, mensaje: 'La fecha no es válida (usa DD/MM/AAAA)' },
      { fila: 6, mensaje: 'La hora de fin debe ser posterior a la hora de inicio' },
      { fila: 7, mensaje: 'La fecha 05/10/2026 está repetida (ya aparece en la fila 3)' },
      { fila: 8, mensaje: 'Falta la hora de inicio' },
    ]);
    expect(await SesionClase.count()).toBe(antes);
  });

  test('faltan columnas devuelve 400', async () => {
    const buf = await crearExcel([['Fecha'], ['05/10/2026']]);
    const res = await revisarFechas(buf);
    expect(res.status).toBe(400);
    expect(res.body.detalle).toBe('Faltan columnas en el archivo: Hora inicio, Hora fin');
  });
});

describe('Importar fechas (guardar)', () => {
  const ENC_FECHAS = ['Fecha', 'Hora inicio', 'Hora fin'];

  function importarFechas(buffer, token = tokenAdmin) {
    return request(app)
      .post('/api/importacion/fechas')
      .set(auth(token))
      .attach('archivo', buffer, 'fechas.xlsx');
  }

  test('un estudiante recibe 403', async () => {
    const buf = await crearExcel([ENC_FECHAS, ['20/10/2026', '18:00', '21:00']]);
    const res = await importarFechas(buf, tokenEstudiante);
    expect(res.status).toBe(403);
  });

  test('con un solo error no guarda nada y devuelve la lista', async () => {
    const antes = await SesionClase.count();
    const buf = await crearExcel([
      ENC_FECHAS,
      ['20/10/2026', '18:00', '21:00'],
      ['22/10/2026', '21:00', '18:00'],
    ]);
    const res = await importarFechas(buf);
    expect(res.status).toBe(400);
    expect(res.body.errores).toEqual([
      { fila: 3, mensaje: 'La hora de fin debe ser posterior a la hora de inicio' },
    ]);
    expect(await SesionClase.count()).toBe(antes);
  });

  test('guarda las fechas en el módulo activo con resumen e historial', async () => {
    const buf = await crearExcel([
      ENC_FECHAS,
      ['20/10/2026', '18:00', '21:00'],
      ['22/10/2026', '18:30', '21:30'],
    ]);
    const res = await importarFechas(buf);

    expect(res.status).toBe(201);
    expect(res.body.creadas).toBe(2);
    expect(res.body.detalle).toBe('Se importaron 2 fechas de clase correctamente');

    const sesion = await SesionClase.findOne({
      where: { modulo_id: moduloActivo.id, fecha: '2026-10-22' },
    });
    expect(sesion).toMatchObject({ hora_inicio: '18:30:00', hora_fin: '21:30:00', cerrada: false });

    const imp = await Importacion.findByPk(res.body.importacion.id);
    expect(imp).toMatchObject({ tipo: 'FECHAS', filas_ok: 2, filas_error: 0 });

    const act = await Actividad.findOne({ where: { accion: 'IMPORTAR_FECHAS' } });
    expect(act.entidad_id).toBe(imp.id);
  });

  test('importar las mismas fechas otra vez da error y no duplica', async () => {
    const antes = await SesionClase.count();
    const buf = await crearExcel([ENC_FECHAS, ['20/10/2026', '18:00', '21:00']]);
    const res = await importarFechas(buf);
    expect(res.status).toBe(400);
    expect(res.body.errores[0].mensaje).toBe('Ya existe una clase el 20/10/2026 en el módulo activo');
    expect(await SesionClase.count()).toBe(antes);
  });

  test('sin módulo activo devuelve 409', async () => {
    await moduloActivo.update({ activo: false });
    const buf = await crearExcel([ENC_FECHAS, ['28/10/2026', '18:00', '21:00']]);
    const res = await importarFechas(buf);
    expect(res.status).toBe(409);
    expect(res.body.detalle).toMatch(/No hay un módulo activo/);
    await moduloActivo.update({ activo: true });
  });
});
