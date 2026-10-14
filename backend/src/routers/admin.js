// Panel de asistencias del administrador (RF-06 a RF-08, RF-17).
const express = require('express');
const { Op } = require('sequelize');
const { getCurrentUser, requireAdmin } = require('../middleware/auth');
const { errorHttp } = require('../core/errors');
const env = require('../config/env');
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

function fechaHoraLocal() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  return {
    fecha: `${valores.year}-${valores.month}-${valores.day}`,
    hora: `${valores.hour}:${valores.minute}:${valores.second}`,
  };
}

async function obtenerReporte({ fecha, estudiante }) {
  const modulo = await Modulo.findOne({ where: { activo: true } });
  if (!modulo) return { modulo: null, sesiones: [] };

  const whereSesion = { modulo_id: modulo.id };
  if (fecha) whereSesion.fecha = validarFecha(fecha);
  const sesionesDb = await SesionClase.findAll({
    where: whereSesion,
    order: [['fecha', 'ASC'], ['id', 'ASC']],
  });
  const moduloPublico = { id: modulo.id, nombre: modulo.nombre, gestion: modulo.gestion };
  if (sesionesDb.length === 0) return { modulo: moduloPublico, sesiones: [] };

  const texto = typeof estudiante === 'string' ? estudiante.trim() : '';
  if (texto.length > 100) throw errorHttp(400, 'El filtro de estudiante es demasiado largo');
  const whereEstudiante = { rol: 'ESTUDIANTE' };
  if (texto) {
    whereEstudiante[Op.or] = [
      { nombre: { [Op.like]: `%${texto}%` } },
      { codigo: { [Op.like]: `%${texto}%` } },
    ];
  }
  const inscripciones = await Inscripcion.findAll({
    where: { modulo_id: modulo.id },
    include: [{
      model: Usuario,
      as: 'estudiante',
      attributes: ['id', 'codigo', 'nombre', 'email'],
      where: whereEstudiante,
      required: true,
    }],
    order: [[{ model: Usuario, as: 'estudiante' }, 'nombre', 'ASC']],
  });
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
      const asistencia = porClave.get(`${sesion.id}:${estudianteDb.id}`);
      return {
        asistencia_id: asistencia ? asistencia.id : null,
        estudiante: estudianteDb.get ? estudianteDb.get({ plain: true }) : estudianteDb,
        estado: asistencia ? asistencia.estado : 'SIN_REGISTRO',
        hora_registro: asistencia ? asistencia.hora_registro : null,
        origen: asistencia ? asistencia.origen : null,
      };
    });
    return {
      ...sesion,
      presentes: filas.filter((fila) => fila.estado === 'PRESENTE').length,
      faltas: filas.filter((fila) => fila.estado === 'FALTA').length,
      sin_registro: filas.filter((fila) => fila.estado === 'SIN_REGISTRO').length,
      asistencias: filas,
    };
  });
  return { modulo: moduloPublico, sesiones };
}

function csvCelda(valor) {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  const primerCaracter = texto[0];
  if (['=', '+', '-', '@', String.fromCharCode(9), String.fromCharCode(13)].includes(primerCaracter)) {
    texto = `'${texto}`;
  }
  return `"${texto.replace(/"/g, '""')}"`;
}

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

function reporteACsv(reporte) {
  const filas = [[
    'Fecha', 'Número de registro', 'Nombre', 'Correo electrónico',
    'Estado', 'Hora de registro', 'Origen',
  ]];
  for (const sesion of reporte.sesiones) {
    for (const fila of sesion.asistencias) {
      filas.push([
        sesion.fecha, fila.estudiante.codigo, fila.estudiante.nombre,
        fila.estudiante.email, fila.estado, horaEnLaPaz(fila.hora_registro), fila.origen,
      ]);
    }
  }
  const salto = String.fromCharCode(13, 10);
  return `${String.fromCharCode(0xfeff)}${filas.map((fila) => fila.map(csvCelda).join(',')).join(salto)}${salto}`;
}

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
    const fechaArchivo = req.query.fecha ? validarFecha(req.query.fecha) : fechaHoraLocal().fecha;
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="asistencias-${fechaArchivo}.csv"`);
    res.send(reporteACsv(reporte));
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
      const estadoAnterior = asistencia ? asistencia.estado : null;
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
        detalle: `${estadoAnterior || 'SIN_REGISTRO'} → ${estado}. Motivo: ${motivo.trim()}`,
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

router.post('/faltas/generar', getCurrentUser, requireAdmin, async (req, res, next) => {
  try {
    const ahora = fechaHoraLocal();
    const resultado = await sequelize.transaction(async (transaction) => {
      const modulo = await Modulo.findOne({
        where: { activo: true }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!modulo) throw errorHttp(404, 'No hay un módulo activo');
      const sesion = await SesionClase.findOne({
        where: { modulo_id: modulo.id, fecha: ahora.fecha }, transaction,
      });
      if (!sesion) throw errorHttp(404, 'No hay una sesión de clase para hoy');
      if (String(sesion.hora_fin) > ahora.hora) {
        throw errorHttp(409, 'Las faltas se generan cuando termina la sesión');
      }

      const inscripciones = await Inscripcion.findAll({
        where: { modulo_id: modulo.id }, attributes: ['estudiante_id'], transaction,
      });
      const idsEstudiante = inscripciones.map((inscripcion) => inscripcion.estudiante_id);
      const registradas = idsEstudiante.length
        ? await Asistencia.findAll({
            where: { sesion_id: sesion.id, estudiante_id: { [Op.in]: idsEstudiante } },
            attributes: ['estudiante_id'], transaction, lock: transaction.LOCK.UPDATE,
          })
        : [];
      const yaRegistrados = new Set(registradas.map((asistencia) => asistencia.estudiante_id));
      const faltas = idsEstudiante
        .filter((estudianteId) => !yaRegistrados.has(estudianteId))
        .map((estudianteId) => ({
          sesion_id: sesion.id,
          estudiante_id: estudianteId,
          estado: 'FALTA',
          hora_registro: null,
          origen: 'SISTEMA',
        }));
      if (faltas.length) await Asistencia.bulkCreate(faltas, { transaction });
      await Actividad.create({
        modulo_id: modulo.id,
        usuario_id: req.usuario.id,
        accion: 'GENERAR_FALTAS',
        entidad: 'SESION_CLASE',
        entidad_id: sesion.id,
        detalle: `Faltas generadas: ${faltas.length}`,
        ip: ipDe(req),
      }, { transaction });
      return { generadas: faltas.length, fecha: ahora.fecha };
    });

    res.json({ ...resultado, detalle: `Se generaron ${resultado.generadas} faltas` });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
