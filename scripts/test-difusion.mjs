// Pruebas de admin/js/difusion.js (el kit para portales): el enlace a la ficha de cada portal. firebase.js se cambia por
// uno fijo (sin red), las rutas «/js/…» del navegador van a la carpeta del sitio y ui.js recibe un DOM mínimo para cargar.
import assert from 'node:assert/strict';
import { register } from 'node:module';

const RAIZ = new URL('..', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) {
	if (/\\/firebase\\.js$/.test(s)) return { url: 'data:text/javascript,export const SITIO="https://eqinmobiliario.gt";export const db={};', shortCircuit: true };
	if (s.startsWith('/js/')) return n('${RAIZ}' + s.slice(1), c);
	return n(s, c);
}`)}`);
globalThis.Element = class {}; globalThis.Element.prototype.replaceChildren = () => {};
globalThis.document = { addEventListener() {}, createElement: () => ({}) }; globalThis.window = globalThis;
const { enlaceFicha, portalesDe } = await import('../admin/js/difusion.js');

let ok = 0;
const t = (nombre, fn) => { try { fn(); ok++; console.log(`✓ ${nombre}`); } catch (err) { console.error(`✗ ${nombre}\n${err.message}`); process.exitCode = 1; } };
const portales = portalesDe({});
const es = portales.find((p) => p.idioma !== 'en'), en = portales.find((p) => p.idioma === 'en');

t('portal en inglés: a la página en inglés solo si la casa está traducida (título y descripción); si no, a la de español (no a un 404)', () => {
	const sin = { slug: 'casa-del-socio', titulo: 'Casa del socio' };
	const trad = { titulo: 'Partner house', descripcion: 'Nice.' };
	assert.match(enlaceFicha(sin, en), /^https:\/\/eqinmobiliario\.gt\/propiedad\/casa-del-socio\/\?utm_source=/);
	assert.match(enlaceFicha({ ...sin, en: { titulo: 'Partner house' } }, en), /\/propiedad\/casa-del-socio\//, 'sin descripción el sitio no la escribe en inglés');
	assert.match(enlaceFicha({ ...sin, en: trad }, en), /\/en\/property\/partner-house\//);
	assert.match(enlaceFicha({ ...sin, vip: true }, en), /\/vip\/casa-del-socio\//);
	assert.match(enlaceFicha({ ...sin, vip: true, en: trad }, en), /\/en\/luxury\/partner-house\//);
	assert.match(enlaceFicha({ ...sin, en: trad }, es), /\/propiedad\/casa-del-socio\/\?utm_source=/);
});

console.log(`\n${ok} pruebas de la difusión correctas`);
