import { obtenerGimnasio, obtenerHorarios, registrarSocio, reservarClase } from './api.js';
import { alEntrar, contar, entrarLista, foco, muelle, partir, pildora, revelar, sacudir } from './fx.js';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOY = (new Date().getDay() + 6) % 7; // 0 = lunes
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = (n) => '$' + Math.round(n).toLocaleString('es-MX');
const fechaCorta = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }); };
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const lugares = (h) => { const n = h.cupo - h.ocupados; return n <= 0 ? 'Llena' : `${n} ${n === 1 ? 'lugar' : 'lugares'}`; };
const duracion = (d) => (d >= 360 ? '1 año' : d % 30 === 0 ? `${d / 30} ${d === 30 ? 'mes' : 'meses'}` : `${d} días`);
const idGuardado = { leer: () => { try { return localStorage.getItem('idSocio') || ''; } catch { return ''; } }, poner: (v) => { try { localStorage.setItem('idSocio', v); } catch {} } };

let gym, horarios = [], dia = HOY, reservando = null;

/* ===== Secciones ===== */
function renderBase({ marca, stats, clases }) {
  document.documentElement.style.setProperty('--acc', marca.acento);
  document.title = marca.nombre;
  $('meta[name=description]').content = marca.lema;
  $('#lg').textContent = marca.nombre;
  $('#nm').textContent = marca.nombre;
  $('#bg').textContent = marca.nombre;
  $('#tg').textContent = marca.lema;
  $('#ds').textContent = marca.descripcion;
  $('#sts').innerHTML = [[stats.sucursales, 'sucursales'], [stats.clasesSemana, 'clases por semana'], [stats.entrenadores, 'coaches']]
    .map(([n, t]) => `<div data-r><b data-n="${n}">0</b><span class="sm">${t}</span></div>`).join('');
  const pista = clases.map((c) => `<li>${esc(c.nombre)}</li>`).join('');
  $('#am').innerHTML = `<ul>${pista}</ul><ul aria-hidden="true">${pista}</ul>`;
  $('#cp').textContent = `© ${new Date().getFullYear()} ${marca.nombre}`;
  $('#fl').innerHTML = gym.sucursales.filter((s) => s.telefono).map((s) => `<a href="tel:${esc(s.telefono)}">${esc(s.colonia)}</a>`).join('') + '<a href="#">Aviso de privacidad</a>';
}

function renderEstado() {
  const prox = [...horarios].sort((a, b) => (a.fecha + a.inicio).localeCompare(b.fecha + b.inicio))[0];
  const el = $('#st');
  if (!prox) { el.className = 'st'; el.innerHTML = '<i></i>Horarios de clases próximamente'; return; }
  const hoy = prox.fecha === hoyISO();
  el.className = 'st' + (hoy ? ' on' : '');
  el.innerHTML = `<i></i>Próxima clase · ${esc(prox.clase)} ${hoy ? 'hoy' : fechaCorta(prox.fecha)} ${prox.inicio} · ${lugares(prox)}`;
}

const fila = (h, k) => {
  const llena = h.ocupados >= h.cupo;
  return `<button data-id="${h.id}" ${llena ? 'disabled' : ''} style="--o:${Math.min(h.ocupados / h.cupo, 1).toFixed(2)};--k:${k}"><time>${h.inicio}</time><b>${esc(h.clase)}</b><span>${esc(h.coach)} · ${h.duracion} min · ${lugares(h)}</span><i>${llena ? 'Llena' : 'Reservar →'}</i><s></s></button>`;
};

function pintarFilas(animar) {
  const filas = horarios.filter((h) => h.dia === dia + 1);
  $('#rw').innerHTML = filas.length ? filas.map(fila).join('') : '<p><span></span><b>Descanso. Elige otro día.</b></p>';
  if (animar) entrarLista($$('#rw > *'));
}

function renderClases() {
  const dy = $('#dy');
  dy.innerHTML = '<span class="pill" aria-hidden="true"></span>' + DIAS.map((d, i) => `<button data-i="${i}" aria-pressed="${i === dia}">${d}</button>`).join('');
  const marcar = (b, animar) => { $$('button', dy).forEach((x) => x.setAttribute('aria-pressed', x === b)); pildora(dy, b, animar); };
  dy.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    dia = +b.dataset.i;
    marcar(b, true);
    pintarFilas(true);
  };
  $('#rw').onclick = (e) => {
    const b = e.target.closest('button[data-id]');
    if (b) abrirReserva(horarios.find((h) => h.id === +b.dataset.id));
  };
  pintarFilas(false);
  requestAnimationFrame(() => marcar($(`button[data-i="${dia}"]`, dy), false));
  document.fonts?.ready.then(() => pildora(dy, $(`button[data-i="${dia}"]`, dy), false));
}

function renderPlanes({ planes }) {
  const base = planes[0];
  const datos = planes.map((p) => {
    const mes = (p.precio / p.dias) * 30;
    return { ...p, mes, porDia: p.precio / p.dias, ahorro: Math.max(0, Math.round((1 - mes / ((base.precio / base.dias) * 30)) * 100)) };
  });
  const mejor = datos.reduce((a, b) => (b.ahorro > a.ahorro ? b : a));
  $('#pl').innerHTML = datos.map((p, i) => {
    const top = p.id === mejor.id && p.ahorro > 0;
    return `<div class="${top ? 'hl' : ''}" data-r style="--i:${i}"><p class="s3">${esc(p.nombre)}</p>${top ? `<em class="tag">Mejor precio · −${p.ahorro}%</em>` : ''}
      <p class="pr" data-d="${duracion(p.dias)}"><span data-t="${p.precio}" data-m="${p.mes}">${peso(p.precio)}</span><small>/ ${duracion(p.dias)}</small></p>
      <ul><li>Acceso por ${duracion(p.dias)}</li><li>$${p.porDia.toFixed(2)} por día</li><li>${p.ahorro ? `Ahorras ${p.ahorro}% frente al plan ${esc(base.nombre.toLowerCase())}` : 'Para empezar a tu ritmo'}</li></ul>
      <button class="btn" data-plan="${p.id}">Elegir ${esc(p.nombre)}</button></div>`;
  }).join('');
  let modo = 't';
  const poner = (m) => {
    if (m === modo) return;
    modo = m;
    $('#b0').setAttribute('aria-pressed', m === 't');
    $('#b1').setAttribute('aria-pressed', m === 'm');
    $$('#pl .pr').forEach((pr) => {
      const n = $('span', pr);
      contar(n, +n.dataset[m], { desde: +n.textContent.replace(/\D/g, ''), ms: 420, formato: peso });
      $('small', pr).textContent = m === 't' ? `/ ${pr.dataset.d}` : '/ mes';
    });
  };
  $('#b0').onclick = () => poner('t');
  $('#b1').onclick = () => poner('m');
  $('#pl').onclick = (e) => {
    const b = e.target.closest('[data-plan]');
    if (!b) return;
    $('#f-plan').value = b.dataset.plan;
    $('#unete').scrollIntoView();
  };
  foco($$('#pl > div'));
}

function renderSucursales({ marca, sucursales }) {
  $('#sv').innerHTML = sucursales.map((s, i) => {
    const lugar = s.direccion || `Col. ${s.colonia}`;
    const mapa = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${marca.nombre} ${lugar} ${marca.ciudad}`);
    return `<a href="${mapa}" target="_blank" rel="noopener" data-r style="--i:${i}"><b class="s3">${esc(s.colonia)}</b><span>${esc(s.direccion || `Col. ${s.colonia}, ${marca.ciudad}`)}</span><em>${s.telefono ? esc(s.telefono) : 'Cómo llegar →'}</em></a>`;
  }).join('');
  $('#f-suc').innerHTML = '<option value="" disabled selected>Elige sucursal</option>' + sucursales.map((s) => `<option value="${s.id}">${esc(s.colonia)}</option>`).join('');
}

/* ===== Registro de socio (el IdSocio lo genera el trigger de MySQL) ===== */
const FORMAS_PAGO = {
  stripe: ['En línea', 'Tarjeta y otros métodos, con pago seguro de Stripe'],
  sucursal: ['En recepción', 'Efectivo o tarjeta en tu sucursal'],
  transferencia: ['Transferencia', 'Te damos los datos al terminar tu registro'],
};

function iniciarRegistro({ planes, sucursales, pagos }) {
  $('#f-plan').innerHTML = '<option value="">Aún no sé</option>' + planes.map((p) => `<option value="${p.id}">${esc(p.nombre)} · ${peso(p.precio)}</option>`).join('');
  const disponibles = Object.keys(FORMAS_PAGO).filter((k) => pagos[k]);
  $('#f-pago-o').innerHTML = disponibles.map((k, i) => `<label><input type="radio" name="metodo" value="${k}"${i === 0 ? ' checked' : ''}><span>${FORMAS_PAGO[k][0]}</span><small>${FORMAS_PAGO[k][1]}</small></label>`).join('');
  $('#f-plan').onchange = () => { $('#f-pago').hidden = !$('#f-plan').value; };

  const fm = $('#fm'), msg = $('#fm-msg'), btn = $('button[type=submit]', fm);
  fm.onsubmit = async (e) => {
    e.preventDefault();
    msg.textContent = '';
    if (!fm.checkValidity()) { msg.textContent = 'Completa los campos obligatorios.'; $(':invalid', fm).focus(); return sacudir(fm); }
    btn.disabled = true;
    btn.textContent = 'Creando…';
    let redirigiendo = false;
    try {
      const datos = Object.fromEntries(new FormData(fm));
      if (!datos.idPlan) delete datos.metodo;
      const { idSocio, pago } = await registrarSocio(datos);
      idGuardado.poner(idSocio);
      if (pago?.tipo === 'stripe') { // la membresía se activa sola cuando Stripe confirma el pago
        redirigiendo = true;
        btn.textContent = 'Abriendo el pago…';
        location.href = pago.url;
        return;
      }
      mostrarTicket(idSocio, datos, planes, sucursales, pago);
    } catch (err) {
      msg.textContent = err.message;
      sacudir(fm);
    } finally {
      if (!redirigiendo) {
        btn.disabled = false;
        btn.textContent = 'Crear mi cuenta de socio';
      }
    }
  };
}

function textoPago(pago, plan, suc) {
  if (!pago) return `Sucursal ${suc.colonia}. Elige tu plan cuando quieras en recepción.`;
  const aviso = pago.aviso ? pago.aviso + ' ' : '';
  if (pago.tipo === 'transferencia') return `${aviso}Transfiere ${peso(pago.monto)} a: ${pago.datos}. Pon ${pago.referencia} como concepto; recepción confirma tu pago al recibirlo y activa tu plan ${plan.nombre}.`;
  const lugar = pago.sucursal.direccion ? `${pago.sucursal.colonia} (${pago.sucursal.direccion})` : pago.sucursal.colonia;
  return `${aviso}Paga ${peso(pago.monto)} en recepción de ${lugar} con la referencia ${pago.referencia} y tu plan ${plan.nombre} se activa al momento.`;
}

function mostrarTicket(idSocio, datos, planes, sucursales, pago) {
  const plan = planes.find((p) => p.id === +datos.idPlan);
  const suc = sucursales.find((s) => s.id === +datos.idSucursal);
  $('#tk-n').textContent = datos.nombres;
  $('#tk-id').textContent = `${idSocio.slice(0, 2)} ${idSocio.slice(2, 10)} ${idSocio.slice(10)}`;
  partir($('#tk-id'));
  $('#tk-d').textContent = textoPago(pago, plan, suc);
  $('#fm').hidden = true;
  const tk = $('#tk');
  tk.hidden = false;
  tk.animate([{ transform: 'translateY(-48px) rotate(-3deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { ...muelle(0.5, 0.25), fill: 'backwards' });
  requestAnimationFrame(() => $('#tk-id').classList.add('in'));
  $('#tk-c').onclick = async (e) => {
    await navigator.clipboard?.writeText(idSocio).catch(() => {});
    e.target.textContent = 'Copiado';
    setTimeout(() => (e.target.textContent = 'Copiar ID'), 1600);
  };
}

/* ===== Reservar clase ===== */
function abrirReserva(h) {
  reservando = h;
  $('#dlg-t').textContent = h.clase;
  $('#dlg-m').textContent = `${fechaCorta(h.fecha)} · ${h.inicio} · ${h.coach}`;
  $('#rs-id').value = idGuardado.leer();
  $('#rs-msg').textContent = '';
  $('#rs').hidden = false;
  $('#rs-ok').hidden = true;
  $('#dlg').showModal();
}

function iniciarReserva() {
  const dlg = $('#dlg');
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-cerrar]')) dlg.close(); });
  $('#rs').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', e.target), id = $('#rs-id').value.trim().toUpperCase();
    btn.disabled = true;
    try {
      const r = await reservarClase({ idSocio: id, idHorario: reservando.id });
      idGuardado.poner(id);
      $('#rs').hidden = true;
      $('#rs-ok').hidden = false;
      $('#rs-ok-t').textContent = `${r.clase} · ${fechaCorta(r.fecha)} a las ${r.inicio}. ` + (r.restantes ? `Quedan ${r.restantes} lugares.` : 'Fue el último lugar.');
      horarios = await obtenerHorarios();
      pintarFilas(false);
      renderEstado();
    } catch (err) {
      $('#rs-msg').textContent = err.message;
      sacudir($('#rs'));
    } finally {
      btn.disabled = false;
    }
  };
}

/* Reduce el nombre gigante del footer si el nombre del gimnasio no cabe en una línea */
function ajustarNombre() {
  const el = $('#bg');
  el.style.fontSize = '';
  const k = el.clientWidth / el.scrollWidth;
  if (k < 1) el.style.fontSize = `calc(19.5vw * ${k.toFixed(3)})`;
}

/* ===== Arranque ===== */
async function init() {
  try {
    [gym, horarios] = await Promise.all([obtenerGimnasio(), obtenerHorarios()]);
    renderBase(gym);
    renderEstado();
    renderClases();
    renderPlanes(gym);
    renderSucursales(gym);
    iniciarRegistro(gym);
    iniciarReserva();
  } catch (err) {
    console.error('No se pudo cargar el gimnasio:', err);
    document.documentElement.classList.remove('js');
    document.body.insertAdjacentHTML('afterbegin', '<p class="err">No se pudieron cargar los datos. Revisa que el servidor Node esté corriendo y que MySQL esté conectado.</p>');
    return;
  }
  partir($('#nm'));
  partir($('#bg'));
  ajustarNombre();
  document.fonts?.ready.then(ajustarNombre);
  addEventListener('resize', ajustarNombre);
  requestAnimationFrame(() => $('#nm').classList.add('in'));
  revelar();
  alEntrar($$('[data-n]'), (el) => contar(el, +el.dataset.n));
}
init();
