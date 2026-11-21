// Escenarios de los permisos del socio (admin/js/permisos-socio.js). Sin red: `node scripts/test-permisos-socio.mjs`.
import assert from 'node:assert/strict';
import { deudaDe, faltaSaberSiPago, permisosDe, limpiarDevolver, documentoPermisos, mismosPermisos, puede, DIAS_CORTE } from '../admin/js/permisos-socio.js';

let ok = 0;
function test(nombre, fn) {
	try { fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${err.stack}`); process.exitCode = 1; }
}
const H = 3600000;
// Fin del día de llegada en Guatemala (UTC−6): ahí empieza a contar el atraso.
const finDe = (fecha) => Date.parse(`${fecha}T00:00:00-06:00`) + 24 * H;
const res = (id, extra = {}, comision = {}) => ({ id, propietarioId: 's1', estado: 'confirmada', moneda: 'USD',
	comision: { monto: 50, vence: '2026-11-09', pagada: false, ...comision }, ...extra });
const todo = { precios: true, fechas: true, casa: true };
const nada = { precios: false, fechas: false, casa: false };
const solo = (p) => ({ precios: p.precios, fechas: p.fechas, casa: p.casa });

test('al día: puede todo y no hay deuda', () => {
	const d = deudaDe([res('a', {}, { pagada: true })], 's1', finDe('2026-11-09') + 20 * 24 * H);
	assert.equal(d, null);
	assert.deepEqual(solo(permisosDe({ deuda: d })), todo);
});
test('vencida 6 días y 23 h: debe, pero todavía no se corta', () => {
	const d = deudaDe([res('a')], 's1', finDe('2026-11-09') + (DIAS_CORTE * 24 - 1) * H);
	assert.equal(d.corta, false);
	assert.equal(d.dias, 6);
	assert.deepEqual(solo(permisosDe({ deuda: d })), todo);
});
test('con chat y sin prueba de pago: el corte cuenta desde que ya no hay «No me llegó» (llegada + 3)', () => {
	const r = res('a', { chat: 'TokenDelChat', llegada: '2026-11-09' });
	// Llegada + 3 + 6 días 23 h: todavía no; llegada + 3 + 7 días: sí.
	assert.equal(deudaDe([r], 's1', finDe('2026-11-12') + (DIAS_CORTE * 24 - 1) * H).corta, false);
	assert.equal(deudaDe([r], 's1', finDe('2026-11-12') + DIAS_CORTE * 24 * H).corta, true);
});
test('a los 7 días exactos se cortan los tres', () => {
	const d = deudaDe([res('a')], 's1', finDe('2026-11-09') + DIAS_CORTE * 24 * H);
	assert.equal(d.corta, true);
	const p = permisosDe({ deuda: d });
	assert.deepEqual(solo(p), nada);
	assert.equal(p.motivo, 'atraso');
});
test('el día de llegada no cuenta: vence al terminar ese día (hora de Guatemala)', () => {
	const d = deudaDe([res('a')], 's1', Date.parse('2026-11-09T23:59:00-06:00'));
	assert.equal(d, null);
});
test('dos deudas en monedas distintas: se suman por moneda y manda la más vieja', () => {
	const ahora = finDe('2026-11-09') + 8 * 24 * H;
	const d = deudaDe([res('a'), res('b', { moneda: 'GTQ' }, { monto: 300, vence: '2026-11-12' }), res('c', {}, { monto: 25.5, vence: '2026-11-15' })], 's1', ahora);
	assert.deepEqual(d.porMoneda, { USD: 75.5, GTQ: 300 });
	assert.equal(d.vence, '2026-11-09');
	assert.equal(d.dias, 8);
	assert.equal(d.corta, true);
});
test('pagó la vieja y la otra tiene 3 días: se encienden solos', () => {
	const ahora = finDe('2026-11-09') + 8 * 24 * H;
	const d = deudaDe([res('a', {}, { pagada: true }), res('b', {}, { vence: '2026-11-14' })], 's1', ahora);
	assert.equal(d.corta, false);
	assert.deepEqual(solo(permisosDe({ deuda: d })), todo);
});
test('reserva cancelada o «no se dio»: su comisión ya no cuenta', () => {
	const ahora = finDe('2026-11-09') + 9 * 24 * H;
	assert.equal(deudaDe([res('a', { estado: 'cancelada' }), res('b', { estado: 'no' })], 's1', ahora), null);
});
test('comisión sin monto o en cero: no es deuda', () => {
	const ahora = finDe('2026-11-09') + 9 * 24 * H;
	assert.equal(deudaDe([res('a', {}, { monto: 0 }), res('b', {}, { monto: '' })], 's1', ahora), null);
});
test('la deuda de otro socio no lo corta (casa que cambió de dueño: la reserva sigue con quien la ganó)', () => {
	const ahora = finDe('2026-11-09') + 9 * 24 * H;
	assert.equal(deudaDe([res('a', { propietarioId: 'anterior' })], 's1', ahora), null);
	assert.equal(deudaDe([res('a')], '', ahora), null);
});
test('«Devolver hasta que pague»: con corte, puede todo y queda marcado como devuelto', () => {
	const d = deudaDe([res('a')], 's1', finDe('2026-11-09') + 9 * 24 * H);
	const p = permisosDe({ propio: { devolver: true }, deuda: d });
	assert.deepEqual(solo(p), todo);
	assert.equal(p.devuelto, true);
	assert.equal(limpiarDevolver({ devolver: true }, d), false);
});
test('al pagar, «devolver» se quita solo: una deuda nueva vuelve a cortar a los 7 días', () => {
	assert.equal(limpiarDevolver({ devolver: true }, null), true);
	const nueva = deudaDe([res('n', {}, { vence: '2026-12-01' })], 's1', finDe('2026-12-01') + 7 * 24 * H);
	assert.deepEqual(solo(permisosDe({ propio: { devolver: false }, deuda: nueva })), nada);
});
test('«devolver» no enciende lo que el administrador apagó a mano ni lo apagado para todos', () => {
	const d = deudaDe([res('a')], 's1', finDe('2026-11-09') + 9 * 24 * H);
	const p = permisosDe({ global: { casa: false }, propio: { devolver: true, precios: false }, deuda: d });
	assert.deepEqual(solo(p), { precios: false, fechas: true, casa: false });
});
test('apagado a mano para él: sigue apagado aunque esté al día; lo demás sigue', () => {
	const p = permisosDe({ propio: { fechas: false } });
	assert.deepEqual(solo(p), { precios: true, fechas: false, casa: true });
	assert.equal(p.motivo, 'propio');
});
test('apagado para todos: gana sobre lo suyo encendido', () => {
	const p = permisosDe({ global: { precios: false }, propio: { precios: true } });
	assert.equal(p.precios, false);
	assert.equal(p.motivo, 'todos');
});
test('sin documento guardado se puede todo (antes de publicar las reglas o sin corte)', () => {
	assert.equal(puede(null, 'precios'), true);
	assert.equal(puede({ precios: false }, 'precios'), false);
	assert.equal(puede({ precios: true }, 'fechas'), true);
});
test('lo guardado con los mapas en otro orden cuenta como lo mismo (no se reescribe cada hora)', () => {
	const d = deudaDe([res('a'), res('b', { moneda: 'GTQ' })], 's1', finDe('2026-11-09') + 9 * 24 * H);
	const doc = documentoPermisos(permisosDe({ deuda: d }), d);
	const leido = { deuda: { vence: doc.deuda.vence, porMoneda: { GTQ: 50, USD: 50 }, dias: doc.deuda.dias }, casa: false, motivo: 'atraso', precios: false, fechas: false, devuelto: false, actualizado: 'x' };
	assert.equal(mismosPermisos(leido, doc), true);
	assert.equal(mismosPermisos({ ...leido, precios: true }, doc), false);
	assert.equal(mismosPermisos(null, doc), false);
});

test('una confirmada de la web sin «Pago recibido» no corta sola; con el pago marcado o «Cobrar comisión», sí', () => {
	const ahora = finDe('2026-11-09') + DIAS_CORTE * 24 * H;
	const web = (extra = {}, com = {}) => res('a', { chat: 'TokenDelChat', ...extra }, com);
	const sinPago = deudaDe([web()], 's1', ahora);
	assert.equal(sinPago.corta, false);
	assert.ok(sinPago.porMoneda.USD > 0);
	assert.equal(deudaDe([web({ pagoRecibido: true })], 's1', ahora).corta, true);
	assert.equal(deudaDe([web({}, { cobrar: true })], 's1', ahora).corta, true);
	assert.equal(deudaDe([web({ chatPagado: true })], 's1', ahora).corta, true);
	assert.equal(faltaSaberSiPago(web(), 's1', ahora), true);
	assert.equal(faltaSaberSiPago(web({ pagoRecibido: true }), 's1', ahora), false);
	// Se lee el chat desde que vence (no solo a los 7 días): la pausa de 72 h lo necesita antes (V.faltaLeerChat).
	assert.equal(faltaSaberSiPago(web(), 's1', finDe('2026-11-09') + H), true);
	assert.equal(faltaSaberSiPago(web(), 's1', finDe('2026-11-09') - H), false);
});

console.log(`Permisos del socio: ${ok} escenarios bien.`);
