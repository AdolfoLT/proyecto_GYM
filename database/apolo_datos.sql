-- Datos de Apolo GYM: sucursales (direcciones tomadas de Google Maps). Ejecutar una sola vez.
SET NAMES utf8mb4;
USE Proyecto_GYM;

UPDATE Sucursales
SET Colonia = 'Bugambilias', Direccion = 'C. 16 de Septiembre 5918, Bugambilias, 72580 Heroica Puebla de Zaragoza, Pue.'
WHERE Codigo = 'BG';

UPDATE Sucursales
SET Colonia = 'Castillotla', Direccion = 'Plaza Castillotla, Calle 11 Sur 13501, San Isidro Castillotla, 72498 Heroica Puebla de Zaragoza, Pue.'
WHERE Codigo = 'CT';

-- La tercera sucursal era "Anzures" (AZ): ahora es Villas San José. Los IDs de socio ya creados con AZ siguen siendo válidos.
UPDATE Sucursales
SET Codigo = 'VS', Colonia = 'Villas San José', Direccion = 'C. 104 Pte. 34, Villas San José, Prof Jorge Murad M, 72016 Heroica Puebla de Zaragoza, Pue.'
WHERE Codigo = 'AZ';

-- Teléfonos: agrégalos cuando los tengas
-- UPDATE Sucursales SET Telefono = '222 000 0000' WHERE Codigo = 'BG';
