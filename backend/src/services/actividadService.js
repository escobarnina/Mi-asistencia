// Servicio de historial de actividad (RF-09).
// registrar(...) deja un registro en la tabla actividad y le asigna
// automáticamente el módulo activo (si no se indica otro).
// El resto del equipo lo usará para sus propias acciones.
const { Op } = require('sequelize');
const { Actividad, Modulo, Usuario } = require('../models');

async function moduloActivoId() {
  const modulo = await Modulo.findOne({ where: { activo: true } });
  return modulo ? modulo.id : null;
}

async function registrar(
  usuarioId,
  accion,
  { entidad = null, entidadId = null, detalle = null, ip = null, moduloId } = {}
) {
  const modulo_id = moduloId !== undefined ? moduloId : await moduloActivoId();
  return Actividad.create({
    modulo_id,
    usuario_id: usuarioId,
    accion,
    entidad,
    entidad_id: entidadId,
    detalle,
    ip,
  });
}

async function listar({
  moduloId,
  accion,
  usuarioId,
  desde,
  hasta,
  pagina = 1,
  limite = 20,
} = {}) {
  const page = Math.max(1, Number(pagina) || 1);
  const limit = Math.min(100, Math.max(1, Number(limite) || 20));
  const offset = (page - 1) * limit;

  const where = {};

  if (moduloId) {
    where.modulo_id = Number(moduloId);
  }

  if (accion) {
    where.accion = accion;
  }

  if (usuarioId) {
    where.usuario_id = Number(usuarioId);
  }

  if (desde || hasta) {
    where.creado_en = {};
    if (desde) {
      where.creado_en[Op.gte] = new Date(desde);
    }
    if (hasta) {
      // Ajustar a fin de día si es solo fecha YYYY-MM-DD
      const fechaHasta = new Date(hasta);
      if (hasta.length === 10) {
        fechaHasta.setHours(23, 59, 59, 999);
      }
      where.creado_en[Op.lte] = fechaHasta;
    }
  }

  const { count, rows } = await Actividad.findAndCountAll({
    where,
    include: [
      {
        model: Modulo,
        attributes: ['id', 'nombre', 'gestion'],
      },
      {
        model: Usuario,
        attributes: ['id', 'nombre', 'email', 'codigo', 'rol'],
      },
    ],
    order: [['creado_en', 'DESC']],
    limit,
    offset,
  });

  return {
    total: count,
    pagina: page,
    limite: limit,
    totalPaginas: Math.ceil(count / limit) || 1,
    actividades: rows,
  };
}

module.exports = { registrar, moduloActivoId, listar };
