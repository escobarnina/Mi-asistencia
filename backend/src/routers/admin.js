// Panel de asistencias del administrador (RF-06 a RF-08, RF-17).
//
//   GET /api/admin/estudiantes?q=                       lista del módulo activo (RF-06)
//   GET /api/admin/asistencias?fecha=&estudiante=       vista general con totales (RF-08)
//   GET /api/admin/asistencias/exportar                 el mismo reporte en .xlsx (RF-17)
//   PUT /api/admin/asistencias/:sesionId/:estudianteId  corrección auditada (RF-07)
//
// El estado de cada fecha sale de services/estadoAsistencia.js (RF-04): una fecha
// pasada sin marca es FALTA sin que el administrador tenga que generar nada.
const express = require('express');
const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const { getCurrentUser, requireAdmin } = require('../middleware/auth');
const { errorHttp } = require('../core/errors');
const {
  hoyLaPaz,
  estadoDeFecha,
  esFaltaAutomatica,
  totalizar,
} = require('../services/estadoAsistencia');
const {
  sequelize,
  Usuario,
  Modulo,
  Inscripcion,
  SesionClase,
  Asistencia,
  AsistenciaCambio,
  Actividad,
} = require('../models');

const router = express.Router();

function ipDe(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || null;
}

function idPositivo(valor, etiqueta) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw errorHttp(400, `${etiqueta} no es válido`);
  }
  return id;
}

function validarFecha(fecha) {
  if (typeof fecha !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(fecha)) {
    throw errorHttp(400, 'La fecha debe tener el formato AAAA-MM-DD');
  }
  const fechaUtc = new Date(`${fecha}T00:00:00.000Z`);
  if (Number.isNaN(fechaUtc.getTime()) || fechaUtc.toISOString().slice(0, 10) !== fecha) {
    throw errorHttp(400, 'La fecha no es válida');
  }
  return fecha;
}

// Escapa \, % y _ para que el texto buscado se tome literalmente en un LIKE.
function textoLike(texto) {
  return texto.replace(/[\\%_]/g, '\\$&');
}

function leerBusqueda(valor, etiqueta) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (texto.length > 100) throw errorHttp(400, `${etiqueta} es demasiado largo`);
  return texto;
}

// Estudiantes cuyo nombre o número de registro contiene el texto (vacío = todos).
function filtroEstudiante(texto) {
  const where = { rol: 'ESTUDIANTE' };
  if (texto) {
    const like = `%${textoLike(texto)}%`;
    where[Op.or] = [{ nombre: { [Op.like]: like } }, { codigo: { [Op.like]: like } }];
  }
  return where;
}

function inscritosDelModulo(moduloId, texto) {
  return Inscripcion.findAll({
    where: { modulo_id: moduloId },
    include: [{
      model: Usuario,
      as: 'estudiante',
      attributes: ['id', 'codigo', 'nombre', 'email'],
      where: filtroEstudiante(texto),
      required: true,
    }],
    order: [[{ model: Usuario, as: 'estudiante' }, 'nombre', 'ASC']],
  });
}

// RF-06: estudiantes inscritos en el módulo activo.
async function listarEstudiantes({ q }) {
  const texto = leerBusqueda(q, 'El texto de búsqueda');
  const modulo = await Modulo.findOne({ where: { activo: true } });
  if (!modulo) return { modulo: null, total: 0, estudiantes: [] };
  const inscripciones = await inscritosDelModulo(modulo.id, texto);
  const estudiantes = inscripciones.map((i) => i.estudiante.get({ plain: true }));
  return {
    modulo: { id: modulo.id, nombre: modulo.nombre, gestion: modulo.gestion },
    total: estudiantes.length,
    estudiantes,
  };
}

// RF-08: sesiones del módulo activo con el estado de cada inscrito y los totales.
async function obtenerReporte({ fecha, estudiante }) {
  const hoy = hoyLaPaz();
  const vacio = { hoy, totales: totalizar([]), sesiones: [] };
  const modulo = await Modulo.findOne({ where: { activo: true } });
  if (!modulo) return { modulo: null, ...vacio };

  const whereSesion = { modulo_id: modulo.id };
  if (fecha) whereSesion.fecha = validarFecha(fecha);
  const texto = leerBusqueda(estudiante, 'El filtro de estudiante');
  const sesionesDb = await SesionClase.findAll({
    where: whereSesion,
    order: [['fecha', 'ASC'], ['id', 'ASC']],
  });
  const moduloPublico = { id: modulo.id, nombre: modulo.nombre, gestion: modulo.gestion };
  if (sesionesDb.length === 0) return { modulo: moduloPublico, ...vacio };

  const inscripciones = await inscritosDelModulo(modulo.id, texto);
  const estudiantes = inscripciones.map((inscripcion) => inscripcion.estudiante);
  const idsSesion = sesionesDb.map((sesion) => sesion.id);
  const idsEstudiante = estudiantes.map((est) => est.id);
  const asistenciasDb = idsEstudiante.length
    ? await Asistencia.findAll({
        where: {
          sesion_id: { [Op.in]: idsSesion },
          estudiante_id: { [Op.in]: idsEstudiante },
        },
      })
    : [];
  const porClave = new Map(asistenciasDb.map((asistencia) => [
    `${asistencia.sesion_id}:${asistencia.estudiante_id}`,
    asistencia,
  ]));

  const sesiones = sesionesDb.map((sesionDb) => {
    const sesion = sesionDb.get({ plain: true });
    const filas = estudiantes.map((estudianteDb) => {
      // El registro guardado (marca o corrección del admin) siempre prevalece.
      const asistencia = porClave.get(`${sesion.id}:${estudianteDb.id}`);
      const automatica = esFaltaAutomatica(sesion.fecha, hoy, asistencia);
      return {
        asistencia_id: asistencia ? asistencia.id : null,
        estudiante: estudianteDb.get({ plain: true }),
        estado: estadoDeFecha(sesion.fecha, hoy, asistencia),
        hora_registro: asistencia ? asistencia.hora_registro : null,
        origen: asistencia ? asistencia.origen : automatica ? 'SISTEMA' : null,
        automatica,
      };
    });
    const { presentes, faltas, pendientes } = totalizar(filas.map((fila) => fila.estado));
    return { ...sesion, presentes, faltas, pendientes, asistencias: filas };
  });
  const totales = totalizar(
    sesiones.flatMap((sesion) => sesion.asistencias.map((fila) => fila.estado))
  );
  return { modulo: moduloPublico, hoy, totales, sesiones };
}

const NOMBRE_ESTADO = {
  PRESENTE: 'Presente',
  FALTA: 'Falta',
  PENDIENTE: 'Pendiente',
  PROXIMA: 'Pendiente',
};

function horaEnLaPaz(valor) {
  if (!valor) return '';
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(valor));
}

// RF-17: arma el .xlsx con los mismos estados que ve el administrador en pantalla.
async function reporteAXlsx(reporte) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Asistencias');
  hoja.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Número de registro', key: 'codigo', width: 20 },
    { header: 'Nombre', key: 'nombre', width: 32 },
    { header: 'Correo electrónico', key: 'email', width: 32 },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Hora de registro', key: 'hora', width: 16 },
    { header: 'Origen', key: 'origen', width: 12 },
  ];
  hoja.getRow(1).font = { bold: true };
  for (const sesion of reporte.sesiones) {
    for (const fila of sesion.asistencias) {
      hoja.addRow({
        fecha: sesion.fecha,
        codigo: fila.estudiante.codigo || '',
        nombre: fila.estudiante.nombre,
        email: fila.estudiante.email,
        estado: NOMBRE_ESTADO[fila.estado] || fila.estado,
        hora: horaEnLaPaz(fila.hora_registro),
        origen: fila.origen || '',
      });
    }
  }
  // Los textos van como texto con formato: ninguna celda se interpreta como fórmula.
  hoja.eachRow((fila) => fila.eachCell((celda) => {
    if (typeof celda.value === 'string') {
      celda.value = { richText: [{ text: celda.value }] };
    }
  }));
  return libro.xlsx.writeBuffer();
}

router.get('/estudiantes', getCurrentUser, requireAdmin, async (req, res, next) => {
  try {
    res.json(await listarEstudiantes(req.query));
  } catch (e) {
    next(e);
  }
});

router.get('/asistencias/exportar', getCurrentUser, requireAdmin, async (req, res, next) => {
  try {
    const reporte = await obtenerReporte(req.query);
    await Actividad.create({
      modulo_id: reporte.modulo ? reporte.modulo.id : null,
      usuario_id: req.usuario.id,
      accion: 'EXPORTAR',
      entidad: 'ASISTENCIA',
      detalle: 'Exportación de asistencias del módulo activo',
      ip: ipDe(req),
    });
    const fechaArchivo = req.query.fecha ? validarFecha(req.query.fecha) : hoyLaPaz();
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="asistencias-${fechaArchivo}.xlsx"`);
    res.send(Buffer.from(await reporteAXlsx(reporte)));
  } catch (e) {
    next(e);
  }
});

router.get('/asistencias', getCurrentUser, requireAdmin, async (req, res, next) => {
  try {
    res.json(await obtenerReporte(req.query));
  } catch (e) {
    next(e);
  }
});

router.put('/asistencias/:sesionId/:estudianteId', getCurrentUser, requireAdmin, async (req, res, next) => {
  try {
    const sesionId = idPositivo(req.params.sesionId, 'El identificador de sesión');
    const estudianteId = idPositivo(req.params.estudianteId, 'El identificador de estudiante');
    const { estado, motivo } = req.body || {};
    if (!['PRESENTE', 'FALTA'].includes(estado)) {
      throw errorHttp(400, 'El estado debe ser PRESENTE o FALTA');
    }
    if (typeof motivo !== 'string' || !motivo.trim() || motivo.trim().length > 255) {
      throw errorHttp(400, 'El motivo es obligatorio y debe tener como máximo 255 caracteres');
    }

    const resultado = await sequelize.transaction(async (transaction) => {
      const modulo = await Modulo.findOne({
        where: { activo: true }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!modulo) throw errorHttp(404, 'No hay un módulo activo');
      const sesion = await SesionClase.findOne({
        where: { id: sesionId, modulo_id: modulo.id }, transaction,
      });
      if (!sesion) throw errorHttp(404, 'La sesión no pertenece al módulo activo');
      const inscripcion = await Inscripcion.findOne({
        where: { modulo_id: modulo.id, estudiante_id: estudianteId }, transaction,
      });
      if (!inscripcion) throw errorHttp(404, 'El estudiante no está inscrito en el módulo activo');

      let asistencia = await Asistencia.findOne({
        where: { sesion_id: sesion.id, estudiante_id: estudianteId },
        transaction, lock: transaction.LOCK.UPDATE,
      });
      // Lo que el administrador veía: el estado guardado o, si la fecha ya pasó
      // sin marca, la falta automática (RF-04). Hoy o futuro sin marca = sin estado previo.
      const faltaAutomatica = esFaltaAutomatica(sesion.fecha, hoyLaPaz(), asistencia);
      const estadoAnterior = asistencia ? asistencia.estado : faltaAutomatica ? 'FALTA' : null;
      if (estadoAnterior === estado) return { asistencia, sin_cambios: true };
      if (asistencia) {
        await asistencia.update(
          { estado, origen: 'ADMIN', ...(estado === 'FALTA' ? { hora_registro: null } : {}) },
          { transaction }
        );
      } else {
        asistencia = await Asistencia.create({
          sesion_id: sesion.id,
          estudiante_id: estudianteId,
          estado,
          hora_registro: null,
          origen: 'ADMIN',
          ip_registro: ipDe(req),
        }, { transaction });
      }
      await AsistenciaCambio.create({
        asistencia_id: asistencia.id,
        usuario_id: req.usuario.id,
        estado_anterior: estadoAnterior,
        estado_nuevo: estado,
        motivo: motivo.trim(),
      }, { transaction });
      await Actividad.create({
        modulo_id: modulo.id,
        usuario_id: req.usuario.id,
        accion: 'MODIFICAR_ASISTENCIA',
        entidad: 'ASISTENCIA',
        entidad_id: asistencia.id,
        detalle: `${estadoAnterior || 'PENDIENTE'} → ${estado}. Motivo: ${motivo.trim()}`,
        ip: ipDe(req),
      }, { transaction });
      return { asistencia, sin_cambios: false };
    });

    res.json({
      asistencia: resultado.asistencia,
      sin_cambios: resultado.sin_cambios,
      detalle: resultado.sin_cambios ? 'La asistencia ya tenía ese estado' : 'Asistencia corregida',
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
