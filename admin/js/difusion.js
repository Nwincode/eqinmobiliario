// Difusión en portales y redes: textos listos para pegar en cada plataforma y fotos para descargar.
import { slugify } from './ui.js';
import { stripMd } from './seo.js';
import { crearZip, descargarBlob } from './zip.js';
import { siteConfig } from './firebase.js';

const SITE = (siteConfig.siteUrl || '').replace(/\/$/, '');

// Plataformas por defecto. Se pueden cambiar en Contenido del sitio → Portales.
// Los límites de caracteres son aproximados: si una plataforma corta el texto, bájalos ahí.
export const PORTALES_DEFAULT = [
	{ id: 'encuentra24', nombre: 'Encuentra24', url: 'https://www.encuentra24.com/guatemala-es', idioma: 'es', estilo: 'portal', tituloMax: 70, textoMax: 4000, enlaces: false },
	{ id: 'marketplace', nombre: 'Facebook Marketplace', url: 'https://www.facebook.com/marketplace/create', idioma: 'es', estilo: 'portal', tituloMax: 100, textoMax: 3000, enlaces: false },
	{ id: 'grupos-facebook', nombre: 'Grupos de Facebook', url: 'https://www.facebook.com/groups/feed/', idioma: 'es', estilo: 'social', tituloMax: 0, textoMax: 3000, enlaces: true },
	{ id: 'instagram', nombre: 'Instagram', url: 'https://www.instagram.com/', idioma: 'es', estilo: 'social', tituloMax: 0, textoMax: 2200, enlaces: false },
	{ id: 'whatsapp', nombre: 'WhatsApp (estados y grupos)', url: 'https://web.whatsapp.com/', idioma: 'es', estilo: 'mensaje', tituloMax: 0, textoMax: 900, enlaces: true },
	{ id: 'portal-en', nombre: 'Portales en inglés (EE. UU.)', url: '', idioma: 'en', estilo: 'portal', tituloMax: 80, textoMax: 4000, enlaces: true }
];

export function portalesDe(site) {
	const lista = (site && Array.isArray(site.portales) && site.portales.filter((p) => p && p.nombre).length)
		? site.portales.filter((p) => p && p.nombre)
		: PORTALES_DEFAULT;
	return lista.map((p) => ({
		...p,
		id: p.id || slugify(p.nombre),
		idioma: p.idioma === 'en' ? 'en' : 'es',
		estilo: ['portal', 'social', 'mensaje'].includes(p.estilo) ? p.estilo : 'portal',
		tituloMax: Number(p.tituloMax) || 0,
		textoMax: Number(p.textoMax) || 3000,
		enlaces: p.enlaces !== false && p.enlaces !== 'no'
	}));
}

const TIPO = {
	es: { casa: 'Casa', apartamento: 'Apartamento', terreno: 'Terreno', oficina: 'Oficina', local: 'Local comercial', bodega: 'Bodega', finca: 'Finca' },
	en: { casa: 'House', apartamento: 'Condo', terreno: 'Land', oficina: 'Office', local: 'Retail space', bodega: 'Warehouse', finca: 'Estate' }
};
const L = {
	es: { venta: 'en venta', renta: 'en renta', precio: 'Precio', hab: 'Habitaciones', banos: 'Baños', parqueos: 'Parqueos', constr: 'Construcción', terreno: 'Terreno', ubic: 'Ubicación', amen: 'Amenidades', codigo: 'Código', contacto: 'Información y visitas', fotos: 'Fotos, video y ubicación', mes: '/mes', consultar: 'Precio a consultar', caract: 'Características', bio: 'Más fotos: link en nuestra bio', habC: 'hab.', banC: 'baños', parC: 'parqueos', verFotos: 'Ver fotos' },
	en: { venta: 'for sale', renta: 'for rent', precio: 'Price', hab: 'Bedrooms', banos: 'Bathrooms', parqueos: 'Parking', constr: 'Interior', terreno: 'Lot', ubic: 'Location', amen: 'Amenities', codigo: 'Listing ID', contacto: 'Info and video tours', fotos: 'Photos, video and map', mes: '/mo', consultar: 'Price on request', caract: 'Details', bio: 'More photos: link in bio', habC: 'bd', banC: 'ba', parC: 'parking', verFotos: 'See photos' }
};

export function codigo(p) {
	return `EQ-${String(p.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()}`;
}

function precioTexto(p, lang) {
	if (!p.precio || (p.vipLanding && p.vipLanding.ocultarPrecio)) return L[lang].consultar;
	const pre = { USD: 'US$', GTQ: 'Q' }[p.moneda || 'USD'] || p.moneda;
	return `${pre} ${Number(p.precio).toLocaleString('en-US')}${p.operacion === 'renta' ? L[lang].mes : ''}`;
}

function area(m2, lang) {
	if (!m2) return '';
	return lang === 'en' ? `${Math.round(m2 * 10.7639).toLocaleString('en-US')} sq ft (${m2} m²)` : `${m2} m²`;
}

// Enlace a la ficha con UTM: así cada lead queda atribuido a la plataforma de donde vino.
export function enlaceFicha(p, portal) {
	const lang = portal.idioma;
	const slug = lang === 'en' && p.en && p.en.titulo ? slugify(p.en.slug || p.en.titulo) : p.slug;
	const base = lang === 'en' ? (p.vip ? '/en/luxury/' : '/en/property/') : (p.vip ? '/vip/' : '/propiedad/');
	return `${SITE}${base}${slug}/?utm_source=${encodeURIComponent(portal.id)}&utm_medium=anuncio&utm_campaign=difusion`;
}

function cortar(texto, max) {
	if (!max || texto.length <= max) return texto;
	const cut = texto.slice(0, max - 1);
	const fin = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
	return (fin > max * 0.6 ? cut.slice(0, fin + 1) : cut.slice(0, cut.lastIndexOf(' '))).trim() + '…';
}

function hashtags(p) {
	const zona = String(p.zona || '').replace(/\s+/g, '');
	const op = p.operacion === 'renta' ? 'EnRenta' : 'EnVenta';
	const tipo = (TIPO.es[p.tipo] || 'Propiedad').split(' ')[0];
	return [`#${tipo}${op}`, zona && `#${zona}`, '#BienesRaicesGuatemala', '#Guatemala', `#Inmobiliaria`, p.ciudad && `#${String(p.ciudad).replace(/\s+/g, '')}`, '#EquipoInmobiliario']
		.filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ');
}

// Devuelve { titulo, texto, enlace } listos para pegar en la plataforma.
export function textoPara(p, portal, { agente, contacto } = {}) {
	const lang = portal.idioma;
	const t = L[lang];
	const en = lang === 'en' ? (p.en || {}) : {};
	const titulo = en.titulo || p.titulo || '';
	const desc = stripMd(en.descripcion || p.descripcion || '').replace(/[ \t]+\n/g, '\n').trim();
	const amen = (lang === 'en' ? en.amenidades : p.amenidades) || [];
	const lugar = [p.zona, p.ciudad].filter(Boolean).join(', ');
	const precio = precioTexto(p, lang);
	const tel = (agente && agente.telefono) || contacto || '';
	const quien = agente && agente.nombre ? `${agente.nombre} · ${tel}` : tel;
	const enlace = enlaceFicha(p, portal);
	const tipoOp = `${TIPO[lang][p.tipo] || ''} ${t[p.operacion === 'renta' ? 'renta' : 'venta']}`.trim();

	let tituloFinal = '';
	if (portal.tituloMax) {
		const yaTieneZona = p.zona && titulo.toLowerCase().includes(String(p.zona).toLowerCase());
		const opciones = [
			yaTieneZona ? `${titulo} · ${p.ciudad || ''}` : `${titulo} · ${lugar}`,
			yaTieneZona ? '' : `${titulo} · ${p.zona || ''}`,
			titulo,
			`${tipoOp} ${lugar}`
		].map((x) => x.replace(/\s·\s$/, '').trim()).filter(Boolean);
		tituloFinal = opciones.find((x) => x.length <= portal.tituloMax) || cortar(titulo, portal.tituloMax);
	}

	let partesFijas;
	let cuerpo;
	if (portal.estilo === 'portal') {
		const datos = [
			`• ${t.precio}: ${precio}`,
			p.habitaciones || p.banos ? `• ${[p.habitaciones && `${t.hab}: ${p.habitaciones}`, p.banos && `${t.banos}: ${p.banos}`, p.parqueos && `${t.parqueos}: ${p.parqueos}`].filter(Boolean).join(' · ')}` : '',
			p.m2Construccion || p.m2Terreno ? `• ${[p.m2Construccion && `${t.constr}: ${area(p.m2Construccion, lang)}`, p.m2Terreno && `${t.terreno}: ${area(p.m2Terreno, lang)}`].filter(Boolean).join(' · ')}` : '',
			lugar ? `• ${t.ubic}: ${[p.direccion, lugar].filter(Boolean).join(', ')}` : '',
			amen.length ? `• ${t.amen}: ${amen.join(', ')}` : ''
		].filter(Boolean).join('\n');
		partesFijas = [`${t.caract}:\n${datos}`, `${t.codigo}: ${codigo(p)}`, quien ? `${t.contacto}: ${quien}` : '', portal.enlaces ? `${t.fotos}: ${enlace}` : ''].filter(Boolean).join('\n\n');
		cuerpo = (d) => [d, partesFijas].filter(Boolean).join('\n\n');
	} else if (portal.estilo === 'social') {
		const cabeza = [
			`🏡 ${titulo}`,
			lugar ? `📍 ${lugar}` : '',
			`💰 ${precio}`,
			[p.habitaciones && `🛏 ${p.habitaciones} ${t.habC}`, p.banos && `🛁 ${p.banos} ${t.banC}`, p.parqueos && `🚗 ${p.parqueos} ${t.parC}`].filter(Boolean).join(' · '),
			p.m2Construccion ? `📐 ${area(p.m2Construccion, lang)}` : ''
		].filter(Boolean).join('\n');
		const pie = [
			amen.length ? `✨ ${amen.slice(0, 6).join(' · ')}` : '',
			quien ? `📲 ${quien}` : '',
			portal.enlaces ? `🔗 ${enlace}` : `👉 ${t.bio}`,
			`${t.codigo}: ${codigo(p)}`,
			lang === 'es' ? hashtags(p) : '#GuatemalaRealEstate #HomesForSale #LivingInGuatemala'
		].filter(Boolean).join('\n');
		partesFijas = `${cabeza}\n\n${pie}`;
		cuerpo = (d) => [cabeza, d, pie].filter(Boolean).join('\n\n');
	} else {
		const cabeza = [`*${titulo}*`, lugar ? `📍 ${lugar}` : '', `💰 ${precio}`,
			[p.habitaciones && `${p.habitaciones} ${t.habC}`, p.banos && `${p.banos} ${t.banC}`, p.m2Construccion && area(p.m2Construccion, lang)].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
		const pie = [portal.enlaces ? `${t.verFotos}: ${enlace}` : '', quien ? `📲 ${quien}` : ''].filter(Boolean).join('\n');
		partesFijas = `${cabeza}\n\n${pie}`;
		cuerpo = (d) => [cabeza, d, pie].filter(Boolean).join('\n\n');
	}

	// La descripción ocupa el espacio que dejan los datos fijos dentro del límite de la plataforma.
	const libre = Math.max(0, portal.textoMax - partesFijas.length - 4);
	// En redes y mensajes el texto debe leerse rápido: la descripción completa queda en la ficha.
	const largoDesc = portal.estilo === 'mensaje' ? Math.min(libre, 280) : portal.estilo === 'social' ? Math.min(libre, 600) : libre;
	const texto = cuerpo(largoDesc > 40 ? cortar(desc, largoDesc) : '');
	return { titulo: tituloFinal, texto: cortar(texto, portal.textoMax), enlace };
}

// --------------------------------------------------------------- Fotos

function nombreArchivo(p, i, ext) {
	return `${codigo(p)}-${slugify(p.titulo).slice(0, 40)}-${String(i + 1).padStart(2, '0')}.${ext}`;
}

async function bajar(url) {
	const res = await fetch(url, { mode: 'cors' });
	if (!res.ok) throw new Error(`No se pudo descargar ${url}`);
	return res.blob();
}

// Logo de marca (casa en círculo) para la marca de agua de las fotos cuadradas.
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="#fcffff" stroke-width="5"/><path fill="#fcffff" d="M50 24 77 50h-8v25H56V61H44v14H31V50h-8Z M61 29h7v13l-7-6.5Z"/></svg>`;
let logoBitmap;
async function logo() {
	if (!logoBitmap) logoBitmap = await createImageBitmap(new Blob([LOGO_SVG], { type: 'image/svg+xml' }), { resizeWidth: 120, resizeHeight: 120 }).catch(() => null);
	return logoBitmap;
}

// Recorte al centro en el formato pedido, con el logo en la esquina.
async function adaptar(blob, ancho, alto, conLogo) {
	const img = await createImageBitmap(blob);
	const canvas = document.createElement('canvas');
	canvas.width = ancho;
	canvas.height = alto;
	const ctx = canvas.getContext('2d');
	const escala = Math.max(ancho / img.width, alto / img.height);
	const w = img.width * escala;
	const hh = img.height * escala;
	ctx.drawImage(img, (ancho - w) / 2, (alto - hh) / 2, w, hh);
	if (conLogo) {
		const lg = await logo();
		if (lg) {
			const s = Math.round(ancho * 0.08);
			ctx.globalAlpha = 0.7;
			ctx.drawImage(lg, ancho - s - ancho * 0.03, alto - s - ancho * 0.03, s, s);
			ctx.globalAlpha = 1;
		}
	}
	const out = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
	return out;
}

async function aJpg(blob) {
	const img = await createImageBitmap(blob);
	const canvas = document.createElement('canvas');
	canvas.width = img.width;
	canvas.height = img.height;
	canvas.getContext('2d').drawImage(img, 0, 0);
	return new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
}

export const FORMATOS = [
	{ id: 'originales', nombre: 'Originales en JPG', ancho: 0, alto: 0, ayuda: 'Para portales (Encuentra24, Marketplace, portales en inglés).' },
	{ id: 'cuadradas', nombre: 'Cuadradas 1080×1080 con logo', ancho: 1080, alto: 1080, logo: true, ayuda: 'Para el feed de Instagram y Facebook.' },
	{ id: 'verticales', nombre: 'Verticales 1080×1350 con logo', ancho: 1080, alto: 1350, logo: true, ayuda: 'Para Instagram (formato que ocupa más pantalla).' },
	{ id: 'historias', nombre: 'Historias 1080×1920', ancho: 1080, alto: 1920, logo: true, ayuda: 'Para estados de WhatsApp e historias de Instagram/Facebook.' }
];

// Descarga todas las fotos de la propiedad en un ZIP, en el formato elegido.
export async function descargarFotos(p, formatoId, alProgreso = () => {}) {
	const formato = FORMATOS.find((f) => f.id === formatoId) || FORMATOS[0];
	const fotos = (p.fotos || []).map((f) => f.url).filter(Boolean);
	if (!fotos.length) throw new Error('La propiedad no tiene fotos.');
	const archivos = [];
	const fallidas = [];
	for (const [i, url] of fotos.entries()) {
		alProgreso(i + 1, fotos.length);
		try {
			let blob = await bajar(url);
			// Muchos portales no aceptan WebP: todo sale en JPG.
			if (formato.ancho) blob = await adaptar(blob, formato.ancho, formato.alto, formato.logo);
			else if (blob.type !== 'image/jpeg') blob = await aJpg(blob);
			archivos.push({ nombre: nombreArchivo(p, i, 'jpg'), datos: new Uint8Array(await blob.arrayBuffer()) });
		} catch {
			fallidas.push(i + 1);
		}
	}
	if (!archivos.length) throw new Error('No se pudo descargar ninguna foto. Si están en otro sitio, ese sitio no permite descargarlas desde el panel.');
	descargarBlob(crearZip(archivos), `${codigo(p)}-${formato.id}.zip`);
	return { total: archivos.length, fallidas };
}

// Estado de la publicación en una plataforma.
export function estadoDifusion(p, portalId) {
	const reg = (p.difusion || {})[portalId];
	const vendida = ['vendida', 'rentada'].includes(p.estado) || !p.publicado;
	if (!reg || reg.estado === 'baja') return vendida ? { id: 'na', texto: '—' } : { id: 'pendiente', texto: 'Sin publicar' };
	if (vendida) return { id: 'baja', texto: 'Dar de baja' };
	const cambio = p.updatedAt && (p.updatedAt.seconds ? p.updatedAt.seconds * 1000 : Date.parse(p.updatedAt));
	if (cambio && reg.fecha && cambio > Date.parse(reg.fecha) + 60_000) return { id: 'actualizar', texto: 'Actualizar' };
	return { id: 'ok', texto: 'Publicada' };
}
