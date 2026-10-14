const express = require('express');
const { getCurrentUser, requireAdmin } = require('../middleware/auth');
const actividadService = require('../services/actividadService');

// RF-10: consulta del historial de actividad (filtros por módulo/fecha/acción/usuario y paginación).
const router = express.Router();

router.get('/', getCurrentUser, requireAdmin, async (req, res, next) => {
  try {
    const { modulo_id, accion, usuario_id, desde, hasta, pagina, limite } = req.query;

    const resultado = await actividadService.listar({
      moduloId: modulo_id,
      accion,
      usuarioId: usuario_id,
      desde,
      hasta,
      pagina,
      limite,
    });

    res.json(resultado);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
