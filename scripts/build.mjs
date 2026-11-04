// Genera el sitio estático en dist/ a partir de Firestore (o de data/seed.json
// mientras Firebase no esté configurado). Netlify lo ejecuta en cada publicación.
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from './lib/firestore.mjs';
import { deepMerge, slugify, byOrder } from './lib/util.mjs';
import * as T from './lib/templates.mjs';
import { aplicarTextos, textosPorDefecto } from './lib/i18n.mjs';
import { buildAssets } from './lib/assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
// Mínimo de propiedades para generar una página de zona + operación (evita páginas con poco contenido).
const MIN_LISTADO = 2;

// Rutas que no pueden usar las páginas de contenido.
const RESERVED = new Set(['propiedades', 'propiedad', 'vip', 'blog', 'admin', 'css', 'js', 'images', 'fonts', 'data', 'scripts', '404']);

const STATIC_ASSETS = [
	'css', 'js', 'images', 'admin',
	'fonts/icomoon/style.css', 'fonts/icomoon/fonts',
	'fonts/flaticon/font/flaticon.css', 'fonts/flaticon/font/Flaticon.eot', 'fonts/flaticon/font/Flaticon.svg',
	'fonts/flaticon/font/Flaticon.ttf', 'fonts/flaticon/font/Flaticon.woff', 'fonts/flaticon/font/Flaticon.woff2',
	'favicon.png', 'apple-touch-icon.png', 'logo-equipo-inmobiliario.png', 'Icono_Equipoinmobiliario@0.75x.png', 'site.config.json',
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

function normalizePages(list, base = '') {
	return list
		.map((p) => {
			const slug = slugify(p.slug || p.titulo) || p.id;
			return { ...p, slug, url: `${base}${RESERVED.has(slug) ? `/pagina/${slug}` : `/${slug}`}/` };
		})
		.sort(byOrder);
}

// Versión en inglés de una propiedad (solo si tiene título y descripción en inglés).
function propiedadEn(p) {
	const e = p.en || {};
	if (!e.titulo || !e.descripcion) return null;
	return {
		...p,
		_lang: 'en',
		slug: slugify(e.slug || e.titulo) || p.slug,
		titulo: e.titulo,
		descripcion: e.descripcion,
		amenidades: e.amenidades || [],
		seo: e.seo || {},
		vipLanding: { ...(p.vipLanding || {}), titular: '', subtitular: '', puntosClave: [], ctaTexto: '', ...(e.vipLanding || {}) },
		fotos: (p.fotos || []).map((f) => ({ url: f.url }))
	};
}

// Une cada página con su traducción (campo "traduccion" = slug de la otra versión).
function enlazarTraducciones(es, en) {
	const bySlugEn = Object.fromEntries(en.map((p) => [p.slug, p]));
	const bySlugEs = Object.fromEntries(es.map((p) => [p.slug, p]));
	for (const p of es) {
		const otra = p.traduccion && bySlugEn[slugify(p.traduccion)];
		if (otra) p._alternates = otra._alternates = { es: p.url, en: otra.url };
	}
	for (const p of en) {
		const otra = p.traduccion && bySlugEs[slugify(p.traduccion)];
		if (otra && !p._alternates) p._alternates = otra._alternates = { es: otra.url, en: p.url };
	}
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
// Contenido de una zona desde settings/site → zonas (lista); la versión en inglés va en el campo "en".
function guiaZona(site, nombre, lang = 'es') {
	const z = (site.zonas || []).find((x) => slugify(x.nombre || '') === slugify(nombre || ''));
	if (!z) return {};
	const base = { h1: z.h1, titulo: z.titulo, descripcion: z.descripcion, intro: z.intro, contenido: z.contenido, imagen: z.imagen };
	if (lang !== 'en') return base;
	const en = z.en || {};
	return { h1: en.h1, titulo: en.titulo, descripcion: en.descripcion, intro: en.intro, contenido: en.contenido, imagen: z.imagen };
}

function buildZonas(properties, base = '/propiedades/') {
	const counts = new Map();
	for (const p of properties) if (p.zona) counts.set(p.zona, (counts.get(p.zona) || 0) + 1);
	return [...counts.entries()]
		.map(([nombre, total]) => {
			let slug = slugify(nombre);
			if (['venta', 'renta', 'for-sale', 'for-rent'].includes(slug)) slug = `zona-${slug}`;
			const venta = properties.filter((p) => p.zona === nombre && p.operacion === 'venta').length;
			return { nombre, slug, total, venta, renta: total - venta, url: `${base}${slug}/` };
		})
		.filter((z) => z.slug)
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

export function indexNowKey(siteUrl) {
	return createHash('sha256').update(`indexnow:${siteUrl}`).digest('hex').slice(0, 32);
}

// llms.txt: resumen del sitio para asistentes y buscadores con IA (ChatGPT, Perplexity, Copilot, AI Overviews).
function llmsTxt(ctx, properties, pages) {
	const base = ctx.siteUrl.replace(/\/$/, '');
	const s = ctx.site;
	const c = s.contacto || {};
	const lineas = [
		`# ${s.general.nombre}`,
		'',
		`> ${s.seo.descripcion}`,
		'',
		`Agencia inmobiliaria en Ciudad de Guatemala: compra, venta y renta de casas, apartamentos y terrenos. Atención en español e inglés, recorridos por videollamada y cierre a distancia para compradores en Estados Unidos.${c.telefono ? ` Teléfono / WhatsApp: ${c.telefono}.` : ''}${c.email ? ` Correo: ${c.email}.` : ''}`,
		'',
		'## Propiedades',
		'',
		`- [Todas las propiedades](${base}/propiedades/)`,
		`- [En venta](${base}/propiedades/venta/)`,
		`- [En renta](${base}/propiedades/renta/)`,
		...ctx.zonas.map((z) => `- [Propiedades en ${z.nombre}](${base}${z.url})`),
		...properties.filter((p) => p.estado === 'disponible').slice(0, 100).map((p) =>
			`- [${p.titulo}](${base}${T.propertyUrl(p)}): ${p.operacion === 'renta' ? 'renta' : 'venta'}, ${[p.zona, p.ciudad].filter(Boolean).join(', ')}${p.precio && !(p.vipLanding && p.vipLanding.ocultarPrecio) ? `, ${p.moneda || 'USD'} ${Number(p.precio).toLocaleString('en-US')}` : ''}${p.habitaciones ? `, ${p.habitaciones} habitaciones` : ''}${p.m2Construccion ? `, ${p.m2Construccion} m²` : ''}`),
		'',
		'## Guías',
		'',
		...ctx.posts.map((p) => `- [${p.titulo}](${base}${p.url})${p.resumen ? `: ${p.resumen}` : ''}`),
		...pages.map((p) => `- [${p.titulo}](${base}${p.url})`),
		'',
		'## English',
		'',
		`- [Homes for sale and rent in Guatemala](${base}/en/properties/)`,
		`- [Buying property in Guatemala from the US](${base}/en/buying-property-in-guatemala/)`,
		''
	];
	return lineas.join('\n');
}

// ------------------------------------------------ Catálogos para portales (/feeds/)
const xmlEsc = (v) => String(v ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const textoPlano = (md) => String(md || '').replace(/[#*_>`\[\]]/g, '').replace(/\(https?:[^)]+\)/g, '').replace(/\n{3,}/g, '\n\n').trim();
const coordenadas = (mapa) => {
	const m = /(?:@|[?&](?:q|ll|query)=)(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(String(mapa || ''));
	return m ? { lat: m[1], lng: m[2] } : null;
};

function feeds(ctx, properties, propsEn) {
	const base = ctx.siteUrl.replace(/\/$/, '');
	const disponibles = properties.filter((p) => (p.estado || 'disponible') === 'disponible');
	const enPorId = Object.fromEntries((propsEn || []).map((p) => [p.id, p]));
	const abs = (u) => (/^https?:/.test(u) ? u : `${base}${u}`);
	const url = (p, fuente) => `${base}${T.propertyUrl(p)}?utm_source=${fuente}&utm_medium=catalogo&utm_campaign=difusion`;
	// Los catálogos piden JPG: el CDN de imágenes de Netlify convierte las fotos WebP al vuelo.
	const fotos = (p) => (p.fotos || []).map((f) => f.url).filter(Boolean)
		.map((u) => `${base}/.netlify/images?url=${encodeURIComponent(u)}&fm=jpg&w=1600&q=85`);
	const sinPrecio = (p) => !p.precio || (p.vipLanding && p.vipLanding.ocultarPrecio);

	// Meta (Facebook/Instagram): catálogo de inmuebles ("home listings").
	const tipoMeta = { casa: 'house', apartamento: 'apartment', terreno: 'land', oficina: 'other', local: 'other', bodega: 'other', finca: 'other' };
	const meta = `<?xml version="1.0" encoding="UTF-8"?>
<listings>
	<title>${xmlEsc(ctx.site.general.nombre)}</title>
	<link rel="self" href="${base}/feeds/meta-inmuebles.xml"/>
${disponibles.filter((p) => !sinPrecio(p) && fotos(p).length).map((p) => {
		const geo = coordenadas(p.mapa);
		return `	<listing>
		<home_listing_id>${xmlEsc(p.id)}</home_listing_id>
		<name>${xmlEsc(p.titulo)}</name>
		<availability>${p.operacion === 'renta' ? 'for_rent' : 'for_sale'}</availability>
		<listing_type>${p.operacion === 'renta' ? 'for_rent_by_agent' : 'for_sale_by_agent'}</listing_type>
		<description>${xmlEsc(textoPlano(p.descripcion).slice(0, 5000))}</description>
		<address format="simple">
			<component name="addr1">${xmlEsc(p.direccion || p.zona || '')}</component>
			<component name="city">${xmlEsc(p.ciudad || 'Guatemala')}</component>
			<component name="region">Guatemala</component>
			<component name="country">Guatemala</component>
		</address>
		<neighborhood>${xmlEsc(p.zona || '')}</neighborhood>${geo ? `
		<latitude>${geo.lat}</latitude>
		<longitude>${geo.lng}</longitude>` : ''}
${fotos(p).slice(0, 20).map((f) => `		<image><url>${xmlEsc(f)}</url></image>`).join('\n')}
		<price>${Number(p.precio)} ${xmlEsc(p.moneda || 'USD')}</price>
		<property_type>${tipoMeta[p.tipo] || 'other'}</property_type>${p.habitaciones ? `
		<num_beds>${Number(p.habitaciones)}</num_beds>` : ''}${p.banos ? `
		<num_baths>${Number(p.banos)}</num_baths>` : ''}${p.m2Construccion ? `
		<area_size>${Number(p.m2Construccion)}</area_size>
		<area_unit>sq_m</area_unit>` : ''}
		<url>${xmlEsc(url(p, 'facebook'))}</url>
	</listing>`;
	}).join('\n')}
</listings>
`;

	// Kyero v3: formato XML que aceptan muchos portales y agregadores internacionales.
	const tipoKyero = { casa: 'house', apartamento: 'apartment', terreno: 'land', oficina: 'commercial', local: 'commercial', bodega: 'commercial', finca: 'country house' };
	const kyero = `<?xml version="1.0" encoding="UTF-8"?>
<root>
	<kyero><feed_version>3</feed_version></kyero>
${disponibles.filter((p) => fotos(p).length).map((p) => {
		const en = enPorId[p.id];
		const geo = coordenadas(p.mapa);
		const fecha = String(p.updatedAt || p.createdAt || '').replace('T', ' ').slice(0, 19);
		return `	<property>
		<id>${xmlEsc(p.id)}</id>${fecha ? `
		<date>${xmlEsc(fecha)}</date>` : ''}
		<ref>${xmlEsc(T.propertyCode(p))}</ref>
		<price>${sinPrecio(p) ? 0 : Number(p.precio)}</price>
		<currency>${xmlEsc(p.moneda || 'USD')}</currency>
		<price_freq>${p.operacion === 'renta' ? 'month' : 'sale'}</price_freq>
		<new_build>0</new_build>
		<type>${tipoKyero[p.tipo] || 'house'}</type>
		<town>${xmlEsc([p.zona, p.ciudad].filter(Boolean).join(', ') || 'Guatemala')}</town>
		<province>Guatemala</province>
		<country>Guatemala</country>${geo ? `
		<location><latitude>${geo.lat}</latitude><longitude>${geo.lng}</longitude></location>` : ''}
		<beds>${Number(p.habitaciones) || 0}</beds>
		<baths>${Number(p.banos) || 0}</baths>
		<pool>${(p.amenidades || []).some((a) => /piscina|pool/i.test(a)) ? 1 : 0}</pool>
		<surface_area>${p.m2Construccion ? `<built>${Number(p.m2Construccion)}</built>` : ''}${p.m2Terreno ? `<plot>${Number(p.m2Terreno)}</plot>` : ''}</surface_area>
		<url><es>${xmlEsc(url(p, 'kyero'))}</es>${en ? `<en>${xmlEsc(url(en, 'kyero'))}</en>` : ''}</url>
		<desc><es>${xmlEsc(textoPlano(p.descripcion))}</es>${en ? `<en>${xmlEsc(textoPlano(en.descripcion))}</en>` : ''}</desc>
		<features>${(en ? en.amenidades : p.amenidades || []).map((a) => `<feature>${xmlEsc(a)}</feature>`).join('')}</features>
		<images>${fotos(p).slice(0, 30).map((f, i) => `<image id="${i + 1}"><url>${xmlEsc(f)}</url></image>`).join('')}</images>
	</property>`;
	}).join('\n')}
</root>
`;

	const json = JSON.stringify({
		generado: new Date().toISOString(),
		empresa: ctx.site.general.nombre,
		propiedades: disponibles.map((p) => {
			const en = enPorId[p.id];
			const originales = (p.fotos || []).map((f) => abs(f.url)).filter(Boolean);
			return {
				id: p.id, codigo: T.propertyCode(p), titulo: p.titulo, operacion: p.operacion, tipo: p.tipo,
				precio: sinPrecio(p) ? null : p.precio, moneda: p.moneda || 'USD',
				zona: p.zona || '', ciudad: p.ciudad || '', direccion: p.direccion || '', coordenadas: coordenadas(p.mapa),
				habitaciones: p.habitaciones || 0, banos: p.banos || 0, parqueos: p.parqueos || 0,
				m2Construccion: p.m2Construccion || 0, m2Terreno: p.m2Terreno || 0, amenidades: p.amenidades || [],
				descripcion: textoPlano(p.descripcion), fotos: originales, fotosJpg: fotos(p), video: p.video || '',
				url: `${base}${T.propertyUrl(p)}`, actualizado: p.updatedAt || null,
				en: en ? { titulo: en.titulo, descripcion: textoPlano(en.descripcion), url: `${base}${T.propertyUrl(en)}` } : null
			};
		})
	}, null, 1);
	return { meta, kyero, json };
}

function sitemap(ctx, urls) {
	const base = ctx.siteUrl.replace(/\/$/, '');
	// Sin fecha conocida se omite lastmod: una fecha falsa hace que Google deje de confiar en ellas.
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((u) => `	<url><loc>${base}${u.path}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${u.priority ? `<priority>${u.priority}</priority>` : ''}${imageEntries(ctx, u)}</url>`).join('\n')}
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
	if (ctx.enActivo) lines.push('/en/* /en/404.html 404');
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
	// Textos del sitio: se guardan los originales para el panel y se aplican los personalizados.
	const textosOriginales = textosPorDefecto();
	aplicarTextos(site.textos);
	const agents = data.agents.slice().sort(byOrder);
	const properties = normalizeProperties(data.properties);
	// Las páginas y artículos con idioma "en" van al sitio en inglés.
	data.pagesEn = data.pages.filter((p) => p.idioma === 'en');
	data.postsEn = (data.posts || []).filter((p) => p.idioma === 'en');
	const pages = normalizePages(data.pages.filter((p) => p.idioma !== 'en'));
	const enActivo = Boolean(site.en) && site.en.activo !== false;
	// Pares de URLs español ↔ inglés para el selector de idioma.
	const altMap = new Map();
	const registrarPar = (es, en) => { altMap.set(es, en); altMap.set(en, es); };
	[['/', '/en/'], ['/propiedades/', '/en/properties/'], ['/propiedades/venta/', '/en/properties/for-sale/'],
		['/propiedades/renta/', '/en/properties/for-rent/'], ['/vip/', '/en/luxury/']].forEach(([a, b]) => registrarPar(a, b));
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
		posts: normalizePosts((data.posts || []).filter((p) => p.idioma !== 'en')),
		enActivo,
		altLang: enActivo ? (ruta) => altMap.get(ruta) || '/en/' : null,
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

	// Fecha de la última modificación real del inventario: Google ignora el lastmod si cambia en cada build.
	const ultimaFecha = (list) => list.map((p) => String(p.updatedAt || p.createdAt || '').slice(0, 10)).filter(Boolean).sort().pop();
	const inventarioMod = ultimaFecha(properties) || String(site.updatedAt || '').slice(0, 10) || undefined;
	let propsEnGlobal = [];
	const urls = [{ path: '/', priority: '1.0', lastmod: inventarioMod, images: (site.hero.imagenes || []).slice(0, 1) }];
	await writePage('/', T.homePage(ctx));

	const listing = (key, defaults) => ({
		...defaults,
		heading: (L[key] && L[key].h1) || defaults.heading,
		title: (L[key] && L[key].titulo) || defaults.title,
		description: (L[key] && L[key].descripcion) || defaults.description,
		intro: (L[key] && L[key].intro) || defaults.intro || ''
	});
	const listings = [
		listing('todas', { alternates: enActivo ? { es: '/propiedades/', en: '/en/properties/' } : null, path: '/propiedades/', heading: 'Propiedades', title: `Propiedades en venta y renta en Guatemala | ${nombre}`, description: 'Casas, apartamentos, terrenos y oficinas en venta y renta en Guatemala. Filtra por zona, precio y número de habitaciones.' }),
		listing('venta', { alternates: enActivo ? { es: '/propiedades/venta/', en: '/en/properties/for-sale/' } : null, path: '/propiedades/venta/', operacion: 'venta', heading: 'Propiedades en venta', title: `Casas y apartamentos en venta en Guatemala | ${nombre}`, description: 'Propiedades en venta en Guatemala: casas, apartamentos y terrenos verificados, con asesoría en financiamiento.' }),
		listing('renta', { alternates: enActivo ? { es: '/propiedades/renta/', en: '/en/properties/for-rent/' } : null, path: '/propiedades/renta/', operacion: 'renta', heading: 'Propiedades en renta', title: `Casas y apartamentos en renta en Guatemala | ${nombre}`, description: 'Propiedades en renta en Guatemala: casas, apartamentos y oficinas con contratos claros y seguros.' })
	];
	for (const l of listings) {
		await writePage(l.path, T.listingPage(ctx, l));
		urls.push({ path: l.path, priority: '0.9', lastmod: ultimaFecha(properties.filter((p) => !l.operacion || p.operacion === l.operacion)) });
	}

	const zonaOpts = new Map();
	for (const z of ctx.zonas) {
		// Texto propio de la zona editado en el panel (Contenido del sitio → Zonas); si no hay, se usa uno automático.
		const g = guiaZona(site, z.nombre);
		zonaOpts.set(z.nombre, {
			path: z.url,
			zona: z.nombre,
			heading: g.h1 || `Propiedades en ${z.nombre}`,
			title: g.titulo || `Casas y apartamentos en ${z.nombre}, Guatemala | ${nombre}`,
			description: g.descripcion || `Propiedades en venta y renta en ${z.nombre}, Guatemala. ${z.total === 1 ? '1 propiedad disponible' : `${z.total} propiedades disponibles`} con asesoría personalizada.`,
			intro: g.intro || `Casas, apartamentos y terrenos en ${z.nombre}. Si no encuentras lo que buscas, déjanos tus datos y te enviamos opciones que aún no están publicadas.`,
			contenido: g.contenido || '',
			imagen: g.imagen || ''
		});
		await writePage(z.url, T.listingPage(ctx, zonaOpts.get(z.nombre)));
		urls.push({ path: z.url, priority: '0.8', lastmod: ultimaFecha(properties.filter((p) => p.zona === z.nombre)) });
		// Zona + operación ("casas en venta en zona 16"): solo si hay suficientes propiedades
		// y la página no repite exactamente el listado de la zona (evita contenido duplicado).
		for (const [op, base, verbo] of [['venta', '/propiedades/venta/', 'en venta'], ['renta', '/propiedades/renta/', 'en renta']]) {
			if (z[op] < MIN_LISTADO || z[op] === z.total) continue;
			const url = `${base}${z.slug}/`;
			await writePage(url, T.listingPage(ctx, {
				path: url,
				zona: z.nombre,
				operacion: op,
				heading: `Propiedades ${verbo} en ${z.nombre}`,
				title: [`Casas y apartamentos ${verbo} en ${z.nombre}, Guatemala | ${nombre}`, `Casas ${verbo} en ${z.nombre}, Guatemala | ${nombre}`, `Casas ${verbo} en ${z.nombre} | ${nombre}`]
					.find((t) => t.length <= 65) || `Casas ${verbo} en ${z.nombre}`,
				description: `${z[op]} propiedades ${verbo} en ${z.nombre}, Guatemala. Fotos, precios y asesoría personalizada para agendar tu visita.`,
				intro: `Propiedades ${verbo} en ${z.nombre}. Escríbenos si buscas algo específico: tenemos opciones que aún no están publicadas.`
			}));
			urls.push({ path: url, priority: '0.8', lastmod: ultimaFecha(properties.filter((p) => p.zona === z.nombre && p.operacion === op)) });
		}
	}

	await writePage('/blog/', T.blogIndexPage(ctx));
	urls.push({ path: '/blog/', priority: '0.6', lastmod: ctx.posts.map((x) => String(x.fecha || '').slice(0, 10)).filter(Boolean).sort().pop() });
	for (const post of ctx.posts) {
		await writePage(post.url, T.blogPostPage(ctx, post));
		urls.push({ path: post.url, priority: '0.6', lastmod: String(post.fecha || '').slice(0, 10) || undefined, images: post.imagen ? [post.imagen] : [] });
	}

	await writePage('/vip/', T.vipIndexPage(ctx));
	urls.push({ path: '/vip/', priority: '0.8', lastmod: ultimaFecha(properties.filter((p) => p.vip)) });

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
		urls.push({ path: page.url, priority: '0.4', lastmod: String(page.updatedAt || '').slice(0, 10) || undefined });
	}

	// ------------------------------------------------ Sitio en inglés (/en/)
	if (ctx.enActivo) {
		const siteEn = deepMerge(site, site.en || {});
		// Los contadores en inglés usan el mismo ícono que en español (el panel solo lo pide una vez).
		if (siteEn.contadores && Array.isArray(siteEn.contadores.items)) {
			siteEn.contadores = { ...siteEn.contadores, items: siteEn.contadores.items.map((c, i) => ({ icono: (site.contadores.items[i] || {}).icono, ...c })) };
		}
		const propsEn = properties.map(propiedadEn).filter(Boolean);
		propsEnGlobal = propsEn;
		const pagesEn = normalizePages(data.pagesEn, '/en');
		const postsEn = normalizePosts(data.postsEn).map((p) => ({ ...p, url: `/en/blog/${p.slug}/` }));
		enlazarTraducciones(pages, pagesEn);
		enlazarTraducciones(ctx.posts, postsEn);
		[...pages, ...ctx.posts].filter((x) => x._alternates).forEach((x) => registrarPar(x._alternates.es, x._alternates.en));
		if (postsEn.length) registrarPar('/blog/', '/en/blog/');
		const ctxEn = {
			...ctx,
			lang: 'en',
			site: siteEn,
			altLang: (ruta) => altMap.get(ruta) || '/',
			properties: propsEn,
			agents: agents.map((a) => ({ ...a, cargo: (a.en && a.en.cargo) || 'Real estate advisor', bio: (a.en && a.en.bio) || '' })),
			testimonials: ctx.testimonials.filter((tm) => tm.en && tm.en.texto).map((tm) => ({ ...tm, texto: tm.en.texto, rol: tm.en.rol || '' })),
			pages: pagesEn,
			posts: postsEn,
			zonas: buildZonas(propsEn, '/en/properties/')
		};
		ctxEn.agentsById = Object.fromEntries(ctxEn.agents.map((a) => [a.id, a]));
		const LE = siteEn.listados || {};
		const listingEn = (key, defaults) => ({
			...defaults,
			heading: (LE[key] && LE[key].h1) || defaults.heading,
			title: (LE[key] && LE[key].titulo) || defaults.title,
			description: (LE[key] && LE[key].descripcion) || defaults.description,
			intro: (LE[key] && LE[key].intro) || ''
		});
		await writePage('/en/', T.homePage(ctxEn));
		urls.push({ path: '/en/', priority: '1.0' });
		for (const l of [
			listingEn('todas', { path: '/en/properties/', alternates: { es: '/propiedades/', en: '/en/properties/' }, heading: 'Properties in Guatemala', title: `Homes for sale and rent in Guatemala | ${nombre}`, description: 'Houses, condos and land for sale and rent in Guatemala City and beyond. Prices in USD, video tours and support for buyers in the US.' }),
			listingEn('venta', { path: '/en/properties/for-sale/', operacion: 'venta', alternates: { es: '/propiedades/venta/', en: '/en/properties/for-sale/' }, heading: 'Homes for sale in Guatemala', title: `Homes for sale in Guatemala | ${nombre}`, description: 'Houses and condos for sale in Guatemala with verified titles, USD prices, live video tours and remote closing support for US buyers.' }),
			listingEn('renta', { path: '/en/properties/for-rent/', operacion: 'renta', alternates: { es: '/propiedades/renta/', en: '/en/properties/for-rent/' }, heading: 'Homes for rent in Guatemala', title: `Homes for rent in Guatemala | ${nombre}`, description: 'Houses, condos and offices for rent in Guatemala City, with clear contracts and an English-speaking point of contact.' })
		]) {
			await writePage(l.path, T.listingPage(ctxEn, l));
			urls.push({ path: l.path, priority: '0.9' });
		}
		for (const z of ctxEn.zonas) {
			const es = ctx.zonas.find((x) => x.nombre === z.nombre);
			const alternates = es ? { es: es.url, en: z.url } : null;
			const g = guiaZona(site, z.nombre, 'en');
			await writePage(z.url, T.listingPage(ctxEn, {
				path: z.url,
				alternates,
				zona: z.nombre,
				heading: g.h1 || `Homes in ${z.nombre}, Guatemala City`,
				title: g.titulo || `Homes in ${z.nombre}, Guatemala City | ${nombre}`,
				description: g.descripcion || `${z.total === 1 ? '1 property' : `${z.total} properties`} for sale and rent in ${z.nombre}, Guatemala City. USD prices, live video tours and support for buyers in the US.`,
				intro: g.intro || `Houses, condos and land in ${z.nombre}. Can't find what you need? Tell us and we'll send you options that aren't listed yet.`,
				contenido: g.contenido || '',
				imagen: g.imagen || ''
			}));
			if (es) {
				registrarPar(es.url, z.url);
				await writePage(es.url, T.listingPage(ctx, { ...zonaOpts.get(z.nombre), alternates }));
			}
			urls.push({ path: z.url, priority: '0.8', lastmod: ultimaFecha(propsEn.filter((p) => p.zona === z.nombre)) });
		}
		await writePage('/en/luxury/', T.vipIndexPage(ctxEn));
		urls.push({ path: '/en/luxury/', priority: '0.8' });
		for (const p of propsEn) {
			const es = properties.find((x) => x.id === p.id);
			es._alternates = p._alternates = { es: T.propertyUrl(es), en: T.propertyUrl(p) };
			registrarPar(T.propertyUrl(es), T.propertyUrl(p));
			await writePage(T.propertyUrl(p), p.vip ? T.vipLandingPage(ctxEn, p) : T.propertyPage(ctxEn, p));
			urls.push({ path: T.propertyUrl(p), priority: '0.8', images: (p.fotos || []).map((f) => f.url) });
		}
		for (const page of pagesEn) {
			await writePage(page.url, T.contentPage(ctxEn, page));
			urls.push({ path: page.url, priority: '0.6' });
		}
		if (postsEn.length) {
			await writePage('/en/blog/', T.blogIndexPage(ctxEn));
			urls.push({ path: '/en/blog/', priority: '0.6' });
			for (const post of postsEn) {
				await writePage(post.url, T.blogPostPage(ctxEn, post));
				urls.push({ path: post.url, priority: '0.6' });
			}
		}
		await writePage('/en/404.html', T.notFoundPage(ctxEn));
		// Las fichas en español con traducción se regeneran con su enlace hreflang.
		for (const es of properties.filter((x) => x._alternates)) {
			await writePage(T.propertyUrl(es), es.vip ? T.vipLandingPage(ctx, es) : T.propertyPage(ctx, es));
		}
		for (const page of pages.filter((x) => x._alternates)) await writePage(page.url, T.contentPage(ctx, page));
		for (const post of ctx.posts.filter((x) => x._alternates)) await writePage(post.url, T.blogPostPage(ctx, post));
		console.log(`· Sitio en inglés: ${propsEn.length} propiedades traducidas, ${pagesEn.length} páginas, ${postsEn.length} artículos`);
	}

	await writePage('/404.html', T.notFoundPage(ctx));
	const assets = await buildAssets({ root: ROOT, dist: DIST });
	await writeFile(path.join(DIST, 'admin', 'textos.json'), JSON.stringify(textosOriginales));

	await writeFile(path.join(DIST, 'sitemap.xml'), sitemap(ctx, urls));
	await writeFile(path.join(DIST, '_redirects'), redirects(ctx));
	await writeFile(path.join(DIST, 'robots.txt'), ctx.noindex
		? 'User-agent: *\nDisallow: /\n'
		: `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${config.siteUrl.replace(/\/$/, '')}/sitemap.xml\n`);

	if (!ctx.noindex) {
		// Clave de IndexNow (Bing, Copilot, Yandex): es pública por diseño; la función deploy-succeeded la usa.
		await writeFile(path.join(DIST, `${indexNowKey(config.siteUrl)}.txt`), indexNowKey(config.siteUrl));
		await writeFile(path.join(DIST, 'llms.txt'), llmsTxt(ctx, properties, pages));
	}
	// Los catálogos se generan siempre: los portales los leen aunque el sitio aún no se indexe en Google.
	const catalogos = feeds(ctx, properties, propsEnGlobal);
	await mkdir(path.join(DIST, 'feeds'), { recursive: true });
	await writeFile(path.join(DIST, 'feeds', 'meta-inmuebles.xml'), catalogos.meta);
	await writeFile(path.join(DIST, 'feeds', 'kyero.xml'), catalogos.kyero);
	await writeFile(path.join(DIST, 'feeds', 'propiedades.json'), catalogos.json);

	console.log(`✓ Sitio generado en dist/ (${data.source}): ${properties.length} propiedades, ${pages.length} páginas, ${ctx.posts.length} artículos, ${urls.length} URLs en el sitemap${ctx.noindex ? ' · SIN INDEXAR' : ''}`);
	console.log(`  CSS ${assets.cssOriginalKb} KB → ${assets.cssKb} KB · JS ${assets.jsOriginalKb} KB → ${assets.jsKb} KB`);
}

main().catch((err) => {
	console.error('✗ Error al generar el sitio:', err.message);
	process.exit(1);
});
