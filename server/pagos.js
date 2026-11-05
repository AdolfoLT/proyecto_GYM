import Stripe from 'stripe';
import { marca, pagos } from './config.js';
import { conTransaccion, pool } from './db.js';
import { ErrorHttp } from './errores.js';
import { asegurar } from './credenciales.js';
import { activarMembresia } from './membresias.js';

/* Métodos que puede elegir el socio al inscribirse o renovar:
   stripe        pago en línea (Stripe Checkout, tarjeta u otros métodos activados en tu Dashboard)
   sucursal      paga en recepción de su sucursal (efectivo o tarjeta); recepción lo registra en el panel
   transferencia solo si PAGO_TRANSFERENCIA=1; recepción confirma al recibir el depósito */
const METODOS = ['stripe', 'sucursal', 'transferencia'];

export const opcionesPago = () => ({ stripe: Boolean(pagos.stripeClave), sucursal: true, transferencia: pagos.transferencia });

export function metodoPago(valor) {
  if (!METODOS.includes(valor) || !opcionesPago()[valor]) throw new ErrorHttp(400, 'Ese método de pago no está disponible.');
  return valor;
}

let cliente;
function stripe() {
  if (!cliente) {
    const [host, port] = pagos.stripeHost.split(':'); // STRIPE_API_HOST solo para pruebas con stripe-mock
    cliente = new Stripe(pagos.stripeClave, pagos.stripeHost ? { host, port: Number(port), protocol: 'http' } : {});
  }
  return cliente;
}

/** Instrucciones de pago para una membresía pendiente. Con 'stripe' crea la sesión de Checkout y devuelve su URL. */
export async function prepararPago(idMembresia, metodo) {
  const [[m]] = await pool.query(
    `SELECT m.IdMembresia AS id, m.IdSocio AS idSocio, p.Nombre AS plan, p.Precio AS precio, s.Email AS email, su.Colonia AS colonia, su.Direccion AS direccion
     FROM Membresias m
     JOIN Planes p     ON p.IdPlan = m.IdPlan
     JOIN Socios s     ON s.IdSocio = m.IdSocio
     JOIN Sucursales su ON su.IdSucursal = s.IdSucursal
     WHERE m.IdMembresia = ?`,
    [idMembresia]
  );
  if (!m) throw new ErrorHttp(404, 'La membresía no existe.');
  const base = { monto: m.precio, referencia: `MEM-${m.id}` };
  const sucursal = { ...base, tipo: 'sucursal', sucursal: { colonia: m.colonia, direccion: m.direccion } };

  if (metodo === 'transferencia') return { ...base, tipo: 'transferencia', datos: pagos.datosTransferencia };
  if (metodo !== 'stripe') return sucursal;

  try {
    const sesion = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: m.email,
      client_reference_id: String(m.id),
      metadata: { idMembresia: String(m.id), idSocio: m.idSocio },
      line_items: [{ quantity: 1, price_data: { currency: 'mxn', unit_amount: Math.round(m.precio * 100), product_data: { name: `Membresía ${m.plan} · ${marca.nombre}` } } }],
      success_url: `${pagos.urlBase}/pago.html?sesion={CHECKOUT_SESSION_ID}`,
      cancel_url: `${pagos.urlBase}/pago.html?cancelado=1`,
    });
    await pool.query('UPDATE Membresias SET Referencia = ? WHERE IdMembresia = ?', [sesion.id, m.id]);
    return { ...base, tipo: 'stripe', url: sesion.url };
  } catch (err) {
    console.error('[stripe] No se pudo crear la sesión de pago:', err.message);
    // La inscripción ya quedó registrada: se ofrece pagar en recepción en lugar de perderla
    return { ...sucursal, aviso: 'No pudimos abrir el pago en línea. Tu registro quedó guardado: paga en recepción o inténtalo más tarde.' };
  }
}

/** Webhook de Stripe: único punto que activa membresías pagadas en línea. Recibe el cuerpo SIN parsear (Buffer) para verificar la firma. */
export async function webhook(req, res) {
  if (!pagos.stripeClave || !pagos.stripeWebhook) return res.status(503).json({ error: 'Pagos en línea no configurados.' });
  let evento;
  try {
    evento = stripe().webhooks.constructEvent(req.body, req.get('stripe-signature') ?? '', pagos.stripeWebhook);
  } catch {
    return res.status(400).json({ error: 'Firma no válida.' });
  }
  const sesion = evento.data.object;
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(evento.type) && sesion.payment_status === 'paid') {
    console.log(`[stripe] ${evento.type} ${sesion.id}: ${await confirmarPagoStripe(sesion)}`);
  }
  res.json({ recibido: true }); // 2xx también para eventos que no nos interesan, o Stripe los reintenta
}

/** Idempotente: Stripe puede repetir el evento y no debe duplicar el pago. Devuelve qué pasó, para la bitácora. */
export function confirmarPagoStripe(sesion) {
  return conTransaccion(async (cx) => {
    const [[m]] = await cx.query(
      `SELECT m.IdMembresia AS id, m.IdSocio AS idSocio, m.Estatus AS estatus, p.Precio AS precio
       FROM Membresias m JOIN Planes p ON p.IdPlan = m.IdPlan WHERE m.IdMembresia = ? FOR UPDATE`,
      [Number(sesion.metadata?.idMembresia)]
    );
    if (!m) return 'ignorado: la sesión no corresponde a una membresía';

    const referencia = sesion.payment_intent ?? sesion.id;
    const [repetido] = await cx.query('SELECT 1 FROM Pagos WHERE Referencia_Externa = ?', [referencia]);
    if (repetido.length) return 'repetido';

    if (m.estatus !== 'Pendiente') { // p. ej. el socio pagó en recepción antes de terminar el pago en línea
      console.error(`[stripe] REVISAR ${sesion.id}: cobrado, pero la membresía ${m.id} ya estaba ${m.estatus}. Reembolsa en el Dashboard de Stripe si corresponde.`);
      return `no activada: la membresía estaba ${m.estatus}`;
    }
    if (sesion.currency !== 'mxn' || sesion.amount_total !== Math.round(m.precio * 100)) {
      console.error(`[stripe] REVISAR ${sesion.id}: cobrado ${sesion.amount_total} ${sesion.currency}, el plan cuesta ${m.precio} MXN`);
      return 'no activada: el monto no coincide con el plan';
    }
    await activarMembresia(cx, m.id);
    await cx.query("INSERT INTO Pagos (IdMembresia, Monto, Metodo_Pago, Referencia_Externa) VALUES (?, ?, 'Stripe', ?)", [m.id, m.precio, referencia]);
    await asegurar(cx, 'socio', m.idSocio);
    return 'activada';
  });
}

/** Para la página de "pago recibido": ¿ya se activó la membresía de esa sesión? Devuelve el enlace de acceso solo cuando sí. */
export async function estadoPorSesion(sesion) {
  const [[m]] = await pool.query(
    `SELECT m.Estatus AS estatus, s.Codigo_App AS codigo FROM Membresias m JOIN Socios s ON s.IdSocio = m.IdSocio WHERE m.Referencia = ?`,
    [sesion]
  );
  if (!m) throw new ErrorHttp(404, 'No encontramos ese pago.');
  const activo = m.estatus === 'Vigente';
  return { activo, acceso: activo && m.codigo ? `/mi-acceso.html#${m.codigo}` : null };
}
