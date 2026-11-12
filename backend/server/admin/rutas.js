import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { adminToken } from '../config.js';
import { asincrono, ErrorHttp } from '../errores.js';
import { CODIGO_APP, EMAIL, FECHA, HORA, ID_SOCIO, TELEFONO, invalido, texto } from '../validar.js';
import * as a from './accesos.js';
import * as c from './consultas.js';

const router = Router();
const METODOS = ['Efectivo', 'Tarjeta', 'Transferencia'];
const PUESTOS = ['Entrenador', 'Recepción', 'Administración', 'Limpieza', 'Otro'];

/** Todo /api/admin exige la clave ADMIN_TOKEN (Authorization: Bearer). Sin clave configurada queda deshabilitado. */
router.use((req, _res, next) => {
  if (!adminToken) return next(new ErrorHttp(503, 'Panel deshabilitado: define ADMIN_TOKEN en el archivo .env.'));
  const dada = Buffer.from((req.get('authorization') ?? '').replace(/^Bearer /, ''));
  const real = Buffer.from(adminToken);
  if (dada.length !== real.length || !timingSafeEqual(dada, real)) return next(new ErrorHttp(401, 'Clave de administrador incorrecta.'));
  next();
});

/* ===== Validación ===== */
const entero = (v, mensaje) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw invalido(mensaje);
  return n;
};
const idParam = (req) => entero(req.params.id, 'Id inválido.');
const idSocio = (v) => {
  const id = texto(v, 15).toUpperCase();
  if (!ID_SOCIO.test(id)) throw invalido('El ID de socio no es válido.');
  return id;
};
const idSocioParam = (req) => idSocio(req.params.id);
const fecha = (v, mensaje) => {
  const f = texto(v, 10);
  if (!FECHA.test(f)) throw invalido(mensaje);
  return f;
};
const metodo = (v, obligatorio) => {
  const m = texto(v, 20);
  if (!m && !obligatorio) return null;
  if (!METODOS.includes(m)) throw invalido('Elige un método de pago.');
  return m;
};
const opcion = (v, validas) => {
  if (!validas.includes(v)) throw invalido('Estatus no válido.');
  return v;
};

const datosMembresia = (b, alta) => {
  const d = { idPlan: entero(b.idPlan, 'Elige un plan.'), inicio: fecha(b.inicio, 'La fecha de inicio no es válida.') };
  return alta ? { ...d, idSocio: idSocio(b.idSocio), metodo: metodo(b.metodo, false) } : d;
};

const datosSocio = (b, alta) => {
  const d = {
    nombres: texto(b.nombres, 100),
    apellidoPaterno: texto(b.apellidoPaterno, 50),
    apellidoMaterno: texto(b.apellidoMaterno, 50) || null,
    email: texto(b.email, 150).toLowerCase(),
    telefono: texto(b.telefono, 15) || null,
  };
  if (!d.nombres || !d.apellidoPaterno) throw invalido('Escribe el nombre y el apellido paterno.');
  if (!EMAIL.test(d.email)) throw invalido('Escribe un correo válido.');
  if (d.telefono && !TELEFONO.test(d.telefono)) throw invalido('Escribe un teléfono válido.');
  return alta ? { ...d, idSucursal: entero(b.idSucursal, 'Elige una sucursal.') } : d;
};

const datosPersonal = (b) => {
  const d = { nombres: texto(b.nombres, 100), apellidos: texto(b.apellidos, 100), puesto: texto(b.puesto, 50), telefono: texto(b.telefono, 15) || null };
  if (!d.nombres || !d.apellidos) throw invalido('Escribe el nombre y los apellidos.');
  if (!PUESTOS.includes(d.puesto)) throw invalido('Elige un puesto.');
  if (d.telefono && !TELEFONO.test(d.telefono)) throw invalido('Escribe un teléfono válido.');
  return d;
};

const datosHorario = (b) => {
  const d = {
    idClase: entero(b.idClase, 'Elige una clase.'),
    idEmpleado: entero(b.idEmpleado, 'Elige un coach.'),
    dia: entero(b.dia, 'Elige un día.'),
    inicio: texto(b.inicio, 5),
    cupo: entero(b.cupo, 'El cupo debe ser un número mayor a 0.'),
  };
  if (d.dia > 7) throw invalido('Elige un día.');
  if (!HORA.test(d.inicio)) throw invalido('La hora de inicio no es válida.');
  return d;
};

/* ===== Rutas ===== */
const lista = (ruta, fn) => router.get(ruta, asincrono(async (_req, res) => res.json(await fn())));

/** Alta (POST), edición (PUT) y baja (DELETE) de una colección. */
function crud(ruta, { id = idParam, validar, crear, actualizar, eliminar }) {
  router.post(ruta, asincrono(async (req, res) => res.status(201).json(await crear(validar(req.body ?? {}, true)))));
  router.put(`${ruta}/:id`, asincrono(async (req, res) => {
    await actualizar(id(req), validar(req.body ?? {}, false));
    res.json({ ok: true });
  }));
  router.delete(`${ruta}/:id`, asincrono(async (req, res) => {
    await eliminar(id(req));
    res.status(204).end();
  }));
}

/** Acción sobre un registro: POST /<ruta>/:id/<accion> */
const accion = (ruta, nombre, id, fn) =>
  router.post(`${ruta}/:id/${nombre}`, asincrono(async (req, res) => res.json((await fn(id(req), req.body ?? {})) ?? { ok: true })));

lista('/resumen', c.resumen);
lista('/catalogos', c.catalogos);
lista('/membresias', c.listarMembresias);
lista('/socios', c.listarSocios);
lista('/personal', c.listarPersonal);
lista('/horarios', c.listarHorarios);
lista('/accesos', a.listarAccesos);
router.get('/accesos/nuevos', asincrono(async (req, res) => {
  const d = req.query.desde;
  res.json(await a.accesosNuevos(d === undefined || d === '' ? null : Number(d) || 0));
}));

crud('/membresias', { validar: datosMembresia, crear: c.crearMembresia, actualizar: c.actualizarMembresia, eliminar: c.eliminarMembresia });
crud('/socios', { id: idSocioParam, validar: datosSocio, crear: c.crearSocio, actualizar: c.actualizarSocio, eliminar: c.eliminarSocio });
crud('/personal', { validar: datosPersonal, crear: c.crearPersonal, actualizar: c.actualizarPersonal, eliminar: c.eliminarPersonal });
crud('/horarios', { validar: datosHorario, crear: c.crearHorario, actualizar: c.actualizarHorario, eliminar: c.eliminarHorario });

accion('/membresias', 'cobrar', idParam, (id, b) => c.cobrarMembresia(id, metodo(b.metodo, true)));
accion('/membresias', 'renovar', idParam, (id, b) => c.renovarMembresia(id, metodo(b.metodo, true)));
accion('/membresias', 'cancelar', idParam, (id) => c.cancelarMembresia(id));
accion('/socios', 'estatus', idSocioParam, (id, b) => c.cambiarEstatusSocio(id, opcion(b.estatus, ['Activo', 'Bloqueado'])));
accion('/personal', 'estatus', idParam, (id, b) => c.cambiarEstatusPersonal(id, opcion(b.estatus, ['Activo', 'Inactivo'])));

/* Credencial de entrada: código del QR, QR reemitido y PIN nuevo (se devuelve una sola vez) */
for (const [ruta, tipo, id] of [['/socios', 'socio', idSocioParam], ['/personal', 'empleado', idParam]]) {
  accion(ruta, 'credencial', id, (i) => c.credencial(tipo, i));
  accion(ruta, 'reemitir', id, (i) => c.reemitirCredencial(tipo, i));
  accion(ruta, 'pin', id, (i) => c.generarPin(tipo, i));
}

/** Entrada de cualquier persona desde el control de acceso: con el código de su QR o con su PIN de 6 dígitos. */
router.post('/acceso', asincrono(async (req, res) => {
  const b = req.body ?? {};
  const codigo = texto(b.codigo, 20).toUpperCase(), pin = texto(b.pin, 6);
  if (Boolean(codigo) === Boolean(pin)) throw invalido('Envía el código del QR o el PIN, no ambos.');
  if (pin && !/^\d{6}$/.test(pin)) throw invalido('El PIN tiene 6 dígitos.');
  if (codigo && !CODIGO_APP.test(codigo)) throw invalido('El código no es válido.');
  const idSucursal = b.idSucursal ? entero(b.idSucursal, 'La sucursal no es válida.') : null;
  res.json(await a.registrarEntrada({ codigo: codigo || null, pin: pin || null, idSucursal }));
}));

export default router;
