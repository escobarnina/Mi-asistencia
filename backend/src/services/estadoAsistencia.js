// Regla única del estado de asistencia (RF-04, RN-05), compartida por la vista
// del estudiante y el panel del administrador para que los totales coincidan.
//
//   - Con registro guardado: manda ese estado (PRESENTE o FALTA). Así, la
//     corrección de un administrador (RF-07) siempre prevalece.
//   - Sin registro y fecha de clase anterior a hoy: FALTA (automática).
//   - Sin registro y fecha de hoy: PENDIENTE (todavía puede marcar).
//   - Sin registro y fecha futura: PROXIMA.
// "Hoy" es la fecha de America/La_Paz.
const env = require('../config/env');

// Fecha de hoy en La Paz como 'AAAA-MM-DD' (el formato de sesion_clase.fecha).
function hoyLaPaz(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

// Estado efectivo de una fecha de clase para un estudiante.
// `asistencia` es el registro guardado o null/undefined si no hay.
function estadoDeFecha(fecha, hoy, asistencia) {
  if (asistencia) return asistencia.estado;
  if (fecha < hoy) return 'FALTA';
  if (fecha === hoy) return 'PENDIENTE';
  return 'PROXIMA';
}

// Una falta es "automática" cuando no hay registro guardado.
function esFaltaAutomatica(fecha, hoy, asistencia) {
  return !asistencia && fecha < hoy;
}

// Cuenta presentes, faltas y pendientes (hoy + futuras) de una lista de estados.
function totalizar(estados) {
  const contar = (e) => estados.filter((x) => x === e).length;
  return {
    total: estados.length,
    presentes: contar('PRESENTE'),
    faltas: contar('FALTA'),
    pendientes: contar('PENDIENTE') + contar('PROXIMA'),
  };
}

module.exports = { hoyLaPaz, estadoDeFecha, esFaltaAutomatica, totalizar };
