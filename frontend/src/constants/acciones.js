// Acciones del historial: código del backend -> texto legible y tipo (define el color).
// Tipos: ok (verde), warn (ámbar), info (azul), violet (violeta), bad (rojo); sin tipo = gris.
// La Fase B solo agrega entradas aquí.
export const ACCIONES = {
  LOGIN: { texto: 'Inicio de sesión' },
  LOGOUT: { texto: 'Cierre de sesión' },
  LOGIN_FALLIDO: { texto: 'Intento fallido' },
  MARCAR_ASISTENCIA: { texto: 'Marcó asistencia', tipo: 'ok' },
  MODIFICAR_ASISTENCIA: { texto: 'Corrección', tipo: 'warn' },
  IMPORTAR_ESTUDIANTES: { texto: 'Importó estudiantes', tipo: 'info' },
  IMPORTAR_FECHAS: { texto: 'Importó fechas', tipo: 'info' },
  ACTIVAR_MODULO: { texto: 'Activó módulo', tipo: 'info' },
  EXPORTAR: { texto: 'Exportó Excel', tipo: 'violet' },
  // Gestión editable de módulos (Fase B).
  AGREGAR_ESTUDIANTE: { texto: 'Agregó estudiante', tipo: 'info' },
  EDITAR_ESTUDIANTE: { texto: 'Editó estudiante', tipo: 'warn' },
  QUITAR_ESTUDIANTE: { texto: 'Quitó estudiante', tipo: 'bad' },
  AGREGAR_FECHA: { texto: 'Agregó fecha', tipo: 'info' },
  EDITAR_FECHA: { texto: 'Editó fecha', tipo: 'warn' },
  QUITAR_FECHA: { texto: 'Quitó fecha', tipo: 'bad' },
  EDITAR_MODULO: { texto: 'Editó módulo', tipo: 'warn' },
  // Registros antiguos que ya no se generan, pero pueden seguir en la base.
  GENERAR_FALTAS: { texto: 'Generó faltas' },
};

// Acciones que se ofrecen en el filtro (se omite la que ya no se genera).
export const ACCIONES_FILTRO = Object.keys(ACCIONES).filter((c) => c !== 'GENERAR_FALTAS');

export const textoAccion = (codigo) => ACCIONES[codigo]?.texto || codigo;
