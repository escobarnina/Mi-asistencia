// Inicializa todos los modelos sobre la instancia de Sequelize y define
// las asociaciones entre ellos. El resto de la app importa desde aquí.
const { sequelize, Sequelize } = require('../database');

const { DataTypes } = Sequelize;

const Usuario = require('./usuario')(sequelize, DataTypes);
const Modulo = require('./modulo')(sequelize, DataTypes);
const Inscripcion = require('./inscripcion')(sequelize, DataTypes);
const SesionClase = require('./sesionClase')(sequelize, DataTypes);
const Asistencia = require('./asistencia')(sequelize, DataTypes);
const AsistenciaCambio = require('./asistenciaCambio')(sequelize, DataTypes);
const Actividad = require('./actividad')(sequelize, DataTypes);
const Importacion = require('./importacion')(sequelize, DataTypes);
const TokenRevocado = require('./tokenRevocado')(sequelize, DataTypes);

// --- Asociaciones ---

// Módulo creado por un usuario (admin).
Modulo.belongsTo(Usuario, { as: 'creador', foreignKey: 'creado_por' });
Usuario.hasMany(Modulo, { as: 'modulosCreados', foreignKey: 'creado_por' });

// Inscripciones: estudiante inscrito en un módulo.
Inscripcion.belongsTo(Modulo, { foreignKey: 'modulo_id' });
Inscripcion.belongsTo(Usuario, { as: 'estudiante', foreignKey: 'estudiante_id' });
Modulo.hasMany(Inscripcion, { foreignKey: 'modulo_id' });
Usuario.hasMany(Inscripcion, { as: 'inscripciones', foreignKey: 'estudiante_id' });

// Sesiones de clase de un módulo.
SesionClase.belongsTo(Modulo, { foreignKey: 'modulo_id' });
Modulo.hasMany(SesionClase, { foreignKey: 'modulo_id' });

// Asistencias de una sesión / de un estudiante.
Asistencia.belongsTo(SesionClase, { as: 'sesion', foreignKey: 'sesion_id' });
Asistencia.belongsTo(Usuario, { as: 'estudiante', foreignKey: 'estudiante_id' });
SesionClase.hasMany(Asistencia, { foreignKey: 'sesion_id' });

// Auditoría de cambios de asistencia.
AsistenciaCambio.belongsTo(Asistencia, { foreignKey: 'asistencia_id' });
AsistenciaCambio.belongsTo(Usuario, { foreignKey: 'usuario_id' });
Asistencia.hasMany(AsistenciaCambio, { foreignKey: 'asistencia_id' });

// Historial de actividad.
Actividad.belongsTo(Modulo, { foreignKey: 'modulo_id' });
Actividad.belongsTo(Usuario, { foreignKey: 'usuario_id' });

// Importaciones.
Importacion.belongsTo(Modulo, { foreignKey: 'modulo_id' });
Importacion.belongsTo(Usuario, { foreignKey: 'usuario_id' });

module.exports = {
  sequelize,
  Sequelize,
  Usuario,
  Modulo,
  Inscripcion,
  SesionClase,
  Asistencia,
  AsistenciaCambio,
  Actividad,
  Importacion,
  TokenRevocado,
};
