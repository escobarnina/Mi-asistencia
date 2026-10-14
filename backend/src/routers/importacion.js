// Router de importación desde Excel (RF-11, RF-12, RF-16). Solo ADMIN.
//
//   POST /api/importacion/estudiantes/revisar  (archivo) -> vista previa, no guarda
//   POST /api/importacion/estudiantes          (archivo) -> guarda (todo o nada)
//   POST /api/importacion/fechas/revisar       (archivo) -> vista previa, no guarda
//   POST /api/importacion/fechas               (archivo) -> guarda (todo o nada)
//
// Todos aceptan `modulo_id` (campo del formulario o query) para importar a un módulo
// nuevo que aún no está activo (RF-13). Sin él, usan el módulo activo.
const express = require('express');
const multer = require('multer');
const { getCurrentUser, requireAdmin } = require('../middleware/auth');
const { errorHttp } = require('../core/errors');
const importacionService = require('../services/importacionService');

const router = express.Router();

const MAX_MB = 5;

// Módulo destino pedido por el cliente (undefined = el activo).
function moduloDe(req) {
  const valor = (req.body && req.body.modulo_id) ?? (req.query && req.query.modulo_id);
  return valor === '' ? undefined : valor;
}

function ipDe(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || null;
}

// El archivo se guarda en memoria (req.file.buffer): solo se lee una vez.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!/\.xlsx$/i.test(file.originalname)) {
      return cb(errorHttp(400, 'Solo se aceptan archivos Excel (.xlsx)'));
    }
    cb(null, true);
  },
});

// Recibe el campo "archivo" y traduce los errores de multer a mensajes claros.
function recibirArchivo(req, res, next) {
  upload.single('archivo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const mensaje =
        err.code === 'LIMIT_FILE_SIZE'
          ? `El archivo supera el tamaño máximo de ${MAX_MB} MB`
          : 'No se pudo recibir el archivo';
      return next(errorHttp(400, mensaje));
    }
    if (err) return next(err);
    if (!req.file) return next(errorHttp(400, 'Debes adjuntar un archivo Excel'));
    next();
  });
}

router.post(
  '/estudiantes/revisar',
  getCurrentUser,
  requireAdmin,
  recibirArchivo,
  async (req, res, next) => {
    try {
      const resultado = await importacionService.revisarEstudiantes(req.file.buffer, moduloDe(req));
      res.json({ archivo: req.file.originalname, ...resultado });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/estudiantes',
  getCurrentUser,
  requireAdmin,
  recibirArchivo,
  async (req, res, next) => {
    try {
      const resultado = await importacionService.importarEstudiantes(
        req.file.buffer,
        req.file.originalname,
        req.usuario,
        ipDe(req),
        moduloDe(req)
      );
      if (resultado.errores) {
        return res.status(400).json({
          detalle: 'El archivo tiene errores. Corrígelos y vuelve a intentarlo',
          errores: resultado.errores,
        });
      }
      res.status(201).json({
        detalle: `Se importaron ${resultado.inscritos} estudiantes correctamente`,
        ...resultado,
      });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/fechas/revisar',
  getCurrentUser,
  requireAdmin,
  recibirArchivo,
  async (req, res, next) => {
    try {
      const resultado = await importacionService.revisarFechas(req.file.buffer, moduloDe(req));
      res.json({ archivo: req.file.originalname, ...resultado });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/fechas',
  getCurrentUser,
  requireAdmin,
  recibirArchivo,
  async (req, res, next) => {
    try {
      const resultado = await importacionService.importarFechas(
        req.file.buffer,
        req.file.originalname,
        req.usuario,
        ipDe(req),
        moduloDe(req)
      );
      if (resultado.errores) {
        return res.status(400).json({
          detalle: 'El archivo tiene errores. Corrígelos y vuelve a intentarlo',
          errores: resultado.errores,
        });
      }
      res.status(201).json({
        detalle: `Se importaron ${resultado.creadas} fechas de clase correctamente`,
        ...resultado,
      });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
