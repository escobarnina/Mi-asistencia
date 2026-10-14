// Lógica de asistencia del estudiante (RF-03, RF-04, RF-05).
// Regla clave: solo se marca el DÍA de la clase (todo el día, sin tolerancias),
// una sola vez por estudiante y fecha de clase. "Hoy" es la fecha de La Paz.
const { Modulo, Inscripcion, SesionClase, Asistencia } = require('../models');
const { errorHttp } = require('../core/errors');
const env = require('../config/env');
const actividadService = require('./actividadService');

// Fecha de hoy en La Paz como 'AAAA-MM-DD' (el formato de sesion_clase.fecha).
function hoyLaPaz(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

// Módulo activo en el que está inscrito el estudiante. Si no hay módulo
// activo o no está inscrito, no puede usar la asistencia (403).
async function moduloDelEstudiante(estudiante) {
  const modulo = await Modulo.findOne({ where: { activo: true } });
  const inscrito =
    modulo &&
    (await Inscripcion.findOne({
      where: { modulo_id: modulo.id, estudiante_id: estudiante.id },
    }));
  if (!inscrito) {
    throw errorHttp(403, 'No estás inscrito en el módulo activo');
  }
  return modulo;
}

function sesionPublica(s) {
  return {
    id: s.id,
    fecha: s.fecha,
    hora_inicio: s.hora_inicio,
    hora_fin: s.hora_fin,
    cerrada: s.cerrada,
  };
}

function asistenciaPublica(a) {
  return {
    id: a.id,
    estado: a.estado,
    hora_registro: a.hora_registro,
    origen: a.origen,
  };
}

// Por qué no se puede marcar hoy (null = sí se puede).
function motivoNoMarcar(sesion, asistencia) {
  if (!sesion) return 'Hoy no hay clase programada';
  if (asistencia) return 'Ya registraste tu asistencia de hoy';
  if (sesion.cerrada) return 'La clase de hoy ya fue cerrada';
  return null;
}

async function buscarHoy(estudiante) {
  const modulo = await moduloDelEstudiante(estudiante);
  const fecha = hoyLaPaz();
  const sesion = await SesionClase.findOne({
    where: { modulo_id: modulo.id, fecha },
  });
  const asistencia =
    sesion &&
    (await Asistencia.findOne({
      where: { sesion_id: sesion.id, estudiante_id: estudiante.id },
    }));
  return { fecha, sesion, asistencia };
}

// RF-03: estado de hoy, para saber si el botón se habilita.
async function estadoHoy(estudiante) {
  const { fecha, sesion, asistencia } = await buscarHoy(estudiante);
  const motivo = motivoNoMarcar(sesion, asistencia);
  return {
    fecha,
    sesion: sesion ? sesionPublica(sesion) : null,
    asistencia: asistencia ? asistenciaPublica(asistencia) : null,
    puedeMarcar: motivo === null,
    motivo,
  };
}

// RF-03: marca PRESENTE en la clase de hoy con la hora real.
async function marcar(estudiante, ip) {
  const { sesion, asistencia } = await buscarHoy(estudiante);
  const motivo = motivoNoMarcar(sesion, asistencia);
  if (motivo) throw errorHttp(409, motivo);

  let nueva;
  try {
    nueva = await Asistencia.create({
      sesion_id: sesion.id,
      estudiante_id: estudiante.id,
      estado: 'PRESENTE',
      hora_registro: new Date(),
      origen: 'ESTUDIANTE',
      ip_registro: ip,
    });
  } catch (e) {
    // Doble clic: la base (único sesion+estudiante) impide la segunda marca.
    if (e.name === 'SequelizeUniqueConstraintError') {
      throw errorHttp(409, 'Ya registraste tu asistencia de hoy');
    }
    throw e;
  }

  await actividadService.registrar(estudiante.id, 'MARCAR_ASISTENCIA', {
    entidad: 'asistencia',
    entidadId: nueva.id,
    detalle: `Clase del ${sesion.fecha}`,
    ip,
    moduloId: sesion.modulo_id,
  });

  return { sesion: sesionPublica(sesion), asistencia: asistenciaPublica(nueva) };
}

// RF-05: todas las fechas del módulo activo con el estado del estudiante.
// RF-04: una fecha pasada sin marca se muestra como FALTA (aunque el admin
// todavía no haya generado las faltas). Hoy sin marca = PENDIENTE; futuro = PROXIMA.
async function historial(estudiante) {
  const modulo = await moduloDelEstudiante(estudiante);
  const hoy = hoyLaPaz();

  const sesiones = await SesionClase.findAll({
    where: { modulo_id: modulo.id },
    order: [['fecha', 'ASC']],
  });
  const asistencias = await Asistencia.findAll({
    where: { estudiante_id: estudiante.id, sesion_id: sesiones.map((s) => s.id) },
  });
  const porSesion = new Map(asistencias.map((a) => [a.sesion_id, a]));

  const fechas = sesiones.map((s) => {
    const a = porSesion.get(s.id);
    let estado;
    if (a) estado = a.estado;
    else if (s.fecha < hoy) estado = 'FALTA';
    else if (s.fecha === hoy) estado = 'PENDIENTE';
    else estado = 'PROXIMA';
    return {
      ...sesionPublica(s),
      estado,
      hora_registro: a ? a.hora_registro : null,
    };
  });

  const contar = (estado) => fechas.filter((f) => f.estado === estado).length;
  return {
    modulo: { id: modulo.id, nombre: modulo.nombre, gestion: modulo.gestion },
    hoy,
    fechas,
    resumen: {
      total: fechas.length,
      presentes: contar('PRESENTE'),
      faltas: contar('FALTA'),
      pendientes: contar('PENDIENTE') + contar('PROXIMA'),
    },
  };
}

module.exports = { hoyLaPaz, estadoHoy, marcar, historial };
