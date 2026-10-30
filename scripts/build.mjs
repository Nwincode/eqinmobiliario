// Genera el sitio estático en dist/ a partir de Firestore (o de data/seed.json
// mientras Firebase no esté configurado). Netlify lo ejecuta en cada publicación.
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from './lib/firestore.mjs';
import { deepMerge, slugify, byOrder } from './lib/util.mjs';
import * as T from './lib/templates.mjs';
import { buildAssets } from './lib/assets.mjs';

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
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((u) => `	<url><loc>${base}${u.path}</loc><lastmod>${u.lastmod || today}</lastmod>${u.priority ? `<priority>${u.priority}</priority>` : ''}${imageEntries(ctx, u)}</url>`).join('\n')}
</urlset>
`;
}

// Redirecciones 301 para no perder posicionamiento: URLs anteriores de cada
// propiedad, cambio entre ficha normal y landing VIP, y las que se agreguen en el panel.
function redirects(ctx) {
	const lines = [];
	const add = (from, to) => {
		if (from && to && from !== to && !lines.some((l) => l.startsWith(`${from} `))) lines.push(`${from} ${to} 301`);
	};
	for (const p of ctx.properties) {
		const url = T.propertyUrl(p);
		add(p.vip ? `/propiedad/${p.slug}/` : `/vip/${p.slug}/`, url);
		for (const old of p.slugsAnteriores || []) {
			const s = slugify(old);
			if (s && s !== p.slug) {
				add(`/propiedad/${s}/`, url);
				add(`/vip/${s}/`, url);
			}
		}
	}
	for (const r of ctx.site.seo.redirecciones || []) {
		const from = String(r.desde || '').trim();
		const to = String(r.hacia || '').trim();
		if (from.startsWith('/') && to) add(from, to);
	}
	return lines.join('\n') + '\n';
}

function imageEntries(ctx, u) {
	return (u.images || []).slice(0, 20).map((img) => {
		const loc = /^https?:/.test(img) ? img : ctx.siteUrl.replace(/\/$/, '') + img;
		return `<image:image><image:loc>${loc.replace(/&/g, '&amp;')}</image:loc></image:image>`;
	}).join('');
}

async function main() {
	const config = await readJson('site.config.json');
	const data = await loadData(config);
	const site = deepMerge(data.defaults, data.settings);
	const agents = data.agents.slice().sort(byOrder);
	const properties = normalizeProperties(data.properties);
	const pages = normalizePages(data.pages);
	const isProduction = !process.env.CONTEXT || process.env.CONTEXT === 'production';
	const L = site.listados || {};
	const nombre = site.general.nombreCorto;

	const ctx = {
		siteUrl: isProduction ? config.siteUrl : process.env.DEPLOY_PRIME_URL || process.env.URL || config.siteUrl,
		// Vistas previas de Netlify o sitio marcado "no indexar": Google no debe indexarlas.
		noindex: !isProduction || site.seo.indexar === false,
		site,
		properties,
		agents,
		agentsById: Object.fromEntries(agents.map((a) => [a.id, a])),
		testimonials: data.testimonials.slice().sort(byOrder),
		pages,
		posts: normalizePosts(data.posts || []),
		zonas: buildZonas(properties),
		mobileVariant: (url) => {
			const m = /^\/images\/(.+)\.webp$/.exec(url || '');
			return m && existsSync(path.join(ROOT, 'images', `${m[1]}-800.webp`)) ? `/images/${m[1]}-800.webp` : null;
		},
		publicConfig: {
			projectId: config.firebase.projectId || '',
			apiKey: config.firebase.apiKey || '',
			whatsapp: site.contacto.whatsapp || '',
			adsLead: site.tracking.adsId && site.tracking.adsLeadLabel ? `${site.tracking.adsId}/${site.tracking.adsLeadLabel}` : '',
			adsContact: site.tracking.adsId && site.tracking.adsContactLabel ? `${site.tracking.adsId}/${site.tracking.adsContactLabel}` : ''
		}
	};

	await rm(DIST, { recursive: true, force: true });
	await mkdir(DIST, { recursive: true });
	await copyAssets();

	const urls = [{ path: '/', priority: '1.0', images: (site.hero.imagenes || []).slice(0, 1) }];
	await writePage('/', T.homePage(ctx));

	const listing = (key, defaults) => ({
		...defaults,
		heading: (L[key] && L[key].h1) || defaults.heading,
		title: (L[key] && L[key].titulo) || defaults.title,
		description: (L[key] && L[key].descripcion) || defaults.description,
		intro: (L[key] && L[key].intro) || defaults.intro || ''
	});
	const listings = [
		listing('todas', { path: '/propiedades/', heading: 'Propiedades', title: `Propiedades en venta y renta en Guatemala | ${nombre}`, description: 'Casas, apartamentos, terrenos y oficinas en venta y renta en Guatemala. Filtra por zona, precio y número de habitaciones.' }),
		listing('venta', { path: '/propiedades/venta/', operacion: 'venta', heading: 'Propiedades en venta', title: `Casas y apartamentos en venta en Guatemala | ${nombre}`, description: 'Propiedades en venta en Guatemala: casas, apartamentos y terrenos verificados, con asesoría en financiamiento.' }),
		listing('renta', { path: '/propiedades/renta/', operacion: 'renta', heading: 'Propiedades en renta', title: `Casas y apartamentos en renta en Guatemala | ${nombre}`, description: 'Propiedades en renta en Guatemala: casas, apartamentos y oficinas con contratos claros y seguros.' })
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
			title: `Casas y apartamentos en ${z.nombre}, Guatemala | ${nombre}`,
			description: `Propiedades en venta y renta en ${z.nombre}, Guatemala. ${z.total === 1 ? '1 propiedad disponible' : `${z.total} propiedades disponibles`} con asesoría personalizada.`,
			intro: `Casas, apartamentos y terrenos en ${z.nombre}. Si no encuentras lo que buscas, déjanos tus datos y te enviamos opciones que aún no están publicadas.`
		}));
		urls.push({ path: z.url, priority: '0.8' });
	}

	await writePage('/blog/', T.blogIndexPage(ctx));
	urls.push({ path: '/blog/', priority: '0.6' });
	for (const post of ctx.posts) {
		await writePage(post.url, T.blogPostPage(ctx, post));
		urls.push({ path: post.url, priority: '0.6', lastmod: String(post.fecha || '').slice(0, 10) || undefined, images: post.imagen ? [post.imagen] : [] });
	}

	await writePage('/vip/', T.vipIndexPage(ctx));
	urls.push({ path: '/vip/', priority: '0.8' });

	for (const p of properties) {
		const html = p.vip ? T.vipLandingPage(ctx, p) : T.propertyPage(ctx, p);
		await writePage(T.propertyUrl(p), html);
		urls.push({
			path: T.propertyUrl(p),
			priority: p.vip ? '0.9' : '0.8',
			lastmod: String(p.updatedAt || '').slice(0, 10) || undefined,
			images: (p.fotos || []).map((f) => f.url)
		});
	}

	for (const page of pages) {
		await writePage(page.url, T.contentPage(ctx, page));
		urls.push({ path: page.url, priority: '0.4' });
	}

	await writePage('/404.html', T.notFoundPage(ctx));
	const assets = await buildAssets({ root: ROOT, dist: DIST });

	await writeFile(path.join(DIST, 'sitemap.xml'), sitemap(ctx, urls));
	await writeFile(path.join(DIST, '_redirects'), redirects(ctx));
	await writeFile(path.join(DIST, 'robots.txt'), ctx.noindex
		? 'User-agent: *\nDisallow: /\n'
		: `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${config.siteUrl.replace(/\/$/, '')}/sitemap.xml\n`);

	console.log(`✓ Sitio generado en dist/ (${data.source}): ${properties.length} propiedades, ${pages.length} páginas, ${ctx.posts.length} artículos, ${urls.length} URLs en el sitemap${ctx.noindex ? ' · SIN INDEXAR' : ''}`);
	console.log(`  CSS ${assets.cssOriginalKb} KB → ${assets.cssKb} KB · JS ${assets.jsOriginalKb} KB → ${assets.jsKb} KB`);
}

main().catch((err) => {
	console.error('✗ Error al generar el sitio:', err.message);
	process.exit(1);
});
