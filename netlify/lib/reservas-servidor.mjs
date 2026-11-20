// Piezas de las reservas por noche que escribe el servidor (con la cuenta de escritura, dentro de una transacción de
// netlify/lib/firestore-escritura.mjs). Las usan netlify/functions/reservas.mjs (lo que hace el socio) y
// netlify/functions/plazos-reservas.mjs (lo que vence solo: la solicitud sin respuesta y la reserva sin pago).
import '../../js/calc-vacacional.js';
import { idNuevo } from './firestore-escritura.mjs';
import { montosCotizados, yaRespondida, esDuplicada, textoDuplicada, MOTIVO_DUPLICADA } from '../../admin/js/reservas-calculo.js';

const V = globalThis.EQVacacional;

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
export const pendiente = (id) => ({ avisoPendiente: id, avisoIntentos: 0 });
export const SISTEMA = { uid: 'sistema', nombre: 'Plazo vencido' };
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
	const m = montosCotizados(lead.reserva, casa, await tx.leer(`properties/${lead.propertyId}/privado/socio`));
	if (!m) return null;
	const datos = { ...m, leadId, propertyId: lead.propertyId, propietarioId: casa.propietarioId || '', codigo: lead.reserva.codigo };
	tx.crear(ruta, datos, { ahora: ['cuando'] });
	return datos;
}

// Al confirmar `lead`, las otras solicitudes abiertas del mismo cliente (mismo correo), casa y fechas se cierran como
// «Duplicada», con un mensaje que no manda correo (avisos-chat.mjs: `silencioso`). Devuelve cuántas.
export async function cerrarDuplicadas(tx, lead, leadId) {
	const otras = (await tx.consultar('leads', 'propertyId', lead.propertyId)).filter((o) => o.id !== leadId && esDuplicada({ ...lead, id: leadId }, o) && !yaRespondida('', o.solicitud?.estado));
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

