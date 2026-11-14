// Empaqueta el CSS y el JS públicos en un archivo cada uno: quita el CSS que
// ninguna página usa, minifica y les pone un hash para cachearlos un año.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PurgeCSS } from 'purgecss';
import { transform, build } from 'esbuild';

const CSS_FILES = [
	'css/tema.css',
	'fonts/icomoon/style.css',
	'fonts/flaticon/font/flaticon.css',
	'css/tiny-slider.css',
	'css/aos.css',
	'css/style.css',
	'css/calendario.css',
	'css/site.css',
	'css/vip.css',
	'css/botones.css'
];

// El orden importa: custom.js usa tns() y AOS; site.js va al final.
const JS_FILES = [
	'js/bootstrap.bundle.min.js',
	'js/tiny-slider.js',
	'js/aos.js',
	'js/navbar.js',
	'js/counter.js',
	'js/custom.js',
	'js/site.js'
];

// Calculadora de renta: paquete aparte, solo en las fichas en venta y en /calculadora-de-renta/.
const RENTA_FILES = ['js/calc-renta.js', 'js/calc-renta-ui.js'];

// Renta vacacional: calendario y cotización de la ficha (solo en propiedades por noches).
const VAC_FILES = ['js/calc-vacacional.js', 'js/vacacional.js', 'js/reserva-chat.js'];

// Clases que solo aparecen al ejecutar JavaScript (sliders, menú móvil, animaciones…).
const SAFELIST = {
	standard: [/^tns-/, /^aos-/, /^offcanvas-menu$/, /^active$/, /^show$/, /^collapse/, /^collapsing$/, /^collapsed$/,
		/^arrow-collapse$/, /^site-nav-wrap$/, /^copied$/, /^viewed$/, /^fade$/, /^modal/, /^is-wide$/, /^text-(success|danger)$/,
		/^sticky/, /^dropdown/, /^has-children$/, /^icofont-close$/,
		/^renta-d-/, // calc-renta-ui.js arma estas clases con «renta-d-» + tipo de fila
		/^vac-/], // js/vacacional.js arma el calendario y el desglose
	deep: [/^tns-/, /^site-mobile-menu/, /^site-nav-wrap/, /^vip-lightbox/],
	greedy: [/data-aos/, /aos-animate/, /tns/],
	variables: [/.*/]
};

// Los formatos de admin/js/formato.js que usa js/site.js, como window.EQFormato: la misma regla que el panel y
// el generador (correo válido, precio de una propiedad, US$ para comparar precios), sin una segunda copia.
export const FORMATO_NAVEGADOR = ['correoValido', 'montoPrecio', 'enUSD'];
async function formatoParaElNavegador(root) {
	const r = await build({
		stdin: { contents: `export { ${FORMATO_NAVEGADOR.join(', ')} } from './admin/js/formato.js';`, resolveDir: root, loader: 'js' },
		bundle: true, format: 'iife', globalName: 'EQFormato', write: false, target: 'es2017', logLevel: 'silent'
	});
	return r.outputFiles[0].text;
}

// Íconos (icomoon) del sitio: los códigos que pide el CSS ya depurado (`content: "\e900"`), de U+E000 a U+F8FF.
export const codigosEnCss = (css) => [...new Set([...css.matchAll(/content\s*:\s*["']\\([0-9a-f]{4,5})/gi)]
	.map((m) => parseInt(m[1], 16)).filter((c) => c >= 0xe000 && c <= 0xf8ff))];

// «U+e900-e903,U+f00c»: los códigos en rangos seguidos.
function rangos(codigos) {
	const out = [];
	for (const c of [...codigos].sort((a, b) => a - b)) {
		const ult = out[out.length - 1];
		if (ult && c === ult[1] + 1) ult[1] = c; else out.push([c, c]);
	}
	return out.map(([a, b]) => `U+${a.toString(16)}${b > a ? `-${b.toString(16)}` : ''}`).join(',');
}

// El sitio baja solo la fuente con sus íconos (fonts/icomoon/fonts/icomoon-sitio.woff2, ~10 KB, la arma
// scripts/fuente-iconos.mjs). Si el CSS pide uno que no está, ese código sale de la fuente completa (unicode-range:
// el navegador la baja solo si la página lo usa) y el build avisa para regenerar.
async function fuenteIconos(root, css) {
	const dir = path.join(root, 'fonts/icomoon');
	const { sitio, completa } = JSON.parse(await readFile(path.join(dir, 'sitio.json'), 'utf8'));
	const enSitio = new Set(sitio.map((h) => parseInt(h, 16)));
	const enCompleta = new Set(completa.map((h) => parseInt(h, 16)));
	const faltan = codigosEnCss(css).filter((c) => enCompleta.has(c) && !enSitio.has(c));
	if (faltan.length) console.warn(`⚠ ${faltan.length} íconos fuera de la fuente del sitio (${rangos(faltan)}): se bajan de la completa. Regenera con node scripts/fuente-iconos.mjs`);
	// Las fuentes se guardan un año (netlify.toml → /fonts/*): la versión en la URL cambia con el archivo.
	const v = async (f) => hash(await readFile(path.join(dir, 'fonts', f)));
	const caras = `@font-face{font-family:icomoon;src:url(/fonts/icomoon/fonts/icomoon-sitio.woff2?v=${await v('icomoon-sitio.woff2')}) format("woff2");unicode-range:${rangos(enSitio)};font-weight:normal;font-style:normal;font-display:swap}`
		+ (faltan.length ? `@font-face{font-family:icomoon;src:url(/fonts/icomoon/fonts/icomoon.woff2?v=${await v('icomoon.woff2')}) format("woff2");unicode-range:${rangos(faltan)};font-weight:normal;font-style:normal;font-display:swap}` : '');
	const sinCara = css.replace(/@font-face\s*{[^}]*font-family:\s*['"]?icomoon['"]?;[^}]*}/, caras);
	if (sinCara === css) throw new Error('assets.mjs: no se encontró la @font-face de icomoon en fonts/icomoon/style.css');
	return sinCara;
}

function hash(text) {
	return createHash('sha256').update(text).digest('hex').slice(0, 10);
}

// Las rutas relativas de las fuentes (url('fonts/x.woff')) pasan a absolutas,
// y se agrega font-display: swap para que el texto se vea mientras cargan.
function absolutizeUrls(css, file) {
	const dir = '/' + path.posix.dirname(file);
	return css
		.replace(/url\((['"]?)(?!data:|https?:|\/)([^'")]+)\1\)/g, (_, q, rel) => `url(${q}${path.posix.normalize(`${dir}/${rel}`)}${q})`)
		.replace(/@font-face\s*{/g, '@font-face{font-display:swap;');
}

async function listHtml(dir) {
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== 'admin') out.push(...(await listHtml(full)));
		} else if (entry.name.endsWith('.html')) {
			out.push(full);
		}
	}
	return out;
}

export async function buildAssets({ root, dist }) {
	const css = (await Promise.all(CSS_FILES.map(async (f) => absolutizeUrls(await readFile(path.join(root, f), 'utf8'), f)))).join('\n');
	const htmlFiles = await listHtml(dist);
	const [purged] = await new PurgeCSS().purge({
		content: [...htmlFiles, ...[...JS_FILES, ...RENTA_FILES, ...VAC_FILES].filter((f) => !f.includes('bootstrap')).map((f) => path.join(root, f))],
		css: [{ raw: css }],
		safelist: SAFELIST,
		keyframes: false,
		fontFace: false
	});
	const minCss = (await transform(await fuenteIconos(root, purged.css), { loader: 'css', minify: true })).code;

	const js = [await formatoParaElNavegador(root), ...(await Promise.all(JS_FILES.map((f) => readFile(path.join(root, f), 'utf8'))))].join(';\n');
	const minJs = (await transform(js, { loader: 'js', minify: true, target: 'es2017' })).code;

	const rentaJs = (await Promise.all(RENTA_FILES.map((f) => readFile(path.join(root, f), 'utf8')))).join(';\n');
	const minRenta = (await transform(rentaJs, { loader: 'js', minify: true, target: 'es2017' })).code;

	const vacJs = (await Promise.all(VAC_FILES.map((f) => readFile(path.join(root, f), 'utf8')))).join(';\n');
	const minVac = (await transform(vacJs, { loader: 'js', minify: true, target: 'es2017' })).code;

	const version = hash(minCss + minJs + minRenta + minVac);
	const outDir = path.join(dist, 'assets', version);
	await mkdir(outDir, { recursive: true });
	await writeFile(path.join(outDir, 'site.css'), minCss);
	await writeFile(path.join(outDir, 'site.js'), minJs);
	await writeFile(path.join(outDir, 'renta.js'), minRenta);
	await writeFile(path.join(outDir, 'vacacional.js'), minVac);

	const cssUrl = `/assets/${version}/site.css`;
	const jsUrl = `/assets/${version}/site.js`;
	const rentaUrl = `/assets/${version}/renta.js`;
	const vacUrl = `/assets/${version}/vacacional.js`;
	for (const file of htmlFiles) {
		const html = await readFile(file, 'utf8');
		await writeFile(file, html.replaceAll('__CSS_BUNDLE__', cssUrl).replaceAll('__JS_BUNDLE__', jsUrl).replaceAll('__RENTA_BUNDLE__', rentaUrl).replaceAll('__VAC_BUNDLE__', vacUrl));
	}
	return {
		cssKb: Math.round(Buffer.byteLength(minCss) / 1024),
		cssOriginalKb: Math.round(Buffer.byteLength(css) / 1024),
		jsKb: Math.round(Buffer.byteLength(minJs) / 1024),
		jsOriginalKb: Math.round(Buffer.byteLength(js) / 1024),
		rentaKb: Math.round(Buffer.byteLength(minRenta) / 1024),
		vacKb: Math.round(Buffer.byteLength(minVac) / 1024)
	};
}
