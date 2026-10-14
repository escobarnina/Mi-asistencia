// Router de módulos (RF-13): gestión y activación. Solo uno activo a la vez.
//
//   GET   /api/modulos             (ADMIN) lista todos, con # de inscritos
//   GET   /api/modulos/activo      (cualquier usuario autenticado)
//   GET   /api/modulos/:id         (ADMIN)
//   POST  /api/modulos             (ADMIN) crea (queda inactivo)
//   PATCH /api/modulos/:id         (ADMIN) edita nombre y/o gestión
//   POST  /api/modulos/:id/activar (ADMIN) activa y desactiva el resto
const express = require('express');
const { getCurrentUser, requireAdmin } = require('../middleware/auth');
const { validar } = require('../schemas/validar');
const {
  crearModuloSchema,
  editarModuloSchema,
} = require('../schemas/modulo');
const { errorHttp } = require('../core/errors');
const moduloService = require('../services/moduloService');

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

// GET /api/modulos/activo -> { modulo } (null si no hay ninguno activo).
// Va antes de /:id para que "activo" no se interprete como un id.
router.get('/activo', getCurrentUser, async (req, res, next) => {
  try {
    res.json({ modulo: await moduloService.obtenerActivo() });
  } catch (e) {
    next(e);
  }
});

router.get('/', getCurrentUser, requireAdmin, async (req, res, next) => {
  try {
    res.json({ modulos: await moduloService.listar() });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', getCurrentUser, requireAdmin, async (req, res, next) => {
  try {
    res.json({ modulo: await moduloService.obtener(idDe(req)) });
  } catch (e) {
    next(e);
  }
});

router.post('/', getCurrentUser, requireAdmin, async (req, res, next) => {
  try {
    const datos = validar(crearModuloSchema, req.body);
    const modulo = await moduloService.crear(datos, req.usuario);
    res.status(201).json({ modulo });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', getCurrentUser, requireAdmin, async (req, res, next) => {
  try {
    const id = idDe(req);
    const datos = validar(editarModuloSchema, req.body);
    res.json({ modulo: await moduloService.editar(id, datos) });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/:id/activar',
  getCurrentUser,
  requireAdmin,
  async (req, res, next) => {
    try {
      const modulo = await moduloService.activar(
        idDe(req),
        req.usuario,
        ipDe(req)
      );
      res.json({ modulo, detalle: 'Módulo activado correctamente' });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
