DROP DATABASE IF EXISTS orquiclima;
CREATE DATABASE orquiclima CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE orquiclima;

CREATE TABLE usuario (
    id_usuario        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre            VARCHAR(100)  NOT NULL,
    email             VARCHAR(150)  NOT NULL UNIQUE,
    password_hash     VARCHAR(255)  NOT NULL,
    rol               ENUM('ADMIN','OPERADOR','VISOR') NOT NULL DEFAULT 'OPERADOR',
    telefono          VARCHAR(20)   NULL,
    notif_email       BOOLEAN       NOT NULL DEFAULT TRUE,
    notif_push        BOOLEAN       NOT NULL DEFAULT TRUE,
    sonido_alertas    BOOLEAN       NOT NULL DEFAULT TRUE,
    activo            BOOLEAN       NOT NULL DEFAULT TRUE,
    creado_en         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE invernadero (
    id_invernadero    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_usuario        INT UNSIGNED  NOT NULL,
    nombre            VARCHAR(100)  NOT NULL,
    ubicacion         VARCHAR(200)  NULL,
    zona_horaria      VARCHAR(50)   NOT NULL DEFAULT 'America/Santiago',
    creado_en         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_inv_usuario FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE nave (
    id_nave           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_invernadero    INT UNSIGNED  NOT NULL,
    codigo            VARCHAR(10)   NOT NULL,
    numero_orden      TINYINT UNSIGNED NOT NULL,
    nombre            VARCHAR(100)  NOT NULL,
    superficie_m2     DECIMAL(8,2)  NULL,
    activa            BOOLEAN       NOT NULL DEFAULT TRUE,
    UNIQUE KEY uq_nave_codigo (id_invernadero, codigo),
    CONSTRAINT fk_nave_inv FOREIGN KEY (id_invernadero)
        REFERENCES invernadero(id_invernadero) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE especie (
    id_especie        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre_cientifico VARCHAR(120)  NOT NULL UNIQUE,
    nombre_comun      VARCHAR(120)  NULL,
    tipo_crecimiento  ENUM('EPIFITA','TERRESTRE','LITOFITA') NOT NULL DEFAULT 'EPIFITA',
    descripcion       TEXT          NULL,
    cuidados          TEXT          NULL,
    imagen_url        VARCHAR(255)  NULL
) ENGINE=InnoDB;

CREATE TABLE parametro_optimo (
    id_parametro      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_especie        INT UNSIGNED  NOT NULL UNIQUE,
    hr_meta           DECIMAL(5,2)  NOT NULL DEFAULT 80.00,
    hr_tolerancia     DECIMAL(5,2)  NOT NULL DEFAULT 5.00,
    temp_min_noche    DECIMAL(4,1)  NOT NULL DEFAULT 18.0,
    temp_max_dia      DECIMAL(4,1)  NOT NULL DEFAULT 24.0,
    dpv_min_kpa       DECIMAL(4,2)  NOT NULL DEFAULT 0.40,
    dpv_max_kpa       DECIMAL(4,2)  NOT NULL DEFAULT 0.90,
    hora_inicio_dia   TIME          NOT NULL DEFAULT '08:00:00',
    hora_inicio_noche TIME          NOT NULL DEFAULT '20:00:00',
    CONSTRAINT fk_param_especie FOREIGN KEY (id_especie)
        REFERENCES especie(id_especie) ON DELETE CASCADE,
    CONSTRAINT chk_hr_meta  CHECK (hr_meta BETWEEN 0 AND 100),
    CONSTRAINT chk_temp_rng CHECK (temp_min_noche < temp_max_dia)
) ENGINE=InnoDB;

CREATE TABLE cultivo (
    id_cultivo        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_nave           INT UNSIGNED  NOT NULL,
    id_especie        INT UNSIGNED  NOT NULL,
    cantidad_plantas  INT UNSIGNED  NOT NULL DEFAULT 0,
    fecha_siembra     DATE          NULL,
    activo            BOOLEAN       NOT NULL DEFAULT TRUE,
    UNIQUE KEY uq_cultivo (id_nave, id_especie),
    CONSTRAINT fk_cult_nave    FOREIGN KEY (id_nave)
        REFERENCES nave(id_nave) ON DELETE CASCADE,
    CONSTRAINT fk_cult_especie FOREIGN KEY (id_especie)
        REFERENCES especie(id_especie)
) ENGINE=InnoDB;

CREATE TABLE dispositivo (
    id_dispositivo    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_nave           INT UNSIGNED  NOT NULL,
    nombre            VARCHAR(100)  NOT NULL,
    modelo_mcu        VARCHAR(60)   NOT NULL,
    tipo_conexion     ENUM('WIFI','BLUETOOTH','BLE') NOT NULL,
    mac_address       CHAR(17)      NOT NULL UNIQUE,
    ip_address        VARCHAR(45)   NULL,
    api_token_hash    VARCHAR(255)  NOT NULL,
    firmware_version  VARCHAR(20)   NULL,
    estado            ENUM('PENDIENTE','CONECTADO','DESCONECTADO','ERROR')
                                    NOT NULL DEFAULT 'PENDIENTE',
    nivel_bateria     TINYINT UNSIGNED NULL,
    rssi_dbm          SMALLINT      NULL,
    ultima_conexion   DATETIME      NULL,
    emparejado_en     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_disp_nave FOREIGN KEY (id_nave)
        REFERENCES nave(id_nave) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE sensor (
    id_sensor         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_dispositivo    INT UNSIGNED  NOT NULL,
    tipo              ENUM('HUMEDAD','TEMPERATURA','HUM_TEMP') NOT NULL,
    modelo            VARCHAR(50)   NOT NULL,
    offset_humedad    DECIMAL(4,2)  NOT NULL DEFAULT 0.00,
    offset_temp       DECIMAL(4,2)  NOT NULL DEFAULT 0.00,
    activo            BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_sensor_disp FOREIGN KEY (id_dispositivo)
        REFERENCES dispositivo(id_dispositivo) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE lectura (
    id_lectura        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_sensor         INT UNSIGNED  NOT NULL,
    fecha_hora        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    humedad_relativa  DECIMAL(5,2)  NULL,
    temperatura       DECIMAL(4,1)  NULL,
    dpv_kpa DECIMAL(4,2) AS (
        0.6108 * EXP((17.27 * temperatura) / (temperatura + 237.3))
        * (1 - humedad_relativa / 100)
    ) STORED,
    punto_rocio DECIMAL(4,1) AS (
        (237.3 * (LN(humedad_relativa / 100) + (17.27 * temperatura) / (temperatura + 237.3)))
        / (17.27 - (LN(humedad_relativa / 100) + (17.27 * temperatura) / (temperatura + 237.3)))
    ) STORED,
    INDEX idx_lectura_sensor_fecha (id_sensor, fecha_hora),
    CONSTRAINT fk_lect_sensor FOREIGN KEY (id_sensor)
        REFERENCES sensor(id_sensor) ON DELETE CASCADE,
    CONSTRAINT chk_hr   CHECK (humedad_relativa BETWEEN 0.01 AND 100),
    CONSTRAINT chk_temp CHECK (temperatura BETWEEN -20 AND 60)
) ENGINE=InnoDB;

CREATE TABLE configuracion_registro (
    id_config         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_nave           INT UNSIGNED  NOT NULL UNIQUE,
    frecuencia_min    SMALLINT UNSIGNED NOT NULL DEFAULT 60,
    dias_retencion_crudo SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    modificado_por    INT UNSIGNED  NULL,
    modificado_en     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cfg_nave    FOREIGN KEY (id_nave)
        REFERENCES nave(id_nave) ON DELETE CASCADE,
    CONSTRAINT fk_cfg_usuario FOREIGN KEY (modificado_por)
        REFERENCES usuario(id_usuario) ON DELETE SET NULL,
    CONSTRAINT chk_frec CHECK (frecuencia_min IN (5,10,15,30,60,120,180,360,720,1440))
) ENGINE=InnoDB;

CREATE TABLE historial_ambiental (
    id_historial      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_nave           INT UNSIGNED  NOT NULL,
    periodo_inicio    DATETIME      NOT NULL,
    periodo_fin       DATETIME      NOT NULL,
    frecuencia_min    SMALLINT UNSIGNED NOT NULL,
    hr_promedio       DECIMAL(5,2)  NULL,
    hr_min            DECIMAL(5,2)  NULL,
    hr_max            DECIMAL(5,2)  NULL,
    temp_promedio     DECIMAL(4,1)  NULL,
    temp_min          DECIMAL(4,1)  NULL,
    temp_max          DECIMAL(4,1)  NULL,
    dpv_promedio      DECIMAL(4,2)  NULL,
    punto_rocio_prom  DECIMAL(4,1)  NULL,
    cantidad_lecturas INT UNSIGNED  NOT NULL DEFAULT 0,
    en_rango          BOOLEAN       NOT NULL DEFAULT TRUE,
    UNIQUE KEY uq_hist_periodo (id_nave, periodo_inicio),
    INDEX idx_hist_fecha (periodo_inicio),
    CONSTRAINT fk_hist_nave FOREIGN KEY (id_nave)
        REFERENCES nave(id_nave) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE actuador (
    id_actuador       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_nave           INT UNSIGNED  NOT NULL,
    id_dispositivo    INT UNSIGNED  NULL,
    tipo              ENUM('NEBULIZADOR','VENTILADOR','MALLA_SOMBREO',
                           'CALEFACTOR','RIEGO') NOT NULL,
    nombre            VARCHAR(100)  NOT NULL,
    estado            ENUM('ENCENDIDO','APAGADO','FALLA') NOT NULL DEFAULT 'APAGADO',
    nivel_pct         TINYINT UNSIGNED NULL,
    modo              ENUM('AUTOMATICO','MANUAL') NOT NULL DEFAULT 'AUTOMATICO',
    CONSTRAINT fk_act_nave FOREIGN KEY (id_nave)
        REFERENCES nave(id_nave) ON DELETE CASCADE,
    CONSTRAINT fk_act_disp FOREIGN KEY (id_dispositivo)
        REFERENCES dispositivo(id_dispositivo) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE evento_actuador (
    id_evento         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_actuador       INT UNSIGNED  NOT NULL,
    id_usuario        INT UNSIGNED  NULL,
    accion            ENUM('ENCENDER','APAGAR','AJUSTAR') NOT NULL,
    nivel_pct         TINYINT UNSIGNED NULL,
    motivo            VARCHAR(200)  NULL,
    fecha_hora        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_evt_fecha (id_actuador, fecha_hora),
    CONSTRAINT fk_evt_act     FOREIGN KEY (id_actuador)
        REFERENCES actuador(id_actuador) ON DELETE CASCADE,
    CONSTRAINT fk_evt_usuario FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE calendario_riego (
    id_calendario     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_nave           INT UNSIGNED  NOT NULL,
    id_usuario        INT UNSIGNED  NOT NULL,
    nombre            VARCHAR(100)  NOT NULL,
    dias_semana       SET('LUN','MAR','MIE','JUE','VIE','SAB','DOM') NOT NULL,
    hora_riego        TIME          NOT NULL,
    duracion_min      SMALLINT UNSIGNED NOT NULL DEFAULT 10,
    volumen_litros    DECIMAL(6,2)  NULL,
    minutos_aviso     SMALLINT UNSIGNED NOT NULL DEFAULT 15,
    fecha_inicio      DATE          NOT NULL,
    fecha_fin         DATE          NULL,
    activo            BOOLEAN       NOT NULL DEFAULT TRUE,
    creado_en         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cal_nave    FOREIGN KEY (id_nave)
        REFERENCES nave(id_nave) ON DELETE CASCADE,
    CONSTRAINT fk_cal_usuario FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE riego_programado (
    id_riego          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_calendario     INT UNSIGNED  NOT NULL,
    fecha_hora_prog   DATETIME      NOT NULL,
    estado            ENUM('PENDIENTE','NOTIFICADO','REALIZADO','OMITIDO')
                                    NOT NULL DEFAULT 'PENDIENTE',
    realizado_por     INT UNSIGNED  NULL,
    realizado_en      DATETIME      NULL,
    observacion       VARCHAR(255)  NULL,
    UNIQUE KEY uq_riego (id_calendario, fecha_hora_prog),
    INDEX idx_riego_estado (estado, fecha_hora_prog),
    CONSTRAINT fk_rp_cal     FOREIGN KEY (id_calendario)
        REFERENCES calendario_riego(id_calendario) ON DELETE CASCADE,
    CONSTRAINT fk_rp_usuario FOREIGN KEY (realizado_por)
        REFERENCES usuario(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE alerta (
    id_alerta         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_nave           INT UNSIGNED  NOT NULL,
    id_lectura        BIGINT UNSIGNED NULL,
    tipo              ENUM('HUMEDAD_ALTA','HUMEDAD_BAJA','TEMP_ALTA','TEMP_BAJA',
                           'DPV_FUERA_RANGO','SENSOR_DESCONECTADO','BATERIA_BAJA')
                                    NOT NULL,
    severidad         ENUM('INFO','ADVERTENCIA','CRITICA') NOT NULL DEFAULT 'ADVERTENCIA',
    valor_medido      DECIMAL(6,2)  NULL,
    valor_referencia  DECIMAL(6,2)  NULL,
    mensaje           VARCHAR(255)  NOT NULL,
    fecha_hora        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resuelta          BOOLEAN       NOT NULL DEFAULT FALSE,
    resuelta_en       DATETIME      NULL,
    INDEX idx_alerta_nave (id_nave, resuelta, fecha_hora),
    CONSTRAINT fk_al_nave    FOREIGN KEY (id_nave)
        REFERENCES nave(id_nave) ON DELETE CASCADE,
    CONSTRAINT fk_al_lectura FOREIGN KEY (id_lectura)
        REFERENCES lectura(id_lectura) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE notificacion (
    id_notificacion   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_usuario        INT UNSIGNED  NOT NULL,
    origen            ENUM('RIEGO','ALERTA','SISTEMA') NOT NULL,
    id_riego          BIGINT UNSIGNED NULL,
    id_alerta         BIGINT UNSIGNED NULL,
    canal             ENUM('WEB','PUSH','EMAIL') NOT NULL DEFAULT 'WEB',
    titulo            VARCHAR(120)  NOT NULL,
    mensaje           VARCHAR(255)  NOT NULL,
    enviada_en        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    leida             BOOLEAN       NOT NULL DEFAULT FALSE,
    leida_en          DATETIME      NULL,
    INDEX idx_notif_usuario (id_usuario, leida),
    CONSTRAINT fk_not_usuario FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario) ON DELETE CASCADE,
    CONSTRAINT fk_not_riego   FOREIGN KEY (id_riego)
        REFERENCES riego_programado(id_riego) ON DELETE CASCADE,
    CONSTRAINT fk_not_alerta  FOREIGN KEY (id_alerta)
        REFERENCES alerta(id_alerta) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW v_estado_actual_nave AS
SELECT  n.id_nave,
        n.codigo,
        n.nombre                AS nave,
        e.nombre_cientifico     AS especie,
        c.cantidad_plantas,
        l.humedad_relativa,
        l.temperatura,
        l.dpv_kpa,
        l.punto_rocio,
        l.fecha_hora            AS ultima_lectura,
        p.hr_meta,
        p.temp_min_noche,
        p.temp_max_dia,
        (ABS(l.humedad_relativa - p.hr_meta) <= p.hr_tolerancia)        AS hr_en_rango,
        (l.temperatura BETWEEN p.temp_min_noche AND p.temp_max_dia)     AS temp_en_rango
FROM nave n
JOIN cultivo c           ON c.id_nave = n.id_nave AND c.activo
JOIN especie e           ON e.id_especie = c.id_especie
JOIN parametro_optimo p  ON p.id_especie = e.id_especie
JOIN dispositivo d       ON d.id_nave = n.id_nave
JOIN sensor s            ON s.id_dispositivo = d.id_dispositivo
JOIN lectura l           ON l.id_sensor = s.id_sensor
WHERE l.fecha_hora = (
        SELECT MAX(l2.fecha_hora)
        FROM lectura l2
        JOIN sensor s2      ON s2.id_sensor = l2.id_sensor
        JOIN dispositivo d2 ON d2.id_dispositivo = s2.id_dispositivo
        WHERE d2.id_nave = n.id_nave
);

CREATE OR REPLACE VIEW v_riegos_pendientes AS
SELECT  rp.id_riego, n.nombre AS nave, cr.nombre AS calendario,
        rp.fecha_hora_prog, cr.duracion_min, rp.estado
FROM riego_programado rp
JOIN calendario_riego cr ON cr.id_calendario = rp.id_calendario
JOIN nave n              ON n.id_nave = cr.id_nave
WHERE rp.estado IN ('PENDIENTE','NOTIFICADO')
  AND DATE(rp.fecha_hora_prog) = CURDATE();

DELIMITER $$

CREATE PROCEDURE sp_consolidar_historial()
BEGIN
    INSERT INTO historial_ambiental
        (id_nave, periodo_inicio, periodo_fin, frecuencia_min,
         hr_promedio, hr_min, hr_max, temp_promedio, temp_min, temp_max,
         dpv_promedio, punto_rocio_prom, cantidad_lecturas, en_rango)
    SELECT  cfg.id_nave,
            ini.periodo_inicio,
            ini.periodo_inicio + INTERVAL cfg.frecuencia_min MINUTE,
            cfg.frecuencia_min,
            AVG(l.humedad_relativa), MIN(l.humedad_relativa), MAX(l.humedad_relativa),
            AVG(l.temperatura),      MIN(l.temperatura),      MAX(l.temperatura),
            AVG(l.dpv_kpa), AVG(l.punto_rocio), COUNT(*),
            (ABS(AVG(l.humedad_relativa) - MAX(p.hr_meta)) <= MAX(p.hr_tolerancia)
             AND AVG(l.temperatura) BETWEEN MAX(p.temp_min_noche) AND MAX(p.temp_max_dia))
    FROM configuracion_registro cfg
    JOIN (
            SELECT n.id_nave,
                   COALESCE(MAX(h.periodo_fin),
                            DATE_FORMAT(NOW() - INTERVAL 1 DAY, '%Y-%m-%d %H:00:00'))
                       AS periodo_inicio
            FROM nave n
            LEFT JOIN historial_ambiental h ON h.id_nave = n.id_nave
            GROUP BY n.id_nave
         ) ini ON ini.id_nave = cfg.id_nave
    JOIN dispositivo d      ON d.id_nave = cfg.id_nave
    JOIN sensor s           ON s.id_dispositivo = d.id_dispositivo
    JOIN lectura l          ON l.id_sensor = s.id_sensor
                           AND l.fecha_hora >= ini.periodo_inicio
                           AND l.fecha_hora <  ini.periodo_inicio + INTERVAL cfg.frecuencia_min MINUTE
    JOIN cultivo c          ON c.id_nave = cfg.id_nave AND c.activo
    JOIN parametro_optimo p ON p.id_especie = c.id_especie
    WHERE ini.periodo_inicio + INTERVAL cfg.frecuencia_min MINUTE <= NOW()
    GROUP BY cfg.id_nave, ini.periodo_inicio, cfg.frecuencia_min;
END$$

DELIMITER ;

SET GLOBAL event_scheduler = ON;

CREATE EVENT IF NOT EXISTS ev_consolidar_historial
    ON SCHEDULE EVERY 5 MINUTE
    DO CALL sp_consolidar_historial();

CREATE EVENT IF NOT EXISTS ev_purgar_lecturas
    ON SCHEDULE EVERY 1 DAY STARTS (CURDATE() + INTERVAL 1 DAY + INTERVAL 3 HOUR)
    DO DELETE l FROM lectura l
       JOIN sensor s       ON s.id_sensor = l.id_sensor
       JOIN dispositivo d  ON d.id_dispositivo = s.id_dispositivo
       JOIN configuracion_registro c ON c.id_nave = d.id_nave
       WHERE l.fecha_hora < NOW() - INTERVAL c.dias_retencion_crudo DAY;

DELIMITER $$

CREATE TRIGGER trg_lectura_alerta
AFTER INSERT ON lectura
FOR EACH ROW
BEGIN
    DECLARE v_nave INT UNSIGNED;
    DECLARE v_hr_meta, v_tol DECIMAL(5,2);
    DECLARE v_tmin, v_tmax DECIMAL(4,1);

    SELECT d.id_nave, p.hr_meta, p.hr_tolerancia, p.temp_min_noche, p.temp_max_dia
      INTO v_nave, v_hr_meta, v_tol, v_tmin, v_tmax
    FROM sensor s
    JOIN dispositivo d      ON d.id_dispositivo = s.id_dispositivo
    JOIN cultivo c          ON c.id_nave = d.id_nave AND c.activo
    JOIN parametro_optimo p ON p.id_especie = c.id_especie
    WHERE s.id_sensor = NEW.id_sensor
    LIMIT 1;

    IF NEW.humedad_relativa > v_hr_meta + v_tol THEN
        INSERT INTO alerta (id_nave, id_lectura, tipo, valor_medido, valor_referencia, mensaje)
        VALUES (v_nave, NEW.id_lectura, 'HUMEDAD_ALTA', NEW.humedad_relativa, v_hr_meta,
                CONCAT('Humedad ', NEW.humedad_relativa, '% sobre la meta de ', v_hr_meta, '%'));
    ELSEIF NEW.humedad_relativa < v_hr_meta - v_tol THEN
        INSERT INTO alerta (id_nave, id_lectura, tipo, valor_medido, valor_referencia, mensaje)
        VALUES (v_nave, NEW.id_lectura, 'HUMEDAD_BAJA', NEW.humedad_relativa, v_hr_meta,
                CONCAT('Humedad ', NEW.humedad_relativa, '% bajo la meta de ', v_hr_meta, '%'));
    END IF;

    IF NEW.temperatura > v_tmax THEN
        INSERT INTO alerta (id_nave, id_lectura, tipo, severidad, valor_medido, valor_referencia, mensaje)
        VALUES (v_nave, NEW.id_lectura, 'TEMP_ALTA', 'CRITICA', NEW.temperatura, v_tmax,
                CONCAT('Temperatura ', NEW.temperatura, '°C sobre ', v_tmax, '°C'));
    ELSEIF NEW.temperatura < v_tmin THEN
        INSERT INTO alerta (id_nave, id_lectura, tipo, severidad, valor_medido, valor_referencia, mensaje)
        VALUES (v_nave, NEW.id_lectura, 'TEMP_BAJA', 'CRITICA', NEW.temperatura, v_tmin,
                CONCAT('Temperatura ', NEW.temperatura, '°C bajo ', v_tmin, '°C'));
    END IF;
END$$

DELIMITER ;

INSERT INTO usuario (nombre, email, password_hash, rol) VALUES
('Administrador OrquiClima', 'admin@orquiclima.cl', '$2b$12$hash_de_ejemplo', 'ADMIN'),
('Operador Invernadero',     'operador@orquiclima.cl', '$2b$12$hash_de_ejemplo', 'OPERADOR');

INSERT INTO invernadero (id_usuario, nombre, ubicacion) VALUES
(1, 'Invernadero Principal', 'Región de O''Higgins, Chile');

INSERT INTO nave (id_invernadero, codigo, numero_orden, nombre, superficie_m2) VALUES
(1, 'A', 1, 'Nave A', 250.00),
(1, 'B', 2, 'Nave B', 180.00),
(1, 'C', 3, 'Nave C', 120.00);

INSERT INTO especie (nombre_cientifico, nombre_comun, tipo_crecimiento) VALUES
('Phalaenopsis',         'Orquídea Mariposa', 'EPIFITA'),
('Cattleya trianae',     'Flor de Mayo',      'EPIFITA'),
('Dendrobium nobile',    'Dendrobium',        'EPIFITA'),
('Vanda coerulea',       'Vanda Azul',        'EPIFITA'),
('Oncidium',             'Lluvia de Oro',     'EPIFITA');

INSERT INTO parametro_optimo (id_especie, hr_meta, temp_min_noche, temp_max_dia) VALUES
(1, 80.00, 18.0, 24.0),
(2, 80.00, 18.0, 24.0),
(3, 80.00, 18.0, 24.0),
(4, 80.00, 18.0, 24.0),
(5, 80.00, 18.0, 24.0);

INSERT INTO cultivo (id_nave, id_especie, cantidad_plantas) VALUES
(1, 1, 1420),
(2, 2,  500),
(2, 3,  360),
(3, 4,  250),
(3, 5,  160);

INSERT INTO configuracion_registro (id_nave, frecuencia_min, modificado_por) VALUES
(1, 60, 1), (2, 60, 1), (3, 30, 1);

INSERT INTO dispositivo (id_nave, nombre, modelo_mcu, tipo_conexion, mac_address,
                         ip_address, api_token_hash, estado, ultima_conexion) VALUES
(1, 'Sonda perimetral A-1', 'ESP32-WROOM-32', 'WIFI',      '24:6F:28:AA:00:01', '192.168.1.51', 'tok_hash_a1', 'CONECTADO', NOW()),
(2, 'Sonda perimetral B-1', 'ESP32-WROOM-32', 'WIFI',      '24:6F:28:AA:00:02', '192.168.1.52', 'tok_hash_b1', 'CONECTADO', NOW()),
(3, 'Sonda perimetral C-1', 'ESP32-C3',       'BLE',       '24:6F:28:AA:00:03', NULL,           'tok_hash_c1', 'CONECTADO', NOW());

INSERT INTO sensor (id_dispositivo, tipo, modelo) VALUES
(1, 'HUM_TEMP', 'SHT31'),
(2, 'HUM_TEMP', 'SHT31'),
(3, 'HUM_TEMP', 'DHT22');

INSERT INTO lectura (id_sensor, humedad_relativa, temperatura) VALUES
(1, 86.40, 21.0),
(2, 67.90, 19.0),
(3, 85.50, 21.0);

INSERT INTO actuador (id_nave, id_dispositivo, tipo, nombre, estado, nivel_pct) VALUES
(1, 1, 'NEBULIZADOR',   'Nebulizador Nave A', 'ENCENDIDO', NULL),
(1, 1, 'MALLA_SOMBREO', 'Sombreo Nave A',     'ENCENDIDO', 65),
(2, 2, 'VENTILADOR',    'Ventilación Nave B', 'ENCENDIDO', NULL),
(3, 3, 'NEBULIZADOR',   'Nebulizador Nave C', 'ENCENDIDO', NULL),
(3, 3, 'MALLA_SOMBREO', 'Sombreo Nave C',     'ENCENDIDO', 65);

INSERT INTO calendario_riego (id_nave, id_usuario, nombre, dias_semana, hora_riego,
                              duracion_min, volumen_litros, fecha_inicio) VALUES
(1, 1, 'Riego Phalaenopsis',     'LUN,JUE',     '08:30:00', 10, 120.00, CURDATE()),
(2, 1, 'Riego Cattleya/Dendro',  'MAR,VIE',     '09:00:00', 12,  90.00, CURDATE()),
(3, 1, 'Riego Vanda/Oncidium',   'LUN,MIE,VIE', '07:30:00',  8,  60.00, CURDATE());

INSERT INTO riego_programado (id_calendario, fecha_hora_prog, estado) VALUES
(1, CONCAT(CURDATE(), ' 08:30:00'), 'NOTIFICADO'),
(2, CONCAT(CURDATE(), ' 09:00:00'), 'PENDIENTE'),
(3, CONCAT(CURDATE(), ' 07:30:00'), 'PENDIENTE');

SELECT codigo, especie, humedad_relativa, temperatura, dpv_kpa, punto_rocio,
       hr_en_rango, temp_en_rango
FROM v_estado_actual_nave;

SELECT id_lectura, humedad_relativa, temperatura, dpv_kpa, punto_rocio
FROM lectura WHERE id_sensor = 1 ORDER BY fecha_hora DESC LIMIT 1;

SELECT n.codigo, a.tipo, a.severidad, a.mensaje, a.fecha_hora
FROM alerta a JOIN nave n ON n.id_nave = a.id_nave
WHERE a.resuelta = FALSE ORDER BY a.fecha_hora DESC;

UPDATE configuracion_registro SET frecuencia_min = 30, modificado_por = 1
WHERE id_nave = 1;

SELECT n.codigo, h.periodo_inicio, h.hr_promedio, h.temp_promedio,
       h.dpv_promedio, h.en_rango
FROM historial_ambiental h JOIN nave n ON n.id_nave = h.id_nave
WHERE h.periodo_inicio >= NOW() - INTERVAL 24 HOUR
ORDER BY n.codigo, h.periodo_inicio;

SELECT rp.id_riego, cr.nombre, rp.fecha_hora_prog, cr.id_usuario
FROM riego_programado rp
JOIN calendario_riego cr ON cr.id_calendario = rp.id_calendario
WHERE rp.estado = 'PENDIENTE'
  AND NOW() >= rp.fecha_hora_prog - INTERVAL cr.minutos_aviso MINUTE;

SELECT COUNT(*) AS pendientes_hoy FROM v_riegos_pendientes;

SELECT d.nombre, d.tipo_conexion, d.ultima_conexion
FROM dispositivo d
WHERE d.ultima_conexion < NOW() - INTERVAL 10 MINUTE OR d.estado <> 'CONECTADO';
