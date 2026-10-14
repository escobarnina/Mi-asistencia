const express = require('express');
const { getCurrentUser, requireAdmin } = require('../middleware/auth');
const actividadService = require('../services/actividadService');

// RF-10: historial de actividad del módulo activo. Solo ADMIN (403 para estudiantes).
// Filtros: estudiante (nombre o número de registro), fecha | desde | hasta
// (días de La Paz), accion. Con paginación (pagina, limite).
const router = express.Router();

router.get('/', getCurrentUser, requireAdmin, async (req, res, next) => {
  try {
    const { estudiante, fecha, desde, hasta, accion, pagina, limite } = req.query;

    const resultado = await actividadService.listar({
      estudiante,
      fecha,
      desde,
      hasta,
      accion,
      pagina,
      limite,
    });

    res.json(resultado);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
