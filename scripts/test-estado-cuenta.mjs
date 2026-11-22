// Pruebas del estado de cuenta mensual del socio (admin/js/estado-cuenta.js y netlify/functions/estado-cuenta.mjs): las
// cuentas por moneda (las mismas de Rentas: V.resumenReservas), el mes anterior en Guatemala, que no se repita y que lo
// que no salió salga en la siguiente vuelta. Base y correo simulados.
import './simulado/activar.mjs';
import '../js/calc-vacacional.js';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer } from './simulado/base.mjs';

const V = globalThis.EQVacacional;
const { estadoDeCuenta, mesAnterior } = await import('../admin/js/estado-cuenta.js');
const { mandarEstadosDeCuenta } = await import('../netlify/functions/estado-cuenta.mjs');

let n = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); n++; console.log('✓', nombre); };
const res = (id, o) => ({ id, propietarioId: 'p1', estado: 'confirmada', propertyTitulo: 'Casa Lago', codigo: `EQ-${id}`, salida: '2026-10-12', costoSocio: 100, alojamiento: 120, moneda: 'USD', ...o });
const RESERVAS = [
	res('a', { llegada: '2026-10-10', comision: { monto: 20, pagada: true } }),
	res('b', { llegada: '2026-10-20', salida: '2026-10-23', comision: { monto: 30.5, pagada: false } }),
	res('c', { llegada: '2026-10-05', moneda: 'GTQ', costoSocio: 800, alojamiento: 960, comision: { monto: 160, pagada: false } }),
	res('d', { llegada: '2026-10-07', estado: 'cancelada', comision: { monto: 99 } }),
	res('e', { llegada: '2026-11-01', comision: { monto: 50 } }),
	res('f', { llegada: '2026-10-15', salida: '2026-10-16', propietarioId: 'p2', comision: { monto: 70 } }),
	res('g', { llegada: '2026-10-25', salida: '2026-10-25', comision: { monto: 5 } })
];

await t('el mes anterior, también en enero', () => {
	assert.equal(mesAnterior('2026-11-01'), '2026-10');
	assert.equal(mesAnterior('2027-01-01'), '2026-12');
});

await t('por moneda, sin sumar Q y US$; sin canceladas, sin otro mes ni otro socio; su parte igual a la de Rentas', () => {
	const c = estadoDeCuenta(RESERVAS, 'p1', '2026-10');
	assert.equal(c.total, 3);
	assert.deepEqual(c.reservas.map((r) => r.id), ['c', 'a', 'b']);
	assert.deepEqual(c.porMoneda.USD, { tuParte: 200, comision: 50.5, pagada: 20, pendiente: 30.5 });
	assert.deepEqual(c.porMoneda.GTQ, { tuParte: 800, comision: 160, pagada: 0, pendiente: 160 });
	const rentas = V.resumenReservas(RESERVAS.filter((r) => r.propietarioId === 'p1' && r.llegada.startsWith('2026-10')));
	assert.equal(c.porMoneda.USD.tuParte, rentas.porMoneda.USD.costoSocio);
	assert.equal(c.noches, rentas.noches);
});

await t('el día 1 sale un correo por socio con reservas; la segunda vuelta no lo repite', async () => {
	S.reloj = Date.parse('2026-11-01T07:40:00-06:00');
	poner('propietarios/p1', { nombre: 'Ana López', email: 'ana@correo.com' });
	poner('propietarios/p2', { nombre: 'Luis', email: 'luis@correo.com' });
	poner('propietarios/p3', { nombre: 'Sin reservas', email: 'x@correo.com' });
	for (const r of RESERVAS) poner(`reservas/${r.id}`, r);
	assert.equal(await mandarEstadosDeCuenta(S.reloj), 2);
	assert.deepEqual(S.salida.map((m) => m.para).sort(), ['ana@correo.com', 'luis@correo.com']);
	const ana = S.salida.find((m) => m.para === 'ana@correo.com').texto;
	assert.match(ana, /Pendiente de pagar a EQ: US\$ 30\.50/);
	assert.match(ana, /Pendiente de pagar a EQ: Q 160\.00/);
	assert.equal(leer('estadosCuenta/p1_2026-10').enviado, true);
	assert.equal(await mandarEstadosDeCuenta(S.reloj + 86_400_000), 0);
	assert.equal(S.salida.length, 2);
});

await t('si el correo falla, queda suelto y sale en la vuelta del día 2', async () => {
	S.reloj = Date.parse('2026-11-01T07:40:00-06:00');
	poner('propietarios/p1', { nombre: 'Ana', email: 'ana@correo.com' });
	poner('reservas/a', RESERVAS[0]);
	const correo = await import('./simulado/correo.mjs');
	S.correoFalla = true;
	assert.equal(await mandarEstadosDeCuenta(S.reloj), 0);
	assert.equal(leer('estadosCuenta/p1_2026-10').enviado, false);
	S.correoFalla = false;
	assert.equal(await mandarEstadosDeCuenta(S.reloj + 86_400_000), 1);
	assert.ok(correo);
});

console.log(`${n} pruebas del estado de cuenta pasan.`);
