/* Página a la que Stripe regresa al cliente. La membresía la activa el webhook del servidor; aquí solo se espera y se avisa. */
import { obtenerEstadoPago } from './api.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const sesion = params.get('sesion');

function mostrar(estado, etiqueta, titulo, detalle, acciones = '') {
  const e = $('#p-e');
  e.className = 'estado ' + estado;
  e.textContent = etiqueta;
  $('#p-t').textContent = titulo;
  $('#p-d').textContent = detalle;
  $('#p-a').innerHTML = acciones;
}
const volver = '<a class="u" href="/">Volver al sitio</a>';

async function esperar() {
  mostrar('warn', 'Confirmando', 'Confirmando tu pago…', 'Esto tarda unos segundos. No cierres esta página.');
  for (let i = 0; i < 20; i++) {
    try {
      const { activo, acceso } = await obtenerEstadoPago(sesion);
      if (activo) {
        return mostrar('ok', 'Pago recibido', '¡Tu membresía está activa!', 'Ya puedes entrenar. Guarda tu acceso digital: es tu credencial para entrar al gimnasio.',
          (acceso ? `<a class="btn" href="${acceso}">Abrir mi acceso</a>` : '') + volver);
      }
    } catch { /* aún no hay datos: se reintenta */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  mostrar('warn', 'En proceso', 'Seguimos confirmando tu pago', 'Tarda más de lo normal. No pagues otra vez: tu membresía se activa en cuanto Stripe nos avise. Si ya te cobraron y no se activa, pregunta en recepción.', volver);
}

if (params.get('cancelado')) {
  mostrar('no', 'Pago cancelado', 'No se hizo ningún cobro', 'Tu registro sigue guardado. Puedes pagar en la recepción de tu sucursal y activar tu plan al momento.', volver);
} else if (sesion) {
  esperar();
} else {
  mostrar('no', 'Pago', 'No encontramos tu pago', 'Entra desde el enlace que te dio Stripe al terminar de pagar.', volver);
}
