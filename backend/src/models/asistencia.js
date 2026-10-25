// Tabla asistencia: estado de un estudiante en una sesión (único por sesión+estudiante).
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Asistencia',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      sesion_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      estudiante_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      estado: {
        type: DataTypes.ENUM('PRESENTE', 'FALTA'),
        allowNull: false,
      },
      hora_registro: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      origen: {
        type: DataTypes.ENUM('ESTUDIANTE', 'ADMIN', 'SISTEMA'),
        allowNull: false,
        defaultValue: 'ESTUDIANTE',
      },
      ip_registro: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },
    },
    {
      tableName: 'asistencia',
      timestamps: true,
      createdAt: 'creado_en',
      updatedAt: 'actualizado_en',
      indexes: [{ unique: true, fields: ['sesion_id', 'estudiante_id'] }],
    }
  );
