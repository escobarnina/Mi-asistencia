// Semilla de datos iniciales (idempotente). Ejecutar con: npm run seed
// Crea: el administrador (del .env), un "Módulo 1" activo de gestión "2-2026",
// 2 estudiantes de prueba inscritos y 3 fechas de clase (AYER, HOY y MAÑANA, de
// 18:00 a 21:00, en America/La_Paz). Así se puede marcar asistencia hoy y ver
// la Falta automática de ayer apenas se levanta el proyecto.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { sequelize, Usuario, Modulo, Inscripcion, SesionClase } = require('./models');
const { hoyLaPaz } = require('./services/estadoAsistencia');
const { hashPassword } = require('./core/security');
const env = require('./config/env');

// 'AAAA-MM-DD' desplazado `dias` días (las fechas de clase son fechas de calendario).
function desplazar(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

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

  // El Módulo 1 queda activo si todavía no hay ningún módulo activo. Si el
  // administrador ya activó otro, la semilla no lo pisa.
  const hayActivo = await Modulo.findOne({ where: { activo: true } });
  let avisoActivo = '';
  if (!hayActivo) {
    await modulo.update({ activo: true, activado_en: new Date() });
  } else if (hayActivo.id !== modulo.id) {
    avisoActivo = `  ! El módulo activo es "${hayActivo.nombre}"; "Módulo 1" no se activó.`;
  }

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

  // 4. Tres fechas de clase: ayer, hoy y mañana (idempotente por módulo y fecha).
  const hoy = hoyLaPaz();
  const fechas = [desplazar(hoy, -1), hoy, desplazar(hoy, 1)];
  for (const fecha of fechas) {
    await SesionClase.findOrCreate({
      where: { modulo_id: modulo.id, fecha },
      defaults: { modulo_id: modulo.id, fecha, hora_inicio: '18:00:00', hora_fin: '21:00:00' },
    });
  }

  console.log('Semilla aplicada:');
  console.log(`  - Admin:       ${env.admin.email}`);
  console.log('  - Módulo:      "Módulo 1" (activo, gestión 2-2026)');
  console.log('  - Estudiantes: est1@ejemplo.com (220001), est2@ejemplo.com (220002)');
  console.log(`  - Clases:      ${fechas.join(', ')} (ayer, hoy y mañana, 18:00-21:00)`);
  if (avisoActivo) console.log(avisoActivo);

  await sequelize.close();
}

sembrar().catch((e) => {
  console.error('Error al aplicar la semilla:', e.message);
  process.exit(1);
});
