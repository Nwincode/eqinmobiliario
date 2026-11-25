// Cuentas de las reservas por noche, sin pantalla ni base de datos: la única fuente de los montos y de las revisiones
// de una reserva. La usan el panel (admin/js/reservas.js, admin/js/views/solicitudes.js) y el servidor
// (netlify/functions/reservas.mjs), así lo que se muestra, lo que guarda el administrador y lo que guarda el servidor
// por el socio salen de lo mismo. Las fórmulas de precios y fechas son las de js/calc-vacacional.js.
import '../../js/calc-vacacional.js';
import { visibilidadDe } from './estados.js';

const V = () => globalThis.EQVacacional;
export const MOTIVOS_CANCELAR = ['Cliente canceló', 'Fechas ya no disponibles', 'Otro'];
export const MOTIVOS_NO = ['Cliente no respondió', 'Fechas no disponibles', 'Precio', 'Otro'];
// Lo que lee el cliente en su chat cuando el sistema, el socio o el equipo cierran su solicitud o reserva: en su idioma
// (chat.idioma; `en` = true en inglés). Una sola lista para el servidor y el panel; el correo dice lo mismo.
const TEXTOS_CLIENTE = {
	no: ['Lo sentimos: la casa no está disponible en esas fechas.', 'Sorry: the house is not available on those dates.'],
	noRespondio: ['Cerramos esta solicitud porque no tuvimos respuesta. Si todavía quieres la casa, elige tus fechas otra vez.', 'We closed this request because we did not hear back from you. If you still want the house, choose your dates again.'],
	noSeConcreto: ['Esta solicitud no se pudo concretar. Si quieres, elige otras fechas o mira otras casas.', 'This request could not go ahead. If you like, choose other dates or look at other houses.'],
	cancelada: ['La reserva se canceló.', 'The booking was cancelled.'],
	sinRespuesta: ['El anfitrión no respondió a tiempo, así que cerramos esta solicitud. Puedes elegir otras fechas u otra casa.', 'The host did not reply in time, so we closed this request. You can choose other dates or another house.'],
	equipoNoConfirmo: ['No pudimos confirmar tu solicitud a tiempo, así que la cerramos y las fechas quedan libres. Si todavía te interesa, elige tus fechas otra vez.', 'We could not confirm your request in time, so we closed it and the dates are free again. If you are still interested, choose your dates again.'],
	sinPago: ['No recibimos tu pago a tiempo, así que la reserva se canceló y las fechas quedaron libres. Si todavía la quieres, elige tus fechas otra vez.', 'We did not receive your payment in time, so the booking was cancelled and the dates were released. If you still want it, choose your dates again.'],
	noLlego: ['El anfitrión no recibió tu pago, así que la reserva se canceló. Si sí pagaste, escríbenos aquí con tu comprobante.', 'The host did not receive your payment, so the booking was cancelled. If you did pay, write to us here with your receipt.'],
	casaNoDisponible: ['Esta casa ya no está disponible, así que cerramos tu solicitud. Puedes mirar otras casas en el sitio.', 'This house is no longer available, so we closed your request. You can look at other houses on the site.'],
	fechasApartadas: ['Esas fechas se acaban de reservar, así que cerramos esta solicitud. Elige otras fechas en la ficha de la casa.', 'Those dates were just booked, so we closed this request. Choose other dates on the house page.']
};
export const textoCliente = (clave, en = false) => TEXTOS_CLIENTE[clave][en ? 1 : 0];
// Lo que lee el cliente en su chat cuando «no se dio», según el motivo (no siempre fue por las fechas).
const CLAVE_NO = { 'Cliente no respondió': 'noRespondio', 'Precio': 'noSeConcreto', 'Otro': 'noSeConcreto' };
export const textoNo = (motivo, en = false) => textoCliente(CLAVE_NO[motivo] || 'no', en);
export const TEXTO_NO = textoCliente('no');
export const TEXTO_CANCELADA = textoCliente('cancelada');

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
// Una solicitud sin su chat (escrita a mano contra la base, o el chat nunca se creó): nadie puede atenderla ni la
// cotiza el servidor. El cron de plazos la cierra pasados unos minutos, sin correo, para que no gaste sus vueltas.
export const MOTIVO_SIN_CHAT = 'Sin chat';
// Una solicitud cotizada por debajo del precio de la casa la confirma el equipo (motivoSocioNoConfirma); si nadie la
// confirma en 24 h, se cierra con este motivo (no «sin respuesta del anfitrión»: el anfitrión no podía).
export const MOTIVO_EQUIPO_NO_CONFIRMO = 'No se confirmó a tiempo';
export const TEXTO_SIN_RESPUESTA = textoCliente('sinRespuesta');
export const TEXTO_SIN_PAGO = textoCliente('sinPago');
export const TEXTO_NO_LLEGO = textoCliente('noLlego');
export const TEXTO_CASA_NO_DISPONIBLE = textoCliente('casaNoDisponible');
export const textoDuplicada = (codigo, en = false) => (en ? `This request was a duplicate and we closed it. Your booking continues as ${codigo}: look for it in your email.`
	: `Esta solicitud estaba repetida y la cerramos. Tu reserva sigue en ${codigo}: búscala en tu correo.`);
CLAVE_NO[MOTIVO_SIN_RESPUESTA] = 'sinRespuesta';
CLAVE_NO[MOTIVO_CASA_NO_DISPONIBLE] = 'casaNoDisponible';
CLAVE_NO[MOTIVO_EQUIPO_NO_CONFIRMO] = 'equipoNoConfirmo';
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
		huesped: String(c.huesped || '').trim(), canal: c.canal || 'directo', estado: c.estado === 'cancelada' ? 'cancelada' : 'confirmada',
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
//  - Si lo cotizado cuadra con los precios de la casa (unos centavos por noche: TOLERANCIA_NOCHE), la parte del socio
//    es la de sus precios.
//  - Si quedó por debajo (el subtotal lo escribe el navegador del cliente: una página vieja o uno cambiado a mano), EQ
//    conserva su margen completo del plan (gananciaDelPlan) y el socio recibe el resto; esa solicitud la confirma solo el
//    administrador (motivoSocioNoConfirma: 409 en el servidor).
//  - Si quedó por encima (el precio bajó después), el socio y EQ se reparten lo cotizado con la proporción de hoy.
// La ganancia nunca es negativa. `reserva` = { llegada, salida, subtotal | total }; `casa` = la propiedad;
// `privadoSocio` = privado/socio. null si la casa no tiene precio del socio.
export const TOLERANCIA_NOCHE = 0.05;
export function montosCotizados(reserva, casa, privadoSocio) {
	const { r2 } = V();
	const cuenta = cuentaDe(reserva, privadoSocio);
	if (!cuenta) return null;
	const limpieza = r2(Math.max(0, Number(casa?.vacacional?.limpieza) || 0));
	const alojamiento = r2(Math.max(0, subtotalCotizado(reserva) - limpieza));
	const delPlan = r2(Number(cuenta.alojamiento) || 0);
	const gananciaDelPlan = r2(Math.max(0, delPlan - cuenta.costoSocio));
	const coincide = delPlan > 0 && Math.abs(alojamiento - delPlan) <= TOLERANCIA_NOCHE * Math.max(1, cuenta.noches || 1) + 1e-9;
	const proporcional = delPlan > 0 ? r2(alojamiento * cuenta.costoSocio / delPlan) : alojamiento;
	const costoSocio = r2(Math.max(0, Math.min(alojamiento, coincide ? cuenta.costoSocio : alojamiento < delPlan ? alojamiento - gananciaDelPlan : proporcional)));
	return { moneda: casa?.moneda || 'USD', costoSocio, alojamiento, limpieza, margen: r2(V().nochePublica(100, privadoSocio.margen) - 100),
		ganancia: r2(alojamiento - costoSocio), delPlan, gananciaDelPlan, coincide };
}
// Cotizado por debajo del plan (o en cero): lo confirma el administrador (el socio, ni en el panel ni en el servidor).
export const bajoElPlan = (m) => Boolean(m) && (!(m.alojamiento > 0) || (!m.coincide && m.delPlan > 0 && m.alojamiento < m.delPlan));
export const TEXTO_CONFIRMA_EQUIPO = 'Se le cotizó menos que el precio de la casa';
export const motivoSocioNoConfirma = (m) => (bajoElPlan(m) ? `La confirma el equipo (${TEXTO_CONFIRMA_EQUIPO.toLowerCase()}).` : '');
// Los montos congelados con el piso de EQ: con lo cotizado por debajo del plan, EQ conserva su margen completo del plan
// (los congelados antes de este piso se repartían con la proporción de hoy; sin gananciaDelPlan, sale del margen).
export function conPisoDeEq(m) {
	if (!bajoElPlan(m) || !(m.alojamiento > 0)) return m;
	const { r2, nochePublica } = V();
	const delPlan = typeof m.gananciaDelPlan === 'number' ? m.gananciaDelPlan : r2(m.delPlan - m.delPlan * 100 / nochePublica(100, m.margen));
	const ganancia = r2(Math.min(m.alojamiento, Math.max(m.ganancia, delPlan)));
	return { ...m, ganancia, costoSocio: r2(m.alojamiento - ganancia) };
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
	const piso = conPisoDeEq(montos);
	const cot = { costoSocio: piso.costoSocio, alojamiento: piso.alojamiento, ganancia: piso.ganancia };
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
// `revisadoAMano`: los calendarios (Airbnb, Booking, VRBO) que no se pudieron leer y quien confirmó dijo «Revisé …».
export function reservaDeSolicitud(l, casa, m, { chat = '', ahora = Date.now(), revisadoAMano = [] } = {}) {
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
	if (revisadoAMano.length) datos.revisadoAMano = revisadoAMano.map(String);
	return datos;
}
// El renglón del historial al confirmar (el mismo en el servidor y en el panel).
export const queConfirmo = (revisadoAMano = []) => (revisadoAMano.length ? `Confirmó (revisó a mano ${revisadoAMano.join(' y ')})` : 'Confirmó');
// Renglones del historial que no cambian la solicitud: el correo corregido y el enlace reenviado (admin/js/crm.js
// corregirCorreo). No mueven la fecha de la confirmación ni son «lo último que pasó» en la tarjeta de Solicitudes.
export const queCorreoCorregido = (antes, ahora) => `Correo corregido: ${antes || 'sin correo'} → ${ahora}`;
export const queEnlaceReenviado = (correo) => `Se reenvió el enlace a ${correo}`;
export const esNotaDelHistorial = (x) => /^(Correo corregido: |Se reenvió el enlace a )/.test(String(x?.que || ''));
// Lo último que pasó con la solicitud (sin las notas); sin otro renglón, la última nota.
export const ultimoDelHistorial = (renglones = []) => renglones.filter((x) => !esNotaDelHistorial(x)).at(-1) || renglones.at(-1) || null;
// El día (Guatemala) en que se confirmó: el de su último «Confirmó…» ('' si no tiene).
export function diaQueConfirmo(historial) {
	const x = (historial || []).filter((r) => /^Confirmó/.test(String(r?.que || ''))).at(-1);
	const t = Date.parse(x?.cuando || '');
	return Number.isFinite(t) ? V().hoy(t) : '';
}

// Por qué una solicitud NO se confirma ('' = sí): lo mismo en el panel (el administrador) y en el servidor (el socio).
// `lead` = la solicitud ({ reserva }); `casa` = la propiedad guardada; `montos` = los congelados (o null).
export function motivoParaNoConfirmar(lead, casa, montos, ahora = Date.now()) {
	if (llegadaPasada(lead?.reserva?.llegada, ahora)) return TEXTO_LLEGADA_PASADA;
	// La casa salió del sitio (oculta, pausada o retirada): no se toma una reserva que el equipo quitó.
	if (visibilidadDe(casa) !== 'visible') return 'Esta casa ya no está publicada en el sitio: no se puede confirmar. Ciérrala con «No se dio».';
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

// ¿Esta solicitud aparta sus fechas ahora? Sí mientras nadie la responde y no vence su plazo de 24 h (venceRespuesta),
// y solo si el servidor ya la cotizó (montosSolicitud: la vio llegar con su chat, `montos`) a un precio válido (con algo
// que cobrar y no por debajo del precio de la casa): una solicitud escrita a mano contra la base, sin chat o en cero, no
// aparta nada. La misma regla en la página (netlify/functions/disponibilidad.mjs), el calendario del socio (mis-casas.js)
// y Solicitudes. `creada` en milisegundos. Una que sigue abierta después (el anfitrión conversa con el cliente) o una de
// antes de los plazos (PLAZOS_DESDE) ya no aparta: se puede pedir encima y Solicitudes avisa «Se cruza con otra solicitud».
export const apartaFechas = (estadoChat, estadoSolicitud, creada, montos, ahora = Date.now()) => !yaRespondida(estadoChat, estadoSolicitud)
	&& conPlazo(creada) && ahora < venceRespuesta(creada) && Boolean(montos) && montos.alojamiento > 0 && !bajoElPlan(montos);
// ¿Dos estancias { llegada, salida } comparten alguna noche? (la salida no ocupa noche).
export const seCruzan = (a, b) => Boolean(a?.llegada && b?.llegada) && a.llegada < b.salida && b.llegada < a.salida;
// Una solicitud abierta cuyas fechas ya tiene una reserva confirmada de la casa: se cierra sola (la cierra el servidor
// al confirmar la otra, al llegar ella y en el cron: cerrarSiSeCruza). Dos solicitudes abiertas que se cruzan no se
// cierran entre sí (una pudo ser falsa): Solicitudes avisa «Se cruza con otra solicitud» y al confirmar una se cierra la
// otra. `reservas`: [{ id, propertyId, estado, llegada, salida, codigo }]. Devuelve el código de la reserva o ''.
export function apartadaPor(lead, reservas) {
	const res = (reservas || []).find((r) => V().choquesReserva({ id: lead.id, propertyId: lead.propertyId, ...lead.reserva }, [r]).length);
	return res ? (res.codigo || 'otra reserva') : '';
}
// ¿Alguna noche de la estancia ya está tomada en Airbnb, Booking o VRBO? `externas`: [{ desde, hasta, fuente }] (sus
// calendarios iCal). Devuelve el motivo en una línea (409 en el servidor y en el panel) o ''.
export function choqueExterno(reserva, externas) {
	const x = (externas || []).find((r) => seCruzan(reserva, { llegada: r.desde, salida: r.hasta }));
	return x ? `Esas fechas ya están ocupadas en ${x.fuente || 'otra plataforma'} (${x.desde} a ${x.hasta}): no se puede confirmar. Ciérrala con «No se dio».` : '';
}
export const MOTIVO_FECHAS_APARTADAS = 'Fechas ya reservadas';
export const TEXTO_FECHAS_APARTADAS = textoCliente('fechasApartadas');
CLAVE_NO[MOTIVO_FECHAS_APARTADAS] = 'fechasApartadas';

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
	if (chat.comprobanteCliente) return 'El cliente ya mandó su comprobante de pago: si no te llegó el pago, usa «No me llegó».';
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
	if (antesDeLlegar(reserva.llegada, ahora)) {
		if (!chat.comprobanteCliente) return 'El cliente todavía no manda su comprobante: si ya no viene, usa «Cancelar».';
		// Antes de la llegada se reabre una sola vez (el equipo ya se enteró): la segunda, la decide el administrador.
		if (chat.pagoReabierto) return 'Ya le pediste que revisara su pago y el equipo ya lo sabe: si sigue sin llegar, avísale al administrador.';
		return '';
	}
	// Desde la llegada, hasta 3 días después; más tarde, el administrador (el huésped ya pudo haber llegado y pagado).
	if (V().hoy(ahora) > V().ultimoDiaNoLlego(reserva)) return `Pasaron más de ${DIAS_NO_LLEGO} días desde la llegada: avísale al administrador.`;
	return '';
}
export const DIAS_NO_LLEGO = globalThis.EQVacacional.DIAS_NO_LLEGO;
// Milisegundos de una fecha guardada (Timestamp del panel, Date del servidor, texto del sitio o número).
const enMs = (v) => (typeof v === 'number' ? v : v?.toMillis?.() ?? (v instanceof Date ? v.getTime() : Date.parse(v || '') || 0));
// ¿El cliente mandó un comprobante que sigue en pie? El de antes de «No me llegó» (pagoReabierto) queda guardado como
// historia (el cron no cancela a quien mandó uno), pero ya no cuenta como enviado: se le pide otro.
// ¿La conversación sigue abierta para responder? No cancelada ni «No se dio», y su salida fue hace menos de 7 días. Un
// mensaje del cliente sin respuesta solo cuenta en una abierta: la misma regla para la campana, el número de Mensajes,
// su lista y la etiqueta «Mensaje sin responder» de Solicitudes (admin/js/avisos.js, views/mensajes.js, solicitudes-base.js).
export const chatAbierto = (chat, hoy = V().hoy()) => Boolean(chat) && !['no', 'cancelada'].includes(chat.estado || '') && String(chat.salida || '') >= V().sumarDias(hoy, -7);
export const comprobanteVigente = (chat) => Boolean(chat?.comprobanteCliente) && !(Number(chat.pagoReabierto) >= enMs(chat.comprobanteCliente));
// ¿«No me llegó» reabre el pago (antes de la llegada) o cierra la reserva (desde el día de llegada)?
export const noLlegoReabre = (reserva, ahora = Date.now()) => antesDeLlegar(reserva.llegada, ahora);
// El comprobante de antes queda (no se cancela sola: el cron no toca una reserva con comprobante); si el plazo pasa sin
// otro, el equipo lo ve en la alerta de cada mañana (solicitudes-sin-respuesta.mjs) y lo revisa con los dos.
export const textoPagoReabierto = (vence, en = false) => (en
	? `The host has not received your payment yet. Check your transfer and attach your receipt again${Number.isFinite(vence) ? ` before ${fechaHora(vence, true)}` : ''}; our team reviews the booking with you.`
	: `El anfitrión todavía no ve tu pago. Revisa tu transferencia y adjunta otra vez el comprobante${Number.isFinite(vence) ? ` antes del ${fechaHora(vence, false)}` : ''}; nuestro equipo revisa la reserva contigo.`);
// Fecha y hora de Guatemala para los textos al cliente (chat, página y correos): «vie, 20 nov, 14:00».
export const fechaHora = (t, en = false) => new Date(t).toLocaleString(en ? 'en-US' : 'es-GT', { timeZone: 'America/Guatemala', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// La reserva con lo que dice su chat para V.cobrable (js/calc-vacacional.js): «Pago recibido» y un comprobante en pie.
// Lo usan el panel (Solicitudes, la campana, los permisos) y el servidor (pausa por mora, permisos).
export const conDatosDelChat = (r, chat) => ({ ...r, chatPagado: chat?.estado === 'pagada', chatComprobante: comprobanteVigente(chat) });
