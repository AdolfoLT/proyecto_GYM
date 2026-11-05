-- Cambios para el panel de administración y el modo NFC (ejecutar DESPUÉS de proyecto_GYM.sql)
USE Proyecto_GYM;

-- Tarjeta NFC de cada socio (UID en hexadecimal, sin separadores)
ALTER TABLE Socios
    ADD COLUMN Tarjeta_NFC VARCHAR (20) NULL UNIQUE;

-- Bitácora de accesos: resultado, motivo y UID leído (IdSocio queda vacío si la tarjeta no está registrada)
ALTER TABLE Accesos
    MODIFY COLUMN IdSocio CHAR (15) NULL,
    ADD COLUMN Tarjeta   VARCHAR (20)  NULL,
    ADD COLUMN Resultado VARCHAR (20)  NOT NULL DEFAULT 'Permitido',
    ADD COLUMN Motivo    VARCHAR (100) NULL;

-- Coaches activos / inactivos
ALTER TABLE Empleados
    ADD COLUMN Estatus VARCHAR (20) NOT NULL DEFAULT 'Activo';

-- Corrección: Telefono estaba definido como VARCHAR (1)
ALTER TABLE Empleados
    MODIFY COLUMN Telefono VARCHAR (15);

-- Prueba del modo NFC con el socio demo (datos_demo.sql): UID 04A3F9AA01
-- UPDATE Socios SET Tarjeta_NFC = '04A3F9AA01' WHERE Email = 'demo@ejemplo.com';
