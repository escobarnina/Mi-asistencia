// Tabla asistencia_cambio: auditoría de correcciones de asistencia hechas por un admin.
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'AsistenciaCambio',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      asistencia_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      usuario_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      estado_anterior: {
        type: DataTypes.ENUM('PRESENTE', 'FALTA'),
        allowNull: true,
      },
      estado_nuevo: {
        type: DataTypes.ENUM('PRESENTE', 'FALTA'),
        allowNull: false,
      },
      motivo: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      cambiado_en: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'asistencia_cambio',
      timestamps: false,
    }
  );
