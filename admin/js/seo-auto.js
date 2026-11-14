// SEO automático de una propiedad. Lo usan el panel (para llenar los campos al guardar)
// y el generador del sitio (scripts/lib/templates.mjs), así los dos dan el mismo resultado.
import { operacionDe } from './estados.js';

export function stripMarkdown(md) {
	return String(md || '')
		.replace(/[#>*_`]/g, '')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

// Texto corto para Google (meta description, JSON-LD): solo los párrafos de presentación,
// sin las secciones con viñetas ni la nota del precio, que repiten datos de la ficha.
export function resumenSeo(md) {
	const lineas = String(md || '').replace(/\r/g, '').split('\n');
	const corte = lineas.findIndex((l) => /^\s*([-*+]\s|#|\*\*[^*]+\*\*\s*:?\s*$)/.test(l));
	const texto = (corte > 0 ? lineas.slice(0, corte) : corte === 0 ? [] : lineas).join(' ');
	const limpio = stripMarkdown(texto).replace(/\s+/g, ' ').trim();
	return limpio || stripMarkdown(md).replace(/^\s*[-+]\s+/gm, '').replace(/\s*\n+\s*/g, '. ').replace(/\.\s*\./g, '.').trim();
}

// Corta en la última palabra completa que cabe.
export function recortar(text, max) {
	const t = String(text || '').replace(/\s+/g, ' ').trim();
	return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

// ¿El texto `a` ya nombra a `b`? Sin acentos ni mayúsculas y por palabras completas ("zona 1" no es "zona 10").
const sinAcentos = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const nombra = (a, b) => Boolean(sinAcentos(b).trim()) && new RegExp(`(^|[^a-z0-9])${sinAcentos(b).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(sinAcentos(a));
// Quita las partes que otra ya dice ("Vista Hermosa, zona 15" + "Zona 15" → solo la primera). Una sola forma de
// juntar lugares en todo el sistema: ubicación de la ficha, títulos, descripciones y textos del panel.
export const sinRepetir = (partes) => partes.map((x) => String(x || '').trim()).filter(Boolean)
	.filter((x, i, a) => !a.some((y, j) => j !== i && nombra(y, x) && (j < i || !nombra(x, y))));

// Largo máximo de un título: Google corta los de más de ~60 caracteres.
export const TITULO_MAX = 60;
// Un título largo se acorta quitando lo que va después de la última coma; si no tiene comas, se corta en una palabra.
function acortar(t, max = TITULO_MAX) {
	const partes = t.split(/,\s+/);
	while (partes.length > 1 && partes.join(', ').length > max) partes.pop();
	return recortar(partes.join(', '), max);
}

// Título automático que cabe en Google (60 caracteres): se acorta quitando detalles.
export function autoSeoTitle(p, en = false) {
	const op = en ? ({ vacacional: 'Vacation Rental', renta: 'For Rent' }[p.operacion] || 'For Sale') : operacionDe(p);
	const prep = en ? 'in' : 'en';
	const t = acortar(String(p.titulo || '').trim());
	// Zona o ciudad que el título ya nombra no se repiten.
	const nuevo = (x) => (x && !nombra(t, x) ? String(x).trim() : '');
	const zona = nuevo(p.zona);
	const ciudad = zona && nombra(zona, p.ciudad) ? '' : nuevo(p.ciudad);
	const lugar = [zona, ciudad].filter(Boolean).join(', ');
	const cabe = (x) => x && x.length <= TITULO_MAX;
	// Si el título ya dice la operación, no se repite ("… en venta … | Venta").
	const yaDice = /\b(venta|vendo|renta|alquiler|alquilo|vacacional|for sale|for rent|vacation)\b/i.test(t);
	if (!t) return lugar ? `${op} ${prep} ${lugar}` : op;
	const sufijos = yaDice ? [lugar, zona, ciudad, 'Guatemala'] : [lugar && `${op} ${prep} ${lugar}`, zona && `${op} ${prep} ${zona}`, ciudad && `${op} ${prep} ${ciudad}`, op];
	return sufijos.filter(Boolean).map((x) => `${t} | ${x}`).find(cabe) || t;
}

// Descripción automática para Google (máx. 155): precio, medidas y la presentación de la propiedad.
// `precio` y `datos` vienen ya escritos por quien llama ("Q 2,300,000", ["3 habitaciones", "2,226.47 m²"]).
export function autoSeoDescripcion(p, precio, datos = []) {
	const extra = datos.filter(Boolean).join(', ');
	return recortar(`${precio}.${extra ? ` ${extra}.` : ''} ${resumenSeo(p.descripcion)}`, 155);
}

// Huéspedes que caben en una renta vacacional (0 si no aplica): va en la descripción en vez de los m².
export function huespedesDe(p) {
	return p.operacion === 'vacacional' && p.vacacional ? Math.max(0, Math.round(Number(p.vacacional.huespedesMax) || 0)) : 0;
}
