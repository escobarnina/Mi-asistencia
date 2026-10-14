// Validación de cada fila de los Excel de importación (zod).
const { z } = require('zod');

// Las celdas pueden llegar como número (p. ej. 1001); se pasan a texto.
const aTexto = (v) => (v === null || v === undefined ? undefined : String(v).trim());

// RF-11: Número de registro | Nombre completo | Correo electrónico
const filaEstudianteSchema = z.object({
  codigo: z.preprocess(
    aTexto,
    z
      .string({ required_error: 'Falta el número de registro' })
      .min(1, 'Falta el número de registro')
      .max(20, 'El número de registro no puede superar los 20 caracteres')
  ),
  nombre: z.preprocess(
    aTexto,
    z
      .string({ required_error: 'Falta el nombre completo' })
      .min(1, 'Falta el nombre completo')
      .max(120, 'El nombre no puede superar los 120 caracteres')
  ),
  email: z.preprocess(
    (v) => aTexto(v)?.toLowerCase(),
    z
      .string({ required_error: 'Falta el correo electrónico' })
      .min(1, 'Falta el correo electrónico')
      .max(150, 'El correo no puede superar los 150 caracteres')
      .email('El correo electrónico no es válido')
  ),
});

// Encabezados aceptados para cada campo (se comparan sin tildes ni mayúsculas).
const COLUMNAS_ESTUDIANTES = {
  codigo: ['Número de registro', 'Numero registro', 'Registro', 'Código', 'Codigo'],
  nombre: ['Nombre completo', 'Nombre'],
  email: ['Correo electrónico', 'Correo', 'Email', 'E-mail'],
};

// --- Fechas de clase (RF-12) ---
// Excel puede entregar una fecha como Date, como texto ("05/10/2026") o como
// número de serie (días desde 1899-12-30). Una hora puede llegar como Date
// (sobre el día 1899-12-30), como texto ("18:00") o como fracción del día (0.75).
// exceljs entrega los Date en UTC, por eso se leen con getUTC*.

const dos = (n) => String(n).padStart(2, '0');
const MS_DIA = 24 * 60 * 60 * 1000;
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

// Devuelve 'AAAA-MM-DD' o null si no es una fecha real.
function aFecha(v) {
  let a;
  let m;
  let d;
  if (v instanceof Date) {
    [a, m, d] = [v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()];
  } else if (typeof v === 'number') {
    return aFecha(new Date(EPOCA_EXCEL + Math.floor(v) * MS_DIA));
  } else {
    const texto = String(v).trim();
    let r = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // DD/MM/AAAA
    if (r) [d, m, a] = [+r[1], +r[2], +r[3]];
    else if ((r = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [a, m, d] = [+r[1], +r[2], +r[3]];
    else return null;
  }
  // Rechaza fechas imposibles como 31/02/2026.
  const f = new Date(Date.UTC(a, m - 1, d));
  if (a < 2000 || a > 2100 || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${a}-${dos(m)}-${dos(d)}`;
}

// Devuelve 'HH:MM:SS' o null si no es una hora válida.
function aHora(v) {
  let h;
  let min;
  if (v instanceof Date) {
    [h, min] = [v.getUTCHours(), v.getUTCMinutes() + (v.getUTCSeconds() >= 30 ? 1 : 0)];
  } else if (typeof v === 'number') {
    if (v < 0 || v >= 1) return null;
    const total = Math.round(v * 24 * 60);
    [h, min] = [Math.floor(total / 60), total % 60];
  } else {
    const r = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!r) return null;
    [h, min] = [+r[1], +r[2]];
  }
  if (min === 60) [h, min] = [h + 1, 0];
  if (h > 23 || min > 59) return null;
  return `${dos(h)}:${dos(min)}:00`;
}

// Campo obligatorio que se convierte con "convertir"; si no se puede, da error.
const campoConvertido = (convertir, faltaMsg, invalidoMsg) =>
  z.any().transform((v, ctx) => {
    if (v === null || v === undefined || v === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: faltaMsg });
      return z.NEVER;
    }
    const r = convertir(v);
    if (!r) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: invalidoMsg });
      return z.NEVER;
    }
    return r;
  });

// RF-12: Fecha | Hora inicio | Hora fin
const filaFechaSchema = z
  .object({
    fecha: campoConvertido(aFecha, 'Falta la fecha', 'La fecha no es válida (usa DD/MM/AAAA)'),
    hora_inicio: campoConvertido(aHora, 'Falta la hora de inicio', 'La hora de inicio no es válida (usa HH:MM)'),
    hora_fin: campoConvertido(aHora, 'Falta la hora de fin', 'La hora de fin no es válida (usa HH:MM)'),
  })
  // Solo se compara si ambas horas son válidas (si no, ya hay otro error).
  .refine(
    (f) =>
      typeof f.hora_inicio !== 'string' ||
      typeof f.hora_fin !== 'string' ||
      f.hora_fin > f.hora_inicio,
    { message: 'La hora de fin debe ser posterior a la hora de inicio' }
  );

const COLUMNAS_FECHAS = {
  fecha: ['Fecha', 'Fecha de clase'],
  hora_inicio: ['Hora inicio', 'Hora de inicio', 'Inicio'],
  hora_fin: ['Hora fin', 'Hora de fin', 'Fin'],
};

module.exports = {
  filaEstudianteSchema,
  COLUMNAS_ESTUDIANTES,
  filaFechaSchema,
  COLUMNAS_FECHAS,
  aFecha,
  aHora,
};
