// Crea un Error con código HTTP para que el manejador central lo responda
// como JSON { detalle }. Mensajes siempre en español.
// `extra` agrega campos al JSON de la respuesta (p. ej. { asistencias: 3 }).
function errorHttp(status, mensaje, extra) {
  const e = new Error(mensaje);
  e.status = status;
  if (extra) e.extra = extra;
  return e;
}

module.exports = { errorHttp };
