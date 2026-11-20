// Pruebas de los totales de Reportes y del tablero de Clientes: un total por moneda (Q y US$ no se suman), los cierres
// por la fecha en que pasaron a «Cierre» y la parte del asesor de 0 a 100 % (la misma regla que Cotizaciones).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sumarPorMoneda, dineroPorMoneda, esPorcentaje } from '../admin/js/formato.js';
import { REGLAS_POR_DEFECTO, comisionDe, montoComision } from '../admin/js/acuerdo.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };
const fuente = (f) => readFileSync(new URL(`../admin/js/${f}`, import.meta.url), 'utf8');

const cierres = [
	{ nombre: 'Ana', moneda: 'USD', montoEstimado: 250000 },
	{ nombre: 'Luis', moneda: 'GTQ', montoEstimado: 1500000 },
	{ nombre: 'Eva', montoEstimado: 0 }];

t('US$ 250,000 + Q 1,500,000 salen por separado (antes «US$ 1,750,000.00»)', () => {
	const total = sumarPorMoneda(cierres, (c) => c.montoEstimado);
	assert.deepEqual(total, { USD: 250000, GTQ: 1500000 });
	assert.equal(dineroPorMoneda(total), 'US$ 250,000.00 · Q 1,500,000.00');
});

t('la comisión también va por moneda', () => {
	const com = sumarPorMoneda(cierres, (c) => montoComision(comisionDe('venta', null, REGLAS_POR_DEFECTO), c.montoEstimado));
	assert.equal(dineroPorMoneda(com), 'US$ 12,500.00 · Q 75,000.00');
});

t('sin moneda se toma US$; sin montos, texto vacío', () => {
	assert.deepEqual(sumarPorMoneda([{ montoEstimado: 10 }, { montoEstimado: '5' }], (c) => c.montoEstimado), { USD: 15 });
	assert.equal(dineroPorMoneda({}), '');
	assert.equal(dineroPorMoneda({ USD: 0 }), '');
	assert.equal(dineroPorMoneda({ USD: 5, GTQ: 7 }, ' y '), 'US$ 5.00 y Q 7.00');
});

t('Reportes y el tablero de Clientes no suman montos sin su moneda', () => {
	const reportes = fuente('views/reportes.js');
	const clientes = fuente('views/clientes.js');
	assert.doesNotMatch(reportes, /reduce\(\(s, c\) => s \+ \(Number\(c\.montoEstimado\)/);
	assert.doesNotMatch(clientes, /reduce\(\(s, c\) => s \+ \(Number\(c\.montoEstimado\)/);
	assert.match(clientes, /sumarPorMoneda\(items/);
});

t('un cierre cuenta por la fecha en que pasó a «Cierre» (etapaFecha), no por su última edición', () => {
	assert.match(fuente('views/reportes.js'), /c\.etapa === 'cierre' && ms\(c\.etapaFecha \|\| c\.updatedAt\) >= desde/);
});

t('porcentajes de 0 a 100: la misma revisión en Reportes y Cotizaciones', () => {
	for (const v of [0, 50, 100, '7.5']) assert.ok(esPorcentaje(v), String(v));
	for (const v of [150, -1, '', null, undefined, NaN, 'abc']) assert.ok(!esPorcentaje(v), String(v));
	assert.match(fuente('views/reportes.js'), /esPorcentaje\(nuevas\.parteAsesorPct\)/);
	assert.match(fuente('views/cotizacion.js'), /\[isr, isrAlto, pa\]\.every\(esPorcentaje\)/);
	assert.match(fuente('crm.js'), /esPorcentaje\(d\.parteAsesorPct\)/);
});

console.log(`\n${ok} pruebas de reportes pasan.`);
