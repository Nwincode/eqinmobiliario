// El filtro de contacto de firestore.rules es el del navegador (js/calc-vacacional.js FILTRO_CONTACTO), escrito por
// scripts/reglas-contacto.mjs. El corpus que corre en las dos está en scripts/corpus-contacto.mjs (la regla, en
// scripts/emulador/test-reglas.mjs).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { reglasAlDia } from './reglas-contacto.mjs';

const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
assert.equal(reglasAlDia(reglas), reglas, 'firestore.rules: el filtro de contacto no está al día (node scripts/reglas-contacto.mjs)');
assert.match(reglas, /!tieneContacto\(request\.resource\.data\.texto\)/, 'los mensajes del chat pasan por el filtro');
console.log('Filtro de contacto de las reglas al día.');
