// Semilla de datos iniciales (idempotente). Ejecutar con: npm run seed
// Crea: el administrador (del .env), un "Módulo 1" activo de gestión "2-2026"
// y 2 estudiantes de prueba inscritos en ese módulo.
require('dotenv').config();
const { sequelize, Usuario, Modulo, Inscripcion } = require('./models');
const { hashPassword } = require('./core/security');
const env = require('./config/env');

async function sembrar() {
  await sequelize.authenticate();

  // 1. Administrador (con contraseña del .env).
  const [admin] = await Usuario.findOrCreate({
    where: { email: env.admin.email },
    defaults: {
      nombre: 'Administrador',
      email: env.admin.email,
      rol: 'ADMIN',
      password_hash: await hashPassword(env.admin.password),
      activo: true,
    },
  });

  // 2. Módulo 1 activo.
  const [modulo] = await Modulo.findOrCreate({
    where: { nombre: 'Módulo 1' },
    defaults: {
      nombre: 'Módulo 1',
      gestion: '2-2026',
      activo: true,
      activado_en: new Date(),
      creado_por: admin.id,
    },
  });

  // 3. Dos estudiantes de prueba, inscritos en el módulo.
  const estudiantes = [
    { codigo: '220001', nombre: 'Estudiante Uno', email: 'est1@ejemplo.com' },
    { codigo: '220002', nombre: 'Estudiante Dos', email: 'est2@ejemplo.com' },
  ];
  for (const datos of estudiantes) {
    const [estudiante] = await Usuario.findOrCreate({
      where: { email: datos.email },
      defaults: { ...datos, rol: 'ESTUDIANTE', activo: true },
    });
    await Inscripcion.findOrCreate({
      where: { modulo_id: modulo.id, estudiante_id: estudiante.id },
      defaults: { modulo_id: modulo.id, estudiante_id: estudiante.id },
    });
  }

  console.log('Semilla aplicada:');
  console.log(`  - Admin:       ${env.admin.email}`);
  console.log('  - Módulo:      "Módulo 1" (activo, gestión 2-2026)');
  console.log('  - Estudiantes: est1@ejemplo.com (220001), est2@ejemplo.com (220002)');

  await sequelize.close();
}

sembrar().catch((e) => {
  console.error('Error al aplicar la semilla:', e.message);
  process.exit(1);
});
