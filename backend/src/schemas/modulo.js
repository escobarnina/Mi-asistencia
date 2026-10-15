// Validación de entrada para módulos (zod).
const { z } = require('zod');

const nombre = z
  .string({ required_error: 'El nombre es obligatorio' })
  .trim()
  .min(1, 'El nombre es obligatorio')
  .max(120, 'El nombre no puede superar los 120 caracteres');

// Gestión (periodo), por ejemplo "2-2026". Opcional.
const gestion = z
  .string()
  .trim()
  .max(10, 'La gestión no puede superar los 10 caracteres')
  .regex(/^[0-9]-[0-9]{4}$/, 'La gestión debe tener el formato N-AAAA (por ejemplo, 1-2027)')
  .nullable()
  .optional();

const crearModuloSchema = z.object({ nombre, gestion });

// Para editar: todos los campos son opcionales, pero debe venir al menos uno.
const editarModuloSchema = z
  .object({ nombre: nombre.optional(), gestion })
  .refine((d) => d.nombre !== undefined || d.gestion !== undefined, {
    message: 'Debes enviar al menos un campo para modificar',
  });

module.exports = { crearModuloSchema, editarModuloSchema };
