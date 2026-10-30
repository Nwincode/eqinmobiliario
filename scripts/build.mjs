// Genera el sitio estático en dist/ a partir de Firestore (o de data/seed.json
// mientras Firebase no esté configurado). Netlify lo ejecuta en cada publicación.
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from './lib/firestore.mjs';
import { deepMerge, slugify, byOrder } from './lib/util.mjs';
import * as T from './lib/templates.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

// Rutas que no pueden usar las páginas de contenido.
const RESERVED = new Set(['propiedades', 'propiedad', 'vip', 'blog', 'admin', 'css', 'js', 'images', 'fonts', 'data', 'scripts', '404']);

const STATIC_ASSETS = [
	'css', 'js', 'images', 'admin',
	'fonts/icomoon/style.css', 'fonts/icomoon/fonts',
	'fonts/flaticon/font/flaticon.css', 'fonts/flaticon/font/Flaticon.eot', 'fonts/flaticon/font/Flaticon.svg',
	'fonts/flaticon/font/Flaticon.ttf', 'fonts/flaticon/font/Flaticon.woff', 'fonts/flaticon/font/Flaticon.woff2',
	'favicon.png', 'Icono_Equipoinmobiliario@0.75x.png', 'site.config.json',
	'data/seed.json' // el panel lo usa para "Importar datos iniciales"
];

async function readJson(file) {
	return JSON.parse(await readFile(path.resolve(ROOT, file), 'utf8'));
}

async function loadData(config) {
	const seed = await readJson(process.env.SEED_FILE || 'data/seed.json');
	const fb = config.firebase || {};
	const fromSeed = () => ({
		source: 'seed',
		settings: seed.settings,
		properties: seed.properties.filter((p) => p.publicado),
		agents: seed.agents.filter((a) => a.activo),
		testimonials: seed.testimonials.filter((t) => t.activo),
		pages: seed.pages.filter((p) => p.publicado),
		posts: (seed.posts || []).filter((p) => p.publicado)
	});

	if (!fb.projectId || !fb.apiKey) {
		console.log('· Firebase sin configurar: se usan los datos de data/seed.json');
		return { ...fromSeed(), defaults: seed.settings };
	}

	const db = createClient({ projectId: fb.projectId, apiKey: fb.apiKey });
	let settings;
	try {
		settings = await db.getDoc('settings/site');
	} catch (err) {
		// Base de datos sin crear o reglas aún sin publicar: se publica el contenido actual.
		if (!/respondió (403|400)/.test(err.message)) throw err;
		console.log(`· Firestore todavía no está listo (${err.message.slice(0, 120)}…): se usa data/seed.json`);
		return { ...fromSeed(), defaults: seed.settings };
	}
	if (!settings) {
		console.log('· Firestore aún no tiene settings/site (importa los datos iniciales desde el panel): se usa data/seed.json');
		return { ...fromSeed(), defaults: seed.settings };
	}
	const [properties, agents, testimonials, pages, posts] = await Promise.all([
		db.queryTrue('properties', 'publicado'),
		db.queryTrue('agents', 'activo'),
		db.queryTrue('testimonials', 'activo'),
		db.queryTrue('pages', 'publicado'),
		db.queryTrue('posts', 'publicado')
	]);
	console.log(`· Datos leídos de Firestore (${fb.projectId})`);
	return { source: 'firestore', settings, properties, agents, testimonials, pages, posts, defaults: seed.settings };
}

function toMillis(v) {
	if (!v) return 0;
	if (typeof v === 'number') return v;
	const t = Date.parse(v);
	return Number.isNaN(t) ? 0 : t;
}

function normalizeProperties(list) {
	const used = new Set();
	return list
		.map((p) => {
			let slug = slugify(p.slug || p.titulo) || p.id;
			if (used.has(slug)) slug = `${slug}-${slugify(p.id).slice(0, 8)}`;
			used.add(slug);
			return {
				operacion: 'venta', tipo: 'casa', moneda: 'USD', estado: 'disponible',
				fotos: [], amenidades: [], vipLanding: {}, seo: {},
				...p,
				slug,
				fechaOrden: toMillis(p.createdAt) || (1e13 - (p.orden || 0))
			};
		})
		.sort((a, b) => (b.destacada === true) - (a.destacada === true) || byOrder(a, b) || b.fechaOrden - a.fechaOrden);
}

function normalizePages(list) {
	return list
		.map((p) => {
			const slug = slugify(p.slug || p.titulo) || p.id;
			return { ...p, slug, url: RESERVED.has(slug) ? `/pagina/${slug}/` : `/${slug}/` };
		})
		.sort(byOrder);
}

function normalizePosts(list) {
	const used = new Set();
	return list
		.map((p) => {
			let slug = slugify(p.slug || p.titulo) || p.id;
			if (used.has(slug)) slug = `${slug}-${slugify(p.id).slice(0, 8)}`;
			used.add(slug);
			return { ...p, slug, url: `/blog/${slug}/` };
		})
		.sort((a, b) => toMillis(b.fecha || b.createdAt) - toMillis(a.fecha || a.createdAt));
}

// Una página por zona con al menos una propiedad publicada (búsquedas locales: "casas en zona 16").
function buildZonas(properties) {
	const counts = new Map();
	for (const p of properties) if (p.zona) counts.set(p.zona, (counts.get(p.zona) || 0) + 1);
	return [...counts.entries()]
		.map(([nombre, total]) => {
			let slug = slugify(nombre);
			if (['venta', 'renta'].includes(slug)) slug = `zona-${slug}`;
			return { nombre, total, url: `/propiedades/${slug}/` };
		})
		.filter((z) => z.url !== '/propiedades//')
		.sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
}

async function writePage(urlPath, html) {
	const rel = urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath;
	const file = path.join(DIST, rel);
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, html);
}

async function copyAssets() {
	for (const rel of STATIC_ASSETS) {
		const src = path.join(ROOT, rel);
		if (!existsSync(src)) continue;
		await cp(src, path.join(DIST, rel), {
			recursive: true,
			filter: (f) => !/(^|[\\/])index\.html$/.test(path.relative(ROOT, f)) || rel === 'admin'
		});
	}
}

function sitemap(ctx, urls) {
	const base = ctx.siteUrl.replace(/\/$/, '');
	const today = new Date().toISOString().slice(0, 10);
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `	<url><loc>${base}${u.path}</loc><lastmod>${u.lastmod || today}</lastmod>${u.priority ? `<priority>${u.priority}</priority>` : ''}</url>`).join('\n')}
</urlset>
`;
}

async function main() {
	const config = await readJson('site.config.json');
	const data = await loadData(config);
	const site = deepMerge(data.defaults, data.settings);
	const agents = data.agents.slice().sort(byOrder);
	const properties = normalizeProperties(data.properties);
	const pages = normalizePages(data.pages);

	const ctx = {
		siteUrl: process.env.URL && process.env.CONTEXT !== 'production' ? process.env.DEPLOY_PRIME_URL || process.env.URL : config.siteUrl,
		site,
		properties,
		agents,
		agentsById: Object.fromEntries(agents.map((a) => [a.id, a])),
		testimonials: data.testimonials.slice().sort(byOrder),
		pages,
		posts: normalizePosts(data.posts || []),
		zonas: buildZonas(properties),
		publicConfig: {
			projectId: config.firebase.projectId || '',
			apiKey: config.firebase.apiKey || '',
			pixel: Boolean(site.tracking && site.tracking.pixelId),
			whatsapp: site.contacto.whatsapp || ''
		}
	};

	await rm(DIST, { recursive: true, force: true });
	await mkdir(DIST, { recursive: true });
	await copyAssets();

	const urls = [{ path: '/', priority: '1.0' }];
	await writePage('/', T.homePage(ctx));

	const listings = [
		{ path: '/propiedades/', heading: 'Propiedades', title: `Propiedades en venta y renta en Guatemala | ${site.general.nombreCorto}`, description: 'Casas, apartamentos, terrenos y oficinas en venta y renta en Guatemala. Filtra por zona, precio y número de habitaciones.' },
		{ path: '/propiedades/venta/', operacion: 'venta', heading: 'Propiedades en venta', title: `Casas y apartamentos en venta en Guatemala | ${site.general.nombreCorto}`, description: 'Propiedades en venta en Guatemala: casas, apartamentos y terrenos verificados, con asesoría en financiamiento.' },
		{ path: '/propiedades/renta/', operacion: 'renta', heading: 'Propiedades en renta', title: `Casas y apartamentos en renta en Guatemala | ${site.general.nombreCorto}`, description: 'Propiedades en renta en Guatemala: casas, apartamentos y oficinas con contratos claros y seguros.' }
	];
	for (const l of listings) {
		await writePage(l.path, T.listingPage(ctx, l));
		urls.push({ path: l.path, priority: '0.9' });
	}

	for (const z of ctx.zonas) {
		await writePage(z.url, T.listingPage(ctx, {
			path: z.url,
			zona: z.nombre,
			heading: `Propiedades en ${z.nombre}`,
			title: `Casas y apartamentos en ${z.nombre}, Guatemala | ${site.general.nombreCorto}`,
			description: `Propiedades en venta y renta en ${z.nombre}, Guatemala. ${z.total === 1 ? '1 propiedad disponible' : `${z.total} propiedades disponibles`} con asesoría personalizada.`,
			intro: `Casas, apartamentos y terrenos en ${z.nombre}. Si no encuentras lo que buscas, déjanos tus datos y te enviamos opciones que aún no están publicadas.`
		}));
		urls.push({ path: z.url, priority: '0.8' });
	}

	await writePage('/blog/', T.blogIndexPage(ctx));
	urls.push({ path: '/blog/', priority: '0.6' });
	for (const post of ctx.posts) {
		await writePage(post.url, T.blogPostPage(ctx, post));
		urls.push({ path: post.url, priority: '0.6', lastmod: String(post.fecha || '').slice(0, 10) || undefined });
	}

	await writePage('/vip/', T.vipIndexPage(ctx));
	urls.push({ path: '/vip/', priority: '0.8' });

	for (const p of properties) {
		const html = p.vip ? T.vipLandingPage(ctx, p) : T.propertyPage(ctx, p);
		await writePage(T.propertyUrl(p), html);
		urls.push({ path: T.propertyUrl(p), priority: p.vip ? '0.9' : '0.8', lastmod: (p.updatedAt || '').slice(0, 10) || undefined });
	}

	for (const page of pages) {
		await writePage(page.url, T.contentPage(ctx, page));
		urls.push({ path: page.url, priority: '0.4' });
	}

	await writePage('/404.html', T.notFoundPage(ctx));
	await writeFile(path.join(DIST, 'sitemap.xml'), sitemap(ctx, urls));
	await writeFile(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${config.siteUrl.replace(/\/$/, '')}/sitemap.xml\n`);

	console.log(`✓ Sitio generado en dist/ (${data.source}): ${properties.length} propiedades, ${pages.length} páginas, ${urls.length} URLs en el sitemap`);
}

main().catch((err) => {
	console.error('✗ Error al generar el sitio:', err.message);
	process.exit(1);
});
