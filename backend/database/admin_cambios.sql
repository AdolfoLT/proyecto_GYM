-- Ajustes requeridos por el panel administrativo y la bitácora de accesos.
-- Ejecutar DESPUÉS de proyecto_GYM.sql.
USE Proyecto_GYM;

-- La bitácora puede registrar intentos de personal o de credenciales no reconocidas.
ALTER TABLE Accesos
    MODIFY COLUMN IdSocio CHAR (15) NULL,
    ADD COLUMN Resultado VARCHAR (20) NOT NULL DEFAULT 'Permitido',
    ADD COLUMN Motivo    VARCHAR (100) NULL;

-- El personal puede activarse o desactivarse desde el panel.
ALTER TABLE Empleados
    ADD COLUMN Estatus VARCHAR (20) NOT NULL DEFAULT 'Activo';
