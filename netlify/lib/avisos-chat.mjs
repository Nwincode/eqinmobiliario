// Qué correos tocan por el chat de una reserva vacacional. Sin red: recibe lo guardado y devuelve los avisos.
// Cada aviso trae lo que el correo muestra (netlify/lib/aviso-chat-envio.mjs): título, texto, tabla de datos, pasos y un botón.
import { dinero } from '../../admin/js/formato.js';
import { fechaHora, MOTIVO_CASA_NO_DISPONIBLE, MOTIVO_EQUIPO_NO_CONFIRMO } from '../../admin/js/reservas-calculo.js';
// Cada aviso lleva solo un enlace a la plataforma (la reserva del cliente o la solicitud en el panel):
// la conversación sigue allí, y nadie recibe el teléfono ni el correo del otro.
const FRESCO = 10 * 60_000;
// Quien abrió el chat hace menos de esto está conversando: sus mensajes nuevos los ve ahí, sin correo.
const ACTIVO = 3 * 60_000;
const lado = (m) => (m.de === 'cliente' ? 'cliente' : 'casa');
const ms = (v) => (v instanceof Date ? v.getTime() : Date.parse(v) || 0);

// chat: documento del chat (con id = token); mensajes: en orden; correos: { cliente, socio, equipo: [] }.
// Para el control de cada hora: ¿lo último lo escribió el cliente y lleva más de `plazo` sin respuesta,
// vencido dentro de la `ventana` que se revisa? (cada caso se avisa una sola vez).
export function sinResponder(mensajes, { ahora, plazo, ventana }) {
	const ultimo = mensajes[mensajes.length - 1];
	if (!ultimo || ultimo.de !== 'cliente') return false;
	const vence = ms(ultimo.createdAt) + plazo;
	return vence > ahora - ventana && vence <= ahora;
}

// El título de la casa sale de la casa guardada (en inglés si el cliente escribe en inglés), nunca del chat.
export const tituloDe = (chat, casa) => String((chat.idioma === 'en' && casa?.en?.titulo) || casa?.titulo || '').slice(0, 200);

// casa: la propiedad guardada (o null).
// repaso: la revisión de cada hora (netlify/functions/solicitudes-sin-respuesta.mjs) pregunta por un mensaje de texto que
// no salió por correo porque el otro «estaba conversando» y que sigue sin leer: ese recibe su aviso, una sola vez.
// mensaje: el aviso pendiente que se reintenta (su id, o 'nueva' = la solicitud recién enviada): se revisa como si fuera
// el momento en que se escribió (lo de después no cuenta), así un correo que no salió sale igual una hora después.
export function avisosChat({ chat, casa = null, mensajes, correos, sitio, ahora = Date.now(), repaso = false, mensaje = '' }) {
	if (mensaje) {
		const i = mensaje === 'nueva' ? -1 : mensajes.findIndex((m) => m.id === mensaje);
		if (mensaje !== 'nueva' && i < 0) return [];
		mensajes = mensajes.slice(0, i + 1);
		ahora = (i < 0 ? ms(chat.createdAt) : ms(mensajes[i].createdAt)) + 1000;
	}
	// Lo que viaja en el asunto y el texto con la forma que pone el sitio: si no, no sale ningún correo (texto libre de alguien).
	if (!/^[A-Z0-9-]{1,20}$/.test(chat.codigo || '') || ![chat.llegada, chat.salida].every((f) => /^\d{4}-\d{2}-\d{2}$/.test(f || ''))) return [];
	// La página «Tu reserva» en el idioma del cliente.
	const reserva = `${sitio}${chat.idioma === 'en' ? '/en/reservation/' : '/reserva/'}#${chat.id}`;
	const panel = `${sitio}/admin/#/solicitudes/${chat.codigo}`;
	// El resumen en el idioma de quien lo lee: el socio y el equipo, en español (título en español); el cliente, en el suyo.
	const fecha = (iso, lang) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-GT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
	const personas = (lang) => (lang === 'en' ? `${chat.huespedes} ${chat.huespedes === 1 ? 'guest' : 'guests'}` : `${chat.huespedes} ${chat.huespedes === 1 ? 'persona' : 'personas'}`);
	const resumenEn = (lang) => [lang === 'en' ? tituloDe(chat, casa) : String(casa?.titulo || '').slice(0, 200), `${fecha(chat.llegada, lang)} → ${fecha(chat.salida, lang)}`, chat.huespedes ? personas(lang) : ''].filter(Boolean).join(' · ');
	const resumen = resumenEn('es');
	// La reserva la atiende el socio: el equipo recibe la solicitud nueva y las cancelaciones del socio; lo demás, solo si el socio no tiene correo guardado.
	// (Lo que el socio deja sin responder le llega al equipo por netlify/functions/solicitudes-sin-respuesta.mjs.)
	const deLaCasa = correos.socio ? [correos.socio] : (correos.equipo || []).filter(Boolean);
	const en = chat.idioma === 'en';
	// La tabla de la reserva: fechas con la hora de entrada y salida de la casa, personas y noches, y el total.
	const tabla = (lang) => {
		const e = lang === 'en';
		const hora = (h) => (/^\d{1,2}:\d{2}$/.test(h || '') ? ` · ${h}` : '');
		const noches = chat.noches ? (e ? ` · ${chat.noches} ${chat.noches === 1 ? 'night' : 'nights'}` : ` · ${chat.noches} ${chat.noches === 1 ? 'noche' : 'noches'}`) : '';
		return [[e ? 'Check-in' : 'Llegada', fecha(chat.llegada, lang) + hora(casa?.vacacional?.checkIn)], [e ? 'Check-out' : 'Salida', fecha(chat.salida, lang) + hora(casa?.vacacional?.checkOut)],
			[e ? 'Guests' : 'Huéspedes', chat.huespedes ? personas(lang) + noches : ''], [e ? 'Total' : 'Total', Number(chat.total) > 0 && /^[A-Z]{3}$/.test(chat.moneda || '') ? dinero(chat.total, chat.moneda) : '']];
	};
	const casaEs = String(casa?.titulo || '').slice(0, 200);
	// Para el socio y el equipo, con el código que el socio usa para esa casa (si lo tiene); el cliente no lo ve.
	const casaPanel = casaEs + (casa?.codigoSocio ? ` (${String(casa.codigoSocio).slice(0, 30)})` : '');
	// Al cliente: botón a su reserva y la nota de que se conversa en el chat (si responde el correo, no le llega al anfitrión).
	const alCliente = (asunto, titulo, intro, extra = {}) => (correos.cliente ? [{ rol: 'cliente', lang: en ? 'en' : 'es', para: [correos.cliente], asunto, titulo, intro,
		boton: en ? 'See my booking and chat' : 'Ver mi reserva y el chat', url: reserva, datos: tabla(en ? 'en' : 'es'),
		nota: en ? 'To talk to the host, use the chat in your booking. Replies to this email don\'t reach them.' : 'Para hablar con el anfitrión, usa el chat de tu reserva. Las respuestas a este correo no le llegan a él.', ...extra }] : []);
	const aLaCasa = (asunto, titulo, intro, extra = {}) => (deLaCasa.length ? [{ rol: 'casa', lang: 'es', para: deLaCasa, asunto, titulo, intro, boton: 'Abrir la solicitud', url: panel,
		datos: [['Casa', casaPanel], ...tabla('es'), ['Cliente', String(chat.nombre || '').slice(0, 40)]], nota: 'Responde desde la solicitud en el panel: el cliente la ve en su reserva.', ...extra }] : []);

	const ultimo = mensajes[mensajes.length - 1];
	// Solicitud recién enviada (todavía sin mensajes): al socio y al equipo para que respondan; al cliente, su enlace.
	if (!ultimo) {
		if (ahora - ms(chat.createdAt) > FRESCO) return [];
		// El equipo también se entera de cada solicitud nueva (aparte del socio, sin repetir a quien ya la recibe).
		const equipo = (correos.equipo || []).filter((c) => c && !deLaCasa.some((d) => d.toLowerCase() === c.toLowerCase()));
		// Cotizada por debajo del precio de la casa: la confirma el equipo («Te toca confirmar»), no el socio, y no aparta
		// fechas: a nadie se le promete eso (confirmaEquipo, que pone congelarMontos en reservas-servidor.mjs).
		const delEquipo = Boolean(chat.confirmaEquipo);
		return [
			...aLaCasa(`Nueva solicitud de reserva ${chat.codigo}`, 'Nueva solicitud de reserva', delEquipo
				? 'La confirma el equipo: se le cotizó menos que el precio de tu casa. No tienes que hacer nada; si se confirma, te llega el aviso.'
				: 'Respóndela pronto: las fechas quedan apartadas hasta que respondas, a lo más 24 horas (después se cierra sola).'),
			...(equipo.length ? [{ rol: 'equipo', lang: 'es', para: equipo, asunto: `Nueva solicitud de reserva ${chat.codigo}`, titulo: 'Nueva solicitud de reserva',
				intro: 'La atiende el socio; si en 2 horas no responde, te llega otro aviso.', boton: 'Abrir la solicitud', url: panel, datos: [['Casa', casaPanel], ...tabla('es'), ['Cliente', String(chat.nombre || '').slice(0, 40)]] }] : []),
			...alCliente(en ? `Your booking request ${chat.codigo}` : `Tu solicitud de reserva ${chat.codigo}`, en ? `We received your request${chat.nombre ? `, ${chat.nombre}` : ''}` : `Recibimos tu solicitud${chat.nombre ? `, ${chat.nombre}` : ''}`,
				delEquipo
					? (en ? `Our team reviews your request for ${tituloDe(chat, casa) || 'the house'} and replies in your booking chat within 24 hours at most. Keep this email: the button takes you back to your booking.`
						: `El equipo revisa tu solicitud de ${casaEs || 'la casa'} y te responde en el chat de tu reserva, a más tardar en 24 horas. Guarda este correo: el botón te lleva de vuelta a tu reserva.`)
					: en ? `The host of ${tituloDe(chat, casa) || 'the house'} reviews it and replies in your booking chat; your dates are held until the host replies, within 24 hours at most. Keep this email: the button takes you back to your booking.`
						: `El anfitrión de ${casaEs || 'la casa'} la revisa y te responde en el chat de tu reserva; tus fechas quedan apartadas hasta que te responda, a más tardar en 24 horas. Guarda este correo: el botón te lleva de vuelta a tu reserva.`,
				{ pasos: en ? ['The host confirms your dates (you get an email).', 'You pay the owner directly with the details shown in your booking.', 'Once they receive your payment, you see the address and directions.']
					: ['El anfitrión confirma tus fechas (te llega un correo).', 'Le pagas directo al propietario con los datos que verás en tu reserva.', 'Al recibir tu pago, ves la dirección y cómo llegar.'] })
		];
	}
	if (repaso ? ultimo.tipo || ['no', 'cancelada'].includes(chat.estado) : ahora - ms(ultimo.createdAt) > FRESCO) return [];
	// Lo que se cierra sin avisar (una solicitud repetida: el cliente ya tiene su reserva en la otra).
	if (ultimo.silencioso) return [];
	// El plazo exacto de pago (hora de Guatemala), el mismo que ve en su reserva; sin plazo automático, «antes de llegar».
	const vence = Number(chat.vencePago) > 0 ? fechaHora(Number(chat.vencePago), en) : '';
	if (ultimo.tipo === 'pago') return alCliente(en ? `Booking ${chat.codigo} confirmed: how to pay` : `Reserva ${chat.codigo} confirmada: cómo pagar`,
		en ? 'Your booking is confirmed' : 'Tu reserva está confirmada', en ? `Open your booking to see the owner's payment details: you pay the owner directly (Equipo Inmobiliario does not receive payments). ${vence ? `Pay before ${vence}: otherwise the booking is cancelled automatically.` : 'Pay before you arrive.'}` : `Entra a tu reserva para ver los datos de pago del propietario: le pagas directo a él (Equipo Inmobiliario no recibe pagos). ${vence ? `Paga antes del ${vence}: si no, la reserva se cancela sola.` : 'Paga antes de llegar.'}`,
		{ pasos: en ? ['Open your booking and see the payment details.', 'Pay the owner directly (Equipo Inmobiliario does not receive payments).', 'Upload a photo of your receipt in the chat.']
			: ['Abre tu reserva y mira los datos de pago.', 'Págale directo al propietario (Equipo Inmobiliario no recibe pagos).', 'Sube en el chat la foto de tu comprobante.'] });
	// Recordatorio de pago (24 h antes de que la reserva se cancele sola): al cliente y a la casa, por si ya le pagaron.
	if (ultimo.tipo === 'recordatorio') return [
		...alCliente(en ? `Booking ${chat.codigo}: remember to pay` : `Reserva ${chat.codigo}: recuerda tu pago`, en ? 'Your payment is still pending' : 'Tu pago sigue pendiente',
			en ? 'If your payment does not arrive in time, the booking is cancelled automatically. Already paid? Attach your receipt in the chat.' : 'Si tu pago no llega a tiempo, la reserva se cancela sola. ¿Ya pagaste? Adjunta tu comprobante en el chat.'),
		...aLaCasa(`${chat.codigo}: el pago vence en 24 h`, `El pago de ${chat.codigo} vence en 24 h`,
			`${resumen}. Si ya te pagó, marca «Pago recibido»; si no llega, la reserva se cancela sola y las fechas quedan libres.`)];
	// «No me llegó» antes de la llegada: el pago se reabre con un plazo nuevo (el texto del chat ya lo dice).
	// El equipo se entera: el cliente mandó su comprobante y el anfitrión dice que no le llegó (puede haber una fuga).
	if (ultimo.tipo === 'reabierto') return [
		...((correos.equipo || []).filter(Boolean).length ? [{ para: correos.equipo.filter(Boolean), asunto: `${chat.codigo}: el socio dice que no le llegó el pago`, titulo: `No le llegó el pago de ${chat.codigo}`,
			intro: `${resumen}. El cliente mandó su comprobante y el socio dice que no le llegó: el cliente tiene un plazo nuevo para pagar. Revisa con los dos.`, boton: 'Abrir la solicitud', url: panel }] : []),
		...alCliente(en ? `Booking ${chat.codigo}: your payment has not arrived` : `Reserva ${chat.codigo}: tu pago no ha llegado`,
			en ? 'The host has not received your payment' : 'El anfitrión no ha recibido tu pago', String(ultimo.texto || '').slice(0, 400))];
	if (ultimo.tipo === 'llegada') return alCliente(en ? `Booking ${chat.codigo}: payment received` : `Reserva ${chat.codigo}: pago recibido`,
		en ? 'The owner received your payment' : 'El propietario recibió tu pago', en ? 'Open your booking to see the address, the map and how to get there.' : 'Entra a tu reserva para ver la dirección, el mapa y cómo llegar.');
	// La reserva no se dio o se canceló: el cliente se entera siempre, aunque el mensaje anterior fuera del mismo lado.
	if (['no', 'cancelada'].includes(chat.estado) && lado(ultimo) === 'casa') {
		const no = chat.estado === 'no';
		// Cada cancelación del socio le llega también al equipo (con ella sale una comisión de la mora).
		const equipo = !no && ultimo.de === 'socio' && (correos.equipo || []).filter(Boolean).length
			? [{ para: correos.equipo.filter(Boolean), asunto: `${chat.codigo}: el socio canceló la reserva${chat.comprobanteCliente ? ' (con comprobante del cliente)' : ''}`, titulo: `El socio canceló ${chat.codigo}`,
				intro: `${resumen}.${chat.comprobanteCliente ? ' El cliente había mandado su comprobante de pago.' : ''} Revisa que el cliente no haya pagado: con la reserva cancelada su comisión ya no cuenta.`, boton: 'Abrir la solicitud', url: panel }] : [];
		// Lo que se cerró o canceló solo por un plazo (netlify/functions/plazos-reservas.mjs): el anfitrión también se entera.
		// Con el motivo de verdad (lo deja el cron en el mensaje): la casa salió del sitio, la confirmaba el equipo, o nadie
		// respondió.
		const porQue = { [MOTIVO_CASA_NO_DISPONIBLE]: ['se cerró: la casa ya no está en el sitio', 'La casa ya no está disponible en el sitio'],
			[MOTIVO_EQUIPO_NO_CONFIRMO]: ['se cerró: el equipo no la confirmó a tiempo', 'La confirmaba el equipo (se le cotizó menos que el precio de la casa) y no se confirmó en 24 h'] }[ultimo.motivo]
			|| ['se cerró sin respuesta', 'Nadie la respondió en 24 h'];
		const plazo = ultimo.plazo ? aLaCasa(no ? `${chat.codigo}: ${porQue[0]}` : `${chat.codigo}: se canceló sola, sin pago`,
			no ? `La solicitud ${chat.codigo} se cerró sola` : `La reserva ${chat.codigo} se canceló sola`,
			no ? `${resumen}. ${porQue[1]}: el cliente ya lo sabe.` : `${resumen}. El cliente no pagó ni subió su comprobante a tiempo: las fechas quedaron libres. Si sí te pagó, avísale al administrador.`) : [];
		// «No se dio» no siempre es por las fechas (el motivo va en el mensaje del chat): el correo no lo da por hecho.
		return [...equipo, ...plazo, ...alCliente(en ? `Booking ${chat.codigo}: ${no ? 'not confirmed' : 'cancelled'}` : `Reserva ${chat.codigo}: ${no ? 'no se concretó' : 'cancelada'}`,
			en ? (no ? 'Your request was not confirmed' : 'Your booking was cancelled') : (no ? 'Tu solicitud no se concretó' : 'Tu reserva se canceló'),
			en ? 'Open your booking to see the details.' : 'Entra a tu reserva para ver el detalle.')];
	}
	if (ultimo.tipo === 'foto') return aLaCasa(`${chat.codigo}: el cliente adjuntó su comprobante`, `Comprobante de pago de ${chat.codigo}`,
		`${resumen}. Revisa tu cuenta y marca «Pago recibido»: el cliente recibe solo la dirección y cómo llegar.`);
	// Un correo por tanda, no por mensaje. «visto»: la última vez que quien recibe leyó lo del otro lado (el socio, o el
	// equipo si la casa no tiene socio con correo). Lo nuevo desde entonces (sin contar pagos, fotos ni avisos de estado,
	// que tienen su propio correo): si uno anterior ya salió por correo (llegó ACTIVO o más después de «visto»), este no;
	// si quien recibe leyó hace menos de ACTIVO, está conversando y lo ve en el chat.
	const visto = lado(ultimo) === 'cliente' ? ms(correos.socio ? chat.vistoSocio : chat.vistoEquipo) : ms(chat.vistoCliente);
	const yaAvisado = mensajes.slice(0, -1).some((m) => lado(m) === lado(ultimo) && !m.tipo && ms(m.createdAt) > visto && ms(m.createdAt) - visto >= ACTIVO);
	const callado = visto && ms(ultimo.createdAt) - visto < ACTIVO;
	// La misma medida (cuándo se escribió el mensaje) en el aviso al momento y en el repaso: nunca salen los dos.
	if (repaso ? !(ms(ultimo.createdAt) > visto && callado && !yaAvisado) : yaAvisado || callado) return [];
	return lado(ultimo) === 'cliente'
		? aLaCasa(`${chat.codigo}: mensaje del cliente`, `${chat.nombre || 'El cliente'} escribió en ${chat.codigo}`, `${resumen}. Respóndele desde la solicitud.`)
		: alCliente(en ? `Booking ${chat.codigo}: you have a reply` : `Reserva ${chat.codigo}: tienes respuesta`, en ? 'You have a new message' : 'Tienes un mensaje nuevo',
			en ? 'The host replied. Open the chat to read it and answer.' : 'El anfitrión te respondió. Abre el chat para leerlo y contestar.', { boton: en ? 'Reply in the chat' : 'Responder en el chat', datos: [] });
}
