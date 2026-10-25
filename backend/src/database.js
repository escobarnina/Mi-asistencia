// Instancia única de Sequelize usada por los modelos y servicios.
const { Sequelize } = require('sequelize');
const env = require('./config/env');

const sequelize = new Sequelize(
  env.db.database,
  env.db.user,
  env.db.password,
  {
    host: env.db.host,
    port: env.db.port,
    dialect: 'mysql',
    // Toda la app trabaja en la zona horaria de La Paz (UTC-04:00).
    timezone: env.tzOffset,
    dialectOptions: {
      charset: 'utf8mb4',
    },
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
    logging: false,
  }
);

module.exports = { sequelize, Sequelize };
