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

console.log(`\n${ok} pruebas correctas${process.exitCode ? ' (con fallas)' : ''}.`);
