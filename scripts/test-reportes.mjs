// Pruebas de los totales de Reportes y del tablero de Clientes: un total por moneda (Q y US$ no se suman), los cierres
// por la fecha en que pasaron a «Cierre» y la parte del asesor de 0 a 100 % (la misma regla que Cotizaciones).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sumarPorMoneda, dineroPorMoneda, esPorcentaje, idClientePorContacto, telefonoWa } from '../admin/js/formato.js';
import { REGLAS_POR_DEFECTO, comisionDe, montoComision } from '../admin/js/acuerdo.js';
import { conPrecioFinal, cierresSinCliente, cierreDePedido, estadoDeCierre, faltaEnCierre, cierrePorGuardar } from '../admin/js/cierre-casa.js';

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

t('el cliente nuevo de un lead lleva un id de su contacto: dos leads de la misma persona caen en la misma ficha', () => {
	assert.equal(idClientePorContacto(telefonoWa('+502 5555 1234'), 'a@b.com'), idClientePorContacto(telefonoWa('+50255551234'), ''));
	assert.equal(idClientePorContacto('', 'Ana.Lopez@Gmail.com '), 'correo-ana.lopez@gmail.com');
	assert.doesNotMatch(idClientePorContacto('', 'a/b@c.com'), /\//);
	assert.equal(idClientePorContacto('', ''), '');
	assert.match(fuente('crm.js'), /idClientePorContacto\(tel, mail\)/);
});

// El precio final de una casa vendida o rentada (properties/{id}/privado/cierre, admin/js/cierre-casa.js).
const cerradas = [
	{ id: 'v1', operacion: 'venta', moneda: 'USD', precio: 285000, agentId: 'a1', cierre: { fechaCierre: '2026-11-26', precioFinal: 270000, moneda: 'USD', operacion: 'venta' } },
	{ id: 'v2', operacion: 'venta', moneda: 'GTQ', precio: 1200000, agentId: 'a2', cierre: { fechaCierre: '2026-11-20', moneda: 'GTQ', operacion: 'venta' } },
	{ id: 'r1', operacion: 'renta', moneda: 'USD', precio: 1500, agentId: 'a1', cierre: { fechaCierre: '2026-11-25', precioFinal: 1250, moneda: 'USD', operacion: 'renta' } },
	{ id: 'vieja', operacion: 'venta', moneda: 'USD', precio: 99000, agentId: 'a1', cierre: { fechaCierre: '2025-01-10', precioFinal: 95000, moneda: 'USD' } }];
const DESDE = Date.parse('2026-11-01T00:00:00-06:00');

t('El cliente en «Cierre» de una casa con precio final cuenta ese precio, en la moneda de la casa', () => {
	const [ana, luis] = conPrecioFinal([
		{ nombre: 'Ana', etapa: 'cierre', moneda: 'GTQ', montoEstimado: 2000000, interes: ['v1', 'x'] },
		{ nombre: 'Luis', etapa: 'cierre', moneda: 'USD', montoEstimado: 300000, interes: ['v1', 'r1'] }], cerradas);
	assert.equal(ana.montoEstimado, 270000);
	assert.equal(ana.moneda, 'USD');
	// Con dos casas cerradas en su interés no se adivina cuál: queda su monto.
	assert.equal(luis.montoEstimado, 300000);
	assert.equal(dineroPorMoneda(sumarPorMoneda([ana], (c) => c.montoEstimado)), 'US$ 270,000.00');
});
t('La casa cerrada sin cliente en «Cierre» cuenta una vez, para su asesor, con su precio final y su comisión acordada', () => {
	const conCliente = [{ etapa: 'cierre', interes: ['v1'] }];
	const n = cierresSinCliente(cerradas, conCliente, { desde: DESDE, acuerdos: { r1: { comisionRentaMeses: 2 } }, reglas: REGLAS_POR_DEFECTO });
	// v1 ya la cuenta su cliente; la vieja es de otro periodo.
	assert.deepEqual(n.map((x) => x.casaId), ['v2', 'r1']);
	const [v2, r1] = n;
	// Sin precio final: el precio publicado, en su moneda, y la regla general (5 %).
	assert.deepEqual([v2.agentId, v2.monto, v2.moneda, v2.comision], ['a2', 1200000, 'GTQ', 60000]);
	// Renta: la renta final al mes por los meses acordados en esa casa.
	assert.deepEqual([r1.agentId, r1.monto, r1.comision], ['a1', 1250, 2500]);
});
t('Aplicar el cierre: estado, moneda y operación salen de la casa, no del pedido', () => {
	assert.equal(estadoDeCierre('renta'), 'rentada');
	assert.equal(estadoDeCierre('venta'), 'vendida');
	assert.deepEqual(cierreDePedido({ id: 'p9', fechaCierre: '2026-11-26', precioFinal: 270000, moneda: 'GTQ' }, { moneda: 'USD', operacion: 'venta' }),
		{ fechaCierre: '2026-11-26', precioFinal: 270000, moneda: 'USD', operacion: 'venta', pedidoId: 'p9' });
	assert.deepEqual(cierreDePedido({ fechaCierre: '2026-11-26' }, { operacion: 'renta' }), { fechaCierre: '2026-11-26', moneda: 'USD', operacion: 'renta' });
});
t('Reportes usa el precio final y las casas cerradas; el precio final nunca va a la casa pública', () => {
	const r = fuente('views/reportes.js');
	assert.match(r, /conPrecioFinal\(misClientes\.filter/);
	assert.match(r, /cierresSinCliente\(cerradas\.casas, enCierre/);
	assert.match(r, /doc\(db, 'properties', c\.id, 'privado', 'cierre'\)/);
	const cd = fuente('views/cambios-dueno.js');
	assert.match(cd, /doc\(db, 'properties', casa\.id, 'privado', 'cierre'\)/);
	assert.doesNotMatch(cd, /lote\.update\(refCasa, \{[^}]*precioFinal/);
	// El build y los feeds no leen privado/cierre ni conocen el precio final.
	for (const f of ['../../scripts/build.mjs', '../../scripts/lib/templates.mjs', '../../scripts/lib/util.mjs']) assert.doesNotMatch(fuente(f), /precioFinal|privado\/cierre|'cierre'\)/, f);
});
t('La ficha de la casa: el cierre se revisa, se guarda en privado/cierre y se borra si la casa vuelve a ofrecerse', () => {
	const H = '2026-11-28';
	assert.equal(faltaEnCierre({}, H), '');
	assert.equal(faltaEnCierre({ fechaCierre: '', precioFinal: 270000 }, H), 'Cierre: escribe la fecha.');
	assert.match(faltaEnCierre({ fechaCierre: '2026-12-05' }, H), /después de hoy/);
	assert.match(faltaEnCierre({ fechaCierre: '2026-11-26', precioFinal: -1 }, H), /mayor que cero/);
	assert.equal(faltaEnCierre({ fechaCierre: '2026-11-26', precioFinal: 270000 }, H), '');
	const vendida = { estado: 'vendida', operacion: 'venta', moneda: 'USD' };
	assert.deepEqual(cierrePorGuardar({ fechaCierre: '2026-11-26', precioFinal: '270000' }, vendida, { pedidoId: 'p9' }),
		{ fechaCierre: '2026-11-26', precioFinal: 270000, moneda: 'USD', operacion: 'venta', pedidoId: 'p9' });
	assert.equal(cierrePorGuardar({ fechaCierre: '2026-11-26' }, { ...vendida, estado: 'disponible' }, { fechaCierre: '2026-11-26' }), 'borrar');
	assert.equal(cierrePorGuardar({}, { ...vendida, estado: 'disponible' }, null), null);
	assert.equal(cierrePorGuardar({ fechaCierre: '' }, vendida, { fechaCierre: '2026-11-26' }), 'borrar');
	const f = fuente('views/properties.js');
	// El cierre nunca va al documento público de la casa.
	assert.match(f, /const cierreForm = d\.cierre \|\| \{\};\n\t\tdelete d\.cierre;/);
	assert.match(f, /const \{ socio = \{\}, acuerdo, cierre, \.\.\.datos \} = clonar\(f\);/);
	assert.match(f, /cierreGuardado = await guardarCierre\(ref\.id, /);
	// Cambiar el estado desde la lista (una o varias) borra el cierre de la que vuelve a ofrecerse, en el mismo lote.
	assert.match(f, /if \(cambios\.estado && !estaCerrada\(cambios\)\) lote\.delete\(doc\(db, 'properties', id, 'privado', 'cierre'\)\);/);
	assert.equal((f.match(/await loteDeEstado\(p\.id, cambios\)\.commit\(\);/g) || []).length, 2);
	// El socio no ve ni escribe el cierre (su ficha de casa nueva).
	assert.match(f, /startsWith\('cierre\.'\)/);
	assert.match(f, /let cierreGuardado = isNew \|\| paraSocio \? null :/);
});

console.log(`\n${ok} pruebas de reportes pasan.`);
