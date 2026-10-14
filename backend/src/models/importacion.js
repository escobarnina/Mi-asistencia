// Tabla importacion: registro de cada importación de Excel (estudiantes o fechas).
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Importacion',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      modulo_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      tipo: {
        type: DataTypes.ENUM('ESTUDIANTES', 'FECHAS'),
        allowNull: false,
      },
      archivo: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      filas_ok: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      filas_error: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      detalle_error: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      usuario_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      tableName: 'importacion',
      timestamps: true,
      createdAt: 'creado_en',
      updatedAt: false,
    }
  );
