// Router de autenticación: login, logout y "quién soy" (/me).
const express = require('express');
const { loginSchema } = require('../schemas/auth');
const { validar } = require('../schemas/validar');
const { usuarioPublico } = require('../schemas/usuario');
const { getCurrentUser } = require('../middleware/auth');
const authService = require('../services/authService');

const router = express.Router();

function ipDe(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || null;
}

// POST /api/auth/login  -> { access_token, token_type, usuario }
router.post('/login', async (req, res, next) => {
  try {
    const datos = validar(loginSchema, req.body);
    const { token, usuario } = await authService.login(datos, ipDe(req));
    res.json({
      access_token: token,
      token_type: 'bearer',
      usuario: usuarioPublico(usuario),
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/logout  (requiere token) -> revoca el token actual
router.post('/logout', getCurrentUser, async (req, res, next) => {
  try {
    await authService.logout(req.usuario, req.jwt, ipDe(req));
    res.json({ detalle: 'Sesión cerrada correctamente' });
  } catch (e) {
    next(e);
  }
});

// GET /api/auth/me  (requiere token) -> usuario del token
router.get('/me', getCurrentUser, (req, res) => {
  res.json({ usuario: usuarioPublico(req.usuario) });
});

module.exports = router;
