-- =====================================================================
--  Base de datos inicial para el Sistema de Registro y Control de Asistencia
--  Generado para aprovisionamiento directo por Cloud-Init o MySQL/MariaDB
--  Contiene las 9 tablas del sistema, restricciones y la semilla de datos inicial
-- =====================================================================

CREATE DATABASE IF NOT EXISTS asistencia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE asistencia;

-- 1. Tabla de Usuarios (Administradores y Estudiantes)
CREATE TABLE IF NOT EXISTS usuario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NULL,
    nombre VARCHAR(120) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    rol ENUM('ADMIN', 'ESTUDIANTE') NOT NULL DEFAULT 'ESTUDIANTE',
    password_hash VARCHAR(255) NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Módulos
CREATE TABLE IF NOT EXISTS modulo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    gestion VARCHAR(10) NULL,
    activo BOOLEAN NOT NULL DEFAULT FALSE,
    activado_en DATETIME NULL,
    creado_por INT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activo_unico TINYINT GENERATED ALWAYS AS (IF(activo = 1, 1, NULL)) STORED,
    CONSTRAINT uq_modulo_activo UNIQUE (activo_unico),
    CONSTRAINT fk_modulo_creado_por FOREIGN KEY (creado_por) REFERENCES usuario(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla de Inscripciones (Estudiante en Módulo)
CREATE TABLE IF NOT EXISTS inscripcion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    modulo_id INT NOT NULL,
    estudiante_id INT NOT NULL,
    origen ENUM('MANUAL', 'EXCEL') NOT NULL DEFAULT 'EXCEL',
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_inscripcion_modulo_estudiante UNIQUE (modulo_id, estudiante_id),
    CONSTRAINT fk_inscripcion_modulo FOREIGN KEY (modulo_id) REFERENCES modulo(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_inscripcion_estudiante FOREIGN KEY (estudiante_id) REFERENCES usuario(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabla de Sesiones de Clase
CREATE TABLE IF NOT EXISTS sesion_clase (
    id INT AUTO_INCREMENT PRIMARY KEY,
    modulo_id INT NOT NULL,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    cerrada BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_sesion_modulo_fecha UNIQUE (modulo_id, fecha),
    CONSTRAINT chk_horas CHECK (hora_fin > hora_inicio),
    CONSTRAINT fk_sesion_modulo FOREIGN KEY (modulo_id) REFERENCES modulo(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabla de Asistencias
CREATE TABLE IF NOT EXISTS asistencia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sesion_id INT NOT NULL,
    estudiante_id INT NOT NULL,
    estado ENUM('PRESENTE', 'FALTA') NOT NULL,
    hora_registro DATETIME NULL,
    origen ENUM('ESTUDIANTE', 'ADMIN', 'SISTEMA') NOT NULL DEFAULT 'ESTUDIANTE',
    ip_registro VARCHAR(45) NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_asistencia_sesion_estudiante UNIQUE (sesion_id, estudiante_id),
    CONSTRAINT fk_asistencia_sesion FOREIGN KEY (sesion_id) REFERENCES sesion_clase(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_asistencia_estudiante FOREIGN KEY (estudiante_id) REFERENCES usuario(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabla de Auditoría / Cambios de Asistencia
CREATE TABLE IF NOT EXISTS asistencia_cambio (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asistencia_id INT NOT NULL,
    usuario_id INT NOT NULL,
    estado_anterior ENUM('PRESENTE', 'FALTA') NULL,
    estado_nuevo ENUM('PRESENTE', 'FALTA') NOT NULL,
    motivo VARCHAR(255) NULL,
    cambiado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cambio_asistencia FOREIGN KEY (asistencia_id) REFERENCES asistencia(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_cambio_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Tabla de Historial / Registro de Actividades
CREATE TABLE IF NOT EXISTS actividad (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    modulo_id INT NULL,
    usuario_id INT NULL,
    accion ENUM(
        'LOGIN', 'LOGOUT', 'LOGIN_FALLIDO',
        'MARCAR_ASISTENCIA', 'MODIFICAR_ASISTENCIA', 'GENERAR_FALTAS',
        'IMPORTAR_ESTUDIANTES', 'IMPORTAR_FECHAS', 'ACTIVAR_MODULO', 'EXPORTAR',
        'AGREGAR_ESTUDIANTE', 'EDITAR_ESTUDIANTE', 'QUITAR_ESTUDIANTE',
        'AGREGAR_FECHA', 'EDITAR_FECHA', 'QUITAR_FECHA', 'EDITAR_MODULO'
    ) NOT NULL,
    entidad VARCHAR(40) NULL,
    entidad_id INT NULL,
    detalle VARCHAR(500) NULL,
    ip VARCHAR(45) NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_actividad_modulo FOREIGN KEY (modulo_id) REFERENCES modulo(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_actividad_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX ix_actividad_modulo_fecha (modulo_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Tabla de Registro de Importaciones
CREATE TABLE IF NOT EXISTS importacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    modulo_id INT NULL,
    tipo ENUM('ESTUDIANTES', 'FECHAS') NOT NULL,
    archivo VARCHAR(255) NOT NULL,
    filas_ok INT NOT NULL DEFAULT 0,
    filas_error INT NOT NULL DEFAULT 0,
    detalle_error TEXT NULL,
    usuario_id INT NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_importacion_modulo FOREIGN KEY (modulo_id) REFERENCES modulo(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_importacion_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Tabla de Revocación de Tokens JWT
CREATE TABLE IF NOT EXISTS token_revocado (
    jti VARCHAR(64) PRIMARY KEY,
    expira_en DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
--  SEMILLA DE DATOS INICIALES (seed.js)
-- =====================================================================

-- 1. Administrador Inicial (password: Admin1234 y Asistencia-2026 compatibles)
INSERT INTO usuario (id, codigo, nombre, email, rol, password_hash, activo, creado_en, actualizado_en)
VALUES
    (1, NULL, 'Administrador', 'admin@ejemplo.com', 'ADMIN', '$2a$10$Xd23DmlHdveDhCHT/ZqLO.3bpsyzuQgDfLzh6uOwAS62RtCE2p3om', TRUE, NOW(), NOW())
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

-- 2. Estudiantes de prueba
INSERT INTO usuario (id, codigo, nombre, email, rol, password_hash, activo, creado_en, actualizado_en)
VALUES
    (2, '220001', 'Estudiante Uno', 'est1@ejemplo.com', 'ESTUDIANTE', NULL, TRUE, NOW(), NOW()),
    (3, '220002', 'Estudiante Dos', 'est2@ejemplo.com', 'ESTUDIANTE', NULL, TRUE, NOW(), NOW())
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

-- 3. Módulo 1 (Activo, gestión 2-2026)
INSERT INTO modulo (id, nombre, gestion, activo, activado_en, creado_por, creado_en)
VALUES
    (1, 'Módulo 1', '2-2026', TRUE, NOW(), 1, NOW())
ON DUPLICATE KEY UPDATE activo = TRUE;

-- 4. Inscripción de estudiantes en el Módulo 1
INSERT INTO inscripcion (modulo_id, estudiante_id, origen, creado_en)
VALUES
    (1, 2, 'EXCEL', NOW()),
    (1, 3, 'EXCEL', NOW())
ON DUPLICATE KEY UPDATE origen = VALUES(origen);

-- 5. Sesiones de clase dinámicas: AYER, HOY y MAÑANA (18:00 a 21:00)
-- Permite que al levantar el sistema se pueda probar la Falta automática de ayer, marcar hoy y ver próxima mañana
INSERT INTO sesion_clase (modulo_id, fecha, hora_inicio, hora_fin, cerrada)
VALUES
    (1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '18:00:00', '21:00:00', FALSE),
    (1, CURDATE(),                           '18:00:00', '21:00:00', FALSE),
    (1, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '18:00:00', '21:00:00', FALSE)
ON DUPLICATE KEY UPDATE hora_inicio = VALUES(hora_inicio), hora_fin = VALUES(hora_fin);
