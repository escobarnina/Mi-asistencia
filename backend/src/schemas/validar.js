// Helper para validar datos con un esquema zod y lanzar un error HTTP 400
// con un mensaje claro en español si no cumple.
const { errorHttp } = require('../core/errors');

function validar(schema, datos) {
  const resultado = schema.safeParse(datos);
  if (!resultado.success) {
    const mensaje =
      resultado.error.issues[0]?.message || 'Datos inválidos';
    throw errorHttp(400, mensaje);
  }
  return resultado.data;
}

module.exports = { validar };
