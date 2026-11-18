// Cada 15 minutos: los plazos de las reservas por noche (admin/js/reservas-calculo.js), cumplidos por el servidor con
// la cuenta de escritura, cada uno en su transacción (si alguien respondió, pagó o subió su comprobante mientras tanto,
// no se toca):
//  - la solicitud que el anfitrión no respondió en 24 h se cierra sola («no se dio», motivo «Sin respuesta del anfitrión»),
//    salvo que esté conversando con el cliente (escribió en el chat en las últimas 12 h);
//  - la reserva confirmada sin pago ni comprobante: 24 h antes de vencer, un recordatorio en el chat; al vencer (48 h, o
//    las 23:00 de la víspera de la llegada) se cancela sola y las fechas quedan libres.
// El cliente recibe el mensaje en su chat y su correo (aviso-chat-envio.mjs); el equipo ve las canceladas en el correo
// de cada hora (solicitudes-sin-respuesta.mjs). Cada cambio queda en el historial de la solicitud («Plazo vencido»).
import '../../js/calc-vacacional.js';
import { datosConfigurados, desde } from '../lib/firestore.mjs';
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { fechasDeLaCasa, responder, mensaje } from '../lib/reservas-servidor.mjs';
import { enviarAvisosChat } from '../lib/aviso-chat-envio.mjs';
import { yaRespondida, antesDeLlegar, conPlazo, venceRespuesta, vencePago, recordarPagoDesde, MOTIVO_SIN_RESPUESTA, MOTIVO_SIN_PAGO, TEXTO_SIN_RESPUESTA, TEXTO_SIN_PAGO, HORAS_RESPUESTA } from '../../admin/js/reservas-calculo.js';

const DIA = 86400000;
const SISTEMA = { uid: 'sistema', nombre: 'Plazo vencido' };
const TOKEN = /^[A-Za-z0-9]{20,60}$/;
const ms = (v) => (v instanceof Date ? v.getTime() : Date.parse(v || '') || 0);
const fechaHora = (t, en) => new Date(t).toLocaleString(en ? 'en-US' : 'es-GT', { timeZone: 'America/Guatemala', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// El chat de una solicitud por su índice (el servidor no adivina cuál es).
async function chatDe(leer, leadId) {
	const token = (await leer(`chatsPorSolicitud/${leadId}`))?.token;
	const chat = TOKEN.test(token || '') ? await leer(`chats/${token}`) : null;
	return chat && chat.leadId === leadId ? { token, chat } : null;
}

// Solicitud sin respuesta en 24 h: se cierra.
async function cerrarSinRespuesta(leadId, ahora) {
	return transaccion(async (tx) => {
		const lead = await tx.leer(`leads/${leadId}`);
		if (!lead?.reserva?.codigo || !conPlazo(ms(lead.createdAt)) || ahora < venceRespuesta(ms(lead.createdAt))) return null;
		const c = await chatDe(tx.leer, leadId);
		if (!c || yaRespondida(c.chat.estado, lead.solicitud?.estado)) return null;
		// Si el anfitrión está conversando con el cliente (escribió en las últimas 12 h), todavía no se cierra.
		const suyos = await tx.consultar('mensajes', 'de', 'socio', `chats/${c.token}`);
		if (suyos.some((m) => ahora - ms(m.createdAt) < 12 * 3600000)) return null;
		responder(tx, SISTEMA, leadId, 'no', `No respondida en ${HORAS_RESPUESTA} h: se cerró sola`, { 'solicitud.motivo': MOTIVO_SIN_RESPUESTA });
		mensaje(tx, c.token, { texto: TEXTO_SIN_RESPUESTA, plazo: true }, 'equipo');
		tx.cambiar(`chats/${c.token}`, { estado: 'no' });
		return c.token;
	});
}

// Reserva confirmada sin pago: recordatorio o cancelación (lo que toque ahora, revisado dentro de la transacción).
async function cobrarOCancelar(reservaId, ahora) {
	return transaccion(async (tx) => {
		const reserva = await tx.leer(`reservas/${reservaId}`);
		if (!reserva || reserva.estado !== 'confirmada' || !reserva.leadId || !TOKEN.test(reserva.chat || '')) return null;
		const chat = await tx.leer(`chats/${reserva.chat}`);
		// Pagada, con comprobante o de otra solicitud: no se toca.
		if (!chat || chat.estado !== 'confirmada' || chat.comprobanteCliente || chat.leadId !== reserva.leadId) return null;
		const confirmada = ms(reserva.createdAt);
		if (!conPlazo(confirmada)) return null;
		const vence = vencePago(confirmada, reserva.llegada);
		if (ahora >= vence) {
			if (!antesDeLlegar(reserva.llegada, ahora)) return null;
			const casa = await tx.leer(`properties/${reserva.propertyId}`);
			if (!casa) return null;
			await fechasDeLaCasa(tx, { ...casa, id: reserva.propertyId }, reserva, { ...reserva, estado: 'cancelada' });
			tx.cambiar(`reservas/${reservaId}`, { estado: 'cancelada', motivo: MOTIVO_SIN_PAGO }, { ahora: ['updatedAt'] });
			responder(tx, SISTEMA, reserva.leadId, 'cancelada', 'Sin pago a tiempo: se canceló sola', { 'solicitud.motivo': MOTIVO_SIN_PAGO });
			mensaje(tx, reserva.chat, { texto: TEXTO_SIN_PAGO, plazo: true }, 'equipo');
			tx.cambiar(`chats/${reserva.chat}`, { estado: 'cancelada' });
			return reserva.chat;
		}
		if (ahora >= recordarPagoDesde(confirmada, reserva.llegada) && !chat.recordatorioPago) {
			const en = chat.idioma === 'en';
			const texto = en
				? `Reminder: if your payment does not arrive by ${fechaHora(vence, true)}, the booking is cancelled automatically and the dates are released. Already paid? Attach your receipt with the camera button.`
				: `Recuerda: si tu pago no llega antes del ${fechaHora(vence, false)}, la reserva se cancela sola y las fechas quedan libres. ¿Ya pagaste? Adjunta tu comprobante con el botón de la cámara.`;
			mensaje(tx, reserva.chat, { tipo: 'recordatorio', texto }, 'equipo');
			tx.cambiar(`chats/${reserva.chat}`, { recordatorioPago: true });
			return reserva.chat;
		}
		return null;
	});
}

export default async () => {
	if (!datosConfigurados() || !escrituraConfigurada()) return;
	const ahora = Date.now();
	const tokens = [];
	const uno = (p, que) => p.then((t) => { if (t) tokens.push(t); }).catch((err) => console.error(`Plazos (${que}):`, err.message));
	try {
		// Solicitudes de los últimos 7 días que siguen sin respuesta y ya vencieron.
		const leads = (await desde('leads', 'createdAt', new Date(ahora - 7 * DIA)))
			.filter((l) => l.reserva?.codigo && (!l.solicitud?.estado || l.solicitud.estado === 'pendiente') && conPlazo(ms(l.createdAt)) && ahora >= venceRespuesta(ms(l.createdAt)));
		for (const l of leads) await uno(cerrarSinRespuesta(l.id, ahora), 'solicitud');
		// Reservas de la web confirmadas en los últimos 30 días (se revisa cada una en su transacción).
		const reservas = (await desde('reservas', 'createdAt', new Date(ahora - 30 * DIA)))
			.filter((r) => r.estado === 'confirmada' && r.leadId && r.chat && conPlazo(ms(r.createdAt)) && ahora >= Math.min(vencePago(ms(r.createdAt), r.llegada), recordarPagoDesde(ms(r.createdAt), r.llegada)));
		for (const r of reservas) await uno(cobrarOCancelar(r.id, ahora), 'reserva');
	} catch (err) {
		console.error('Plazos:', err.message);
	}
	// Los correos al cliente, con lo ya guardado.
	for (const t of tokens) await enviarAvisosChat(t).catch((err) => console.error('Plazos (correo):', err.message));
};

export const config = { schedule: '*/15 * * * *' };
