// Lo que el SOCIO hace con una solicitud de reserva por noche, hecho en el servidor: POST /api/reservas
//   Authorization: Bearer <token de Firebase del socio>
//   { accion: 'confirmar' | 'no' | 'cancelar' | 'pago' | 'nollego', leadId, motivo? }
// El panel ya no calcula ni escribe el dinero del socio: aquí se lee todo de la base (la solicitud, la casa, sus precios
// y su margen, las reservas de la casa, el chat de la solicitud por su índice y los datos de pago de la ficha), se
// calcula con lo mismo que usa el panel (admin/js/reservas-calculo.js y js/calc-vacacional.js) y se escribe en una
// transacción con la cuenta de escritura (netlify/lib/firestore-escritura.mjs). De quien llama solo se toman la acción,
// la solicitud y el motivo (de la lista fija): ningún monto.
// GET /api/reservas (administrador): { estado: 'activo' | 'sin configurar' | 'error' } para el aviso de Solicitudes.
// Errores en JSON { error }: 401 sin sesión, 403 no es suyo, 404 no existe, 409 ya se respondió o no se puede,
// 422 fechas que chocan o datos que faltan, 429 demasiados pedidos, 503 la cuenta de escritura no está (o Google la
// rechaza): con 503 (o `caminoDeAntes`: un chat de antes sin índice) el panel sigue por el camino de antes, que
// gobiernan las reglas publicadas.
// Las reservas del administrador (Rentas y Solicitudes) siguen en el panel (admin/js/reservas.js).
import '../../js/calc-vacacional.js';
import { json, socioUser, staffUser } from '../lib/auth.mjs';
import { transaccion, escrituraConfigurada, probarEscritura } from '../lib/firestore-escritura.mjs';
import { Respuesta, falla, fechasCambiaron, fechasDeLaCasa, responder, mensaje, anotar, pendiente, congelarMontos, cerrarDuplicadas } from '../lib/reservas-servidor.mjs';
import { enviarAvisosChat } from '../lib/aviso-chat-envio.mjs';
import { limitador } from '../lib/limite.mjs';
import { leerPrivado } from '../lib/firestore.mjs';
import { externasDe, purgarCasa } from '../lib/ocupacion.mjs';
import { choqueExterno, motivoSocioNoConfirma, reservaDeSolicitud, montosDeConfirmacion, motivoParaNoConfirmar, yaRespondida, motivoParaNoCancelar, motivoParaNoMeLlego, noLlegoReabre, textoPagoReabierto,
	vencePago, guardarVence, faltaDireccion, TEXTO_SIN_DIRECCION, MOTIVOS_NO, MOTIVOS_CANCELAR, MOTIVO_NO_LLEGO, TEXTO_NO_LLEGO, textoNo, TEXTO_CANCELADA } from '../../admin/js/reservas-calculo.js';

const porUsuario = limitador(30);
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const TOKEN = /^[A-Za-z0-9]{20,60}$/;

// Las noches de Airbnb, Booking y VRBO de la casa de la solicitud, leídas con la cuenta de lectura fuera de la
// transacción (los calendarios tardan). Un calendario que no responde no frena la confirmación (igual que la página).
async function nochesExternas(leadId) {
	try {
		const lead = await leerPrivado(`leads/${leadId}`);
		if (!ID.test(lead?.propertyId || '')) return [];
		return (await externasDe(await leerPrivado(`properties/${lead.propertyId}/privado/socio`))).rangos;
	} catch (err) {
		console.error('Reservas: calendarios de las plataformas', err.message);
		return [];
	}
}

const YA = 'Esta solicitud ya se respondió (otra persona u otra pestaña). Recarga la página.';

// La solicitud, su casa (por noche y de este socio: la casa manda, no lo que diga la solicitud) y EL chat de la
// solicitud (su índice chatsPorSolicitud), leídos dentro de la transacción.
async function cargar({ leer }, socio, leadId) {
	const lead = await leer(`leads/${leadId}`);
	if (!lead?.reserva?.codigo || !ID.test(lead.propertyId || '')) falla(404, 'No encontramos esa solicitud.');
	const casa = await leer(`properties/${lead.propertyId}`);
	if (!casa || casa.operacion !== 'vacacional' || !casa.propietarioId || casa.propietarioId !== socio.propietarioId) falla(403, 'Esta solicitud no es de una casa por noche tuya.');
	const token = (await leer(`chatsPorSolicitud/${leadId}`))?.token;
	const chat = TOKEN.test(token || '') ? await leer(`chats/${token}`) : null;
	// Un chat de antes, sin su índice: el servidor no adivina cuál es. El panel sigue por el camino de antes (lo deciden
	// las reglas publicadas) hasta que el administrador abra Solicitudes y se lo ponga (ponerIndices).
	if (!chat || chat.leadId !== leadId) throw Object.assign(new Respuesta(409, 'Esta solicitud todavía no tiene su chat registrado: avísale al administrador (lo registra al abrir Solicitudes).'), { caminoDeAntes: true });
	return { lead, casa, token, chat };
}

const ACCIONES = {
	// Nace la reserva con su comisión (la ganancia, se paga el día de llegada) y su plazo de pago, la solicitud y el chat
	// dicen «confirmada» y el cliente recibe los datos de pago de la ficha del socio. Los montos son los congelados al
	// llegar la solicitud (montosSolicitud): lo que se le cotizó al cliente, nunca los precios de hoy ni lo que mande el panel.
	async confirmar(tx, socio, leadId, _motivo, externas = []) {
		const { lead, casa, token, chat } = await cargar(tx, socio, leadId);
		if (yaRespondida(chat.estado, lead.solicitud?.estado) || await tx.leer(`reservas/${leadId}`)) falla(409, YA);
		// Noches ya tomadas en Airbnb, Booking o VRBO (sus calendarios, leídos antes de la transacción): no se confirma encima.
		const enOtra = choqueExterno(lead.reserva, externas);
		if (enOtra) falla(409, enOtra);
		const montos = await congelarMontos(tx, leadId, { lead, casa });
		// La llegada ya pasó, la casa salió del sitio o cambió de moneda: no se confirma (se cierra con «No se dio»).
		const no = motivoParaNoConfirmar(lead, casa, montos);
		if (no) falla(409, no);
		if (!montos) falla(422, 'A esta casa le falta el precio del socio: avísale al administrador.');
		// Lo cotizado quedó por debajo del precio de la casa (el subtotal lo escribe el navegador): solo el administrador.
		const soloAdmin = motivoSocioNoConfirma(montos);
		if (soloAdmin) falla(409, soloAdmin);
		// Sin la dirección exacta no se confirma: el cliente pagaría sin saber a dónde llegar (lo mismo pide «Pago recibido»).
		if (faltaDireccion(await tx.leer(`properties/${casa.id}/privado/llegada`))) falla(409, TEXTO_SIN_DIRECCION);
		const pago = (await tx.leer(`propietarios/${casa.propietarioId}`))?.datosPago;
		if (!pago) falla(422, 'No encontramos tus datos de pago y sin ellos el cliente no sabe a dónde pagar. Pídele al administrador que los guarde en tu ficha.');
		const l = { id: leadId, propertyId: casa.id, propertyTitulo: lead.propertyTitulo, nombre: lead.nombre, reserva: lead.reserva };
		const datos = reservaDeSolicitud(l, casa, montosDeConfirmacion(montos, null), { chat: token });
		await fechasDeLaCasa(tx, casa, null, { id: leadId, ...datos });
		tx.crear(`reservas/${leadId}`, datos, { ahora: ['createdAt', 'updatedAt'] });
		responder(tx, socio, leadId, 'confirmada', 'Confirmó', { 'solicitud.reservaId': leadId, 'solicitud.costoSocio': datos.costoSocio, 'solicitud.comision': datos.ganancia });
		const id = mensaje(tx, token, { tipo: 'pago', texto: pago });
		tx.cambiar(`chats/${token}`, { estado: 'confirmada', vencePago: datos.vencePago, ...pendiente(id) });
		await cerrarDuplicadas(tx, lead, leadId);
		return { token, casa: casa.id, costoSocio: datos.costoSocio, ganancia: datos.ganancia, moneda: datos.moneda };
	},
	// No se dio: la solicitud y el chat lo dicen y el cliente recibe el mensaje. No hay reserva.
	async no(tx, socio, leadId, motivo) {
		if (!MOTIVOS_NO.includes(motivo)) falla(400, 'Motivo inválido.');
		const { lead, token, chat } = await cargar(tx, socio, leadId);
		if (yaRespondida(chat.estado, lead.solicitud?.estado)) falla(409, YA);
		responder(tx, socio, leadId, 'no', 'No se dio', { 'solicitud.motivo': motivo });
		const id = mensaje(tx, token, { texto: textoNo(motivo) });
		tx.cambiar(`chats/${token}`, { estado: 'no', ...pendiente(id) });
		return { token, casa: lead.propertyId };
	},
	// Cancela mientras el cliente no ha pagado ni llegado: las fechas quedan libres, la solicitud y el chat dicen
	// «cancelada» y el cliente recibe el mensaje; el equipo recibe el correo (con ella sale una comisión de la mora).
	async cancelar(tx, socio, leadId, motivo) {
		if (!MOTIVOS_CANCELAR.includes(motivo)) falla(400, 'Motivo inválido.');
		const { casa, token, chat, reserva } = await conReserva(tx, socio, leadId);
		const motivoNo = motivoParaNoCancelar(reserva, chat, token, Date.now());
		if (motivoNo) falla(409, motivoNo);
		await fechasDeLaCasa(tx, casa, reserva, { ...reserva, estado: 'cancelada' });
		tx.cambiar(`reservas/${leadId}`, { estado: 'cancelada', motivo }, { ahora: ['updatedAt'] });
		responder(tx, socio, leadId, 'cancelada', 'Canceló', { 'solicitud.motivo': motivo });
		const id = mensaje(tx, token, { texto: TEXTO_CANCELADA });
		tx.cambiar(`chats/${token}`, { estado: 'cancelada', ...pendiente(id) });
		return { token, casa: casa.id };
	},
	// «No me llegó»: el socio no recibió el pago. Antes del día de llegada (con el comprobante del cliente) se reabre el
	// pago con un plazo nuevo: el comprobante se quita, el cliente lo lee en su chat y el cron vuelve a cuidar el plazo.
	// Desde el día de llegada se cierra la reserva sin comisión (fechas libres); el equipo recibe el correo de la cancelación.
	async nollego(tx, socio, leadId) {
		const { casa, token, chat, reserva } = await conReserva(tx, socio, leadId);
		const ahora = Date.now();
		const motivoNo = motivoParaNoMeLlego(reserva, chat, token, ahora);
		if (motivoNo) falla(409, motivoNo);
		if (noLlegoReabre(reserva, ahora)) {
			const vence = vencePago(ahora, reserva.llegada);
			tx.cambiar(`reservas/${leadId}`, { pagoDesde: ahora, vencePago: guardarVence(vence) }, { ahora: ['updatedAt'] });
			anotar(tx, socio, leadId, 'No me llegó el pago: plazo nuevo');
			const id = mensaje(tx, token, { tipo: 'reabierto', texto: textoPagoReabierto(vence, chat.idioma === 'en') });
			// El comprobante queda (historia: con él el cron no cancela a un cliente que dice haber pagado); pagoReabierto
			// dice que se le pidió otro, una sola vez. El equipo recibe el aviso (avisos-chat.mjs, «reabierto»).
			tx.cambiar(`chats/${token}`, { pagoReabierto: ahora, recordatorioPago: false, vencePago: guardarVence(vence), ...pendiente(id) });
			return { token, reabierta: true };
		}
		await fechasDeLaCasa(tx, casa, reserva, { ...reserva, estado: 'cancelada' });
		tx.cambiar(`reservas/${leadId}`, { estado: 'cancelada', motivo: MOTIVO_NO_LLEGO }, { ahora: ['updatedAt'] });
		responder(tx, socio, leadId, 'cancelada', 'No me llegó el pago: se canceló sin comisión', { 'solicitud.motivo': MOTIVO_NO_LLEGO });
		const id = mensaje(tx, token, { texto: TEXTO_NO_LLEGO });
		tx.cambiar(`chats/${token}`, { estado: 'cancelada', ...pendiente(id) });
		return { token, casa: casa.id, reabierta: false };
	},
	// El cliente le pagó al socio: el chat dice «Pago recibido» y lleva la dirección y el mapa guardados en la casa
	// (privado/llegada), todo junto. Sin dirección guardada no se marca (el cliente no sabría a dónde llegar). Si quedó
	// «pagada» sin los datos de llegada (un intento de antes a medias), los manda.
	async pago(tx, socio, leadId) {
		const { casa, token, chat } = await cargar(tx, socio, leadId);
		if (chat.estado === 'pagada') {
			if ((await tx.consultar('mensajes', 'tipo', 'llegada', `chats/${token}`)).length) falla(409, 'El pago ya estaba marcado y el cliente ya ve los datos de llegada.');
		} else if (chat.estado !== 'confirmada') falla(409, 'Esta reserva no está confirmada.');
		const ll = await tx.leer(`properties/${casa.id}/privado/llegada`);
		if (faltaDireccion(ll)) falla(422, TEXTO_SIN_DIRECCION);
		const id = mensaje(tx, token, { tipo: 'llegada', texto: 'llegada', direccion: ll.direccion || '', mapa: ll.mapa || '' });
		tx.cambiar(`chats/${token}`, { estado: 'pagada', ...pendiente(id) });
		// En la reserva también: con el pago marcado, su comisión vencida sí cuenta para el corte de permisos.
		if (await tx.leer(`reservas/${leadId}`)) tx.cambiar(`reservas/${leadId}`, { pagoRecibido: true }, { ahora: ['updatedAt'] });
		anotar(tx, socio, leadId, 'Pago recibido');
		return { token };
	}
};

// La solicitud con su reserva confirmada (cancelar y «No me llegó»).
async function conReserva(tx, socio, leadId) {
	const c = await cargar(tx, socio, leadId);
	const reserva = await tx.leer(`reservas/${leadId}`);
	if (!reserva || c.lead.solicitud?.estado !== 'confirmada') falla(409, 'No encontramos la reserva confirmada de esta solicitud: avísale al administrador.');
	if (reserva.propietarioId !== socio.propietarioId || reserva.propertyId !== c.casa.id) falla(403, 'Esta reserva no es tuya.');
	return { ...c, reserva };
}

// ¿La cuenta de escritura no sirve? (Google rechaza su clave, o la base le niega el permiso: falta el rol.)
const sinCuenta = (err) => err?.rechazo || err?.codigo === 'PERMISSION_DENIED' || err?.status === 401 || err?.status === 403;

export default async (req, context) => {
	if (req.method === 'GET') {
		let admin = null;
		try { admin = await staffUser(req); } catch { /* token inválido */ }
		if (!admin?.admin) return json(403, { error: 'Solo el administrador.' });
		if (!escrituraConfigurada()) return json(200, { estado: 'sin configurar' });
		try {
			await probarEscritura();
			return json(200, { estado: 'activo' });
		} catch (err) {
			return json(200, { estado: 'error', detalle: err.message });
		}
	}
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!escrituraConfigurada()) return json(503, { error: 'Reservas por servidor sin configurar' });
	let socio;
	try { socio = await socioUser(req); } catch { return json(401, { error: 'Sesión inválida: vuelve a entrar.' }); }
	if (!socio) return json(403, { error: 'Solo el dueño de la casa.' });
	if (porUsuario(socio.uid)) return json(429, { error: 'Demasiados pedidos seguidos: espera unos minutos.' });
	let cuerpo;
	try { cuerpo = await req.json(); } catch { return json(400, { error: 'Solicitud inválida' }); }
	const accion = ACCIONES[cuerpo?.accion] && Object.hasOwn(ACCIONES, cuerpo.accion) ? cuerpo.accion : '';
	const leadId = String(cuerpo?.leadId || '');
	if (!accion || !ID.test(leadId)) return json(400, { error: 'Solicitud inválida' });
	let hecho;
	try {
		const externas = accion === 'confirmar' ? await nochesExternas(leadId) : [];
		hecho = await transaccion((tx) => ACCIONES[accion](tx, socio, leadId, String(cuerpo.motivo || ''), externas));
	} catch (err) {
		if (err instanceof Respuesta) return json(err.status, { error: err.message, ...(err.caminoDeAntes ? { caminoDeAntes: true } : {}), ...(err.message === YA ? { yaRespondida: true } : {}) });
		// Una reserva que nació mientras tanto (otra pestaña): ya se respondió.
		if (err?.codigo === 'ALREADY_EXISTS' || err?.codigo === 'FAILED_PRECONDITION') return json(409, { error: YA, yaRespondida: true });
		if (sinCuenta(err)) { console.error('Reservas: cuenta de escritura', err.message); return json(503, { error: 'La cuenta de escritura no funciona' }); }
		console.error('Reservas:', err.message);
		return json(500, { error: 'No se pudo guardar. Vuelve a intentarlo.' });
	}
	// Los correos (al cliente y, si el socio canceló, al equipo) salen de aquí, con lo ya guardado; si fallan, lo escrito
	// queda. Lo guardado se responde sin esperarlos cuando Netlify deja terminar trabajo después de responder
	// (context.waitUntil); si no, se esperan antes de responder (la función sigue aunque el panel se desconecte).
	const { token, casa, ...resto } = hecho;
	// Las fechas de la casa cambiaron (también al responder una solicitud que las apartaba).
	if (casa) await (accion === 'no' ? purgarCasa(casa) : fechasCambiaron(casa, `Reserva por noche: ${accion}`));
	const avisos = enviarAvisosChat(token).catch((err) => { console.error('Reservas: avisos', err.message); return -1; });
	if (typeof context?.waitUntil === 'function') { context.waitUntil(avisos); return json(200, { ok: true, accion, ...resto }); }
	return json(200, { ok: true, accion, ...resto, avisos: await avisos });
};

export const config = { path: '/api/reservas' };
