// Cuentas de las reservas por noche, sin pantalla ni base de datos: la única fuente de los montos y de las revisiones
// de una reserva. La usan el panel (admin/js/reservas.js, admin/js/views/solicitudes.js) y el servidor
// (netlify/functions/reservas.mjs), así lo que se muestra, lo que guarda el administrador y lo que guarda el servidor
// por el socio salen de lo mismo. Las fórmulas de precios y fechas son las de js/calc-vacacional.js.
import '../../js/calc-vacacional.js';

const V = () => globalThis.EQVacacional;
export const MOTIVOS_CANCELAR = ['Cliente canceló', 'Fechas ya no disponibles', 'Otro'];
export const MOTIVOS_NO = ['Cliente no respondió', 'Fechas no disponibles', 'Precio', 'Otro'];
// Lo que lee el cliente en su chat al cerrarse la solicitud.
export const TEXTO_NO = 'Lo sentimos: la casa no está disponible en esas fechas.';
// Lo que lee el cliente en su chat cuando «no se dio», según el motivo (no siempre fue por las fechas).
const TEXTOS_NO = {
	'Cliente no respondió': 'Cerramos esta solicitud porque no tuvimos respuesta. Si todavía quieres la casa, elige tus fechas otra vez.',
	'Precio': 'Esta solicitud no se pudo concretar. Si quieres, elige otras fechas o mira otras casas.',
	'Otro': 'Esta solicitud no se pudo concretar. Si quieres, elige otras fechas o mira otras casas.'
};
export const textoNo = (motivo) => TEXTOS_NO[motivo] || TEXTO_NO;
export const TEXTO_CANCELADA = 'La reserva se canceló.';

// Plazos de una reserva por noche (netlify/functions/plazos-reservas.mjs los cumple; el panel y el chat los muestran):
//  - el anfitrión responde la solicitud en 24 h; si no, se cierra sola («no se dio»);
//  - el cliente paga en 48 h desde que se confirmó, y a más tardar a las 23:00 de la víspera de su llegada; si no hay
//    pago ni comprobante, se cancela sola y las fechas quedan libres. 24 h antes de vencer se le recuerda en el chat.
//  - Confirmada a última hora (menos de 2 h antes de las 23:00 de la víspera): sin plazo automático (cancelarla sola
//    podría dejar sin casa a un huésped que ya viene en camino y le paga al llegar). Si el pago no llega, el anfitrión
//    toca «No me llegó» (cierra sin comisión) y el equipo recibe cada mañana las confirmadas sin pago con la llegada pasada.
// El plazo se guarda al confirmar (vencePago en la reserva y en el chat, 0 = sin plazo automático): con «No me llegó»
// antes de la llegada se pone uno nuevo. Una reserva de antes sin el campo lo saca de su createdAt.
// Solo para lo que nace desde que existen los plazos: lo de antes (una reserva que el cliente quizá pagó sin que el
// anfitrión marcara «Pago recibido») no se cancela solo.
export const PLAZOS_DESDE = Date.parse('2026-11-19T00:00:00-06:00');
export const conPlazo = (creada) => creada >= PLAZOS_DESDE;
export const HORAS_RESPUESTA = 24;
export const HORAS_PAGO = 48;
const HORA = 3600000;
export const MOTIVO_SIN_RESPUESTA = 'Sin respuesta del anfitrión';
export const MOTIVO_SIN_PAGO = 'Sin pago a tiempo';
export const MOTIVO_NO_LLEGO = 'No llegó el pago';
export const MOTIVO_CASA_NO_DISPONIBLE = 'La casa ya no está disponible';
export const MOTIVO_DUPLICADA = 'Duplicada';
export const TEXTO_SIN_RESPUESTA = 'El anfitrión no respondió a tiempo, así que cerramos esta solicitud. Puedes elegir otras fechas u otra casa.';
export const TEXTO_SIN_PAGO = 'No recibimos tu pago a tiempo, así que la reserva se canceló y las fechas quedaron libres. Si todavía la quieres, elige tus fechas otra vez.';
export const TEXTO_NO_LLEGO = 'El anfitrión no recibió tu pago, así que la reserva se canceló. Si sí pagaste, escríbenos aquí con tu comprobante.';
export const TEXTO_CASA_NO_DISPONIBLE = 'Esta casa ya no está disponible, así que cerramos tu solicitud. Puedes mirar otras casas en el sitio.';
export const textoDuplicada = (codigo) => `Esta solicitud estaba repetida y la cerramos. Tu reserva sigue en ${codigo}: búscala en tu correo.`;
TEXTOS_NO[MOTIVO_SIN_RESPUESTA] = TEXTO_SIN_RESPUESTA;
TEXTOS_NO[MOTIVO_CASA_NO_DISPONIBLE] = TEXTO_CASA_NO_DISPONIBLE;
export const venceRespuesta = (creada) => creada + HORAS_RESPUESTA * HORA;
// desde: milisegundos (al confirmar, o al reabrir el pago con «No me llegó»). llegada: 'AAAA-MM-DD' (Guatemala, UTC−6).
export function vencePago(desde, llegada) {
	const vispera = Date.parse(`${llegada}T00:00:00-06:00`) - HORA;
	if (!Number.isFinite(vispera)) return Infinity;
	// A última hora (menos de 2 h antes de la víspera): sin plazo automático (ver arriba).
	if (vispera < desde + 2 * HORA) return Infinity;
	return Math.min(desde + HORAS_PAGO * HORA, vispera);
}
// Lo que se guarda (en la reserva y en el chat): el plazo en milisegundos, 0 = sin plazo automático.
export const guardarVence = (vence) => (Number.isFinite(vence) ? vence : 0);
// El plazo de pago de una reserva guardada: { desde, vence } (vence = Infinity sin plazo automático).
export function plazoDePago(r, creada) {
	if (typeof r?.vencePago === 'number') return { desde: Number(r.pagoDesde) || creada, vence: r.vencePago > 0 ? r.vencePago : Infinity };
	return { desde: creada, vence: vencePago(creada, r?.llegada) };
}
// Se recuerda cuando faltan 24 h (si el plazo es más corto, no hay recordatorio: ya se le dijo al confirmar).
export const recordarPagoDesde = (desde, vence) => (vence - desde > 25 * HORA ? vence - 24 * HORA : Infinity);
// ¿Se cancela sola ahora? El plazo venció y la llegada fue a lo más ayer (si el cron no corrió a tiempo, se pone al
// día; una reserva con la llegada más atrás la cierra el anfitrión con «No me llegó» o el equipo).
export const cancelaSola = (vence, llegada, ahora = Date.now()) => ahora >= vence && V().esFecha(llegada) && llegada >= V().sumarDias(V().hoy(ahora), -1);

// Viene de una solicitud de la web (tiene chat con el cliente y su solicitud en leads).
export const deSolicitud = (r) => Boolean(r?.leadId || r?.codigo);

// Lo que lleva toda reserva al nacer, venga de donde venga. `casa` = { id, titulo, agentId, propietarioId, moneda }.
// Los montos: costoSocio (lo del propietario), alojamiento (lo cobrado sin impuestos) y la ganancia de EQ.
// La moneda es la de la casa (sin moneda, US$, como el sitio): los montos salen de sus precios; nadie más la elige.
export function nuevaReserva(casa, c) {
	const { r2, nochesEntre, hoy } = V();
	const costoSocio = r2(Number(c.costoSocio) || 0), alojamiento = r2(Number(c.alojamiento) || 0);
	return {
		propertyId: casa.id, propertyTitulo: c.propertyTitulo || casa.titulo || '',
		// El asesor de la casa (una casa por noche no lleva: ''), el mismo que exigen las reglas a quien no es administrador.
		agentId: casa.agentId || '', propietarioId: casa.propietarioId || '',
		moneda: casa.moneda || 'USD', llegada: c.llegada, salida: c.salida, noches: nochesEntre(c.llegada, c.salida),
		huesped: String(c.huesped || '').trim(), canal: c.canal || 'directo', estado: c.estado || 'confirmada',
		leadId: c.leadId || '', codigo: c.codigo || '', ...(c.chat ? { chat: c.chat } : {}), costoSocio, alojamiento, ganancia: r2(alojamiento - costoSocio),
		pagadoSocio: Boolean(c.pagadoSocio), pagadoFecha: c.pagadoSocio ? (c.pagadoFecha || hoy()) : ''
	};
}

// La comisión de una reserva de la web: la ganancia de EQ, que se paga el día de llegada (con ella se mide la mora).
// Una sola cuenta: la usan la confirmación y el cambio de montos en Rentas.
export const comisionDeReserva = (r, previa = {}) => ({ ...previa, monto: r.ganancia, vence: r.llegada, pagada: Boolean(previa.pagada) });

// Lo que cuesta una estancia con los precios guardados del dueño (properties/{casa}/privado/socio): su parte, lo
// cobrado al público y la ganancia de EQ con los precios de hoy. null si la casa no tiene precio del socio.
export function cuentaDe(reserva, privadoSocio) {
	const s = privadoSocio;
	if (!s) return null;
	return V().gananciaEstancia({ llegada: reserva.llegada, salida: reserva.salida, margen: s.margen, planSocio: { base: s.precioBase, finde: s.precioFinde, tarifas: s.tarifas || [] } });
}

// El subtotal (sin impuestos) que se le cotizó al cliente; una solicitud o un chat de antes no lo trae y se saca del
// total que vio (V.subtotalDeTotal, el mayor que da ese total).
export const subtotalCotizado = (r) => (typeof r?.subtotal === 'number' ? r.subtotal : V().subtotalDeTotal(r?.total));

// Los montos de una solicitud, congelados al cotizar: los calcula el SERVIDOR con la casa y sus precios guardados en el
// momento en que llega la solicitud (montosSolicitud/{solicitud}, netlify/lib/reservas-servidor.mjs congelarMontos), y
// de ahí salen la tarjeta de Solicitudes, el diálogo de «Confirmar», la reserva con su comisión, Rentas y los correos.
// Del cliente solo se toma el subtotal que se le cotizó (lo que va a pagar); la limpieza, la parte del socio y el margen
// salen de la casa. Lo cobrado (alojamiento) = lo cotizado sin la limpieza (que no lleva margen).
//  - Si lo cotizado cuadra con los precios de la casa (±1 %), la parte del socio es la de sus precios.
//  - Si no cuadra (una página vieja en el navegador del cliente), el socio y EQ se reparten lo que se le prometió al
//    cliente con la misma proporción de hoy: la ganancia nunca es negativa ni sale de un precio que el cliente no vio.
// `reserva` = { llegada, salida, subtotal | total }; `casa` = la propiedad; `privadoSocio` = privado/socio.
// null si la casa no tiene precio del socio.
export function montosCotizados(reserva, casa, privadoSocio) {
	const { r2 } = V();
	const cuenta = cuentaDe(reserva, privadoSocio);
	if (!cuenta) return null;
	const limpieza = r2(Math.max(0, Number(casa?.vacacional?.limpieza) || 0));
	const alojamiento = r2(Math.max(0, subtotalCotizado(reserva) - limpieza));
	const delPlan = r2(Number(cuenta.alojamiento) || 0);
	const coincide = delPlan > 0 && Math.abs(alojamiento - delPlan) <= 0.01 * delPlan;
	const proporcional = delPlan > 0 ? r2(alojamiento * cuenta.costoSocio / delPlan) : alojamiento;
	const costoSocio = r2(Math.min(alojamiento, coincide ? cuenta.costoSocio : proporcional));
	return { moneda: casa?.moneda || 'USD', costoSocio, alojamiento, limpieza, margen: r2(V().nochePublica(100, privadoSocio.margen) - 100),
		ganancia: r2(alojamiento - costoSocio), delPlan, coincide };
}
// ¿El precio de hoy (cuentaDe con los precios guardados ahora) es otro que el que se le cotizó? (más de 1 %).
export const cambioElPrecio = (montos, hoy) => Boolean(montos && hoy) && Math.abs(montos.alojamiento - hoy.alojamiento) > 0.01 * Math.max(montos.alojamiento, hoy.alojamiento);
export const TEXTO_PRECIO_CAMBIO = 'El precio cambió desde que lo pidió';

// Lo que se registra al confirmar una solicitud: su parte, lo cobrado y la ganancia de EQ.
// `montos` = los congelados (montosCotizados); `hoy` = cuentaDe(...) con los precios de hoy.
// `modo`: 'cotizado' (siempre el socio y el servidor: lo que se le cotizó al cliente) u 'hoy' (el administrador, si el
// precio cambió, puede registrar con los precios de hoy). Devuelve también los dos (lo cobrado y la ganancia con cada uno).
export function montosDeConfirmacion(montos, hoy, modo = 'cotizado') {
	const { r2 } = V();
	const deHoy = hoy ? { costoSocio: r2(hoy.costoSocio), alojamiento: r2(hoy.alojamiento), ganancia: r2(hoy.alojamiento - hoy.costoSocio) } : null;
	const cot = { costoSocio: montos.costoSocio, alojamiento: montos.alojamiento, ganancia: montos.ganancia };
	const elegido = modo === 'hoy' && deHoy ? deHoy : cot;
	return { ...elegido, cotizado: cot.alojamiento, deHoy: deHoy ? deHoy.alojamiento : cot.alojamiento, gananciaCotizada: cot.ganancia, hoy: deHoy ? deHoy.ganancia : cot.ganancia };
}
// ¿Lo cotizado y los precios de hoy difieren en más de 1 %? (entonces el administrador elige con cuál se registra).
export const difierenMontos = (m) => m.cotizado > 0 && Math.abs(m.cotizado - m.deHoy) > 0.01 * Math.max(m.cotizado, m.deHoy);
// Las opciones que se le ofrecen al administrador: nunca una con la ganancia de EQ negativa (se dice por qué en una línea).
export const SIN_GANANCIA_NEGATIVA = 'No se ofrece registrar con una ganancia de EQ negativa (la parte del socio sería mayor que lo cobrado).';

// La reserva que nace al confirmar la solicitud `l` (l.id, l.propertyId, l.propertyTitulo, l.nombre y
// l.reserva { codigo, llegada, salida }) de la casa `casa` (con su id; de ella sale la moneda) con los montos `m`
// (montosDeConfirmacion). Lleva su comisión, el plazo de pago (vencePago, desde `ahora`) y, si hay, el token de su chat
// (con él se sabe después si el cliente ya pagó).
export function reservaDeSolicitud(l, casa, m, { chat = '', ahora = Date.now() } = {}) {
	const r = l.reserva;
	const datos = nuevaReserva(casa, {
		propertyTitulo: l.propertyTitulo, llegada: r.llegada, salida: r.salida, estado: 'confirmada', canal: 'web',
		// Solo el primer nombre: el socio lee sus reservas; el contacto del cliente queda en la solicitud (leadId).
		huesped: String(l.nombre || '').trim().split(/\s+/)[0], leadId: l.id, codigo: r.codigo, costoSocio: m.costoSocio,
		alojamiento: m.alojamiento, chat
	});
	datos.comision = comisionDeReserva(datos);
	datos.pagoDesde = ahora;
	datos.vencePago = guardarVence(vencePago(ahora, r.llegada));
	return datos;
}

// Por qué una solicitud NO se confirma ('' = sí): lo mismo en el panel (el administrador) y en el servidor (el socio).
// `lead` = la solicitud ({ reserva }); `casa` = la propiedad guardada; `montos` = los congelados (o null).
export function motivoParaNoConfirmar(lead, casa, montos, ahora = Date.now()) {
	if (llegadaPasada(lead?.reserva?.llegada, ahora)) return TEXTO_LLEGADA_PASADA;
	// La casa salió del sitio (oculta, pausada o retirada): no se toma una reserva que el equipo quitó.
	if (!casa?.publicado || ['pausada', 'retirada', 'vendida', 'rentada'].includes(casa.estado)) return 'Esta casa ya no está publicada en el sitio: no se puede confirmar. Ciérrala con «No se dio».';
	// La casa cambió de moneda después de la solicitud: los montos no se comparan entre monedas.
	const moneda = casa.moneda || 'USD';
	if ((lead?.reserva?.moneda || 'USD') !== moneda || (montos && montos.moneda !== moneda)) return 'La casa cambió de moneda después de esta solicitud: no se puede confirmar así. Ciérrala con «No se dio» y que el cliente la pida otra vez.';
	return '';
}

// ¿La casa tiene su dirección guardada (privado/llegada)? Sin ella, «Pago recibido» no manda dónde llegar.
export const faltaDireccion = (llegada) => !String(llegada?.direccion || '').trim();
export const TEXTO_SIN_DIRECCION = 'A esta casa le falta la dirección exacta: sin ella el cliente no sabe a dónde llegar. Pídele al administrador que la guarde en la ficha de la casa.';

// Dos solicitudes del mismo cliente (mismo correo), la misma casa y las mismas fechas: al confirmar una, la otra se
// cierra como «Duplicada», sin correo al cliente.
const correoDe = (l) => String(l?.email || '').trim().toLowerCase();
export const esDuplicada = (a, b) => a !== b && a?.id !== b?.id && Boolean(correoDe(a)) && correoDe(a) === correoDe(b) && a.propertyId === b.propertyId
	&& a.reserva?.llegada === b.reserva?.llegada && a.reserva?.salida === b.reserva?.salida;

// ¿La solicitud ya se respondió? (el chat con estado, o la solicitud con uno que no es «pendiente»).
export const yaRespondida = (estadoChat, estadoSolicitud) => Boolean(estadoChat) || Boolean(estadoSolicitud && estadoSolicitud !== 'pendiente');

// ¿Todavía no empieza el día de llegada? (día de Guatemala: hasta las 23:59 del día anterior).
export const antesDeLlegar = (llegada, ahora = Date.now()) => V().esFecha(llegada) && llegada > V().hoy(ahora);
// ¿Ya pasó el día de llegada? (día de Guatemala). Una solicitud así no se confirma: la comisión nacería vencida y la
// casa quedaría con fechas que ya pasaron. El mismo día sí (el sitio deja pedir para hoy).
export const llegadaPasada = (llegada, ahora = Date.now()) => !V().esFecha(llegada) || llegada < V().hoy(ahora);
export const TEXTO_LLEGADA_PASADA = 'La fecha de llegada de esta solicitud ya pasó: no se puede confirmar. Ciérrala con «No se dio».';

// Por qué el socio NO puede cancelar esta reserva ('' = sí puede): solo mientras el cliente no ha pagado ni llegado.
// `reserva` y `chat` guardados; `token` = el del índice chatsPorSolicitud de la solicitud.
export function motivoParaNoCancelar(reserva, chat, token, ahora = Date.now()) {
	if (!reserva || reserva.estado !== 'confirmada') return 'Esta reserva ya no está confirmada.';
	if (!reserva.chat || reserva.chat !== token || !chat) return 'Esta reserva es de antes (sin su chat guardado): la cancela el administrador.';
	if (chat.estado !== 'confirmada') return 'El cliente ya pagó: la cancela el administrador.';
	if (chat.comprobanteCliente) return 'El cliente ya mandó su comprobante de pago: la cancela el administrador.';
	if (!antesDeLlegar(reserva.llegada, ahora)) return 'El día de llegada ya empezó: si no te pagó, usa «No me llegó».';
	return '';
}
// «No me llegó» (el socio no recibió el pago): '' = sí puede. Antes de la llegada, con el comprobante del cliente,
// reabre el pago con un plazo nuevo; desde el día de llegada, con o sin comprobante, cierra la reserva sin comisión.
// Nunca con la comisión ya pagada a EQ.
export function motivoParaNoMeLlego(reserva, chat, token, ahora = Date.now()) {
	if (!reserva || reserva.estado !== 'confirmada') return 'Esta reserva ya no está confirmada.';
	if (!reserva.chat || reserva.chat !== token || !chat) return 'Esta reserva es de antes (sin su chat guardado): avísale al administrador.';
	if (chat.estado !== 'confirmada') return 'Ya marcaste «Pago recibido»: avísale al administrador.';
	if (reserva.comision?.pagada) return 'La ganancia de EQ de esta reserva ya está pagada: avísale al administrador.';
	if (antesDeLlegar(reserva.llegada, ahora) && !chat.comprobanteCliente) return 'El cliente todavía no manda su comprobante: si ya no viene, usa «Cancelar».';
	return '';
}
// ¿«No me llegó» reabre el pago (antes de la llegada) o cierra la reserva (desde el día de llegada)?
export const noLlegoReabre = (reserva, ahora = Date.now()) => antesDeLlegar(reserva.llegada, ahora);
export const textoPagoReabierto = (vence, en = false) => (en
	? `The host has not received your payment yet. Check your transfer and attach your receipt again${Number.isFinite(vence) ? ` before ${fechaHora(vence, true)}` : ''}; otherwise the booking is cancelled automatically.`
	: `El anfitrión todavía no ve tu pago. Revisa tu transferencia y adjunta otra vez el comprobante${Number.isFinite(vence) ? ` antes del ${fechaHora(vence, false)}` : ''}; si no, la reserva se cancela sola.`);
// Fecha y hora de Guatemala para los textos al cliente (chat, página y correos): «vie, 20 nov, 14:00».
export const fechaHora = (t, en = false) => new Date(t).toLocaleString(en ? 'en-US' : 'es-GT', { timeZone: 'America/Guatemala', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
