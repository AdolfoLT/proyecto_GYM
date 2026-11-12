/* Fragmentos SQL compartidos por el sitio público y el panel de administración. */

export const DIAS_AVISO = 7; // "Por vencer": faltan 7 días o menos
export const NOMBRE = "CONCAT_WS(' ', s.Nombres, s.Apellido_Paterno, s.Apellido_Materno)";

/* Estado de una membresía (alias `m`). Pendiente y Cancelada vienen de Estatus; Vencida y Por vencer se calculan por fecha. */
export const ESTADO = `CASE
  WHEN m.IdMembresia IS NULL THEN 'Sin membresía'
  WHEN m.Estatus = 'Pendiente' THEN 'Pendiente'
  WHEN m.Estatus = 'Cancelada' THEN 'Cancelada'
  WHEN m.Fecha_Fin < CURDATE() THEN 'Vencida'
  WHEN DATEDIFF(m.Fecha_Fin, CURDATE()) <= ${DIAS_AVISO} THEN 'Por vencer'
  ELSE 'Activa' END`;

/* Membresía que representa a cada socio (rn = 1): primero la vigente, luego la de fecha fin más reciente. */
export const ULTIMAS = `WITH ult AS (
  SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.IdSocio ORDER BY (m.Estatus = 'Vigente') DESC, m.Fecha_Fin DESC) AS rn
  FROM Membresias m)`;
