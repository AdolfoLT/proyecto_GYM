import mysql from 'mysql2/promise';
import { db } from './config.js';
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL
const sql = postgres(connectionString)

export default sql
export const pool = mysql.createPool({
  ...db,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // DATE/DATETIME llegan como texto 'AAAA-MM-DD', sin conversiones de zona horaria
  decimalNumbers: true, // DECIMAL llega como número (Precio, Monto)
});

/** Ejecuta fn(conexion) dentro de una transacción: commit si todo sale bien, rollback si algo falla. */
export async function conTransaccion(fn) {
  const cx = await pool.getConnection();
  try {
    await cx.beginTransaction();
    const resultado = await fn(cx);
    await cx.commit();
    return resultado;
  } catch (err) {
    await cx.rollback();
    throw err;
  } finally {
    cx.release();
  }
}
