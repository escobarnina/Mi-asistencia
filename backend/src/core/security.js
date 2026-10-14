// Funciones de seguridad: hash/verificación de contraseñas (bcrypt) y
// creación/verificación de tokens JWT.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

const RONDAS = 10;

// --- Contraseñas (solo las usan los ADMIN) ---

async function hashPassword(plano) {
  return bcrypt.hash(plano, RONDAS);
}

async function verificarPassword(plano, hash) {
  if (!hash || !plano) return false;
  return bcrypt.compare(plano, hash);
}

// --- Tokens JWT ---
// El token lleva: sub (id usuario), rol, jti (uuid) y exp (según JWT_MINUTOS).

function crearToken(usuario) {
  const jti = crypto.randomUUID();
  const payload = { sub: String(usuario.id), rol: usuario.rol, jti };
  const token = jwt.sign(payload, env.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: env.jwt.minutos * 60, // en segundos
  });
  return { token, jti };
}

function verificarToken(token) {
  return jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] });
}

module.exports = {
  hashPassword,
  verificarPassword,
  crearToken,
  verificarToken,
};
