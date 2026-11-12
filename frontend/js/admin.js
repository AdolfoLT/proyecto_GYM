/* ===== Panel administrativo =====
   Datos: API de Node (/api/admin, ver server/admin). Movimiento: fx.js. Piezas comunes con el control de entrada: adm-comun.js */
import { admin } from './api-admin.js';
import { obtenerGimnasio } from './api.js';
import { $, $$, esc, seguro, tag, toast } from './adm-comun.js';
import { fmt, fmtHora as hm, restante as rest, today } from './fechas.js';
import { contar, entrarLista } from './fx.js';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const METODOS = ['Efectivo', 'Tarjeta', 'Transferencia'];
const PUESTOS = ['Entrenador', 'Recepción', 'Administración', 'Limpieza', 'Otro'];
const PAGO = { stripe: 'En línea', sucursal: 'Recepción', transferencia: 'Transferencia' };

/* ===== Vistas =====
   c: colección de la API · fl: chips de filtro · f: formulario [campo, etiqueta, tipo, opciones, banderas]
   banderas: 'o' opcional · 'a' solo al crear · col: columnas · act: acciones de fila */
let cat = { planes: [], sucursales: [], clases: [], coaches: [], socios: [] };
const opSocios = () => cat.socios.map((s) => [s.id, s.nombre]);

const V = {
  resumen: { t: 'Resumen' },
  membresias: {
    t: 'Membresías', c: 'membresias', add: 'Nueva membresía', fl: ['Todas', 'Pendiente', 'Activa', 'Por vencer', 'Vencida', 'Cancelada'],
    f: [['idSocio', 'Socio', 'sel', opSocios, 'a'], ['idPlan', 'Plan', 'sel', () => cat.planes.map((p) => [p.id, `${p.nombre} · $${p.precio}`])], ['inicio', 'Inicio', 'date'], ['metodo', 'Pago', 'sel', [['', 'Pendiente'], ...METODOS], 'a']],
    col: [['Socio', 'socio'], ['Plan', 'plan'], ['Vigencia', (r) => `${fmt(r.inicio)} – ${fmt(r.fin)}`], ['Restante', (r) => ['Activa', 'Por vencer'].includes(r.estado) ? rest(r.fin) : '—'], ['Pago', (r) => r.estado === 'Pendiente' ? esc(`${PAGO[r.metodoElegido] || 'Sin elegir'} · ${r.referencia}`) : '—'], ['Estado', (r) => tag(r.estado)]],
    act: (r) => r.estado === 'Cancelada' ? [] : r.estado === 'Pendiente' ? [['Cobrar', 'cobrar'], ['Cancelar', 'cancelar']] : [['Renovar', 'renovar'], ['Cancelar', 'cancelar']]
  },
  socios: {
    t: 'Socios', c: 'socios', add: 'Nuevo socio', fl: ['Todos', 'Activa', 'Por vencer', 'Pendiente', 'Vencida', 'Bloqueado'],
    f: [['nombres', 'Nombres'], ['apellidoPaterno', 'Apellido paterno'], ['apellidoMaterno', 'Apellido materno', 'text', null, 'o'], ['email', 'Email', 'email'], ['telefono', 'Teléfono', 'tel', null, 'o'], ['idSucursal', 'Sucursal', 'sel', () => cat.sucursales.map((s) => [s.id, `${s.codigo} · ${s.colonia}`]), 'a']],
    col: [['ID', (r) => `<code>${esc(r.id)}</code>`], ['Nombre', 'nombre'], ['Membresía', (r) => tag(r.estado)], ['Credencial', (r) => tag(r.credencial ? 'Emitida' : 'Sin emitir')], ['Acceso', (r) => tag(r.estatus)]],
    est: ['Activo', 'Bloqueado'], act: (r) => [[r.estatus === 'Activo' ? 'Bloquear' : 'Desbloquear', 'estatus'], ['Credencial', 'cred']]
  },
  personal: {
    t: 'Personal', c: 'personal', add: 'Nueva persona', fl: ['Todos', ...PUESTOS, 'Inactivo'],
    f: [['nombres', 'Nombres'], ['apellidos', 'Apellidos'], ['puesto', 'Puesto', 'sel', PUESTOS], ['telefono', 'Teléfono', 'tel', null, 'o']],
    col: [['Nombre', 'nombre'], ['Puesto', 'puesto'], ['Teléfono', (r) => esc(r.telefono || '—')], ['Clases / semana', 'clases'], ['Credencial', (r) => tag(r.credencial ? 'Emitida' : 'Sin emitir')], ['Estatus', (r) => tag(r.estatus)]],
    est: ['Activo', 'Inactivo'], act: (r) => [[r.estatus === 'Activo' ? 'Desactivar' : 'Activar', 'estatus'], ['Credencial', 'cred']]
  },
  clases: {
    t: 'Clases', c: 'horarios', add: 'Nueva clase', fl: ['Todas', ...DIAS], map: (r) => ({ ...r, dsem: DIAS[r.dia - 1] }),
    f: [['idClase', 'Clase', 'sel', () => cat.clases.map((c) => [c.id, c.nombre])], ['idEmpleado', 'Coach', 'sel', () => cat.coaches.map((c) => [c.id, c.nombre])], ['dia', 'Día', 'sel', DIAS.map((d, i) => [i + 1, d])], ['inicio', 'Hora de inicio', 'time'], ['cupo', 'Cupo máximo', 'number']],
    col: [['Día', 'dsem'], ['Hora', 'inicio'], ['Clase', 'clase'], ['Coach', 'coach'], ['Duración', (r) => r.duracion + ' min'], ['Cupo', 'cupo']]
  },
  accesos: {
    t: 'Accesos', c: 'accesos', fl: ['Todos', 'Permitido', 'Denegado', 'Socio', 'Entrenador', 'Recepción'],
    col: [['Fecha', (r) => hm(r.fecha)], ['Persona', 'persona'], ['Tipo', 'tipo'], ['Sucursal', (r) => esc(r.sucursal || '—')], ['Método', 'metodo'], ['Resultado', (r) => tag(r.resultado)], ['Motivo', 'motivo']]
  }
};

/* ===== Render ===== */
let S = { tab: 'resumen', f: 0, q: '', rows: [] };
const opt = (o) => (typeof o === 'function' ? o() : o).map((x) => Array.isArray(x) ? x : [x, x]);
const cell = (c, r) => c[1].call ? c[1](r) : esc(r[c[1]]);

function tbl(v, rows) {
  if (!rows.length) return '<p class="vac">Sin resultados.</p>';
  const acts = (r) => [...(v.act ? v.act(r) : []), ...(v.f ? [['Editar', 'ed'], ['Eliminar', 'del']] : [])];
  return `<div class="tw"><table><thead><tr>${v.col.map((c) => `<th>${c[0]}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map((r) =>
    `<tr>${v.col.map((c) => `<td>${cell(c, r)}</td>`).join('')}<td class="ac">${acts(r).map(([l, a]) => `<button data-a="${a}" data-id="${esc(r.id)}">${l}</button>`).join('')}</td></tr>`).join('')}</tbody></table></div>`;
}

function resumen(r) {
  const e = r.estados, K = [['Activas', e.Activa, 'membresias', 2], ['Por vencer', e['Por vencer'], 'membresias', 3], ['Vencidas', e.Vencida, 'membresias', 4], ['Pagos pendientes', e.Pendiente, 'membresias', 1], ['Entradas hoy', r.accesosHoy, 'accesos', 1], ['Coaches activos', r.coachesActivos, 'personal', 2]];
  return `<div class="kpis">${K.map((k) => `<button class="kp1" data-go="${k[2]}" data-f="${k[3]}"><b data-n="${k[1] || 0}">0</b><span class="sm">${k[0]}</span></button>`).join('')}</div>
  <div class="duo"><div><h3 class="s3">Por vencer</h3><ul class="ls">${r.porVencer.map((s) => `<li><span>${esc(s.nombre)}</span><span>${rest(s.fin)}</span></li>`).join('') || '<li><span>Nadie por ahora.</span></li>'}</ul></div>
  <div><h3 class="s3">Últimas entradas</h3><ul class="ls">${r.ultimosAccesos.map((a) => `<li><span>${esc(a.persona)} <small>${esc(a.tipo)}</small></span>${tag(a.resultado)}</li>`).join('') || '<li><span>Sin entradas todavía.</span></li>'}</ul></div></div>`;
}

function body() {
  const v = V[S.tab];
  let r = S.rows;
  if (S.f) r = r.filter((x) => Object.values(x).includes(v.fl[S.f]));
  if (S.q) r = r.filter((x) => JSON.stringify(Object.values(x)).toLowerCase().includes(S.q));
  $('#vw').innerHTML = tbl(v, r);
}
const chips = () => { $('#ch').innerHTML = V[S.tab].fl.map((x, i) => `<button class="chip" data-i="${i}" aria-pressed="${i === S.f}">${x}</button>`).join(''); };

/* Pide los datos de la pestaña actual al servidor y los pinta */
async function cargar() {
  const mio = S, v = V[S.tab];
  const datos = await seguro(() => v.c ? Promise.all([admin.listar(v.c), v.f ? admin.catalogos() : cat]) : admin.resumen());
  if (mio !== S) return; // el usuario cambió de pestaña mientras cargaba
  if (!datos) { $('#vw').innerHTML = '<p class="vac">No se pudo cargar. Revisa el servidor y vuelve a intentar.</p>'; return; }
  if (v.c) { S.rows = v.map ? datos[0].map(v.map) : datos[0]; cat = datos[1]; body(); return; }
  $('#vw').innerHTML = resumen(datos);
  $$('.kp1 b').forEach((b) => contar(b, +b.dataset.n, { ms: 700 }));
  entrarLista($$('.kp1'));
}

function go(t, f = 0) {
  if (!V[t]) t = 'resumen';
  S = { tab: t, f, q: '', rows: [] };
  const v = V[t];
  history.replaceState(0, '', '#' + t);
  $('#ti').textContent = v.t;
  $$('#tb button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === t));
  $('#to').hidden = !v.c; $('#q').value = ''; $('#ad').hidden = !v.f; $('#ad').textContent = v.add || '';
  if (v.c) chips();
  $('#vw').innerHTML = '';
  cargar();
}

const ejecutar = async (fn, ok) => { if (await seguro(async () => { await fn(); return true; })) { toast(ok); await cargar(); } };

/* ===== Formulario genérico (alta, edición, pago) ===== */
let envio = null, alCerrar = null;
function abrirForm(titulo, campos, r, alEnviar) {
  envio = alEnviar; alCerrar = null;
  $('#fm').innerHTML = `<h3 class="s3">${titulo}</h3>` + campos.map(([k, l, t, o, fl = '']) => {
    const val = r[k] ?? (t === 'date' ? today() : '');
    const inner = t === 'sel'
      ? `<select name="${k}">${opt(o).map(([a, b]) => `<option value="${esc(a)}"${String(a) === String(val) ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select>`
      : `<input name="${k}" type="${t || 'text'}" value="${esc(val)}"${fl.includes('o') ? '' : ' required'}>`;
    return `<label class="fld">${l}${inner}</label>`;
  }).join('') + '<div class="acts"><button class="btn alt" value="x" formnovalidate>Cancelar</button><button class="btn" value="ok">Guardar</button></div>';
  $('#dl').returnValue = ''; $('#dl').showModal();
}
$('#dl').addEventListener('close', () => {
  if ($('#dl').returnValue === 'ok' && envio) envio(Object.fromEntries(new FormData($('#fm'))));
  if (alCerrar) alCerrar();
});

const guardar = (v, row) => (d) => ejecutar(() => row ? admin.actualizar(v.c, row.id, d) : admin.crear(v.c, d), 'Guardado');

/* ===== Credencial de entrada: QR (enlace "Mi acceso") y PIN de 6 dígitos ===== */
async function dialogoCredencial(v, r) {
  let { codigo } = (await seguro(() => admin.accion(v.c, r.id, 'credencial'))) ?? {};
  if (!codigo) return;
  const enlace = () => `${location.origin}/mi-acceso.html#${codigo}`;
  envio = null; alCerrar = cargar;
  $('#fm').innerHTML = `<h3 class="s3">Credencial de ${esc(r.nombre)}</h3>
    <p>Marca su entrada con el QR de su enlace personal o con un PIN de 6 dígitos.</p>
    <label class="fld">Enlace personal (muestra su QR)<input id="cr-l" readonly value="${esc(enlace())}"></label>
    <p class="pin" id="cr-pin" hidden></p>
    <div class="acts cr"><button type="button" class="btn alt" id="cr-c">Copiar enlace</button><button type="button" class="btn alt" id="cr-p">Nuevo PIN</button><button type="button" class="btn alt" id="cr-r">Reemitir QR</button><button class="btn" value="x" formnovalidate>Cerrar</button></div>`;
  $('#cr-c').onclick = async () => { try { await navigator.clipboard.writeText(enlace()); toast('Enlace copiado'); } catch { $('#cr-l').select(); } };
  $('#cr-p').onclick = async () => {
    const res = await seguro(() => admin.accion(v.c, r.id, 'pin'));
    if (!res) return;
    const p = $('#cr-pin');
    p.hidden = false; p.innerHTML = `PIN ${esc(res.pin)}<small>Dáselo ahora: no se puede volver a ver. Si lo olvida, genera uno nuevo.</small>`;
  };
  $('#cr-r').onclick = async (e) => { // confirmación en dos pasos
    const b = e.currentTarget;
    if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = '¿Seguro?'; setTimeout(() => { b.dataset.ok = ''; b.textContent = 'Reemitir QR'; }, 3000); return; }
    const res = await seguro(() => admin.accion(v.c, r.id, 'reemitir'));
    if (!res) return;
    codigo = res.codigo; $('#cr-l').value = enlace(); b.dataset.ok = ''; b.textContent = 'Reemitir QR';
    toast('QR reemitido: el enlace anterior ya no funciona');
  };
  $('#dl').returnValue = ''; $('#dl').showModal();
}

/* ===== Acciones de fila ===== */
async function act(a, id, b) {
  const v = V[S.tab], r = S.rows.find((x) => x.id == id);
  if (a === 'ed') return abrirForm('Editar', v.f.filter((f) => !(f[4] || '').includes('a')), r, guardar(v, r));
  if (a === 'cred') return dialogoCredencial(v, r);
  if (a === 'cobrar' || a === 'renovar') {
    return abrirForm(a === 'cobrar' ? 'Registrar pago' : 'Renovar membresía', [['metodo', 'Método de pago', 'sel', METODOS]], { metodo: r.metodoElegido === 'transferencia' ? 'Transferencia' : 'Efectivo' },
      (d) => ejecutar(() => admin.accion(v.c, id, a, d), a === 'cobrar' ? 'Pago registrado' : 'Membresía renovada'));
  }
  if (a === 'del' || a === 'cancelar') { // confirmación en dos pasos
    if (b.dataset.ok !== '1') {
      const txt = b.textContent;
      b.dataset.ok = '1'; b.textContent = 'Confirmar'; b.classList.add('dg');
      setTimeout(() => { b.dataset.ok = ''; b.textContent = txt; b.classList.remove('dg'); }, 3000);
      return;
    }
    return ejecutar(() => a === 'del' ? admin.eliminar(v.c, id) : admin.accion(v.c, id, 'cancelar'), a === 'del' ? 'Eliminado' : 'Membresía cancelada');
  }
  if (a === 'estatus') return ejecutar(() => admin.accion(v.c, id, 'estatus', { estatus: r.estatus === v.est[0] ? v.est[1] : v.est[0] }), 'Actualizado');
}

$('#tb').onclick = (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.t); };
$('#ch').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.f = +b.dataset.i; chips(); body(); };
$('#q').oninput = (e) => { S.q = e.target.value.trim().toLowerCase(); body(); };
$('#ad').onclick = () => abrirForm(V[S.tab].add, V[S.tab].f, {}, guardar(V[S.tab], null));
$('#vw').onclick = (e) => {
  const g = e.target.closest('[data-go]'), b = e.target.closest('[data-a]');
  if (g) go(g.dataset.go, +g.dataset.f); else if (b) act(b.dataset.a, b.dataset.id, b);
};

/* ===== Entradas en vivo =====
   El control de entrada (entrada.html) puede estar en otra pantalla. Aquí se revisa cada pocos segundos si hubo entradas nuevas
   y se avisa con todos sus datos. */
let ultimoAcceso = null;

function avisoEntrada(a) {
  const estado = a.resultado === 'Denegado' ? 'no' : a.membresia === 'Por vencer' ? 'warn' : 'ok';
  const quien = a.tipo === 'Socio' ? `Socio${a.plan ? ' · ' + a.plan : ''}` : a.tipo;
  const detalle = a.motivo !== '—' ? a.motivo : a.resultado === 'Permitido' ? 'Entrada registrada' : 'Entrada denegada';
  const hora = new Date(a.fecha.replace(' ', 'T')).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const el = Object.assign(document.createElement('div'), { className: 'entrada', role: 'status' });
  el.dataset.s = estado;
  el.innerHTML = `<b>${esc(a.persona)}</b><span>${esc(quien)}</span><span>${esc(detalle)}</span><small>${hora} · ${esc(a.metodo)}${a.sucursal ? ' · ' + esc(a.sucursal) : ''}</small>`;
  const cont = $('#en');
  cont.prepend(el);
  while (cont.children.length > 3) cont.lastElementChild.remove();
  const quitar = () => el.remove();
  el.onclick = quitar;
  setTimeout(quitar, 9000);
}

async function sondear() {
  if (document.hidden) return;
  let r;
  try { r = await admin.nuevos(ultimoAcceso); } catch { return; } // en segundo plano no se pide la clave: se ignora el error
  const primera = ultimoAcceso === null;
  ultimoAcceso = r.ultimo;
  if (primera || !r.accesos.length) return;
  r.accesos.forEach(avisoEntrada);
  if (['resumen', 'accesos'].includes(S.tab)) cargar();
}
setInterval(sondear, 4000);

/* ===== Arranque ===== */
$('#tb').innerHTML = Object.entries(V).map(([k, x]) => `<button data-t="${k}" aria-pressed="false">${x.t}</button>`).join('');
obtenerGimnasio().then(({ marca }) => { // nombre y color del sitio público
  $('#lg').textContent = marca.nombre + ' · Admin'; document.title = 'Admin · ' + marca.nombre;
  document.documentElement.style.setProperty('--acc', marca.acento);
}).catch(() => {});
go(location.hash.slice(1));
sondear();
