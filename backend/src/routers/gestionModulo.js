// Gestión editable de un módulo (Fase B). Solo ADMIN. Se monta bajo /api/modulos.
//
//   GET    /:id/estudiantes?buscar=&pagina=&limite=   lista paginada de inscritos
//   POST   /:id/estudiantes                           agrega uno a mano
//   PUT    /:id/estudiantes/:estudianteId             edita nombre, correo o registro
//   DELETE /:id/estudiantes/:estudianteId[?forzar=true]  quita la inscripción
//   GET    /:id/sesiones                              fechas con estado y si tienen asistencias
//   POST   /:id/sesiones                              agrega una fecha (o varias, semanalmente)
//   PUT    /:id/sesiones/:sesionId                    edita fecha u horario
//   DELETE /:id/sesiones/:sesionId                    quita una fecha sin asistencias
const express = require('express');
const { getCurrentUser, requireAdmin } = require('../middleware/auth');
const { errorHttp } = require('../core/errors');
const gestion = require('../services/gestionModuloService');

const router = express.Router();

function ipDe(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || null;
}

function idDe(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw errorHttp(400, 'El identificador del módulo no es válido');
  }
  return id;
}

// Exige sesión de administrador y envuelve el manejador async para pasar los errores
// al manejador central. Se aplica por ruta para no interceptar otras rutas de /api/modulos.
const ruta = (fn) => [
  getCurrentUser,
  requireAdmin,
  async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  },
];

router.get('/:id/estudiantes', ruta(async (req, res) => {
  res.json(await gestion.listarEstudiantes(idDe(req), req.query));
}));

router.post('/:id/estudiantes', ruta(async (req, res) => {
  const estudiante = await gestion.agregarEstudiante(idDe(req), req.body || {}, req.usuario, ipDe(req));
  res.status(201).json({ estudiante });
}));

router.put('/:id/estudiantes/:estudianteId', ruta(async (req, res) => {
  const estudiante = await gestion.editarEstudiante(
    idDe(req),
    req.params.estudianteId,
    req.body || {},
    req.usuario,
    ipDe(req)
  );
  res.json({ estudiante });
}));

router.delete('/:id/estudiantes/:estudianteId', ruta(async (req, res) => {
  const forzar = String(req.query.forzar).toLowerCase() === 'true';
  const resultado = await gestion.quitarEstudiante(
    idDe(req),
    req.params.estudianteId,
    { forzar },
    req.usuario,
    ipDe(req)
  );
  res.json({ detalle: 'Estudiante quitado del módulo', ...resultado });
}));

router.get('/:id/sesiones', ruta(async (req, res) => {
  res.json(await gestion.listarSesiones(idDe(req)));
}));

router.post('/:id/sesiones', ruta(async (req, res) => {
  const resultado = await gestion.agregarSesiones(idDe(req), req.body || {}, req.usuario, ipDe(req));
  res.status(201).json(resultado);
}));

router.put('/:id/sesiones/:sesionId', ruta(async (req, res) => {
  const sesion = await gestion.editarSesion(
    idDe(req),
    req.params.sesionId,
    req.body || {},
    req.usuario,
    ipDe(req)
  );
  res.json({ sesion });
}));

router.delete('/:id/sesiones/:sesionId', ruta(async (req, res) => {
  await gestion.quitarSesion(idDe(req), req.params.sesionId, req.usuario, ipDe(req));
  res.json({ detalle: 'Fecha quitada del módulo' });
}));

module.exports = router;
