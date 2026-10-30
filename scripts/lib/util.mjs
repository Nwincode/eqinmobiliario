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

const CURRENCY_PREFIX = { USD: 'US$', GTQ: 'Q' };

export function formatPrice(precio, moneda = 'USD', operacion = 'venta') {
	if (!precio) return 'Precio a consultar';
	const n = Number(precio).toLocaleString('en-US', { maximumFractionDigits: 0 });
	const suffix = operacion === 'renta' ? ' /mes' : '';
	return `${CURRENCY_PREFIX[moneda] || moneda} ${n}${suffix}`;
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

export const ESTADOS = {
	disponible: 'Disponible',
	reservada: 'Reservada',
	vendida: 'Vendida',
	rentada: 'Rentada'
};

export function plural(n, uno, varios) {
	return `${n} ${Number(n) === 1 ? uno : varios}`;
}

export function truncate(text, max = 160) {
	const clean = String(text || '').replace(/\s+/g, ' ').trim();
	if (clean.length <= max) return clean;
	return clean.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

export function stripMarkdown(md) {
	return String(md || '')
		.replace(/[#>*_`]/g, '')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

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
