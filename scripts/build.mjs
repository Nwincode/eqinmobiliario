// Genera el sitio estático en dist/ a partir de Firestore (o de data/seed.json
// mientras Firebase no esté configurado). Netlify lo ejecuta en cada publicación.
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from './lib/firestore.mjs';
import { deepMerge, slugify, byOrder, cifra, lugarDe, departamentoDe } from './lib/util.mjs';
import { planListados, crearEnlaces, textosListado, nombreTipo, unificarZonas } from './lib/landings.mjs';
import { revisarEnlaces, repetidosSeo } from './lib/enlaces.mjs';
import { montoPrecio, telefonoWa, horarioEn, horarioSchema, conPiesCuadrados } from '../admin/js/formato.js';
import { amenidadesEnDe, mascotasUnaVez, esDePrueba, precioVisible, sinPrecioOculto, mencionaPrecio, textosConPrecioOculto } from '../admin/js/estados.js';
import * as T from './lib/templates.mjs';
import { aplicarTextos, textosPorDefecto } from './lib/i18n.mjs';
import { buildAssets } from './lib/assets.mjs';
import { visibilidadDe } from '../admin/js/estados.js';
import { conEmojis, sinBloquesGenerados } from '../admin/js/descripcion.js';
import { seoEnViejo, enCorregido } from '../admin/js/reglas.js';
import { datosConfigurados } from '../netlify/lib/firestore.mjs';
import { sociosEnMora, pausados } from '../netlify/lib/comisiones.mjs'; // (también deja listo globalThis.EQVacacional)
import { urlsCambiadas } from '../netlify/lib/indexnow.mjs';
import { separarCasas, casaReparada, ajustesSanos, fichasEnSitemap, revisarCatalogo, FORZAR } from './lib/antes-de-publicar.mjs';
import { escrituraConfigurada, transaccion } from '../netlify/lib/firestore-escritura.mjs';
import { urlPagina, redireccionesPaginas } from '../admin/js/rutas.js';
import { huellaDelPanel } from './lib/huella-panel.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// DIST_DIR: otra carpeta de salida (las pruebas generan un sitio de ejemplo sin tocar dist/).
const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(ROOT, 'dist');

const STATIC_ASSETS = [
	'css', 'js', 'images', 'admin',
	'fonts/icomoon/style.css', 'fonts/icomoon/fonts', 'fonts/work-sans',
	'favicon.png', 'apple-touch-icon.png', 'logo-equipo-inmobiliario.png', 'docs/marca/logo/imagotipo-blanco.svg', 'docs/marca/logo/icono-blanco.svg', 'docs/marca/logo/imagotipo-azul.svg', // portada del listado en PDF; ícono de la marca de agua (admin/js/marca.js); logo de la barra del panel en el celular
	 'Icono_Equipoinmobiliario@0.75x.png', 'site.config.json',
	'data/seed.json' // el panel lo usa para "Importar datos iniciales"
];

async function readJson(file) {
	return JSON.parse(await readFile(path.resolve(ROOT, file), 'utf8'));
}

async function loadData(config) {
	const seed = await readJson(process.env.SEED_FILE || 'data/seed.json');
	// Lo que falte en settings/site se completa siempre con el del repositorio (también con otro SEED_FILE).
	const defaults = (await readJson('data/seed.json')).settings;
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
		return { ...fromSeed(), defaults };
	}

	const db = createClient({ projectId: fb.projectId, apiKey: fb.apiKey });
	// Sin «plan B»: si la nube no responde o no tiene settings/site, el build falla y Netlify deja publicado
	// el sitio anterior. Publicar el archivo de ejemplo borraría las casas reales del sitio y de Google.
	// (Para generar con el ejemplo: DATOS=seed.)
	const [settings, properties, agents, testimonials, pages, posts] = await Promise.all([
		db.getDoc('settings/site'),
		db.queryTrue('properties', 'publicado'),
		db.queryTrue('agents', 'activo'),
		db.queryTrue('testimonials', 'activo'),
		db.queryTrue('pages', 'publicado'),
		db.queryTrue('posts', 'publicado')
	]);
	// «Importar datos iniciales» (Publicar, en el panel) solo sirve con la base vacía: con casas guardadas no se ofrece.
	if (!settings) throw new Error(`Firestore no tiene settings/site: no se publica (el sitio anterior sigue en línea). ${properties.length
		? `Hay ${properties.length} propiedades publicadas: no importes datos iniciales. Abre Contenido en el panel y guarda para volver a crear los textos del sitio.`
		: 'Si la base está vacía de verdad, importa los datos iniciales desde Publicar, en el panel, o usa DATOS=seed.'}`);
	console.log(`· Datos leídos de Firestore (${fb.projectId})`);
	return { source: 'firestore', settings, properties, agents, testimonials, pages, posts, defaults };
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
			// Dos casas con la misma URL: ninguna pisa a la otra (la segunda lleva parte de su id) y se avisa.
			if (used.has(slug)) { const otra = `${slug}-${slugify(p.id).slice(0, 8)}`; console.warn(`  ⚠ La casa «${p.id}» repite la URL /${slug}/ de otra: sale en /${otra}/. Cámbiala en el panel.`); slug = otra; }
			used.add(slug);
			return {
				operacion: 'venta', tipo: 'casa', moneda: 'USD', estado: 'disponible',
				fotos: [], amenidades: [], vipLanding: {}, seo: {},
				...p,
				// Formato viejo de «Mejorar descripción»: sin las listas copiadas de los campos (ver descripcion.js).
				descripcion: sinBloquesGenerados(p.descripcion),
				seo: seoPropio(p.seo),
				en: enCorregido(p) || p.en,
				slug,
				fechaOrden: toMillis(p.createdAt) || (1e13 - (p.orden || 0))
			};
		})
		// «Más recientes» (el orden de los listados y de la portada): destacadas primero, después el orden a mano (si lo
		// tiene) y al final la más nueva primero. Sin desempate por título: byOrder lo pondría alfabético.
		.sort((a, b) => (b.destacada === true) - (a.destacada === true) || (a.orden ?? 999) - (b.orden ?? 999) || b.fechaOrden - a.fechaOrden);
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
			// Con un nombre reservado del sitio (admin/js/rutas.js), en /pagina/: nunca encima de un listado.
			return { ...p, slug, url: urlPagina(slug, base ? 'en' : 'es') };
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
		amenidades: amenidadesEnDe(p),
		// El que armaba la regla anterior del traductor («Lot for Sale Guatemala») se reemplaza por el automático.
		seo: (({ descripcion, ...seo }) => ({ ...seo, descripcion: conPiesCuadrados(descripcion).length <= 160 ? conPiesCuadrados(descripcion) : descripcion }))(seoTraducido(p, e.seo, e.manual)),
		// Cómo llegar, reglas y cancelación: en inglés si ya se tradujeron; si no, el original.
		vacacional: p.vacacional && { ...p.vacacional, ...Object.fromEntries(Object.entries(e.vacacional || {}).filter(([, x]) => x)) },
		vipLanding: { ...(p.vipLanding || {}), titular: '', subtitular: '', puntosClave: [], ctaTexto: '', ...(e.vipLanding || {}) },
		fotos: (p.fotos || []).map((f) => ({ url: f.url }))
	};
}

// Descripción para Google que armaba el traductor sin IA («House for sale in …: 3 bedrooms…. Q1,250,000.»): llevaba el
// precio de ese día y se quedaba viejo al cambiarlo. Se reconoce por su forma (hubo varias) y sale la automática.
const SEO_EN_PLANTILLA = /^[A-Z][A-Za-z ]* for (sale|rent|vacation rental) in .+\.\s+((US\$|\$|Q)\s?[\d,]+(\.\d{2})?(\/(month|night))?|Price on request)\.$/i;
// Una escrita a mano (`en.manual`) no se toca aunque se parezca.
function seoTraducido(p, seo, manual = false) {
	const s = seo || {}, viejo = seoEnViejo(p);
	const plantilla = (d) => d === viejo.descripcion || (!manual && SEO_EN_PLANTILLA.test(String(d || '').trim()));
	return { ...s, titulo: s.titulo === viejo.titulo ? '' : s.titulo || '', descripcion: plantilla(s.descripcion) ? '' : s.descripcion || '' };
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

// Lo que cambió desde la última publicación, para IndexNow (netlify/lib/indexnow.mjs, lo manda deploy-succeeded):
// solo al publicar en Netlify, comparando con el sitemap que sigue publicado mientras corre el build. Si no se puede
// leer (o en local), `todas`: la función manda todo el sitemap, como antes.
function cambiosParaIndexNow(ctx, siteUrl, sitemapXml, publicado) {
	if (ctx.noindex || publicado == null) return { todas: true };
	return { urls: urlsCambiadas(sitemapXml, publicado, siteUrl) };
}

// El sitemap que sigue publicado mientras corre el build (solo al publicar en Netlify); null si no se pudo leer.
async function sitemapPublicado(siteUrl) {
	if (!process.env.NETLIFY) return null;
	const sinLeer = (motivo) => {
		console.warn(`  ⚠ No se pudo leer el sitemap publicado (${motivo}): no se compara el catálogo con el sitio en línea y IndexNow recibe todo el sitemap.`);
		return null;
	};
	try {
		const res = await fetch(`${siteUrl.replace(/\/$/, '')}/sitemap.xml`, { signal: AbortSignal.timeout(10000) });
		return res.ok ? await res.text() : sinLeer(`error ${res.status}`);
	} catch (err) {
		return sinLeer(err.message);
	}
}

// El freno del catálogo (revisarCatalogo) con lo que dice el panel, en meta/publish y con la cuenta de escritura: si un
// administrador tocó «Publicar aunque baje» (`forzarCatalogo`), no se frena, y la marca se gasta en este build. El
// motivo queda en `freno` (vacío si pasa) para que Publicar lo muestre. Sin la cuenta en el build, solo la variable.
// Solo el build de producción lee y escribe meta/publish: una vista previa o una rama (con la cuenta de escritura en
// sus variables) no gasta el «Publicar aunque baje» del administrador ni le borra el aviso del freno.
async function frenoDelCatalogo(fuente, { ahora, antes }, { produccion = true } = {}) {
	const porVariable = process.env[FORZAR] === '1';
	if (porVariable) console.warn(`  ⚠ La variable ${FORZAR} está puesta: el catálogo se publica sin revisar si bajó. Quítala en Netlify (Site configuration → Environment variables); para una vez, en el panel: Publicar → «Publicar aunque baje».`);
	if (fuente !== 'firestore' || !produccion || !escrituraConfigurada()) return revisarCatalogo({ ahora, antes, forzar: porVariable });
	try {
		return await transaccion(async ({ leer, cambiar }) => {
			const estado = await leer('meta/publish');
			const freno = revisarCatalogo({ ahora, antes, forzar: porVariable || estado?.forzarCatalogo === true });
			if (estado) cambiar('meta/publish', { freno, forzarCatalogo: false }, { ahora: ['frenoCuando'] });
			return freno;
		});
	} catch (err) {
		console.warn(`  ⚠ No se pudo leer «Publicar aunque baje» del panel (${err.message}): se revisa sin él.`);
		return revisarCatalogo({ ahora, antes, forzar: porVariable });
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
		...properties.filter((p) => p.estado === 'disponible' && !esDePrueba(p)).slice(0, 100).map((p) =>
			`- [${p.titulo}](${base}${T.propertyUrl(p)}): ${p.operacion === 'vacacional' ? 'renta vacacional por noche' : p.operacion === 'renta' ? 'renta' : 'venta'}, ${lugarDe(p)}${precioVisible(p) ? `, ${montoPrecio(p.precio, p.moneda || 'USD')}` : ''}${p.habitaciones ? `, ${p.habitaciones} ${Number(p.habitaciones) === 1 ? 'habitación' : 'habitaciones'}` : ''}${p.m2Construccion ? `, ${cifra(p.m2Construccion)} m²` : ''}`),
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
		dato('Precio', precioVisible(p) ? montoPrecio(p.precio, p.moneda || 'USD') : ''),
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
		...properties.filter((p) => (p.estado || 'disponible') === 'disponible' && !esDePrueba(p)).flatMap(ficha),
		...ctx.posts.flatMap((p) => [`## ${p.titulo}`, '', `- Enlace: ${base}${p.url}`, '', textoPlano(p.contenido || p.resumen), ''])
	].join('\n');
}

const HORARIO_POR_DEFECTO = horarioSchema('Lunes a sábado, 9:00 a 18:00');

// Buscadores y asistentes con IA a los que se les da permiso explícito (además de la regla general «*»).
const BOTS_IA = ['Bingbot', 'DuckDuckBot', 'Applebot', 'Applebot-Extended', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended'];

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
	const disponibles = properties.filter((p) => (p.estado || 'disponible') === 'disponible' && p.operacion !== 'vacacional' && !esDePrueba(p));
	const enPorId = Object.fromEntries((propsEn || []).map((p) => [p.id, p]));
	const abs = (u) => (/^https?:/.test(u) ? u : `${base}${u}`);
	const url = (p, fuente) => `${base}${T.propertyUrl(p)}?utm_source=${fuente}&utm_medium=catalogo&utm_campaign=difusion`;
	// Los catálogos piden JPG: el CDN de imágenes de Netlify convierte las fotos WebP al vuelo.
	const fotos = (p) => (p.fotos || []).map((f) => f.url).filter(Boolean)
		.map((u) => `${base}${T.fotoCdn(u, 1600, '&fm=jpg&q=85')}`);
	const sinPrecio = (p) => !precioVisible(p);

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

// `enPorId`: la versión en inglés ya resuelta en main() (con el sufijo que la separa de otra del mismo título).
// `paginasMovidas`: las páginas que pasaron a /pagina/ ([de, a]).
function redirects(ctx, todas = ctx.properties, enPorId = new Map(), paginasMovidas = []) {
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
		const en = ctx.enActivo && enPorId.get(p.id);
		for (const old of (en && p.en.slugsAnteriores) || []) {
			const s = slugify(old);
			if (s && s !== en.slug) {
				add(`/en/property/${s}/`, T.propertyUrl(en));
				add(`/en/luxury/${s}/`, T.propertyUrl(en));
			}
		}
	}
	for (const [de, a] of paginasMovidas) add(de, a);
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
	const site = ajustesSanos(deepMerge(data.defaults, data.settings), config.siteUrl);
	// Textos del sitio: se guardan los originales para el panel y se aplican los personalizados.
	const textosOriginales = textosPorDefecto();
	aplicarTextos(site.textos);
	const agents = data.agents.slice().sort(byOrder);
	// Todas las publicadas conservan su enlace; solo las que se ofrecen salen en portada, listados,
	// buscador, zonas, sitemap y catálogos. Vendidas/rentadas y pausadas/retiradas quedan aparte.
	// Las que tienen un dato roto (scripts/lib/antes-de-publicar.mjs) quedan fuera de todo; su enlace sigue abriendo sin
	// indexar, con lo roto quitado, y Publicar, en el panel, las lista (/feeds/omitidas.json). Van detrás de las buenas al
	// normalizar: si comparten dirección, la buena la conserva.
	const { sanas, omitidas: rotas } = separarCasas(data.properties);
	const reparadas = rotas.map(({ casa, motivo }) => ({ r: casaReparada(casa), motivo })).filter(({ r }) => r && !r.motivo)
		.map(({ r, motivo }) => ({ ...r.casa, _omitida: { motivo, sinCalendario: r.sinCalendario } }));
	// Cada zona con una sola forma de escribirla (antes de planear listados y de copiar al inglés).
	const juntas = unificarZonas(normalizeProperties([...sanas, ...reparadas]));
	const todas = juntas.filter((p) => !p._omitida);
	const omitidas = juntas.filter((p) => p._omitida);
	// La dirección y el mapa de una casa por noche son privados (properties/{id}/privado/llegada): si una casa
	// todavía los trae en su documento, no entran a ninguna página, catálogo ni archivo del sitio.
	// Tampoco usan la landing VIP: no tiene caja de reserva.
	// Su «Desde» se saca al publicar, con las tarifas que siguen vigentes (un precio especial vencido ya no cuenta), con la
	// misma regla del panel (`precioDesde`); js/vacacional.js lo pone al día en la página con los precios de hoy.
	const V = globalThis.EQVacacional;
	// Casas de prueba: se marcan aquí, con su título en español (la copia en inglés lo hereda).
	for (const p of juntas) if (esDePrueba(p)) p._prueba = true;
	// Una que no salió del botón «Casas de prueba» pero dice «prueba» en el título: se avisa (si es real, hay que
	// cambiarle el título para que Google la vea).
	const pruebaPorTitulo = todas.filter((p) => p._prueba && p.demo !== true && visibilidadDe(p) === 'visible');
	if (pruebaPorTitulo.length) console.warn(`  ⚠ Se tratan como casas de prueba (dicen «prueba» en el título; no se indexan): ${pruebaPorTitulo.map((p) => `«${p.titulo}»`).join(', ')}. Si alguna es real, cambia su título.`);
	// Precio oculto: ningún texto guardado con el precio lo deja salir (ficha, VIP, /en/, llms, catálogos). Un título o
	// descripción para Google con el precio no se usa (sale el automático, sin precio); en la descripción y los textos VIP,
	// en español e inglés, el monto pasa a «precio a consultar».
	// El panel ya no deja guardarlo así (textosConPrecioOculto); si llega uno (de antes, o escrito por otra vía), se avisa.
	// También en las omitidas por un dato roto: su enlace sigue abriendo.
	const conPrecioOculto = [];
	for (const p of juntas) {
		if (!p.precio || precioVisible(p)) continue;
		const donde = textosConPrecioOculto(p);
		if (donde.length) conPrecioOculto.push(`${p.id} (${donde.map(([k]) => k).join(', ')})`);
		const n = Math.round(Number(p.precio));
		const conPrecio = (t) => mencionaPrecio(t, n, p.moneda);
		const limpiarSeo = (seo) => (seo ? { ...seo, ...(conPrecio(seo.titulo) ? { titulo: '' } : {}), ...(conPrecio(seo.descripcion) ? { descripcion: '' } : {}) } : seo);
		const limpiarVip = (v, consultar) => (v ? { ...v, ...Object.fromEntries(['titular', 'subtitular', 'ctaTexto'].map((k) => [k, sinPrecioOculto(v[k], n, consultar, p.moneda)])),
			puntosClave: (v.puntosClave || []).map((x) => sinPrecioOculto(x, n, consultar, p.moneda)) } : v);
		p.seo = limpiarSeo(p.seo);
		p.descripcion = sinPrecioOculto(p.descripcion, n, 'precio a consultar', p.moneda);
		p.titulo = sinPrecioOculto(p.titulo, n, 'precio a consultar', p.moneda);
		// La URL nunca lleva el precio: se le quita (la dirección con el precio no se redirige, para no publicarla).
		if (conPrecio(String(p.slug || '').replace(/-/g, ' '))) p.slug = slugify(sinPrecioOculto(String(p.slug).replace(/-/g, ' '), n, '', p.moneda)) || p.id;
		p.vipLanding = limpiarVip(p.vipLanding, 'precio a consultar');
		if (p.en) p.en = { ...p.en, seo: limpiarSeo(p.en.seo), titulo: sinPrecioOculto(p.en.titulo, n, 'price on request', p.moneda), slug: p.en.slug && conPrecio(String(p.en.slug).replace(/-/g, ' ')) ? '' : p.en.slug, descripcion: sinPrecioOculto(p.en.descripcion, n, 'price on request', p.moneda), vipLanding: limpiarVip(p.en.vipLanding, 'price on request') };
	}
	if (conPrecioOculto.length) console.warn(`  ⚠ Precio oculto escrito en sus textos (se quitó al publicar; corrígelo en la ficha): ${conPrecioOculto.join('; ')}`);
	for (const p of juntas) if (p.operacion === 'vacacional') {
		Object.assign(mascotasUnaVez(p), { direccion: '', mapa: '', vip: false });
		const desde = V.precioDesde(p.vacacional, V.hoy());
		if (desde > 0) p.precio = desde;
	}
	// Tampoco se ofrecen las casas de un socio con una comisión atrasada más de 72 h (vuelven solas al pagarla).
	const mora = data.source === 'firestore' && datosConfigurados() ? await sociosEnMora() : null;
	// Solo sus casas por noche: si el mismo dueño tiene algo en venta o renta, eso sigue publicado.
	const seOfrece = (p) => visibilidadDe(p) === 'visible' && !(p.operacion === 'vacacional' && mora?.[p.propietarioId] === 3);
	const properties = todas.filter(seOfrece);
	// Antes de borrar nada de dist/: un catálogo vacío, o con menos de la mitad de las casas que tiene el sitio
	// publicado, no se publica (scripts/lib/antes-de-publicar.mjs). Solo producción se compara con el sitemap en línea.
	// Se cuentan las que se ofrecen sin contar la pausa por mora: un socio atrasado no frena la publicación.
	const isProduction = !process.env.CONTEXT || process.env.CONTEXT === 'production';
	// Las casas de prueba no cuentan: las mismas que no se indexan (`_prueba`, `esDePrueba`: el botón «Casas de prueba» o
	// «prueba» en el título).
	const publicado = isProduction ? await sitemapPublicado(config.siteUrl) : null;
	const deCatalogo = {
		ahora: todas.filter((p) => visibilidadDe(p) === 'visible' && !p._prueba).length,
		antes: publicado == null ? null : fichasEnSitemap(publicado, config.siteUrl, new Set(todas.filter((p) => p._prueba).map((p) => p.slug)))
	};
	const freno = await frenoDelCatalogo(data.source, deCatalogo, { produccion: isProduction });
	if (freno) throw new Error(`${freno} El sitio anterior sigue en línea. Si es a propósito: en el panel, Publicar → «Publicar aunque baje».`);
	// «Tu reserva» existe mientras haya alguna casa por noche, aunque ninguna se ofrezca hoy (pausa por mora, oculta): sus
	// clientes con reserva siguen entrando a su chat.
	const hayVacacional = todas.some((p) => p.operacion === 'vacacional');
	const fueraDeListados = todas.filter((p) => !seOfrece(p));
	// Las páginas y artículos con idioma "en" van al sitio en inglés.
	data.pagesEn = data.pages.filter((p) => p.idioma === 'en');
	data.postsEn = (data.posts || []).filter((p) => p.idioma === 'en');
	const pages = normalizePages(data.pages.filter((p) => p.idioma !== 'en'));
	const enActivo = Boolean(site.en) && site.en.activo !== false;
	// Solo lo traducido sale en inglés; sin casas vacacionales traducidas no hay listado vacacional en inglés.
	const todasEn = enActivo ? todas.map(propiedadEn).filter(Boolean) : [];
	// Dos casas con el mismo título en inglés no pueden compartir dirección (igual que en español): la conserva la más
	// antigua (`antes`), no la primera del orden de los listados (la más nueva): así una casa nueva no le cambia la
	// dirección a una que ya está en Google.
	const antes = (a, b) => (toMillis(a.createdAt) || 0) - (toMillis(b.createdAt) || 0) || String(a.codigo || a.id || '').localeCompare(String(b.codigo || b.id || ''));
	const slugsEn = new Set();
	for (const p of [...todasEn].sort(antes)) {
		if (slugsEn.has(p.slug)) p.slug = `${p.slug}-${slugify(p.id).slice(0, 8)}`;
		slugsEn.add(p.slug);
	}
	// La misma regla que en español (incluye la pausa por mora): una sola función para los dos idiomas.
	const propsEn = todasEn.filter(seOfrece);
	// Dos fichas con el mismo título para Google compiten entre sí: a la segunda (y siguientes) se le suma su código o
	// su zona (T.tituloUnico). En los dos idiomas. Siempre la misma ficha conserva su título: la más antigua (por fecha
	// de creación y, si empatan, por código), sin importar el orden en que vengan de la base.
	for (const lista of [todas, todasEn]) {
		const vistos = new Set();
		for (const p of [...lista].sort(antes)) {
			const titulo = T.seoTitle(p);
			if (vistos.has(titulo)) p._tituloUnico = T.tituloUnico(p, titulo, vistos);
			vistos.add(p._tituloUnico || titulo);
		}
	}
	// Pares de URLs español ↔ inglés para el selector de idioma (los de los listados los agrega el plan).
	const altMap = new Map();
	const registrarPar = (es, en) => { altMap.set(es, en); altMap.set(en, es); };
	[['/', '/en/'], ['/calculadora-de-renta/', '/en/rental-calculator/']].forEach(([a, b]) => registrarPar(a, b));
	const nombre = site.general.nombreCorto;
	const siteEn = enActivo ? deepMerge(site, site.en || {}) : null;
	// El horario se escribe una vez, en español; el de inglés sale de él (un `en.contacto.horario` viejo se ignora).
	if (siteEn) siteEn.contacto = { ...siteEn.contacto, horario: horarioEn(site.contacto.horario) };
	const pagesEn = enActivo ? normalizePages(data.pagesEn, '/en') : [];
	// Listados y páginas de aterrizaje de los dos idiomas (scripts/lib/landings.mjs). Se planean antes de escribir
	// nada: de ellos dependen los enlaces de todas las páginas (menú, pie, migas, enlaces del blog).
	// Las casas de prueba tienen su ficha (sin indexar) pero no salen en listados, portada ni «similares».
	const enListados = properties.filter((p) => !p._prueba);
	const enListadosEn = propsEn.filter((p) => !p._prueba);
	const planEs = planListados(enListados, { lang: 'es', ocupadas: new Set(pages.map((p) => p.url)) });
	const planEn = enActivo ? planListados(enListadosEn, { lang: 'en', ocupadas: new Set(pagesEn.map((p) => p.url)) }) : [];
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
		properties: enListados,
		agents,
		agentsById: Object.fromEntries(agents.map((a) => [a.id, a])),
		testimonials: data.testimonials.slice().sort(byOrder),
		pages,
		posts: normalizePosts((data.posts || []).filter((p) => p.idioma !== 'en')),
		enActivo,
		altLang: enActivo ? (ruta) => altMap.get(ruta) || '/en/' : null,
		plan: planEs,
		enlaces,
		// Horario del JSON-LD de la portada, de lo escrito en Contenido (en español, también para /en/); si no se
		// entiende, el que confirmó el dueño: lunes a sábado de 9:00 a 18:00.
		horarioLd: horarioSchema(site.contacto.horario) || HORARIO_POR_DEFECTO,
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
			// Contenido → Fotos de las casas: el aviso de «compartir» al intentar guardar una foto (encendido si no se tocó).
			avisoCompartir: site.fotos?.avisoCompartir !== false,
			adsLead: site.tracking.adsId && site.tracking.adsLeadLabel ? `${site.tracking.adsId}/${site.tracking.adsLeadLabel}` : '',
			adsContact: site.tracking.adsId && site.tracking.adsContactLabel ? `${site.tracking.adsId}/${site.tracking.adsContactLabel}` : ''
		}
	};

	await rm(DIST, { recursive: true, force: true });
	await mkdir(DIST, { recursive: true });
	await copyAssets();

	// Fecha de la última modificación real del inventario: Google ignora el lastmod si cambia en cada build.
	const dia = (fecha) => String(fecha || '').slice(0, 10) || undefined;
	const ultimaFecha = (list) => list.map((p) => dia(p.updatedAt || p.createdAt)).filter(Boolean).sort().pop();
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

	// Casas omitidas por un dato roto: su enlace abre sin indexar (la de por noche sin calendario, como «ya no disponible»,
	// sin reservar). Si aun así no se puede generar, queda solo en la lista de Publicar.
	const ctxOmitidas = { ...ctx, noindex: true };
	for (const p of omitidas) {
		try { await writePage(T.propertyUrl(p), p._omitida.sinCalendario ? T.propertyGonePage(ctxOmitidas, p) : fichaHtml(ctxOmitidas, p)); p._omitida.url = T.propertyUrl(p); }
		catch (err) { console.warn(`  ⚠ Tampoco se pudo generar la página de «${p.id}»: ${err.message}`); }
	}
	const omitidasDeDatos = rotas.filter(({ casa }) => !omitidas.some((p) => p.id === casa?.id));

	for (const page of pages) {
		await writePage(page.url, T.contentPage(ctx, page));
		urls.push({ path: page.url, priority: '0.4', lastmod: String(page.updatedAt || '').slice(0, 10) || undefined });
	}

	// ------------------------------------------------ Sitio en inglés (/en/)
	if (ctx.enActivo) {
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
			properties: enListadosEn,
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
			if (seOfrece(p)) urls.push({ path: T.propertyUrl(p), priority: '0.8', lastmod: dia(p.updatedAt || p.createdAt), images: (p.fotos || []).map((f) => f.url) });
		}
		for (const page of pagesEn) {
			await writePage(page.url, T.contentPage(ctxEn, page));
			urls.push({ path: page.url, priority: '0.6', lastmod: dia(page.updatedAt) });
		}
		if (postsEn.length) {
			await writePage('/en/blog/', T.blogIndexPage(ctxEn));
			urls.push({ path: '/en/blog/', priority: '0.6', lastmod: postsEn.map((x) => dia(x.fecha)).filter(Boolean).sort().pop() });
			for (const post of postsEn) {
				await writePage(post.url, T.blogPostPage(ctxEn, post));
				urls.push({ path: post.url, priority: '0.6', lastmod: dia(post.fecha), images: post.imagen ? [post.imagen] : [] });
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
		// «Tu reserva» en inglés: el cliente que reservó en inglés la abre desde su correo y su chat (fuera del sitemap).
		if (hayVacacional) await writePage('/en/reservation/', T.reservaPage(ctxEn));
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
	// La versión del panel (solo cambia con su código): el panel abierto la compara y avisa «Hay una versión nueva».
	await writeFile(path.join(DIST, 'admin', 'version.json'), JSON.stringify({ v: await huellaDelPanel(ROOT) }));

	if (mora) await writeFile(path.join(DIST, 'pausados.txt'), pausados(mora));
	// Sitemap = exactamente las páginas que se indexan (lo dice su etiqueta robots). En una vista previa todo va
	// «noindex» y robots.txt bloquea el sitio: ahí el sitemap queda con todo, como antes.
	const indexable = (u) => ctx.noindex || indexables.get(u) === true;
	const enSitemap = urls.filter((u, i) => indexable(u.path) && urls.findIndex((x) => x.path === u.path) === i);
	// Una página que se indexa y no está en el sitemap es un olvido (salvo las fichas vendidas o pausadas, que a propósito no van).
	const aParte = new Set([...fueraDeListados, ...todasEn.filter((p) => !seOfrece(p))].map((p) => T.propertyUrl(p)));
	const sinSitemap = [...indexables].filter(([u, si]) => si && !aParte.has(u) && !/\.html$/.test(u) && !enSitemap.some((x) => x.path === u)).map(([u]) => u);
	if (!ctx.noindex && sinSitemap.length) console.warn(`  ⚠ Se indexan pero no están en el sitemap: ${sinSitemap.join(', ')}`);
	const sitemapXml = sitemap(ctx, enSitemap);
	await writeFile(path.join(DIST, 'sitemap.xml'), sitemapXml);
	// Una página que pasó a /pagina/ (su nombre ahora es reservado): su dirección de antes lleva a la nueva.
	await writeFile(path.join(DIST, '_redirects'), redirects(ctx, todas, new Map(todasEn.map((p) => [p.id, p])), redireccionesPaginas([...pages, ...pagesEn], new Set(indexables.keys()))));
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
	// Lo que Publicar, en el panel, muestra como «no se ve en el sitio».
	await writeFile(path.join(DIST, 'feeds', 'omitidas.json'), JSON.stringify({ casas: [
		...omitidas.map((p) => ({ id: p.id, titulo: String(p.titulo || p.id), motivo: p._omitida.motivo, url: p._omitida.url || '' })),
		...omitidasDeDatos.map(({ casa, motivo }) => ({ id: String(casa?.id || ''), titulo: String(casa?.titulo || casa?.id || '?'), motivo, url: '' }))
	] }));
	await writeFile(path.join(DIST, 'feeds', 'indexnow.json'), JSON.stringify(cambiosParaIndexNow(ctx, config.siteUrl, sitemapXml, publicado)));

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
	// Títulos y descripciones repetidos entre páginas indexadas: se avisa con las páginas (se corrigen en el panel).
	const repetidos = await repetidosSeo(DIST);
	if (repetidos.length) {
		console.warn(`  ⚠ ${repetidos.length} título(s) o descripción(es) repetidos entre páginas que Google indexa:`);
		for (const r of repetidos.slice(0, 20)) console.warn(`    ${r.tipo} «${r.texto.slice(0, 70)}»: ${r.paginas.slice(0, 4).join(', ')}`);
	}
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
