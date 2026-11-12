/* Piezas compartidas por el panel (admin.html) y el control de entrada (entrada.html):
   avisos, errores de la API y el diálogo de la clave de administrador (#lk, #lm, #lc, #ts en el HTML). */
import { claveAdmin } from './api-admin.js';
import { sacudir } from './fx.js';

export const $ = (s, c = document) => c.querySelector(s);
export const $$ = (s, c = document) => [...c.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CLS = { Activa: 'ok', 'Por vencer': 'warn', Pendiente: 'warn', Vencida: 'no', Cancelada: 'no', 'Sin membresía': 'no', Emitida: 'ok', 'Sin emitir': 'warn', Permitido: 'ok', Denegado: 'no', Activo: 'ok', Inactivo: 'no', Bloqueado: 'no' };
export const tag = (s) => `<span class="tg ${CLS[s] || ''}">${esc(s)}</span>`;

let tt;
export function toast(m) {
  const t = $('#ts');
  t.textContent = m;
  t.classList.add('on');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('on'), 2800);
}

export function pedirClave(msg) {
  const lk = $('#lk');
  $('#lm').textContent = msg || 'Escribe la clave de administrador (ADMIN_TOKEN del archivo .env).';
  $('#lc').value = '';
  lk.showModal();
  if (msg) sacudir(lk);
  return new Promise((ok) => lk.addEventListener('close', () => { claveAdmin.poner($('#lc').value); ok(); }, { once: true }));
}
$('#lk')?.addEventListener('cancel', (e) => e.preventDefault());

/** Ejecuta una llamada a la API: si la clave falta o es incorrecta la pide y reintenta; otros errores salen como aviso. */
export async function seguro(fn) {
  try { return await fn(); }
  catch (e) {
    if (e.estado === 401) { await pedirClave(claveAdmin.leer() ? e.message : ''); return seguro(fn); }
    toast(e.message);
  }
}
