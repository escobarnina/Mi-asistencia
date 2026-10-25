// Tabla sesion_clase: cada fecha de clase de un módulo (único por módulo+fecha).
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'SesionClase',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      modulo_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      fecha: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      hora_inicio: {
        type: DataTypes.TIME,
        allowNull: false,
      },
      hora_fin: {
        type: DataTypes.TIME,
        allowNull: false,
      },
      cerrada: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: 'sesion_clase',
      timestamps: false,
      indexes: [{ unique: true, fields: ['modulo_id', 'fecha'] }],
    }
  );
