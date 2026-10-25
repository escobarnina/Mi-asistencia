// Tabla token_revocado: guarda el jti de los tokens invalidados por logout.
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'TokenRevocado',
    {
      jti: {
        type: DataTypes.STRING(64),
        primaryKey: true,
      },
      expira_en: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      tableName: 'token_revocado',
      timestamps: false,
    }
  );
