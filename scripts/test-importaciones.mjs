// Cada nombre que un módulo del panel importa de otro módulo del panel existe en ese módulo (si no, la pantalla entera
// no carga: «does not provide an export named …», y la sintaxis sola no lo ve). Revisa admin/js y sus pantallas.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const RAIZ = new URL('../admin/js/', import.meta.url).pathname;
const archivos = [...readdirSync(RAIZ).filter((f) => f.endsWith('.js')).map((f) => path.join(RAIZ, f)),
	...readdirSync(path.join(RAIZ, 'views')).filter((f) => f.endsWith('.js')).map((f) => path.join(RAIZ, 'views', f))];
const cache = new Map();
function exportados(archivo) {
	if (cache.has(archivo)) return cache.get(archivo);
	const s = readFileSync(archivo, 'utf8');
	const nombres = new Set();
	for (const m of s.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) nombres.add(m[1]);
	for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) for (const p of m[1].split(',')) { const n = p.trim().split(/\s+as\s+/).pop(); if (n) nombres.add(n); }
	if (/export\s+default/.test(s)) nombres.add('default');
	// export * from: lo de ese módulo también.
	for (const m of s.matchAll(/export\s+\*\s+from\s+'(\.[^']+)'/g)) for (const n of exportados(path.resolve(path.dirname(archivo), m[1]))) nombres.add(n);
	cache.set(archivo, nombres);
	return nombres;
}
const faltan = [];
for (const f of archivos) {
	const s = readFileSync(f, 'utf8');
	for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.{1,2}\/[^']+\.js)'/g)) {
		const destino = path.resolve(path.dirname(f), m[2]);
		const hay = exportados(destino);
		for (const p of m[1].split(',')) {
			const n = p.trim().split(/\s+as\s+/)[0];
			if (n && !hay.has(n)) faltan.push(`${path.relative(RAIZ, f)}: «${n}» no está en ${path.relative(RAIZ, destino)}`);
		}
	}
}
assert.deepEqual(faltan, [], `importaciones que no existen:\n${faltan.join('\n')}`);
console.log(`✓ ${archivos.length} módulos del panel: todo lo que importan existe.`);
