import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Carga siempre el .env ubicado en backend/, incluso si Node se inicia desde otra carpeta.
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendDir, '.env') });

export const puerto = Number(process.env.PORT) || 3000;

// Clave del panel administrativo. Se envía como Bearer desde la sesión del navegador.
export const adminToken = process.env.ADMIN_TOKEN || '';
// Mantén este secreto estable: cambiarlo invalida los PIN ya generados.
export const pinSecret = process.env.PIN_SECRET || adminToken || 'cambia-este-secreto-en-produccion';

// URL pública del frontend (Vercel). Stripe regresa al navegador a este dominio.
const urlFrontend = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

export const pagos = {
  stripeClave: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhook: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripeHost: process.env.STRIPE_API_HOST || '', // solo pruebas con stripe-mock
  urlBase: urlFrontend,
  transferencia: process.env.PAGO_TRANSFERENCIA === '1',
  datosTransferencia: process.env.TRANSFERENCIA_DATOS || '',
};

// Railway MySQL expone MYSQLHOST/MYSQLPORT/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE.
// También se admiten los nombres DB_* para desarrollo local u otros proveedores.
export const db = {
  host: process.env.DB_HOST || process.env.MYSQLHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT) || 3306,
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'Proyecto_GYM',
};

// Se aceptan varios orígenes separados por coma. Nunca se habilita CORS para cualquier dominio.
export const corsOrigins = new Set([
  urlFrontend,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean),
]);

export const marca = {
  nombre: process.env.GYM_NOMBRE || 'Apolo GYM',
  lema: process.env.GYM_LEMA || 'Tu gimnasio en Puebla, en tres sucursales.',
  descripcion:
    process.env.GYM_DESCRIPCION ||
    'Apolo GYM tiene tres sucursales en Puebla: Bugambilias, Castillotla y Villas San José. Sala de máquinas y pesas, clases de spinning y yoga, y clases juveniles. Elige la que te quede más cerca y entrena a tu ritmo.',
  acento: process.env.GYM_ACENTO || '#F8D048',
  ciudad: process.env.GYM_CIUDAD || 'Puebla',
};
