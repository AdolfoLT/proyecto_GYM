import { Router } from 'express';
import QRCode from 'qrcode';
import { marca } from './config.js';
import * as consultas from './consultas.js';
import { asincrono, ErrorHttp } from './errores.js';
import { metodoPago, opcionesPago, prepararPago, estadoPorSesion } from './pagos.js';
import { CODIGO_APP, EMAIL, FECHA, ID_SOCIO, TELEFONO, invalido, texto } from './validar.js';

const router = Router();

router.get('/gimnasio', asincrono(async (_req, res) => {
  res.json({ marca, pagos: opcionesPago(), ...(await consultas.obtenerResumen()) });
}));

router.get('/horarios', asincrono(async (_req, res) => {
  res.json(await consultas.listarHorarios());
}));

router.post('/socios', asincrono(async (req, res) => {
  const b = req.body ?? {};
  const datos = {
    nombres: texto(b.nombres, 100),
    apellidoPaterno: texto(b.apellidoPaterno, 50),
    apellidoMaterno: texto(b.apellidoMaterno, 50) || null,
    email: texto(b.email, 150).toLowerCase(),
    telefono: texto(b.telefono, 15) || null,
    fechaNacimiento: texto(b.fechaNacimiento, 10) || null,
    idSucursal: Number(b.idSucursal),
    idPlan: b.idPlan ? Number(b.idPlan) : null,
    metodo: null,
  };
  if (!datos.nombres || !datos.apellidoPaterno) throw invalido('Escribe tu nombre y tu apellido paterno.');
  if (!EMAIL.test(datos.email)) throw invalido('Escribe un correo válido.');
  if (datos.telefono && !TELEFONO.test(datos.telefono)) throw invalido('Escribe un teléfono válido.');
  if (datos.fechaNacimiento && !FECHA.test(datos.fechaNacimiento)) throw invalido('La fecha de nacimiento no es válida.');
  if (!Number.isInteger(datos.idSucursal)) throw invalido('Elige una sucursal.');
  if (datos.idPlan !== null && !Number.isInteger(datos.idPlan)) throw invalido('El plan elegido no es válido.');

  if (datos.idPlan) datos.metodo = metodoPago(texto(b.metodo, 20) || 'sucursal');

  const { idSocio, idMembresia } = await consultas.crearSocio(datos);
  res.status(201).json({ idSocio, idMembresia, pago: idMembresia ? await prepararPago(idMembresia, datos.metodo) : null });
}));

router.post('/reservaciones', asincrono(async (req, res) => {
  const idSocio = texto(req.body?.idSocio, 15).toUpperCase();
  const idHorario = Number(req.body?.idHorario);
  if (!ID_SOCIO.test(idSocio)) throw invalido('Tu ID de socio tiene 15 caracteres, por ejemplo BG2026102400001.');
  if (!Number.isInteger(idHorario)) throw invalido('Elige una clase.');

  res.status(201).json(await consultas.crearReservacion(idSocio, idHorario));
}));

/* ===== Pagos y "Mi acceso" ===== */
router.get('/pagos/estado', asincrono(async (req, res) => {
  res.json(await estadoPorSesion(texto(req.query.sesion, 100)));
}));

/** El enlace personal (/mi-acceso.html#CODIGO) manda el código como Bearer. Funciona como una tarjeta: quien lo tiene, entra. */
const codigoAcceso = (req) => {
  const codigo = (req.get('authorization') ?? '').replace(/^Bearer /, '').toUpperCase();
  if (!CODIGO_APP.test(codigo)) throw new ErrorHttp(401, 'Este enlace no es válido. Pide uno nuevo en recepción.');
  return codigo;
};

router.get('/mi-acceso', asincrono(async (req, res) => {
  const codigo = codigoAcceso(req);
  const { persona, membresia } = await consultas.obtenerMiAcceso(codigo);
  res.set('Cache-Control', 'no-store').json({ persona, membresia, codigo, qr: await QRCode.toString(codigo, { type: 'svg', margin: 1 }), pagos: opcionesPago() });
}));

router.post('/mi-acceso/pin', asincrono(async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await consultas.generarMiPin(codigoAcceso(req)));
}));

router.post('/mi-acceso/renovar', asincrono(async (req, res) => {
  const codigo = codigoAcceso(req);
  const metodo = metodoPago(texto(req.body?.metodo, 20));
  res.json({ pago: await prepararPago(await consultas.renovarMiAcceso(codigo, metodo), metodo) });
}));

export default router;
