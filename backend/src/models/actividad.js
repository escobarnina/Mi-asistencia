// Tabla actividad: historial de acciones del sistema (RF-09).
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Actividad',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      modulo_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      usuario_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      accion: {
        type: DataTypes.ENUM(
          'LOGIN',
          'LOGOUT',
          'LOGIN_FALLIDO',
          'MARCAR_ASISTENCIA',
          'MODIFICAR_ASISTENCIA',
          'GENERAR_FALTAS',
          'IMPORTAR_ESTUDIANTES',
          'IMPORTAR_FECHAS',
          'ACTIVAR_MODULO',
          'EXPORTAR'
        ),
        allowNull: false,
      },
      entidad: {
        type: DataTypes.STRING(40),
        allowNull: true,
      },
      entidad_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      detalle: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      ip: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },
    },
    {
      tableName: 'actividad',
      timestamps: true,
      createdAt: 'creado_en',
      updatedAt: false,
      indexes: [{ fields: ['modulo_id', 'creado_en'] }],
    }
  );
