import 'dotenv/config';

export const puerto = Number(process.env.PORT) || 3000;

// Clave del panel de administración (cabecera Authorization: Bearer). Sin ella, /api/admin queda deshabilitado.
export const adminToken = process.env.ADMIN_TOKEN || '';
// Secreto con el que se guardan los PIN de entrada (HMAC). Si cambia, todos los PIN dejan de funcionar y hay que generarlos otra vez.
export const pinSecret = process.env.PIN_SECRET || adminToken || 'cambia-este-secreto';

/* Pagos. Stripe se activa solo si hay STRIPE_SECRET_KEY; el webhook necesita STRIPE_WEBHOOK_SECRET.
   APP_URL es la dirección pública del sitio (a donde Stripe regresa al cliente). */
export const pagos = {
  stripeClave: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhook: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripeHost: process.env.STRIPE_API_HOST || '', // solo pruebas con stripe-mock, p. ej. localhost:12111
  urlBase: (process.env.APP_URL || `http://localhost:${puerto}`).replace(/\/$/, ''),
  transferencia: process.env.PAGO_TRANSFERENCIA === '1',
  datosTransferencia: process.env.TRANSFERENCIA_DATOS || '', // p. ej. "BBVA · CLABE 0123… · Titular: Apolo GYM"
};

export const db = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'Proyecto_GYM',
};

export const marca = {
  nombre: process.env.GYM_NOMBRE || 'Apolo GYM',
  lema: process.env.GYM_LEMA || 'Tu gimnasio en Puebla, en tres sucursales.',
  descripcion:
    process.env.GYM_DESCRIPCION ||
    'Apolo GYM tiene tres sucursales en Puebla: Bugambilias, Castillotla y Villas San José. Sala de máquinas y pesas, clases de spinning y yoga, y clases juveniles. Elige la que te quede más cerca y entrena a tu ritmo.',
  acento: process.env.GYM_ACENTO || '#F8D048',
  ciudad: process.env.GYM_CIUDAD || 'Puebla',
};
