// Cada 15 minutos: los plazos de las reservas por noche (admin/js/reservas-calculo.js), cumplidos por el servidor con
// la cuenta de escritura, cada uno en su transacción (si alguien respondió, pagó o subió su comprobante mientras tanto,
// no se toca):
//  - la solicitud que el anfitrión no respondió en 24 h se cierra sola («no se dio», motivo «Sin respuesta del anfitrión»),
//    salvo que esté conversando con el cliente (escribió en el chat en las últimas 12 h);
//  - la solicitud abierta de una casa que salió del sitio se cierra («La casa ya no está disponible»);
//  - la solicitud repetida (mismo correo, casa y fechas) de una que ya se confirmó se cierra como «Duplicada», sin correo;
//  - la solicitud que llegó encima de otra que aparta esas fechas se cierra («Fechas ya apartadas»; cerrarSiSeCruza);
//  - la solicitud que todavía no tiene sus montos congelados (no llegó su /api/aviso-chat) los recibe;
//  - la solicitud sin chat (escrita a mano contra la base, o el chat nunca se creó) se cierra a los 10 minutos («Sin
//    chat», sin correo): no se queda en cada vuelta gastando el tiempo de las de verdad, que van primero;
//  - la reserva confirmada sin pago ni comprobante: 24 h antes de vencer, un recordatorio en el chat; al vencer (48 h, o
//    las 23:00 de la víspera de la llegada) se cancela sola y las fechas quedan libres. Si una vuelta no corrió a
//    tiempo, la siguiente se pone al día (cancelaSola: hasta un día después de la llegada).
// El cliente recibe el mensaje en su chat y su correo (aviso-chat-envio.mjs), mandado en seguida después de cada cambio;
// cada cambio deja su aviso pendiente en el chat, así un correo que no salió (o una vuelta que Netlify cortó) lo manda
// el control de cada hora. Cada vuelta para a los 20 s (Netlify corta a los 30): lo que falta, en la siguiente.
// El equipo ve las canceladas en el correo de cada hora (solicitudes-sin-respuesta.mjs). Cada cambio queda en el
// historial de la solicitud («Plazo vencido»).
import '../../js/calc-vacacional.js';
import { datosConfigurados, desde, leerPrivado } from '../lib/firestore.mjs';
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { fechasDeLaCasa, fechasCambiaron, responder, mensaje, pendiente, chatDe, congelarMontos, cerrarDuplicadas, cerrarSiSeCruza, solicitudDe, SISTEMA } from '../lib/reservas-servidor.mjs';
import { purgarCasa } from '../lib/ocupacion.mjs';
import { marcarPorPublicar } from '../lib/publicar.mjs';
import { enviarAvisosChat, avisarQueTocaConfirmar } from '../lib/aviso-chat-envio.mjs';
import { yaRespondida, seCruzan, bajoElPlan, conPlazo, venceRespuesta, plazoDePago, recordarPagoDesde, cancelaSola, esDuplicada, fechaHora, MOTIVO_SIN_RESPUESTA, MOTIVO_SIN_PAGO,
	MOTIVO_CASA_NO_DISPONIBLE, MOTIVO_SIN_CHAT, MOTIVO_EQUIPO_NO_CONFIRMO, textoCliente, HORAS_RESPUESTA } from '../../admin/js/reservas-calculo.js';
import { visibilidadDe } from '../../admin/js/estados.js';
import { conReloj } from '../lib/estado.mjs';

const DIA = 86400000;
const PRESUPUESTO = 20000;
const TOKEN = /^[A-Za-z0-9]{20,60}$/;
const ms = (v) => (v instanceof Date ? v.getTime() : Date.parse(v || '') || 0);
const abierta = (l) => l.reserva?.codigo && (!l.solicitud?.estado || l.solicitud.estado === 'pendiente');
// El chat nace unos segundos después de su solicitud (js/reserva-chat.js): antes de esto no se da por perdido.
const GRACIA_CHAT = 10 * 60000;

// Solicitud sin chat (revisado dentro de la transacción): se cierra sin mensaje ni correo (no hay a quién).
async function cerrarSinChat(leadId, ahora) {
	return transaccion(async (tx) => {
		const lead = await tx.leer(`leads/${leadId}`);
		if (!lead || !abierta(lead) || ahora - ms(lead.createdAt) < GRACIA_CHAT || await chatDe(tx.leer, leadId)) return null;
		responder(tx, SISTEMA, leadId, 'no', 'Sin chat: se cerró sola', { 'solicitud.motivo': MOTIVO_SIN_CHAT });
		return null;
	});
}

// Solicitud sin respuesta en 24 h, o de una casa que ya no está en el sitio: se cierra.
async function cerrarSinRespuesta(leadId, ahora, { casaFuera = false } = {}) {
	return transaccion(async (tx) => {
		const lead = await tx.leer(`leads/${leadId}`);
		if (!lead?.reserva?.codigo) return null;
		if (casaFuera) {
			const casa = await tx.leer(`properties/${lead.propertyId}`);
			if (casa && visibilidadDe(casa) === 'visible') return null;
		} else if (!conPlazo(ms(lead.createdAt)) || ahora < venceRespuesta(ms(lead.createdAt))) return null;
		const c = await chatDe(tx.leer, leadId);
		if (!c || yaRespondida(c.chat.estado, lead.solicitud?.estado)) return null;
		if (!casaFuera) {
			// Si el anfitrión está conversando con el cliente (escribió en las últimas 12 h), todavía no se cierra.
			const suyos = await tx.consultar('mensajes', 'de', 'socio', `chats/${c.token}`);
			if (suyos.some((m) => ahora - ms(m.createdAt) < 12 * 3600000)) return null;
		}
		// El motivo de verdad: la casa salió del sitio; la confirmaba el equipo (cotizada por debajo: el socio no podía) y
		// no se confirmó; o el anfitrión no respondió. El cliente lo lee en su idioma y el correo del plazo lo repite.
		const en = c.chat.idioma === 'en';
		const [motivo, clave, que] = casaFuera ? [MOTIVO_CASA_NO_DISPONIBLE, 'casaNoDisponible', 'La casa ya no está en el sitio: se cerró sola']
			: c.chat.confirmaEquipo ? [MOTIVO_EQUIPO_NO_CONFIRMO, 'equipoNoConfirmo', `La confirmaba el equipo y no se confirmó en ${HORAS_RESPUESTA} h: se cerró sola`]
				: [MOTIVO_SIN_RESPUESTA, 'sinRespuesta', `No respondida en ${HORAS_RESPUESTA} h: se cerró sola`];
		responder(tx, SISTEMA, leadId, 'no', que, { 'solicitud.motivo': motivo });
		const id = mensaje(tx, c.token, { texto: textoCliente(clave, en), plazo: true, motivo }, 'equipo');
		tx.cambiar(`chats/${c.token}`, { estado: 'no', ...pendiente(id) });
		return { token: c.token, casa: lead.propertyId };
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
		const { desde: base, vence } = plazoDePago(reserva, confirmada);
		if (ahora >= vence) {
			if (!cancelaSola(vence, reserva.llegada, ahora)) return null;
			const casa = await tx.leer(`properties/${reserva.propertyId}`);
			if (!casa) return null;
			// Sin su solicitud (borrada a mano), la reserva igual se cancela: lo de la solicitud se omite (solicitudDe).
			await solicitudDe(tx, reserva.leadId);
			await fechasDeLaCasa(tx, { ...casa, id: reserva.propertyId }, reserva, { ...reserva, estado: 'cancelada' });
			tx.cambiar(`reservas/${reservaId}`, { estado: 'cancelada', motivo: MOTIVO_SIN_PAGO }, { ahora: ['updatedAt'] });
			responder(tx, SISTEMA, reserva.leadId, 'cancelada', 'Sin pago a tiempo: se canceló sola', { 'solicitud.motivo': MOTIVO_SIN_PAGO });
			const id = mensaje(tx, reserva.chat, { texto: textoCliente('sinPago', chat.idioma === 'en'), plazo: true, motivo: MOTIVO_SIN_PAGO }, 'equipo');
			tx.cambiar(`chats/${reserva.chat}`, { estado: 'cancelada', ...pendiente(id) });
			return { token: reserva.chat, casa: reserva.propertyId, reserva: true };
		}
		if (ahora >= recordarPagoDesde(base, vence) && !chat.recordatorioPago) {
			const en = chat.idioma === 'en';
			const texto = en
				? `Reminder: if your payment does not arrive by ${fechaHora(vence, true)}, the booking is cancelled automatically and the dates are released. Already paid? Attach your receipt with the camera button.`
				: `Recuerda: si tu pago no llega antes del ${fechaHora(vence, false)}, la reserva se cancela sola y las fechas quedan libres. ¿Ya pagaste? Adjunta tu comprobante con el botón de la cámara.`;
			const id = mensaje(tx, reserva.chat, { tipo: 'recordatorio', texto }, 'equipo');
			tx.cambiar(`chats/${reserva.chat}`, { recordatorioPago: true, ...pendiente(id) });
			return { token: reserva.chat };
		}
		return null;
	});
}

// La última vuelta buena queda en estado/plazos-reservas (la tarjeta «Estado del sistema» avisa si deja de correr).
export default conReloj('plazos-reservas', async () => {
	if (!datosConfigurados() || !escrituraConfigurada()) return;
	const ahora = Date.now();
	const inicio = Date.now();
	// Cada cambio, con su correo en seguida (si la vuelta se corta, el aviso queda pendiente en el chat).
	// Lo que liberó o apartó fechas borra la copia de /api/disponibilidad de su casa en el CDN: al final de la vuelta,
	// todas juntas (cada purga a lo más 3 s), así no gastan el tiempo de la vuelta.
	const tocadas = new Map();
	const uno = async (p, que) => {
		try {
			const hecho = await p;
			const t = typeof hecho === 'string' ? hecho : hecho?.token;
			if (hecho?.casa) tocadas.set(hecho.casa, tocadas.get(hecho.casa) || Boolean(hecho.reserva));
			if (t) await enviarAvisosChat(t).catch((err) => console.error('Plazos (correo):', err.message));
		} catch (err) { console.error(`Plazos (${que}):`, err.message); }
	};
	const alDia = () => Promise.allSettled([...tocadas].map(([casa, reserva]) => (reserva ? fechasCambiaron(casa, 'Reserva sin pago a tiempo: se canceló sola') : purgarCasa(casa))));
	const queda = () => Date.now() - inicio < PRESUPUESTO;
	try {
		// Primero lo que cancela o recuerda un pago (lo que más pesa si la vuelta se corta a los 20 s).
		// Reservas de la web confirmadas en los últimos 30 días (se revisa cada una en su transacción).
		const todasLasReservas = await desde('reservas', 'createdAt', new Date(ahora - 30 * DIA));
		// «Por publicar» que no alcanzó a marcarse (lo de después de confirmar o cancelar se cortó por el plazo de la
		// función): solo si cambió lo que se publica, las fechas reservadas de una casa por noche (fechasDeLaCasa pone su
		// updatedAt al cambiar vacacional.reservadas) después de la última publicación, y meta/publish sin «pendiente». Un
		// pago recibido o un comprobante no cuentan. La misma pieza que usa reservas.mjs.
		const pub = await leerPrivado('meta/publish').catch(() => undefined);
		const cambiadas = pub !== undefined && !pub?.pendiente
			? (await desde('properties', 'updatedAt', new Date(ms(pub?.ultimaPublicacion) || ahora - 30 * DIA)).catch(() => [])).filter((p) => p.operacion === 'vacacional') : [];
		if (cambiadas.length)
			await transaccion((tx) => marcarPorPublicar(tx, 'Reservas que cambiaron después de la última publicación', 'Reservas')).catch((err) => console.error('Plazos (por publicar):', err.message));
		const reservas = todasLasReservas
			.filter((r) => r.estado === 'confirmada' && r.leadId && r.chat && conPlazo(ms(r.createdAt)) && (({ desde: d, vence }) => ahora >= Math.min(vence, recordarPagoDesde(d, vence)))(plazoDePago(r, ms(r.createdAt))));
		for (const r of reservas) {
			if (!queda()) return;
			await uno(cobrarOCancelar(r.id, ahora), 'reserva');
		}
		// Solicitudes de los últimos 7 días que siguen sin respuesta.
		const recientes = await desde('leads', 'createdAt', new Date(ahora - 7 * DIA));
		// Las que no tienen chat pasada la gracia (lecturas en paralelo, no una transacción por cada una) van aparte, al
		// final: así las de verdad nunca esperan detrás de ellas. Si la lectura falla, se trata como de verdad.
		const conChat = await Promise.all(recientes.filter(abierta).map(async (l) => [l, ahora - ms(l.createdAt) < GRACIA_CHAT
			|| (await leerPrivado(`chatsPorSolicitud/${l.id}`).then((x) => Boolean(x?.token), () => true))]));
		const abiertas = conChat.filter(([, si]) => si).map(([l]) => l);
		const sinChat = conChat.filter(([, si]) => !si).map(([l]) => l);
		// Las repetidas de una que ya se confirmó (el administrador confirma en el panel: aquí se cierran las suyas).
		for (const l of recientes.filter((x) => x.solicitud?.estado === 'confirmada' && abiertas.some((o) => esDuplicada(x, o)))) {
			if (!queda()) return;
			await transaccion(async (tx) => { const lead = await tx.leer(`leads/${l.id}`); if (lead?.solicitud?.estado === 'confirmada') await cerrarDuplicadas(tx, lead, l.id); })
				.catch((err) => console.error('Plazos (duplicadas):', err.message));
		}
		// Montos congelados de las que todavía no los tienen (solo los de la última semana: no se lee la colección entera).
		const congeladas = new Set((await desde('montosSolicitud', 'cuando', new Date(ahora - 8 * DIA)).catch(() => [])).map((m) => m.id));
		for (const l of abiertas.filter((x) => !congeladas.has(x.id))) {
			if (!queda()) return;
			const montos = await transaccion((tx) => congelarMontos(tx, l.id)).catch((err) => { console.error('Plazos (montos):', err.message); return null; });
			if (bajoElPlan(montos)) {
				const t = (await leerPrivado(`chatsPorSolicitud/${l.id}`).catch(() => null))?.token;
				if (t) await avisarQueTocaConfirmar(t).catch((err) => console.error('Plazos (te toca confirmar):', err.message));
			}
			if (montos) tocadas.set(l.propertyId, tocadas.get(l.propertyId) || false);
		}
		// Abiertas de una casa que salió del sitio.
		const casas = new Map();
		for (const l of abiertas) {
			if (!queda()) return;
			if (!casas.has(l.propertyId)) casas.set(l.propertyId, await leerPrivado(`properties/${l.propertyId}`).catch(() => undefined));
			const casa = casas.get(l.propertyId);
			if (casa === undefined) continue;
			if (!casa || visibilidadDe(casa) !== 'visible') await uno(cerrarSinRespuesta(l.id, ahora, { casaFuera: true }), 'casa fuera');
			// Sus fechas ya tienen una reserva confirmada (su /api/aviso-chat no llegó o llegó antes de la confirmación).
			else if ((casa.vacacional?.reservadas || []).some((r) => seCruzan(l.reserva, { llegada: r.desde, salida: r.hasta })))
				await uno(transaccion(async (tx) => { const t = await cerrarSiSeCruza(tx, l.id); return t && { token: t, casa: l.propertyId }; }), 'cruzada');
			else if (conPlazo(ms(l.createdAt)) && ahora >= venceRespuesta(ms(l.createdAt))) await uno(cerrarSinRespuesta(l.id, ahora), 'solicitud');
		}
		// Al final, las que no tienen chat: una vez cerradas, ya no entran en la vuelta siguiente.
		for (const l of sinChat) {
			if (!queda()) return;
			await cerrarSinChat(l.id, ahora).catch((err) => console.error('Plazos (sin chat):', err.message));
		}
	} catch (err) {
		console.error('Plazos:', err.message);
	} finally {
		await alDia();
	}
});

export const config = { schedule: '*/15 * * * *' };
