// Lógica de importación desde Excel (RF-11, RF-12, RF-16).
// "revisar" valida el archivo SIN guardar nada (vista previa).
// "importar" vuelve a revisar y, si no hay errores, guarda todo (todo o nada).
const { Op } = require('sequelize');
const {
  sequelize,
  Usuario,
  Inscripcion,
  SesionClase,
  Asistencia,
  Importacion,
  Modulo,
} = require('../models');
const { errorHttp } = require('../core/errors');
const { leerFilas } = require('./excelService');
const actividadService = require('./actividadService');
const {
  filaEstudianteSchema,
  COLUMNAS_ESTUDIANTES,
  filaFechaSchema,
  COLUMNAS_FECHAS,
} = require('../schemas/importacion');

// Módulo al que se importa (RF-13). Con `moduloId` se usa ese módulo, que puede
// estar inactivo (un módulo nuevo que todavía no se activa); sin él, el activo.
// Un módulo que ya estuvo activo y fue reemplazado es historia: no se modifica (RN-08).
// Devuelve el módulo o null si no se indicó y no hay uno activo.
async function resolverModulo(moduloId) {
  if (moduloId === undefined || moduloId === null || moduloId === '') {
    const activo = await Modulo.findOne({ where: { activo: true } });
    return activo || null;
  }
  const id = Number(moduloId);
  if (!Number.isInteger(id) || id <= 0) throw errorHttp(400, 'El módulo indicado no es válido');
  const modulo = await Modulo.findByPk(id);
  if (!modulo) throw errorHttp(404, 'Módulo no encontrado');
  if (!modulo.activo && modulo.activado_en) {
    throw errorHttp(
      409,
      `El módulo "${modulo.nombre}" ya se usó y fue reemplazado; sus datos se conservan y no se pueden modificar`
    );
  }
  return modulo;
}

// Modo de importación: AGREGAR (por defecto) suma a la lista; REEMPLAZAR la sustituye.
function resolverModo(modo) {
  const valor = modo === undefined || modo === null || modo === '' ? 'AGREGAR' : String(modo).toUpperCase();
  if (valor !== 'AGREGAR' && valor !== 'REEMPLAZAR') {
    throw errorHttp(400, 'El modo de importación debe ser AGREGAR o REEMPLAZAR');
  }
  return valor;
}

// Reemplazar la lista solo es posible si el módulo todavía no tiene asistencias (RN-08).
async function exigirSinAsistencias(modulo) {
  if (!modulo) return;
  const sesiones = await SesionClase.findAll({ where: { modulo_id: modulo.id }, attributes: ['id'] });
  const asistencias = sesiones.length
    ? await Asistencia.count({ where: { sesion_id: sesiones.map((s) => s.id) } })
    : 0;
  if (asistencias > 0) {
    throw errorHttp(
      409,
      `El módulo "${modulo.nombre}" ya tiene asistencias registradas: no se puede reemplazar la lista, solo agregar`
    );
  }
}

function exigirModulo(modulo, que) {
  if (!modulo) {
    throw errorHttp(409, `No hay un módulo activo. Elige o crea un módulo antes de importar ${que}`);
  }
  return modulo;
}

// '2026-10-05' -> '05/10/2026' para los mensajes al usuario.
const fechaLegible = (iso) => iso.split('-').reverse().join('/');

// Vista previa por fila: cada fila del Excel con su resultado (NUEVO, YA_INSCRITO o ERROR).
function armarFilas(filasLeidas, validas, errores, resultadoDe) {
  const porValida = new Map(validas.map((v) => [v.fila, v]));
  const porError = new Map(errores.map((e) => [e.fila, e.mensaje]));
  return filasLeidas.map((f) => {
    if (porError.has(f.fila)) return { ...f, resultado: 'ERROR', mensaje: porError.get(f.fila) };
    const valida = porValida.get(f.fila);
    return { ...f, ...(valida || {}), resultado: valida ? resultadoDe(valida) : 'ERROR' };
  });
}

function resumir(filas) {
  return {
    nuevos: filas.filter((f) => f.resultado === 'NUEVO').length,
    omitidos: filas.filter((f) => f.resultado === 'YA_INSCRITO').length,
    errores: filas.filter((f) => f.resultado === 'ERROR').length,
  };
}

// Valida una fila con zod; devuelve { datos } o { mensaje } con todos los
// problemas de la fila juntos (p. ej. "Falta el nombre; El correo no es válido").
function validarFila(schema, fila) {
  const r = schema.safeParse(fila);
  if (r.success) return { datos: r.data };
  return { mensaje: r.error.issues.map((i) => i.message).join('; ') };
}

// RF-11 + RF-16: revisa el Excel de estudiantes y arma la vista previa.
// Cada fila válida trae su estado: NUEVO, EXISTENTE (ya está en el sistema)
// o YA_INSCRITO (ya está en el módulo destino: el indicado o, si no, el activo).
async function revisarEstudiantes(buffer, moduloId, modoEntrada) {
  const modo = resolverModo(modoEntrada);
  const modulo = await resolverModulo(moduloId);
  if (modo === 'REEMPLAZAR') await exigirSinAsistencias(modulo);
  const filas = await leerFilas(buffer, COLUMNAS_ESTUDIANTES);
  const errores = [];
  const candidatas = [];

  // 1. Campos obligatorios y formato de cada fila.
  // 2. Repetidos dentro del mismo archivo (número de registro o correo).
  const vistosCodigo = new Map();
  const vistosEmail = new Map();
  for (const fila of filas) {
    const { datos, mensaje } = validarFila(filaEstudianteSchema, fila);
    if (mensaje) {
      errores.push({ fila: fila.fila, mensaje });
      continue;
    }
    if (vistosCodigo.has(datos.codigo)) {
      errores.push({
        fila: fila.fila,
        mensaje: `El número de registro ${datos.codigo} está repetido (ya aparece en la fila ${vistosCodigo.get(datos.codigo)})`,
      });
      continue;
    }
    if (vistosEmail.has(datos.email)) {
      errores.push({
        fila: fila.fila,
        mensaje: `El correo ${datos.email} está repetido (ya aparece en la fila ${vistosEmail.get(datos.email)})`,
      });
      continue;
    }
    vistosCodigo.set(datos.codigo, fila.fila);
    vistosEmail.set(datos.email, fila.fila);
    candidatas.push({ fila: fila.fila, ...datos });
  }

  // 3. Comparar con los usuarios que ya existen en la base de datos.
  const existentes = candidatas.length
    ? await Usuario.findAll({
        where: {
          [Op.or]: [
            { codigo: candidatas.map((c) => c.codigo) },
            { email: candidatas.map((c) => c.email) },
          ],
        },
      })
    : [];
  const porCodigo = new Map(existentes.filter((u) => u.codigo).map((u) => [u.codigo, u]));
  const porEmail = new Map(existentes.map((u) => [u.email.toLowerCase(), u]));

  const inscritos = new Set();
  // En REEMPLAZAR la lista actual se sustituye, así que nadie cuenta como ya inscrito.
  if (modulo && existentes.length && modo === 'AGREGAR') {
    const ins = await Inscripcion.findAll({
      where: { modulo_id: modulo.id, estudiante_id: existentes.map((u) => u.id) },
      attributes: ['estudiante_id'],
    });
    ins.forEach((i) => inscritos.add(i.estudiante_id));
  }

  const validas = [];
  for (const c of candidatas) {
    const uCodigo = porCodigo.get(c.codigo);
    const uEmail = porEmail.get(c.email);

    if ((uCodigo && uCodigo.rol === 'ADMIN') || (uEmail && uEmail.rol === 'ADMIN')) {
      errores.push({ fila: c.fila, mensaje: 'El correo o número de registro pertenece a un administrador' });
    } else if (uCodigo && uCodigo.email.toLowerCase() !== c.email) {
      errores.push({
        fila: c.fila,
        mensaje: `El número de registro ${c.codigo} ya está registrado con otro correo (${uCodigo.email})`,
      });
    } else if (uEmail && uEmail.codigo !== c.codigo) {
      errores.push({
        fila: c.fila,
        mensaje: `El correo ${c.email} ya está registrado con otro número de registro (${uEmail.codigo || 'sin número'})`,
      });
    } else {
      let estado = 'NUEVO';
      if (uCodigo) estado = inscritos.has(uCodigo.id) ? 'YA_INSCRITO' : 'EXISTENTE';
      validas.push({ ...c, estado });
    }
  }

  errores.sort((a, b) => a.fila - b.fila);
  const filasRevisadas = armarFilas(filas, validas, errores, (v) => (v.estado === 'YA_INSCRITO' ? 'YA_INSCRITO' : 'NUEVO'));
  return { modo, total: filas.length, validas, errores, filas: filasRevisadas, resumen: resumir(filasRevisadas) };
}

// RF-11: guarda los estudiantes del Excel en el módulo destino (el indicado o el activo).
// Si el archivo tiene algún error no guarda nada y devuelve { errores }.
// Si todo está bien devuelve { importacion, creados, inscritos, yaInscritos }.
async function importarEstudiantes(buffer, archivo, admin, ip, moduloDestino, modoEntrada) {
  const modo = resolverModo(modoEntrada);
  const modulo = exigirModulo(await resolverModulo(moduloDestino), 'estudiantes');
  const moduloId = modulo.id;

  const { validas, errores } = await revisarEstudiantes(buffer, moduloId, modo);
  if (errores.length > 0) return { errores };

  let creados = 0;
  let inscritos = 0;
  let importacion;
  try {
    importacion = await sequelize.transaction(async (t) => {
      if (modo === 'REEMPLAZAR') {
        await Inscripcion.destroy({ where: { modulo_id: moduloId }, transaction: t });
      }
      for (const v of validas) {
        if (v.estado === 'YA_INSCRITO') continue;

        let estudiante;
        if (v.estado === 'NUEVO') {
          estudiante = await Usuario.create(
            { codigo: v.codigo, nombre: v.nombre, email: v.email, rol: 'ESTUDIANTE' },
            { transaction: t }
          );
          creados++;
        } else {
          // EXISTENTE: viene de un módulo anterior. Se reactiva por si estaba
          // dado de baja, para que pueda iniciar sesión en el nuevo módulo.
          estudiante = await Usuario.findOne({ where: { codigo: v.codigo }, transaction: t });
          if (!estudiante.activo) await estudiante.update({ activo: true }, { transaction: t });
        }
        await Inscripcion.create(
          { modulo_id: moduloId, estudiante_id: estudiante.id, origen: 'EXCEL' },
          { transaction: t }
        );
        inscritos++;
      }

      return Importacion.create(
        {
          modulo_id: moduloId,
          tipo: 'ESTUDIANTES',
          archivo,
          filas_ok: validas.length,
          filas_error: 0,
          usuario_id: admin.id,
        },
        { transaction: t }
      );
    });
  } catch (e) {
    // Otro admin cargó los mismos datos entre la revisión y el guardado.
    if (e.name === 'SequelizeUniqueConstraintError') {
      throw errorHttp(409, 'Los datos cambiaron mientras se importaba. Vuelve a revisar el archivo');
    }
    throw e;
  }

  await actividadService.registrar(admin.id, 'IMPORTAR_ESTUDIANTES', {
    entidad: 'importacion',
    entidadId: importacion.id,
    detalle: `${archivo}: ${creados} nuevos, ${inscritos} inscritos` + (modo === 'REEMPLAZAR' ? ' (lista reemplazada)' : ''),
    ip,
    moduloId,
  });

  return {
    importacion,
    modo,
    creados,
    inscritos,
    yaInscritos: validas.length - inscritos,
  };
}

// RF-12 + RF-16: revisa el Excel de fechas de clase y arma la vista previa.
// No guarda nada. Las fechas que ya existen en el módulo activo son error.
async function revisarFechas(buffer, moduloId, modoEntrada) {
  const modo = resolverModo(modoEntrada);
  const modulo = await resolverModulo(moduloId);
  if (modo === 'REEMPLAZAR') await exigirSinAsistencias(modulo);
  const filas = await leerFilas(buffer, COLUMNAS_FECHAS);
  const errores = [];
  const candidatas = [];

  // 1. Fecha y horas válidas, fin posterior a inicio.
  // 2. Fechas repetidas dentro del mismo archivo.
  const vistas = new Map();
  for (const fila of filas) {
    const { datos, mensaje } = validarFila(filaFechaSchema, fila);
    if (mensaje) {
      errores.push({ fila: fila.fila, mensaje });
      continue;
    }
    if (vistas.has(datos.fecha)) {
      errores.push({
        fila: fila.fila,
        mensaje: `La fecha ${fechaLegible(datos.fecha)} está repetida (ya aparece en la fila ${vistas.get(datos.fecha)})`,
      });
      continue;
    }
    vistas.set(datos.fecha, fila.fila);
    candidatas.push({ fila: fila.fila, ...datos });
  }

  // 3. Fechas que ya están cargadas en el módulo destino.
  const existentes = new Set();
  if (modulo && candidatas.length && modo === 'AGREGAR') {
    const sesiones = await SesionClase.findAll({
      where: { modulo_id: modulo.id, fecha: candidatas.map((c) => c.fecha) },
      attributes: ['fecha'],
    });
    sesiones.forEach((s) => existentes.add(s.fecha));
  }

  const validas = [];
  for (const c of candidatas) {
    if (existentes.has(c.fecha)) {
      errores.push({
        fila: c.fila,
        mensaje: `Ya existe una clase el ${fechaLegible(c.fecha)} en ${modulo.activo ? 'el módulo activo' : 'este módulo'}`,
      });
    } else {
      validas.push(c);
    }
  }

  errores.sort((a, b) => a.fila - b.fila);
  validas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const filasRevisadas = armarFilas(filas, validas, errores, () => 'NUEVO');
  return { modo, total: filas.length, validas, errores, filas: filasRevisadas, resumen: resumir(filasRevisadas) };
}

// RF-12: guarda las fechas de clase del Excel en el módulo destino (el indicado o el activo).
// Si el archivo tiene algún error no guarda nada y devuelve { errores }.
async function importarFechas(buffer, archivo, admin, ip, moduloDestino, modoEntrada) {
  const modo = resolverModo(modoEntrada);
  const modulo = exigirModulo(await resolverModulo(moduloDestino), 'fechas');
  const moduloId = modulo.id;

  const { validas, errores } = await revisarFechas(buffer, moduloId, modo);
  if (errores.length > 0) return { errores };

  let importacion;
  try {
    importacion = await sequelize.transaction(async (t) => {
      if (modo === 'REEMPLAZAR') {
        await SesionClase.destroy({ where: { modulo_id: moduloId }, transaction: t });
      }
      await SesionClase.bulkCreate(
        validas.map((v) => ({
          modulo_id: moduloId,
          fecha: v.fecha,
          hora_inicio: v.hora_inicio,
          hora_fin: v.hora_fin,
        })),
        { transaction: t }
      );
      return Importacion.create(
        {
          modulo_id: moduloId,
          tipo: 'FECHAS',
          archivo,
          filas_ok: validas.length,
          filas_error: 0,
          usuario_id: admin.id,
        },
        { transaction: t }
      );
    });
  } catch (e) {
    // Otro admin cargó las mismas fechas entre la revisión y el guardado.
    if (e.name === 'SequelizeUniqueConstraintError') {
      throw errorHttp(409, 'Los datos cambiaron mientras se importaba. Vuelve a revisar el archivo');
    }
    throw e;
  }

  await actividadService.registrar(admin.id, 'IMPORTAR_FECHAS', {
    entidad: 'importacion',
    entidadId: importacion.id,
    detalle: `${archivo}: ${validas.length} fechas de clase` + (modo === 'REEMPLAZAR' ? ' (lista reemplazada)' : ''),
    ip,
    moduloId,
  });

  return { importacion, modo, creadas: validas.length };
}

module.exports = {
  revisarEstudiantes,
  importarEstudiantes,
  revisarFechas,
  importarFechas,
};
