import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { pinSecret } from './config.js';
import { ErrorHttp } from './errores.js';

/* Credenciales de entrada para socios y personal. Cada persona tiene dos formas de marcar su entrada:
   - Código QR: 20 caracteres hexadecimales (80 bits aleatorios). Se muestra en "Mi acceso" o se imprime.
   - PIN de 6 dígitos: se guarda como HMAC (no se puede leer de vuelta, solo se muestra al generarlo) y es único entre socios y personal. */

const PERSONAS = {
  socio: { tabla: 'Socios', id: 'IdSocio' },
  empleado: { tabla: 'Empleados', id: 'IdEmpleado' },
};
const persona = (tipo) => PERSONAS[tipo] ?? (() => { throw new Error(`Tipo de persona desconocido: ${tipo}`); })();

export const generarCodigo = () => randomBytes(10).toString('hex').toUpperCase();
export const hashPin = (pin) => createHmac('sha256', pinSecret).update(pin).digest('hex');

/** Código QR de la persona; se emite si todavía no tiene. */
export async function asegurar(cx, tipo, id) {
  const { tabla, id: col } = persona(tipo);
  const [[p]] = await cx.query(`SELECT Codigo_App AS codigo FROM ${tabla} WHERE ${col} = ? FOR UPDATE`, [id]);
  if (!p) throw new ErrorHttp(404, 'La persona no existe.');
  if (p.codigo) return p.codigo;
  const codigo = generarCodigo();
  await cx.query(`UPDATE ${tabla} SET Codigo_App = ? WHERE ${col} = ?`, [codigo, id]);
  return codigo;
}

/** Código nuevo: el enlace y el QR anteriores dejan de funcionar (por ejemplo, si perdió el celular). */
export async function reemitir(cx, tipo, id) {
  const { tabla, id: col } = persona(tipo);
  const codigo = generarCodigo();
  const [r] = await cx.query(`UPDATE ${tabla} SET Codigo_App = ? WHERE ${col} = ?`, [codigo, id]);
  if (!r.affectedRows) throw new ErrorHttp(404, 'La persona no existe.');
  return codigo;
}

/** PIN nuevo de 6 dígitos, aleatorio y que nadie más use. Se devuelve una sola vez: en la base queda solo su HMAC. */
export async function nuevoPin(cx, tipo, id) {
  const { tabla, id: col } = persona(tipo);
  for (let intento = 0; intento < 25; intento++) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const h = hashPin(pin);
    const [usado] = await cx.query('SELECT 1 FROM Socios WHERE Pin_Hash = ? UNION ALL SELECT 1 FROM Empleados WHERE Pin_Hash = ? LIMIT 1', [h, h]);
    if (usado.length) continue;
    const [r] = await cx.query(`UPDATE ${tabla} SET Pin_Hash = ? WHERE ${col} = ?`, [h, id]);
    if (!r.affectedRows) throw new ErrorHttp(404, 'La persona no existe.');
    return pin;
  }
  throw new ErrorHttp(503, 'No se pudo generar un PIN libre. Inténtalo de nuevo.');
}

/** ¿A quién pertenece este código QR o PIN? → { tipo: 'socio' | 'empleado', id } o null. */
export async function buscar(cx, { codigo, pin }) {
  const [filas] = pin
    ? await cx.query('SELECT "socio" AS tipo, IdSocio AS id FROM Socios WHERE Pin_Hash = ? UNION ALL SELECT "empleado", IdEmpleado FROM Empleados WHERE Pin_Hash = ? LIMIT 1', [hashPin(pin), hashPin(pin)])
    : await cx.query('SELECT "socio" AS tipo, IdSocio AS id FROM Socios WHERE Codigo_App = ? UNION ALL SELECT "empleado", IdEmpleado FROM Empleados WHERE Codigo_App = ? LIMIT 1', [codigo, codigo]);
  return filas[0] ?? null;
}
