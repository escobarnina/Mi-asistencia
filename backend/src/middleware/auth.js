// Middlewares de autenticación y autorización por rol.
const { verificarToken } = require('../core/security');
const { errorHttp } = require('../core/errors');
const { Usuario, TokenRevocado } = require('../models');

// Verifica el token del header Authorization, comprueba que no esté revocado
// (logout) y que el usuario exista y esté activo. Deja el usuario en req.usuario.
async function getCurrentUser(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [tipo, token] = header.split(' ');
    if (tipo !== 'Bearer' || !token) {
      throw errorHttp(401, 'No autenticado');
    }

    let payload;
    try {
      payload = verificarToken(token);
    } catch (e) {
      throw errorHttp(401, 'Token inválido o expirado');
    }

    // ¿El token fue revocado por un logout?
    const revocado = await TokenRevocado.findByPk(payload.jti);
    if (revocado) {
      throw errorHttp(401, 'La sesión fue cerrada');
    }

    const usuario = await Usuario.findByPk(Number(payload.sub));
    if (!usuario || !usuario.activo) {
      throw errorHttp(401, 'Usuario no válido o inactivo');
    }

    req.usuario = usuario;
    req.jwt = payload;
    next();
  } catch (e) {
    next(e);
  }
}

// Exige que el usuario autenticado sea ADMIN.
function requireAdmin(req, res, next) {
  if (!req.usuario || req.usuario.rol !== 'ADMIN') {
    return next(errorHttp(403, 'Requiere permisos de administrador'));
  }
  next();
}

// Exige que el usuario autenticado sea ESTUDIANTE.
function requireEstudiante(req, res, next) {
  if (!req.usuario || req.usuario.rol !== 'ESTUDIANTE') {
    return next(errorHttp(403, 'Requiere ser estudiante'));
  }
  next();
}

module.exports = { getCurrentUser, requireAdmin, requireEstudiante };
