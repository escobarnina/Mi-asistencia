// Tabla usuario: administradores y estudiantes del sistema.
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Usuario',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // Número de registro del estudiante (los admin no tienen).
      codigo: {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true,
      },
      nombre: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(150),
        allowNull: false,
        unique: true,
      },
      rol: {
        type: DataTypes.ENUM('ADMIN', 'ESTUDIANTE'),
        allowNull: false,
        defaultValue: 'ESTUDIANTE',
      },
      // Solo el ADMIN tiene contraseña; el estudiante entra sin ella.
      password_hash: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      activo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: 'usuario',
      timestamps: true,
      createdAt: 'creado_en',
      updatedAt: 'actualizado_en',
    }
  );
