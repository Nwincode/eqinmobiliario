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
export const TEXTO_CANCELADA = 'La reserva se canceló.';

// Viene de una solicitud de la web (tiene chat con el cliente y su solicitud en leads).
export const deSolicitud = (r) => Boolean(r?.leadId || r?.codigo);

// Lo que lleva toda reserva al nacer, venga de donde venga. `casa` = { id, titulo, agentId, propietarioId, moneda }.
// Los montos: costoSocio (lo del propietario), alojamiento (lo cobrado sin impuestos) y la ganancia de EQ.
export function nuevaReserva(casa, c) {
	const { r2, nochesEntre, hoy } = V();
	const costoSocio = r2(Number(c.costoSocio) || 0), alojamiento = r2(Number(c.alojamiento) || 0);
	return {
		propertyId: casa.id, propertyTitulo: c.propertyTitulo || casa.titulo || '',
		// El asesor de la casa (una casa por noche no lleva: ''), el mismo que exigen las reglas a quien no es administrador.
		agentId: casa.agentId || '', propietarioId: casa.propietarioId || '',
		moneda: c.moneda || casa.moneda || 'USD', llegada: c.llegada, salida: c.salida, noches: nochesEntre(c.llegada, c.salida),
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

// Lo que se registra al confirmar una solicitud: su parte (precios de hoy del dueño), lo cobrado y la ganancia de EQ.
// Al cliente se le cobra lo que se le cotizó (sin la limpieza, que no lleva margen): si después bajó un precio, el margen
// o la limpieza, la ganancia sale de lo cotizado, no de los precios de hoy.
// Una sola cuenta: la usan el diálogo de «Confirmada» (lo que se muestra), confirmarSolicitud y el servidor (lo que se guarda).
// `l` = la solicitud ({ reserva: { subtotal } }); `cuenta` = cuentaDe(...) de esas fechas; `casa` = la propiedad.
// `modo`: 'mayor' (el socio: el mayor entre lo cotizado y los precios de hoy), 'cotizado' o 'hoy' (el administrador
// elige cuando difieren: una cotización inflada no se registra sin que lo decida).
// Devuelve también `cotizado` y `deHoy` (lo cobrado con cada uno) y la ganancia con cada uno.
export function montosDeConfirmacion(l, cuenta, casa, modo = 'mayor') {
	const { r2 } = V();
	const cotizado = r2((Number(l.reserva?.subtotal) || 0) - (Number(casa?.vacacional?.limpieza) || 0));
	const deHoy = r2(Number(cuenta.alojamiento) || 0);
	const costoSocio = r2(Number(cuenta.costoSocio) || 0);
	const alojamiento = modo === 'hoy' ? deHoy : modo === 'cotizado' && cotizado > 0 ? cotizado : r2(Math.max(deHoy, cotizado));
	return { costoSocio, alojamiento, ganancia: r2(alojamiento - costoSocio), cotizado, deHoy,
		gananciaCotizada: r2(Math.max(cotizado, 0) - costoSocio), hoy: r2(deHoy - costoSocio) };
}
// ¿Lo cotizado y los precios de hoy difieren en más de 1 %? (entonces el administrador elige con cuál se registra).
export const difierenMontos = (m) => m.cotizado > 0 && Math.abs(m.cotizado - m.deHoy) > 0.01 * Math.max(m.cotizado, m.deHoy);

// La reserva que nace al confirmar la solicitud `l` (l.id, l.propertyId, l.propertyTitulo, l.nombre y
// l.reserva { codigo, llegada, salida, moneda, subtotal }) de la casa `casa` (con su id). Lleva su comisión y, si hay,
// el token de su chat (con él se sabe después si el cliente ya pagó). Devuelve { datos, montos }.
export function reservaDeSolicitud(l, cuenta, casa, { modo = 'mayor', chat = '' } = {}) {
	const r = l.reserva;
	const montos = montosDeConfirmacion(l, cuenta, casa, modo);
	const datos = nuevaReserva(casa, {
		propertyTitulo: l.propertyTitulo, moneda: r.moneda || 'USD', llegada: r.llegada, salida: r.salida, estado: 'confirmada', canal: 'web',
		// Solo el primer nombre: el socio lee sus reservas; el contacto del cliente queda en la solicitud (leadId).
		huesped: String(l.nombre || '').trim().split(/\s+/)[0], leadId: l.id, codigo: r.codigo, costoSocio: montos.costoSocio,
		alojamiento: montos.alojamiento, chat
	});
	datos.comision = comisionDeReserva(datos);
	return { datos, montos };
}

// ¿La solicitud ya se respondió? (el chat con estado, o la solicitud con uno que no es «pendiente»).
export const yaRespondida = (estadoChat, estadoSolicitud) => Boolean(estadoChat) || Boolean(estadoSolicitud && estadoSolicitud !== 'pendiente');

// ¿Todavía no empieza el día de llegada? (día de Guatemala: hasta las 23:59 del día anterior).
export const antesDeLlegar = (llegada, ahora = Date.now()) => V().esFecha(llegada) && llegada > V().hoy(ahora);

// Por qué el socio NO puede cancelar esta reserva ('' = sí puede): solo mientras el cliente no ha pagado ni llegado.
// `reserva` y `chat` guardados; `token` = el del índice chatsPorSolicitud de la solicitud.
export function motivoParaNoCancelar(reserva, chat, token, ahora = Date.now()) {
	if (!reserva || reserva.estado !== 'confirmada') return 'Esta reserva ya no está confirmada.';
	if (!reserva.chat || reserva.chat !== token || !chat) return 'Esta reserva es de antes (sin su chat guardado): la cancela el administrador.';
	if (chat.estado !== 'confirmada') return 'El cliente ya pagó: la cancela el administrador.';
	if (chat.comprobanteCliente) return 'El cliente ya mandó su comprobante de pago: la cancela el administrador.';
	if (!antesDeLlegar(reserva.llegada, ahora)) return 'El día de llegada ya empezó: la cancela el administrador.';
	return '';
}
