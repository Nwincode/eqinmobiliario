// Pruebas de las cuentas de las reservas (admin/js/reservas-calculo.js), las mismas que usan el panel y el servidor
// (netlify/functions/reservas.mjs). Sin red: `node scripts/test-reservas-calculo.mjs`.
// Los números de las reservas de prueba son los de scripts/emulador/test-reglas.mjs (lead-res-noche, lead-res-cara):
// con este módulo dan lo mismo que daba el panel antes de moverlo.
import assert from 'node:assert/strict';
import { venceRespuesta, vencePago, recordarPagoDesde, conPlazo, PLAZOS_DESDE, plazoDePago, guardarVence, cancelaSola, montosCotizados, cambioElPrecio, motivoParaNoConfirmar,
	motivoParaNoMeLlego, noLlegoReabre, faltaDireccion, esDuplicada, bajoElPlan, motivoSocioNoConfirma, apartaFechas, apartadaPor, choqueExterno, seCruzan } from '../admin/js/reservas-calculo.js';
import '../js/calc-vacacional.js';
import { nuevaReserva, comisionDeReserva, cuentaDe, subtotalCotizado, montosDeConfirmacion, difierenMontos, reservaDeSolicitud, yaRespondida, antesDeLlegar, llegadaPasada,
	motivoParaNoCancelar, MOTIVOS_NO, MOTIVOS_CANCELAR } from '../admin/js/reservas-calculo.js';

const V = globalThis.EQVacacional;
let ok = 0;
function test(nombre, fn) {
	try { fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${err.stack}`); process.exitCode = 1; }
}

// La casa de prueba: US$ 100 la noche del dueño, margen 20 % (mx-noche en test-reglas.mjs).
const privado = { precioBase: 100, margen: 20 };
const casa = { id: 'mx-noche', titulo: 'Casa por noche', agentId: '', propietarioId: 'm1', moneda: 'USD', vacacional: { limpieza: 0 } };
const solicitud = (subtotal, extra = {}) => ({ id: 'lead-res-noche', propertyId: 'mx-noche', propertyTitulo: 'Casa por noche', nombre: 'Ana Prueba López',
	reserva: { codigo: 'EQ-RN', llegada: '2026-12-01', salida: '2026-12-04', moneda: 'USD', subtotal, ...extra } });

test('la cuenta de la estancia sale de los precios guardados del dueño (sin precio: null)', () => {
	const c = cuentaDe(solicitud(360).reserva, privado);
	assert.deepEqual(c, { noches: 3, costoSocio: 300, ganancia: 60, alojamiento: 360 });
	assert.equal(cuentaDe(solicitud(360).reserva, null), null);
	// Fin de semana y precio por fechas: los de calc-vacacional (viernes 4 y sábado 5 a 150; el 24 a 200).
	const plan = { precioBase: 100, precioFinde: 150, tarifas: [{ desde: '2026-12-24', hasta: '2026-12-24', precio: 200 }] };
	assert.equal(cuentaDe({ llegada: '2026-12-03', salida: '2026-12-06' }, plan).costoSocio, 400);
	assert.equal(cuentaDe({ llegada: '2026-12-24', salida: '2026-12-25' }, plan).ganancia, 40);
});

test('reserva de prueba lead-res-noche: su parte 300, lo cobrado 360, ganancia y comisión 60, con su plazo de pago', () => {
	const l = solicitud(360);
	const montos = montosCotizados(l.reserva, casa, privado);
	assert.deepEqual(montos, { moneda: 'USD', costoSocio: 300, alojamiento: 360, limpieza: 0, margen: 20, ganancia: 60, delPlan: 360, gananciaDelPlan: 60, coincide: true });
	const ahora = Date.parse('2026-11-20T12:00:00Z');
	const datos = reservaDeSolicitud(l, casa, montosDeConfirmacion(montos, cuentaDe(l.reserva, privado)), { chat: 'ChatDeLaReservaRNLargoYAlAzar1', ahora });
	assert.deepEqual(datos, { propertyId: 'mx-noche', propertyTitulo: 'Casa por noche', agentId: '', propietarioId: 'm1', moneda: 'USD', llegada: '2026-12-01', salida: '2026-12-04', noches: 3,
		huesped: 'Ana', canal: 'web', estado: 'confirmada', leadId: 'lead-res-noche', codigo: 'EQ-RN', chat: 'ChatDeLaReservaRNLargoYAlAzar1', costoSocio: 300, alojamiento: 360, ganancia: 60,
		pagadoSocio: false, pagadoFecha: '', comision: { monto: 60, vence: '2026-12-01', pagada: false }, pagoDesde: ahora, vencePago: ahora + 48 * 3600000 });
	assert.equal(difierenMontos(montosDeConfirmacion(montos, cuentaDe(l.reserva, privado))), false);
});

test('montos congelados: la limpieza, la parte del socio y el margen de la casa al cotizar; nunca una ganancia negativa', () => {
	// Con limpieza: lo cobrado es lo cotizado sin ella.
	const m = montosCotizados(solicitud(460).reserva, { ...casa, vacacional: { limpieza: 100 } }, privado);
	assert.deepEqual([m.alojamiento, m.limpieza, m.costoSocio, m.ganancia, m.coincide], [360, 100, 300, 60, true]);
	// Cotizado de menos (300 contra 360 del plan; el subtotal lo escribe el navegador): EQ conserva su margen completo
	// del plan (60) y esa solicitud la confirma el administrador.
	const barata = montosCotizados(solicitud(300).reserva, casa, privado);
	assert.deepEqual([barata.alojamiento, barata.costoSocio, barata.ganancia, barata.coincide], [300, 240, 60, false]);
	assert.equal(bajoElPlan(barata), true);
	assert.match(motivoSocioNoConfirma(barata), /la confirma el administrador/);
	assert.equal(motivoSocioNoConfirma(montosCotizados(solicitud(360).reserva, casa, privado)), '');
	assert.match(motivoSocioNoConfirma(montosCotizados(solicitud(0).reserva, casa, privado)), /administrador/);
	// Uno congelado antes del piso (repartido con la proporción: 250/50): al confirmar, EQ igual recibe su margen.
	const deAntes = { moneda: 'USD', costoSocio: 250, alojamiento: 300, limpieza: 0, margen: 20, ganancia: 50, delPlan: 360, coincide: false };
	const conf = montosDeConfirmacion(deAntes, null);
	assert.deepEqual([conf.costoSocio, conf.ganancia], [240, 60]);
	// Tolerancia en centavos por noche, no 1 %: 3 noches, 15 centavos.
	const plan3 = { precioBase: 12000, margen: 20 };
	assert.equal(montosCotizados(solicitud(43199.85).reserva, casa, plan3).coincide, true);
	assert.equal(montosCotizados(solicitud(43199).reserva, casa, plan3).coincide, false);
	// Cotizado de más (inflado): el socio y EQ en la misma proporción; lo cobrado es lo que el cliente paga.
	const cara = montosCotizados(solicitud(500).reserva, casa, privado);
	assert.deepEqual([cara.alojamiento, cara.costoSocio, cara.ganancia], [416.67 + 83.33, 416.67, 83.33]);
	// Sin nada cotizado: todo en 0, nunca negativo.
	const cero = montosCotizados(solicitud(0).reserva, casa, privado);
	assert.deepEqual([cero.alojamiento, cero.costoSocio, cero.ganancia], [0, 0, 0]);
	// Margen 0 y cotizado apenas menor (dentro del 1 %): la parte del socio no pasa de lo cobrado.
	const sinMargen = montosCotizados(solicitud(299).reserva, casa, { precioBase: 100, margen: 0 });
	assert.ok(sinMargen.ganancia >= 0 && sinMargen.costoSocio === 299);
	assert.equal(montosCotizados(solicitud(360).reserva, casa, null), null);
	// 20 000 estancias al azar: la parte del socio más la ganancia es siempre lo cobrado, y la ganancia nunca es negativa.
	for (let i = 0; i < 20000; i++) {
		const sub = Math.round(Math.random() * 200000) / 100;
		const pr = { precioBase: 1 + Math.round(Math.random() * 500), precioFinde: Math.random() < 0.5 ? 0 : 1 + Math.round(Math.random() * 600), margen: Math.round(Math.random() * 40) };
		const x = montosCotizados(solicitud(sub).reserva, { ...casa, vacacional: { limpieza: Math.round(Math.random() * 50) } }, pr);
		assert.ok(x.ganancia >= 0 && x.costoSocio >= 0 && Math.abs(x.costoSocio + x.ganancia - x.alojamiento) < 0.005, JSON.stringify({ sub, pr, x }));
	}
});

test('confirmar: siempre con lo congelado (aunque hoy el precio sea otro); el administrador puede elegir los precios de hoy', () => {
	const congelado = montosCotizados(solicitud(360).reserva, casa, privado);
	// Hoy el socio subió a 150 la noche: la tarjeta lo dice, pero se registra lo cotizado.
	const hoy = cuentaDe(solicitud(360).reserva, { precioBase: 150, margen: 20 });
	assert.equal(cambioElPrecio(congelado, hoy), true);
	assert.equal(cambioElPrecio(congelado, cuentaDe(solicitud(360).reserva, privado)), false);
	const m = montosDeConfirmacion(congelado, hoy);
	assert.deepEqual([m.costoSocio, m.alojamiento, m.ganancia, m.cotizado, m.deHoy, m.hoy], [300, 360, 60, 360, 540, 90]);
	assert.equal(difierenMontos(m), true);
	const deHoy = montosDeConfirmacion(congelado, hoy, 'hoy');
	assert.deepEqual([deHoy.costoSocio, deHoy.alojamiento, deHoy.ganancia], [450, 540, 90]);
	// Sin precios de hoy (la casa ya no tiene precio): lo congelado.
	assert.equal(montosDeConfirmacion(congelado, null, 'hoy').ganancia, 60);
	assert.deepEqual(comisionDeReserva({ ganancia: 40, llegada: '2026-12-01' }, { pagada: true, comprobante: 'x' }), { pagada: true, comprobante: 'x', monto: 40, vence: '2026-12-01' });
});

test('no se confirma: llegada pasada, casa fuera del sitio o que cambió de moneda', () => {
	const ahora = Date.parse('2026-11-20T18:00:00Z');
	const lead = solicitud(360);
	const pub = { ...casa, publicado: true };
	assert.equal(motivoParaNoConfirmar(lead, pub, null, ahora), '');
	assert.match(motivoParaNoConfirmar({ reserva: { ...lead.reserva, llegada: '2026-11-19' } }, pub, null, ahora), /ya pasó/);
	assert.match(motivoParaNoConfirmar(lead, { ...pub, publicado: false }, null, ahora), /publicada/);
	assert.match(motivoParaNoConfirmar(lead, { ...pub, estado: 'pausada' }, null, ahora), /publicada/);
	assert.match(motivoParaNoConfirmar(lead, { ...pub, moneda: 'GTQ' }, null, ahora), /moneda/);
	assert.match(motivoParaNoConfirmar(lead, pub, { moneda: 'GTQ' }, ahora), /moneda/);
	assert.equal(motivoParaNoConfirmar(lead, { ...pub, moneda: '' }, null, ahora), '');
});

test('«No me llegó»: con el comprobante reabre el pago; desde el día de llegada cierra; nunca con la comisión pagada', () => {
	const antes = Date.parse('2026-11-30T12:00:00Z'), llegada = Date.parse('2026-12-01T12:00:00Z');
	const reserva = { estado: 'confirmada', chat: 'Tk', llegada: '2026-12-01', comision: { monto: 60, pagada: false } };
	assert.match(motivoParaNoMeLlego(reserva, { estado: 'confirmada' }, 'Tk', antes), /Cancelar/);
	assert.equal(motivoParaNoMeLlego(reserva, { estado: 'confirmada', comprobanteCliente: new Date() }, 'Tk', antes), '');
	assert.equal(noLlegoReabre(reserva, antes), true);
	assert.equal(motivoParaNoMeLlego(reserva, { estado: 'confirmada' }, 'Tk', llegada), '');
	assert.equal(noLlegoReabre(reserva, llegada), false);
	assert.match(motivoParaNoMeLlego(reserva, { estado: 'pagada' }, 'Tk', llegada), /Pago recibido/);
	assert.match(motivoParaNoMeLlego({ ...reserva, comision: { pagada: true } }, { estado: 'confirmada' }, 'Tk', llegada), /pagada/);
	assert.match(motivoParaNoMeLlego(reserva, { estado: 'confirmada' }, 'Otro', llegada), /de antes/);
	// Con el comprobante subido, el socio ya no cancela: usa «No me llegó».
	assert.match(motivoParaNoCancelar(reserva, { estado: 'confirmada', comprobanteCliente: new Date() }, 'Tk', antes), /comprobante/);
});

test('dirección, duplicadas', () => {
	assert.equal(faltaDireccion(null), true);
	assert.equal(faltaDireccion({ direccion: '  ' }), true);
	assert.equal(faltaDireccion({ direccion: 'Km 5' }), false);
	const a = { id: 'a', email: 'Ana@X.test ', propertyId: 'c', reserva: { llegada: '2026-12-01', salida: '2026-12-03' } };
	assert.equal(esDuplicada(a, { ...a, id: 'b', email: 'ana@x.test' }), true);
	assert.equal(esDuplicada(a, a), false);
	assert.equal(esDuplicada(a, { ...a, id: 'b', reserva: { llegada: '2026-12-01', salida: '2026-12-04' } }), false);
	assert.equal(esDuplicada(a, { ...a, id: 'b', propertyId: 'otra' }), false);
	assert.equal(esDuplicada({ ...a, email: '' }, { ...a, id: 'b', email: '' }), false);
});

test('subtotal cotizado: el de la solicitud, o sacado del total que vio el cliente (chats de antes)', () => {
	assert.equal(subtotalCotizado({ subtotal: 920, total: 1 }), 920);
	assert.equal(subtotalCotizado({ total: 439.2 }), 360);
	assert.equal(subtotalCotizado({ total: 1122.4 }), 920);
});

test('la moneda de la reserva y de la comisión es la de la casa, no la que mande el cliente (sin moneda, US$)', () => {
	const l = solicitud(360, { moneda: 'GTQ' });
	const m = montosDeConfirmacion(montosCotizados(l.reserva, casa, privado), null);
	assert.equal(reservaDeSolicitud(l, casa, m).moneda, 'USD');
	assert.equal(reservaDeSolicitud(solicitud(360), { ...casa, moneda: 'GTQ' }, m).moneda, 'GTQ');
	assert.equal(reservaDeSolicitud(l, { ...casa, moneda: '' }, m).moneda, 'USD');
	assert.equal(nuevaReserva(casa, { llegada: '2026-12-01', salida: '2026-12-03', moneda: 'GTQ' }).moneda, 'USD');
});

test('llegada pasada: no se confirma; el mismo día sí (día de Guatemala, UTC−6)', () => {
	const ahora = Date.parse('2026-11-26T12:00:00Z');
	assert.equal(llegadaPasada('2026-11-21', ahora), true);
	assert.equal(llegadaPasada('2026-11-25', ahora), true);
	assert.equal(llegadaPasada('2026-11-26', ahora), false);
	assert.equal(llegadaPasada('2026-12-01', ahora), false);
	// 23:30 del 25 en Guatemala (05:30 UTC del 26): para Guatemala todavía es el 25.
	assert.equal(llegadaPasada('2026-11-25', Date.parse('2026-11-26T05:30:00Z')), false);
	assert.equal(llegadaPasada('mañana', ahora), true);
});

test('reserva a mano y comisión: lo de siempre', () => {
	const r = nuevaReserva(casa, { llegada: '2026-12-01', salida: '2026-12-03', costoSocio: '200', alojamiento: 240.004, huesped: '  Luis ' });
	assert.deepEqual([r.noches, r.costoSocio, r.alojamiento, r.ganancia, r.huesped, r.canal, r.estado, 'chat' in r], [2, 200, 240, 40, 'Luis', 'directo', 'confirmada', false]);
	assert.deepEqual(comisionDeReserva({ ganancia: 40, llegada: '2026-12-01' }, { pagada: true, comprobante: 'x' }), { pagada: true, comprobante: 'x', monto: 40, vence: '2026-12-01' });
});

test('las fechas de la casa al confirmar: choque con otra confirmada y la salida libre para la siguiente', () => {
	const otra = { id: 'r1', propertyId: 'mx-noche', estado: 'confirmada', llegada: '2026-12-03', salida: '2026-12-06' };
	const l = solicitud(360);
	const datos = reservaDeSolicitud(l, casa, montosDeConfirmacion(montosCotizados(l.reserva, casa, privado), null));
	const c = V.cambioDeReserva({ guardadas: [{ desde: '2026-12-03', hasta: '2026-12-06' }], reservas: [otra], antes: null, despues: { id: l.id, ...datos }, propertyId: 'mx-noche', completas: true });
	assert.equal(c.choque?.id, 'r1');
	const pegada = V.cambioDeReserva({ guardadas: [], reservas: [{ ...otra, llegada: '2026-12-04', salida: '2026-12-06' }], antes: null, despues: { id: l.id, ...datos }, propertyId: 'mx-noche', completas: true });
	assert.equal(pegada.choque, null);
	assert.deepEqual(pegada.reservadas, [{ desde: '2026-12-01', hasta: '2026-12-06' }]);
	// Cancelar libera solo sus noches.
	const libre = V.cambioDeReserva({ guardadas: pegada.reservadas, reservas: [{ ...otra, llegada: '2026-12-04', salida: '2026-12-06' }, { id: l.id, ...datos }], antes: { id: l.id, ...datos }, despues: { id: l.id, ...datos, estado: 'cancelada' }, propertyId: 'mx-noche', completas: true });
	assert.deepEqual(libre.reservadas, [{ desde: '2026-12-04', hasta: '2026-12-06' }]);
});

test('ya respondida: el chat con estado o la solicitud fuera de «pendiente»', () => {
	assert.equal(yaRespondida('', undefined), false);
	assert.equal(yaRespondida('', 'pendiente'), false);
	assert.equal(yaRespondida('confirmada', 'pendiente'), true);
	assert.equal(yaRespondida('', 'no'), true);
});

test('el socio cancela hasta las 23:59 del día antes de llegar, hora de Guatemala', () => {
	// Llega el 16: el 15 a las 23:59 de Guatemala (05:59 UTC del 16) todavía; a las 00:00 (06:00 UTC) ya no.
	assert.equal(antesDeLlegar('2026-11-16', Date.parse('2026-11-16T05:59:00Z')), true);
	assert.equal(antesDeLlegar('2026-11-16', Date.parse('2026-11-16T06:00:00Z')), false);
	assert.equal(antesDeLlegar('mañana'), false);
	const reserva = { estado: 'confirmada', chat: 'TokenDelChat', llegada: '2026-11-16' };
	const chat = { estado: 'confirmada' };
	const antes = Date.parse('2026-11-16T05:00:00Z');
	assert.equal(motivoParaNoCancelar(reserva, chat, 'TokenDelChat', antes), '');
	assert.match(motivoParaNoCancelar(reserva, chat, 'TokenDelChat', Date.parse('2026-11-16T06:00:00Z')), /No me llegó/);
	assert.match(motivoParaNoCancelar(reserva, { estado: 'pagada' }, 'TokenDelChat', antes), /ya pagó/);
	assert.match(motivoParaNoCancelar(reserva, { estado: 'confirmada', comprobanteCliente: new Date() }, 'TokenDelChat', antes), /comprobante/);
	assert.match(motivoParaNoCancelar(reserva, chat, 'OtroChatInventado', antes), /de antes/);
	assert.match(motivoParaNoCancelar({ ...reserva, chat: undefined }, chat, 'TokenDelChat', antes), /de antes/);
	assert.match(motivoParaNoCancelar({ ...reserva, estado: 'cancelada' }, chat, 'TokenDelChat', antes), /ya no está confirmada/);
});

test('motivos: listas fijas (el servidor no acepta otro texto)', () => {
	assert.ok(MOTIVOS_NO.includes('Fechas no disponibles') && MOTIVOS_CANCELAR.includes('Cliente canceló'));
});

test('plazos: 24 h para responder; 48 h para pagar, a más tardar las 23:00 de la víspera; lo de antes no vence solo', () => {
	const c = Date.parse('2026-11-20T12:00:00Z');
	assert.equal(venceRespuesta(c), Date.parse('2026-11-21T12:00:00Z'));
	assert.equal(vencePago(c, '2026-12-10'), Date.parse('2026-11-22T12:00:00Z'));
	assert.equal(recordarPagoDesde(c, vencePago(c, '2026-12-10')), Date.parse('2026-11-21T12:00:00Z'));
	// Llega pasado mañana: vence a las 23:00 de la víspera (Guatemala); el recordatorio, 24 h antes.
	assert.equal(vencePago(c, '2026-11-22'), Date.parse('2026-11-22T05:00:00Z'));
	assert.equal(recordarPagoDesde(c, vencePago(c, '2026-11-22')), Date.parse('2026-11-21T05:00:00Z'));
	// Llega mañana: plazo corto, sin recordatorio (ya se le dijo al confirmar).
	assert.equal(recordarPagoDesde(c, vencePago(c, '2026-11-21')), Infinity);
	// Confirmada a última hora: no vence sola.
	assert.equal(vencePago(Date.parse('2026-11-21T04:00:00Z'), '2026-11-21'), Infinity);
	assert.equal(conPlazo(PLAZOS_DESDE - 1), false);
	assert.equal(conPlazo(PLAZOS_DESDE), true);
});

test('plazo de pago guardado: el nuevo de «No me llegó» manda; 0 = sin plazo automático; el cron se pone al día un día', () => {
	const c = Date.parse('2026-11-20T12:00:00Z');
	// Reserva de antes (sin el campo): de su createdAt.
	assert.deepEqual(plazoDePago({ llegada: '2026-12-10' }, c), { desde: c, vence: vencePago(c, '2026-12-10') });
	const nuevo = Date.parse('2026-11-25T12:00:00Z');
	assert.deepEqual(plazoDePago({ llegada: '2026-12-10', pagoDesde: nuevo, vencePago: nuevo + 48 * 3600000 }, c), { desde: nuevo, vence: nuevo + 48 * 3600000 });
	// Confirmada a última hora: se guarda 0 y se lee como «sin plazo automático».
	assert.equal(guardarVence(vencePago(Date.parse('2026-11-21T04:00:00Z'), '2026-11-21')), 0);
	assert.equal(plazoDePago({ llegada: '2026-11-21', vencePago: 0 }, c).vence, Infinity);
	// Se cancela sola: con el plazo vencido y la llegada a lo más ayer (una vuelta del cron perdida se pone al día).
	const vence = Date.parse('2026-11-23T05:00:00Z');
	assert.equal(cancelaSola(vence, '2026-11-23', Date.parse('2026-11-23T06:15:00Z')), true);
	assert.equal(cancelaSola(vence, '2026-11-23', Date.parse('2026-11-24T12:00:00Z')), true);
	assert.equal(cancelaSola(vence, '2026-11-23', Date.parse('2026-11-25T12:00:00Z')), false);
	assert.equal(cancelaSola(vence, '2026-11-23', vence - 1), false);
	assert.equal(cancelaSola(Infinity, '2026-11-23', Date.parse('2026-11-23T12:00:00Z')), false);
});

test('una solicitud aparta sus fechas mientras nadie la responde, hasta sus 24 h (la de antes de los plazos, no)', () => {
	const creada = PLAZOS_DESDE + 86400000;
	assert.equal(apartaFechas('', undefined, creada, creada + 1), true);
	assert.equal(apartaFechas('', 'pendiente', creada, venceRespuesta(creada) - 1), true);
	assert.equal(apartaFechas('', '', creada, venceRespuesta(creada)), false);
	assert.equal(apartaFechas('confirmada', '', creada, creada + 1), false);
	assert.equal(apartaFechas('', 'no', creada, creada + 1), false);
	assert.equal(apartaFechas('', '', PLAZOS_DESDE - 1, PLAZOS_DESDE), false);
});

test('la que llega encima de otra que aparta esas fechas se cierra; la anterior manda, la repetida no cuenta', () => {
	const t = PLAZOS_DESDE + 86400000;
	const a = { id: 'a', propertyId: 'c', createdAt: t, email: 'x@example.com', reserva: { codigo: 'EQ-A', llegada: '2027-01-10', salida: '2027-01-13' } };
	const b = { id: 'b', propertyId: 'c', createdAt: t + 1000, email: 'y@example.com', reserva: { codigo: 'EQ-B', llegada: '2027-01-12', salida: '2027-01-14' } };
	assert.equal(apartadaPor(b, [a, b], [], t + 2000), 'EQ-A');
	assert.equal(apartadaPor(a, [a, b], [], t + 2000), '');
	// Misma hora: manda la de id menor (a la vez, solo una queda).
	assert.equal(apartadaPor({ ...b, createdAt: t }, [a, { ...b, createdAt: t }], [], t + 1), 'EQ-A');
	// La anterior ya no aparta (respondida o vencida): la nueva sigue.
	assert.equal(apartadaPor(b, [{ ...a, solicitud: { estado: 'no' } }], [], t + 2000), '');
	assert.equal(apartadaPor(b, [a], [], venceRespuesta(t) + 1), '');
	// Salida el día de la llegada: no se cruzan.
	assert.equal(apartadaPor({ ...b, reserva: { ...b.reserva, llegada: '2027-01-13', salida: '2027-01-15' } }, [a], [], t + 2000), '');
	// El mismo cliente y las mismas fechas: es repetida, no se cierra por esto.
	assert.equal(apartadaPor({ ...a, id: 'z', createdAt: t + 5 }, [a], [], t + 10), '');
	// Encima de una reserva confirmada.
	assert.equal(apartadaPor(b, [], [{ id: 'r', propertyId: 'c', estado: 'confirmada', llegada: '2027-01-13', salida: '2027-01-15', codigo: 'EQ-R' }], t), 'EQ-R');
	assert.equal(apartadaPor(b, [], [{ id: 'r', propertyId: 'c', estado: 'cancelada', llegada: '2027-01-13', salida: '2027-01-15' }], t), '');
});

test('confirmar encima de noches de Airbnb, Booking o VRBO: el motivo en una línea', () => {
	const r = { llegada: '2027-02-01', salida: '2027-02-04' };
	assert.match(choqueExterno(r, [{ desde: '2027-02-03', hasta: '2027-02-05', fuente: 'Airbnb' }]), /ocupadas en Airbnb/);
	assert.equal(choqueExterno(r, [{ desde: '2027-02-04', hasta: '2027-02-06', fuente: 'Airbnb' }]), '');
	assert.equal(choqueExterno(r, []), '');
	assert.equal(seCruzan(r, { llegada: '2027-01-30', salida: '2027-02-01' }), false);
});

test('una reserva a mano es confirmada o cancelada: «pendiente» (de antes) se guarda confirmada solo si se elige', () => {
	assert.equal(nuevaReserva(casa, { llegada: '2026-12-01', salida: '2026-12-03', estado: 'pendiente' }).estado, 'confirmada');
	assert.equal(nuevaReserva(casa, { llegada: '2026-12-01', salida: '2026-12-03', estado: 'cancelada' }).estado, 'cancelada');
});

console.log(`Reservas (cuentas): ${ok} pruebas bien.`);
