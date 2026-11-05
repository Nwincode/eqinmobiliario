// Pruebas de la cotización de servicios (admin/js/cotizacion.js). Sin dependencias: `npm run test:cotizacion`.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
	mesesArrendamiento, pctTodoIncluido, factorTodoIncluido, desglose, calcularLinea, calcularCotizacion,
	textoWhatsApp, dinero, venceEl, numeroCotizacion, lineaVacia, pendientes, emisorDesde, faltanEmisor,
	liquidacionTotal, liquidacion, adminActiva, ISR_DEF, ISR_ALTO_DEF, ISR_LIMITE_DEF, TC_DEF, isrEscalonado, PCT_ASESOR_DEF
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

await test('administración: empieza vacía, no suma y no deja guardar hasta tener el valor', () => {
	const l = lineaVacia('administracion', 'GTQ');
	assert.equal(l.pct, '');
	assert.equal(l.adminTipo, 'pct');
	l.activa = true; // encendida (apagada se prueba más abajo)
	const sinNada = calcularLinea(l, 'general', 'todo');
	assert.equal(sinNada.listo, false);
	assert.equal(sinNada.falta, 'renta');
	l.renta = 10000;
	assert.equal(calcularLinea(l, 'general', 'todo').falta, 'pct');
	const cot = { regimen: 'general', modo: 'todo', lineas: [{ tipo: 'compraventa', moneda: 'USD', precio: 200000, pct: 5 }, l] };
	assert.deepEqual(pendientes(cot).map((p) => [p.linea, p.campo]), [[1, 'pct']]);
	assert.equal(calcularCotizacion(cot).totales.filter((t) => t.mensual).length, 0, 'la línea sin valor no suma');
	assert.doesNotMatch(textoWhatsApp(cot), /Administración/);
	l.pct = 8;
	assert.deepEqual(pendientes(cot), []);
	const x = calcularLinea(l, 'general', 'separado');
	assert.equal(x.honorario, 800);
	assert.equal(x.total, 896);
	// Compraventa sin precio no bloquea (solo se omite, como antes).
	assert.deepEqual(pendientes({ lineas: [{ tipo: 'compraventa', precio: '' }] }), []);
});

await test('administración con monto fijo al mes: IVA y pequeño contribuyente igual que los demás servicios', () => {
	const l = { tipo: 'administracion', adminTipo: 'fijo', moneda: 'GTQ', renta: '', monto: '' };
	assert.equal(pendientes({ lineas: [l] })[0].campo, 'monto');
	l.monto = 1000;
	const g = calcularLinea(l, 'general', 'todo');
	assert.equal(g.mensual, true);
	assert.equal(g.total, 1120);
	assert.equal(g.impuesto, 120);
	const p = calcularLinea(l, 'pequeno', 'todo');
	assert.equal(p.total, 1052.63);
	assert.equal(p.impuesto, 52.63);
	assert.equal(calcularLinea(l, 'pequeno', 'separado').total, 1000);
	assert.match(g.detalle, /Monto fijo cada mes/);
});

await test('cotizaciones guardadas antes (administración con 10 % y sin tipo) siguen igual', () => {
	const x = calcularLinea({ tipo: 'administracion', moneda: 'GTQ', renta: 10000, pct: 10 }, 'general', 'todo');
	assert.equal(x.total, 1120);
});

await test('emisor: el asesor o la empresa', () => {
	const a = emisorDesde('asesor', { asesor: { nombre: ' Joaquín Pérez ', nit: '123456-7', regimen: 'pequeno', telefono: '5555-1234', email: 'j@x.gt' } });
	assert.deepEqual(a, { tipo: 'asesor', nombre: 'Joaquín Pérez', razonSocial: '', nit: '123456-7', regimen: 'pequeno', direccion: '', telefono: '5555-1234', email: 'j@x.gt', logo: false });
	const e = emisorDesde('empresa', { empresa: { razonSocial: 'Equipo Inmobiliario, S.A.', nombreComercial: 'Equipo Inmobiliario', nit: '1234567-8', regimen: 'general', direccion: 'Zona 10' } });
	assert.equal(e.nombre, 'Equipo Inmobiliario');
	assert.equal(e.razonSocial, 'Equipo Inmobiliario, S.A.');
	assert.equal(e.regimen, 'general');
	assert.equal(e.logo, true);
	assert.equal(emisorDesde('empresa', { empresa: { razonSocial: 'X, S.A.', usarLogo: false } }).nombre, 'X, S.A.');
	assert.equal(emisorDesde('empresa', { empresa: { razonSocial: 'X, S.A.', usarLogo: false } }).logo, false);
	assert.equal(emisorDesde('asesor', {}).regimen, 'general');
	assert.deepEqual(faltanEmisor(emisorDesde('asesor', {})), ['nombre', 'NIT']);
	assert.deepEqual(faltanEmisor(a), []);
});

await test('liquidación, empresa en régimen general: Q 11,200 − IVA 1,200 − ISR 5 % (500) = 9,500', () => {
	assert.equal(ISR_DEF, 5);
	assert.equal(PCT_ASESOR_DEF, 100);
	const cot = { regimen: 'general', modo: 'todo', lineas: [{ tipo: 'compraventa', moneda: 'GTQ', precio: 200000, pct: 5 }] };
	const [x] = liquidacion(cot);
	assert.deepEqual([x.cobrado, x.iva, x.impuestoPequeno, x.isr, x.neto, x.asesor, x.empresa], [11200, 1200, 0, 500, 9500, 9500, 0]);
	const [mitad] = liquidacion(cot, { isrPct: 5, pctAsesor: 50 });
	assert.deepEqual([mitad.neto, mitad.asesor, mitad.empresa], [9500, 4750, 4750]);
	const [isr7] = liquidacion(cot, { isrPct: 7 });
	assert.equal(isr7.isr, 700);
	assert.equal(isr7.neto, 9300);
	// «Honorario + IVA» da lo mismo: el cliente paga 11,200 en ambos casos.
	assert.equal(liquidacion({ ...cot, modo: 'separado' })[0].neto, 9500);
});

await test('liquidación, empresa pequeño contribuyente: 5 % del total y sin ISR', () => {
	const [x] = liquidacion({ regimen: 'pequeno', modo: 'todo', lineas: [{ tipo: 'compraventa', moneda: 'USD', precio: 200000, pct: 5 }] }, { isrPct: 5, pctAsesor: 100 });
	assert.deepEqual([x.cobrado, x.iva, x.impuestoPequeno, x.isrPct, x.isr, x.neto, x.asesor], [10526.32, 0, 526.32, 0, 0, 10000, 10000]);
	const [s] = liquidacion({ regimen: 'pequeno', modo: 'separado', lineas: [{ tipo: 'arrendamiento', moneda: 'GTQ', renta: 9500, anios: 3 }] }, { pctAsesor: 60 });
	assert.deepEqual([s.cobrado, s.impuestoPequeno, s.neto, s.asesor, s.empresa], [28500, 1425, 27075, 16245, 10830]);
});

await test('liquidación: lo mensual y cada moneda por separado; valores fuera de rango se acotan', () => {
	const l = liquidacion({ regimen: 'general', modo: 'todo', lineas: [
		{ tipo: 'compraventa', moneda: 'USD', precio: 100000, pct: 5 },
		{ tipo: 'administracion', adminTipo: 'fijo', moneda: 'GTQ', monto: 1000 }
	] });
	// US$ 5,000 de honorario: 5 % de 3,896.10 (Q 30,000 a 7.7) + 7 % de 1,103.90 = 272.08
	assert.deepEqual(l.map((x) => [x.moneda, x.mensual, x.isr, x.neto]), [['USD', false, 272.08, 4727.92], ['GTQ', true, 50, 950]]);
	const y = liquidacionTotal({ total: 112, impuesto: 12, honorario: 100 }, 'general', { isrPct: 200, pctAsesor: -5 });
	assert.equal(y.isrPct, 100);
	assert.equal(y.asesor, 0);
	assert.equal(liquidacionTotal({ total: 112, impuesto: 12, honorario: 100 }, 'general', { isrPct: '', pctAsesor: '' }).isr, 5);
});

await test('ISR escalonado: 5 % hasta Q 30,000 y 7 % sobre el excedente', () => {
	assert.deepEqual([ISR_DEF, ISR_ALTO_DEF, ISR_LIMITE_DEF, TC_DEF], [5, 7, 30000, 7.7]);
	const q = isrEscalonado(50000, 'GTQ');
	assert.deepEqual([q.isr, q.baseBaja, q.baseAlta], [2900, 30000, 20000]);
	assert.equal(isrEscalonado(30000, 'GTQ').isr, 1500);
	assert.equal(isrEscalonado(30000.01, 'GTQ').isr, 1500);
	assert.equal(isrEscalonado(20000, 'GTQ').isr, 1000);
	// En dólares el límite se pasa con el tipo de cambio: Q 30,000 / 7.5 = US$ 4,000.
	const u = isrEscalonado(10000, 'USD', { tipoCambio: 7.5 });
	assert.deepEqual([u.limite, u.isr], [4000, 620]);
	// Compraventa de Q 1,000,000 al 5 %: honorario 50,000, cliente paga 56,000.
	const [x] = liquidacion({ regimen: 'general', modo: 'todo', lineas: [{ tipo: 'compraventa', moneda: 'GTQ', precio: 1000000, pct: 5 }] });
	assert.deepEqual([x.cobrado, x.iva, x.isr, x.neto, x.isrBaseBaja, x.isrBaseAlta], [56000, 6000, 2900, 47100, 30000, 20000]);
	// Pequeño contribuyente: sin ISR.
	assert.equal(liquidacion({ regimen: 'pequeno', modo: 'todo', lineas: [{ tipo: 'compraventa', moneda: 'GTQ', precio: 1000000, pct: 5 }] })[0].isr, 0);
});

await test('la liquidación nunca sale en el texto de WhatsApp', () => {
	const t = textoWhatsApp({ numero: 'COT-2', fecha: '2026-11-05', regimen: 'general', modo: 'todo', emisorTipo: 'empresa', emisor: { nombre: 'Equipo Inmobiliario' },
		liquidacion: { isrPct: 5, pctAsesor: 50 }, lineas: [{ tipo: 'compraventa', moneda: 'USD', precio: 200000, pct: 5 }] });
	assert.doesNotMatch(t, /liquidaci|ISR|neto|asesor recibe|9,500|4,750/i);
});

await test('administración apagada (predeterminado): no sale, no suma, no pide datos', () => {
	const l = lineaVacia('administracion', 'GTQ');
	assert.equal(l.activa, false);
	assert.equal(adminActiva(l), false);
	const cot = { numero: 'COT-3', fecha: '2026-11-05', regimen: 'general', modo: 'todo', emisorTipo: 'empresa', emisor: { nombre: 'Equipo Inmobiliario' },
		lineas: [{ tipo: 'compraventa', moneda: 'USD', precio: 200000, pct: 5 }, { ...l, adminTipo: 'pct', renta: 9500, pct: 8 }] };
	const r = calcularCotizacion(cot);
	assert.equal(r.lineas[1].listo, false);
	assert.equal(r.lineas[1].apagada, true);
	assert.deepEqual(r.totales.map((t) => [t.moneda, t.mensual, t.total]), [['USD', false, 11200]]);
	assert.deepEqual(pendientes(cot), []);
	assert.deepEqual(pendientes({ ...cot, lineas: [l] }), []);
	assert.equal(liquidacion(cot).length, 1);
	assert.doesNotMatch(textoWhatsApp(cot), /administraci/i);
});

await test('administración encendida: pide su valor y suma al total mensual y a la liquidación', () => {
	const base = { regimen: 'general', modo: 'todo', lineas: [{ ...lineaVacia('administracion', 'GTQ'), activa: true }] };
	assert.deepEqual(pendientes(base).map((p) => p.campo), ['renta']);
	const pct = { ...base, lineas: [{ ...base.lineas[0], renta: 9500, pct: 8 }] };
	assert.deepEqual(pendientes(pct), []);
	assert.deepEqual(calcularCotizacion(pct).totales.map((t) => [t.moneda, t.mensual, t.honorario, t.total]), [['GTQ', true, 760, 851.2]]);
	assert.equal(liquidacion(pct)[0].neto, 722);
	const fijo = { ...base, lineas: [{ ...base.lineas[0], adminTipo: 'fijo', monto: 1000 }] };
	assert.equal(calcularCotizacion(fijo).totales[0].total, 1120);
	assert.match(textoWhatsApp({ ...fijo, numero: 'COT-4', fecha: '2026-11-05', emisor: { nombre: 'X' } }), /administraci/i);
	// Cotizaciones de antes, sin interruptor: siguen encendidas.
	assert.equal(adminActiva({ tipo: 'administracion', renta: 5000, pct: 10 }), true);
	assert.equal(calcularCotizacion({ lineas: [{ tipo: 'administracion', moneda: 'GTQ', renta: 5000, pct: 10 }] }).totales[0].honorario, 500);
});

console.log(`\n${ok} pruebas correctas${process.exitCode ? ', con fallas' : ''}.`);
