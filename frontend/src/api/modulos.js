// Reglas compartidas del flujo de un módulo nuevo (RF-13).

// Un módulo solo se puede activar si ya tiene estudiantes y fechas de clase.
export function puedeActivar(modulo) {
  return Number(modulo.inscritos) > 0 && Number(modulo.fechas) > 0;
}

export function textoFaltante(modulo) {
  const faltan = [];
  if (Number(modulo.inscritos) === 0) faltan.push('estudiantes');
  if (Number(modulo.fechas) === 0) faltan.push('fechas de clase');
  return faltan.length ? `Faltan ${faltan.join(' y ')}` : '';
}

export function mensajeConfirmacion(modulo) {
  const n = Number(modulo.inscritos);
  const m = Number(modulo.fechas);
  return (
    `Se activará "${modulo.nombre}" con ${n} ${n === 1 ? 'estudiante' : 'estudiantes'} ` +
    `y ${m} ${m === 1 ? 'fecha' : 'fechas'}. El módulo actual dejará de estar activo; ` +
    'sus datos se conservan.'
  );
}
