/* Llamadas al panel de administración (/api/admin). La clave vive solo en sessionStorage: se borra al cerrar la pestaña. */
import { pedir } from './api.js';

export const claveAdmin = {
  leer: () => { try { return sessionStorage.getItem('adminClave') || ''; } catch { return ''; } },
  poner: (v) => { try { sessionStorage.setItem('adminClave', v); } catch {} },
};

const adm = (ruta, metodo = 'GET', cuerpo) =>
  pedir('/admin' + ruta, { method: metodo, cuerpo, headers: { Authorization: 'Bearer ' + claveAdmin.leer() } });

/* `col` es la colección: membresias | socios | personal | horarios | accesos */
export const admin = {
  resumen: () => adm('/resumen'),
  catalogos: () => adm('/catalogos'),
  listar: (col) => adm('/' + col),
  crear: (col, datos) => adm('/' + col, 'POST', datos),
  actualizar: (col, id, datos) => adm(`/${col}/${id}`, 'PUT', datos),
  eliminar: (col, id) => adm(`/${col}/${id}`, 'DELETE'),
  accion: (col, id, nombre, datos = {}) => adm(`/${col}/${id}/${nombre}`, 'POST', datos),
  nuevos: (desde) => adm('/accesos/nuevos?desde=' + (desde ?? '')),
  /* Entrada de una persona: { codigo } del QR o { pin }, más la sucursal del control de acceso */
  entrada: (datos) => adm('/acceso', 'POST', datos),
};
