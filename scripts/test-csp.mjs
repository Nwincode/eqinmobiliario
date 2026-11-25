// La regla de seguridad del panel (Content-Security-Policy de /admin/* en netlify.toml): existe, no tiene comodines y
// el panel no trae código que ella bloquearía (scripts en línea, onclick=…). La lee la misma pieza que usa el entorno
// de pruebas (scripts/lib/encabezados.mjs), así que lo que se prueba es lo que se publica. Sin dependencias.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encabezadosPara, leerEncabezados, directivas } from './lib/encabezados.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0;
function test(nombre, fn) {
	try { fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${err.stack}`); process.exitCode = 1; }
}

const reglaPanel = leerEncabezados().find((r) => r.para === '/admin/*')?.valores['Content-Security-Policy'];
const d = directivas(reglaPanel);
const archivos = (dir) => readdirSync(path.join(RAIZ, dir), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));

test('el panel tiene su regla y le llega a /admin/ (y a sus archivos)', () => {
	assert.ok(reglaPanel, 'falta Content-Security-Policy en [[headers]] for = "/admin/*"');
	assert.match(encabezadosPara('/admin/')['Content-Security-Policy'], /script-src 'self'/);
	assert.match(encabezadosPara('/admin/js/app.js')['Content-Security-Policy'], /script-src 'self'/);
	assert.ok(!/script-src/.test(encabezadosPara('/propiedades/')['Content-Security-Policy'] || ''), 'la regla estricta es solo del panel');
});

test('sin comodines: ningún «*» y nada abierto a un esquema entero (salvo imágenes por enlace)', () => {
	for (const [k, v] of Object.entries(d)) {
		assert.ok(!v.some((x) => x.includes('*')), `${k} tiene un comodín`);
		if (k !== 'img-src') assert.ok(!v.some((x) => /^[a-z][a-z0-9+.-]*:$/i.test(x) && x !== 'blob:'), `${k} abre un esquema entero: ${v.join(' ')}`);
	}
	for (const k of ['default-src', 'script-src', 'connect-src']) assert.ok(!d[k].includes('blob:') && !d[k].includes('data:'), `${k} con blob: o data:`);
});

test('scripts: solo los propios y el SDK de Firebase; nada en línea', () => {
	assert.deepEqual(d['default-src'], ["'self'"]);
	assert.ok(!d['script-src'].includes("'unsafe-inline'"), "script-src con 'unsafe-inline'");
	assert.deepEqual(d['script-src'].filter((x) => !x.startsWith("'")), ['https://www.gstatic.com/firebasejs/']);
	assert.deepEqual(d['object-src'], ["'none'"]);
	for (const k of ['base-uri', 'frame-ancestors', 'form-action']) assert.deepEqual(d[k], ["'self'"], k);
});

test('cada servicio de fuera que el panel llama está permitido (y nada más)', () => {
	const usados = new Set();
	for (const f of archivos('admin/js')) {
		const t = readFileSync(path.join(RAIZ, f), 'utf8');
		for (const m of t.matchAll(/fetch\(\s*[`'"](https:\/\/[a-z0-9.-]+)/g)) usados.add(m[1]);
	}
	const firebase = ['https://firestore.googleapis.com', 'https://firebasestorage.googleapis.com', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com'];
	assert.deepEqual(d['connect-src'].filter((x) => x !== "'self'").sort(), [...new Set([...firebase, ...usados])].sort());
});

test('el HTML del panel no trae scripts en línea ni onclick=…', () => {
	const html = readFileSync(path.join(RAIZ, 'admin/index.html'), 'utf8');
	assert.ok(![...html.matchAll(/<script\b([^>]*)>/g)].some((m) => !/\bsrc=/.test(m[1])), 'un <script> sin src en admin/index.html');
	assert.ok(!/\son[a-z]+\s*=/i.test(html), 'un on…= en admin/index.html');
	// Lo que el panel escribe como HTML (p. ej. el PDF del listado, que abre en una ventana que hereda la regla).
	for (const f of archivos('admin/js')) {
		const t = readFileSync(path.join(RAIZ, f), 'utf8');
		assert.ok(!/<script>/.test(t), `${f}: <script> en línea`);
		assert.ok(!/<[a-z][^<>]*\son(click|load|error|change|input|submit)\s*=/i.test(t), `${f}: on…= en un HTML`);
	}
});

console.log(`\n${ok} pruebas correctas${process.exitCode ? ' (con fallas)' : ''}.`);
