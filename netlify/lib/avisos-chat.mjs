// Qué correos tocan por el chat de una reserva vacacional. Sin red: recibe lo guardado y devuelve los avisos.
// Cada aviso lleva solo un enlace a la plataforma (la reserva del cliente o la solicitud en el panel):
// la conversación sigue allí, y nadie recibe el teléfono ni el correo del otro.
const FRESCO = 10 * 60_000;
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

export function avisosChat({ chat, mensajes, correos, sitio, ahora = Date.now() }) {
	const reserva = `${sitio}/reserva/#${chat.id}`;
	const panel = `${sitio}/admin/#/solicitudes/${chat.codigo}`;
	const resumen = `${chat.propertyTitulo} · ${chat.llegada} → ${chat.salida} · ${chat.huespedes} ${chat.huespedes === 1 ? 'persona' : 'personas'}`;
	// La reserva la atiende el socio: el equipo solo recibe estos avisos si el socio no tiene correo guardado.
	// (Lo que el socio deja sin responder le llega al equipo por netlify/functions/solicitudes-sin-respuesta.mjs.)
	const casa = correos.socio ? [correos.socio] : (correos.equipo || []).filter(Boolean);
	const en = chat.idioma === 'en';
	const alCliente = (asunto, titulo, intro) => (correos.cliente ? [{ para: [correos.cliente], asunto, titulo, intro, boton: en ? 'See my booking' : 'Ver mi reserva', url: reserva }] : []);
	const aLaCasa = (asunto, titulo, intro) => (casa.length ? [{ para: casa, asunto, titulo, intro, boton: 'Abrir la solicitud', url: panel }] : []);

	const ultimo = mensajes[mensajes.length - 1];
	// Solicitud recién enviada (todavía sin mensajes): al socio y al equipo para que respondan; al cliente, su enlace.
	if (!ultimo) {
		if (ahora - ms(chat.createdAt) > FRESCO) return [];
		return [
			...aLaCasa(`Nueva solicitud de reserva ${chat.codigo}`, `Nueva solicitud ${chat.codigo}`, `${resumen}. Respóndela pronto: las fechas quedan apartadas 2 horas.`),
			...alCliente(en ? `Your booking request ${chat.codigo}` : `Tu solicitud de reserva ${chat.codigo}`, en ? 'We received your request' : 'Recibimos tu solicitud',
				en ? `${resumen}. Keep this email: the button takes you back to your booking and its chat.` : `${resumen}. Guarda este correo: el botón te lleva de vuelta a tu reserva y a su chat.`)
		];
	}
	if (ahora - ms(ultimo.createdAt) > FRESCO) return [];
	if (ultimo.tipo === 'pago') return alCliente(en ? `Booking ${chat.codigo} confirmed: how to pay` : `Reserva ${chat.codigo} confirmada: cómo pagar`,
		en ? 'Your booking is confirmed' : 'Tu reserva está confirmada', en ? 'Open your booking to see the payment details.' : 'Entra a tu reserva para ver los datos de pago.');
	if (ultimo.tipo === 'llegada') return alCliente(en ? `Booking ${chat.codigo}: payment received` : `Reserva ${chat.codigo}: pago recibido`,
		en ? 'Payment received' : 'Recibimos tu pago', en ? 'Open your booking to see the address, the map and how to get there.' : 'Entra a tu reserva para ver la dirección, el mapa y cómo llegar.');
	if (ultimo.tipo === 'foto') return aLaCasa(`${chat.codigo}: el cliente adjuntó su comprobante`, `Comprobante de pago de ${chat.codigo}`,
		`${resumen}. Revisa tu cuenta y marca «Pago recibido»: el cliente recibe solo la dirección y cómo llegar.`);
	// Varios mensajes seguidos del mismo lado: solo se avisa del primero.
	const anterior = mensajes[mensajes.length - 2];
	if (anterior && lado(anterior) === lado(ultimo) && !anterior.tipo) return [];
	return lado(ultimo) === 'cliente'
		? aLaCasa(`${chat.codigo}: mensaje del cliente`, `${chat.nombre || 'El cliente'} escribió en ${chat.codigo}`, `${resumen}. Respóndele desde la solicitud.`)
		: alCliente(en ? `Booking ${chat.codigo}: you have a reply` : `Reserva ${chat.codigo}: tienes respuesta`, en ? 'You have a new message' : 'Tienes un mensaje nuevo',
			en ? 'Open your booking to read it and reply.' : 'Entra a tu reserva para leerlo y responder.');
}
