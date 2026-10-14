// globalSetup de Jest: crea la base de datos de pruebas (asistencia_test)
// usando el usuario root y le da permisos al usuario de la app.
require('dotenv').config();
const mysql = require('mysql2/promise');

module.exports = async () => {
  const nombre = process.env.MYSQL_DATABASE_TEST || 'asistencia_test';
  const usuario = process.env.MYSQL_USER || 'asistencia';

  const conexion = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: 'root',
    password: process.env.MYSQL_ROOT_PASSWORD || '',
  });

  await conexion.query(
    `CREATE DATABASE IF NOT EXISTS \`${nombre}\` ` +
      'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  );
  await conexion.query(
    `GRANT ALL PRIVILEGES ON \`${nombre}\`.* TO '${usuario}'@'%'`
  );
  await conexion.query('FLUSH PRIVILEGES');
  await conexion.end();
};
