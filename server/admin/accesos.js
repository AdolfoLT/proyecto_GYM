import { pool, conTransaccion } from '../db.js';
import { ErrorHttp } from '../errores.js';
import { buscar } from '../credenciales.js';
import { ESTADO, NOMBRE, ULTIMAS } from '../estados.js';

const INTENTOS_PIN_POR_MINUTO = 5;

/* Una fila por entrada, con todo lo que el panel muestra: quién es, su plan o puesto, cómo marcó y dónde. */
const DETALLE = `${ULTIMAS}
  SELECT a.IdAcceso AS id, a.Fecha_Entrada AS fecha,
         CASE WHEN a.IdSocio IS NOT NULL THEN 'Socio' ELSE COALESCE(e.Puesto, 'Sin identificar') END AS tipo,
         CASE WHEN a.IdSocio IS NOT NULL THEN ${NOMBRE}
              ELSE COALESCE(NULLIF(CONCAT_WS(' ', e.Nombres, e.Apellidos), ''), 'Persona no identificada') END AS persona,
         p.Nombre AS plan, m.Fecha_Fin AS fin, IF(a.IdSocio IS NULL, NULL, ${ESTADO}) AS membresia,
         a.Resultado AS resultado, COALESCE(a.Motivo, '—') AS motivo, COALESCE(a.Metodo, '—') AS metodo, su.Colonia AS sucursal
  FROM Accesos a
  LEFT JOIN Socios s     ON s.IdSocio = a.IdSocio
  LEFT JOIN Empleados e  ON e.IdEmpleado = a.IdEmpleado
  LEFT JOIN ult m        ON m.IdSocio = s.IdSocio AND m.rn = 1
  LEFT JOIN Planes p     ON p.IdPlan = m.IdPlan
  LEFT JOIN Sucursales su ON su.IdSucursal = a.IdSucursal`;

export async function ultimosAccesos(limite) {
  const [filas] = await pool.query(`${DETALLE} ORDER BY a.Fecha_Entrada DESC, a.IdAcceso DESC LIMIT ?`, [limite]);
  return filas;
}
export const listarAccesos = () => ultimosAccesos(150);

/** Para el aviso en vivo del panel: sin `desde` (null) devuelve solo el último id; con `desde`, las entradas posteriores. */
export async function accesosNuevos(desde) {
  if (desde == null) {
    const [[{ ultimo }]] = await pool.query('SELECT COALESCE(MAX(IdAcceso), 0) AS ultimo FROM Accesos');
    return { ultimo, accesos: [] };
  }
  const [filas] = await pool.query(`${DETALLE} WHERE a.IdAcceso > ? ORDER BY a.IdAcceso LIMIT 20`, [desde]);
  return { ultimo: filas.length ? filas[filas.length - 1].id : desde, accesos: filas };
}

/** Entradas anteriores de esa persona: la última permitida y cuántas van este mes (col: IdSocio | IdEmpleado, nunca viene del usuario). */
async function historial(cx, col, id) {
  const [[previa]] = await cx.query(
    `SELECT Fecha_Entrada AS fecha FROM Accesos WHERE ${col} = ? AND Resultado = 'Permitido' ORDER BY Fecha_Entrada DESC, IdAcceso DESC LIMIT 1`, [id]);
  const [[mes]] = await cx.query(
    `SELECT COUNT(*) AS n FROM Accesos WHERE ${col} = ? AND Resultado = 'Permitido' AND Fecha_Entrada >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`, [id]);
  return { previa: previa?.fecha ?? null, mes: mes.n };
}

/** Socio: [resultado, color del kiosko, motivo] según su acceso y su membresía. */
function decidirSocio(socio, m) {
  if (socio.estatus !== 'Activo') return ['Denegado', 'no', 'Acceso bloqueado por administración.'];
  const estado = m?.estado ?? 'Sin membresía';
  if (estado === 'Activa') return ['Permitido', 'ok', null];
  if (estado === 'Por vencer') {
    const cuando = m.dias === 0 ? 'hoy' : `en ${m.dias} ${m.dias === 1 ? 'día' : 'días'}`;
    return ['Permitido', 'warn', `Tu membresía vence ${cuando}. Renueva en recepción.`];
  }
  const motivos = { Pendiente: 'Pago pendiente. Pasa a recepción.', Vencida: 'Tu membresía venció. Renueva en recepción.', Cancelada: 'Tu membresía fue cancelada.' };
  return ['Denegado', 'no', motivos[estado] ?? 'Sin membresía registrada.'];
}

async function entradaSocio(cx, id, metodo, idSucursal) {
  const [[socio]] = await cx.query(`SELECT s.IdSocio AS id, ${NOMBRE} AS nombre, s.Estatus AS estatus FROM Socios s WHERE s.IdSocio = ?`, [id]);
  const [[m]] = await cx.query(
    `SELECT p.Nombre AS plan, m.Fecha_Inicio AS inicio, m.Fecha_Fin AS fin, DATEDIFF(m.Fecha_Fin, CURDATE()) AS dias, ${ESTADO} AS estado
     FROM Membresias m JOIN Planes p ON p.IdPlan = m.IdPlan
     WHERE m.IdSocio = ? ORDER BY (m.Estatus = 'Vigente') DESC, m.Fecha_Fin DESC LIMIT 1`, [id]);
  const [resultado, estado, motivo] = decidirSocio(socio, m);
  const antes = await historial(cx, 'IdSocio', id);
  await cx.query('INSERT INTO Accesos (IdSocio, IdSucursal, Metodo, Resultado, Motivo) VALUES (?, ?, ?, ?, ?)', [id, idSucursal, metodo, resultado, motivo]);
  const despues = await historial(cx, 'IdSocio', id);
  return {
    resultado, estado, motivo,
    persona: { tipo: 'Socio', id: socio.id, nombre: socio.nombre },
    membresia: m ? { plan: m.plan, inicio: m.inicio, fin: m.fin } : null,
    visitasMes: despues.mes, ultimaVisita: antes.previa,
  };
}

async function entradaEmpleado(cx, id, metodo, idSucursal) {
  const [[e]] = await cx.query(
    `SELECT IdEmpleado AS id, CONCAT_WS(' ', Nombres, Apellidos) AS nombre, Puesto AS puesto, Telefono AS telefono, Estatus AS estatus FROM Empleados WHERE IdEmpleado = ?`, [id]);
  const activo = e.estatus === 'Activo';
  const [resultado, estado, motivo] = activo ? ['Permitido', 'ok', null] : ['Denegado', 'no', 'Personal inactivo. Habla con administración.'];
  const [clasesHoy] = await cx.query(
    `SELECT TIME_FORMAT(h.Hora_Inicio, '%H:%i') AS inicio, c.Nombre AS clase
     FROM Horarios_Clase h JOIN Clases c ON c.IdClase = h.IdClase
     WHERE h.IdEmpleado = ? AND h.Dia_Semana = WEEKDAY(CURDATE()) + 1 ORDER BY h.Hora_Inicio`, [id]);
  const antes = await historial(cx, 'IdEmpleado', id);
  await cx.query('INSERT INTO Accesos (IdEmpleado, IdSucursal, Metodo, Resultado, Motivo) VALUES (?, ?, ?, ?, ?)', [id, idSucursal, metodo, resultado, motivo]);
  const despues = await historial(cx, 'IdEmpleado', id);
  return {
    resultado, estado, motivo,
    persona: { tipo: 'Personal', id: e.id, nombre: e.nombre, puesto: e.puesto, telefono: e.telefono },
    clasesHoy, visitasMes: despues.mes, ultimaVisita: antes.previa,
  };
}

/** Marca la entrada de cualquier persona (socio, entrenador, recepción…) con su código QR o su PIN. Registra también los intentos fallidos. */
export function registrarEntrada({ codigo, pin, idSucursal }) {
  return conTransaccion(async (cx) => {
    const metodo = pin ? 'PIN' : 'QR';
    if (pin) { // el PIN tiene pocas combinaciones: se limitan los intentos fallidos por minuto
      const [[{ n }]] = await cx.query(
        "SELECT COUNT(*) AS n FROM Accesos WHERE Metodo = 'PIN' AND IdSocio IS NULL AND IdEmpleado IS NULL AND Fecha_Entrada > DATE_SUB(NOW(), INTERVAL 1 MINUTE)");
      if (n >= INTENTOS_PIN_POR_MINUTO) throw new ErrorHttp(429, 'Demasiados intentos con PIN. Espera un minuto.');
    }
    const quien = await buscar(cx, { codigo, pin });
    if (!quien) {
      const motivo = pin ? 'PIN incorrecto.' : 'Código no registrado.';
      await cx.query("INSERT INTO Accesos (IdSucursal, Metodo, Resultado, Motivo) VALUES (?, ?, 'Denegado', ?)", [idSucursal, metodo, motivo]);
      return { resultado: 'Denegado', estado: 'no', motivo, persona: null };
    }
    return quien.tipo === 'socio' ? entradaSocio(cx, quien.id, metodo, idSucursal) : entradaEmpleado(cx, quien.id, metodo, idSucursal);
  });
}
