// Representación pública del usuario que se devuelve al frontend
// (nunca incluye password_hash).
function usuarioPublico(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    codigo: u.codigo,
    rol: u.rol,
  };
}

module.exports = { usuarioPublico };
