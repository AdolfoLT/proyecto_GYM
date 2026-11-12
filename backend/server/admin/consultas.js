import { pool, conTransaccion } from '../db.js';
import { ErrorHttp } from '../errores.js';
import { ESTADO, NOMBRE, ULTIMAS } from '../estados.js';
import { asegurar, nuevoPin, reemitir } from '../credenciales.js';
import { activarMembresia } from '../membresias.js';
import { ultimosAccesos } from './accesos.js';

const asegurarCredencial = (cx, idSocio) => asegurar(cx, 'socio', idSocio);

const existe = ([r], mensaje) => {
  if (!r.affectedRows) throw new ErrorHttp(404, mensaje);
};

/* ===== Resumen y catálogos ===== */
export async function resumen() {
  const [[filas], [[hoy]], [[coaches]], [porVencer], ultimos] = await Promise.all([
    pool.query(`${ULTIMAS} SELECT ${ESTADO} AS estado, COUNT(*) AS n
                FROM Socios s LEFT JOIN ult m ON m.IdSocio = s.IdSocio AND m.rn = 1 GROUP BY estado`),
    pool.query("SELECT COUNT(*) AS n FROM Accesos WHERE Resultado = 'Permitido' AND DATE(Fecha_Entrada) = CURDATE()"),
    pool.query("SELECT COUNT(*) AS n FROM Empleados WHERE Puesto = 'Entrenador' AND Estatus = 'Activo'"),
    pool.query(`${ULTIMAS} SELECT ${NOMBRE} AS nombre, m.Fecha_Fin AS fin
                FROM Socios s JOIN ult m ON m.IdSocio = s.IdSocio AND m.rn = 1
                WHERE ${ESTADO} = 'Por vencer' ORDER BY m.Fecha_Fin`),
    ultimosAccesos(6),
  ]);
  return {
    estados: Object.fromEntries(filas.map((f) => [f.estado, f.n])),
    accesosHoy: hoy.n,
    coachesActivos: coaches.n,
    porVencer,
    ultimosAccesos: ultimos,
  };
}

export async function catalogos() {
  const [[planes], [sucursales], [clases], [coaches], [socios]] = await Promise.all([
    pool.query('SELECT IdPlan AS id, Nombre AS nombre, Duracion_Dias AS dias, Precio AS precio FROM Planes ORDER BY Duracion_Dias'),
    pool.query('SELECT IdSucursal AS id, Codigo AS codigo, Colonia AS colonia FROM Sucursales ORDER BY Colonia'),
    pool.query('SELECT IdClase AS id, Nombre AS nombre FROM Clases ORDER BY Nombre'),
    pool.query("SELECT IdEmpleado AS id, CONCAT_WS(' ', Nombres, Apellidos) AS nombre FROM Empleados WHERE Puesto = 'Entrenador' AND Estatus = 'Activo' ORDER BY Nombres"),
    pool.query(`SELECT s.IdSocio AS id, ${NOMBRE} AS nombre FROM Socios s ORDER BY nombre`),
  ]);
  return { planes, sucursales, clases, coaches, socios };
}

/* ===== Membresías ===== */
export async function listarMembresias() {
  const [filas] = await pool.query(`
    SELECT m.IdMembresia AS id, m.IdSocio AS idSocio, ${NOMBRE} AS socio, p.IdPlan AS idPlan, p.Nombre AS plan,
           m.Fecha_Inicio AS inicio, m.Fecha_Fin AS fin, ${ESTADO} AS estado,
           m.Metodo_Elegido AS metodoElegido, CONCAT('MEM-', m.IdMembresia) AS referencia
    FROM Membresias m
    JOIN Socios s ON s.IdSocio = m.IdSocio
    JOIN Planes p ON p.IdPlan = m.IdPlan
    ORDER BY m.Fecha_Fin, m.IdMembresia`);
  return filas;
}

/** El pago se toma del precio del plan y queda en Pagos. */
const registrarPago = (cx, idMembresia, metodo) =>
  cx.query(
    `INSERT INTO Pagos (IdMembresia, Monto, Metodo_Pago)
     SELECT m.IdMembresia, p.Precio, ? FROM Membresias m JOIN Planes p ON p.IdPlan = m.IdPlan WHERE m.IdMembresia = ?`,
    [metodo, idMembresia]
  );

/** Con método de pago queda 'Vigente' y se registra el pago; sin método queda 'Pendiente'. */
export function crearMembresia(d) {
  return conTransaccion(async (cx) => {
    const [[plan]] = await cx.query('SELECT Duracion_Dias AS dias FROM Planes WHERE IdPlan = ?', [d.idPlan]);
    if (!plan) throw new ErrorHttp(400, 'El plan elegido no existe.');
    const [socio] = await cx.query('SELECT 1 FROM Socios WHERE IdSocio = ?', [d.idSocio]);
    if (!socio.length) throw new ErrorHttp(400, 'El socio elegido no existe.');

    const [r] = await cx.query(
      `INSERT INTO Membresias (IdSocio, IdPlan, Fecha_Inicio, Fecha_Fin, Estatus)
       VALUES (?, ?, ?, DATE_ADD(?, INTERVAL ? DAY), ?)`,
      [d.idSocio, d.idPlan, d.inicio, d.inicio, plan.dias, d.metodo ? 'Vigente' : 'Pendiente']
    );
    if (d.metodo) {
      await registrarPago(cx, r.insertId, d.metodo);
      await asegurarCredencial(cx, d.idSocio);
    }
    return { id: r.insertId };
  });
}

export async function actualizarMembresia(id, { idPlan, inicio }) {
  const resultado = await pool.query(
    `UPDATE Membresias m JOIN Planes p ON p.IdPlan = ?
     SET m.IdPlan = p.IdPlan, m.Fecha_Inicio = ?, m.Fecha_Fin = DATE_ADD(?, INTERVAL p.Duracion_Dias DAY)
     WHERE m.IdMembresia = ?`,
    [idPlan, inicio, inicio, id]
  );
  existe(resultado, 'La membresía o el plan no existe.');
}

export function cobrarMembresia(id, metodo) {
  return conTransaccion(async (cx) => {
    const [[m]] = await cx.query('SELECT IdSocio, Estatus FROM Membresias WHERE IdMembresia = ? FOR UPDATE', [id]);
    if (!m) throw new ErrorHttp(404, 'La membresía no existe.');
    if (m.Estatus !== 'Pendiente') throw new ErrorHttp(409, 'Esta membresía no está pendiente de pago.');
    await activarMembresia(cx, id); // la vigencia cuenta desde el cobro
    await registrarPago(cx, id, metodo);
    await asegurarCredencial(cx, m.IdSocio);
  });
}

/** Crea la siguiente membresía del mismo plan: empieza al día siguiente del fin, o hoy si ya venció. */
export function renovarMembresia(id, metodo) {
  return conTransaccion(async (cx) => {
    const [[m]] = await cx.query(
      `SELECT IdSocio, IdPlan, Estatus,
              IF(Fecha_Fin >= CURDATE(), DATE_ADD(Fecha_Fin, INTERVAL 1 DAY), CURDATE()) AS inicio
       FROM Membresias WHERE IdMembresia = ?`,
      [id]
    );
    if (!m) throw new ErrorHttp(404, 'La membresía no existe.');
    if (m.Estatus !== 'Vigente') throw new ErrorHttp(409, 'Solo se renuevan membresías vigentes o vencidas.');
    const [r] = await cx.query(
      `INSERT INTO Membresias (IdSocio, IdPlan, Fecha_Inicio, Fecha_Fin, Estatus)
       SELECT ?, p.IdPlan, ?, DATE_ADD(?, INTERVAL p.Duracion_Dias DAY), 'Vigente' FROM Planes p WHERE p.IdPlan = ?`,
      [m.IdSocio, m.inicio, m.inicio, m.IdPlan]
    );
    await registrarPago(cx, r.insertId, metodo);
    await asegurarCredencial(cx, m.IdSocio);
    return { id: r.insertId };
  });
}

export async function cancelarMembresia(id) {
  existe(await pool.query("UPDATE Membresias SET Estatus = 'Cancelada' WHERE IdMembresia = ?", [id]), 'La membresía no existe.');
}

export async function eliminarMembresia(id) {
  existe(await pool.query('DELETE FROM Membresias WHERE IdMembresia = ?', [id]), 'La membresía no existe.');
}

/* ===== Socios ===== */
export async function listarSocios() {
  const [filas] = await pool.query(`
    ${ULTIMAS}
    SELECT s.IdSocio AS id, s.Nombres AS nombres, s.Apellido_Paterno AS apellidoPaterno, s.Apellido_Materno AS apellidoMaterno,
           ${NOMBRE} AS nombre, s.Email AS email, s.Telefono AS telefono, s.IdSucursal AS idSucursal, su.Codigo AS sucursal,
           (s.Codigo_App IS NOT NULL) AS credencial, (s.Pin_Hash IS NOT NULL) AS pin, s.Fecha_Alta AS alta, s.Estatus AS estatus, ${ESTADO} AS estado
    FROM Socios s
    JOIN Sucursales su ON su.IdSucursal = s.IdSucursal
    LEFT JOIN ult m ON m.IdSocio = s.IdSocio AND m.rn = 1
    ORDER BY s.Fecha_Alta DESC, s.IdSocio DESC`);
  return filas;
}

/** El IdSocio lo genera el trigger Socios_Genera_Id. */
export function crearSocio(d) {
  return conTransaccion(async (cx) => {
    const [sucursal] = await cx.query('SELECT 1 FROM Sucursales WHERE IdSucursal = ?', [d.idSucursal]);
    if (!sucursal.length) throw new ErrorHttp(400, 'La sucursal elegida no existe.');
    const [repetido] = await cx.query('SELECT 1 FROM Socios WHERE Email = ? LIMIT 1', [d.email]);
    if (repetido.length) throw new ErrorHttp(409, 'Ese correo ya está registrado.');

    await cx.query(
      `INSERT INTO Socios (IdSucursal, Nombres, Apellido_Paterno, Apellido_Materno, Telefono, Email, Fecha_Alta)
       VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
      [d.idSucursal, d.nombres, d.apellidoPaterno, d.apellidoMaterno, d.telefono, d.email]
    );
    const [[socio]] = await cx.query('SELECT IdSocio FROM Socios WHERE Email = ?', [d.email]);
    return { id: socio.IdSocio };
  });
}

export async function actualizarSocio(id, d) {
  const [repetido] = await pool.query('SELECT 1 FROM Socios WHERE Email = ? AND IdSocio <> ? LIMIT 1', [d.email, id]);
  if (repetido.length) throw new ErrorHttp(409, 'Ese correo ya está registrado.');
  existe(
    await pool.query(
      `UPDATE Socios SET Nombres = ?, Apellido_Paterno = ?, Apellido_Materno = ?, Telefono = ?, Email = ?
       WHERE IdSocio = ?`,
      [d.nombres, d.apellidoPaterno, d.apellidoMaterno, d.telefono, d.email, id]
    ),
    'El socio no existe.'
  );
}

export async function cambiarEstatusSocio(id, estatus) {
  existe(await pool.query('UPDATE Socios SET Estatus = ? WHERE IdSocio = ?', [estatus, id]), 'El socio no existe.');
}

export async function eliminarSocio(id) {
  existe(await pool.query('DELETE FROM Socios WHERE IdSocio = ?', [id]), 'El socio no existe.');
}

/** Credencial de entrada de un socio ('socio') o de alguien del personal ('empleado'): código del QR (se emite si falta), PIN nuevo o QR reemitido. */
export const credencial = (tipo, id) => conTransaccion((cx) => asegurar(cx, tipo, id).then((codigo) => ({ codigo })));
export const reemitirCredencial = (tipo, id) => conTransaccion((cx) => reemitir(cx, tipo, id).then((codigo) => ({ codigo })));
export const generarPin = (tipo, id) => conTransaccion((cx) => nuevoPin(cx, tipo, id).then((pin) => ({ pin })));

/* ===== Personal (Empleados: entrenadores, recepción, administración…) ===== */
export async function listarPersonal() {
  const [filas] = await pool.query(`
    SELECT e.IdEmpleado AS id, e.Nombres AS nombres, e.Apellidos AS apellidos, CONCAT_WS(' ', e.Nombres, e.Apellidos) AS nombre,
           e.Puesto AS puesto, e.Telefono AS telefono, e.Fecha_Contratacion AS contratacion, e.Estatus AS estatus,
           (e.Codigo_App IS NOT NULL) AS credencial, (e.Pin_Hash IS NOT NULL) AS pin,
           (SELECT COUNT(*) FROM Horarios_Clase h WHERE h.IdEmpleado = e.IdEmpleado) AS clases
    FROM Empleados e ORDER BY e.Puesto, e.Nombres, e.Apellidos`);
  return filas;
}

/** Cada persona del personal nace con su código QR listo. */
export function crearPersonal(d) {
  return conTransaccion(async (cx) => {
    const [r] = await cx.query(
      'INSERT INTO Empleados (Nombres, Apellidos, Puesto, Telefono, Fecha_Contratacion) VALUES (?, ?, ?, ?, CURDATE())',
      [d.nombres, d.apellidos, d.puesto, d.telefono]
    );
    await asegurar(cx, 'empleado', r.insertId);
    return { id: r.insertId };
  });
}

export async function actualizarPersonal(id, d) {
  existe(
    await pool.query('UPDATE Empleados SET Nombres = ?, Apellidos = ?, Puesto = ?, Telefono = ? WHERE IdEmpleado = ?', [d.nombres, d.apellidos, d.puesto, d.telefono, id]),
    'La persona no existe.'
  );
}

export async function cambiarEstatusPersonal(id, estatus) {
  existe(await pool.query('UPDATE Empleados SET Estatus = ? WHERE IdEmpleado = ?', [estatus, id]), 'La persona no existe.');
}

export async function eliminarPersonal(id) {
  existe(await pool.query('DELETE FROM Empleados WHERE IdEmpleado = ?', [id]), 'La persona no existe.');
}

/* ===== Horarios de clase (Dia_Semana: 1 = lunes … 7 = domingo). Hora_Fin = inicio + duración de la clase ===== */
export async function listarHorarios() {
  const [filas] = await pool.query(`
    SELECT h.IdHorario AS id, h.IdClase AS idClase, c.Nombre AS clase, h.IdEmpleado AS idEmpleado,
           CONCAT_WS(' ', e.Nombres, e.Apellidos) AS coach, h.Dia_Semana AS dia,
           TIME_FORMAT(h.Hora_Inicio, '%H:%i') AS inicio, c.Duracion_Min AS duracion, h.Cupo_Max AS cupo
    FROM Horarios_Clase h
    JOIN Clases c    ON c.IdClase = h.IdClase
    JOIN Empleados e ON e.IdEmpleado = h.IdEmpleado
    ORDER BY h.Dia_Semana, h.Hora_Inicio`);
  return filas;
}

export async function crearHorario(d) {
  const [r] = await pool.query(
    `INSERT INTO Horarios_Clase (IdClase, IdEmpleado, Dia_Semana, Hora_Inicio, Hora_Fin, Cupo_Max)
     SELECT c.IdClase, ?, ?, ?, ADDTIME(?, SEC_TO_TIME(c.Duracion_Min * 60)), ? FROM Clases c WHERE c.IdClase = ?`,
    [d.idEmpleado, d.dia, d.inicio, d.inicio, d.cupo, d.idClase]
  );
  if (!r.affectedRows) throw new ErrorHttp(400, 'La clase elegida no existe.');
  return { id: r.insertId };
}

export async function actualizarHorario(id, d) {
  existe(
    await pool.query(
      `UPDATE Horarios_Clase h JOIN Clases c ON c.IdClase = ?
       SET h.IdClase = c.IdClase, h.IdEmpleado = ?, h.Dia_Semana = ?, h.Hora_Inicio = ?,
           h.Hora_Fin = ADDTIME(?, SEC_TO_TIME(c.Duracion_Min * 60)), h.Cupo_Max = ?
       WHERE h.IdHorario = ?`,
      [d.idClase, d.idEmpleado, d.dia, d.inicio, d.inicio, d.cupo, id]
    ),
    'El horario o la clase no existe.'
  );
}

export async function eliminarHorario(id) {
  existe(await pool.query('DELETE FROM Horarios_Clase WHERE IdHorario = ?', [id]), 'El horario no existe.');
}
