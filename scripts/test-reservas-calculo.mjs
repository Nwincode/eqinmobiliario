// Pruebas de las cuentas de las reservas (admin/js/reservas-calculo.js), las mismas que usan el panel y el servidor
// (netlify/functions/reservas.mjs). Sin red: `node scripts/test-reservas-calculo.mjs`.
// Los números de las reservas de prueba son los de scripts/emulador/test-reglas.mjs (lead-res-noche, lead-res-cara):
// con este módulo dan lo mismo que daba el panel antes de moverlo.
import assert from 'node:assert/strict';
import { venceRespuesta, vencePago, recordarPagoDesde, conPlazo, PLAZOS_DESDE } from '../admin/js/reservas-calculo.js';
import '../js/calc-vacacional.js';
import { nuevaReserva, comisionDeReserva, cuentaDe, subtotalCotizado, montosDeConfirmacion, difierenMontos, reservaDeSolicitud, yaRespondida, antesDeLlegar,
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

test('reserva de prueba lead-res-noche: su parte 300, lo cobrado 360, ganancia y comisión 60 (lo que exigía la regla)', () => {
	const l = solicitud(360);
	const { datos, montos } = reservaDeSolicitud(l, cuentaDe(l.reserva, privado), casa, { chat: 'ChatDeLaReservaRNLargoYAlAzar1' });
	assert.deepEqual(datos, { propertyId: 'mx-noche', propertyTitulo: 'Casa por noche', agentId: '', propietarioId: 'm1', moneda: 'USD', llegada: '2026-12-01', salida: '2026-12-04', noches: 3,
		huesped: 'Ana', canal: 'web', estado: 'confirmada', leadId: 'lead-res-noche', codigo: 'EQ-RN', chat: 'ChatDeLaReservaRNLargoYAlAzar1', costoSocio: 300, alojamiento: 360, ganancia: 60,
		pagadoSocio: false, pagadoFecha: '', comision: { monto: 60, vence: '2026-12-01', pagada: false } });
	assert.equal(montos.cotizado, 360);
	assert.equal(montos.deHoy, 360);
	assert.equal(difierenMontos(montos), false);
});

test('cotizado contra precios de hoy: el socio registra el mayor; el administrador elige', () => {
	// lead-res-cara: se le cotizaron US$ 500 (un precio especial puesto después dejó la noche en 120 al público).
	const cara = solicitud(500);
	const c = cuentaDe(cara.reserva, privado);
	const mayor = montosDeConfirmacion(cara, c, casa);
	assert.deepEqual([mayor.alojamiento, mayor.ganancia, mayor.gananciaCotizada, mayor.hoy], [500, 200, 200, 60]);
	assert.equal(difierenMontos(mayor), true);
	assert.equal(montosDeConfirmacion(cara, c, casa, 'hoy').alojamiento, 360);
	assert.equal(montosDeConfirmacion(cara, c, casa, 'cotizado').alojamiento, 500);
	// Lo cotizado menor que hoy (subió un precio): el socio registra lo de hoy; el administrador puede registrar lo cotizado.
	const barata = solicitud(330);
	assert.equal(montosDeConfirmacion(barata, c, casa).alojamiento, 360);
	assert.equal(montosDeConfirmacion(barata, c, casa, 'cotizado').ganancia, 30);
	// La limpieza no lleva margen: se resta de lo cotizado.
	assert.equal(montosDeConfirmacion(solicitud(460), c, { vacacional: { limpieza: 100 } }).cotizado, 360);
	// Sin nada cotizado, «cotizado» cae a lo de hoy (nunca a 0).
	assert.equal(montosDeConfirmacion(solicitud(0), c, casa, 'cotizado').alojamiento, 360);
	// 1 % o menos de diferencia no se pregunta.
	assert.equal(difierenMontos(montosDeConfirmacion(solicitud(363), c, casa)), false);
	assert.equal(difierenMontos(montosDeConfirmacion(solicitud(364), c, casa)), true);
});

test('subtotal cotizado: el de la solicitud, o sacado del total que vio el cliente (chats de antes)', () => {
	assert.equal(subtotalCotizado({ subtotal: 920, total: 1 }), 920);
	assert.equal(subtotalCotizado({ total: 439.2 }), 360);
	assert.equal(subtotalCotizado({ total: 1122.4 }), 920);
});

test('reserva a mano y comisión: lo de siempre', () => {
	const r = nuevaReserva(casa, { llegada: '2026-12-01', salida: '2026-12-03', costoSocio: '200', alojamiento: 240.004, huesped: '  Luis ' });
	assert.deepEqual([r.noches, r.costoSocio, r.alojamiento, r.ganancia, r.huesped, r.canal, r.estado, 'chat' in r], [2, 200, 240, 40, 'Luis', 'directo', 'confirmada', false]);
	assert.deepEqual(comisionDeReserva({ ganancia: 40, llegada: '2026-12-01' }, { pagada: true, comprobante: 'x' }), { pagada: true, comprobante: 'x', monto: 40, vence: '2026-12-01' });
});

test('las fechas de la casa al confirmar: choque con otra confirmada y la salida libre para la siguiente', () => {
	const otra = { id: 'r1', propertyId: 'mx-noche', estado: 'confirmada', llegada: '2026-12-03', salida: '2026-12-06' };
	const l = solicitud(360);
	const { datos } = reservaDeSolicitud(l, cuentaDe(l.reserva, privado), casa);
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
	assert.match(motivoParaNoCancelar(reserva, chat, 'TokenDelChat', Date.parse('2026-11-16T06:00:00Z')), /día de llegada/);
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
	assert.equal(recordarPagoDesde(c, '2026-12-10'), Date.parse('2026-11-21T12:00:00Z'));
	// Llega pasado mañana: vence a las 23:00 de la víspera (Guatemala); el recordatorio, 24 h antes.
	assert.equal(vencePago(c, '2026-11-22'), Date.parse('2026-11-22T05:00:00Z'));
	assert.equal(recordarPagoDesde(c, '2026-11-22'), Date.parse('2026-11-21T05:00:00Z'));
	// Llega mañana: plazo corto, sin recordatorio (ya se le dijo al confirmar).
	assert.equal(recordarPagoDesde(c, '2026-11-21'), Infinity);
	// Confirmada a última hora: no vence sola.
	assert.equal(vencePago(Date.parse('2026-11-21T04:00:00Z'), '2026-11-21'), Infinity);
	assert.equal(conPlazo(PLAZOS_DESDE - 1), false);
	assert.equal(conPlazo(PLAZOS_DESDE), true);
});

console.log(`Reservas (cuentas): ${ok} pruebas bien.`);
