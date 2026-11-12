-- Pagos en línea (Stripe), método de pago elegido y credencial digital del socio.
-- Ejecutar DESPUÉS de proyecto_GYM.sql y admin_cambios.sql
USE Proyecto_GYM;

-- Credencial digital (código del QR), se emite sola al validarse el primer pago
ALTER TABLE Socios
    ADD COLUMN Codigo_App VARCHAR (20) NULL UNIQUE;

-- Cómo eligió pagar el socio (stripe | sucursal | transferencia) y la sesión de Stripe asociada
ALTER TABLE Membresias
    ADD COLUMN Metodo_Elegido VARCHAR (20)  NULL,
    ADD COLUMN Referencia     VARCHAR (100) NULL UNIQUE;

-- Id del pago en Stripe: el UNIQUE evita registrar dos veces el mismo pago si Stripe repite el aviso
ALTER TABLE Pagos
    ADD COLUMN Referencia_Externa VARCHAR (100) NULL UNIQUE;
