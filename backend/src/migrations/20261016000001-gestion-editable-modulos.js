'use strict';

// Fase B (módulos editables): origen de cada inscripción y nuevas acciones del historial.

const ACCIONES_ANTERIORES = [
  'LOGIN',
  'LOGOUT',
  'LOGIN_FALLIDO',
  'MARCAR_ASISTENCIA',
  'MODIFICAR_ASISTENCIA',
  'GENERAR_FALTAS',
  'IMPORTAR_ESTUDIANTES',
  'IMPORTAR_FECHAS',
  'ACTIVAR_MODULO',
  'EXPORTAR',
];
const ACCIONES_NUEVAS = [
  'AGREGAR_ESTUDIANTE',
  'EDITAR_ESTUDIANTE',
  'QUITAR_ESTUDIANTE',
  'AGREGAR_FECHA',
  'EDITAR_FECHA',
  'QUITAR_FECHA',
  'EDITAR_MODULO',
];

const lista = (valores) => valores.map((v) => `'${v}'`).join(', ');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('inscripcion', 'origen', {
      type: Sequelize.ENUM('MANUAL', 'EXCEL'),
      allowNull: false,
      defaultValue: 'EXCEL',
    });
    await queryInterface.sequelize.query(
      `ALTER TABLE actividad MODIFY accion ENUM(${lista([...ACCIONES_ANTERIORES, ...ACCIONES_NUEVAS])}) NOT NULL`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DELETE FROM actividad WHERE accion IN (" + lista(ACCIONES_NUEVAS) + ')'
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE actividad MODIFY accion ENUM(${lista(ACCIONES_ANTERIORES)}) NOT NULL`
    );
    await queryInterface.removeColumn('inscripcion', 'origen');
  },
};
