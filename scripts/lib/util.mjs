import { ESTADOS_PROPIEDAD } from '../../admin/js/estados.js';
import { miles, dinero } from '../../admin/js/formato.js';
// Utilidades compartidas por el generador del sitio.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
	if (value === undefined || value === null) return '';
	return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function slugify(text) {
	return String(text || '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

export function isPlainObject(v) {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Mezcla `override` sobre `base`. Los arreglos y valores vacíos de `override`
// reemplazan solo si traen contenido, así un campo sin llenar no borra el valor por defecto.
export function deepMerge(base, override) {
	if (!isPlainObject(base)) return override === undefined ? base : override;
	if (!isPlainObject(override)) return base;
	const out = { ...base };
	for (const [k, v] of Object.entries(override)) {
		if (v === undefined || v === null || v === '') continue;
		if (Array.isArray(v) && v.length === 0 && Array.isArray(base[k]) && base[k].length) continue;
		out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v;
	}
	return out;
}

// Número con coma en miles y millones y punto en decimales (2,226.47), como se usa en Guatemala.
export const cifra = miles;

export function formatPrice(precio, moneda = 'USD', operacion = 'venta', lang = 'es') {
	if (!precio) return lang === 'en' ? 'Price on request' : 'Precio a consultar';
	if (operacion === 'vacacional') {
		return lang === 'en' ? `From ${dinero(precio, moneda)} per night` : `Desde ${dinero(precio, moneda)} por noche`;
	}
	const suffix = operacion === 'renta' ? (lang === 'en' ? ' /mo' : ' /mes') : '';
	return `${dinero(precio, moneda)}${suffix}`;
}

export const TIPOS = {
	casa: 'Casa',
	apartamento: 'Apartamento',
	terreno: 'Terreno',
	oficina: 'Oficina',
	local: 'Local comercial',
	bodega: 'Bodega',
	finca: 'Finca'
};

// Nombres para las páginas por tipo («Casas en venta en Guatemala», /casas-en-venta/) en los dos idiomas.
// en: nombre del título; enN: singular y plural para contar; un / enUn: con artículo, para las preguntas.
export const TIPOS_LANDING = {
	casa: { plural: 'Casas', un: 'una casa', en: 'Houses', enN: ['house', 'houses'], enUn: 'a house' },
	apartamento: { plural: 'Apartamentos', un: 'un apartamento', en: 'Condos', enN: ['condo', 'condos'], enUn: 'a condo' },
	terreno: { plural: 'Terrenos', un: 'un terreno', en: 'Land', enN: ['lot', 'lots'], enUn: 'a lot' },
	oficina: { plural: 'Oficinas', un: 'una oficina', en: 'Offices', enN: ['office', 'offices'], enUn: 'an office' },
	local: { plural: 'Locales comerciales', un: 'un local comercial', en: 'Retail spaces', enN: ['retail space', 'retail spaces'], enUn: 'a retail space' },
	bodega: { plural: 'Bodegas', un: 'una bodega', en: 'Warehouses', enN: ['warehouse', 'warehouses'], enUn: 'a warehouse' },
	finca: { plural: 'Fincas', un: 'una finca', en: 'Farms', enN: ['farm', 'farms'], enUn: 'a farm' }
};

// Etiquetas públicas de cada estado (la lista y sus reglas viven en admin/js/estados.js).
export const ESTADOS = Object.fromEntries(ESTADOS_PROPIEDAD.map((e) => [e.valor, e.es]));

// «Zona 16, Guatemala»; si zona y ciudad son lo mismo (Antigua Guatemala) no se repite.
export function lugarDe(p) {
	return [p.zona, p.ciudad !== p.zona && p.ciudad].filter(Boolean).join(', ');
}

export function plural(n, uno, varios) {
	return `${n} ${Number(n) === 1 ? uno : varios}`;
}

export function truncate(text, max = 160) {
	const clean = String(text || '').replace(/\s+/g, ' ').trim();
	if (clean.length <= max) return clean;
	return clean.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

// El resumen y el SEO automático viven en admin/js/seo-auto.js (los usa también el panel).
export { stripMarkdown, resumenSeo } from '../../admin/js/seo-auto.js';

function inlineMarkdown(text) {
	return esc(text)
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.+?)\*/g, '<em>$1</em>')
		.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|mailto:|tel:|#)[^)\s]*)\)/g, '<a href="$2">$1</a>');
}

// Markdown mínimo para las páginas de contenido: títulos, párrafos, listas, negritas y enlaces.
export function markdown(md) {
	const lines = String(md || '').replace(/\r/g, '').split('\n');
	const html = [];
	let para = [];
	let list = null;
	const flushPara = () => {
		if (para.length) html.push(`<p>${inlineMarkdown(para.join(' '))}</p>`);
		para = [];
	};
	const flushList = () => {
		if (list) html.push(`<${list.tag}>${list.items.map((i) => `<li>${inlineMarkdown(i)}</li>`).join('')}</${list.tag}>`);
		list = null;
	};
	for (const raw of lines) {
		const line = raw.trim();
		let m;
		if (!line) {
			flushPara();
			flushList();
		} else if ((m = line.match(/^>\s?(.*)$/))) {
			flushPara();
			flushList();
			html.push(`<blockquote class="content-note"><p>${inlineMarkdown(m[1])}</p></blockquote>`);
		} else if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
			flushPara();
			flushList();
			const level = Math.min(m[1].length + 1, 5);
			html.push(`<h${level}>${inlineMarkdown(m[2])}</h${level}>`);
		} else if ((m = line.match(/^[-*]\s+(.*)$/)) || (m = line.match(/^\d+[.)]\s+(.*)$/))) {
			flushPara();
			const tag = /^\d/.test(line) ? 'ol' : 'ul';
			if (!list || list.tag !== tag) {
				flushList();
				list = { tag, items: [] };
			}
			list.items.push(m[1]);
		} else {
			flushList();
			para.push(line);
		}
	}
	flushPara();
	flushList();
	return html.join('\n');
}

// Convierte enlaces de YouTube o Vimeo al formato embebible.
export function videoEmbedUrl(url) {
	if (!url) return '';
	let m;
	if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/))) {
		return `https://www.youtube-nocookie.com/embed/${m[1]}`;
	}
	if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) {
		return `https://player.vimeo.com/video/${m[1]}`;
	}
	return '';
}

// Acepta un iframe completo de Google Maps, su URL "embed" o una dirección/coordenadas.
export function mapEmbedUrl(value) {
	if (!value) return '';
	const src = String(value).match(/src="([^"]+)"/);
	const url = src ? src[1] : String(value).trim();
	if (/^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed/.test(url)) return url;
	return `https://maps.google.com/maps?q=${encodeURIComponent(url)}&z=15&output=embed`;
}

export function whatsappLink(numero, mensaje = '') {
	const n = String(numero || '').replace(/\D/g, '');
	if (!n) return '';
	return `https://wa.me/${n}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`;
}

export function byOrder(a, b) {
	return (a.orden ?? 999) - (b.orden ?? 999) || String(a.titulo || a.nombre || '').localeCompare(String(b.titulo || b.nombre || ''));
}
