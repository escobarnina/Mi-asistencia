// Validación de entrada para autenticación (zod).
const { z } = require('zod');

const loginSchema = z.object({
  // Puede ser el email o el código (número de registro) del usuario.
  identificador: z
    .string({ required_error: 'El identificador es obligatorio' })
    .trim()
    .min(1, 'El identificador es obligatorio'),
  // El estudiante entra sin contraseña; el admin sí la envía.
  password: z.string().nullable().optional(),
});

module.exports = { loginSchema };
