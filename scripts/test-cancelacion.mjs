// Pruebas de admin/js/cancelacion.js: la política de cancelación de una casa por noche y su texto en los dos idiomas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POLITICAS_CANCELACION, VALORES_CANCELACION, opcionesCancelacion, textoCancelacion } from '../admin/js/cancelacion.js';
import { vacacionalPublico } from '../admin/js/cambios-casa.js';
import { CAMPOS_DUENO, textoValor } from '../admin/js/mi-casa.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };

t('tres políticas, cada una con su línea en español e inglés', () => {
	assert.deepEqual(VALORES_CANCELACION, ['flexible', 'moderada', 'estricta']);
	for (const p of POLITICAS_CANCELACION) for (const l of ['es', 'en']) assert.ok(p[l][0] && p[l][1].endsWith('.'));
	assert.deepEqual(opcionesCancelacion()[1], ['moderada', 'Moderada', 'Hasta 5 días antes, todo de vuelta; después, la mitad.']);
});

t('texto: la política y la nota; lo de antes (solo texto) queda como nota', () => {
	assert.equal(textoCancelacion('flexible', ''), 'Flexible: Cancela hasta 24 h antes de llegar y recibe todo de vuelta.');
	assert.equal(textoCancelacion('estricta', 'En Semana Santa no hay devolución.', 'en'),
		'Strict: Half refunded up to 14 days before check-in; after that, no refund. En Semana Santa no hay devolución.');
	assert.equal(textoCancelacion('', 'Sin reembolso después de confirmar.'), 'Sin reembolso después de confirmar.');
	assert.equal(textoCancelacion(undefined, ''), '');
	assert.equal(textoCancelacion('otra', ''), '');
});

t('se guarda con la casa (vacacionalPublico) y el dueño la cambia en «La casa»', () => {
	assert.equal(vacacionalPublico({ socio: { precioBase: 100 }, vacacional: { cancelacionPolitica: 'moderada' } }).vacacional.cancelacionPolitica, 'moderada');
	assert.ok(!('cancelacionPolitica' in vacacionalPublico({ socio: { precioBase: 100 }, vacacional: {} }).vacacional));
	assert.ok(CAMPOS_DUENO.some((c) => c.ruta === 'vacacional.cancelacionPolitica'));
	assert.equal(textoValor('cancelacionPolitica', 'estricta'), 'Estricta');
	assert.equal(textoValor('cancelacionPolitica', ''), 'Sin elegir');
});

t('la página de la casa y la respuesta sugerida del chat usan el mismo texto', () => {
	assert.match(readFileSync('scripts/lib/templates.mjs', 'utf8'), /textoCancelacion\(v\.cancelacionPolitica, v\.cancelacion, lng\(p\)\)/);
	assert.match(readFileSync('netlify/lib/sugerir-respuesta.mjs', 'utf8'), /cancelacion: textoCancelacion\(v\.cancelacionPolitica, v\.cancelacion\)/);
});

console.log(`${ok} pruebas de la política de cancelación correctas`);
