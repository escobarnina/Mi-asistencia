// Servicio de historial de actividad (RF-09).
// registrar(...) deja un registro en la tabla actividad y le asigna
// automáticamente el módulo activo (si no se indica otro).
// El resto del equipo lo usará para sus propias acciones.
const { Actividad, Modulo } = require('../models');

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

module.exports = { registrar, moduloActivoId };
