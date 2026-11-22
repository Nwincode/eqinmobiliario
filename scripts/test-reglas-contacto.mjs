// El filtro de contacto de firestore.rules es el del navegador (js/calc-vacacional.js FILTRO_CONTACTO), escrito por
// scripts/reglas-contacto.mjs. El corpus que corre en las dos está en scripts/corpus-contacto.mjs (la regla, en
// scripts/emulador/test-reglas.mjs).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { reglasAlDia, calcAlDia } from './reglas-contacto.mjs';

const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const calc = readFileSync(new URL('../js/calc-vacacional.js', import.meta.url), 'utf8');
assert.equal(calcAlDia(calc), calc, 'js/calc-vacacional.js: los códigos de país no están al día (node scripts/reglas-contacto.mjs)');
assert.equal(reglasAlDia(reglas), reglas, 'firestore.rules: el filtro de contacto no está al día (node scripts/reglas-contacto.mjs)');
assert.match(reglas, /!tieneContacto\(request\.resource\.data\.texto\)/, 'los mensajes del chat pasan por el filtro');
// Lo que el compilador de reglas de Firestore no acepta dentro de una clase («[(\\[]», «[\\])}>]»): fallaba al publicar
// las reglas, y npm test no lo veía (solo el emulador). Se escribe como alternativa: «(\\(|\\[)».
await import('../js/calc-vacacional.js');
// Y ninguno pasa de 4096 letras con su envoltura (el compilador de reglas lo rechaza: «Regular expression too long»).
for (const [, patron] of globalThis.EQVacacional.FILTRO_CONTACTO) assert.ok(`[\\s\\S]*(?:${patron})[\\s\\S]*`.length <= 4096, `patrón de ${patron.length} letras: ${patron.slice(0, 60)}…`);
for (const [, patron] of globalThis.EQVacacional.FILTRO_CONTACTO) {
	let clase = false;
	for (let i = 0; i < patron.length; i++) {
		const c = patron[i];
		if (c === '\\') { if (/[pP]/.test(patron[i + 1]) && patron[i + 2] === '{') { i = patron.indexOf('}', i); continue; } if (clase && /[(){}]/.test(patron[i + 1])) assert.fail(`«${patron[i + 1]}» dentro de una clase: ${patron.slice(Math.max(0, i - 20), i + 20)}`); i++; continue; }
		if (c === '[' && !clase) clase = true; else if (c === ']' && clase) clase = false;
		else if (clase && /[(){}]/.test(c)) assert.fail(`«${c}» dentro de una clase: ${patron.slice(Math.max(0, i - 20), i + 20)}`);
	}
}
console.log('Filtro de contacto de las reglas al día.');
