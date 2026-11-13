// Genera el sitio estático en dist/ a partir de Firestore (o de data/seed.json
// mientras Firebase no esté configurado). Netlify lo ejecuta en cada publicación.
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from './lib/firestore.mjs';
import { deepMerge, slugify, byOrder, cifra, lugarDe, TIPOS, TIPOS_LANDING } from './lib/util.mjs';
import { dinero } from '../admin/js/formato.js';
import { amenidadesEn } from '../admin/js/estados.js';
import * as T from './lib/templates.mjs';
import { aplicarTextos, textosPorDefecto } from './lib/i18n.mjs';
import { buildAssets } from './lib/assets.mjs';
import { visibilidadDe } from '../admin/js/estados.js';
import { conEmojis } from '../admin/js/descripcion.js';
import { datosConfigurados } from '../netlify/lib/firestore.mjs';
import { sociosEnMora, pausados } from '../netlify/lib/comisiones.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
// Mínimo de propiedades para generar una página de zona + operación (evita páginas con poco contenido).
const MIN_LISTADO = 2;

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
		amenidades: e.amenidades?.length ? e.amenidades : amenidadesEn(p.amenidades),
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

// ¿Hay alguna propiedad de esa operación (y zona)? Un listado vacío no se indexa ni se enlaza.
const hay = (list, op = '', zona = '') => list.some((p) => (!op || p.operacion === op) && (!zona || p.zona === zona));

// El primer título que cabe en 60 caracteres con el nombre del sitio; si ninguno cabe, el último sin el nombre.
const tituloCorto = (nombre, ...c) => c.map((t) => `${t} | ${nombre}`).find((t) => t.length <= 60) || c[c.length - 1];

// Páginas por tipo y operación («Casas en venta en Guatemala»): una por cada tipo con propiedades en venta o
// en renta. No se crea si repetiría el listado de la operación (todo es de ese tipo) o si la dirección ya existe.
function buildLandings(properties, ocupadas, en = false) {
	const out = [];
	for (const [op, es, eng] of [['venta', 'en venta', 'for sale'], ['renta', 'en renta', 'for rent']]) {
		const deOp = properties.filter((p) => p.operacion === op);
		for (const [tipo, n] of Object.entries(TIPOS_LANDING)) {
			const total = deOp.filter((p) => p.tipo === tipo).length;
			const nombre = en ? `${n.en} ${eng}` : `${n.plural} ${es}`;
			const url = `${en ? '/en' : ''}/${slugify(nombre)}/`;
			if (total && total < deOp.length && !ocupadas.has(url)) out.push({ tipo, op, nombre, url, total });
		}
	}
	return out;
}

// Textos de una página por tipo, escritos con lo que de verdad hay publicado (precios, zonas, cantidad).
function textosTipo(l, lista, nombre, en = false) {
	const n = TIPOS_LANDING[l.tipo], total = lista.length;
	const cuantos = en ? `${total} ${n.enN[total === 1 ? 0 : 1]} ${l.op === 'renta' ? 'for rent' : 'for sale'}`
		: `${total} ${(total === 1 ? TIPOS[l.tipo] : n.plural).toLowerCase()} ${l.op === 'renta' ? 'en renta' : 'en venta'}`;
	// Precios solo si todos están en la misma moneda y a la vista (los ocultos de VIP no cuentan).
	const conPrecio = lista.filter((p) => Number(p.precio) > 0 && !(p.vipLanding && p.vipLanding.ocultarPrecio));
	const mes = l.op === 'renta' ? (en ? ' a month' : ' al mes') : '';
	const o = en ? ' or ' : ' o ', y = en ? ' and ' : ' y ';
	// Un rango por moneda, sin convertir: [mínimo, máximo] tal como están publicados.
	const rangos = [...new Set(conPrecio.map((p) => p.moneda || 'USD'))].sort().reverse().map((m) => {
		const precios = conPrecio.filter((p) => (p.moneda || 'USD') === m).map((p) => Number(p.precio));
		return [dinero(Math.min(...precios), m), dinero(Math.max(...precios), m)];
	});
	const desde = rangos.length ? ` ${en ? 'from' : 'desde'} ${rangos.map((r) => r[0]).join(o)}${mes}` : '';
	const rango = rangos.map(([a, b]) => (a === b ? `${en ? 'at' : 'en'} ${a}` : `${en ? 'from' : 'desde'} ${a} ${en ? 'to' : 'hasta'} ${b}`)).join(y) + mes;
	const zonas = [...new Set(lista.map((p) => p.zona || p.ciudad).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
	const lista2 = new Intl.ListFormat(en ? 'en' : 'es', { type: 'conjunction' }).format(zonas);
	const heading = `${l.nombre} ${en ? 'in' : 'en'} Guatemala`;
	const faq = en ? [
		rangos.length && { pregunta: `How much does ${n.enUn} ${l.op === 'renta' ? 'for rent ' : ''}cost in Guatemala?`, respuesta: `We currently list ${cuantos}, ${rango}.` },
		zonas.length && { pregunta: `Where are the ${n.enN[1]} ${l.op === 'renta' ? 'for rent' : 'for sale'}?`, respuesta: `Right now there are ${n.enN[1]} ${l.op === 'renta' ? 'for rent' : 'for sale'} in ${lista2}.` },
		{ pregunta: `How do I visit ${n.enUn}?`, respuesta: 'Message us through the form or WhatsApp and we will schedule your visit, in person or by live video call.' }
	] : [
		rangos.length && { pregunta: `¿Cuánto cuesta ${n.un} ${l.op === 'renta' ? 'en renta' : 'en venta'} en Guatemala?`, respuesta: `Hoy tenemos ${cuantos}, ${rango}.` },
		zonas.length && { pregunta: `¿Dónde hay ${l.nombre.toLowerCase()}?`, respuesta: `Hoy hay ${l.nombre.toLowerCase()} en ${lista2}.` },
		{ pregunta: `¿Cómo visito ${n.un}?`, respuesta: 'Escríbenos por el formulario o por WhatsApp y coordinamos tu visita, presencial o por videollamada.' }
	];
	return {
		path: l.url,
		operacion: l.op,
		tipo: l.tipo,
		heading,
		title: tituloCorto(nombre, heading, l.nombre),
		description: en ? `${cuantos} in Guatemala${desde}. USD prices, live video tours and English-speaking support for buyers in the US.`
			: `${cuantos} en Guatemala${desde}. Fotos, precios y asesoría personalizada para agendar tu visita presencial o por videollamada.`,
		intro: en ? `${cuantos}${desde}. Can't find what you need? Tell us and we'll send you options that aren't listed yet.`
			: `${cuantos}${desde}. Si no encuentras lo que buscas, déjanos tus datos y te enviamos opciones que aún no están publicadas.`,
		faq: faq.filter(Boolean)
	};
}

// Textos automáticos de una página de zona, escritos según lo que de verdad hay publicado en ella.
// Lo que se edita en el panel (Contenido del sitio → Zonas) siempre gana sobre esto.
function textosZona(z, lista, nombre, en = false) {
	const ciudades = new Set(lista.map((p) => String(p.ciudad || '').trim()).filter(Boolean));
	const capital = ciudades.size === 1 && /^(ciudad de )?guatemala( city)?$/i.test([...ciudades][0]);
	const lugar = /guatemala/i.test(z.nombre) ? z.nombre : `${z.nombre}, ${en && capital ? 'Guatemala City' : 'Guatemala'}`;
	const n = z.total;
	const titulo = (...c) => tituloCorto(nombre, ...c);
	const resumen = resumenInventario(lista, en);
	if (z.vacacional === n) {
		return en ? {
			heading: `Vacation rentals in ${z.nombre}`,
			title: titulo(`Vacation rentals in ${lugar}`, `Vacation rentals in ${z.nombre}`),
			description: `Vacation rentals in ${lugar}: ${n === 1 ? '1 place' : `${n} places`} to stay by the night. Pick your dates, check availability and request your booking.`,
			intro: `${resumen} Pick your dates to see what is available.`
		} : {
			heading: `Renta vacacional en ${z.nombre}`,
			title: titulo(`Renta vacacional en ${lugar}`, `Renta vacacional en ${z.nombre}`),
			description: `Renta vacacional en ${lugar}: ${n === 1 ? '1 alojamiento' : `${n} alojamientos`} por noche. Elige tus fechas, revisa la disponibilidad y solicita tu reserva.`,
			intro: `${resumen} Elige tus fechas para ver cuáles están disponibles.`
		};
	}
	const ops = [z.venta && (en ? 'for sale' : 'en venta'), z.renta && (en ? 'for rent' : 'en renta'), z.vacacional && (en ? 'vacation rentals' : 'renta vacacional')].filter(Boolean);
	const frase = ops.length > 1 ? `${ops.slice(0, -1).join(', ')} ${en ? 'and' : 'y'} ${ops[ops.length - 1]}` : ops[0];
	return en ? {
		heading: `Homes in ${lugar}`,
		title: titulo(`Homes in ${lugar}`, `Homes in ${z.nombre}`),
		description: `${n === 1 ? '1 property' : `${n} properties`} in ${lugar}: ${frase}. USD prices, live video tours and English-speaking support for buyers in the US.`,
		intro: `${resumen} Can't find what you need? Tell us and we'll send you options that aren't listed yet.`
	} : {
		heading: `Propiedades en ${z.nombre}`,
		title: titulo(`Casas y apartamentos en ${lugar}`, `Casas y apartamentos en ${z.nombre}`, `Propiedades en ${z.nombre}`),
		description: `${n === 1 ? '1 propiedad' : `${n} propiedades`} en ${lugar}: ${frase}. Fotos, precios y asesoría personalizada para agendar tu visita presencial o por videollamada.`,
		intro: `${resumen} Si no encuentras lo que buscas, déjanos tus datos y te enviamos opciones que aún no están publicadas.`
	};
}

// «3 propiedades en venta desde US$ 250,000.00 y 2 en renta desde US$ 1,200.00 al mes. De 2 a 5 habitaciones.»
// Solo datos publicados: sin precios ocultos (VIP) y sin mezclar monedas ni precio por noche con venta.
function resumenInventario(lista, en = false) {
	const partes = [];
	for (const [op, es, eng, cola, tail] of [['venta', 'en venta', 'for sale', '', ''], ['renta', 'en renta', 'for rent', ' al mes', ' a month'], ['vacacional', 'de renta vacacional', 'vacation rentals', ' por noche', ' a night']]) {
		const l = lista.filter((p) => (p.operacion || 'venta') === op);
		if (!l.length) continue;
		const conPrecio = l.filter((p) => Number(p.precio) > 0 && !(p.vipLanding && p.vipLanding.ocultarPrecio));
		const monedas = new Set(conPrecio.map((p) => p.moneda || 'USD'));
		const desde = monedas.size === 1 ? ` ${en ? 'from' : 'desde'} ${dinero(Math.min(...conPrecio.map((p) => Number(p.precio))), [...monedas][0])}${en ? tail : cola}` : '';
		// El sustantivo solo en la primera parte: «2 propiedades en venta… y 1 en renta…».
		const que = en ? (op === 'vacacional' ? (l.length === 1 ? 'vacation rental' : eng) : `${partes.length ? '' : l.length === 1 ? 'property ' : 'properties '}${eng}`)
			: `${partes.length ? '' : l.length === 1 ? 'propiedad ' : 'propiedades '}${es}`;
		partes.push(`${l.length} ${que}${desde}`);
	}
	if (!partes.length) return '';
	const hab = lista.map((p) => Number(p.habitaciones)).filter((h) => h > 0);
	const [min, max] = [Math.min(...hab), Math.max(...hab)];
	const rango = !hab.length ? '' : min === max ? (en ? ` ${min} bedrooms.` : ` ${min} habitaciones.`) : (en ? ` ${min} to ${max} bedrooms.` : ` De ${min} a ${max} habitaciones.`);
	const y = en ? ' and ' : ' y ';
	return `${partes.length > 1 ? `${partes.slice(0, -1).join(', ')}${y}${partes[partes.length - 1]}` : partes[0]}.${rango}`;
}

function buildZonas(properties, base = '/propiedades/') {
	const counts = new Map();
	for (const p of properties) if (p.zona) counts.set(p.zona, (counts.get(p.zona) || 0) + 1);
	return [...counts.entries()]
		.map(([nombre, total]) => {
			let slug = slugify(nombre);
			if (['venta', 'renta', 'vacacional', 'for-sale', 'for-rent', 'vacation-rentals'].includes(slug)) slug = `zona-${slug}`;
			const cuenta = (op) => properties.filter((p) => p.zona === nombre && (p.operacion || 'venta') === op).length;
			return { nombre, slug, total, venta: cuenta('venta'), renta: cuenta('renta'), vacacional: cuenta('vacacional'), url: `${base}${slug}/` };
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
		`Texto completo de cada propiedad y cada guía: ${base}/llms-full.txt`,
		'',
		'## Propiedades',
		'',
		`- [Todas las propiedades](${base}/propiedades/)`,
		...[['venta', 'En venta'], ['renta', 'En renta'], ['vacacional', 'Renta vacacional por noche']].filter(([op]) => hay(properties, op)).map(([op, texto]) => `- [${texto}](${base}/propiedades/${op}/)`),
		...ctx.zonas.map((z) => `- [Propiedades en ${z.nombre}](${base}${z.url})`),
		...ctx.landings.map((l) => `- [${l.nombre} en Guatemala](${base}${l.url})`),
		...properties.filter((p) => p.estado === 'disponible').slice(0, 100).map((p) =>
			`- [${p.titulo}](${base}${T.propertyUrl(p)}): ${p.operacion === 'vacacional' ? 'renta vacacional por noche' : p.operacion === 'renta' ? 'renta' : 'venta'}, ${lugarDe(p)}${p.precio && !(p.vipLanding && p.vipLanding.ocultarPrecio) ? `, ${p.moneda || 'USD'} ${Number(p.precio).toLocaleString('en-US')}` : ''}${p.habitaciones ? `, ${p.habitaciones} habitaciones` : ''}${p.m2Construccion ? `, ${cifra(p.m2Construccion)} m²` : ''}`),
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
		dato('Precio', p.precio && !(p.vipLanding && p.vipLanding.ocultarPrecio) ? dinero(p.precio, p.moneda || 'USD') : ''),
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
		<town>${xmlEsc(lugarDe(p) || 'Guatemala')}</town>
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
	// Zona o filtro que se quedó sin propiedades (enlaces viejos del blog o de Google): al listado, no a un 404.
	lines.push('/propiedades/* /propiedades/ 302');
	if (ctx.enActivo) lines.push('/en/properties/* /en/properties/ 302', '/en/* /en/404.html 404');
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
	// Tampoco se ofrecen las casas de un socio con una comisión atrasada más de 72 h (vuelven solas al pagarla).
	const mora = data.source === 'firestore' && datosConfigurados() ? await sociosEnMora() : null;
	const seOfrece = (p) => visibilidadDe(p) === 'visible' && mora?.[p.propietarioId] !== 3;
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
	const propsEn = todasEn.filter((p) => visibilidadDe(p) === 'visible');
	const hayVacacionalEn = propsEn.some((p) => p.operacion === 'vacacional');
	// Pares de URLs español ↔ inglés para el selector de idioma.
	const altMap = new Map();
	const registrarPar = (es, en) => { altMap.set(es, en); altMap.set(en, es); };
	[['/', '/en/'], ['/propiedades/', '/en/properties/'], ['/propiedades/venta/', '/en/properties/for-sale/'],
		['/propiedades/renta/', '/en/properties/for-rent/'], ...(hayVacacionalEn ? [['/propiedades/vacacional/', '/en/properties/vacation-rentals/']] : []), ['/vip/', '/en/luxury/'],
		['/calculadora-de-renta/', '/en/rental-calculator/']].forEach(([a, b]) => registrarPar(a, b));
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
		landings: buildLandings(properties, new Set(pages.map((p) => p.url))),
		mobileVariant: (url) => {
			const m = /^\/images\/(.+)\.webp$/.exec(url || '');
			return m && existsSync(path.join(ROOT, 'images', `${m[1]}-800.webp`)) ? `/images/${m[1]}-800.webp` : T.fotoAncho(url, 800);
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
	// hreflang solo si el listado tiene propiedades en los dos idiomas: uno vacío no se indexa.
	const par = (op, es, en) => (enActivo && hay(properties, op) && hay(propsEn, op) ? { es, en } : null);
	const listings = [
		listing('todas', { alternates: par('', '/propiedades/', '/en/properties/'), path: '/propiedades/', heading: 'Propiedades', title: `Propiedades en venta y renta en Guatemala | ${nombre}`, description: 'Casas, apartamentos, terrenos y oficinas en venta y renta en Guatemala. Filtra por zona, precio y número de habitaciones.' }),
		listing('venta', { alternates: par('venta', '/propiedades/venta/', '/en/properties/for-sale/'), path: '/propiedades/venta/', operacion: 'venta', heading: 'Propiedades en venta', title: `Casas y apartamentos en venta en Guatemala | ${nombre}`, description: 'Propiedades en venta en Guatemala: casas, apartamentos y terrenos verificados, con fotos, precios y asesoría en financiamiento.' }),
		listing('renta', { alternates: par('renta', '/propiedades/renta/', '/en/properties/for-rent/'), path: '/propiedades/renta/', operacion: 'renta', heading: 'Propiedades en renta', title: `Casas y apartamentos en renta en Guatemala | ${nombre}`, description: 'Propiedades en renta en Guatemala: casas, apartamentos y oficinas con fotos, precios al mes y contratos claros y seguros.' }),
		// Renta vacacional por noches: solo si hay alguna publicada.
		hayVacacional && listing('vacacional', { alternates: par('vacacional', '/propiedades/vacacional/', '/en/properties/vacation-rentals/'), path: '/propiedades/vacacional/', operacion: 'vacacional', heading: 'Rentas vacacionales en Guatemala', title: `Renta vacacional por noches en Guatemala | ${nombre}`, description: 'Casas y apartamentos para tus vacaciones en Guatemala, por noche: elige tus fechas, ve la disponibilidad y solicita tu reserva.' })
	].filter(Boolean);
	for (const l of listings) {
		await writePage(l.path, T.listingPage(ctx, l));
		if (hay(properties, l.operacion)) urls.push({ path: l.path, priority: '0.9', lastmod: ultimaFecha(properties.filter((p) => !l.operacion || p.operacion === l.operacion)) });
	}

	// Páginas por tipo. La versión en inglés existe solo si ese tipo también tiene propiedades traducidas.
	const landingsEn = enActivo ? buildLandings(propsEn, new Set(normalizePages(data.pagesEn, '/en').map((p) => p.url)), true) : [];
	const parTipo = (l) => {
		const es = ctx.landings.find((x) => x.tipo === l.tipo && x.op === l.op), en = landingsEn.find((x) => x.tipo === l.tipo && x.op === l.op);
		return es && en ? { es: es.url, en: en.url } : null;
	};
	const escribirTipos = async (c, lista, en) => {
		for (const l of lista) {
			const deTipo = c.properties.filter((p) => p.operacion === l.op && p.tipo === l.tipo);
			await writePage(l.url, T.listingPage(c, { ...textosTipo(l, deTipo, nombre, en), alternates: parTipo(l) }));
			urls.push({ path: l.url, priority: '0.8', lastmod: ultimaFecha(deTipo) });
		}
	};
	ctx.landings.map(parTipo).filter(Boolean).forEach((a) => registrarPar(a.es, a.en));
	await escribirTipos(ctx, ctx.landings, false);

	const zonaOpts = new Map();
	for (const z of ctx.zonas) {
		// Texto propio de la zona editado en el panel (Contenido del sitio → Zonas); si no hay, se usa uno automático.
		const g = guiaZona(site, z.nombre);
		const deZona = properties.filter((p) => p.zona === z.nombre);
		const auto = textosZona(z, deZona, nombre);
		zonaOpts.set(z.nombre, {
			path: z.url,
			zona: z.nombre,
			heading: g.h1 || auto.heading,
			title: g.titulo || auto.title,
			description: g.descripcion || auto.description,
			intro: g.intro || auto.intro,
			contenido: g.contenido || '',
			imagen: g.imagen || ''
		});
		await writePage(z.url, T.listingPage(ctx, zonaOpts.get(z.nombre)));
		urls.push({ path: z.url, priority: '0.8', lastmod: ultimaFecha(deZona) });
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
					.find((t) => t.length <= 60) || `Casas ${verbo} en ${z.nombre}`,
				description: `${z[op]} propiedades ${verbo} en ${z.nombre}, Guatemala. Fotos, precios y asesoría personalizada para agendar tu visita presencial o por videollamada.`,
				intro: `${resumenInventario(deZona.filter((p) => p.operacion === op))} Escríbenos si buscas algo específico: tenemos opciones que aún no están publicadas.`
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
		const siteEn = deepMerge(site, site.en || {});
		// Los contadores en inglés usan el mismo ícono que en español (el panel solo lo pide una vez).
		if (siteEn.contadores && Array.isArray(siteEn.contadores.items)) {
			siteEn.contadores = { ...siteEn.contadores, items: siteEn.contadores.items.map((c, i) => ({ icono: (site.contadores.items[i] || {}).icono, ...c })) };
		}
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
			zonas: buildZonas(propsEn, '/en/properties/'),
			landings: landingsEn
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
		urls.push({ path: '/en/', priority: '1.0', lastmod: ultimaFecha(propsEn) });
		for (const l of [
			listingEn('todas', { path: '/en/properties/', alternates: par('', '/propiedades/', '/en/properties/'), heading: 'Properties in Guatemala', title: `Homes for sale and rent in Guatemala | ${nombre}`, description: 'Houses, condos and land for sale and rent in Guatemala City and beyond. Prices in USD, video tours and support for buyers in the US.' }),
			listingEn('venta', { path: '/en/properties/for-sale/', operacion: 'venta', alternates: par('venta', '/propiedades/venta/', '/en/properties/for-sale/'), heading: 'Homes for sale in Guatemala', title: `Homes for sale in Guatemala | ${nombre}`, description: 'Houses and condos for sale in Guatemala with verified titles, USD prices, live video tours and remote closing support for US buyers.' }),
			listingEn('renta', { path: '/en/properties/for-rent/', operacion: 'renta', alternates: par('renta', '/propiedades/renta/', '/en/properties/for-rent/'), heading: 'Homes for rent in Guatemala', title: `Homes for rent in Guatemala | ${nombre}`, description: 'Houses, condos and offices for rent in Guatemala City, with monthly prices, clear contracts and an English-speaking point of contact.' }),
			hayVacacionalEn && listingEn('vacacional', { path: '/en/properties/vacation-rentals/', operacion: 'vacacional', alternates: par('vacacional', '/propiedades/vacacional/', '/en/properties/vacation-rentals/'), heading: 'Vacation rentals in Guatemala', title: `Vacation rentals by the night in Guatemala | ${nombre}`, description: 'Houses and condos for your vacation in Guatemala, by the night: pick your dates, check availability and request your booking.' })
		].filter(Boolean)) {
			await writePage(l.path, T.listingPage(ctxEn, l));
			if (hay(propsEn, l.operacion)) urls.push({ path: l.path, priority: '0.9', lastmod: ultimaFecha(propsEn.filter((p) => !l.operacion || p.operacion === l.operacion)) });
		}
		await escribirTipos(ctxEn, landingsEn, true);
		for (const z of ctxEn.zonas) {
			const es = ctx.zonas.find((x) => x.nombre === z.nombre);
			const alternates = es ? { es: es.url, en: z.url } : null;
			const g = guiaZona(site, z.nombre, 'en');
			const auto = textosZona(z, propsEn.filter((p) => p.zona === z.nombre), nombre, true);
			await writePage(z.url, T.listingPage(ctxEn, {
				path: z.url,
				alternates,
				zona: z.nombre,
				heading: g.h1 || auto.heading,
				title: g.titulo || auto.title,
				description: g.descripcion || auto.description,
				intro: g.intro || auto.intro,
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
		for (const p of todasEn) {
			const es = todas.find((x) => x.id === p.id);
			es._alternates = p._alternates = { es: T.propertyUrl(es), en: T.propertyUrl(p) };
			registrarPar(T.propertyUrl(es), T.propertyUrl(p));
			await writePage(T.propertyUrl(p), fichaHtml(ctxEn, p));
			if (visibilidadDe(p) === 'visible') urls.push({ path: T.propertyUrl(p), priority: '0.8', images: (p.fotos || []).map((f) => f.url) });
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
		// Portal del propietario: página privada, fuera del sitemap.
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
	await writePage('/propietarios/', T.portalPage(ctx));
	await writePage('/calculadora-de-renta/', T.rentalCalculatorPage(ctx));
	urls.push({ path: '/calculadora-de-renta/', priority: '0.5' });
	const assets = await buildAssets({ root: ROOT, dist: DIST });
	await writeFile(path.join(DIST, 'admin', 'textos.json'), JSON.stringify(textosOriginales));

	if (mora) await writeFile(path.join(DIST, 'pausados.txt'), pausados(mora));
	await writeFile(path.join(DIST, 'sitemap.xml'), sitemap(ctx, urls));
	await writeFile(path.join(DIST, '_redirects'), redirects(ctx, todas));
	await writeFile(path.join(DIST, 'robots.txt'), ctx.noindex
		? 'User-agent: *\nDisallow: /\n'
		: `${['*', ...BOTS_IA].map((bot) => `User-agent: ${bot}\nAllow: /\nDisallow: /admin/\n`).join('\n')}\nSitemap: ${config.siteUrl.replace(/\/$/, '')}/sitemap.xml\n`);

	if (!ctx.noindex) {
		// Clave de IndexNow (Bing, Copilot, Yandex): es pública por diseño; la función deploy-succeeded la usa.
		await writeFile(path.join(DIST, `${indexNowKey(config.siteUrl)}.txt`), indexNowKey(config.siteUrl));
		await writeFile(path.join(DIST, 'llms.txt'), llmsTxt(ctx, properties, pages));
		await writeFile(path.join(DIST, 'llms-full.txt'), llmsFullTxt(ctx, properties));
	}
	// Los catálogos se generan siempre: los portales los leen aunque el sitio aún no se indexe en Google.
	const catalogos = feeds(ctx, properties, propsEnGlobal);
	await mkdir(path.join(DIST, 'feeds'), { recursive: true });
	await writeFile(path.join(DIST, 'feeds', 'meta-inmuebles.xml'), catalogos.meta);
	await writeFile(path.join(DIST, 'feeds', 'kyero.xml'), catalogos.kyero);
	await writeFile(path.join(DIST, 'feeds', 'propiedades.json'), catalogos.json);

	console.log(`✓ Sitio generado en dist/ (${data.source}): ${properties.length} propiedades${fueraDeListados.length ? ` (+${fueraDeListados.length} vendidas, rentadas o pausadas, solo con enlace)` : ''}, ${pages.length} páginas, ${ctx.posts.length} artículos, ${urls.length} URLs en el sitemap${ctx.noindex ? ' · SIN INDEXAR' : ''}`);
	// Avisos de SEO: una propiedad sin estos datos se posiciona peor (no detiene la publicación).
	const FALTANTES = { foto: (p) => (p.fotos || []).length, descripción: (p) => p.descripcion, precio: (p) => p.precio, zona: (p) => p.zona || p.ciudad };
	for (const p of properties) {
		const faltan = Object.keys(FALTANTES).filter((k) => !FALTANTES[k](p));
		if (faltan.length) console.warn(`  ⚠ «${p.titulo}» sin ${faltan.join(', ')}`);
	}
	console.log(`  CSS ${assets.cssOriginalKb} KB → ${assets.cssKb} KB · JS ${assets.jsOriginalKb} KB → ${assets.jsKb} KB`);
}

main().catch((err) => {
	console.error('✗ Error al generar el sitio:', err.message);
	process.exit(1);
});
