import { ErrorHttp } from './errores.js';

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TELEFONO = /^[\d+()\s-]{7,15}$/;
export const FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const HORA = /^\d{2}:\d{2}$/;
export const ID_SOCIO = /^[A-Z]{2}\d{13}$/; // CODIGO(2) + AAAAMMDD + CONSECUTIVO(5)
export const CODIGO_APP = /^[0-9A-F]{20}$/; // credencial digital (ver membresias.js)

export const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const invalido = (mensaje) => new ErrorHttp(400, mensaje);
