// Pruebas de la calculadora de renta (js/calc-renta.js). Sin dependencias: `npm run test:renta`.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// El motor es un script clásico: se ejecuta con un `module` propio para leer module.exports.
const code = await readFile(new URL('../js/calc-renta.js', import.meta.url), 'utf8');
const sandbox = { module: { exports: {} }, Intl, Math, Number, String, Object, isFinite };
vm.runInNewContext(code, sandbox, { filename: 'calc-renta.js' });
const R = sandbox.module.exports;

let ok = 0;
function test(nombre, fn) {
	try { fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${err.stack}`); process.exitCode = 1; }
}
const cerca = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} esperado ${b}, salió ${a}`);

const base = { precio: 200000, moneda: 'USD', rentaMensual: 1200, uso: 'habitacional', regimenISR: 'capital', vacancia: 5, gastosOperativos: 10 };

test('caso base habitacional, rentas de capital', () => {
	const r = R.calcular(base);
	cerca(r.anio1.cobrado, 13680, 1e-9, 'cobrado');
	cerca(r.anio1.opex, 1368, 1e-9, 'opex');
	cerca(r.anio1.iusi, 0, 1e-12, 'iusi');
	cerca(r.anio1.isr, 957.6, 1e-9, 'isr');
	cerca(r.anio1.neto, 11354.4, 1e-9, 'neto');
	cerca(r.rendimientoNeto * 100, 5.6772, 1e-9, 'rendimiento neto');
	cerca(r.rendimientoBruto * 100, 7.2, 1e-9, 'rendimiento bruto');
	cerca(r.netoMensual, 946.2, 1e-9, 'neto mensual');
	assert.equal(r.entradas.regimenIVA, 'exento');
	assert.equal(r.anios.length, 30);
	assert.ok(r.tir > 0.05 && r.tir < 0.12, `TIR razonable: ${r.tir}`);
});

test('crecimiento de renta y reversión', () => {
	// Sin el ISR de la venta: la reversión pasa entera al flujo (el impuesto se prueba aparte).
	const r = R.calcular({ ...base, crecimientoRenta: 3, plazo: 10, capSalida: 6, costosVenta: 5, restarImpuestoVenta: false });
	cerca(r.anios[1].pgi, 14400 * 1.03, 1e-9, 'PGI año 2');
	const noi11 = 14400 * 1.03 ** 10 * 0.95 * 0.9;
	cerca(r.reversion, noi11 / 0.06 * 0.95, 1e-6, 'reversión');
	cerca(r.flujos[10], r.anios[9].neto + r.reversion, 1e-9, 'último flujo');
	cerca(r.flujos[0], -200000, 0, 'año 0');
});

test('venta: ISR sobre la ganancia de capital (cálculo a mano)', () => {
	// NOI año 11 = 14,400 × 1.03^10 × 0.95 × 0.90 = 16,546.30 → precio 275,771.64 → menos 5 % = 261,983.06.
	// Ganancia = 261,983.06 − 200,000 = 61,983.06 → ISR 10 % = 6,198.31.
	const r = R.calcular({ ...base, crecimientoRenta: 3, plazo: 10, capSalida: 6, costosVenta: 5 });
	const v = r.venta;
	cerca(v.noiSalida, 16546.2985, 1e-3, 'NOI salida');
	cerca(v.precioVenta, 275771.64, 0.01, 'precio de venta');
	cerca(v.costosVenta, 13788.58, 0.01, 'costos de venta');
	cerca(v.ingresoNeto, 261983.06, 0.01, 'ingreso neto');
	cerca(v.costoAdquisicion, 200000, 1e-9, 'costo de adquisición');
	cerca(v.ganancia, 61983.06, 0.01, 'ganancia');
	assert.equal(v.tasa, 10);
	cerca(v.impuesto, 6198.31, 0.01, 'ISR de la venta');
	cerca(v.neta, 255784.75, 0.01, 'lo que queda');
	cerca(r.reversion, v.ingresoNeto, 1e-9, 'reversion = ingreso neto antes del ISR');
	cerca(r.flujos[10], r.anios[9].neto + v.neta, 1e-9, 'el flujo usa la venta después del impuesto');
	const sin = R.calcular({ ...base, crecimientoRenta: 3, plazo: 10, capSalida: 6, costosVenta: 5, restarImpuestoVenta: false });
	assert.ok(r.tir < sin.tir, 'el impuesto baja la TIR');
	cerca(r.tirSinImpuestoVenta, sin.tir, 1e-9, 'TIR de comparación');
	cerca(sin.venta.impuestoCalculado, v.impuesto, 1e-9, 'se calcula aunque no se reste');
	assert.equal(sin.venta.impuesto, 0);
	// El parámetro cambia la tasa.
	cerca(R.calcular({ ...base, crecimientoRenta: 3, plazo: 10, capSalida: 6, costosVenta: 5 }, { isrGananciaCapital: 5 }).venta.impuesto, 3099.153, 1e-3);
});

test('venta: costos de compra, mejoras, utilidades y sin ganancia', () => {
	const c = { ...base, crecimientoRenta: 3, plazo: 10, capSalida: 6, costosVenta: 5 };
	// Costos de compra 2 % y reserva 5 %: suben la inversión y el costo de adquisición.
	const r = R.calcular({ ...c, costosCompra: 2, reservaCapex: 5 });
	cerca(r.inversion, 204000, 1e-9);
	cerca(r.flujos[0], -204000, 1e-9, 'año 0 con costos de compra');
	const capex = r.anios.reduce((s, a) => s + a.capex, 0);
	cerca(r.venta.mejoras, capex, 1e-9);
	cerca(r.venta.costoAdquisicion, 204000 + capex, 1e-9);
	cerca(r.venta.ganancia, r.venta.ingresoNeto - 204000 - capex, 1e-9);
	cerca(R.calcular({ ...c, costosCompra: 2, reservaCapex: 5, capexSumaAlCosto: false }).venta.costoAdquisicion, 204000, 1e-9);
	// Utilidades: 25 % y se resta la depreciación ya deducida (2 % × 10 años = 40,000).
	const u = R.calcular({ ...c, regimenISR: 'utilidades', depreciacion: 2 });
	cerca(u.venta.depreciacionAcumulada, 40000, 1e-9);
	cerca(u.venta.ganancia, 261983.06 - 160000, 0.01);
	cerca(u.venta.impuesto, (261983.06 - 160000) * 0.25, 0.01);
	// La depreciación no pasa del precio.
	const d = R.calcular({ ...base, regimenISR: 'utilidades', depreciacion: 10, plazo: 30 });
	cerca(d.venta.depreciacionAcumulada, 200000, 1e-6);
	assert.equal(d.anios[10].depreciacion, 0, 'año 11 ya sin depreciación');
	// Sin ganancia, no hay impuesto.
	const p = R.calcular({ ...c, capSalida: 20 });
	assert.ok(p.venta.ganancia < 0);
	assert.equal(p.venta.impuesto, 0);
});

test('cascadas: el estado de resultados cuadra', () => {
	const suma = (filas) => filas.filter((f) => f.tipo === 'ingreso' || f.tipo === 'resta').reduce((s, f) => s + f.monto, 0);
	for (const caso of [base, { ...base, uso: 'comercial' }, { ...base, regimenIVA: 'pequeno', reservaCapex: 5 }, { ...base, regimenISR: 'utilidades', depreciacion: 2 }]) {
		const r = R.calcular(caso);
		const c = R.cascadaAnio(r, 1);
		const total = c.find((f) => f.tipo === 'total');
		cerca(total.monto, r.anio1.neto, 1e-9, 'total = neto');
		cerca(suma(c), r.anio1.neto, 1e-9, 'la suma de ingresos y restas da el neto');
		cerca(c.find((f) => f.clave === 'noi').monto, r.anio1.noi, 1e-9);
		cerca(c[0].pct, 1, 1e-12, 'la renta bruta es el 100 %');
		cerca(total.mensual, r.netoMensual, 1e-9);
		const c5 = R.cascadaAnio(r, 5);
		cerca(c5.find((f) => f.tipo === 'total').monto, r.anios[4].neto, 1e-9, 'año 5');
		const v = R.cascadaVenta(r);
		cerca(suma(v), r.venta.neta, 1e-9, 'venta cuadra');
		const s = R.cascadaResumen(r);
		cerca(suma(s), r.gananciaTotal, 1e-6, 'resumen cuadra');
		cerca(r.gananciaTotal, r.flujos.reduce((a, b) => a + b, 0), 1e-6, 'ganancia total = suma de flujos');
		const g = R.cascadaGanancia(r);
		cerca(g.find((f) => f.clave === 'ganancia').monto, r.venta.ganancia, 1e-9);
	}
	const com = R.cascadaAnio(R.calcular({ ...base, uso: 'comercial' }), 1);
	const info = com.find((f) => f.clave === 'ivaInquilino');
	assert.equal(info.tipo, 'info');
	cerca(info.monto, 13680 * 0.12, 1e-9);
	assert.ok(!R.cascadaAnio(R.calcular(base), 1).some((f) => f.clave === 'ivaPropietario'), 'IVA del dueño solo en pequeño contribuyente');
	const r = R.calcular(base);
	cerca(r.multiplo, (r.recibido) / 200000, 1e-12);
});

test('IUSI comercial: la tasa del tramo va sobre todo el valor', () => {
	assert.equal(R.tasaIusi('comercial', 2000), 0);
	assert.equal(R.tasaIusi('comercial', 2000.01), 3);
	assert.equal(R.tasaIusi('comercial', 20000), 3);
	assert.equal(R.tasaIusi('comercial', 50000), 6);
	assert.equal(R.tasaIusi('comercial', 70000.01), 9);
	assert.equal(R.tasaIusi('habitacional', 5e6), 0);
	assert.equal(R.tasaIusi('mixto', 5e6), 0);
	// US$ 200,000 × 7.7 = Q 1,540,000 → 9 ‰ = Q 13,860 al año = US$ 1,800.
	const r = R.calcular({ ...base, uso: 'comercial' });
	cerca(r.valorFiscalQ, 1540000, 1e-6);
	assert.equal(r.iusiTasaMil, 9);
	cerca(r.anio1.iusi, 1800, 1e-9, 'IUSI anual');
	assert.equal(r.entradas.regimenIVA, 'general');
	cerca(r.anio1.ivaInquilino, 13680 * 0.12, 1e-9, 'IVA que cobra al inquilino');
	cerca(r.anio1.neto, 13680 - 1368 - 1800 - 957.6, 1e-9, 'el IVA general no es costo del dueño');
	// En quetzales y con valor fiscal bajo: 6 ‰ sobre todo el valor.
	const q = R.calcular({ precio: 60000, moneda: 'GTQ', rentaMensual: 500, uso: 'comercial' });
	cerca(q.anio1.iusi, 360, 1e-9, 'IUSI 6 ‰ de Q 60,000');
	// Tasa forzada.
	cerca(R.calcular({ ...base, uso: 'comercial', iusiMil: 2 }).anio1.iusi, 1540000 * 0.002 / 7.7, 1e-9);
});

test('ISR simplificado arriba de Q 30,000 al mes', () => {
	// US$ 6,000 de renta, sin vacancia: Q 46,200 al mes → 5 % de 30,000 + 7 % de 16,200 = Q 2,634 al mes.
	const r = R.calcular({ ...base, rentaMensual: 6000, vacancia: 0, regimenISR: 'simplificado' });
	cerca(r.anio1.isr, 2634 * 12 / 7.7, 1e-9, 'ISR anual en US$');
	// Debajo del tramo: 5 % parejo.
	const b = R.calcular({ ...base, regimenISR: 'simplificado' });
	cerca(b.anio1.isr, 13680 * 0.05, 1e-9);
});

test('ISR sobre utilidades', () => {
	const r = R.calcular({ ...base, regimenISR: 'utilidades', depreciacion: 2 });
	// 25 % × (13,680 − 1,368 − 0 − 4,000)
	cerca(r.anio1.isr, 0.25 * (13680 - 1368 - 4000), 1e-9);
	const cero = R.calcular({ ...base, regimenISR: 'utilidades', depreciacion: 10 });
	assert.equal(cero.anio1.isr, 0, 'sin utilidad no hay ISR');
});

test('IVA pequeño contribuyente: costo del dueño y aviso del límite', () => {
	const r = R.calcular({ ...base, regimenIVA: 'pequeno' });
	cerca(r.anio1.ivaPropietario, 13680 * 0.05, 1e-9);
	cerca(r.anio1.neto, 11354.4 - 684, 1e-9);
	// Q 105,336 al año: no pasa de Q 150,000.
	assert.ok(!r.avisos.includes('pequenoLimite'));
	const alto = R.calcular({ ...base, rentaMensual: 2000, regimenIVA: 'pequeno' });
	assert.ok(alto.avisos.includes('pequenoLimite'), 'Q 175,560 al año pasa el límite');
	assert.ok(R.calcular({ ...base, uso: 'mixto' }).avisos.includes('mixtoIva'));
});

test('TIR de un flujo conocido = 10 %', () => {
	const flujos = [-100, 10, 10, 10, 10, 10, 10, 10, 10, 10, 110];
	cerca(R.tir(flujos), 0.10, 1e-9);
	cerca(R.vpn(0.10, flujos), 0, 1e-9);
	assert.equal(R.tir([-100, -5, -5]), null, 'sin cambio de signo');
	assert.equal(R.tir([100, 5]), null);
	cerca(R.tir([-100, 50, 50, 50]), 0.2337519, 1e-6);
});

test('renta para un rendimiento objetivo (ida y vuelta)', () => {
	const renta = R.rentaParaRendimiento(200000, 5.6772, base);
	cerca(renta, 1200, 1e-4, 'vuelve a la renta original');
	const otra = R.rentaParaRendimiento(350000, 6.5, { ...base, uso: 'comercial', regimenISR: 'simplificado' });
	cerca(R.calcular({ ...base, precio: 350000, uso: 'comercial', regimenISR: 'simplificado', rentaMensual: otra }).rendimientoNeto, 0.065, 1e-9);
	assert.equal(R.rentaParaRendimiento(0, 5, base), null);
});

test('escenarios y payback', () => {
	const e = R.escenarios(base, [-10, 0, 10]);
	assert.equal(e.length, 3);
	cerca(e[1].neto, 11354.4, 1e-9);
	cerca(e[0].rentaMensual, 1080, 1e-9);
	assert.ok(e[0].netoMensual < e[1].netoMensual && e[1].netoMensual < e[2].netoMensual);
	const sinCrecer = R.calcular({ ...base, crecimientoRenta: 0 });
	cerca(sinCrecer.payback, 200000 / 11354.4, 1e-9, 'payback simple');
	assert.equal(R.calcular({ ...base, rentaMensual: 0 }).payback, null);
});

test('valores por defecto por tipo y parámetros editables', () => {
	assert.equal(R.usoPorTipo('oficina'), 'comercial');
	assert.equal(R.usoPorTipo('finca'), 'habitacional');
	assert.equal(R.capReferencia('terreno'), null);
	cerca(R.normalizar({ tipo: 'local' }).capSalida, 8.5, 1e-12);
	cerca(R.normalizar({ tipo: 'terreno' }).capSalida, 7, 1e-12);
	cerca(R.rentaSugerida(200000, 'casa', base), 200000 * 0.05 / 12 / (0.95 * 0.9), 1e-9);
	assert.ok(R.calcular({ ...base, tipo: 'terreno' }).avisos.includes('terreno'));
	const r = R.calcular(base, { isrCapitalTasa: 5 });
	cerca(r.anio1.isr, 478.8, 1e-9, 'parámetro cambiado');
	for (const [k, p] of Object.entries(R.PARAMS)) {
		assert.ok(typeof p.fuente === 'string' && p.fuente.length > 0, `${k} tiene fuente`);
		assert.equal(p.confirmar, true, `${k} confirmar`);
	}
	assert.equal(R.dinero(1234.5, 'USD', 'en'), 'US$ 1,235');
	assert.equal(R.porcentaje(0.05677, 'en', 2), '5.68 %');
});

console.log(`\n${ok} pruebas pasaron${process.exitCode ? ', con fallas' : ''}.`);
