// Lógica de negocio de autenticación (RF-01, RF-02).
const { Op } = require('sequelize');
const { Usuario, Inscripcion, Modulo, TokenRevocado } = require('../models');
const { verificarPassword, crearToken } = require('../core/security');
const { errorHttp } = require('../core/errors');
const actividadService = require('./actividadService');

// Mismo mensaje genérico para no revelar si el usuario existe.
const MSG_CREDENCIALES = 'Credenciales incorrectas';
const MSG_NO_INSCRITO = 'No estás inscrito en el módulo activo';

// Registra un intento fallido en el historial y lanza el error.
async function rechazar(mensaje, identificador, usuario, ip) {
  await actividadService.registrar(
    usuario ? usuario.id : null,
    'LOGIN_FALLIDO',
    { detalle: `identificador=${identificador}`, ip }
  );
  throw errorHttp(401, mensaje);
}

async function login({ identificador, password }, ip) {
  // 1. Buscar por email O por código (número de registro).
  const usuario = await Usuario.findOne({
    where: { [Op.or]: [{ email: identificador }, { codigo: identificador }] },
  });

  if (!usuario || !usuario.activo) {
    await rechazar(MSG_CREDENCIALES, identificador, usuario, ip);
  }

  if (usuario.rol === 'ADMIN') {
    // 2. ADMIN: la contraseña es obligatoria y se verifica con bcrypt.
    const ok = await verificarPassword(password, usuario.password_hash);
    if (!ok) {
      await rechazar(MSG_CREDENCIALES, identificador, usuario, ip);
    }
  } else {
    // 3. ESTUDIANTE: entra sin contraseña, pero debe estar inscrito en el
    //    módulo activo. Si no hay módulo activo o no está inscrito, se rechaza.
    const moduloActivo = await Modulo.findOne({ where: { activo: true } });
    if (!moduloActivo) {
      await rechazar(MSG_NO_INSCRITO, identificador, usuario, ip);
    }
    const inscrito = await Inscripcion.findOne({
      where: { modulo_id: moduloActivo.id, estudiante_id: usuario.id },
    });
    if (!inscrito) {
      await rechazar(MSG_NO_INSCRITO, identificador, usuario, ip);
    }
  }

  // 4. Éxito: crear token y registrar el LOGIN.
  const { token } = crearToken(usuario);
  await actividadService.registrar(usuario.id, 'LOGIN', { ip });
  return { token, usuario };
}

async function logout(usuario, jwtPayload, ip) {
  // Guarda el jti en token_revocado para que get_current_user lo rechace.
  await TokenRevocado.findOrCreate({
    where: { jti: jwtPayload.jti },
    defaults: {
      jti: jwtPayload.jti,
      expira_en: new Date(jwtPayload.exp * 1000),
    },
  });
  await actividadService.registrar(usuario.id, 'LOGOUT', { ip });
}

module.exports = { login, logout };
