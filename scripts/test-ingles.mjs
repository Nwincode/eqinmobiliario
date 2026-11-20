// Pruebas de «Traducir al inglés»: lo que se manda a la IA lleva cada texto completo (se corta por texto, no el JSON) y
// una traducción con un texto vacío no deja la casa como traducida (admin/js/ingles.js).
import assert from 'node:assert/strict';
import { paraIA } from '../admin/js/para-ia.js';
import { acotado } from '../netlify/lib/tareas.mjs';
import { fuenteEs, faltaIngles, fuenteTraducida, textosSinTraducir } from '../admin/js/ingles.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };
const largo = (n, s) => `${s} `.repeat(Math.ceil(n / (s.length + 1))).slice(0, n);
const casa = {
	id: 'c1', titulo: 'Casa frente al mar en Monterrico', operacion: 'vacacional', tipo: 'casa', moneda: 'USD', precio: 180,
	descripcion: largo(6000, 'Casa amplia con piscina, rancho y vista al mar.'),
	vacacional: { checkIn: '15:00', comoLlegar: largo(1500, 'Desde la Avenida Reforma tome la CA-9.'), reglas: largo(2000, 'No se permiten fiestas.'), cancelacion: largo(1500, 'Reembolso total hasta 7 días antes.') }
};

t('con la descripción más larga que deja guardar el dueño, reglas y cancelación llegan completas a la IA', () => {
	const enviado = JSON.stringify(acotado(paraIA({ propiedad: casa }).propiedad));
	for (const k of ['comoLlegar', 'reglas', 'cancelacion']) assert.ok(enviado.includes(JSON.stringify(casa.vacacional[k])), k);
	assert.ok(enviado.includes(JSON.stringify(casa.descripcion)));
});

t('cada texto tiene su tope, y las listas y la profundidad también', () => {
	const r = acotado({ a: 'x'.repeat(20000), l: Array.from({ length: 100 }, (_, i) => i), n: 3, b: true, f: () => 1, d: { e: { f: { g: { h: { i: 'hondo' } } } } } });
	assert.equal(r.a.length, 12000);
	assert.equal(r.l.length, 60);
	assert.equal(r.n, 3);
	assert.equal(r.b, true);
	assert.ok(!('f' in r));
	assert.equal(JSON.stringify(r.d).includes('hondo'), false);
});

t('si la cancelación volvió vacía, la casa no queda como traducida y se vuelve a traducir', () => {
	const r = { titulo: 'Beachfront house in Monterrico', descripcion: 'Large house…', comoLlegar: 'From…', reglas: 'No parties.', cancelacion: '' };
	assert.deepEqual(textosSinTraducir(casa, r), ['cancelacion']);
	assert.equal(fuenteTraducida(casa, r), '');
	assert.equal(faltaIngles({ ...casa, en: { titulo: r.titulo, descripcion: r.descripcion, fuente: fuenteTraducida(casa, r) } }), true);
});

t('con todo traducido, la fuente es el español de hoy (y ya no falta el inglés)', () => {
	const r = { titulo: 'Beachfront house', descripcion: 'Large house…', comoLlegar: 'From…', reglas: 'No parties.', cancelacion: 'Full refund…' };
	assert.equal(fuenteTraducida(casa, r), fuenteEs(casa));
	assert.equal(faltaIngles({ ...casa, en: { titulo: r.titulo, descripcion: r.descripcion, fuente: fuenteTraducida(casa, r) } }), false);
	// Un texto que no existe en español no hace falta en inglés.
	assert.deepEqual(textosSinTraducir({ titulo: 'Casa', descripcion: 'Linda' }, { titulo: 'House', descripcion: 'Nice' }), []);
});

console.log(`\n${ok} pruebas del inglés pasan.`);
