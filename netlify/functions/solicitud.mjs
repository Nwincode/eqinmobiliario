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
import { limitadorDurable, limitadorContador, ipDe } from '../lib/limite.mjs';
import { moraDe } from '../lib/comisiones.mjs';
import { apartadasDe, purgarCasa } from '../lib/ocupacion.mjs';
import { reenviarEnlace } from '../lib/aviso-chat-envio.mjs';
import { seCruzan, apartaFechas, bajoElPlan, HORAS_RESPUESTA } from '../../admin/js/reservas-calculo.js';
import { montosDe } from '../lib/reservas-servidor.mjs';
import { pasaTurnstile, llavePublica } from '../lib/turnstile.mjs';
import { correoValido, telefonoValido } from '../../admin/js/formato.js';
import { visibilidadDe } from '../../admin/js/estados.js';

const V = globalThis.EQVacacional;
// Un cliente que se equivoca y reintenta cabe; una ráfaga no. Si la base falla, cuenta el de memoria (un cliente de
// verdad no se queda sin reservar por una falla nuestra).
// Cuentan solo lo que se guarda (dentro de la transacción del guardado): un 503 por una ráfaga, la pregunta «¿ya
// quedó?» o el reintento de la misma solicitud no gastan el cupo del cliente.
const porIp = limitadorDurable('solicitud-ip', 10, 60 * 60_000);
const porCorreo = limitadorDurable('solicitud-correo', 5, 60 * 60_000);
// La pregunta «¿ya quedó?» y el reintento de una ya guardada: su propio límite por IP, más holgado.
const porIpConsulta = limitadorDurable('solicitud-consulta-ip', 30, 60 * 60_000, { siFalla: 'memoria' });
// El reenvío de una que ya quedó (la página la reintenta sola): aparte de las preguntas y más holgado.
const porIpReenvio = limitadorDurable('solicitud-reenvio-ip', 60, 60 * 60_000, { siFalla: 'memoria' });
// Un freno previo por IP: solicitudes distintas (por su id) en la hora, contadas antes de revisarlas, con o sin prueba de
// Turnstile: una ráfaga que termina en 409 o 403 (casas que no existen, fechas tomadas) no se guarda, pero tampoco sigue
// sin tope. 60, para una IP compartida (hotel, oficina, la red del celular); el reintento de la misma no cuenta. Es un
// contador sin transacción (`limitadorContador`): una ráfaga a la vez queda contada en la base.
const porIpIntentos = limitadorContador('solicitud-intentos-ip', 60, 60 * 60_000, { avisar: true });
// Sin la prueba de «no soy un robot» (el navegador no la pudo hacer o Cloudflare no responde), además, uno más estricto:
// un cliente de verdad reserva igual; un robot que la salta, muy poco.
const porIpSinPrueba = limitadorDurable('solicitud-ip-sin-prueba', 3, 60 * 60_000, { avisar: true });
const porCorreoSinPrueba = limitadorDurable('solicitud-correo-sin-prueba', 2, 60 * 60_000);
// Y un tope para todo el sitio: pasadas 20 solicitudes sin prueba en una hora (un robot que cambia de IP y de correo),
// se exige la prueba. Estos tres cuentan dentro de la misma transacción que guarda la solicitud (`enTransaccion`): solo
// lo que se guardó, y muchos pedidos a la vez no pasan por el mismo cupo. Al llegar al tope, lo dice el registro.
const sinPruebaEnElSitio = limitadorDurable('solicitud-sin-prueba-sitio', 20, 60 * 60_000, { avisar: true });
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

const MUCHAS = ['Demasiadas solicitudes seguidas: espera un rato o escríbenos por WhatsApp.', 'Too many requests in a row: wait a while or message us on WhatsApp.'];
// El mismo texto para todos (otra persona o la misma con otro navegador): el token nunca sale por datos que otro puede
// conocer (correo, casa, fechas). A la misma persona se le manda el enlace a su correo guardado (reenviarEnlace).
const FECHAS_TOMADAS = ['Esas fechas ya no están libres. Si ya las pediste con este correo, te mandamos el enlace de tu reserva.',
	'Those dates are no longer available. If you already requested them with this email, we have sent you the link to your booking.'];
// Un 409 de fechas tomadas que es de la misma persona: lleva por dentro (no en la respuesta) la solicitud a cuyo correo se
// reenvía el enlace.
const tomadasPor = (leadId) => Object.assign(new Rechazo(409, FECHAS_TOMADAS, { fechas: true }), { reenviar: leadId });
// ¿Es la misma solicitud? Lo que la define (correo, casa, fechas y personas) igual a lo guardado: solo así un reintento
// cuenta como tal (y puede corregir nombre y teléfono). Lo demás se trata como una solicitud nueva.
export const mismaSolicitud = (guardado, { lead, reserva }) => Boolean(guardado) && String(guardado.email || '').toLowerCase() === lead.email
	&& guardado.propertyId === lead.propertyId && guardado.reserva?.llegada === reserva.llegada && guardado.reserva?.salida === reserva.salida
	&& guardado.reserva?.huespedes === reserva.huespedes;

// Solicitudes recientes de cada casa (apartadasCasa/{casa}: [{ leadId, llegada, salida, creada }], 24 h): la transacción
// la lee y la escribe, así dos solicitudes a la vez para la misma casa quedan en fila y la segunda ve a la primera.
// Solo el servidor (sin `match` en las reglas).
const RECIENTES_MS = HORAS_RESPUESTA * 3_600_000;

// En la transacción: la casa manda (dueño, asesor, título, moneda y personas máximo); los montos se congelan aquí (aparta
// sus fechas desde que nace); cuentan aquí el límite por IP y por correo y, sin prueba de Turnstile (`sinPrueba`), los
// estrictos. Devuelve el token del chat.
export async function guardarSolicitud(tx, leadId, token, datos, { ip = 'anon', sinPrueba = false } = {}) {
	const { lead, reserva, chat } = datos;
	// Reintento de la misma solicitud (la respuesta anterior se perdió): ya quedó, se responde lo mismo.
	const previa = await tx.leer(`leads/${leadId}`);
	if (previa) {
		if ((await tx.leer(`chatsPorSolicitud/${leadId}`))?.token === token && mismaSolicitud(previa, datos)) return token;
		no(409, ['Esta solicitud ya se envió con otros datos: recarga la página.', 'This request was already sent with other details: reload the page.']);
	}
	if (await tx.leer(`chats/${token}`)) no(409, ['Esta solicitud ya se envió con otros datos: recarga la página.', 'This request was already sent with other details: reload the page.']);
	const casa = await tx.leer(`properties/${lead.propertyId}`);
	if (!casa || casa.operacion !== 'vacacional' || visibilidadDe(casa) !== 'visible') no(409, ['Esta casa ya no recibe reservas.', 'This house no longer takes bookings.'], { casa: true });
	if ((casa.moneda || 'USD') !== reserva.moneda) no(409, ['La casa cambió de moneda: recarga la página.', 'The house changed its currency: reload the page.'], { recargar: true });
	const max = casa.vacacional?.huespedesMax;
	if (typeof max === 'number' && max >= 1 && reserva.huespedes > max) no(409, ['Son más personas de las que caben.', 'That is more guests than the house allows.'], { recargar: true });
	// Fechas que ya no están libres (una reserva confirmada o un bloqueo del socio, leídos en la transacción): no se
	// guarda ni se le dice al cliente «apartadas».
	if ([...(casa.vacacional?.bloqueos || []), ...(casa.vacacional?.reservadas || [])].some((r) => seCruzan(reserva, { llegada: r?.desde, salida: r?.hasta })))
		no(409, FECHAS_TOMADAS, { fechas: true });
	// Otra solicitud reciente de la casa que aparta esas fechas (sigue abierta, en su plazo y con montos).
	const rutaRecientes = `apartadasCasa/${lead.propertyId}`, ahora = Date.now();
	const recientes = await tx.leer(rutaRecientes);
	const vigentes = (recientes?.lista || []).filter((r) => ahora - Number(r.creada) < RECIENTES_MS);
	for (const r of vigentes.filter((x) => seCruzan(reserva, x))) {
		const [otra, sus] = await Promise.all([tx.leer(`leads/${r.leadId}`), tx.leer(`montosSolicitud/${r.leadId}`)]);
		if (otra && apartaFechas('', otra.solicitud?.estado, Number(r.creada), sus, ahora)) {
			// La misma persona con otro id: el mismo 409, y su enlace va a su correo guardado.
			if (mismaSolicitud(otra, datos)) throw tomadasPor(r.leadId);
			no(409, FECHAS_TOMADAS, { fechas: true });
		}
	}
	// Sin prueba de «no soy un robot»: el tope del sitio y los de IP y correo, contados aquí mismo.
	if (sinPrueba) {
		if (await sinPruebaEnElSitio.enTransaccion(tx, 'todas'))
			no(403, ['Necesitamos comprobar que no eres un robot y no pudimos: recarga la página o escríbenos por WhatsApp.', 'We need to verify that you are not a robot and could not: reload the page or message us on WhatsApp.'], { turnstile: true });
		if (await porIpSinPrueba.enTransaccion(tx, ip) || await porCorreoSinPrueba.enTransaccion(tx, lead.email)) no(429, MUCHAS);
	}
	if (await porIp.enTransaccion(tx, ip) || await porCorreo.enTransaccion(tx, lead.email)) no(429, MUCHAS);
	const montos = await montosDe(tx, leadId, { ...lead, reserva }, casa);
	const propietarioId = casa.propietarioId || '';
	const titulo = String(casa.titulo || '').slice(0, 200);
	tx.crear(`leads/${leadId}`, { ...lead, propertyTitulo: titulo, agentId: casa.agentId || '', propietarioId, estado: 'nuevo', reserva }, { ahora: ['createdAt'] });
	tx.crear(`chats/${token}`, { codigo: reserva.codigo, leadId, propertyId: lead.propertyId, propertyTitulo: titulo, propertyTituloEn: String(casa.en?.titulo || '').slice(0, 200), propietarioId,
		nombre: nombreDelChat(lead.nombre, lead.idioma), llegada: reserva.llegada, salida: reserva.salida, noches: reserva.noches, huespedes: reserva.huespedes,
		total: reserva.total, subtotal: reserva.subtotal, moneda: reserva.moneda, idioma: lead.idioma, ...chat,
		// El aviso de la solicitud nueva queda pendiente desde que nace: si la respuesta no le llega a la página (y no llama
		// /api/aviso-chat), lo manda el control de cada hora (aviso-chat-envio.mjs, «nueva»).
		avisoPendiente: 'nueva',
		// Cotizada por debajo del precio de la casa: le toca al equipo (lo mismo que hacía congelarMontos al congelarlos).
		...(montos && bajoElPlan(montos) ? { teTocaPendiente: true, confirmaEquipo: true } : {}) }, { ahora: ['createdAt'] });
	tx.crear(`chatsPorSolicitud/${leadId}`, { token });
	if (montos) tx.crear(`montosSolicitud/${leadId}`, montos, { ahora: ['cuando'] });
	const lista = { lista: [...vigentes, { leadId, llegada: reserva.llegada, salida: reserva.salida, creada: ahora }] };
	if (recientes) tx.cambiar(rutaRecientes, lista); else tx.crear(rutaRecientes, lista);
	return token;
}

export default async (req, context) => {
	// GET: la llave pública de Turnstile ('' sin configurar). Con ?lead=&token=: lo que preguntaban las páginas de antes
	// (aún en caché) antes de reintentar; se responde igual que la consulta por POST, con su límite por IP.
	if (req.method === 'GET') {
		const q = new URL(req.url, 'http://x').searchParams;
		if (!q.get('lead')) return json(200, { turnstile: llavePublica() });
		// Lo que no tiene forma de id y token no se cuenta ni se lee (no llena la base de límites).
		if (!ID.test(q.get('lead')) || !TOKEN.test(q.get('token') || '')) return json(200, { guardada: false });
		if (await porIpConsulta(ipDe(req, context))) return json(429, { error: 'Demasiados pedidos seguidos' });
		try { return json(200, { guardada: Boolean(await yaGuardada(q.get('lead'), q.get('token'))) }); } catch { return json(503, { error: 'Sin respuesta' }); }
	}
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!escrituraConfigurada()) return json(503, { error: 'Reservas sin configurar' });
	let pedido;
	try { pedido = await req.json(); } catch { return json(400, { error: 'Solicitud inválida' }); }
	const ip = ipDe(req, context);
	const en = pedido?.lead?.idioma === 'en';
	const error = (status, es, eng, extra = {}) => json(status, { error: en ? eng : es, ...extra });
	const muchas = () => error(429, 'Demasiadas solicitudes seguidas: espera un rato o escríbenos por WhatsApp.', 'Too many requests in a row: wait a while or message us on WhatsApp.');
	try {
		// { consulta: true, leadId, token }: ¿ya está guardada? (la página lo pregunta antes de reintentar una que se cortó;
		// si no está, la revisa otra vez como nueva). Con el límite por IP; el token, en el cuerpo y no en la dirección.
		if (pedido?.consulta === true) {
			if (!ID.test(pedido.leadId || '') || !TOKEN.test(pedido.token || '')) return json(200, { guardada: false });
			if (await porIpConsulta(ip)) return muchas();
			try { return json(200, { guardada: Boolean(await yaGuardada(pedido.leadId, pedido.token)) }); } catch { return json(503, { error: 'Sin respuesta' }); }
		}
		// El mismo envío otra vez (la respuesta anterior se perdió): si es la misma solicitud (mismo correo, casa, fechas y
		// personas), ya quedó: se responde lo mismo antes de revisar las fechas (pudo pasar la medianoche), con el límite por
		// IP, y si el cliente corrigió su nombre o su teléfono, se pone al día. Si no es la misma, sigue como una nueva (con
		// todos sus controles: la transacción la rechaza). Si no se puede leer, no se sigue como nueva (diría «ya pasó»).
		let ya, guardada = null;
		try {
			ya = await yaGuardada(pedido?.leadId, pedido?.token);
			if (ya) guardada = await leerPrivado(`leads/${pedido.leadId}`);
		} catch (err) {
			console.error('Solicitud (reintento):', err.message);
			return error(503, 'No pudimos revisar tu solicitud: vuelve a intentarlo en un momento.', 'We could not check your request: please try again in a moment.');
		}
		const pedidoPlano = { lead: { email: String(pedido?.lead?.email || '').trim().toLowerCase(), propertyId: pedido?.lead?.propertyId }, reserva: pedido?.reserva || {} };
		if (ya && mismaSolicitud(guardada, pedidoPlano)) {
			if (await porIpReenvio(ip)) return muchas();
			await ponerAlDiaContacto(pedido).catch((err) => console.error('Solicitud (contacto):', err.message));
			return json(200, { token: ya });
		}
		// El freno, después de reconocer el reenvío de una ya guardada y antes de revisar la nueva. Su ventana es la hora en
		// curso: se dice en cuántos minutos se puede volver a intentar.
		// (Un id sin forma de id cuenta cada vez, sin marca compartida.)
		if (await porIpIntentos(ip, ID.test(pedido?.leadId || '') ? pedido.leadId : '')) {
			const min = 60 - new Date().getUTCMinutes();
			return error(429, `Demasiadas solicitudes seguidas: vuelve a intentarlo en ${min} min o escríbenos por WhatsApp.`, `Too many requests in a row: try again in ${min} min or message us on WhatsApp.`, { reintentarEn: min });
		}
		const datos = revisarPedido(pedido);
		const prueba = await pasaTurnstile(pedido.turnstile, ip);
		if (prueba === 'mala') return error(403, 'No pudimos comprobar que no eres un robot. Vuelve a intentarlo.', 'We could not verify that you are not a robot. Please try again.', { turnstile: true });
		// Socio con las casas fuera del sitio por su atraso (más de 72 h): no se reserva (la ficha ya lo dice). Fuera de la
		// transacción; si no se puede leer, no frena (lo revisa otra vez la confirmación).
		const casa = await leerPrivado(`properties/${datos.lead.propertyId}`).catch(() => null);
		const pausada = casa?.propietarioId ? await moraDe(casa.propietarioId).then((n) => n === 3, (err) => { console.error('Solicitud (mora):', err.message); return false; }) : false;
		if (pausada) no(409, ['Esta casa no recibe reservas por ahora.', 'This house is not taking bookings right now.'], { pausada: true });
		// Otra solicitud abierta ya aparta esas fechas (la misma cuenta que el calendario, ocupacion.mjs; cubre también las
		// de antes de apartadasCasa). Si no se puede leer, sigue: la transacción revisa las recientes y lo confirmado.
		const apartadas = await apartadasDe(datos.lead.propertyId).catch((err) => { console.error('Solicitud (apartadas):', err.message); return []; });
		for (const r of apartadas.filter((x) => seCruzan(datos.reserva, { llegada: x.desde, salida: x.hasta }))) {
			// La misma persona (mismo correo, casa, fechas y personas) con otro id: el mismo 409, y su enlace va a su correo.
			if (await esMismaPersona(r.leadId, datos).catch(() => false)) throw tomadasPor(r.leadId);
			no(409, FECHAS_TOMADAS, { fechas: true });
		}
		// Sin prueba (`sin`), los topes estrictos cuentan dentro de la transacción. Dos que crean a la vez el mismo documento
		// (el primero de la casa o de un límite): la segunda se repite una vez y ya ve a la primera.
		const guardar = () => transaccion((tx) => guardarSolicitud(tx, pedido.leadId, pedido.token, datos, { ip, sinPrueba: prueba === 'sin' }));
		const token = await guardar().catch((err) => { if (err?.codigo === 'ALREADY_EXISTS') return guardar(); throw err; });
		// Sus fechas quedan apartadas: el calendario guardado en el CDN se borra.
		await purgarCasa(datos.lead.propertyId).catch(() => {});
		return json(200, { token });
	} catch (err) {
		if (err instanceof Rechazo) {
			// Sin esperar el correo: si el 409 tardara más cuando es la misma persona, el tiempo diría que ese correo tiene una
			// solicitud en esa casa y esas fechas (oráculo). Con waitUntil sigue después de responder.
			if (err.reenviar) {
				const envio = reenviarEnlace(err.reenviar).catch((e) => console.error('Solicitud (reenviar enlace):', e.message));
				if (typeof context?.waitUntil === 'function') context.waitUntil(envio); else await envio;
			}
			return json(err.status, { error: en ? err.en : err.message, ...err.extra });
		}
		console.error('Solicitud:', err.message);
		// Muchas a la vez sobre el mismo documento (una ráfaga): la base no alcanzó a ponerla en fila. La página guarda la
		// misma para reintentar (mismo id).
		if (['ABORTED', 'DEADLINE_EXCEEDED'].includes(err?.codigo) || /lock timeout|contention/i.test(err?.message || ''))
			return error(503, 'Hay muchas solicitudes en este momento: vuelve a intentarlo en un minuto.', 'There are many requests right now: please try again in a minute.');
		return error(500, 'No se pudo guardar. Vuelve a intentarlo.', 'We could not save it. Please try again.');
	}
};

// ¿La solicitud `leadId` es de la misma persona y la misma estancia que `datos`? (Solo para reenviarle su enlace a su
// correo; nunca para responder con su token.)
const esMismaPersona = async (leadId, datos) => mismaSolicitud(await leerPrivado(`leads/${leadId}`), datos);
// ¿Ya está guardada esta solicitud con este chat? (un reintento). Devuelve el token o ''. Si la base no responde, lanza.
async function yaGuardada(leadId, token) {
	if (!ID.test(leadId || '') || !TOKEN.test(token || '')) return '';
	const indice = await leerPrivado(`chatsPorSolicitud/${leadId}`);
	return indice?.token === token ? token : '';
}
// Un reintento con otro nombre o teléfono (el cliente lo corrigió): la solicitud se pone al día; el chat lleva el primer
// nombre, filtrado. Solo lo que pasa la misma revisión que una nueva.
async function ponerAlDiaContacto(p) {
	const nombre = texto(p?.lead?.nombre, 100)?.trim(), telefono = texto(p?.lead?.telefono, 30)?.trim();
	if (!nombre || !telefono || !telefonoValido(telefono)) return;
	await transaccion(async ({ leer, cambiar }) => {
		const lead = await leer(`leads/${p.leadId}`);
		if (!lead || (lead.nombre === nombre && lead.telefono === telefono)) return;
		// Solo el reintento de una recién enviada (30 min, la misma espera que la página) y sin responder: el enlace del
		// chat no sirve para cambiar el contacto de una reserva ya atendida.
		const creada = lead.createdAt instanceof Date ? lead.createdAt.getTime() : Date.parse(lead.createdAt || '') || 0;
		if (Date.now() - creada > 30 * 60_000 || lead.solicitud?.estado) return;
		cambiar(`leads/${p.leadId}`, { nombre, telefono }, { ahora: ['updatedAt'] });
		if (lead.nombre !== nombre) cambiar(`chats/${p.token}`, { nombre: nombreDelChat(nombre, lead.idioma) });
	});
}

export const config = { path: '/api/solicitud' };
