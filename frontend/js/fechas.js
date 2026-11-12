/* Fechas en texto 'AAAA-MM-DD' (como las entrega MySQL con dateStrings), sin conversiones de zona horaria. */
export const iso = (d) => d.toLocaleDateString('sv');
export const today = () => iso(new Date());
export const fmt = (s) => s ? new Date(s + 'T00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fmtHora = (s) => s ? new Date(s.replace(' ', 'T')).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Tiempo que falta hasta `fin`, en meses y días ("2 meses y 5 días"). */
export function restante(fin) {
  const a = new Date(today() + 'T00:00'), b = new Date(fin + 'T00:00');
  if (b < a) return 'Vencida';
  let m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(), c = new Date(a);
  c.setMonth(a.getMonth() + m);
  if (c > b) { m--; c = new Date(a); c.setMonth(a.getMonth() + m); }
  const d = Math.round((b - c) / 864e5);
  return [m && m + (m > 1 ? ' meses' : ' mes'), d && d + (d > 1 ? ' días' : ' día')].filter(Boolean).join(' y ') || 'Vence hoy';
}
