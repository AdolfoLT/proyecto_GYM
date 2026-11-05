-- Control de entrada por código QR y PIN para socios y personal (reemplaza al NFC).
-- Ejecutar DESPUÉS de proyecto_GYM.sql, admin_cambios.sql y pagos_acceso.sql
USE Proyecto_GYM;

-- Los socios ya tienen Codigo_App (QR). Ahora también PIN de 6 dígitos (se guarda solo su HMAC).
ALTER TABLE Socios
    ADD COLUMN Pin_Hash CHAR (64) NULL UNIQUE;

-- El personal (entrenadores, recepción…) entra igual que los socios
ALTER TABLE Empleados
    ADD COLUMN Codigo_App VARCHAR (20) NULL UNIQUE,
    ADD COLUMN Pin_Hash   CHAR (64)    NULL UNIQUE;

-- La bitácora de accesos guarda quién entró (socio o empleado), por dónde y con qué método (QR o PIN)
ALTER TABLE Accesos
    ADD COLUMN IdEmpleado INT         NULL,
    ADD COLUMN IdSucursal INT         NULL,
    ADD COLUMN Metodo     VARCHAR (10) NULL,
    ADD CONSTRAINT fk_accesos_empleado FOREIGN KEY (IdEmpleado) REFERENCES Empleados (IdEmpleado),
    ADD CONSTRAINT fk_accesos_sucursal FOREIGN KEY (IdSucursal) REFERENCES Sucursales (IdSucursal);

-- Opcional, si ya no vas a usar NFC:
-- ALTER TABLE Socios  DROP COLUMN Tarjeta_NFC;
-- ALTER TABLE Accesos DROP COLUMN Tarjeta;
