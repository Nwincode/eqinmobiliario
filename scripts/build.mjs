// Genera el sitio estático en dist/ a partir de Firestore (o de data/seed.json
// mientras Firebase no esté configurado). Netlify lo ejecuta en cada publicación.
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from './lib/firestore.mjs';
import { deepMerge, slugify, byOrder, cifra, lugarDe, departamentoDe } from './lib/util.mjs';
import { planListados, crearEnlaces, textosListado, nombreTipo } from './lib/landings.mjs';
import { revisarEnlaces } from './lib/enlaces.mjs';
import { montoPrecio, telefonoWa, horarioEn, conPiesCuadrados } from '../admin/js/formato.js';
import { amenidadesEn, mascotasUnaVez } from '../admin/js/estados.js';
import * as T from './lib/templates.mjs';
import { aplicarTextos, textosPorDefecto } from './lib/i18n.mjs';
import { buildAssets } from './lib/assets.mjs';
import { visibilidadDe } from '../admin/js/estados.js';
import { conEmojis, sinBloquesGenerados } from '../admin/js/descripcion.js';
import { seoEnViejo } from '../admin/js/reglas.js';
import { datosConfigurados } from '../netlify/lib/firestore.mjs';
import { sociosEnMora, pausados } from '../netlify/lib/comisiones.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// DIST_DIR: otra carpeta de salida (las pruebas generan un sitio de ejemplo sin tocar dist/).
const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(ROOT, 'dist');

// Rutas que no pueden usar las páginas de contenido.
const RESERVED = new Set(['propiedades', 'propiedad', 'vip', 'blog', 'admin', 'css', 'js', 'images', 'fonts', 'data', 'scripts', '404', 'propietarios', 'calculadora-de-renta']);

const STATIC_ASSETS = [
	'css', 'js', 'images', 'admin',
	'fonts/icomoon/style.css', 'fonts/icomoon/fonts',
	'fonts/flaticon/font/flaticon.css', 'fonts/flaticon/font/Flaticon.eot', 'fonts/flaticon/font/Flaticon.svg',
	'fonts/flaticon/font/Flaticon.ttf', 'fonts/flaticon/font/Flaticon.woff', 'fonts/flaticon/font/Flaticon.woff2',
	'favicon.png', 'apple-touch-icon.png', 'logo-equipo-inmobiliario.png', 'docs/marca/logo/imagotipo-blanco.svg', // portada del listado en PDF
	 'Icono_Equipoinmobiliario@0.75x.png', 'site.config.json',
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

		// DATOS=seed: generar con el archivo de ejemplo aunque Firebase esté configurado (pruebas, sin red).
	if (!fb.projectId || !fb.apiKey || process.env.DATOS === 'seed') {
		console.log(`· ${process.env.DATOS === 'seed' ? 'DATOS=seed' : 'Firebase sin configurar'}: se usan los datos de ${process.env.SEED_FILE || 'data/seed.json'}`);
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
				// Formato viejo de «Mejorar descripción»: sin las listas copiadas de los campos (ver descripcion.js).
				descripcion: sinBloquesGenerados(p.descripcion),
				seo: seoPropio(p.seo),
				slug,
				fechaOrden: toMillis(p.createdAt) || (1e13 - (p.orden || 0))
			};
		})
		.sort((a, b) => (b.destacada === true) - (a.destacada === true) || byOrder(a, b) || b.fechaOrden - a.fechaOrden);
}

// El SEO que el panel puso solo (igual a seo.auto) se vuelve a calcular aquí con la regla de hoy: así un cambio en
// admin/js/seo-auto.js llega a todas las fichas sin volver a guardarlas. Lo escrito a mano se respeta.
function seoPropio(seo) {
	const s = seo || {}, auto = s.auto || {};
	return { ...s, titulo: s.titulo && s.titulo !== auto.titulo ? s.titulo : '', descripcion: s.descripcion && s.descripcion !== auto.descripcion ? s.descripcion : '' };
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
		// En inglés, cada m² con sus pies cuadrados (descripción, meta y JSON-LD).
		descripcion: conPiesCuadrados(sinBloquesGenerados(e.descripcion)),
		amenidades: e.amenidades?.length ? e.amenidades : amenidadesEn(p.amenidades),
		// El que armaba la regla anterior del traductor («Lot for Sale Guatemala») se reemplaza por el automático.
		seo: (({ descripcion, ...seo }) => ({ ...seo, descripcion: conPiesCuadrados(descripcion).length <= 160 ? conPiesCuadrados(descripcion) : descripcion }))(seoTraducido(p, e.seo)),
		// Cómo llegar, reglas y cancelación: en inglés si ya se tradujeron; si no, el original.
		vacacional: p.vacacional && { ...p.vacacional, ...Object.fromEntries(Object.entries(e.vacacional || {}).filter(([, x]) => x)) },
		vipLanding: { ...(p.vipLanding || {}), titular: '', subtitular: '', puntosClave: [], ctaTexto: '', ...(e.vipLanding || {}) },
		fotos: (p.fotos || []).map((f) => ({ url: f.url }))
	};
}

function seoTraducido(p, seo) {
	const s = seo || {}, viejo = seoEnViejo(p);
	return { ...s, titulo: s.titulo === viejo.titulo ? '' : s.titulo || '', descripcion: s.descripcion === viejo.descripcion ? '' : s.descripcion || '' };
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

// Contenido de una zona desde settings/site → zonas (lista); la versión en inglés va en el campo "en".
function guiaZona(site, nombre, lang = 'es') {
	const z = (site.zonas || []).find((x) => slugify(x.nombre || '') === slugify(nombre || ''));
	if (!z) return {};
	const base = { h1: z.h1, titulo: z.titulo, descripcion: z.descripcion, intro: z.intro, contenido: z.contenido, imagen: z.imagen };
	if (lang !== 'en') return base;
	const en = z.en || {};
	return { h1: en.h1, titulo: en.titulo, descripcion: en.descripcion, intro: en.intro, contenido: en.contenido, imagen: z.imagen };
}

// Textos del listado general y de cada operación (editables en Contenido → Listados). Los de tipo y zona son
// automáticos (scripts/lib/landings.mjs); los de una zona se editan en Contenido → Zonas.
const TEXTOS_LISTADO = {
	es: {
		todas: (n) => ({ heading: 'Propiedades', title: `Propiedades en venta y renta en Guatemala | ${n}`, description: 'Casas, apartamentos, terrenos y oficinas en venta y renta en Guatemala. Filtra por zona, precio y número de habitaciones.' }),
		venta: (n) => ({ heading: 'Propiedades en venta', title: `Casas y apartamentos en venta en Guatemala | ${n}`, description: 'Propiedades en venta en Guatemala: casas, apartamentos y terrenos verificados, con fotos, precios y asesoría en financiamiento.' }),
		renta: (n) => ({ heading: 'Propiedades en renta', title: `Casas y apartamentos en renta en Guatemala | ${n}`, description: 'Propiedades en renta en Guatemala: casas, apartamentos y oficinas con fotos, precios al mes y contratos claros y seguros.' }),
		vacacional: (n) => ({ heading: 'Rentas vacacionales en Guatemala', title: `Renta vacacional por noches en Guatemala | ${n}`, description: 'Casas y apartamentos para tus vacaciones en Guatemala, por noche: elige tus fechas, ve la disponibilidad y solicita tu reserva.' })
	},
	en: {
		todas: (n) => ({ heading: 'Properties in Guatemala', title: `Homes for sale and rent in Guatemala | ${n}`, description: 'Houses, condos and land for sale and rent in Guatemala City and beyond. Prices in USD, video tours and support for buyers in the US.' }),
		venta: (n) => ({ heading: 'Homes for sale in Guatemala', title: `Homes for sale in Guatemala | ${n}`, description: 'Houses and condos for sale in Guatemala with verified titles, USD prices, live video tours and remote closing support for US buyers.' }),
		renta: (n) => ({ heading: 'Homes for rent in Guatemala', title: `Homes for rent in Guatemala | ${n}`, description: 'Houses, condos and offices for rent in Guatemala City, with monthly prices, clear contracts and an English-speaking point of contact.' }),
		vacacional: (n) => ({ heading: 'Vacation rentals in Guatemala', title: `Vacation rentals by the night in Guatemala | ${n}`, description: 'Houses and condos for your vacation in Guatemala, by the night: pick your dates, check availability and request your booking.' })
	}
};

// Deja en cada página del plan sus textos (e.opts): encabezado, título, descripción, introducción y precios.
function textosDelPlan(plan, listados = {}, site, lang, nombre) {
	for (const e of plan) {
		if (e.pagina === 'vip') continue;
		const key = e.pagina === 'todas' ? 'todas' : e.pagina === 'op' ? e.operacion : '';
		if (key) {
			const d = TEXTOS_LISTADO[lang][key](nombre), l = (listados || {})[key] || {};
			e.opts = { heading: l.h1 || d.heading, title: l.titulo || d.title, description: l.descripcion || d.description, intro: l.intro || '' };
			continue;
		}
		const auto = textosListado(e, { nombre, lang, plan });
		const g = e.pagina === 'zona' ? guiaZona(site, e.zona, lang) : {};
		e.opts = {
			heading: g.h1 || auto.heading, title: g.titulo || auto.title, description: g.descripcion || auto.description,
			intro: g.intro || auto.intro, contenido: g.contenido || '', imagen: g.imagen || '',
			// Bloque de precios (rango, mediana, por m²) en las páginas de zona.
			precios: e.pagina.startsWith('zona') ? auto.precios : []
		};
	}
}

// Qué se indexa de lo que se escribe, leído de la etiqueta robots de cada página: el sitemap y llms.txt
// llevan exactamente estas (una sola fuente, sin listas aparte que se desincronicen).
const indexables = new Map();

async function writePage(urlPath, html) {
	indexables.set(urlPath, !/<meta name="robots" content="noindex/.test(html));
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
function llmsTxt(ctx, properties, pages, { planEn = [], pagesEn = [], postsEn = [], indexable }) {
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
		`Texto completo de cada propiedad y cada guía: ${base}/llms-full.txt`,
		'',
		'## Propiedades',
		'',
		// Los mismos listados que el sitemap: solo los que se indexan.
		...ctx.plan.filter((e) => e.pagina !== 'vip' && indexable(e.url)).map((e) => `- [${e.opts.heading}](${base}${e.url})`),
		...properties.filter((p) => p.estado === 'disponible').slice(0, 100).map((p) =>
			`- [${p.titulo}](${base}${T.propertyUrl(p)}): ${p.operacion === 'vacacional' ? 'renta vacacional por noche' : p.operacion === 'renta' ? 'renta' : 'venta'}, ${lugarDe(p)}${p.precio && !(p.vipLanding && p.vipLanding.ocultarPrecio) ? `, ${p.moneda || 'USD'} ${Number(p.precio).toLocaleString('en-US')}` : ''}${p.habitaciones ? `, ${p.habitaciones} ${Number(p.habitaciones) === 1 ? 'habitación' : 'habitaciones'}` : ''}${p.m2Construccion ? `, ${cifra(p.m2Construccion)} m²` : ''}`),
		'',
		'## Guías',
		'',
		...ctx.posts.filter((p) => indexable(p.url)).map((p) => `- [${p.titulo}](${base}${p.url})${p.resumen ? `: ${p.resumen}` : ''}`),
		...pages.filter((p) => indexable(p.url)).map((p) => `- [${p.titulo}](${base}${p.url})`),
		...(planEn.length ? ['', '## English', '',
			...planEn.filter((e) => e.pagina !== 'vip' && indexable(e.url)).map((e) => `- [${e.opts.heading}](${base}${e.url})`),
			...[...postsEn, ...pagesEn].filter((p) => indexable(p.url)).map((p) => `- [${p.titulo}](${base}${p.url})`)] : []),
		''
	];
	return lineas.join('\n');
}

// llms-full.txt: lo mismo que llms.txt pero con el texto completo de cada propiedad y cada guía,
// para que un asistente responda sin tener que abrir página por página.
function llmsFullTxt(ctx, properties) {
	const base = ctx.siteUrl.replace(/\/$/, '');
	const dato = (nombre, valor) => (valor ? `- ${nombre}: ${valor}` : null);
	const ficha = (p) => [
		`## ${p.titulo}`,
		'',
		dato('Enlace', `${base}${T.propertyUrl(p)}`),
		dato('Operación', p.operacion === 'vacacional' ? 'renta vacacional por noche' : p.operacion),
		dato('Tipo', p.tipo),
		dato('Ubicación', lugarDe(p)),
		dato('Precio', p.precio && !(p.vipLanding && p.vipLanding.ocultarPrecio) ? montoPrecio(p.precio, p.moneda || 'USD') : ''),
		dato('Habitaciones', p.habitaciones),
		dato('Baños', p.banos),
		dato('Parqueos', p.parqueos),
		dato('Construcción', p.m2Construccion ? `${cifra(p.m2Construccion)} m²` : ''),
		dato('Terreno', p.m2Terreno ? `${cifra(p.m2Terreno)} m²` : ''),
		dato('Amenidades', (p.amenidades || []).join(', ')),
		'',
		textoPlano(p.descripcion),
		''
	].filter((l) => l !== null);
	return [
		`# ${ctx.site.general.nombre}: catálogo y guías completas`,
		'',
		`> ${ctx.site.seo.descripcion}`,
		'',
		...properties.filter((p) => (p.estado || 'disponible') === 'disponible').flatMap(ficha),
		...ctx.posts.flatMap((p) => [`## ${p.titulo}`, '', `- Enlace: ${base}${p.url}`, '', textoPlano(p.contenido || p.resumen), ''])
	].join('\n');
}

// Buscadores con IA a los que se les da permiso explícito (además de la regla general).
const BOTS_IA = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'Bingbot'];

// ------------------------------------------------ Catálogos para portales (/feeds/)
const xmlEsc = (v) => String(v ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const textoPlano = (md) => String(md || '').replace(/[#*_>`\[\]]/g, '').replace(/\(https?:[^)]+\)/g, '').replace(/\n{3,}/g, '\n\n').trim();
const coordenadas = (mapa) => {
	const m = /(?:@|[?&](?:q|ll|query)=)(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(String(mapa || ''));
	return m ? { lat: m[1], lng: m[2] } : null;
};

function feeds(ctx, properties, propsEn) {
	const base = ctx.siteUrl.replace(/\/$/, '');
	// Los portales de Meta y Kyero no tienen precio por noche: la renta vacacional no va en los feeds.
	const disponibles = properties.filter((p) => (p.estado || 'disponible') === 'disponible' && p.operacion !== 'vacacional');
	const enPorId = Object.fromEntries((propsEn || []).map((p) => [p.id, p]));
	const abs = (u) => (/^https?:/.test(u) ? u : `${base}${u}`);
	const url = (p, fuente) => `${base}${T.propertyUrl(p)}?utm_source=${fuente}&utm_medium=catalogo&utm_campaign=difusion`;
	// Los catálogos piden JPG: el CDN de imágenes de Netlify convierte las fotos WebP al vuelo.
	const fotos = (p) => (p.fotos || []).map((f) => f.url).filter(Boolean)
		.map((u) => `${base}${T.fotoCdn(u, 1600, '&fm=jpg&q=85')}`);
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
		<description>${xmlEsc(textoPlano(conEmojis(p.descripcion)).slice(0, 5000))}</description>
		<address format="simple">
			<component name="addr1">${xmlEsc(p.direccion || p.zona || '')}</component>
			<component name="city">${xmlEsc(p.ciudad || 'Guatemala')}</component>
			<component name="region">${xmlEsc(departamentoDe(p) || 'Guatemala')}</component>
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
		<town>${xmlEsc(lugarDe(p) || 'Guatemala')}</town>
		<province>${xmlEsc(departamentoDe(p) || 'Guatemala')}</province>
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
// Página de cada propiedad según su estado (admin/js/estados.js):
// visible → ficha normal (o landing VIP) · vendida/rentada → ficha con aviso · pausada/retirada → «ya no disponible».
function fichaHtml(c, p) {
	const v = visibilidadDe(p);
	if (v === 'oculta') return T.propertyGonePage(c, p);
	if (v === 'cerrada' || !p.vip) return T.propertyPage(c, p);
	return T.vipLandingPage(c, p);
}

function redirects(ctx, todas = ctx.properties) {
	const lines = [];
	const add = (from, to) => {
		if (from && to && from !== to && !lines.some((l) => l.startsWith(`${from} `))) lines.push(`${from} ${to} 301`);
	};
	for (const p of todas) {
		const url = T.propertyUrl(p);
		add(p.vip ? `/propiedad/${p.slug}/` : `/vip/${p.slug}/`, url);
		for (const old of p.slugsAnteriores || []) {
			const s = slugify(old);
			if (s && s !== p.slug) {
				add(`/propiedad/${s}/`, url);
				add(`/vip/${s}/`, url);
			}
		}
		// Títulos anteriores en inglés (la dirección en inglés sale del título).
		const en = ctx.enActivo && propiedadEn(p);
		for (const old of (en && p.en.slugsAnteriores) || []) {
			const s = slugify(old);
			if (s && s !== en.slug) {
				add(`/en/property/${s}/`, T.propertyUrl(en));
				add(`/en/luxury/${s}/`, T.propertyUrl(en));
			}
		}
	}
	for (const r of ctx.site.seo.redirecciones || []) {
		const from = String(r.desde || '').trim();
		const to = String(r.hacia || '').trim();
		if (from.startsWith('/') && to) add(from, to);
	}
	// Zona, tipo o filtro que se quedó sin propiedades (enlaces viejos del blog o de Google): al listado padre que
	// tiene casas, no a un 404. Las páginas que existen no se tocan (Netlify sirve el archivo antes que la regla).
	for (const [pref] of ctx.enlaces.familias) {
		if (ctx.enActivo || !pref.startsWith('/en/')) lines.push(`${pref}* ${ctx.enlaces.resolver(`${pref}x/`)} 302`);
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
	// Todas las publicadas conservan su enlace; solo las que se ofrecen salen en portada, listados,
	// buscador, zonas, sitemap y catálogos. Vendidas/rentadas y pausadas/retiradas quedan aparte.
	const todas = normalizeProperties(data.properties);
	// La dirección y el mapa de una casa por noche son privados (properties/{id}/privado/llegada): si una casa
	// todavía los trae en su documento, no entran a ninguna página, catálogo ni archivo del sitio.
	// Tampoco usan la landing VIP: no tiene caja de reserva.
	for (const p of todas) if (p.operacion === 'vacacional') Object.assign(mascotasUnaVez(p), { direccion: '', mapa: '', vip: false });
	// Tampoco se ofrecen las casas de un socio con una comisión atrasada más de 72 h (vuelven solas al pagarla).
	const mora = data.source === 'firestore' && datosConfigurados() ? await sociosEnMora() : null;
	// Solo sus casas por noche: si el mismo dueño tiene algo en venta o renta, eso sigue publicado.
	const seOfrece = (p) => visibilidadDe(p) === 'visible' && !(p.operacion === 'vacacional' && mora?.[p.propietarioId] === 3);
	const properties = todas.filter(seOfrece);
	const hayVacacional = properties.some((p) => p.operacion === 'vacacional');
	const fueraDeListados = todas.filter((p) => !seOfrece(p));
	// Las páginas y artículos con idioma "en" van al sitio en inglés.
	data.pagesEn = data.pages.filter((p) => p.idioma === 'en');
	data.postsEn = (data.posts || []).filter((p) => p.idioma === 'en');
	const pages = normalizePages(data.pages.filter((p) => p.idioma !== 'en'));
	const enActivo = Boolean(site.en) && site.en.activo !== false;
	// Solo lo traducido sale en inglés; sin casas vacacionales traducidas no hay listado vacacional en inglés.
	const todasEn = enActivo ? todas.map(propiedadEn).filter(Boolean) : [];
	// Dos casas con el mismo título en inglés no pueden compartir dirección (igual que en español).
	const slugsEn = new Set();
	for (const p of todasEn) {
		if (slugsEn.has(p.slug)) p.slug = `${p.slug}-${slugify(p.id).slice(0, 8)}`;
		slugsEn.add(p.slug);
	}
	// La misma regla que en español (incluye la pausa por mora): una sola función para los dos idiomas.
	const propsEn = todasEn.filter(seOfrece);
	// Pares de URLs español ↔ inglés para el selector de idioma (los de los listados los agrega el plan).
	const altMap = new Map();
	const registrarPar = (es, en) => { altMap.set(es, en); altMap.set(en, es); };
	[['/', '/en/'], ['/calculadora-de-renta/', '/en/rental-calculator/']].forEach(([a, b]) => registrarPar(a, b));
	const isProduction = !process.env.CONTEXT || process.env.CONTEXT === 'production';
	const nombre = site.general.nombreCorto;
	const siteEn = enActivo ? deepMerge(site, site.en || {}) : null;
	// El horario se escribe una vez, en español; el de inglés sale de él (un `en.contacto.horario` viejo se ignora).
	if (siteEn) siteEn.contacto = { ...siteEn.contacto, horario: horarioEn(site.contacto.horario) };
	const pagesEn = enActivo ? normalizePages(data.pagesEn, '/en') : [];
	// Listados y páginas de aterrizaje de los dos idiomas (scripts/lib/landings.mjs). Se planean antes de escribir
	// nada: de ellos dependen los enlaces de todas las páginas (menú, pie, migas, enlaces del blog).
	const planEs = planListados(properties, { lang: 'es', ocupadas: new Set(pages.map((p) => p.url)) });
	const planEn = enActivo ? planListados(propsEn, { lang: 'en', ocupadas: new Set(pagesEn.map((p) => p.url)) }) : [];
	textosDelPlan(planEs, site.listados, site, 'es', nombre);
	if (enActivo) textosDelPlan(planEn, siteEn.listados, site, 'en', nombre);
	for (const e of planEs) {
		const otra = planEn.find((x) => x.clave === e.clave);
		if (!otra) continue;
		registrarPar(e.url, otra.url);
		// hreflang solo entre dos páginas que se indexan (las dos lo dicen: el par es el mismo objeto).
		if (e.indexable && otra.indexable) e.alternates = otra.alternates = { es: e.url, en: otra.url };
	}
	const enlaces = crearEnlaces(planEs, planEn);

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
		plan: planEs,
		enlaces,
		mobileVariant: (url) => {
			const m = /^\/images\/(.+)\.webp$/.exec(url || '');
			return m && existsSync(path.join(ROOT, 'images', `${m[1]}-800.webp`)) ? `/images/${m[1]}-800.webp` : T.fotoAncho(url, 800);
		},
		publicConfig: {
			projectId: config.firebase.projectId || '',
			apiKey: config.firebase.apiKey || '',
			storageBucket: config.firebase.storageBucket || '',
			// Ya con código de país (telefonoWa): js/site.js arma con él sus enlaces de WhatsApp.
			whatsapp: telefonoWa(site.contacto.whatsapp),
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
	let propsEnGlobal = [], postsEnGlobal = [];
	const urls = [{ path: '/', priority: '1.0', lastmod: inventarioMod, images: (site.hero.imagenes || []).slice(0, 1) }];
	await writePage('/', T.homePage(ctx));

	// Cada listado del plan, en el idioma de `c`. Los que no se indexan quedan fuera del sitemap solos (writePage).
	const PRIORIDAD = { todas: '0.9', op: '0.9' };
	const escribirListados = async (c, plan) => {
		for (const e of plan) {
			await writePage(e.url, e.pagina === 'vip' ? T.vipIndexPage(c, e)
				: T.listingPage(c, { ...e.opts, path: e.url, operacion: e.operacion, zona: e.zona, tipo: e.tipo, alternates: e.alternates || null, entrada: e }));
			urls.push({ path: e.url, priority: PRIORIDAD[e.pagina] || '0.8', lastmod: ultimaFecha(e.lista) });
		}
	};
	await escribirListados(ctx, planEs);

	await writePage('/blog/', T.blogIndexPage(ctx));
	urls.push({ path: '/blog/', priority: '0.6', lastmod: ctx.posts.map((x) => String(x.fecha || '').slice(0, 10)).filter(Boolean).sort().pop() });
	for (const post of ctx.posts) {
		await writePage(post.url, T.blogPostPage(ctx, post));
		urls.push({ path: post.url, priority: '0.6', lastmod: String(post.fecha || '').slice(0, 10) || undefined, images: post.imagen ? [post.imagen] : [] });
	}

	for (const p of properties) {
		await writePage(T.propertyUrl(p), fichaHtml(ctx, p));
		urls.push({
			path: T.propertyUrl(p),
			priority: p.vip ? '0.9' : '0.8',
			lastmod: String(p.updatedAt || p.createdAt || '').slice(0, 10) || undefined,
			images: (p.fotos || []).map((f) => f.url)
		});
	}

	// Vendidas, rentadas, pausadas y retiradas: su enlace sigue abriendo, pero no van al sitemap.
	for (const p of fueraDeListados) await writePage(T.propertyUrl(p), fichaHtml(ctx, p));

	for (const page of pages) {
		await writePage(page.url, T.contentPage(ctx, page));
		urls.push({ path: page.url, priority: '0.4', lastmod: String(page.updatedAt || '').slice(0, 10) || undefined });
	}

	// ------------------------------------------------ Sitio en inglés (/en/)
	if (ctx.enActivo) {
		// Los contadores en inglés usan el mismo ícono que en español (el panel solo lo pide una vez).
		if (siteEn.contadores && Array.isArray(siteEn.contadores.items)) {
			siteEn.contadores = { ...siteEn.contadores, items: siteEn.contadores.items.map((c, i) => ({ icono: (site.contadores.items[i] || {}).icono, ...c })) };
		}
		propsEnGlobal = propsEn;
		const postsEn = normalizePosts(data.postsEn).map((p) => ({ ...p, url: `/en/blog/${p.slug}/` }));
		postsEnGlobal = postsEn;
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
			plan: planEn
		};
		ctxEn.agentsById = Object.fromEntries(ctxEn.agents.map((a) => [a.id, a]));
		await writePage('/en/', T.homePage(ctxEn));
		urls.push({ path: '/en/', priority: '1.0', lastmod: ultimaFecha(propsEn) });
		await escribirListados(ctxEn, planEn);
		for (const p of todasEn) {
			const es = todas.find((x) => x.id === p.id);
			es._alternates = p._alternates = { es: T.propertyUrl(es), en: T.propertyUrl(p) };
			registrarPar(T.propertyUrl(es), T.propertyUrl(p));
			await writePage(T.propertyUrl(p), fichaHtml(ctxEn, p));
			if (seOfrece(p)) urls.push({ path: T.propertyUrl(p), priority: '0.8', images: (p.fotos || []).map((f) => f.url) });
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
		// Propietarios y colaboradores: lleva al panel (antes el portal). Fuera del sitemap.
		registrarPar('/propietarios/', '/en/owners/');
		await writePage('/en/owners/', T.portalPage(ctxEn));
		await writePage('/en/rental-calculator/', T.rentalCalculatorPage(ctxEn));
		urls.push({ path: '/en/rental-calculator/', priority: '0.5' });
		// Las fichas en español con traducción se regeneran con su enlace hreflang.
		for (const es of todas.filter((x) => x._alternates)) await writePage(T.propertyUrl(es), fichaHtml(ctx, es));
		for (const page of pages.filter((x) => x._alternates)) await writePage(page.url, T.contentPage(ctx, page));
		for (const post of ctx.posts.filter((x) => x._alternates)) await writePage(post.url, T.blogPostPage(ctx, post));
		console.log(`· Sitio en inglés: ${propsEn.length} propiedades traducidas, ${pagesEn.length} páginas, ${postsEn.length} artículos`);
	}

	await writePage('/404.html', T.notFoundPage(ctx));
	// Reserva y chat del cliente (renta vacacional): fuera del sitemap.
	if (hayVacacional) await writePage('/reserva/', T.reservaPage(ctx));
	await writePage('/propietarios/', T.portalPage(ctx));
	await writePage('/calculadora-de-renta/', T.rentalCalculatorPage(ctx));
	urls.push({ path: '/calculadora-de-renta/', priority: '0.5' });
	const assets = await buildAssets({ root: ROOT, dist: DIST });
	await writeFile(path.join(DIST, 'admin', 'textos.json'), JSON.stringify(textosOriginales));

	if (mora) await writeFile(path.join(DIST, 'pausados.txt'), pausados(mora));
	// Sitemap = exactamente las páginas que se indexan (lo dice su etiqueta robots). En una vista previa todo va
	// «noindex» y robots.txt bloquea el sitio: ahí el sitemap queda con todo, como antes.
	const indexable = (u) => ctx.noindex || indexables.get(u) === true;
	const enSitemap = urls.filter((u, i) => indexable(u.path) && urls.findIndex((x) => x.path === u.path) === i);
	// Una página que se indexa y no está en el sitemap es un olvido (salvo las fichas vendidas o pausadas, que a propósito no van).
	const aParte = new Set([...fueraDeListados, ...todasEn.filter((p) => !seOfrece(p))].map((p) => T.propertyUrl(p)));
	const sinSitemap = [...indexables].filter(([u, si]) => si && !aParte.has(u) && !/\.html$/.test(u) && !enSitemap.some((x) => x.path === u)).map(([u]) => u);
	if (!ctx.noindex && sinSitemap.length) console.warn(`  ⚠ Se indexan pero no están en el sitemap: ${sinSitemap.join(', ')}`);
	await writeFile(path.join(DIST, 'sitemap.xml'), sitemap(ctx, enSitemap));
	await writeFile(path.join(DIST, '_redirects'), redirects(ctx, todas));
	await writeFile(path.join(DIST, 'robots.txt'), ctx.noindex
		? 'User-agent: *\nDisallow: /\n'
		: `${['*', ...BOTS_IA].map((bot) => `User-agent: ${bot}\nAllow: /\nDisallow: /admin/\n`).join('\n')}\nSitemap: ${config.siteUrl.replace(/\/$/, '')}/sitemap.xml\n`);

	if (!ctx.noindex) {
		// Clave de IndexNow (Bing, Copilot, Yandex): es pública por diseño; la función deploy-succeeded la usa.
		await writeFile(path.join(DIST, `${indexNowKey(config.siteUrl)}.txt`), indexNowKey(config.siteUrl));
		await writeFile(path.join(DIST, 'llms.txt'), llmsTxt(ctx, properties, pages, { planEn, pagesEn, postsEn: postsEnGlobal, indexable }));
		await writeFile(path.join(DIST, 'llms-full.txt'), llmsFullTxt(ctx, properties));
	}
	// Los catálogos se generan siempre: los portales los leen aunque el sitio aún no se indexe en Google.
	const catalogos = feeds(ctx, properties, propsEnGlobal);
	await mkdir(path.join(DIST, 'feeds'), { recursive: true });
	await writeFile(path.join(DIST, 'feeds', 'meta-inmuebles.xml'), catalogos.meta);
	await writeFile(path.join(DIST, 'feeds', 'kyero.xml'), catalogos.kyero);
	await writeFile(path.join(DIST, 'feeds', 'propiedades.json'), catalogos.json);

	console.log(`✓ Sitio generado en dist/ (${data.source}): ${properties.length} propiedades${fueraDeListados.length ? ` (+${fueraDeListados.length} vendidas, rentadas o pausadas, solo con enlace)` : ''}, ${pages.length} páginas, ${ctx.posts.length} artículos, ${enSitemap.length} URLs en el sitemap${ctx.noindex ? ' · SIN INDEXAR' : ''}`);
	// Avisos de SEO: una propiedad sin estos datos se posiciona peor (no detiene la publicación).
	const FALTANTES = { foto: (p) => (p.fotos || []).length, descripción: (p) => p.descripcion, precio: (p) => p.precio, zona: (p) => p.zona || p.ciudad };
	for (const p of properties) {
		const faltan = Object.keys(FALTANTES).filter((k) => !FALTANTES[k](p));
		if (faltan.length) console.warn(`  ⚠ «${p.titulo}» sin ${faltan.join(', ')}`);
	}
	console.log(`  CSS ${assets.cssOriginalKb} KB → ${assets.cssKb} KB · JS ${assets.jsOriginalKb} KB → ${assets.jsKb} KB`);
	// Enlaces internos rotos en lo generado (plantillas o contenido del panel): se avisan con su página.
	// `npm test` genera un sitio de ejemplo y no pasa con uno solo (scripts/test-sitio.mjs).
	const rotos = await revisarEnlaces(DIST);
	if (rotos.length) {
		console.warn(`  ⚠ ${rotos.length} enlace${rotos.length === 1 ? '' : 's'} interno${rotos.length === 1 ? '' : 's'} roto${rotos.length === 1 ? '' : 's'}:`);
		for (const r of rotos.slice(0, 30)) console.warn(`    ${r.pagina} → ${r.href}`);
	}
}

main().catch((err) => {
	console.error('✗ Error al generar el sitio:', err.message);
	process.exit(1);
});
