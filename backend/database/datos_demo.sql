-- Datos de demostración para la página (ejecutar DESPUÉS de proyecto_GYM.sql)
SET NAMES utf8mb4;
USE Proyecto_GYM;

INSERT INTO Clases (Nombre, Descripcion, Duracion_Min) VALUES
    ('Funcional', 'Circuitos de fuerza y movilidad',        45),
    ('Spinning',  'Ciclismo indoor por intervalos',         45),
    ('Yoga',      'Flexibilidad, respiración y equilibrio', 60),
    ('Box fit',   'Cardio con técnica de box',              50),
    ('HIIT',      'Intervalos de alta intensidad',          40),
    ('Pilates',   'Control, postura y core',                55),
    ('Fuerza',    'Barra y mancuernas con progresión',      60);

INSERT INTO Empleados (Nombres, Apellidos, Puesto, Fecha_Contratacion) VALUES
    ('Ana',   'Ramírez',  'Entrenador', '2024-01-15'),
    ('Luis',  'Moreno',   'Entrenador', '2024-03-01'),
    ('Sofía', 'Paredes',  'Entrenador', '2024-06-10'),
    ('Diego', 'Cortés',   'Entrenador', '2025-02-03');

-- Dia_Semana: 1 = lunes … 7 = domingo. Hora_Fin = Hora_Inicio + duración de la clase.
-- Patrón A: lun, mié, vie · Patrón B: mar, jue · Patrón C: sábado
CREATE TEMPORARY TABLE Plantilla (Patron CHAR(1), Inicio TIME, Clase VARCHAR(50), Coach VARCHAR(100));
CREATE TEMPORARY TABLE Patrones  (Patron CHAR(1), Dia TINYINT);

INSERT INTO Plantilla VALUES
    ('A','06:00','Funcional','Ana'), ('A','07:30','Spinning','Luis'), ('A','12:00','Yoga','Sofía'),
    ('A','18:00','Box fit','Diego'),  ('A','19:30','HIIT','Ana'),
    ('B','06:00','HIIT','Diego'),     ('B','07:30','Pilates','Sofía'), ('B','12:00','Funcional','Ana'),
    ('B','18:00','Spinning','Luis'),  ('B','19:30','Fuerza','Diego'),
    ('C','08:00','Funcional','Ana'),  ('C','09:30','Spinning','Luis'), ('C','11:00','Yoga','Sofía');

INSERT INTO Patrones VALUES ('A',1), ('A',3), ('A',5), ('B',2), ('B',4), ('C',6);

INSERT INTO Horarios_Clase (IdClase, IdEmpleado, Dia_Semana, Hora_Inicio, Hora_Fin, Cupo_Max)
SELECT c.IdClase, e.IdEmpleado, pa.Dia, p.Inicio, ADDTIME(p.Inicio, SEC_TO_TIME(c.Duracion_Min * 60)), 20
FROM Plantilla p
JOIN Patrones pa ON pa.Patron = p.Patron
JOIN Clases c    ON c.Nombre = p.Clase
JOIN Empleados e ON e.Nombres = p.Coach;

DROP TEMPORARY TABLE Plantilla;
DROP TEMPORARY TABLE Patrones;

-- Socio de prueba con membresía vigente (el IdSocio lo genera el trigger)
INSERT INTO Socios (IdSucursal, Nombres, Apellido_Paterno, Email, Fecha_Alta)
VALUES (1, 'Demo', 'Socio', 'demo@ejemplo.com', CURDATE());

INSERT INTO Membresias (IdSocio, IdPlan, Fecha_Inicio, Fecha_Fin, Estatus)
SELECT IdSocio, 1, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'Vigente'
FROM Socios WHERE Email = 'demo@ejemplo.com';

SELECT IdSocio, Nombres FROM Socios WHERE Email = 'demo@ejemplo.com';   -- usa este ID para reservar clases
