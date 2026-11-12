export class ErrorHttp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

/** Envuelve un handler async para que sus errores lleguen al middleware de errores. */
export const asincrono = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const ERRORES_MYSQL = {
  ER_NO_REFERENCED_ROW_2: [400, 'Revisa los datos enviados.'],
  ER_TRUNCATED_WRONG_VALUE: [400, 'Revisa los datos enviados.'],
  ER_DATA_TOO_LONG: [400, 'Alguno de los datos es demasiado largo.'],
  ER_DUP_ENTRY: [409, 'Ya existe un registro con ese dato (correo o tarjeta).'],
  ER_ROW_IS_REFERENCED_2: [409, 'No se puede eliminar: tiene registros relacionados.'],
  ER_SIGNAL_EXCEPTION: [409, null], // SIGNAL de los triggers: usa el mensaje del trigger
};

export function manejarErrores(err, _req, res, _next) {
  if (err instanceof ErrorHttp) return res.status(err.estado).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
  const conocido = ERRORES_MYSQL[err.code];
  if (conocido) return res.status(conocido[0]).json({ error: conocido[1] ?? err.sqlMessage });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
}
