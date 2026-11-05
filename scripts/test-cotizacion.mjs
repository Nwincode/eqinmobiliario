// Pruebas de la cotización de servicios (admin/js/cotizacion.js). Sin dependencias: `npm run test:cotizacion`.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
	mesesArrendamiento, pctTodoIncluido, factorTodoIncluido, desglose, calcularLinea, calcularCotizacion,
	textoWhatsApp, dinero, venceEl, numeroCotizacion
} from '../admin/js/cotizacion.js';

let ok = 0;
async function test(nombre, fn) {
	try { await fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${err.stack}`); process.exitCode = 1; }
}
const cerca = (a, b, tol = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} esperado ${b}, salió ${a}`);

await test('porcentaje todo incluido: 5 % → 5.6 % (general) y 5.263 % (pequeño contribuyente)', () => {
	cerca(pctTodoIncluido(5, 'general'), 5.6);
	cerca(Math.round(pctTodoIncluido(5, 'pequeno') * 1000) / 1000, 5.263);
	cerca(factorTodoIncluido('pequeno') * 0.95, 1);
});

await test('escala de arrendamiento en rentas', () => {
	for (const [anios, meses] of [[0, 0], [1, 1], [3, 3], [5, 5], [6, 5.5], [10, 7.5], [11, 7.5 + 1 / 3], [30, 7.5 + 20 / 3], [2.5, 2.5], [7.5, 6.25]]) {
		cerca(mesesArrendamiento(anios), meses, 1e-9, `${anios} años:`);
	}
	cerca(Math.round(mesesArrendamiento(30) * 100) / 100, 14.17);
});

await test('la escala es la misma que la de la calculadora de renta (js/calc-renta.js)', async () => {
	const code = await readFile(new URL('../js/calc-renta.js', import.meta.url), 'utf8');
	const sb = { module: { exports: {} }, Intl, Math, Number, String, Object, isFinite };
	vm.runInNewContext(code, sb, { filename: 'calc-renta.js' });
	if (typeof sb.module.exports.mesesComision !== 'function') return; // si la otra calculadora cambia, esta prueba no aplica
	for (let a = 0; a <= 30; a += 0.5) cerca(mesesArrendamiento(a), sb.module.exports.mesesComision(a), 1e-9, `${a} años:`);
});

await test('venta de US$ 200,000, régimen general: US$ 11,200 total, US$ 1,200 de IVA', () => {
	const l = calcularLinea({ tipo: 'compraventa', moneda: 'USD', precio: 200000, pct: 5 }, 'general', 'todo');
	assert.equal(l.honorario, 10000);
	assert.equal(l.impuesto, 1200);
	assert.equal(l.total, 11200);
	const s = calcularLinea({ tipo: 'compraventa', moneda: 'USD', precio: 200000, pct: 5 }, 'general', 'separado');
	assert.equal(s.total, 11200);
	assert.equal(s.impuesto, 1200);
});

await test('venta de US$ 200,000, pequeño contribuyente todo incluido: US$ 10,526.32 y el impuesto es el 5 % del total', () => {
	const l = calcularLinea({ tipo: 'compraventa', moneda: 'USD', precio: 200000, pct: 5 }, 'pequeno', 'todo');
	assert.equal(l.total, 10526.32);
	assert.equal(l.impuesto, 526.32);
	cerca(l.impuesto, Math.round(l.total * 5) / 100, 0.005);
	cerca(l.neto, 10000, 0.005, 'el emisor recibe el honorario:');
	assert.equal(dinero(l.total, 'USD'), 'US$ 10,526.32');
});

await test('pequeño contribuyente «Honorario + IVA»: el honorario es el precio final', () => {
	const d = desglose(10000, 'pequeno', 'separado');
	assert.equal(d.total, 10000);
	assert.equal(d.impuesto, 500);
	assert.equal(d.neto, 9500);
});

await test('arrendamiento: 3 años de US$ 1,000 = 3 rentas = US$ 3,000 + IVA', () => {
	const l = calcularLinea({ tipo: 'arrendamiento', moneda: 'USD', renta: 1000, anios: 3 }, 'general', 'separado');
	assert.equal(l.meses, 3);
	assert.equal(l.honorario, 3000);
	assert.equal(l.total, 3360);
	assert.match(l.detalle, /Contrato de 3 años = 3 rentas/);
	const diez = calcularLinea({ tipo: 'arrendamiento', moneda: 'GTQ', renta: 8000, anios: 10 }, 'general', 'separado');
	assert.equal(diez.honorario, 60000);
});

await test('totales por moneda y lo mensual aparte', () => {
	const r = calcularCotizacion({ regimen: 'general', modo: 'todo', lineas: [
		{ tipo: 'compraventa', moneda: 'USD', precio: 200000, pct: 5 },
		{ tipo: 'arrendamiento', moneda: 'USD', renta: 1000, anios: 1 },
		{ tipo: 'administracion', moneda: 'GTQ', renta: 10000, pct: 10 },
		{ tipo: 'otro', moneda: 'GTQ', descripcion: 'Avalúo', monto: 1500 },
		{ tipo: 'compraventa', moneda: 'USD', precio: '' } // sin datos: no suma
	] });
	assert.deepEqual(r.totales.map((t) => [t.moneda, t.mensual, t.total]), [['USD', false, 12320], ['GTQ', false, 1680], ['GTQ', true, 1120]]);
});

await test('texto para WhatsApp y vigencia', () => {
	const t = textoWhatsApp({ numero: 'COT-1', fecha: '2026-11-05', vigenciaDias: 15, regimen: 'pequeno', modo: 'todo', emisor: { nombre: 'Equipo Inmobiliario' }, cliente: { nombre: 'Ana López' },
		lineas: [{ tipo: 'compraventa', moneda: 'USD', precio: 200000, pct: 5 }] });
	assert.match(t, /^Hola Ana/);
	assert.match(t, /\*Total: US\$ 10,526\.32\*/);
	assert.match(t, /pequeño contribuyente/);
	assert.equal(venceEl('2026-11-05', 15), '2026-11-20');
	assert.match(numeroCotizacion(new Date(2026, 10, 5, 9, 7)), /^COT-20261105-0907$/);
});

console.log(`\n${ok} pruebas correctas${process.exitCode ? ', con fallas' : ''}.`);
