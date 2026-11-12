# Preparación de MySQL

Crea o utiliza una instancia MySQL vacía y ejecuta los scripts en este orden, una sola vez:

1. `proyecto_GYM.sql` — crea la base `Proyecto_GYM`, tablas, triggers y catálogos iniciales.
2. `admin_cambios.sql` — agrega los campos que utiliza el panel administrativo y la bitácora.
3. `pagos_acceso.sql` — agrega los campos de membresías, pagos y QR de socios.
4. `apolo_acceso.sql` — habilita QR/PIN para el personal y registra sucursal/método de acceso.
5. `apolo_datos.sql` — completa direcciones y nombres de sucursales de Apolo GYM.
6. `datos_demo.sql` — **opcional**: carga clases, entrenadores, horarios y un socio de demostración.

`datos_demo.sql` inserta registros de ejemplo; no lo ejecutes si ya cargaste tus propios datos o si se ejecutó antes.

Los archivos `admin_cambios.sql`, `pagos_acceso.sql` y `apolo_acceso.sql` son migraciones: no los ejecutes por segunda vez sobre una base que ya tenga esas columnas.
