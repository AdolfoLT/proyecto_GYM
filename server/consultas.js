import { pool, conTransaccion } from './db.js';
import { ErrorHttp } from './errores.js';
import { buscar, nuevoPin } from './credenciales.js';
import { ESTADO } from './estados.js';
import { crearPendiente } from './membresias.js';

/* Dia_Semana: 1 = lunes … 7 = domingo.
   `Fecha` es la próxima fecha en que ocurre cada clase (hoy solo si todavía no empieza). */
const sqlHorarios = (filtro = '') => `
  SELECT h.IdHorario AS id, h.Dia_Semana AS dia, h.Fecha AS fecha, h.Cupo_Max AS cupo,
         TIME_FORMAT(h.Hora_Inicio, '%H:%i') AS inicio, TIME_FORMAT(h.Hora_Fin, '%H:%i') AS fin,
         c.Nombre AS clase, c.Descripcion AS descripcion, c.Duracion_Min AS duracion,
         CONCAT(e.Nombres, ' ', e.Apellidos) AS coach,
         (SELECT COUNT(*) FROM Reservaciones r
           WHERE r.IdHorario = h.IdHorario AND r.Fecha_Clase = h.Fecha AND r.Estatus = 'Reservada') AS ocupados
  FROM (
    SELECT hc.*, DATE_ADD(CURDATE(), INTERVAL IF(
      MOD(hc.Dia_Semana - 1 - WEEKDAY(CURDATE()) + 7, 7) = 0 AND hc.Hora_Inicio <= CURTIME(),
      7, MOD(hc.Dia_Semana - 1 - WEEKDAY(CURDATE()) + 7, 7)) DAY) AS Fecha
    FROM Horarios_Clase hc
  ) h
  JOIN Clases c    ON c.IdClase = h.IdClase
  JOIN Empleados e ON e.IdEmpleado = h.IdEmpleado
  ${filtro}
  ORDER BY h.Dia_Semana, h.Hora_Inicio`;

export async function obtenerResumen() {
  const [[[stats]], [sucursales], [planes], [clases]] = await Promise.all([
    pool.query(`SELECT (SELECT COUNT(*) FROM Sucursales) AS sucursales,
                       (SELECT COUNT(*) FROM Horarios_Clase) AS clasesSemana,
                       (SELECT COUNT(*) FROM Empleados WHERE Puesto = 'Entrenador') AS entrenadores`),
    pool.query(`SELECT IdSucursal AS id, Codigo AS codigo, Colonia AS colonia, Direccion AS direccion, Telefono AS telefono
                FROM Sucursales ORDER BY Colonia`),
    pool.query('SELECT IdPlan AS id, Nombre AS nombre, Duracion_Dias AS dias, Precio AS precio FROM Planes ORDER BY Duracion_Dias'),
    pool.query('SELECT Nombre AS nombre FROM Clases ORDER BY Nombre'),
  ]);
  return { stats, sucursales, planes, clases };
}

export async function listarHorarios() {
  const [filas] = await pool.query(sqlHorarios());
  return filas;
}

/** Alta de socio. El IdSocio lo genera el trigger Socios_Genera_Id; si se elige plan, queda una membresía 'Pendiente' con el método de pago elegido. */
export function crearSocio(d) {
  return conTransaccion(async (cx) => {
    const [sucursal] = await cx.query('SELECT 1 FROM Sucursales WHERE IdSucursal = ?', [d.idSucursal]);
    if (!sucursal.length) throw new ErrorHttp(400, 'La sucursal elegida no existe.');

    const [existe] = await cx.query('SELECT 1 FROM Socios WHERE Email = ? LIMIT 1', [d.email]);
    if (existe.length) throw new ErrorHttp(409, 'Ese correo ya está registrado.');

    await cx.query(
      `INSERT INTO Socios (IdSucursal, Nombres, Apellido_Paterno, Apellido_Materno, Fecha_Nacimiento, Telefono, Email, Fecha_Alta)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE())`,
      [d.idSucursal, d.nombres, d.apellidoPaterno, d.apellidoMaterno, d.fechaNacimiento, d.telefono, d.email]
    );
    const [[socio]] = await cx.query('SELECT IdSocio FROM Socios WHERE Email = ?', [d.email]);

    const idMembresia = d.idPlan ? await crearPendiente(cx, { idSocio: socio.IdSocio, idPlan: d.idPlan, metodo: d.metodo }) : null;
    return { idSocio: socio.IdSocio, idMembresia };
  });
}

export function crearReservacion(idSocio, idHorario) {
  return conTransaccion(async (cx) => {
    // Bloquea el horario para que dos reservas simultáneas no rebasen el cupo
    await cx.query('SELECT IdHorario FROM Horarios_Clase WHERE IdHorario = ? FOR UPDATE', [idHorario]);
    const [[h]] = await cx.query(sqlHorarios('WHERE h.IdHorario = ?'), [idHorario]);
    if (!h) throw new ErrorHttp(404, 'La clase no existe.');

    const [socio] = await cx.query("SELECT 1 FROM Socios WHERE IdSocio = ? AND Estatus = 'Activo'", [idSocio]);
    if (!socio.length) throw new ErrorHttp(404, 'No encontramos un socio activo con ese ID.');

    const [membresia] = await cx.query(
      "SELECT 1 FROM Membresias WHERE IdSocio = ? AND Estatus = 'Vigente' AND ? BETWEEN Fecha_Inicio AND Fecha_Fin LIMIT 1",
      [idSocio, h.fecha]
    );
    if (!membresia.length) throw new ErrorHttp(403, 'Tu membresía no está vigente para esa fecha. Acércate a recepción.');

    const [repetida] = await cx.query(
      "SELECT 1 FROM Reservaciones WHERE IdHorario = ? AND IdSocio = ? AND Fecha_Clase = ? AND Estatus = 'Reservada'",
      [idHorario, idSocio, h.fecha]
    );
    if (repetida.length) throw new ErrorHttp(409, 'Ya tienes un lugar en esta clase.');
    if (h.ocupados >= h.cupo) throw new ErrorHttp(409, 'Esta clase ya está llena.');

    await cx.query('INSERT INTO Reservaciones (IdHorario, IdSocio, Fecha_Clase) VALUES (?, ?, ?)', [idHorario, idSocio, h.fecha]);
    return { clase: h.clase, fecha: h.fecha, inicio: h.inicio, restantes: h.cupo - h.ocupados - 1 };
  });
}

/** Datos de la página "Mi acceso": entra con el código de su credencial (enlace personal). Sirve para socios y para el personal. */
export async function obtenerMiAcceso(codigo) {
  const [[socio]] = await pool.query('SELECT IdSocio AS id, Nombres AS nombre, Estatus AS estatus FROM Socios WHERE Codigo_App = ?', [codigo]);
  if (socio) {
    const [[membresia]] = await pool.query(
      `SELECT p.Nombre AS plan, m.Fecha_Inicio AS inicio, m.Fecha_Fin AS fin, ${ESTADO} AS estado
       FROM Membresias m JOIN Planes p ON p.IdPlan = m.IdPlan
       WHERE m.IdSocio = ? ORDER BY (m.Estatus = 'Vigente') DESC, m.Fecha_Fin DESC LIMIT 1`,
      [socio.id]
    );
    return { persona: { ...socio, tipo: 'Socio' }, membresia: membresia ?? null };
  }
  const [[empleado]] = await pool.query(
    "SELECT IdEmpleado AS id, Nombres AS nombre, Puesto AS puesto, Estatus AS estatus FROM Empleados WHERE Codigo_App = ?", [codigo]);
  if (!empleado) throw new ErrorHttp(401, 'Este enlace ya no es válido. Pide uno nuevo en recepción.');
  return { persona: { ...empleado, tipo: 'Personal' }, membresia: null };
}

/** PIN propio (6 dígitos) para marcar la entrada sin el celular. Se devuelve una sola vez; el anterior deja de servir. */
export function generarMiPin(codigo) {
  return conTransaccion(async (cx) => {
    const quien = await buscar(cx, { codigo });
    if (!quien) throw new ErrorHttp(401, 'Este enlace ya no es válido. Pide uno nuevo en recepción.');
    return { pin: await nuevoPin(cx, quien.tipo, quien.id) };
  });
}

/** Renovación en línea: nueva membresía pendiente del mismo plan (o reutiliza la pendiente que ya exista). */
export function renovarMiAcceso(codigo, metodo) {
  return conTransaccion(async (cx) => {
    const [[m]] = await cx.query(
      `SELECT s.IdSocio AS idSocio, m.IdPlan AS idPlan FROM Socios s JOIN Membresias m ON m.IdSocio = s.IdSocio
       WHERE s.Codigo_App = ? ORDER BY m.IdMembresia DESC LIMIT 1`,
      [codigo]
    );
    if (!m) throw new ErrorHttp(404, 'No encontramos una membresía para renovar. Acércate a recepción.');
    return crearPendiente(cx, { idSocio: m.idSocio, idPlan: m.idPlan, metodo });
  });
}
