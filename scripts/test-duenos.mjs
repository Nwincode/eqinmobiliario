// Pruebas de admin/js/duenos.js: casas de cada persona, exclusiva por inmueble y lo que llega a su panel.
import assert from 'node:assert/strict';
import { casasDe, vaAlResumen, exclusivaHasta, datosDelDueno, etiquetaDueno, tieneCasasPorNoche, enlaceSeguro, reglasNuevasSegun } from '../admin/js/duenos.js';
import { mapearDueno } from '../admin/js/importar.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };

const casas = [
	{ id: 'v1', operacion: 'venta', propietarioId: 'p1' },
	{ id: 'n1', operacion: 'vacacional', propietarioId: 'p1' },
	{ id: 'r1', operacion: 'renta' },
	{ id: 'x9', operacion: 'venta', propietarioId: 'otro' }
];
const p1 = { id: 'p1', propiedades: [{ propertyId: 'r1' }] };

t('Casas de una persona: por propietarioId y por su lista, nunca las de otro', () => {
	assert.deepEqual(casasDe(p1, casas).map((c) => c.id), ['v1', 'n1', 'r1']);
});
t('Al resumen de venta y renta no van las casas por noche', () => {
	assert.deepEqual(casasDe(p1, casas).filter(vaAlResumen).map((c) => c.id), ['v1', 'r1']);
});
t('La exclusiva es de cada inmueble: cada casa con su fecha', () => {
	const dueno = { id: 'p1' };
	assert.equal(exclusivaHasta({ exclusiva: true, exclusivaFin: '2027-01-31' }, dueno, 'venta'), '2027-01-31');
	assert.equal(exclusivaHasta({ exclusiva: false, exclusivaFin: '2027-01-31' }, dueno, 'renta'), '');
	assert.equal(exclusivaHasta(null, dueno, 'venta'), '');
});
t('Sin acuerdo propio vale lo que quedó en la persona (datos de antes)', () => {
	assert.equal(exclusivaHasta(null, { exclusiva: true, exclusivaFin: '2026-12-01' }, 'venta'), '2026-12-01');
});
t('Si no se pudo leer el acuerdo, queda la fecha anterior (no cambia según quién arma el resumen)', () => {
	assert.equal(exclusivaHasta(undefined, {}, 'venta', '2027-05-05'), '2027-05-05');
	assert.equal(exclusivaHasta(undefined, {}, 'venta'), '');
});
t('Datos del dueño: correo en minúsculas y datos de pago tal cual (las reglas los comparan exactos)', () => {
	const pago = '  Banco X, cuenta 1\nA nombre de Ana  ';
	const d = datosDelDueno({ nombre: ' Ana Pérez ', email: ' Ana@X.GT ', telefono: '+502 5555 0001', datosPago: pago, notas: 'interna', bitacora: [1], portalPrivado: {} });
	assert.equal(d.email, 'ana@x.gt');
	assert.equal(d.datosPago, pago);
	assert.equal(d.nombre, 'Ana Pérez');
	assert.deepEqual(Object.keys(d).sort(), ['datosPago', 'email', 'nombre', 'telefono', 'tipo']);
});
t('Colaborador o propietario: el tipo y la etiqueta salen de la ficha', () => {
	assert.equal(datosDelDueno({ tipo: 'colaborador' }).tipo, 'colaborador');
	assert.equal(datosDelDueno({ tipo: 'socio' }).tipo, 'propietario');
	assert.equal(etiquetaDueno('colaborador'), 'Colaborador');
	assert.equal(etiquetaDueno('propietario'), 'Propietario');
	assert.equal(etiquetaDueno(undefined), 'Propietario');
	assert.ok(tieneCasasPorNoche({ tipo: 'socio' }) && tieneCasasPorNoche({ porNoche: true }) && !tieneCasasPorNoche({ tipo: 'colaborador' }));
});
t('Reglas nuevas solo si la lectura sin sesión se niega (403 PERMISSION_DENIED); 404, 200, otro error o sin red = reglas de antes', () => {
	const negado = { error: { code: 403, status: 'PERMISSION_DENIED' } };
	assert.equal(reglasNuevasSegun(403, negado), true);
	assert.equal(reglasNuevasSegun(403, null), false);
	assert.equal(reglasNuevasSegun(403, { error: { status: 'UNAUTHENTICATED' } }), false);
	for (const s of [404, 200, 500, 0, undefined]) assert.equal(reglasNuevasSegun(s, negado), false);
});
t('Solo enlaces seguros: https o del mismo sitio', () => {
	assert.equal(enlaceSeguro('https://x.gt/a.jpg'), 'https://x.gt/a.jpg');
	assert.equal(enlaceSeguro('/images/a.webp'), '/images/a.webp');
	for (const u of ['javascript:alert(1)', '//otro.com/a', 'http://x.gt', 'data:image/png;base64,xx', null]) assert.equal(enlaceSeguro(u), '');
});
t('El importador enlaza al dueño solo con una ficha que coincide sin duda', () => {
	const duenos = [{ id: 'a', nombre: 'Ana Pérez', telefono: '+502 5555 0001' }, { id: 'b', nombre: 'Ana Perez', telefono: '+502 5555 0002' }, { id: 'c', nombre: 'Luis Gómez', telefono: '5555 0003', email: 'luis@x.com' }];
	assert.equal(mapearDueno('+502 5555-0001', duenos), 'a');
	assert.equal(mapearDueno('55550003', duenos), 'c');
	assert.equal(mapearDueno('luis gomez', duenos), 'c');
	assert.equal(mapearDueno('Ana Pérez', duenos), 'ambiguo');
	assert.equal(mapearDueno('0001', duenos), null);
	assert.equal(mapearDueno('Ana', duenos), null);
	assert.equal(mapearDueno('', duenos), '');
});
console.log(`\n${ok} pruebas de dueños correctas.`);
