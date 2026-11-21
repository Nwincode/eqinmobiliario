// Solicitud de reserva por noche desde la ficha (js/site.js → js/reserva-chat.js `solicitar`). POST /api/solicitud.
// Crea en UNA transacción, con la cuenta de escritura, la solicitud (leads/{id}), su chat (chats/{token}) y el índice
// (chatsPorSolicitud/{id}): o quedan los tres o ninguno (antes eran dos envíos y un corte dejaba una solicitud sin chat
// que el socio nunca veía). Las reglas ya no dejan crear solicitudes de reserva ni chats desde el navegador: lo que
// revisaban vive aquí, con la casa leída en la transacción y la hora del servidor (llegada desde hoy en Guatemala).
// Contra el abuso: Cloudflare Turnstile (netlify/lib/turnstile.mjs; sin llaves, solo el límite) y un límite que
// comparten todas las instancias (limitadorDurable) por IP y por correo.
// El id de la solicitud y el token del chat los pone la página (al azar, largos) y no cambian si reintenta: un segundo
// envío de la misma solicitud responde lo mismo, no crea otra.
// GET: la llave pública de Turnstile ('' sin configurar), para que la página ponga la prueba solo si hace falta.
import '../../js/calc-vacacional.js';
import { json } from '../lib/auth.mjs';
import { leerPrivado } from '../lib/firestore.mjs';
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { limitadorDurable, ipDe } from '../lib/limite.mjs';
import { moraDe } from '../lib/comisiones.mjs';
import { pasaTurnstile, llavePublica } from '../lib/turnstile.mjs';
import { correoValido, telefonoValido } from '../../admin/js/formato.js';
import { visibilidadDe } from '../../admin/js/estados.js';

const V = globalThis.EQVacacional;
// Un cliente que se equivoca y reintenta cabe; una ráfaga no. Si la base falla, cuenta el de memoria (un cliente de
// verdad no se queda sin reservar por una falla nuestra).
const porIp = limitadorDurable('solicitud-ip', 10, 60 * 60_000, { siFalla: 'memoria' });
const porCorreo = limitadorDurable('solicitud-correo', 5, 60 * 60_000, { siFalla: 'memoria' });
// Sin la prueba de «no soy un robot» (el navegador no la pudo hacer o Cloudflare no responde), además, uno más estricto:
// un cliente de verdad reserva igual; un robot que la salta, muy poco.
const porIpSinPrueba = limitadorDurable('solicitud-ip-sin-prueba', 3, 60 * 60_000, { siFalla: 'memoria' });
const porCorreoSinPrueba = limitadorDurable('solicitud-correo-sin-prueba', 2, 60 * 60_000, { siFalla: 'memoria' });
const ID = /^[A-Za-z0-9]{20}$/;
const TOKEN = /^[A-Za-z0-9]{28}$/;
const CASA = /^[A-Za-z0-9_-]{1,60}$/;

const texto = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const entero = (v) => (Number.isInteger(v) ? v : null);
// El texto va en español y en inglés ([es, en]): el cliente lo lee en su idioma (lead.idioma).
export class Rechazo extends Error { constructor(status, error, extra = {}) { const [es, en] = [].concat(error); super(es); this.en = en || es; this.status = status; this.extra = extra; } }
const no = (status, error, extra) => { throw new Rechazo(status, error, extra); };

// Lo que manda la página, revisado campo por campo (lo mismo que revisaban las reglas, y más: el correo y el teléfono con
// la regla de formato.js, la llegada desde hoy). Devuelve { lead, reserva, chat } listos para guardar, sin la casa.
export function revisarPedido(p, ahora = Date.now()) {
	const l = p?.lead || {}, r = p?.reserva || {}, c = p?.chat || {};
	if (!ID.test(p?.leadId || '') || !TOKEN.test(p?.token || '')) no(400, 'Solicitud inválida');
	const lead = {
		nombre: texto(l.nombre, 100)?.trim(), telefono: texto(l.telefono, 30)?.trim(), email: texto(l.email, 120)?.trim().toLowerCase(),
		mensaje: texto(l.mensaje ?? '', 2000), origen: texto(l.origen ?? '', 30), pagina: texto(l.pagina ?? '', 200),
		propertyId: texto(l.propertyId, 60), idioma: l.idioma === 'en' ? 'en' : 'es'
	};
	if (!lead.nombre || !lead.telefono || lead.mensaje === null || lead.origen === null || lead.pagina === null) no(400, 'Faltan datos');
	if (!telefonoValido(lead.telefono)) no(400, 'Teléfono inválido');
	if (!correoValido(lead.email || '')) no(400, 'Correo inválido');
	if (!CASA.test(lead.propertyId || '')) no(400, 'Casa inválida');
	if (l.campana && typeof l.campana === 'object') {
		const e = Object.entries(l.campana).slice(0, 8).filter(([k, v]) => /^[a-z_]{1,30}$/.test(k) && typeof v === 'string');
		if (e.length) lead.campana = Object.fromEntries(e.map(([k, v]) => [k, v.slice(0, 200)]));
	}
	const reserva = {
		codigo: texto(r.codigo, 20), llegada: r.llegada, salida: r.salida, noches: entero(r.noches), huespedes: entero(r.huespedes),
		subtotal: numero(r.subtotal), impuestos: numero(r.impuestos), total: numero(r.total), deposito: numero(r.deposito ?? 0), moneda: texto(r.moneda, 3)
	};
	if (!reserva.codigo || !reserva.moneda || reserva.deposito === null || reserva.deposito < 0) no(400, 'Solicitud inválida');
	// Lo que cotizó el sitio (V.cotizar): impuestos = 22 % del subtotal y total = subtotal + impuestos, al centavo; con algo
	// que cobrar y de 1 a 90 noches, las de las fechas. Así nadie infla el subtotal sin inflar lo que paga el cliente.
	if (!(reserva.subtotal > 0) || reserva.impuestos === null || Math.abs(reserva.impuestos - reserva.subtotal * 0.22) > 0.02
		|| reserva.total === null || Math.abs(reserva.total - reserva.subtotal - reserva.impuestos) > 0.02) no(400, 'Cotización inválida');
	if (!V.esFecha(reserva.llegada) || !V.esFecha(reserva.salida) || !reserva.noches || reserva.noches < 1 || reserva.noches > V.MAX_NOCHES
		|| V.nochesEntre(reserva.llegada, reserva.salida) !== reserva.noches) no(400, 'Fechas inválidas');
	// La llegada, desde hoy en Guatemala con la hora del servidor (el reloj del teléfono del cliente no cuenta).
	if (reserva.llegada < V.hoy(ahora)) no(409, ['La fecha de llegada ya pasó.', 'The check-in date has already passed.'], { pasado: true });
	if (!reserva.huespedes || reserva.huespedes < 1) no(400, 'Personas inválidas');
	const chat = { foto: texto(c.foto ?? '', 500) ?? '', url: texto(c.url ?? '', 200) ?? '' };
	return { lead, reserva, chat };
}

// El nombre que ve el socio en el chat: el primero, y sin contacto (el chat no pasa teléfonos ni correos).
export const nombreDelChat = (nombre, idioma = 'es') => {
	const primero = String(nombre || '').trim().split(/\s+/)[0].slice(0, 40);
	return primero && !V.tieneContacto(primero) ? primero : idioma === 'en' ? 'Guest' : 'Cliente';
};

// En la transacción: la casa manda (dueño, asesor, título, moneda y personas máximo). Devuelve el token del chat.
export async function guardarSolicitud(tx, leadId, token, { lead, reserva, chat }) {
	// Reintento de la misma solicitud (la respuesta anterior se perdió): ya quedó, se responde lo mismo.
	if (await tx.leer(`leads/${leadId}`)) {
		if ((await tx.leer(`chatsPorSolicitud/${leadId}`))?.token === token) return token;
		no(409, ['Esta solicitud ya se envió con otros datos: recarga la página.', 'This request was already sent with other details: reload the page.']);
	}
	if (await tx.leer(`chats/${token}`)) no(409, ['Esta solicitud ya se envió con otros datos: recarga la página.', 'This request was already sent with other details: reload the page.']);
	const casa = await tx.leer(`properties/${lead.propertyId}`);
	if (!casa || casa.operacion !== 'vacacional' || visibilidadDe(casa) !== 'visible') no(409, ['Esta casa ya no recibe reservas.', 'This house no longer takes bookings.'], { casa: true });
	if ((casa.moneda || 'USD') !== reserva.moneda) no(409, ['La casa cambió de moneda: recarga la página.', 'The house changed its currency: reload the page.'], { recargar: true });
	const max = casa.vacacional?.huespedesMax;
	if (typeof max === 'number' && max >= 1 && reserva.huespedes > max) no(409, ['Son más personas de las que caben.', 'That is more guests than the house allows.'], { recargar: true });
	const propietarioId = casa.propietarioId || '';
	const titulo = String(casa.titulo || '').slice(0, 200);
	tx.crear(`leads/${leadId}`, { ...lead, propertyTitulo: titulo, agentId: casa.agentId || '', propietarioId, estado: 'nuevo', reserva }, { ahora: ['createdAt'] });
	tx.crear(`chats/${token}`, { codigo: reserva.codigo, leadId, propertyId: lead.propertyId, propertyTitulo: titulo, propietarioId,
		nombre: nombreDelChat(lead.nombre, lead.idioma), llegada: reserva.llegada, salida: reserva.salida, noches: reserva.noches, huespedes: reserva.huespedes,
		total: reserva.total, subtotal: reserva.subtotal, moneda: reserva.moneda, idioma: lead.idioma, ...chat,
		// El aviso de la solicitud nueva queda pendiente desde que nace: si la respuesta no le llega a la página (y no llama
		// /api/aviso-chat), lo manda el control de cada hora (aviso-chat-envio.mjs, «nueva»).
		avisoPendiente: 'nueva' }, { ahora: ['createdAt'] });
	tx.crear(`chatsPorSolicitud/${leadId}`, { token });
	return token;
}

export default async (req, context) => {
	if (req.method === 'GET') return json(200, { turnstile: llavePublica() });
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!escrituraConfigurada()) return json(503, { error: 'Reservas sin configurar' });
	let pedido;
	try { pedido = await req.json(); } catch { return json(400, { error: 'Solicitud inválida' }); }
	const ip = ipDe(req, context);
	const en = pedido?.lead?.idioma === 'en';
	const error = (status, es, eng, extra = {}) => json(status, { error: en ? eng : es, ...extra });
	try {
		// El mismo envío otra vez (la respuesta anterior se perdió): ya quedó, se responde lo mismo, antes de revisar las
		// fechas (pudo pasar la medianoche) y de los límites (no gasta otro).
		const ya = await yaGuardada(pedido?.leadId, pedido?.token);
		if (ya) return json(200, { token: ya });
		const datos = revisarPedido(pedido);
		const prueba = await pasaTurnstile(pedido.turnstile, ip);
		if (prueba === 'mala') return error(403, 'No pudimos comprobar que no eres un robot. Vuelve a intentarlo.', 'We could not verify that you are not a robot. Please try again.', { turnstile: true });
		if (await porIp(ip) || await porCorreo(datos.lead.email)
			|| (prueba === 'sin' && (await porIpSinPrueba(ip) || await porCorreoSinPrueba(datos.lead.email))))
			return error(429, 'Demasiadas solicitudes seguidas: espera un rato o escríbenos por WhatsApp.', 'Too many requests in a row: wait a while or message us on WhatsApp.');
		// Socio con las casas fuera del sitio por su atraso (más de 72 h): no se reserva (la ficha ya lo dice). Fuera de la
		// transacción; si no se puede leer, no frena (lo revisa otra vez la confirmación).
		const casa = await leerPrivado(`properties/${datos.lead.propertyId}`).catch(() => null);
		const pausada = casa?.propietarioId ? await moraDe(casa.propietarioId).then((n) => n === 3, (err) => { console.error('Solicitud (mora):', err.message); return false; }) : false;
		if (pausada) no(409, ['Esta casa no recibe reservas por ahora.', 'This house is not taking bookings right now.'], { pausada: true });
		const token = await transaccion((tx) => guardarSolicitud(tx, pedido.leadId, pedido.token, datos));
		return json(200, { token });
	} catch (err) {
		if (err instanceof Rechazo) return json(err.status, { error: en ? err.en : err.message, ...err.extra });
		console.error('Solicitud:', err.message);
		return error(500, 'No se pudo guardar. Vuelve a intentarlo.', 'We could not save it. Please try again.');
	}
};

// ¿Ya está guardada esta solicitud con este chat? (un reintento). Devuelve el token o ''.
async function yaGuardada(leadId, token) {
	if (!ID.test(leadId || '') || !TOKEN.test(token || '')) return '';
	const indice = await leerPrivado(`chatsPorSolicitud/${leadId}`).catch(() => null);
	return indice?.token === token ? token : '';
}

export const config = { path: '/api/solicitud' };
