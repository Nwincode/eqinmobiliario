// Empaqueta el CSS y el JS públicos en un archivo cada uno: quita el CSS que
// ninguna página usa, minifica y les pone un hash para cachearlos un año.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PurgeCSS } from 'purgecss';
import { transform } from 'esbuild';

const CSS_FILES = [
	'fonts/icomoon/style.css',
	'fonts/flaticon/font/flaticon.css',
	'css/tiny-slider.css',
	'css/aos.css',
	'css/style.css',
	'css/site.css',
	'css/vip.css'
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

// Clases que solo aparecen al ejecutar JavaScript (sliders, menú móvil, animaciones…).
const SAFELIST = {
	standard: [/^tns-/, /^aos-/, /^offcanvas-menu$/, /^active$/, /^show$/, /^collapse/, /^collapsing$/, /^collapsed$/,
		/^arrow-collapse$/, /^site-nav-wrap$/, /^copied$/, /^viewed$/, /^fade$/, /^modal/, /^is-wide$/, /^text-(success|danger)$/,
		/^sticky/, /^dropdown/, /^has-children$/, /^icofont-close$/],
	deep: [/^tns-/, /^site-mobile-menu/, /^site-nav-wrap/, /^vip-lightbox/],
	greedy: [/data-aos/, /aos-animate/, /tns/],
	variables: [/.*/]
};

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
		content: [...htmlFiles, ...JS_FILES.filter((f) => !f.includes('bootstrap')).map((f) => path.join(root, f))],
		css: [{ raw: css }],
		safelist: SAFELIST,
		keyframes: false,
		fontFace: false
	});
	const minCss = (await transform(purged.css, { loader: 'css', minify: true })).code;

	const js = (await Promise.all(JS_FILES.map((f) => readFile(path.join(root, f), 'utf8')))).join(';\n');
	const minJs = (await transform(js, { loader: 'js', minify: true, target: 'es2017' })).code;

	const version = hash(minCss + minJs);
	const outDir = path.join(dist, 'assets', version);
	await mkdir(outDir, { recursive: true });
	await writeFile(path.join(outDir, 'site.css'), minCss);
	await writeFile(path.join(outDir, 'site.js'), minJs);

	const cssUrl = `/assets/${version}/site.css`;
	const jsUrl = `/assets/${version}/site.js`;
	for (const file of htmlFiles) {
		const html = await readFile(file, 'utf8');
		await writeFile(file, html.replaceAll('__CSS_BUNDLE__', cssUrl).replaceAll('__JS_BUNDLE__', jsUrl));
	}
	return {
		cssKb: Math.round(Buffer.byteLength(minCss) / 1024),
		cssOriginalKb: Math.round(Buffer.byteLength(css) / 1024),
		jsKb: Math.round(Buffer.byteLength(minJs) / 1024),
		jsOriginalKb: Math.round(Buffer.byteLength(js) / 1024)
	};
}
