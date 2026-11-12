import express from 'express';
import { corsOrigins, puerto } from './config.js';
import { pool } from './db.js';
import { asincrono, manejarErrores } from './errores.js';
import adminRouter from './admin/rutas.js';
import { webhook } from './pagos.js';
import router from './rutas.js';

const app = express();
app.disable('x-powered-by');

// CORS restringido al dominio publicado en Vercel y a los orígenes locales de desarrollo.
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (!origin) return next(); // peticiones servidor-servidor, health checks y Stripe
  if (!corsOrigins.has(origin)) {
    return res.status(403).json({ error: 'Origen no autorizado.' });
  }

  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Stripe-Signature');
  res.set('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'apolo-gym-api' }));

// Stripe verifica la firma con el cuerpo original: esta ruta debe ir antes de express.json().
app.post('/api/pagos/webhook', express.raw({ type: 'application/json', limit: '1mb' }), asincrono(webhook));
app.use(express.json({ limit: '10kb' }));
app.use('/api/admin', adminRouter);
app.use('/api', router);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use(manejarErrores);

try {
  await pool.query('SELECT 1');
} catch (err) {
  console.error('No se pudo conectar a MySQL:', err.message);
  process.exit(1);
}

const server = app.listen(puerto, '0.0.0.0', () => {
  console.log(`API de Apolo GYM lista en el puerto ${puerto}`);
});

async function cerrar() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
