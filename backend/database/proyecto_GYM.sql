-- Formato de IdUsuario e IdSocio: CODIGO(2) + AAAAMMDD + CONSECUTIVO ANUAL(5)
-- Ejemplo: BG2026102400001

CREATE DATABASE IF NOT EXISTS Proyecto_GYM;
USE Proyecto_GYM;

CREATE TABLE Sucursales (
    IdSucursal      INT            NOT NULL  AUTO_INCREMENT  PRIMARY KEY,
    Codigo          CHAR (2)       NOT NULL  UNIQUE,
    Colonia         VARCHAR (100)  NOT NULL,
    Direccion       VARCHAR (255),
    Telefono        VARCHAR (15)
);

CREATE TABLE Roles (
    IdRol           INT            NOT NULL  AUTO_INCREMENT  PRIMARY KEY,
    Nombre          VARCHAR (50)   NOT NULL  UNIQUE
);

-- Lleva el consecutivo anual de clientes
CREATE TABLE Counters (
    Counter_Type    VARCHAR (10)   NOT NULL,
    Counter_Year    INT            NOT NULL,
    Last_Number     INT            NOT NULL,
    PRIMARY KEY (Counter_Type, Counter_Year)
);

CREATE TABLE Usuarios (
    IdUsuario       CHAR (15)      NOT NULL  PRIMARY KEY,
    IdSucursal      INT            NOT NULL,
    Email           VARCHAR (150)  NOT NULL  UNIQUE,
    Password_Hash   VARCHAR (255)  NOT NULL,
    IdRol           INT            NOT NULL,
    Estatus         VARCHAR (20)   NOT NULL  DEFAULT 'Activo',
    Fecha_Creacion  DATETIME       NOT NULL  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (IdSucursal) REFERENCES Sucursales (IdSucursal),
    FOREIGN KEY (IdRol)      REFERENCES Roles (IdRol)
);

CREATE TABLE Socios (
    IdSocio          CHAR (15)      NOT NULL  PRIMARY KEY,
    IdSucursal       INT            NOT NULL,
    IdUsuario        CHAR (15),
    Nombres          VARCHAR (100)  NOT NULL,
    Apellido_Paterno VARCHAR (50)   NOT NULL,
    Apellido_Materno VARCHAR (50),
    Fecha_Nacimiento DATE,
    Telefono         VARCHAR (15),
    Email            VARCHAR (150),
    Fecha_Alta       DATE           NOT NULL  DEFAULT (CURDATE()),
    Estatus          VARCHAR (20)   NOT NULL  DEFAULT 'Activo',
    FOREIGN KEY (IdSucursal) REFERENCES Sucursales (IdSucursal),
    FOREIGN KEY (IdUsuario)  REFERENCES Usuarios (IdUsuario)
);

CREATE TABLE Planes (
    IdPlan          INT            NOT NULL  AUTO_INCREMENT  PRIMARY KEY,
    Nombre          VARCHAR (50)   NOT NULL,
    Duracion_Dias   INT            NOT NULL,
    Precio          DECIMAL (10,2) NOT NULL
);

CREATE TABLE Membresias (
    IdMembresia     INT            NOT NULL  AUTO_INCREMENT  PRIMARY KEY,
    IdSocio         CHAR (15)      NOT NULL,
    IdPlan          INT            NOT NULL,
    Fecha_Inicio    DATE           NOT NULL,
    Fecha_Fin       DATE           NOT NULL,
    Estatus         VARCHAR (20)   NOT NULL  DEFAULT 'Vigente',
    FOREIGN KEY (IdSocio) REFERENCES Socios (IdSocio),
    FOREIGN KEY (IdPlan)  REFERENCES Planes (IdPlan)
);

CREATE TABLE Pagos (
    IdPago          INT            NOT NULL  AUTO_INCREMENT  PRIMARY KEY,
    IdMembresia     INT            NOT NULL,
    Monto           DECIMAL (10,2) NOT NULL,
    Metodo_Pago     VARCHAR (20)   NOT NULL,
    Fecha_Pago      DATETIME       NOT NULL  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (IdMembresia) REFERENCES Membresias (IdMembresia)
);

CREATE TABLE Accesos (
    IdAcceso        INT            NOT NULL  AUTO_INCREMENT  PRIMARY KEY,
    IdSocio         CHAR (15)      NOT NULL,
    Fecha_Entrada   DATETIME       NOT NULL  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (IdSocio) REFERENCES Socios (IdSocio)
);

CREATE TABLE Empleados (
    IdEmpleado         INT            NOT NULL  AUTO_INCREMENT  PRIMARY KEY,
    IdUsuario          CHAR (15),
    Nombres            VARCHAR (100)  NOT NULL,
    Apellidos          VARCHAR (100)  NOT NULL,
    Puesto             VARCHAR (50)   NOT NULL,
    Telefono           VARCHAR (15),
    Fecha_Contratacion DATE           NOT NULL,
    FOREIGN KEY (IdUsuario) REFERENCES Usuarios (IdUsuario)
);

CREATE TABLE Clases (
    IdClase         INT            NOT NULL  AUTO_INCREMENT  PRIMARY KEY,
    Nombre          VARCHAR (50)   NOT NULL,
    Descripcion     VARCHAR (255),
    Duracion_Min    INT            NOT NULL
);

CREATE TABLE Horarios_Clase (
    IdHorario       INT            NOT NULL  AUTO_INCREMENT  PRIMARY KEY,
    IdClase         INT            NOT NULL,
    IdEmpleado      INT            NOT NULL,
    Dia_Semana      TINYINT        NOT NULL,
    Hora_Inicio     TIME           NOT NULL,
    Hora_Fin        TIME           NOT NULL,
    Cupo_Max        INT            NOT NULL,
    FOREIGN KEY (IdClase)    REFERENCES Clases (IdClase),
    FOREIGN KEY (IdEmpleado) REFERENCES Empleados (IdEmpleado)
);

CREATE TABLE Reservaciones (
    IdReservacion   INT            NOT NULL  AUTO_INCREMENT  PRIMARY KEY,
    IdHorario       INT            NOT NULL,
    IdSocio         CHAR (15)      NOT NULL,
    Fecha_Clase     DATE           NOT NULL,
    Estatus         VARCHAR (20)   NOT NULL  DEFAULT 'Reservada',
    FOREIGN KEY (IdHorario) REFERENCES Horarios_Clase (IdHorario),
    FOREIGN KEY (IdSocio)   REFERENCES Socios (IdSocio)
);

-- Triggers que generan los IDs
DELIMITER //

CREATE TRIGGER Socios_Genera_Id
BEFORE INSERT ON Socios
FOR EACH ROW
BEGIN
    DECLARE vCode CHAR (2);
    DECLARE vNumber INT;

    SELECT Codigo INTO vCode FROM Sucursales WHERE IdSucursal = NEW.IdSucursal;

    INSERT INTO Counters (Counter_Type, Counter_Year, Last_Number)
    VALUES ('Socio', YEAR(NEW.Fecha_Alta), 1)
    ON DUPLICATE KEY UPDATE Last_Number = Last_Number + 1;

    SELECT Last_Number INTO vNumber FROM Counters
    WHERE Counter_Type = 'Socio' AND Counter_Year = YEAR(NEW.Fecha_Alta);

    IF vNumber > 99999 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Limite anual de socios alcanzado';
    END IF;

    SET NEW.IdSocio = CONCAT(vCode, DATE_FORMAT(NEW.Fecha_Alta, '%Y%m%d'), LPAD(vNumber, 5, '0'));
END//

CREATE TRIGGER Usuarios_Genera_Id
BEFORE INSERT ON Usuarios
FOR EACH ROW
BEGIN
    DECLARE vCode CHAR (2);
    DECLARE vNumber INT;

    SELECT Codigo INTO vCode FROM Sucursales WHERE IdSucursal = NEW.IdSucursal;

    INSERT INTO Counters (Counter_Type, Counter_Year, Last_Number)
    VALUES ('Usuario', YEAR(CURDATE()), 1)
    ON DUPLICATE KEY UPDATE Last_Number = Last_Number + 1;

    SELECT Last_Number INTO vNumber FROM Counters
    WHERE Counter_Type = 'Usuario' AND Counter_Year = YEAR(CURDATE());

    IF vNumber > 99999 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Limite anual de usuarios alcanzado';
    END IF;

    SET NEW.IdUsuario = CONCAT(vCode, DATE_FORMAT(CURDATE(), '%Y%m%d'), LPAD(vNumber, 5, '0'));
END//

DELIMITER ;

-- Datos iniciales
INSERT INTO Sucursales (Codigo, Colonia) VALUES
    ('BG', 'Bugambilias'),
    ('CT', 'Castillotla'),
    ('AZ', 'Anzures');

INSERT INTO Roles (Nombre) VALUES ('Administrador'), ('Recepcion'), ('Entrenador'), ('Socio');

INSERT INTO Planes (Nombre, Duracion_Dias, Precio) VALUES
    ('Mensual',    30,  450.00),
    ('Trimestral', 90, 1200.00),
    ('Anual',     365, 4000.00);

-- Prueba:
-- INSERT INTO Socios (IdSucursal, Nombres, Apellido_Paterno, Fecha_Alta) VALUES (1, 'Juan', 'Perez', '2026-10-24');
-- SELECT IdSocio, Nombres FROM Socios;   -- BG2026102400001
