// Router de asistencia del estudiante (RF-03 a RF-05). Solo ESTUDIANTE.
//
//   GET  /api/asistencia/hoy             -> clase de hoy y si puede marcar
//   POST /api/asistencia/marcar          -> marca PRESENTE en la clase de hoy
//   GET  /api/asistencia/mis-asistencias -> historial con resumen
const express = require('express');
const { getCurrentUser, requireEstudiante } = require('../middleware/auth');
const asistenciaService = require('../services/asistenciaService');

const router = express.Router();

function ipDe(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || null;
}

router.use(getCurrentUser, requireEstudiante);

router.get('/hoy', async (req, res, next) => {
  try {
    res.json(await asistenciaService.estadoHoy(req.usuario));
  } catch (e) {
    next(e);
  }
});

router.post('/marcar', async (req, res, next) => {
  try {
    const resultado = await asistenciaService.marcar(req.usuario, ipDe(req));
    res.status(201).json({
      detalle: 'Asistencia registrada correctamente',
      ...resultado,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/mis-asistencias', async (req, res, next) => {
  try {
    res.json(await asistenciaService.historial(req.usuario));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
