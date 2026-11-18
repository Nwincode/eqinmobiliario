// Piezas de las reservas por noche que escribe el servidor (con la cuenta de escritura, dentro de una transacción de
// netlify/lib/firestore-escritura.mjs). Las usan netlify/functions/reservas.mjs (lo que hace el socio) y
// netlify/functions/plazos-reservas.mjs (lo que vence solo: la solicitud sin respuesta y la reserva sin pago).
import '../../js/calc-vacacional.js';
import { idNuevo } from './firestore-escritura.mjs';

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
// Mensaje al cliente en el chat de la solicitud: del socio, o del equipo (lo que vence solo).
export const mensaje = (tx, token, datos, de = 'socio') => tx.crear(`chats/${token}/mensajes/${idNuevo()}`, { de, ...datos }, { ahora: ['createdAt'] });

