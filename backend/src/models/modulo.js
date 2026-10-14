// Tabla modulo: periodo/materia. Solo uno puede estar activo a la vez
// (lo garantiza la columna generada activo_unico en la migración).
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Modulo',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      nombre: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      gestion: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      activo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      activado_en: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      creado_por: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      tableName: 'modulo',
      timestamps: true,
      createdAt: 'creado_en',
      updatedAt: false,
    }
  );
