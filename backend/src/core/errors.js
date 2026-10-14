// Crea un Error con código HTTP para que el manejador central lo responda
// como JSON { detalle }. Mensajes siempre en español.
function errorHttp(status, mensaje) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

module.exports = { errorHttp };
