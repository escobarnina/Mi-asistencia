// Tabla inscripcion: relación estudiante <-> módulo (único por par).
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Inscripcion',
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
      estudiante_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // Cómo se agregó el estudiante al módulo: a mano o desde un Excel.
      origen: {
        type: DataTypes.ENUM('MANUAL', 'EXCEL'),
        allowNull: false,
        defaultValue: 'EXCEL',
      },
    },
    {
      tableName: 'inscripcion',
      timestamps: true,
      createdAt: 'creado_en',
      updatedAt: false,
      indexes: [{ unique: true, fields: ['modulo_id', 'estudiante_id'] }],
    }
  );
