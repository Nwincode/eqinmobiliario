// Piezas de las reservas por noche que escribe el servidor (con la cuenta de escritura, dentro de una transacción de
// netlify/lib/firestore-escritura.mjs). Las usan netlify/functions/reservas.mjs (lo que hace el socio) y
// netlify/functions/plazos-reservas.mjs (lo que vence solo: la solicitud sin respuesta y la reserva sin pago).
import '../../js/calc-vacacional.js';
import { idNuevo, marcarPorPublicar, transaccion } from './firestore-escritura.mjs';
import { purgarCasa } from './ocupacion.mjs';
import { desde } from './firestore.mjs';
import { montosCotizados, bajoElPlan, seCruzan, yaRespondida, esDuplicada, textoDuplicada, apartadaPor, MOTIVO_DUPLICADA, MOTIVO_FECHAS_APARTADAS, TEXTO_FECHAS_APARTADAS } from '../../admin/js/reservas-calculo.js';

const V = globalThis.EQVacacional;
const ms = (v) => (v instanceof Date ? v.getTime() : Date.parse(v || '') || 0);

// Una respuesta con su código HTTP (la función la devuelve tal cual).
export class Respuesta extends Error { constructor(status, error) { super(error); this.status = status; } }
export const falla = (status, error) => { throw new Respuesta(status, error); };

// Fechas ocupadas de la casa recalculadas con TODAS sus reservas leídas ahora (el servidor las ve todas).
export async function fechasDeLaCasa(tx, casa, antes, despues) {
	const guardadas = casa.vacacional?.reservadas || [];
	const reservas = await tx.consultar('reservas', 'propertyId', casa.id);
	const c = V.cambioDeReserva({ guardadas, reservas, antes, despues, propertyId: casa.id, completas: true });
	if (c.choque) falla(422, `Esas fechas chocan con otra reserva confirmada: ${c.choque.llegada} – ${c.choque.salida}.`);
	if (JSON.stringify(c.reservadas) !== JSON.stringify(V.unirRangos(guardadas))) tx.cambiar(`properties/${casa.id}`, { 'vacacional.reservadas': c.reservadas }, { ahora: ['updatedAt'] });
}

// Después de un cambio de fechas que escribió el servidor (reservas.mjs, el cron de plazos): su copia del CDN se borra
// y la página publicada (que lleva las fechas por si /api/disponibilidad no responde) queda «por publicar». Fuera de la
// transacción del cambio: meta/publish es uno para todo el sitio y meterlo ahí haría chocar confirmaciones de casas
// distintas. Si falla, el cambio ya quedó.
export async function fechasCambiaron(casa, desc) {
	await purgarCasa(casa);
	await transaccion((tx) => marcarPorPublicar(tx, desc, 'Reservas')).catch((err) => console.error('Por publicar:', err.message));
}

// Una solicitud abierta cuyas fechas ya tiene una reserva confirmada de la casa se cierra sola con «Fechas ya
// reservadas» y el cliente lo lee en su chat (apartadaPor en admin/js/reservas-calculo.js). Dos solicitudes abiertas
// que se cruzan no se cierran entre sí (una pudo ser falsa): al confirmar una, se cierran las otras. La llaman
// /api/aviso-chat (cada vez que llega el aviso de una abierta: también uno atrasado), cerrarLasQueSeCruzan (al
// confirmar) y el cron de plazos. Lee solo la solicitud, la casa (sus fechas reservadas siguen a cada reserva) y el chat.
// Devuelve el token del chat si la cerró.
export async function cerrarSiSeCruza(tx, leadId) {
	const lead = await tx.leer(`leads/${leadId}`);
	if (!lead?.reserva?.codigo || !lead.propertyId || yaRespondida('', lead.solicitud?.estado)) return null;
	const casa = await tx.leer(`properties/${lead.propertyId}`);
	const reservas = (casa?.vacacional?.reservadas || []).map((r, i) => ({ id: `fechas-${i}`, propertyId: lead.propertyId, estado: 'confirmada', llegada: r.desde, salida: r.hasta, codigo: 'otra reserva confirmada' }));
	// La reserva de esta misma solicitud (si ya se confirmó por otro camino) no cuenta: entonces ya no está abierta.
	if (!apartadaPor({ ...lead, id: leadId }, reservas)) return null;
	const c = await chatDe(tx.leer, leadId);
	if (!c || yaRespondida(c.chat.estado, '')) return null;
	responder(tx, SISTEMA_APARTADAS, leadId, 'no', 'Esas fechas ya tienen otra reserva confirmada: se cerró sola', { 'solicitud.motivo': MOTIVO_FECHAS_APARTADAS });
	const id = mensaje(tx, c.token, { texto: TEXTO_FECHAS_APARTADAS }, 'equipo');
	tx.cambiar(`chats/${c.token}`, { estado: 'no', ...pendiente(id) });
	return c.token;
}
// Al confirmar una reserva en una casa: las otras solicitudes abiertas que se cruzan con sus fechas se cierran (cada una
// en su transacción, con su correo). Las candidatas se buscan fuera de la transacción (las de los últimos 30 días).
// Devuelve los tokens de los chats cerrados (quien llama manda sus correos).
export async function cerrarLasQueSeCruzan(propertyId, llegada, salida, ahora = Date.now()) {
	const abiertas = (await desde('leads', 'createdAt', new Date(ahora - 30 * 86400_000))).filter((l) => l.propertyId === propertyId && l.reserva?.llegada
		&& !yaRespondida('', l.solicitud?.estado) && (!llegada || seCruzan(l.reserva, { llegada, salida })));
	const tokens = [];
	for (const l of abiertas) {
		const t = await transaccion((tx) => cerrarSiSeCruza(tx, l.id)).catch((err) => { console.error('Cerrar cruzada:', err.message); return null; });
		if (t) tokens.push(t);
	}
	return tokens;
}

// Lo que cambia en la solicitud al responderla, con su renglón de historial (lo mismo que `respuesta` en reservas.js).
export const responder = (tx, socio, leadId, estado, que, extra = {}) => tx.cambiar(`leads/${leadId}`, { 'solicitud.estado': estado, ...extra },
	{ ahora: ['updatedAt'], agregar: { 'solicitud.historial': [{ que, quien: socio.uid, nombre: socio.nombre, cuando: new Date().toISOString() }] } });
// Un renglón en el historial de la solicitud sin cambiar su estado (p. ej. «Pago recibido»).
export const anotar = (tx, quien, leadId, que) => tx.cambiar(`leads/${leadId}`, {},
	{ ahora: ['updatedAt'], agregar: { 'solicitud.historial': [{ que, quien: quien.uid, nombre: quien.nombre, cuando: new Date().toISOString() }] } });
// Mensaje al cliente en el chat de la solicitud: del socio, o del equipo (lo que vence solo). Devuelve su id: quien
// lo llama lo pone como aviso pendiente en el mismo cambio del chat (`{ ...pendiente(id) }`), así un correo que no
// salió (la función se cortó o el servicio falló) lo manda el control de cada hora (aviso-chat-envio.mjs).
export function mensaje(tx, token, datos, de = 'socio') {
	const id = idNuevo();
	tx.crear(`chats/${token}/mensajes/${id}`, { de, ...datos }, { ahora: ['createdAt'] });
	return id;
}
export const pendiente = (id) => ({ avisoPendiente: id });
export const SISTEMA = { uid: 'sistema', nombre: 'Plazo vencido' };
const SISTEMA_APARTADAS = { uid: 'sistema', nombre: 'Fechas apartadas' };
const TOKEN = /^[A-Za-z0-9]{20,60}$/;

// El chat de una solicitud por su índice (el servidor no adivina cuál es).
export async function chatDe(leer, leadId) {
	const token = (await leer(`chatsPorSolicitud/${leadId}`))?.token;
	const chat = TOKEN.test(token || '') ? await leer(`chats/${token}`) : null;
	return chat && chat.leadId === leadId ? { token, chat } : null;
}

// Los montos de la solicitud, congelados la primera vez que el servidor la ve (montosSolicitud/{solicitud}): la
// parte del socio, la limpieza y el margen de la casa en ese momento (admin/js/reservas-calculo.js montosCotizados).
// La llaman /api/aviso-chat (al llegar la solicitud), el cron de plazos (si ese aviso no llegó) y la confirmación (si
// todavía no estaban). Una solicitud ya respondida no se congela (sus montos ya están en su reserva). Devuelve los
// montos (los guardados si ya estaban) o null.
export async function congelarMontos(tx, leadId, { lead = null, casa = null } = {}) {
	const ruta = `montosSolicitud/${leadId}`;
	const ya = await tx.leer(ruta);
	if (ya) return ya;
	lead ||= await tx.leer(`leads/${leadId}`);
	if (!lead?.reserva?.codigo || !lead.propertyId || (lead.solicitud?.estado && lead.solicitud.estado !== 'pendiente')) return null;
	casa ||= await tx.leer(`properties/${lead.propertyId}`);
	if (!casa) return null;
	// Solo una solicitud con su chat (la del sitio): una escrita a mano contra la base no se cotiza ni aparta fechas.
	const c = await chatDe(tx.leer, leadId);
	if (!c) return null;
	const m = montosCotizados(lead.reserva, casa, await tx.leer(`properties/${lead.propertyId}/privado/socio`));
	if (!m) return null;
	const datos = { ...m, leadId, propertyId: lead.propertyId, propietarioId: casa.propietarioId || '', codigo: lead.reserva.codigo };
	tx.crear(ruta, datos, { ahora: ['cuando'] });
	// Cotizada por debajo del precio de la casa: le toca al equipo. El aviso queda pendiente en el chat en este mismo
	// cambio (solo quien la congela lo pone) y lo manda avisarQueTocaConfirmar; el control de cada hora lo reintenta.
	if (bajoElPlan(m)) tx.cambiar(`chats/${c.token}`, { teTocaPendiente: true });
	return datos;
}

// Al confirmar `lead`, las otras solicitudes abiertas del mismo cliente (mismo correo), casa y fechas se cierran como
// «Duplicada», con un mensaje que no manda correo (avisos-chat.mjs: `silencioso`). Devuelve cuántas.
export async function cerrarDuplicadas(tx, lead, leadId) {
	// Solo las del mismo correo (esDuplicada lo pide): no se leen todas las solicitudes de la casa dentro de la transacción.
	// El sitio lo guarda en minúsculas; una de antes pudo quedar como se escribió: se busca de las dos formas.
	const correo = String(lead.email || '').trim();
	if (!correo) return 0;
	const formas = [...new Set([correo, correo.toLowerCase()])];
	const halladas = (await Promise.all(formas.map((c) => tx.consultar('leads', 'email', c)))).flat();
	const otras = halladas.filter((o, i) => halladas.findIndex((x) => x.id === o.id) === i).filter((o) => o.id !== leadId && esDuplicada({ ...lead, id: leadId }, o) && !yaRespondida('', o.solicitud?.estado));
	let n = 0;
	for (const o of otras) {
		const c = await chatDe(tx.leer, o.id);
		if (c && yaRespondida(c.chat.estado, '')) continue;
		responder(tx, SISTEMA, o.id, 'no', `Duplicada de ${lead.reserva.codigo}: se cerró sola`, { 'solicitud.motivo': MOTIVO_DUPLICADA });
		if (c) {
			mensaje(tx, c.token, { texto: textoDuplicada(lead.reserva.codigo), silencioso: true }, 'equipo');
			tx.cambiar(`chats/${c.token}`, { estado: 'no' });
		}
		n++;
	}
	return n;
}

