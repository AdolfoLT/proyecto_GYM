/* "Mi acceso": credencial digital de un socio o de alguien del personal. El código viaja en el enlace (#CODIGO) y funciona como su
   tarjeta: se muestra como QR para el lector del gimnasio, y desde aquí se puede generar un PIN de 6 dígitos para marcar la entrada. */
import { generarMiPin, obtenerMiAcceso, renovarMiAcceso } from './api.js';
import { fmt, restante } from './fechas.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const codigo = location.hash.slice(1).toUpperCase();
const CLASE = { Activa: 'ok', 'Por vencer': 'warn', Pendiente: 'warn', Vencida: 'no', Cancelada: 'no' };
const ETIQUETA = { stripe: 'En línea (Stripe)', sucursal: 'En recepción', transferencia: 'Transferencia' };

function error(mensaje) {
  $('#m-e').className = 'estado no';
  $('#m-e').textContent = 'Sin acceso';
  $('#m-n').textContent = 'Enlace no válido';
  $('#m-d').textContent = mensaje;
}

function pintar({ persona, membresia: m, qr, pagos }) {
  const personal = persona.tipo === 'Personal';
  const estado = personal ? persona.puesto : m?.estado ?? 'Sin membresía';
  $('#m-e').className = 'estado ' + (personal ? (persona.estatus === 'Activo' ? 'ok' : 'no') : CLASE[estado] || 'no');
  $('#m-e').textContent = estado;
  $('#m-n').textContent = persona.nombre;
  $('#m-d').textContent = persona.estatus === 'Activo' ? 'Muestra este código en el lector al entrar.' : 'Tu acceso está bloqueado. Habla con recepción.';
  const info = personal ? [['Puesto', persona.puesto]] : [['Socio', persona.id], ['Plan', m ? m.plan : '—'], ['Vigencia', m ? `${fmt(m.inicio)} – ${fmt(m.fin)}` : '—'], ['Tiempo restante', m && ['Activa', 'Por vencer'].includes(estado) ? restante(m.fin) : '—']];
  const opciones = Object.keys(ETIQUETA).filter((k) => pagos[k]).map((k) => `<option value="${k}">${ETIQUETA[k]}</option>`).join('');
  $('#caja').insertAdjacentHTML('beforeend', `
    <div class="qr" role="img" aria-label="Código QR de acceso">${qr}</div>
    <p class="codigo">${esc(codigo)}</p>
    <dl class="mi-inf">${info.map((i) => `<div><dt>${i[0]}</dt><dd>${esc(i[1])}</dd></div>`).join('')}</dl>
    <p class="sm">Este código es como tu tarjeta: no lo compartas. Si pierdes tu celular, pide uno nuevo en recepción.</p>
    <div class="renovar" id="pn"><h2 class="s3">Entrar con PIN</h2>
      <p>Si no traes tu celular, marca tu entrada con un PIN de 6 dígitos. Al generar uno nuevo, el anterior deja de servir.</p>
      <p class="pin" id="pn-v" hidden></p>
      <div class="acts2"><button class="btn alt" id="pn-b" type="button">Generar mi PIN</button></div></div>
    ${personal ? '' : `<form class="renovar" id="rn"><h2 class="s3">Renovar membresía</h2>
      <label>¿Cómo quieres pagar?<br><select id="rn-m">${opciones}</select></label>
      <p class="msg" id="rn-msg" role="status"></p>
      <button class="btn" type="submit">Continuar</button></form>`}`);
  $('#pn-b').onclick = nuevoPin;
  if (!personal) $('#rn').onsubmit = renovar;
}

async function nuevoPin(e) {
  const b = e.currentTarget;
  b.disabled = true;
  try {
    const { pin } = await generarMiPin(codigo);
    const v = $('#pn-v');
    v.hidden = false;
    v.innerHTML = `${esc(pin)}<small>Guárdalo: no se puede volver a ver.</small>`;
    b.textContent = 'Generar otro PIN';
  } catch (err) {
    $('#pn-v').hidden = false; $('#pn-v').textContent = err.message;
  }
  b.disabled = false;
}

async function renovar(e) {
  e.preventDefault();
  const msg = $('#rn-msg'), btn = $('#rn button');
  btn.disabled = true; msg.textContent = '';
  try {
    const { pago } = await renovarMiAcceso(codigo, $('#rn-m').value);
    if (pago.tipo === 'stripe') { msg.textContent = 'Abriendo el pago…'; location.href = pago.url; return; }
    msg.textContent = pago.tipo === 'transferencia'
      ? `Transfiere $${pago.monto} a: ${pago.datos}. Pon ${pago.referencia} como concepto; recepción confirmará tu pago al recibirlo.`
      : `${pago.aviso ? pago.aviso + ' ' : ''}Paga $${pago.monto} en recepción (${pago.sucursal.colonia}) con la referencia ${pago.referencia}.`;
  } catch (err) {
    msg.textContent = err.message;
  }
  btn.disabled = false;
}

if (!/^[0-9A-F]{20}$/.test(codigo)) {
  error('Abre el enlace completo que te dio recepción o que apareció al pagar.');
} else {
  obtenerMiAcceso(codigo).then(pintar).catch((e) => error(e.message));
}
