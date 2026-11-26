// Los encabezados de netlify.toml ([[headers]]), leídos de un solo lugar: el entorno de pruebas los aplica igual que
// Netlify (scripts/entorno/servidor.mjs) y scripts/test-csp.mjs revisa la regla de seguridad del panel. Así nadie
// copia la regla a mano y lo que se prueba es lo que se publica.
import { readFileSync } from 'node:fs';

// [{ para: '/admin/*', valores: { 'Cache-Control': 'no-store', … } }, …] en el orden del archivo.
export function leerEncabezados(archivo = new URL('../../netlify.toml', import.meta.url)) {
	const reglas = [];
	let actual = null, enValores = false;
	for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
		const t = linea.trim();
		if (!t || t.startsWith('#')) continue;
		if (t.startsWith('[')) {
			if (t === '[[headers]]') reglas.push(actual = { para: '', valores: {} });
			else if (t !== '[headers.values]') actual = null;
			enValores = Boolean(actual) && t === '[headers.values]';
			continue;
		}
		const m = actual && t.match(/^([\w-]+)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(#.*)?$/);
		if (!m) continue;
		if (enValores) actual.valores[m[1]] = m[2].replace(/\\(.)/g, '$1');
		else if (m[1] === 'for') actual.para = m[2];
	}
	return reglas;
}

// ¿La ruta cae en el patrón? «/admin/*» vale para /admin/ y todo lo de adentro; «/*», para todo.
const coincide = (patron, ruta) => new RegExp(`^${patron.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(ruta);

// Los encabezados de una ruta. Un mismo encabezado en dos reglas que coinciden se junta con «, »: en
// Content-Security-Policy son dos reglas y el navegador cumple las dos (la más estricta gana en cada punto).
export function encabezadosPara(ruta, reglas = leerEncabezados()) {
	const fuera = {};
	for (const { para, valores } of reglas) {
		if (!coincide(para, ruta)) continue;
		for (const [k, v] of Object.entries(valores)) fuera[k] = v; // Como Netlify: el mismo encabezado en dos reglas, gana la de abajo.
	}
	return fuera;
}

// «default-src 'self'; script-src …» → { 'default-src': ["'self'"], 'script-src': […] } (una sola regla).
export const directivas = (csp) => Object.fromEntries(String(csp || '').split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k.toLowerCase(), v]));
