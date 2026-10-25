// Gestión editable de un módulo: estudiantes y fechas de clase, a mano, en cualquier
// momento (antes o después de activarlo) y sin límite de cantidad.
//
// Reglas que se respetan:
//   RN-02 número de registro y correo únicos en todo el sistema.
//   RN-03 una marca por estudiante y fecha (las asistencias no se tocan aquí).
//   RN-08 nada histórico se borra: quitar a un estudiante solo borra su inscripción
//         y una fecha con asistencias no se puede quitar ni mover.
const { Op } = require('sequelize');
const { sequelize, Usuario, Modulo, Inscripcion, SesionClase, Asistencia } = require('../models');
const { errorHttp } = require('../core/errors');
const actividadService = require('./actividadService');
const { hoyLaPaz } = require('./estadoAsistencia');
const { filaEstudianteSchema, filaFechaSchema } = require('../schemas/importacion');

const fechaLegible = (iso) => iso.split('-').reverse().join('/');
const horaCorta = (h) => String(h).slice(0, 5);

// Módulo sobre el que se puede trabajar. Uno que ya estuvo activo y fue reemplazado
// es historia: se puede consultar, pero no modificar (RN-08).
async function obtenerModulo(id, { soloLectura = false } = {}) {
  const modulo = await Modulo.findByPk(id);
  if (!modulo) throw errorHttp(404, 'Módulo no encontrado');
  if (!soloLectura && !modulo.activo && modulo.activado_en) {
    throw errorHttp(
      409,
      `El módulo "${modulo.nombre}" ya se usó y fue reemplazado; sus datos se conservan y no se pueden modificar`
    );
  }
  return modulo;
}

function validar(schema, datos) {
  const r = schema.safeParse(datos);
  if (!r.success) {
    throw errorHttp(400, r.error.issues.map((i) => i.message).join('; '));
  }
  return r.data;
}

const registrar = (admin, accion, modulo, entidad, entidadId, detalle, ip) =>
  actividadService.registrar(admin.id, accion, {
    entidad,
    entidadId,
    detalle,
    ip,
    moduloId: modulo.id,
  });

// ---------------------------------------------------------------- estudiantes

function estudiantePublico(inscripcion) {
  const u = inscripcion.estudiante;
  return {
    id: u.id,
    codigo: u.codigo,
    nombre: u.nombre,
    email: u.email,
    origen: inscripcion.origen,
    agregado_en: inscripcion.creado_en,
  };
}

async function listarEstudiantes(moduloId, { buscar, pagina = 1, limite = 20 } = {}) {
  await obtenerModulo(moduloId, { soloLectura: true });
  const page = Math.max(1, Number(pagina) || 1);
  const limit = Math.min(100, Math.max(1, Number(limite) || 20));
  const texto = typeof buscar === 'string' ? buscar.trim() : '';
  if (texto.length > 100) throw errorHttp(400, 'La búsqueda es demasiado larga');

  const like = `%${texto.replace(/[\\%_]/g, '\\$&')}%`;
  const { count, rows } = await Inscripcion.findAndCountAll({
    where: { modulo_id: moduloId },
    include: [
      {
        model: Usuario,
        as: 'estudiante',
        attributes: ['id', 'codigo', 'nombre', 'email'],
        where: texto
          ? {
              [Op.or]: [
                { nombre: { [Op.like]: like } },
                { codigo: { [Op.like]: like } },
                { email: { [Op.like]: like } },
              ],
            }
          : undefined,
        required: true,
      },
    ],
    order: [
      ['creado_en', 'DESC'],
      ['id', 'DESC'],
    ],
    limit,
    offset: (page - 1) * limit,
  });

  return {
    total: count,
    pagina: page,
    limite: limit,
    totalPaginas: Math.ceil(count / limit) || 1,
    estudiantes: rows.map(estudiantePublico),
  };
}

// Número de registro y correo ya pertenecen a otra persona (RN-02).
function conflictoDeUnicidad(codigoDe, emailDe, datos) {
  if (codigoDe) {
    return errorHttp(409, `El registro ${datos.codigo} ya pertenece a ${codigoDe.nombre}`);
  }
  if (emailDe) {
    return errorHttp(409, `El correo ${datos.email} ya pertenece a ${emailDe.nombre}`);
  }
  return null;
}

async function agregarEstudiante(moduloId, entrada, admin, ip) {
  const modulo = await obtenerModulo(moduloId);
  const datos = validar(filaEstudianteSchema, entrada);

  const [porCodigo, porEmail] = await Promise.all([
    Usuario.findOne({ where: { codigo: datos.codigo } }),
    Usuario.findOne({ where: { email: datos.email } }),
  ]);
  if (porCodigo?.rol === 'ADMIN' || porEmail?.rol === 'ADMIN') {
    throw errorHttp(409, 'El correo o número de registro pertenece a un administrador');
  }

  // Misma persona (mismo código y mismo correo): solo se inscribe.
  const existente = porCodigo && porEmail && porCodigo.id === porEmail.id ? porCodigo : null;
  if (!existente) {
    const conflicto = conflictoDeUnicidad(porCodigo, porEmail, datos);
    if (conflicto) throw conflicto;
  }

  let estudiante;
  try {
    estudiante = await sequelize.transaction(async (t) => {
      let u = existente;
      if (!u) {
        u = await Usuario.create(
          { codigo: datos.codigo, nombre: datos.nombre, email: datos.email, rol: 'ESTUDIANTE' },
          { transaction: t }
        );
      } else if (!u.activo) {
        await u.update({ activo: true }, { transaction: t });
      }
      const ya = await Inscripcion.findOne({
        where: { modulo_id: modulo.id, estudiante_id: u.id },
        transaction: t,
      });
      if (ya) throw errorHttp(409, `${u.nombre} ya está inscrito en este módulo`);
      await Inscripcion.create(
        { modulo_id: modulo.id, estudiante_id: u.id, origen: 'MANUAL' },
        { transaction: t }
      );
      return u;
    });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      throw errorHttp(409, 'El estudiante ya existe o ya está inscrito en este módulo');
    }
    throw e;
  }

  await registrar(
    admin,
    'AGREGAR_ESTUDIANTE',
    modulo,
    'inscripcion',
    estudiante.id,
    `${estudiante.nombre} (${estudiante.codigo}) agregado a mano`,
    ip
  );
  return { id: estudiante.id, codigo: estudiante.codigo, nombre: estudiante.nombre, email: estudiante.email, origen: 'MANUAL' };
}

async function inscripcionDe(moduloId, estudianteId) {
  const id = Number(estudianteId);
  if (!Number.isInteger(id) || id <= 0) throw errorHttp(400, 'El identificador del estudiante no es válido');
  const inscripcion = await Inscripcion.findOne({
    where: { modulo_id: moduloId, estudiante_id: id },
    include: [{ model: Usuario, as: 'estudiante' }],
  });
  if (!inscripcion) throw errorHttp(404, 'El estudiante no está inscrito en este módulo');
  return inscripcion;
}

async function editarEstudiante(moduloId, estudianteId, entrada, admin, ip) {
  const modulo = await obtenerModulo(moduloId);
  const inscripcion = await inscripcionDe(modulo.id, estudianteId);
  const u = inscripcion.estudiante;
  const datos = validar(filaEstudianteSchema, {
    codigo: entrada.codigo ?? u.codigo,
    nombre: entrada.nombre ?? u.nombre,
    email: entrada.email ?? u.email,
  });

  const [porCodigo, porEmail] = await Promise.all([
    Usuario.findOne({ where: { codigo: datos.codigo, id: { [Op.ne]: u.id } } }),
    Usuario.findOne({ where: { email: datos.email, id: { [Op.ne]: u.id } } }),
  ]);
  const conflicto = conflictoDeUnicidad(porCodigo, porEmail, datos);
  if (conflicto) throw conflicto;

  const cambios = [];
  if (datos.codigo !== u.codigo) cambios.push(`registro ${u.codigo} → ${datos.codigo}`);
  if (datos.nombre !== u.nombre) cambios.push(`nombre "${u.nombre}" → "${datos.nombre}"`);
  if (datos.email !== u.email) cambios.push(`correo ${u.email} → ${datos.email}`);

  if (cambios.length > 0) {
    try {
      await u.update({ codigo: datos.codigo, nombre: datos.nombre, email: datos.email });
    } catch (e) {
      if (e.name === 'SequelizeUniqueConstraintError') {
        throw errorHttp(409, 'El registro o el correo ya pertenecen a otra persona');
      }
      throw e;
    }
    await registrar(admin, 'EDITAR_ESTUDIANTE', modulo, 'inscripcion', u.id, cambios.join('; '), ip);
  }
  return estudiantePublico(inscripcion);
}

async function quitarEstudiante(moduloId, estudianteId, { forzar = false } = {}, admin, ip) {
  const modulo = await obtenerModulo(moduloId);
  const inscripcion = await inscripcionDe(modulo.id, estudianteId);
  const u = inscripcion.estudiante;

  const sesiones = await SesionClase.findAll({ where: { modulo_id: modulo.id }, attributes: ['id'] });
  const asistencias = sesiones.length
    ? await Asistencia.count({
        where: { estudiante_id: u.id, sesion_id: sesiones.map((s) => s.id) },
      })
    : 0;
  if (asistencias > 0 && !forzar) {
    throw errorHttp(
      409,
      `Este estudiante tiene ${asistencias} ${asistencias === 1 ? 'asistencia' : 'asistencias'}. ` +
        'Se quitará de la lista pero su historial se conserva',
      { asistencias, requiere_forzar: true }
    );
  }

  // Solo se borra la inscripción: el usuario y sus asistencias se conservan (RN-08).
  await inscripcion.destroy();
  await registrar(
    admin,
    'QUITAR_ESTUDIANTE',
    modulo,
    'inscripcion',
    u.id,
    `${u.nombre} (${u.codigo}) quitado del módulo` +
      (asistencias ? `; se conservan ${asistencias} asistencias` : ''),
    ip
  );
  return { asistencias_conservadas: asistencias };
}

// --------------------------------------------------------------------- fechas

function estadoFecha(fecha, hoy) {
  if (fecha < hoy) return 'DICTADA';
  if (fecha === hoy) return 'HOY';
  return 'PROXIMA';
}

async function sesionesConAsistencias(sesionIds) {
  if (sesionIds.length === 0) return new Set();
  const filas = await Asistencia.findAll({
    where: { sesion_id: sesionIds },
    attributes: ['sesion_id'],
    group: ['sesion_id'],
  });
  return new Set(filas.map((f) => f.sesion_id));
}

const sesionPublica = (s, hoy, conAsistencias) => ({
  id: s.id,
  fecha: s.fecha,
  hora_inicio: s.hora_inicio,
  hora_fin: s.hora_fin,
  estado_fecha: estadoFecha(s.fecha, hoy),
  tiene_asistencias: conAsistencias.has(s.id),
});

async function listarSesiones(moduloId) {
  await obtenerModulo(moduloId, { soloLectura: true });
  const hoy = hoyLaPaz();
  const sesiones = await SesionClase.findAll({
    where: { modulo_id: moduloId },
    order: [['fecha', 'ASC']],
  });
  const con = await sesionesConAsistencias(sesiones.map((s) => s.id));
  return { sesiones: sesiones.map((s) => sesionPublica(s, hoy, con)) };
}

// Fechas 'AAAA-MM-DD' desde `inicio` cada 7 días hasta `fin` (incluida).
function fechasSemanales(inicio, fin) {
  const salida = [];
  const d = new Date(`${inicio}T00:00:00Z`);
  const tope = new Date(`${fin}T00:00:00Z`);
  while (d <= tope) {
    salida.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return salida;
}

async function agregarSesiones(moduloId, entrada, admin, ip) {
  const modulo = await obtenerModulo(moduloId);
  const datos = validar(filaFechaSchema, entrada);

  let fechas = [datos.fecha];
  if (entrada.repetir_semanal_hasta !== undefined && entrada.repetir_semanal_hasta !== null && entrada.repetir_semanal_hasta !== '') {
    const hasta = validar(filaFechaSchema, { ...entrada, fecha: entrada.repetir_semanal_hasta }).fecha;
    if (hasta < datos.fecha) {
      throw errorHttp(400, 'La fecha final de la repetición no puede ser anterior a la fecha inicial');
    }
    fechas = fechasSemanales(datos.fecha, hasta);
  }

  const existentes = new Set(
    (
      await SesionClase.findAll({
        where: { modulo_id: modulo.id, fecha: fechas },
        attributes: ['fecha'],
      })
    ).map((s) => s.fecha)
  );
  const nuevas = fechas.filter((f) => !existentes.has(f));
  const omitidas = fechas.filter((f) => existentes.has(f));
  if (fechas.length === 1 && omitidas.length === 1) {
    throw errorHttp(409, `Ya existe una clase el ${fechaLegible(fechas[0])} en este módulo`);
  }
  if (nuevas.length === 0) {
    throw errorHttp(409, 'Todas las fechas de la repetición ya existen en este módulo');
  }

  let creadas;
  try {
    creadas = await sequelize.transaction((t) =>
      SesionClase.bulkCreate(
        nuevas.map((fecha) => ({
          modulo_id: modulo.id,
          fecha,
          hora_inicio: datos.hora_inicio,
          hora_fin: datos.hora_fin,
        })),
        { transaction: t }
      )
    );
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      throw errorHttp(409, 'Los datos cambiaron mientras se agregaban las fechas. Inténtalo de nuevo');
    }
    throw e;
  }

  await registrar(
    admin,
    'AGREGAR_FECHA',
    modulo,
    'sesion_clase',
    creadas.length === 1 ? creadas[0].id : null,
    creadas.length === 1
      ? `Fecha ${fechaLegible(nuevas[0])} ${horaCorta(datos.hora_inicio)}-${horaCorta(datos.hora_fin)}`
      : `${creadas.length} fechas semanales desde ${fechaLegible(nuevas[0])} hasta ${fechaLegible(nuevas[nuevas.length - 1])}` +
        (omitidas.length ? ` (${omitidas.length} ya existían)` : ''),
    ip
  );

  const hoy = hoyLaPaz();
  return {
    creadas: creadas.map((s) => sesionPublica(s, hoy, new Set())),
    omitidas,
  };
}

async function sesionDe(moduloId, sesionId) {
  const id = Number(sesionId);
  if (!Number.isInteger(id) || id <= 0) throw errorHttp(400, 'El identificador de la fecha no es válido');
  const sesion = await SesionClase.findOne({ where: { id, modulo_id: moduloId } });
  if (!sesion) throw errorHttp(404, 'Fecha de clase no encontrada en este módulo');
  return sesion;
}

async function editarSesion(moduloId, sesionId, entrada, admin, ip) {
  const modulo = await obtenerModulo(moduloId);
  const sesion = await sesionDe(modulo.id, sesionId);
  const datos = validar(filaFechaSchema, {
    fecha: entrada.fecha ?? sesion.fecha,
    hora_inicio: entrada.hora_inicio ?? sesion.hora_inicio,
    hora_fin: entrada.hora_fin ?? sesion.hora_fin,
  });

  const cambiaFecha = datos.fecha !== sesion.fecha;
  if (cambiaFecha) {
    const con = await sesionesConAsistencias([sesion.id]);
    if (con.has(sesion.id)) {
      throw errorHttp(409, 'Esta fecha ya tiene asistencias registradas: solo puedes cambiar su horario');
    }
    const repetida = await SesionClase.findOne({
      where: { modulo_id: modulo.id, fecha: datos.fecha, id: { [Op.ne]: sesion.id } },
    });
    if (repetida) throw errorHttp(409, `Ya existe una clase el ${fechaLegible(datos.fecha)} en este módulo`);
  }

  const antes = `${fechaLegible(sesion.fecha)} ${horaCorta(sesion.hora_inicio)}-${horaCorta(sesion.hora_fin)}`;
  const despues = `${fechaLegible(datos.fecha)} ${horaCorta(datos.hora_inicio)}-${horaCorta(datos.hora_fin)}`;
  if (antes !== despues) {
    await sesion.update({ fecha: datos.fecha, hora_inicio: datos.hora_inicio, hora_fin: datos.hora_fin });
    await registrar(admin, 'EDITAR_FECHA', modulo, 'sesion_clase', sesion.id, `${antes} → ${despues}`, ip);
  }
  const con = await sesionesConAsistencias([sesion.id]);
  return sesionPublica(sesion, hoyLaPaz(), con);
}

async function quitarSesion(moduloId, sesionId, admin, ip) {
  const modulo = await obtenerModulo(moduloId);
  const sesion = await sesionDe(modulo.id, sesionId);
  const con = await sesionesConAsistencias([sesion.id]);
  if (con.has(sesion.id)) {
    throw errorHttp(409, 'Esta fecha tiene asistencias registradas y no se puede quitar');
  }
  await sesion.destroy();
  await registrar(
    admin,
    'QUITAR_FECHA',
    modulo,
    'sesion_clase',
    sesion.id,
    `Fecha ${fechaLegible(sesion.fecha)} ${horaCorta(sesion.hora_inicio)}-${horaCorta(sesion.hora_fin)} quitada`,
    ip
  );
}

module.exports = {
  obtenerModulo,
  listarEstudiantes,
  agregarEstudiante,
  editarEstudiante,
  quitarEstudiante,
  listarSesiones,
  agregarSesiones,
  editarSesion,
  quitarSesion,
};
