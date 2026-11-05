/* Capa de acceso a la API de Node. Si el backend cambia de ruta, solo se toca BASE. */
const BASE = '/api';

export async function pedir(ruta, { cuerpo, headers, ...opciones } = {}) {
  const res = await fetch(BASE + ruta, {
    ...opciones,
    headers: { Accept: 'application/json', ...(cuerpo && { 'Content-Type': 'application/json' }), ...headers },
    body: cuerpo && JSON.stringify(cuerpo),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(datos.error || `Error ${res.status}`), { estado: res.status });
  return datos;
}

export const obtenerGimnasio = () => pedir('/gimnasio');
export const obtenerHorarios = () => pedir('/horarios');
export const registrarSocio = (datos) => pedir('/socios', { method: 'POST', cuerpo: datos });
export const reservarClase = (datos) => pedir('/reservaciones', { method: 'POST', cuerpo: datos });
export const obtenerEstadoPago = (sesion) => pedir('/pagos/estado?sesion=' + encodeURIComponent(sesion));

/* "Mi acceso": el código del enlace personal viaja como Bearer */
const conCodigo = (codigo) => ({ Authorization: 'Bearer ' + codigo });
export const obtenerMiAcceso = (codigo) => pedir('/mi-acceso', { headers: conCodigo(codigo) });
export const renovarMiAcceso = (codigo, metodo) => pedir('/mi-acceso/renovar', { method: 'POST', cuerpo: { metodo }, headers: conCodigo(codigo) });
export const generarMiPin = (codigo) => pedir('/mi-acceso/pin', { method: 'POST', headers: conCodigo(codigo) });
