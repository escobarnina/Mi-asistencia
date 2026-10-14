// Configuración para sequelize-cli (migraciones). La CLI no lee .env sola,
// por eso lo cargamos aquí. Comparte las mismas variables que env.js.
require('dotenv').config();

function entero(valor, porDefecto) {
  const n = parseInt(valor, 10);
  return Number.isNaN(n) ? porDefecto : n;
}

const base = {
  username: process.env.MYSQL_USER || 'asistencia',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'asistencia',
  host: process.env.DB_HOST || 'localhost',
  port: entero(process.env.DB_PORT, 3306),
  dialect: 'mysql',
  dialectOptions: { charset: 'utf8mb4' },
  define: { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
  timezone: '-04:00',
};

module.exports = {
  development: base,
  test: {
    ...base,
    database: process.env.MYSQL_DATABASE_TEST || 'asistencia_test',
  },
  production: base,
};
