// Pruebas de la renta vacacional (js/calc-vacacional.js). Sin dependencias: `npm run test:vacacional`.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const code = await readFile(new URL('../js/calc-vacacional.js', import.meta.url), 'utf8');
const sandbox = { module: { exports: {} }, Math, Number, String, Object, Date, isFinite, isNaN };
vm.runInNewContext(code, sandbox, { filename: 'calc-vacacional.js' });
const V = sandbox.module.exports;

let ok = 0;
function test(nombre, fn) {
	try { fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${err.stack}`); process.exitCode = 1; }
}
const igual = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);

test('noche al público = socio × (1 + 20 %)', () => {
	assert.equal(V.nochePublica(100), 120);
	assert.equal(V.nochePublica(100, 20), 120);
	assert.equal(V.nochePublica(111.11, 20), 133.33);
	assert.equal(V.nochePublica(100, 0), 100);
	assert.equal(V.nochePublica(100, ''), 120);
	assert.equal(V.nochePublica(0), 0);
});

test('«hoy» es el día de Guatemala (UTC−6), no el del servidor ni el del navegador', () => {
	assert.equal(V.hoy(Date.parse('2026-11-14T05:30:00Z')), '2026-11-13'); // 23:30 del 13 en Guatemala
	assert.equal(V.hoy(Date.parse('2026-11-14T06:00:00Z')), '2026-11-14'); // medianoche del 14 en Guatemala
	assert.match(V.hoy(), /^\d{4}-\d{2}-\d{2}$/);
});

test('desglose del panel', () => {
	const d = V.desgloseNoche(100, 20);
	assert.equal(d.precioSocio, 100);
	assert.equal(d.ganancia, 20);
	assert.equal(d.nochePublica, 120);
	assert.equal(d.iva, 14.4);
	assert.equal(d.inguat, 12);
	assert.equal(d.nocheConImpuestos, 146.4);
});

test('cotización: noches + limpieza, IVA 12 % e INGUAT 10 % sobre el subtotal, depósito aparte', () => {
	const c = V.cotizar({ nochePublica: 120, noches: 3, limpieza: 40, deposito: 200 });
	assert.equal(c.alojamiento, 360);
	assert.equal(c.subtotal, 400);
	assert.equal(c.iva, 48);
	assert.equal(c.inguat, 40);
	assert.equal(c.impuestos, 88);
	assert.equal(c.total, 488);
	assert.equal(c.deposito, 200);
});

test('cotización redondea a centavos', () => {
	const c = V.cotizar({ nochePublica: 133.33, noches: 2, limpieza: 25.5 });
	assert.equal(c.subtotal, 292.16);
	assert.equal(c.iva, 35.06);
	assert.equal(c.inguat, 29.22);
	assert.equal(c.total, 356.44);
	assert.equal(V.r2(1.005), 1.01);
});

test('sin noches no se cobra limpieza', () => {
	assert.equal(V.cotizar({ nochePublica: 120, noches: 0, limpieza: 40 }).total, 0);
});

test('noches = salida − llegada (también entre meses y años)', () => {
	assert.equal(V.nochesEntre('2026-12-30', '2027-01-02'), 3);
	assert.equal(V.nochesEntre('2026-02-27', '2026-03-01'), 2);
	assert.equal(V.nochesEntre('2026-05-05', '2026-05-05'), 0);
});

test('rango [desde, hasta) ocupa noches; la salida queda libre', () => {
	const o = V.nochesOcupadas([{ desde: '2026-11-10', hasta: '2026-11-13' }]);
	igual(Object.keys(o).sort(), ['2026-11-10', '2026-11-11', '2026-11-12']);
});

test('unir rangos que se tocan o se cruzan; descarta inválidos', () => {
	igual(V.unirRangos([
		{ desde: '2026-11-20', hasta: '2026-11-22' },
		{ desde: '2026-11-10', hasta: '2026-11-12' },
		{ desde: '2026-11-12', hasta: '2026-11-14' },
		{ desde: '2026-11-21', hasta: '2026-11-25' },
		{ desde: '2026-11-30', hasta: '2026-11-30' },
		{ desde: 'x', hasta: '2026-12-01' }
	]), [{ desde: '2026-11-10', hasta: '2026-11-14' }, { desde: '2026-11-20', hasta: '2026-11-25' }]);
});

test('validar estancia: salida de una = llegada de otra, mínimo de noches y noches ocupadas', () => {
	const ocupadas = V.nochesOcupadas([{ desde: '2026-11-10', hasta: '2026-11-13' }]);
	const base = { ocupadas, nochesMin: 2, hoy: '2026-11-01' };
	assert.equal(V.validarEstancia({ ...base, llegada: '2026-11-13', salida: '2026-11-15' }).ok, true);
	assert.equal(V.validarEstancia({ ...base, llegada: '2026-11-07', salida: '2026-11-10' }).ok, true);
	assert.equal(V.validarEstancia({ ...base, llegada: '2026-11-08', salida: '2026-11-11' }).error, 'ocupada');
	assert.equal(V.validarEstancia({ ...base, llegada: '2026-11-05', salida: '2026-11-20' }).error, 'ocupada');
	assert.equal(V.validarEstancia({ ...base, llegada: '2026-11-13', salida: '2026-11-14' }).error, 'minimo');
	assert.equal(V.validarEstancia({ ...base, llegada: '2026-11-15', salida: '2026-11-15' }).error, 'orden');
	assert.equal(V.validarEstancia({ ...base, llegada: '2026-10-20', salida: '2026-10-25' }).error, 'pasado');
	assert.equal(V.validarEstancia({ ...base, llegada: '', salida: '2026-10-25' }).error, 'fechas');
});

test('salida máxima: el primer día ocupado después de la llegada', () => {
	const ocupadas = V.nochesOcupadas([{ desde: '2026-11-10', hasta: '2026-11-13' }]);
	assert.equal(V.salidaMaxima('2026-11-05', ocupadas), '2026-11-10');
	assert.equal(V.salidaMaxima('2026-11-13', ocupadas), null);
});

test('iCal de Airbnb: fechas (DATE y DATE-TIME), líneas plegadas, sin DTEND', () => {
	const ics = [
		'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN',
		'BEGIN:VEVENT', 'DTSTAMP:20261101T120000Z', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261113',
		'SUMMARY:Reserved', 'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/AB', ' CDEF123', 'END:VEVENT',
		'BEGIN:VEVENT', 'DTSTART:20261120T150000Z', 'DTEND:20261122T110000Z', 'SUMMARY:Airbnb (Not available)', 'END:VEVENT',
		'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261201', 'END:VEVENT',
		'END:VCALENDAR'
	].join('\r\n');
	igual(V.parseICal(ics), [
		{ desde: '2026-11-10', hasta: '2026-11-13' },
		{ desde: '2026-11-20', hasta: '2026-11-22' },
		{ desde: '2026-12-01', hasta: '2026-12-02' }
	]);
	igual(V.parseICal(''), []);
});

// ---- Precio por noche (base, fin de semana, tarifas por fechas)
const planSocio = { base: 100, finde: 150, tarifas: [{ desde: '2026-12-24', hasta: '2026-12-25', precio: 200 }] };

test('precio de cada noche: tarifa por fechas > fin de semana > base', () => {
	assert.equal(V.esFinde('2026-11-06'), true);  // viernes
	assert.equal(V.esFinde('2026-11-07'), true);  // sábado
	assert.equal(V.esFinde('2026-11-08'), false); // domingo
	assert.equal(V.precioNoche('2026-11-05', planSocio), 100);
	assert.equal(V.precioNoche('2026-11-06', planSocio), 150);
	assert.equal(V.precioNoche('2026-12-25', planSocio), 200); // viernes, pero manda la tarifa
	assert.equal(V.precioNoche('2026-12-26', planSocio), 150);
	assert.equal(V.precioNoche('2026-11-06', { base: 100 }), 100); // sin precio de fin de semana
});

test('plan público: cada precio × 1.20, solo fechas y precios', () => {
	igual(V.planPublico(planSocio, 20), { base: 120, finde: 180, tarifas: [{ desde: '2026-12-24', hasta: '2026-12-25', precio: 240 }] });
	igual(V.planPublico({ base: 100, tarifas: [{ desde: '2026-12-02', hasta: '2026-12-01', precio: 5 }] }), { base: 120, finde: 0, tarifas: [] });
});

test('precio "desde" = la noche más barata', () => {
	assert.equal(V.precioDesde({ base: 120, finde: 180, tarifas: [{ desde: '2026-09-01', hasta: '2026-09-30', precio: 90 }] }), 90);
	assert.equal(V.precioDesde({ base: 120, finde: 180, tarifas: [{ desde: '2026-09-01', hasta: '2026-09-30', precio: 90 }] }, '2026-11-05'), 120);
	assert.equal(V.precioDesde({}), 0);
});

test('estancia con precios distintos: suma cada noche, limpieza sin margen, impuestos sobre el subtotal', () => {
	const pub = V.planPublico(planSocio, 20);
	// jueves 5, viernes 6, sábado 7 → 120 + 180 + 180
	const c = V.cotizarEstancia({ plan: pub, llegada: '2026-11-05', salida: '2026-11-08', limpieza: 40, deposito: 300 });
	assert.equal(c.noches, 3);
	assert.equal(c.uniforme, false);
	igual(c.detalle.map((n) => n.precio), [120, 180, 180]);
	assert.equal(c.alojamiento, 480);
	assert.equal(c.subtotal, 520);
	assert.equal(c.iva, 62.4);
	assert.equal(c.inguat, 52);
	assert.equal(c.total, 634.4);
	assert.equal(c.deposito, 300);
	const una = V.cotizarEstancia({ plan: pub, llegada: '2026-11-09', salida: '2026-11-10', limpieza: 0 });
	assert.equal(una.uniforme, true);
	assert.equal(una.noche, 120);
	assert.equal(una.total, 146.4);
});

test('ganancia = 20 % de la suma del costo del socio de todas las noches', () => {
	const g = V.gananciaEstancia({ planSocio, margen: 20, llegada: '2026-11-05', salida: '2026-11-10' });
	// jue 100, vie 150, sáb 150, dom 100, lun 100 = 600
	assert.equal(g.noches, 5);
	assert.equal(g.costoSocio, 600);
	assert.equal(g.ganancia, 120);
	assert.equal(g.alojamiento, 720);
	const una = V.gananciaEstancia({ planSocio, margen: 20, llegada: '2026-12-24', salida: '2026-12-25' });
	assert.equal(una.ganancia, 40);
});

test('mínimo de noches por fechas y recorte de rangos', () => {
	const minimos = [{ desde: '2026-12-24', hasta: '2026-12-25', noches: 3 }];
	assert.equal(V.minimoNoches('2026-12-20', '2026-12-22', 2, minimos), 2);
	assert.equal(V.minimoNoches('2026-12-25', '2026-12-26', 1, minimos), 3);
	// Salir el 24 no toca la noche del 24.
	assert.equal(V.minimoNoches('2026-12-22', '2026-12-24', 1, minimos), 1);
	const v = V.validarEstancia({ llegada: '2026-12-24', salida: '2026-12-26', minimos });
	igual([v.ok, v.error, v.minimo], [false, 'minimo', 3]);
	assert.equal(V.validarEstancia({ llegada: '2026-12-23', salida: '2026-12-26', minimos }).ok, true);
	igual(V.quitarRango([{ desde: '2026-12-01', hasta: '2026-12-10', precio: 5 }, { desde: '2027-01-01', hasta: '2027-01-02', precio: 9 }], '2026-12-04', '2026-12-05'),
		[{ desde: '2026-12-01', hasta: '2026-12-03', precio: 5 }, { desde: '2026-12-06', hasta: '2026-12-10', precio: 5 }, { desde: '2027-01-01', hasta: '2027-01-02', precio: 9 }]);
	igual(V.quitarRango([{ desde: '2026-12-04', hasta: '2026-12-05' }], '2026-12-01', '2026-12-31'), []);
	// Cancelar del 4 al 6 libera las noches del 4 y del 5; el resto sigue ocupado.
	igual(V.liberarNoches([{ desde: '2026-12-01', hasta: '2026-12-10' }], '2026-12-04', '2026-12-06'),
		[{ desde: '2026-12-01', hasta: '2026-12-04' }, { desde: '2026-12-06', hasta: '2026-12-10' }]);
});

test('reservas: choques, fechas bloqueadas y estado de cuenta', () => {
	const r = (id, llegada, salida, extra = {}) => ({ id, propertyId: 'casa1', llegada, salida, estado: 'confirmada', costoSocio: 300, alojamiento: 360, moneda: 'USD', ...extra });
	const lista = [r('a', '2026-12-01', '2026-12-04'), r('b', '2026-12-04', '2026-12-06', { pagadoSocio: true }),
		r('c', '2026-12-10', '2026-12-12', { estado: 'pendiente' }), r('d', '2026-12-02', '2026-12-03', { propertyId: 'casa2', moneda: 'GTQ' })];
	// La salida de una es la llegada de otra: no chocan.
	igual(V.choquesReserva(r('x', '2026-12-04', '2026-12-05'), lista).map((x) => x.id), ['b']);
	igual(V.choquesReserva(r('x', '2026-12-06', '2026-12-11'), lista), []);
	igual(V.choquesReserva(lista[0], lista), []);
	igual(V.rangosReservados(lista, 'casa1'), [{ desde: '2026-12-01', hasta: '2026-12-06' }]);
	igual(V.resumenReservas(lista), { reservas: 3, noches: 6, porMoneda: {
		USD: { costoSocio: 600, pagado: 300, porPagar: 300, ganancia: 120 },
		GTQ: { costoSocio: 300, pagado: 0, porPagar: 300, ganancia: 60 } } });
});

test('reservas: un cambio recalcula las fechas desde las reservas, no desde una lista vieja', () => {
	const r = (id, llegada, salida, extra = {}) => ({ id, propertyId: 'casa1', llegada, salida, estado: 'confirmada', ...extra });
	const a = r('a', '2026-12-01', '2026-12-04'), b = r('b', '2026-12-10', '2026-12-12');
	const guardadas = [{ desde: '2026-12-01', hasta: '2026-12-04' }, { desde: '2026-12-10', hasta: '2026-12-12' }];
	// Administrador (las ve todas): cancelar «a» deja solo «b», aunque lo guardado traiga algo de más.
	const cancelada = { ...a, estado: 'cancelada' };
	igual(V.cambioDeReserva({ guardadas: [...guardadas, { desde: '2026-12-20', hasta: '2026-12-22' }], reservas: [a, b], antes: a, despues: cancelada, propertyId: 'casa1', completas: true }).reservadas,
		[{ desde: '2026-12-10', hasta: '2026-12-12' }]);
	// Una pestaña vieja (todavía cree confirmada a «a», ya cancelada) crea «c»: «a» no revive.
	const c = r('c', '2026-12-05', '2026-12-07');
	igual(V.cambioDeReserva({ guardadas: [{ desde: '2026-12-10', hasta: '2026-12-12' }], reservas: [cancelada, b], antes: null, despues: c, propertyId: 'casa1', completas: true }).reservadas,
		[{ desde: '2026-12-05', hasta: '2026-12-07' }, { desde: '2026-12-10', hasta: '2026-12-12' }]);
	// El socio no ve una reserva de antes (sin propietarioId) del 20 al 22: cancelar «a» no la libera.
	const conAjena = [...guardadas, { desde: '2026-12-20', hasta: '2026-12-22' }];
	igual(V.cambioDeReserva({ guardadas: conAjena, reservas: [a, b], antes: a, despues: cancelada, propertyId: 'casa1' }).reservadas,
		[{ desde: '2026-12-10', hasta: '2026-12-12' }, { desde: '2026-12-20', hasta: '2026-12-22' }]);
	// ... ni deja reservar encima de ella.
	igual(V.cambioDeReserva({ guardadas: conAjena, reservas: [a, b], antes: null, despues: r('d', '2026-12-21', '2026-12-23'), propertyId: 'casa1' }).choque,
		{ llegada: '2026-12-20', salida: '2026-12-22' });
	// Choque con una reserva confirmada (la salida de una es la llegada de otra: no chocan).
	assert.equal(V.cambioDeReserva({ guardadas, reservas: [a, b], antes: null, despues: r('e', '2026-12-03', '2026-12-05'), propertyId: 'casa1', completas: true }).choque.id, 'a');
	assert.equal(V.cambioDeReserva({ guardadas, reservas: [a, b], antes: null, despues: r('e', '2026-12-04', '2026-12-10'), propertyId: 'casa1', completas: true }).choque, null);
	// Editar las fechas de «a»: no choca consigo misma y libera las de antes.
	const movida = { ...a, llegada: '2026-12-02', salida: '2026-12-06' };
	const x = V.cambioDeReserva({ guardadas, reservas: [a, b], antes: a, despues: movida, propertyId: 'casa1' });
	igual([x.reservadas, x.choque], [[{ desde: '2026-12-02', hasta: '2026-12-06' }, { desde: '2026-12-10', hasta: '2026-12-12' }], null]);
	// Pasa a otra casa: en la de antes se libera; una pendiente no ocupa fechas.
	igual(V.cambioDeReserva({ guardadas, reservas: [a, b], antes: a, despues: { ...a, propertyId: 'casa2' }, propertyId: 'casa1' }).reservadas, [{ desde: '2026-12-10', hasta: '2026-12-12' }]);
	igual(V.cambioDeReserva({ guardadas: [], reservas: [], antes: null, despues: r('p', '2026-12-01', '2026-12-03', { estado: 'pendiente' }), propertyId: 'casa1', completas: true }), { reservadas: [], choque: null });
	// Borrar: deja de estar en la lista.
	igual(V.cambioDeReserva({ guardadas, reservas: [a, b], antes: b, despues: null, propertyId: 'casa1', completas: true }).reservadas, [{ desde: '2026-12-01', hasta: '2026-12-04' }]);
});

test('alertas de solicitudes: sin responder, comisión +72 h y fechas bloqueadas', () => {
	const gt = (fecha, hora) => Date.parse(`${fecha}T${hora}:00-06:00`);
	const f = { llegada: '2026-12-10', salida: '2026-12-12' };
	const creado = gt('2026-12-01', '08:00');
	assert.equal(V.alertaSolicitud('pendiente', creado, f, null, [], gt('2026-12-01', '10:00')), '');
	assert.equal(V.alertaSolicitud('pendiente', creado, f, null, [], gt('2026-12-01', '10:01')), 'tarde');
	const res = { estado: 'confirmada', comision: { monto: 50, vence: '2026-12-10', pagada: false } };
	assert.equal(V.alertaSolicitud('confirmada', creado, f, res, [], gt('2026-12-13', '23:59')), '');
	assert.equal(V.alertaSolicitud('confirmada', creado, f, res, [], gt('2026-12-14', '00:00')), 'mora');
	assert.equal(V.alertaSolicitud('confirmada', creado, f, undefined, [], gt('2027-01-01', '00:00')), '');
	// La salida no ocupa noche: un bloqueo que empieza ese día no cuenta.
	assert.equal(V.alertaSolicitud('no', creado, f, null, [{ desde: '2026-12-12', hasta: '2026-12-14' }], 0), '');
	assert.equal(V.alertaSolicitud('no', creado, f, null, [{ desde: '2026-12-11', hasta: '2026-12-14' }], 0), 'bloqueada');
	assert.equal(V.alertaSolicitud('cancelada', creado, f, null, [{ desde: '2026-12-11', hasta: '2026-12-14' }], 0), '');
});

test('comisión: al día, vencida, +24 h (desvío) y +72 h (fuera del sitio)', () => {
	const r = (extra = {}, comision = {}) => ({ estado: 'confirmada', propietarioId: 's1', comision: { monto: 50, vence: '2026-12-10', pagada: false, ...comision }, ...extra });
	const gt = (fecha, hora) => Date.parse(`${fecha}T${hora}:00-06:00`);
	// Tiene todo el día de llegada para pagar.
	assert.equal(V.nivelComision(r(), gt('2026-12-10', '23:59')), 0);
	assert.equal(V.nivelComision(r(), gt('2026-12-11', '00:00')), 1);
	assert.equal(V.nivelComision(r(), gt('2026-12-12', '00:00')), 2);
	assert.equal(V.nivelComision(r(), gt('2026-12-13', '23:59')), 2);
	assert.equal(V.nivelComision(r(), gt('2026-12-14', '00:00')), 3);
	// Pagada, cancelada o sin comisión: nada que cobrar.
	assert.equal(V.nivelComision(r({}, { pagada: true }), gt('2027-01-01', '00:00')), 0);
	assert.equal(V.nivelComision(r({ estado: 'cancelada' }), gt('2027-01-01', '00:00')), 0);
	assert.equal(V.nivelComision(r({}, { monto: 0 }), gt('2027-01-01', '00:00')), 0);
	assert.equal(V.nivelComision({ estado: 'confirmada' }, gt('2027-01-01', '00:00')), 0);
	// Por socio queda el peor atraso; el que está al día o apenas vencido no aparece.
	igual(V.sociosEnMora([r(), r({}, { vence: '2026-12-12' }), r({ propietarioId: 's2' }, { vence: '2026-12-12' }), r({ propietarioId: 's3' }, { vence: '2026-12-13' })],
		gt('2026-12-14', '08:00')), { s1: 3, s2: 2 });
});

const { pausados } = await import('../netlify/lib/comisiones.mjs');
const { nNoches } = await import('../admin/js/formato.js');
test('pausados.txt: solo los socios con más de 72 h de atraso, en orden', () => {
	assert.equal(pausados({ s2: 3, s1: 3, s3: 2 }), 's1,s2');
	assert.equal(pausados({ s3: 2 }), '');
	assert.equal(pausados({}), '');
});
test('«1 noche», «3 noches»', () => {
	assert.equal(nNoches(1), '1 noche');
	assert.equal(nNoches(3), '3 noches');
});
test('chat: bloquea teléfonos, correos y enlaces; deja pasar fechas, horas y montos', () => {
	for (const t of ['mi número es 5555-1234', 'llamame al 55 55 12 34', '+502 5913 1276', '5 5 5 5 1 2 3 4', 'cinco cinco cinco cinco uno dos tres cuatro',
		'escribime a ana@correo.com', 'ana arroba gmail', 'mirá wa.me/50255551234', 'https://ejemplo.gt/casa', 'www.micasa.com', 'cinco5cinco5 1234'])
		assert.equal(V.tieneContacto(t), true, t);
	for (const t of ['Llegamos el 16/11/2026 a las 15:00', '¿Aceptan 2 perros?', 'Somos 8 adultos y 2 niños', 'El total es US$ 1,122.40, ¿correcto?',
		'del 16 al 20 de noviembre de 2026', 'Código EQ-J2XLVP', '¿La casa está a 45 min de la capital? Son 2 km de terracería', 'Q 3500.00 por 4 noches', ''])
		assert.equal(V.tieneContacto(t), false, t);
});

const { mascotasUnaVez, amenidadesPara } = await import('../admin/js/estados.js');
test('mascotas: en una casa por noche se dicen una sola vez, en el selector', () => {
	const a = mascotasUnaVez({ operacion: 'vacacional', amenidades: ['Piscina', 'Acepta mascotas'], en: { amenidades: ['Pool', 'Pets allowed'] } });
	assert.deepEqual([a.amenidades, a.en.amenidades, a.vacacional.mascotas], [['Piscina'], ['Pool'], 'si']);
	// Lo que diga el selector manda; una casa en venta no se toca.
	assert.equal(mascotasUnaVez({ operacion: 'vacacional', amenidades: ['Pet friendly'], vacacional: { mascotas: 'no' } }).vacacional.mascotas, 'no');
	assert.deepEqual(mascotasUnaVez({ operacion: 'venta', amenidades: ['Acepta mascotas'] }).amenidades, ['Acepta mascotas']);
	assert.equal(amenidadesPara('vacacional').includes('Acepta mascotas'), false);
	assert.equal(amenidadesPara('venta').includes('Acepta mascotas'), true);
});

const { incoherencia } = await import('../admin/js/estados.js');
test('estado y tipo según la operación: lo que no aplica se nombra, lo que aplica pasa', () => {
	assert.match(incoherencia({ operacion: 'vacacional', estado: 'vendida' }), /no aplica a una casa por noche/);
	assert.match(incoherencia({ operacion: 'venta', estado: 'rentada' }), /no aplica a una casa en venta/);
	assert.match(incoherencia({ operacion: 'vacacional', tipo: 'terreno' }), /no se renta por noche/);
	for (const c of [{ operacion: 'vacacional', estado: 'pausada', tipo: 'casa' }, { operacion: 'venta', estado: 'vendida', tipo: 'terreno' }, { operacion: 'renta', estado: 'rentada' }, {}])
		assert.equal(incoherencia(c), '', JSON.stringify(c));
});

test('subtotal desde el total: nunca por debajo del cotizado (1 a 5,000 al centavo, de 7 en 7)', () => {
	for (let c = 100; c <= 500000; c += 7) {
		const sub = c / 100, q = V.cotizar({ precios: [sub] });
		const s2 = V.subtotalDeTotal(q.total);
		assert.ok(s2 >= q.subtotal && s2 - q.subtotal <= 0.02, `${q.subtotal} → ${q.total} → ${s2}`);
	}
});

console.log(`\n${ok} pruebas correctas${process.exitCode ? ' (con fallas)' : ''}.`);
