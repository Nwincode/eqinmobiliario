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

// Sin comisión de arrendamiento: los cálculos a mano de estas pruebas no la llevan (tiene sus propias pruebas abajo).
const base = { precio: 200000, moneda: 'USD', rentaMensual: 1200, uso: 'habitacional', regimenISR: 'capital', vacancia: 5, gastosOperativos: 10, comisionActiva: false };
const conComision = { ...base, comisionActiva: true };
// El mismo caso con IVA general (12 % aparte al inquilino): el IVA no toca el neto del dueño.
const gen = { ...base, regimenIVA: 'general' };
// Vendedor que no está exento del ISR de la venta (persona jurídica o con actividad inmobiliaria inscrita).
const noExento = { vendedorExento: false };

test('caso base habitacional: IVA pequeño contribuyente por defecto (cálculo a mano)', () => {
	// Cobrado 1,200 × 12 × 0.95 = 13,680 → × 7.7 = Q 105,336 ≤ Q 500,285 → pequeño contribuyente 5 % = 684.
	// Neto = 13,680 − 1,368 (gastos) − 0 (IUSI) − 957.60 (ISR 10 % × 70 %) − 684 = 10,670.40.
	const r = R.calcular(base);
	cerca(r.anio1.cobrado, 13680, 1e-9, 'cobrado');
	cerca(r.cobradoAnualQ, 105336, 1e-6, 'cobrado en quetzales');
	assert.equal(r.entradas.regimenIVA, 'pequeno');
	assert.equal(r.entradas.ivaAutomatico, true);
	cerca(r.anio1.opex, 1368, 1e-9, 'opex');
	cerca(r.anio1.iusi, 0, 1e-12, 'iusi');
	cerca(r.anio1.isr, 957.6, 1e-9, 'isr');
	cerca(r.anio1.ivaPropietario, 684, 1e-9, 'IVA 5 %');
	cerca(r.anio1.neto, 10670.4, 1e-9, 'neto');
	cerca(r.netoMensual, 889.2, 1e-9, 'neto mensual');
	cerca(r.rendimientoNeto * 100, 5.3352, 1e-9, 'rendimiento neto');
	cerca(r.rendimientoBruto * 100, 7.2, 1e-9, 'rendimiento bruto');
	assert.equal(r.anios.length, 30);
	assert.ok(r.tir > 0.05 && r.tir < 0.12, `TIR razonable: ${r.tir}`);
});

test('caso base con IVA general: el neto sigue en 11,354.40', () => {
	const r = R.calcular(gen);
	assert.equal(r.entradas.regimenIVA, 'general');
	assert.equal(r.entradas.ivaAutomatico, false);
	cerca(r.anio1.ivaPropietario, 0, 0);
	cerca(r.anio1.ivaInquilino, 13680 * 0.12, 1e-9, 'IVA 12 % que se cobra aparte');
	cerca(r.anio1.neto, 11354.4, 1e-9, 'neto');
	cerca(r.netoMensual, 946.2, 1e-9, 'neto mensual');
	cerca(r.rendimientoNeto * 100, 5.6772, 1e-9, 'rendimiento neto');
});

test('IVA por defecto: el límite de pequeño contribuyente (Q 500,285, Dto. 31-2024) decide, en cualquier uso', () => {
	assert.equal(R.PARAMS.limitePequenoGTQ.valor, 500285);
	// Q 500,285 ÷ 7.7 ÷ 12 ÷ 0.95 = US$ 5,699.30 al mes es el borde.
	assert.equal(R.ivaPorDefecto({ rentaMensual: 5699, moneda: 'USD' }), 'pequeno'); // Q 500,253.22
	assert.equal(R.ivaPorDefecto({ rentaMensual: 5700, moneda: 'USD' }), 'general'); // Q 500,346.00
	assert.equal(R.ivaPorDefecto({ rentaMensual: 43884, moneda: 'GTQ', vacancia: 5 }), 'pequeno'); // Q 500,277.60
	assert.equal(R.ivaPorDefecto({ rentaMensual: 43885, moneda: 'GTQ', vacancia: 5 }), 'general'); // Q 500,289.00
	// Arriba del viejo límite de Q 150,000 pero debajo de Q 500,285: sigue en pequeño.
	// US$ 2,000 × 12 × 0.95 × 7.7 = Q 175,560.
	assert.equal(R.ivaPorDefecto({ rentaMensual: 2000, moneda: 'USD' }), 'pequeno');
	assert.equal(R.calcular({ ...base, rentaMensual: 2000 }).entradas.regimenIVA, 'pequeno');
	// El límite es editable.
	assert.equal(R.ivaPorDefecto({ rentaMensual: 2000, moneda: 'USD' }, { limitePequenoGTQ: 150000 }), 'general');
	for (const uso of ['habitacional', 'mixto', 'comercial']) {
		assert.equal(R.calcular({ ...base, uso }).entradas.regimenIVA, 'pequeno', uso);
		assert.equal(R.calcular({ ...base, uso, rentaMensual: 6000 }).entradas.regimenIVA, 'general', uso);
	}
	// Ya no hay régimen exento: un valor desconocido vuelve al automático.
	assert.equal(R.calcular({ ...base, regimenIVA: 'exento' }).entradas.regimenIVA, 'pequeno');
	assert.equal(R.calcular({ ...base, regimenIVA: 'auto' }).entradas.regimenIVA, 'pequeno');
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
	const r = R.calcular({ ...base, ...noExento, crecimientoRenta: 3, plazo: 10, capSalida: 6, costosVenta: 5 });
	const v = r.venta;
	assert.equal(v.exento, false);
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
	const sin = R.calcular({ ...base, ...noExento, crecimientoRenta: 3, plazo: 10, capSalida: 6, costosVenta: 5, restarImpuestoVenta: false });
	assert.ok(r.tir < sin.tir, 'el impuesto baja la TIR');
	cerca(r.tirSinImpuestoVenta, sin.tir, 1e-9, 'TIR de comparación');
	cerca(sin.venta.impuestoCalculado, v.impuesto, 1e-9, 'se calcula aunque no se reste');
	assert.equal(sin.venta.impuesto, 0);
	// El parámetro cambia la tasa.
	cerca(R.calcular({ ...base, ...noExento, crecimientoRenta: 3, plazo: 10, capSalida: 6, costosVenta: 5 }, { isrGananciaCapital: 5 }).venta.impuesto, 3099.153, 1e-3);
	// Simplificado sin exención: también 10 % (rentas de capital).
	cerca(R.calcular({ ...base, regimenISR: 'simplificado', crecimientoRenta: 3, plazo: 10, capSalida: 6, costosVenta: 5 }).venta.impuesto, 6198.31, 0.01);
});

test('venta exenta: persona individual sin actividad inmobiliaria (Decreto 18-2026)', () => {
	const c = { ...base, crecimientoRenta: 3, plazo: 10, capSalida: 6, costosVenta: 5 };
	// Por defecto: rentas de capital → exento; utilidades y simplificado → no exento.
	assert.equal(R.normalizar({ regimenISR: 'capital' }).vendedorExento, true);
	assert.equal(R.normalizar({}).vendedorExento, true);
	assert.equal(R.normalizar({ regimenISR: 'utilidades' }).vendedorExento, false);
	assert.equal(R.normalizar({ regimenISR: 'simplificado' }).vendedorExento, false);
	const r = R.calcular(c);
	assert.equal(r.venta.exento, true);
	cerca(r.venta.ganancia, 61983.06, 0.01, 'la ganancia se sigue mostrando');
	assert.equal(r.venta.tasa, 0);
	assert.equal(r.venta.impuestoCalculado, 0);
	assert.equal(r.venta.impuesto, 0);
	cerca(r.venta.neta, 261983.06, 0.01, 'queda el ingreso neto entero');
	cerca(r.tir, r.tirSinImpuestoVenta, 1e-12, 'sin impuesto, la TIR no cambia');
	const fila = R.cascadaVenta(r).find((f) => f.clave === 'isrVenta');
	assert.equal(fila.monto === 0 || Object.is(fila.monto, -0), true);
	assert.match(fila.nota, /Exento \(Dto\. 18-2026, art\. 87 num\. 4 Ley ISR\)/);
	// Se puede marcar a mano: utilidades exento y capital no exento.
	assert.equal(R.calcular({ ...c, regimenISR: 'utilidades', vendedorExento: true }).venta.impuesto, 0);
	cerca(R.calcular({ ...c, vendedorExento: false }).venta.impuesto, 6198.31, 0.01);
	cerca(R.calcular({ ...c, vendedorExento: 'false' }).venta.impuesto, 6198.31, 0.01);
	const t = R.cascadaVenta(r).find((f) => f.clave === 'timbres');
	assert.match(t.nota, /Timbres Fiscales \(3 %\), normalmente por el comprador; no es IVA/);
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
	const u = R.calcular({ ...c, regimenISR: 'utilidades', depreciacion: 2 }); // utilidades: no exento por defecto
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
	for (const caso of [base, gen, { ...base, uso: 'comercial', regimenIVA: 'general' }, { ...base, ...noExento, reservaCapex: 5 }, { ...base, regimenISR: 'utilidades', depreciacion: 2 }]) {
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
	const com = R.cascadaAnio(R.calcular({ ...base, uso: 'comercial', regimenIVA: 'general' }), 1);
	const info = com.find((f) => f.clave === 'ivaInquilino');
	assert.equal(info.tipo, 'info');
	cerca(info.monto, 13680 * 0.12, 1e-9);
	assert.ok(!com.some((f) => f.clave === 'ivaPropietario'), 'en general el IVA no se resta');
	const peq = R.cascadaAnio(R.calcular(base), 1).find((f) => f.clave === 'ivaPropietario');
	assert.equal(peq.tipo, 'resta');
	cerca(peq.monto, -684, 1e-9);
	const r = R.calcular(base);
	cerca(r.multiplo, (r.recibido) / 200000, 1e-12);
});

test('IUSI (Decreto 18-2026): sin tramo exento, la tasa del tramo va sobre todo el valor', () => {
	assert.equal(R.tasaIusi('comercial', 0), 3);
	assert.equal(R.tasaIusi('comercial', 2000), 3, 'ya no hay tramo exento');
	assert.equal(R.tasaIusi('comercial', 500000), 3);
	assert.equal(R.tasaIusi('comercial', 500000.01), 6);
	assert.equal(R.tasaIusi('comercial', 1000000), 6);
	assert.equal(R.tasaIusi('comercial', 1000000.01), 9);
	assert.equal(R.tasaIusi('habitacional', 5e6), 0);
	assert.equal(R.tasaIusi('mixto', 5e6), 0);
	// US$ 200,000 × 7.7 = Q 1,540,000 → 9 ‰ = Q 13,860 al año = US$ 1,800.
	const r = R.calcular({ ...base, uso: 'comercial', regimenIVA: 'general' });
	cerca(r.valorFiscalQ, 1540000, 1e-6);
	assert.equal(r.iusiTasaMil, 9);
	cerca(r.anio1.iusi, 1800, 1e-9, 'IUSI anual');
	cerca(r.anio1.ivaInquilino, 13680 * 0.12, 1e-9, 'IVA que cobra al inquilino');
	cerca(r.anio1.neto, 13680 - 1368 - 1800 - 957.6, 1e-9, 'el IVA general no es costo del dueño');
	// En quetzales: Q 60,000 → 3 ‰ = Q 180; Q 800,000 → 6 ‰ = Q 4,800 (sobre todo el valor).
	cerca(R.calcular({ precio: 60000, moneda: 'GTQ', rentaMensual: 500, uso: 'comercial' }).anio1.iusi, 180, 1e-9, 'IUSI 3 ‰ de Q 60,000');
	cerca(R.calcular({ precio: 800000, moneda: 'GTQ', rentaMensual: 5000, uso: 'comercial' }).anio1.iusi, 4800, 1e-9, 'IUSI 6 ‰ de Q 800,000');
	// US$ 100,000 × 7.7 = Q 770,000 → 6 ‰ = Q 4,620 = US$ 600.
	cerca(R.calcular({ ...base, precio: 100000, uso: 'comercial' }).anio1.iusi, 600, 1e-9);
	// Tasa forzada.
	cerca(R.calcular({ ...base, uso: 'comercial', iusiMil: 2 }).anio1.iusi, 1540000 * 0.002 / 7.7, 1e-9);
});

test('ISR simplificado arriba de Q 30,000 al mes', () => {
	// US$ 6,000 de renta, sin vacancia: Q 46,200 al mes → 5 % de 30,000 + 7 % de 16,200 = Q 2,634 al mes.
	const r = R.calcular({ ...base, rentaMensual: 6000, vacancia: 0, regimenISR: 'simplificado' });
	cerca(r.anio1.isr, 2634 * 12 / 7.7, 1e-9, 'ISR anual en US$');
	// Debajo del tramo: 5 % parejo.
	const b = R.calcular({ ...gen, regimenISR: 'simplificado' });
	cerca(b.anio1.isr, 13680 * 0.05, 1e-9);
});

test('ISR sobre utilidades', () => {
	const r = R.calcular({ ...base, regimenISR: 'utilidades', depreciacion: 2 });
	// 25 % × (13,680 − 1,368 − 0 − 4,000)
	cerca(r.anio1.isr, 0.25 * (13680 - 1368 - 4000), 1e-9);
	const cero = R.calcular({ ...base, regimenISR: 'utilidades', depreciacion: 10 });
	assert.equal(cero.anio1.isr, 0, 'sin utilidad no hay ISR');
});

test('IVA pequeño contribuyente: costo del dueño y avisos del límite', () => {
	const r = R.calcular({ ...base, regimenIVA: 'pequeno', crecimientoRenta: 0 });
	cerca(r.anio1.ivaPropietario, 13680 * 0.05, 1e-9);
	cerca(r.anio1.neto, 11354.4 - 684, 1e-9);
	// Q 105,336 al año: no pasa de Q 500,285, y sin crecimiento nunca pasa.
	assert.ok(!r.avisos.includes('pequenoLimite') && !r.avisos.includes('pequenoLimiteFuturo'));
	assert.equal(r.ivaLimiteAnio, null);
	assert.ok(!R.calcular({ ...base, rentaMensual: 2000, regimenIVA: 'pequeno' }).avisos.includes('pequenoLimite'), 'Q 175,560 no pasa de Q 500,285');
	const alto = R.calcular({ ...base, rentaMensual: 6000, regimenIVA: 'pequeno' });
	assert.ok(alto.avisos.includes('pequenoLimite'), 'Q 526,680 al año pasa el límite');
	// El caso base con 3 % al año no llega al límite en 30 años (105,336 × 1.03^29 = 248,036).
	assert.equal(R.calcular(base).ivaLimiteAnio, null);
	// US$ 5,000: Q 438,900 → × 1.03^5 = 508,805 → pasa en el año 6.
	const crece = R.calcular({ ...base, rentaMensual: 5000 });
	assert.equal(crece.entradas.regimenIVA, 'pequeno');
	assert.equal(crece.ivaLimiteAnio, 6);
	assert.ok(crece.avisos.includes('pequenoLimiteFuturo'));
	assert.ok(!R.calcular(gen).avisos.includes('pequenoLimiteFuturo'), 'en general no hay aviso');
	assert.ok(!R.calcular({ ...base, uso: 'mixto' }).avisos.includes('mixtoIva'), 'ya no hay aviso de mixto');
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
	cerca(R.rentaParaRendimiento(200000, 5.3352, base), 1200, 1e-4, 'vuelve a la renta original (pequeño)');
	cerca(R.rentaParaRendimiento(200000, 5.6772, gen), 1200, 1e-4, 'vuelve a la renta original (general)');
	const otra = R.rentaParaRendimiento(350000, 6.5, { ...gen, uso: 'comercial', regimenISR: 'simplificado' });
	cerca(R.calcular({ ...gen, precio: 350000, uso: 'comercial', regimenISR: 'simplificado', rentaMensual: otra }).rendimientoNeto, 0.065, 1e-9);
	assert.equal(R.rentaParaRendimiento(0, 5, base), null);
});

test('escenarios y payback', () => {
	const e = R.escenarios(base, [-10, 0, 10]);
	assert.equal(e.length, 3);
	cerca(e[1].neto, 10670.4, 1e-9);
	cerca(R.escenarios(gen, [0])[0].neto, 11354.4, 1e-9);
	cerca(e[0].rentaMensual, 1080, 1e-9);
	assert.ok(e[0].netoMensual < e[1].netoMensual && e[1].netoMensual < e[2].netoMensual);
	const sinCrecer = R.calcular({ ...gen, crecimientoRenta: 0 });
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
		assert.equal(typeof p.confirmar, 'boolean', `${k} confirmar`);
	}
	// Verificados (Decreto 18-2026 y Ley del IVA): IUSI e IVA. Por confirmar: tasas de ISR, tipo de cambio y mercado.
	for (const k of ['iusiHabitacional', 'iusiMixto', 'iusiTramo1Hasta', 'iusiTramo1Tasa', 'iusiTramo2Hasta', 'iusiTramo2Tasa', 'iusiTramo3Tasa', 'ivaGeneral', 'ivaPequeno'])
		assert.equal(R.PARAMS[k].confirmar, false, `${k} verificado`);
	assert.match(R.PARAMS.iusiTramo1Tasa.fuente, /^Decreto 18-2026, art\. 1 \(reforma art\. 11 Dto\. 15-98\), DCA 28-ago-2026/);
	assert.match(R.PARAMS.ivaPequeno.fuente, /^Ley del IVA, Dto\. 27-92, art\. 3 num\. 4; art\. 10; arts\. 45-47 \(Dto\. 4-2012\)/);
	assert.equal(R.PARAMS.limitePequenoGTQ.fuente, 'Dto. 31-2024, arts. 15-17 (Ley del IVA arts. 45, 46 y 50): 125 salarios mínimos mensuales no agrícolas, sin bonificación incentivo. Monto 2026 según el salario mínimo vigente');
	for (const k of ['limitePequenoGTQ', 'isrGananciaCapital', 'isrGananciaUtilidades', 'tipoCambio', 'capCasa']) assert.equal(R.PARAMS[k].confirmar, true, `${k} por confirmar`);
	assert.equal(R.dinero(1234.5, 'USD', 'en'), 'US$ 1,235');
	assert.equal(R.porcentaje(0.05677, 'en', 2), '5.68 %');
});

test('comisión: escala en rentas (1-5 una por año, 6-10 media, más de 10 un tercio)', () => {
	const casos = [[0, 0], [1, 1], [3, 3], [5, 5], [7, 6], [10, 7.5], [15, 9 + 1 / 6], [30, 5 + 2.5 + 20 / 3], [2.5, 2.5]];
	for (const [n, m] of casos) cerca(R.mesesComision(n), m, 1e-9, `meses(${n})`);
	const P = R.PARAMS;
	assert.equal(P.comisionActiva.valor, true);
	assert.equal(P.plazoContrato.valor, 3);
	assert.equal(P.comisionEnRenovacion.valor, true);
	assert.equal(P.escalaContinua.valor, false);
	assert.equal(P.escalaContinua.confirmar, false, 'confirmado por el propietario');
	assert.match(P.escalaContinua.fuente, /^Confirmado por el propietario/);
	assert.equal(P.ivaComision.valor, 12);
	// Los sí/no aceptan texto del panel ('false') y el plazo queda entre 1 y 30 años enteros.
	const { comisionActiva, ...sinBandera } = base;
	assert.equal(R.calcular(sinBandera).comision.activa, true, 'activa por defecto');
	assert.equal(R.calcular(sinBandera, { comisionActiva: 'false' }).comision.activa, false);
	assert.equal(R.calcular({ ...conComision, plazoContrato: 45 }).comision.plazoContrato, 30);
	assert.equal(R.calcular({ ...conComision, plazoContrato: 0 }).comision.plazoContrato, 1);
});

test('comisión año 1: US$200k, renta 1,200, pequeño contribuyente (cálculo a mano)', () => {
	const r = R.calcular(conComision);
	const a = r.anio1;
	assert.equal(r.entradas.regimenIVA, 'pequeno');
	// Contrato de 3 años: 3 rentas × 1,200 = 3,600 + IVA 12 % (432) = 4,032 al firmar; 1,344 al año en el resultado.
	cerca(a.comision, 4032);
	cerca(a.comisionDevengada, 1344);
	cerca(a.noi, 12312, 1e-6, 'el NOI no cambia');
	cerca(a.antesImpuestos, 12312 - 1344);
	cerca(a.isr, 957.6, 1e-6, 'rentas de capital: la comisión no baja el ISR');
	cerca(a.neto, 9326.4);
	cerca(r.netoMensual, 777.2);
	cerca(a.netoCaja, 12312 - 4032 - 957.6 - 684);
	const c = R.cascadaAnio(r, 1);
	const filas = c.filas || c;
	const com = filas.find((f) => f.clave === 'comision');
	cerca(com.monto, -1344);
	cerca(filas.find((f) => f.clave === 'neto').monto, a.neto);
	cerca(filas.find((f) => f.clave === 'netoCaja').monto, a.netoCaja);
	// Régimen general de IVA: el IVA de la factura es crédito fiscal, el costo es la comisión sin IVA.
	const g = R.calcular({ ...conComision, regimenIVA: 'general' }).anio1;
	cerca(g.comision, 3600);
	cerca(g.comisionDevengada, 1200);
	// Sobre utilidades sí se deduce: 25 % × 1,344 menos ISR.
	const u0 = R.calcular({ ...base, regimenISR: 'utilidades' }).anio1;
	const u1 = R.calcular({ ...conComision, regimenISR: 'utilidades' }).anio1;
	cerca(u0.isr - u1.isr, 0.25 * 1344, 1e-6, 'ISR utilidades');
});

test('comisión: caja con y sin renovaciones (plazo 10 años, contratos de 3)', () => {
	const e = { ...conComision, plazo: 10, crecimientoRenta: 3 };
	const r = R.calcular(e);
	// Contratos en los años 1, 4, 7 y 10; el del año 10 se corta en 1 año: 1/3 de la comisión.
	const pagos = r.anios.map((a) => a.comision);
	const renta = (t) => 1200 * Math.pow(1.03, t - 1);
	const esperado = (t, f = 1) => 3 * renta(t) * 1.12 * f;
	for (let t = 1; t <= 10; t++) {
		const p = t === 1 || t === 4 || t === 7 ? esperado(t) : t === 10 ? esperado(10, 1 / 3) : 0;
		cerca(pagos[t - 1], p, 1e-6, `caja año ${t}`);
	}
	assert.equal(r.comision.pagados, 4);
	const caja = pagos.reduce((x, y) => x + y, 0);
	const devengada = r.anios.reduce((x, a) => x + a.comisionDevengada, 0);
	cerca(caja, devengada, 1e-6, 'caja = devengado en el plazo');
	// La TIR usa la caja: flujo del año = netoCaja.
	r.anios.slice(0, -1).forEach((a, i) => cerca(r.flujos[i + 1], a.netoCaja));
	// Sin renovaciones: solo el contrato del año 1.
	const s = R.calcular({ ...e, comisionEnRenovacion: false });
	const pagosS = s.anios.map((a) => a.comision);
	cerca(pagosS[0], esperado(1));
	assert.ok(pagosS.slice(1).every((x) => x === 0), 'sin pagos después del año 1');
	assert.equal(s.comision.pagados, 1);
	assert.ok(s.tir > r.tir);
});

test('comisión: 30 años, la escala reinicia en cada contrato (por defecto)', () => {
	const r = R.calcular({ ...conComision, plazo: 30, crecimientoRenta: 0 });
	assert.equal(r.comision.escalaContinua, false);
	assert.equal(r.comision.pagados, 10);
	cerca(r.comision.rentas, 30);
	cerca(r.comision.sinIva, 30 * 1200);
	cerca(r.totales.comision, 30 * 1200 * 1.12);
});

test('comisión: 30 años, la renovación sigue la escala (opción avanzada)', () => {
	const r = R.calcular({ ...conComision, plazo: 30, crecimientoRenta: 0, escalaContinua: true });
	cerca(r.comision.rentas, 5 + 2.5 + 20 / 3, 1e-9);
	const c = r.comision.contratos;
	cerca(c[0].meses, 3); // años 1-3
	cerca(c[1].meses, 2 + 0.5); // años 4-6: 4, 5 enteros y 6 a media
	cerca(c[3].meses, 1 / 2 + 2 / 3); // años 10-12: 10 a media, 11 y 12 a un tercio
	cerca(r.totales.comision, (5 + 2.5 + 20 / 3) * 1200 * 1.12, 1e-6);
});

test('comisión: contrato de 30 años, un solo pago al firmar', () => {
	const r = R.calcular({ ...conComision, plazo: 30, plazoContrato: 30 });
	const m = 5 + 2.5 + 20 / 3; // 14.1667 rentas
	assert.equal(r.comision.pagados, 1);
	cerca(r.anios[0].comision, m * 1200 * 1.12, 1e-6, 'año 1, con IVA (pequeño)');
	assert.ok(r.anios.slice(1).every((a) => a.comision === 0), 'sin más comisiones');
	r.anios.forEach((a) => cerca(a.comisionDevengada, m * 1200 * 1.12 / 30, 1e-6));
	const g = R.calcular({ ...conComision, plazo: 30, plazoContrato: 30, regimenIVA: 'general' });
	cerca(g.anios[0].comision, m * 1200, 1e-6, 'régimen general: sin IVA');
});

test('comisión: la TIR del panel y la del motor coinciden; el tipo cambia el cap rate de salida', () => {
	// Entradas como las manda el panel por defecto (tipo casa, plazo 30, venta exenta) y sus parámetros.
	const panel = { ...conComision, tipo: 'casa', crecimientoRenta: 3, reservaCapex: 0, plazo: 30, tasaDescuento: 10,
		costosCompra: 0, capexSumaAlCosto: true, restarImpuestoVenta: true, vendedorExento: true, regimenIVA: 'auto' };
	const P = Object.fromEntries(Object.entries(R.PARAMS).map(([k, p]) => [k, p.valor]));
	const r = R.calcular(panel, P);
	assert.equal(r.entradas.capSalida, 5.5, 'casa: 5 % + 0.5');
	// Venta con comisión 5 % + IVA y gastos 2 % (pequeño contribuyente: 7.6 % del precio).
	cerca(r.tir * 100, 7.69, 0.005, 'TIR casa');
	cerca(R.calcular({ ...panel, comisionActiva: false }, P).tir * 100, 8.39, 0.005, 'TIR casa sin comisión');
	cerca(r.totales.comision, 62060.91, 0.01, 'comisiones en 30 años');
	// Los flujos de la TIR son la caja: comisión completa el año que se firma, no la repartida.
	r.anios.slice(0, -1).forEach((a, i) => cerca(r.flujos[i + 1], a.netoCaja));
	// Sin tipo no hay referencia: cap rate de salida 7 % (precio de venta menor), por eso la TIR baja a 7.30 %.
	const sinTipo = R.calcular({ ...panel, tipo: '' }, P);
	assert.equal(sinTipo.entradas.capSalida, 7);
	cerca(sinTipo.tir * 100, 7.30, 0.005, 'TIR sin tipo');
	r.anios.forEach((a, i) => cerca(a.netoCaja, sinTipo.anios[i].netoCaja, 1e-9, `misma caja año ${i + 1}`));
	// Lo confirmado por el propietario: el plazo se elige en cada negocio y cada renovación paga (escala reinicia).
	for (const k of ['plazoContrato', 'comisionEnRenovacion', 'escalaContinua']) assert.equal(R.PARAMS[k].confirmar, false, k);
	assert.equal(R.PARAMS.ivaComision.confirmar, true, 'IVA de la comisión sigue por confirmar');
});

test('venta: comisión de venta (5 % + IVA) y gastos de venta (2 %) separados', () => {
	const c = { ...conComision, tipo: 'casa', crecimientoRenta: 3, plazo: 30 };
	const peq = R.calcular(c), gen = R.calcular({ ...c, regimenIVA: 'general' });
	assert.equal(peq.entradas.regimenIVA, 'pequeno');
	for (const [r, pct, nombre] of [[peq, 7.6, 'pequeño: IVA es costo'], [gen, 7, 'general: IVA es crédito fiscal']]) {
		const v = r.venta;
		assert.ok(v.separados, nombre);
		cerca(v.costosVenta, v.precioVenta * pct / 100, 1e-6, nombre);
		cerca(v.gastos, v.precioVenta * 0.02, 1e-6, 'gastos 2 %');
		cerca(v.comisionSinIva, v.precioVenta * 0.05, 1e-6, 'comisión 5 % sin IVA');
		cerca(v.ivaComision, v.precioVenta * 0.006, 1e-6, 'IVA de la comisión');
		cerca(v.ingresoNeto, v.precioVenta - v.costosVenta, 1e-6);
		// La cascada muestra dos filas y cuadra.
		const filas = R.cascadaVenta(r), m = (k) => filas.find((f) => f.clave === k);
		assert.ok(m('comisionVenta') && m('gastosVenta') && !m('costosVenta'), 'dos filas');
		cerca(m('precioVenta').monto + m('comisionVenta').monto + m('gastosVenta').monto, m('ingresoNeto').monto, 1e-6, 'cascada cuadra');
	}
	cerca(peq.venta.precioVenta, 543353.74, 0.01);
	cerca(peq.venta.costosVenta, 41294.88, 0.01);
	cerca(gen.venta.costosVenta, 38034.76, 0.01);
	// Parámetros editables y su estado.
	assert.equal(R.PARAMS.comisionVenta.confirmar, false);
	assert.equal(R.PARAMS.gastosVenta.confirmar, true);
	cerca(R.calcular(c, { comisionVenta: 4, gastosVenta: 1 }).venta.costosVenta, peq.venta.precioVenta * (4 * 1.12 + 1) / 100, 1e-6, 'params');
	cerca(R.calcular({ ...c, comisionVenta: 3, gastosVenta: 0 }).venta.costosVenta, peq.venta.precioVenta * 3.36 / 100, 1e-6, 'entradas');
	// Compatibilidad: un costosVenta explícito sigue siendo un solo %, sin IVA aparte.
	const viejo = R.calcular({ ...c, costosVenta: 5 });
	assert.ok(!viejo.venta.separados);
	cerca(viejo.venta.costosVenta, viejo.venta.precioVenta * 0.05, 1e-6);
	assert.ok(R.cascadaVenta(viejo).some((f) => f.clave === 'costosVenta'));
});

console.log(`\n${ok} pruebas pasaron${process.exitCode ? ', con fallas' : ''}.`);
