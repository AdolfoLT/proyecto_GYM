import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { puerto } from './config.js';
import { pool } from './db.js';
import { asincrono, manejarErrores } from './errores.js';
import adminRouter from './admin/rutas.js';
import { webhook } from './pagos.js';
import router from './rutas.js';

const publico = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const app = express();

app.disable('x-powered-by');
// El webhook de Stripe verifica la firma sobre el cuerpo sin parsear: debe ir ANTES de express.json()
app.post('/api/pagos/webhook', express.raw({ type: 'application/json', limit: '1mb' }), asincrono(webhook));
app.use(express.json({ limit: '10kb' }));
app.use('/api/admin', adminRouter);
app.use('/api', router);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use(express.static(publico));
app.use(manejarErrores);

try {
  await pool.query('SELECT 1');
} catch (err) {
  console.error('No se pudo conectar a MySQL:', err.message);
  process.exit(1);
}
app.listen(puerto, () => console.log(`Gimnasio listo en http://localhost:${puerto}`));
