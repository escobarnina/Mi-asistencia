// Configuración centralizada: lee variables del archivo .env (con dotenv).
// Todo el backend importa desde aquí en lugar de leer process.env disperso.
require('dotenv').config();

function entero(valor, porDefecto) {
  const n = parseInt(valor, 10);
  return Number.isNaN(n) ? porDefecto : n;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: entero(process.env.PORT, 8000),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: entero(process.env.DB_PORT, 3306),
    // En entorno de pruebas usamos una base separada.
    database:
      process.env.NODE_ENV === 'test'
        ? process.env.MYSQL_DATABASE_TEST || 'asistencia_test'
        : process.env.MYSQL_DATABASE || 'asistencia',
    user: process.env.MYSQL_USER || 'asistencia',
    password: process.env.MYSQL_PASSWORD || '',
    rootPassword: process.env.MYSQL_ROOT_PASSWORD || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'cambia_este_secreto',
    minutos: entero(process.env.JWT_MINUTOS, 480),
  },

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@ejemplo.com',
    password: process.env.ADMIN_PASSWORD || 'Admin1234',
  },

  // Zona horaria de toda la app (America/La_Paz = UTC-04:00, sin horario de verano).
  tz: process.env.TZ || 'America/La_Paz',
  tzOffset: '-04:00',

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

module.exports = env;
