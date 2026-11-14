// Fuente de íconos del sitio público: solo los íconos que usa el sitio (icomoon tiene ~1,500; el sitio usa ~70),
// en WOFF2. El panel sigue con la fuente completa (fonts/icomoon/style.css).
//
// Cuándo correrlo: al usar en el sitio un ícono que no estaba (el build avisa «íconos fuera de la fuente del sitio»;
// mientras tanto ese ícono se baja de la fuente completa, así nunca falta).
//   node scripts/fuente-iconos.mjs        (necesita Python con fonttools y brotli: pip install fonttools brotli)
//
// Qué íconos entran (la unión de):
//  1. los que nombra el código del sitio: cada texto entre comillas de scripts/lib/*.mjs y js/*.js que sea el nombre
//     de un ícono («calendar», «icon-check»…), y los que se pueden elegir en Contenido (admin/js/views/content.js);
//  2. los que quedan en el CSS depurado de un sitio generado: el de ejemplo (se genera aquí) y dist/ si existe
//     (`npm run build` antes, para incluir los íconos que usa el contenido real).
// Escribe fonts/icomoon/fonts/icomoon-sitio.woff2, fonts/icomoon/fonts/icomoon.woff2 (la completa, para el panel)
// y fonts/icomoon/sitio.json (qué códigos tiene cada una; lo lee scripts/lib/assets.mjs).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedEjemplo } from './lib/sitio-ejemplo.mjs';
import { codigosEnCss } from './lib/assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUENTES = path.join(ROOT, 'fonts/icomoon/fonts');
const leer = (f) => readFileSync(path.join(ROOT, f), 'utf8');

const porNombre = Object.fromEntries([...leer('fonts/icomoon/style.css').matchAll(/\.icon-([a-z0-9_-]+):before\s*{\s*content:\s*"\\([0-9a-f]+)"/g)].map((m) => [m[1], parseInt(m[2], 16)]));
const usados = new Set();

// 1. Nombres en el código del sitio y en las opciones de Contenido.
const archivos = [
	...readdirSync(path.join(ROOT, 'scripts/lib')).filter((f) => f.endsWith('.mjs')).map((f) => `scripts/lib/${f}`),
	...readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js') && !/bootstrap|aos|tiny-slider/.test(f)).map((f) => `js/${f}`),
	'admin/js/views/content.js'
];
for (const f of archivos) {
	for (const m of leer(f).matchAll(/(?:icon-|['"`])([a-z0-9_-]+)/g)) if (porNombre[m[1]] !== undefined) usados.add(porNombre[m[1]]);
}

// 2. CSS depurado de los sitios generados.
const tmp = mkdtempSync(path.join(tmpdir(), 'eq-iconos-'));
const seed = path.join(tmp, 'seed.json');
writeFileSync(seed, JSON.stringify(seedEjemplo(path.join(ROOT, 'data/seed.json'))));
const ejemplo = path.join(tmp, 'dist');
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env: { ...process.env, DATOS: 'seed', SEED_FILE: seed, DIST_DIR: ejemplo }, stdio: 'ignore' });
for (const dist of [ejemplo, path.join(ROOT, 'dist')]) {
	if (!existsSync(path.join(dist, 'assets'))) continue;
	for (const v of readdirSync(path.join(dist, 'assets'))) {
		const css = path.join(dist, 'assets', v, 'site.css');
		if (existsSync(css)) for (const c of codigosEnCss(readFileSync(css, 'utf8'))) usados.add(c);
	}
}

// Subconjunto con fonttools (solo los códigos que la fuente tiene) y la completa en WOFF2.
const py = (codigo) => execFileSync('python3', ['-c', codigo], { encoding: 'utf8' });
const lista = [...usados].sort((a, b) => a - b).map((c) => c.toString(16)).join(',');
py(`from fontTools import subset
o = subset.Options(); o.flavor = 'woff2'; o.layout_features = []; o.name_IDs = []; o.notdef_outline = True
f = subset.load_font(${JSON.stringify(path.join(FUENTES, 'icomoon.ttf'))}, o)
s = subset.Subsetter(o); s.populate(unicodes=[int(x, 16) for x in ${JSON.stringify(lista)}.split(',')]); s.subset(f)
subset.save_font(f, ${JSON.stringify(path.join(FUENTES, 'icomoon-sitio.woff2'))}, o)`);
py(`from fontTools.ttLib import TTFont
f = TTFont(${JSON.stringify(path.join(FUENTES, 'icomoon.ttf'))}); f.flavor = 'woff2'; f.save(${JSON.stringify(path.join(FUENTES, 'icomoon.woff2'))})`);
const cmap = (archivo) => JSON.parse(py(`from fontTools.ttLib import TTFont; import json; print(json.dumps(sorted(TTFont(${JSON.stringify(archivo)}).getBestCmap())))`));
const sitio = cmap(path.join(FUENTES, 'icomoon-sitio.woff2')).filter((c) => c >= 0xe000);
const completa = cmap(path.join(FUENTES, 'icomoon.ttf')).filter((c) => c >= 0xe000);
writeFileSync(path.join(ROOT, 'fonts/icomoon/sitio.json'), `${JSON.stringify({
	nota: 'Lo escribe scripts/fuente-iconos.mjs. sitio = códigos de icomoon-sitio.woff2; completa = los de la fuente entera (de U+E000 en adelante).',
	sitio: sitio.map((c) => c.toString(16)), completa: completa.map((c) => c.toString(16))
})}\n`);
const kb = (f) => Math.round(readFileSync(path.join(FUENTES, f)).length / 1024);
console.log(`Fuente del sitio: ${sitio.length} íconos, ${kb('icomoon-sitio.woff2')} KB (completa en WOFF2: ${completa.length} íconos, ${kb('icomoon.woff2')} KB).`);
