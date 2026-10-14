'use strict';

// Migración inicial: crea TODAS las tablas del sistema.
// Nombres de tablas y columnas exactamente como en el diseño.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const opciones = { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' };

    // Columna de fecha de creación (DATETIME, default ahora).
    const creadoEn = {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    };

    // ---------------- usuario ----------------
    await queryInterface.createTable(
      'usuario',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        codigo: { type: Sequelize.STRING(20), allowNull: true, unique: true },
        nombre: { type: Sequelize.STRING(120), allowNull: false },
        email: { type: Sequelize.STRING(150), allowNull: false, unique: true },
        rol: {
          type: Sequelize.ENUM('ADMIN', 'ESTUDIANTE'),
          allowNull: false,
          defaultValue: 'ESTUDIANTE',
        },
        password_hash: { type: Sequelize.STRING(255), allowNull: true },
        activo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        creado_en: creadoEn,
        actualizado_en: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      },
      opciones
    );

    // ---------------- modulo ----------------
    await queryInterface.createTable(
      'modulo',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        nombre: { type: Sequelize.STRING(120), allowNull: false },
        gestion: { type: Sequelize.STRING(10), allowNull: true },
        activo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        activado_en: { type: Sequelize.DATE, allowNull: true },
        creado_por: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'usuario', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        creado_en: creadoEn,
      },
      opciones
    );

    // Columna generada + UNIQUE: garantiza UN SOLO módulo activo.
    await queryInterface.sequelize.query(
      'ALTER TABLE modulo ADD COLUMN activo_unico TINYINT ' +
        'GENERATED ALWAYS AS (IF(activo = 1, 1, NULL)) STORED'
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE modulo ADD CONSTRAINT uq_modulo_activo UNIQUE (activo_unico)'
    );

    // ---------------- inscripcion ----------------
    await queryInterface.createTable(
      'inscripcion',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        modulo_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'modulo', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        },
        estudiante_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'usuario', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        },
        creado_en: creadoEn,
      },
      opciones
    );
    await queryInterface.addConstraint('inscripcion', {
      fields: ['modulo_id', 'estudiante_id'],
      type: 'unique',
      name: 'uq_inscripcion_modulo_estudiante',
    });

    // ---------------- sesion_clase ----------------
    await queryInterface.createTable(
      'sesion_clase',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        modulo_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'modulo', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        },
        fecha: { type: Sequelize.DATEONLY, allowNull: false },
        hora_inicio: { type: Sequelize.TIME, allowNull: false },
        hora_fin: { type: Sequelize.TIME, allowNull: false },
        cerrada: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      },
      opciones
    );
    await queryInterface.addConstraint('sesion_clase', {
      fields: ['modulo_id', 'fecha'],
      type: 'unique',
      name: 'uq_sesion_modulo_fecha',
    });
    // CHECK: la hora de fin debe ser mayor a la de inicio.
    await queryInterface.sequelize.query(
      'ALTER TABLE sesion_clase ADD CONSTRAINT chk_horas CHECK (hora_fin > hora_inicio)'
    );

    // ---------------- asistencia ----------------
    await queryInterface.createTable(
      'asistencia',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        sesion_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'sesion_clase', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        },
        estudiante_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'usuario', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        },
        estado: { type: Sequelize.ENUM('PRESENTE', 'FALTA'), allowNull: false },
        hora_registro: { type: Sequelize.DATE, allowNull: true },
        origen: {
          type: Sequelize.ENUM('ESTUDIANTE', 'ADMIN', 'SISTEMA'),
          allowNull: false,
          defaultValue: 'ESTUDIANTE',
        },
        ip_registro: { type: Sequelize.STRING(45), allowNull: true },
        creado_en: creadoEn,
        actualizado_en: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      },
      opciones
    );
    await queryInterface.addConstraint('asistencia', {
      fields: ['sesion_id', 'estudiante_id'],
      type: 'unique',
      name: 'uq_asistencia_sesion_estudiante',
    });

    // ---------------- asistencia_cambio ----------------
    await queryInterface.createTable(
      'asistencia_cambio',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        asistencia_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'asistencia', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        },
        usuario_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'usuario', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        },
        estado_anterior: { type: Sequelize.ENUM('PRESENTE', 'FALTA'), allowNull: true },
        estado_nuevo: { type: Sequelize.ENUM('PRESENTE', 'FALTA'), allowNull: false },
        motivo: { type: Sequelize.STRING(255), allowNull: true },
        cambiado_en: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      },
      opciones
    );

    // ---------------- actividad ----------------
    await queryInterface.createTable(
      'actividad',
      {
        id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
        modulo_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'modulo', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        usuario_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'usuario', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        accion: {
          type: Sequelize.ENUM(
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
        entidad: { type: Sequelize.STRING(40), allowNull: true },
        entidad_id: { type: Sequelize.INTEGER, allowNull: true },
        detalle: { type: Sequelize.STRING(500), allowNull: true },
        ip: { type: Sequelize.STRING(45), allowNull: true },
        creado_en: creadoEn,
      },
      opciones
    );
    await queryInterface.addIndex('actividad', ['modulo_id', 'creado_en'], {
      name: 'ix_actividad_modulo_fecha',
    });

    // ---------------- importacion ----------------
    await queryInterface.createTable(
      'importacion',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        modulo_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'modulo', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        tipo: { type: Sequelize.ENUM('ESTUDIANTES', 'FECHAS'), allowNull: false },
        archivo: { type: Sequelize.STRING(255), allowNull: false },
        filas_ok: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        filas_error: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        detalle_error: { type: Sequelize.TEXT, allowNull: true },
        usuario_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'usuario', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        },
        creado_en: creadoEn,
      },
      opciones
    );

    // ---------------- token_revocado ----------------
    await queryInterface.createTable(
      'token_revocado',
      {
        jti: { type: Sequelize.STRING(64), primaryKey: true },
        expira_en: { type: Sequelize.DATE, allowNull: false },
      },
      opciones
    );
  },

  async down(queryInterface) {
    // Orden inverso para respetar las llaves foráneas.
    await queryInterface.dropTable('token_revocado');
    await queryInterface.dropTable('importacion');
    await queryInterface.dropTable('actividad');
    await queryInterface.dropTable('asistencia_cambio');
    await queryInterface.dropTable('asistencia');
    await queryInterface.dropTable('sesion_clase');
    await queryInterface.dropTable('inscripcion');
    await queryInterface.dropTable('modulo');
    await queryInterface.dropTable('usuario');
  },
};
