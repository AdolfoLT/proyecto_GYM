/* ===== Control de entrada =====
   Pantalla de la puerta. Cualquier persona (socio, entrenador, recepción…) marca su entrada de tres formas:
   1) PIN de 6 dígitos, en el teclado de la pantalla o en un teclado físico.
   2) Código QR con un lector USB (escribe el código como si fuera un teclado).
   3) Código QR con la cámara de la tableta o el celular (jsQR; la cámara pide HTTPS o localhost).
   El servidor decide si entra y registra el intento; el panel de administración se entera solo. */
import { admin } from './api-admin.js';
import { $, $$, esc, seguro } from './adm-comun.js';
import { fmt, fmtHora as hm, restante as rest, today } from './fechas.js';
import { entrarLista, sacudir } from './fx.js';

const RESULTADO_MS = 7000;
const PIN = /^\d{6}$/, CODIGO = /^[0-9A-F]{20}$/;

let buffer = '', tBuffer, tReset, ocupado = false, stream, tCamara, tApagar;
let sucursales = [];

/* ===== Sucursal de esta pantalla (se recuerda en el navegador) ===== */
async function cargarSucursales() {
  const cat = await seguro(() => admin.catalogos());
  sucursales = cat?.sucursales ?? [];
  const guardada = localStorage.getItem('entradaSucursal');
  $('#su').innerHTML = sucursales.map((s) => `<option value="${s.id}"${String(s.id) === guardada ? ' selected' : ''}>${esc(s.colonia)}</option>`).join('');
}
$('#su').onchange = (e) => localStorage.setItem('entradaSucursal', e.target.value);

/* ===== Lo que se va escribiendo ===== */
const pintar = () => $$('#dots i').forEach((p, i) => p.classList.toggle('on', i < buffer.length));

function limpiar() {
  buffer = '';
  clearTimeout(tBuffer); clearTimeout(tReset);
  pintar();
}

/** Enter, o 250 ms sin teclas: un PIN completo o un código QR completo se envían solos. Un lector de QR escribe más rápido que eso. */
function revisar(forzar) {
  if (PIN.test(buffer)) return enviar({ pin: buffer });
  if (CODIGO.test(buffer)) return enviar({ codigo: buffer });
  if (forzar && buffer) { sacudir($('#dots')); limpiar(); }
}

function escribir(c) {
  if (ocupado) return;
  buffer = (buffer + c).slice(0, 20);
  pintar();
  clearTimeout(tBuffer); clearTimeout(tReset);
  tBuffer = setTimeout(() => revisar(false), 250);
  tReset = setTimeout(limpiar, 10000); // un PIN a medias se descarta solo
}

$('#keys').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b || ocupado) return;
  const k = b.dataset.k;
  if (k === 'c') return limpiar();
  if (k === 'b') { buffer = buffer.slice(0, -1); return pintar(); }
  escribir(k);
  if (PIN.test(buffer)) { clearTimeout(tBuffer); revisar(false); } // con el teclado de la pantalla no hace falta esperar
};

document.addEventListener('keydown', (e) => {
  if ($('#lk').open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('select')) return;
  if (!$('#res').hidden) return mostrarInicio(); // cualquier tecla cierra el resultado
  if (e.key === 'Enter') { e.preventDefault(); return revisar(true); }
  if (e.key === 'Backspace') { buffer = buffer.slice(0, -1); return pintar(); }
  if (e.key === 'Escape') return limpiar();
  if (/^[0-9a-f]$/i.test(e.key)) escribir(e.key.toUpperCase());
});

/* ===== Cámara (jsQR) ===== */
const hayCamara = !!navigator.mediaDevices?.getUserMedia && typeof jsQR === 'function';
if (hayCamara) $('#cam').hidden = false;

async function abrirCamara() {
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
  catch { return seguro(() => Promise.reject(new Error('No se pudo abrir la cámara. Revisa el permiso del navegador.'))); }
  const v = $('#v');
  v.srcObject = stream;
  await v.play();
  $('#idle').hidden = true; $('#vid').hidden = false;
  const lienzo = document.createElement('canvas'), cx = lienzo.getContext('2d', { willReadFrequently: true });
  tCamara = setInterval(() => {
    if (!v.videoWidth) return;
    const ancho = Math.min(480, v.videoWidth);
    lienzo.width = ancho; lienzo.height = Math.round((v.videoHeight / v.videoWidth) * ancho);
    cx.drawImage(v, 0, 0, lienzo.width, lienzo.height);
    const q = jsQR(cx.getImageData(0, 0, lienzo.width, lienzo.height).data, lienzo.width, lienzo.height, { inversionAttempts: 'dontInvert' });
    const dato = q?.data.trim().toUpperCase();
    if (dato && CODIGO.test(dato)) { cerrarCamara(); enviar({ codigo: dato }); }
  }, 120);
  tApagar = setTimeout(() => { cerrarCamara(); mostrarInicio(); }, 45000); // si nadie muestra nada, se apaga sola
}

function cerrarCamara() {
  clearInterval(tCamara); clearTimeout(tApagar);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  $('#vid').hidden = true;
}
$('#cam').onclick = abrirCamara;
$('#camx').onclick = () => { cerrarCamara(); mostrarInicio(); };

/* ===== Envío y resultado ===== */
function sonido(bien) {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.value = bien ? 880 : 220;
    g.gain.setValueAtTime(0.12, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + (bien ? 0.15 : 0.35));
    o.connect(g).connect(a.destination);
    o.start(); o.stop(a.currentTime + 0.4);
  } catch { /* sin audio: no pasa nada */ }
}

let resetResultado;
function mostrarInicio() {
  clearTimeout(resetResultado);
  delete document.body.dataset.s;
  $('#res').hidden = true; $('#tm').hidden = true; $('#vid').hidden = true; $('#idle').hidden = false;
  limpiar();
}

async function enviar(datos) {
  ocupado = true;
  const idSucursal = +$('#su').value || undefined;
  limpiar();
  const r = await seguro(() => admin.entrada({ ...datos, idSucursal }));
  ocupado = false;
  if (!r) return mostrarInicio();
  mostrar(r);
}

function mostrar(r) {
  const p = r.persona, empleado = p?.tipo === 'Personal';
  const info = !p ? [] : empleado
    ? [['Puesto', p.puesto], ['Hora de entrada', new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })], ['Clases de hoy', r.clasesHoy.length ? r.clasesHoy.map((c) => `${c.inicio} ${c.clase}`).join(' · ') : 'Sin clases hoy'], ['Entradas este mes', r.visitasMes], ['Entrada anterior', r.ultimaVisita ? hm(r.ultimaVisita) : 'Primera entrada'], ['Sucursal', $('#su').selectedOptions[0]?.textContent ?? '—']]
    : [['Socio', p.id], ['Plan', r.membresia?.plan ?? '—'], ['Vigencia', r.membresia ? `${fmt(r.membresia.inicio)} – ${fmt(r.membresia.fin)}` : '—'], ['Tiempo restante', r.membresia && r.membresia.fin >= today() ? rest(r.membresia.fin) : '—'], ['Visitas este mes', r.visitasMes], ['Última visita', r.ultimaVisita ? hm(r.ultimaVisita) : 'Primera visita']];
  document.body.dataset.s = r.estado;
  $('#idle').hidden = true; $('#vid').hidden = true;
  const res = $('#res');
  res.hidden = false;
  res.innerHTML = `<p class="st2">${r.resultado === 'Permitido' ? 'Entrada registrada' : 'Acceso denegado'}${empleado ? ' · ' + esc(p.puesto) : ''}</p>
    <h1>${esc(p ? p.nombre : r.motivo)}</h1>${p && r.motivo ? `<p class="s3">${esc(r.motivo)}</p>` : ''}
    ${info.length ? `<dl class="inf">${info.map((i) => `<div><dt>${i[0]}</dt><dd>${esc(i[1])}</dd></div>`).join('')}</dl>` : ''}`;
  entrarLista(res.children);
  sonido(r.resultado === 'Permitido');
  const tm = $('#tm');
  tm.hidden = false;
  tm.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: RESULTADO_MS, easing: 'linear' });
  clearTimeout(resetResultado);
  resetResultado = setTimeout(mostrarInicio, RESULTADO_MS);
}
$('#res').onclick = mostrarInicio;

/* ===== Arranque ===== */
cargarSucursales();
