import { ErrorHttp } from './errores.js';

/** Crea (o reutiliza) la membresía 'Pendiente' de un socio. Empieza hoy, o al terminar la membresía vigente si todavía le quedan días. */
export async function crearPendiente(cx, { idSocio, idPlan, metodo }) {
  const [[plan]] = await cx.query('SELECT Duracion_Dias AS dias FROM Planes WHERE IdPlan = ?', [idPlan]);
  if (!plan) throw new ErrorHttp(400, 'El plan elegido no existe.');
  const [[{ inicio }]] = await cx.query(
    `SELECT GREATEST(CURDATE(), IFNULL(DATE_ADD(MAX(CASE WHEN Estatus = 'Vigente' THEN Fecha_Fin END), INTERVAL 1 DAY), CURDATE())) AS inicio
     FROM Membresias WHERE IdSocio = ?`,
    [idSocio]
  );
  const [[abierta]] = await cx.query("SELECT IdMembresia AS id FROM Membresias WHERE IdSocio = ? AND Estatus = 'Pendiente' LIMIT 1 FOR UPDATE", [idSocio]);
  if (abierta) {
    await cx.query(
      'UPDATE Membresias SET IdPlan = ?, Fecha_Inicio = ?, Fecha_Fin = DATE_ADD(?, INTERVAL ? DAY), Metodo_Elegido = ?, Referencia = NULL WHERE IdMembresia = ?',
      [idPlan, inicio, inicio, plan.dias, metodo, abierta.id]
    );
    return abierta.id;
  }
  const [r] = await cx.query(
    `INSERT INTO Membresias (IdSocio, IdPlan, Fecha_Inicio, Fecha_Fin, Estatus, Metodo_Elegido)
     VALUES (?, ?, ?, DATE_ADD(?, INTERVAL ? DAY), 'Pendiente', ?)`,
    [idSocio, idPlan, inicio, inicio, plan.dias, metodo]
  );
  return r.insertId;
}

/** Pasa una membresía pendiente a 'Vigente'. La vigencia cuenta desde el pago (o desde su inicio, si es futuro) y no desde la inscripción. */
export async function activarMembresia(cx, idMembresia) {
  await cx.query(
    `UPDATE Membresias m JOIN Planes p ON p.IdPlan = m.IdPlan
     SET m.Estatus = 'Vigente',
         m.Fecha_Inicio = GREATEST(m.Fecha_Inicio, CURDATE()),
         m.Fecha_Fin = DATE_ADD(GREATEST(m.Fecha_Inicio, CURDATE()), INTERVAL p.Duracion_Dias DAY)
     WHERE m.IdMembresia = ?`,
    [idMembresia]
  );
}
