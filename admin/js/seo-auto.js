// SEO automático de una propiedad. Lo usan el panel (para llenar los campos al guardar)
// y el generador del sitio (scripts/lib/templates.mjs), así los dos dan el mismo resultado.

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

// Título automático que cabe en Google (~65 caracteres): se acorta quitando detalles.
export function autoSeoTitle(p, en = false) {
	const op = p.operacion === 'vacacional' ? (en ? 'Vacation Rental' : 'Renta vacacional')
		: en ? (p.operacion === 'renta' ? 'For Rent' : 'For Sale') : (p.operacion === 'renta' ? 'Renta' : 'Venta');
	const prep = en ? 'in' : 'en';
	// Si el título ya dice la operación, no se repite ("… en venta … | Venta").
	const t = String(p.titulo || '');
	// Zona o ciudad que el título ya nombra no se repiten.
	const nuevo = (x) => (x && !t.toLowerCase().includes(String(x).toLowerCase()) ? x : '');
	const zona = nuevo(p.zona);
	const lugar = [zona, nuevo(p.ciudad)].filter(Boolean).join(', ');
	const yaDice = /\b(venta|vendo|renta|alquiler|alquilo|vacacional|for sale|for rent|vacation)\b/i.test(t);
	if (yaDice) {
		return [lugar && `${t} | ${lugar}`, `${t} | Guatemala`, t].find((x) => x && x.length <= 65) || t;
	}
	if (!t) return lugar ? `${op} ${prep} ${lugar}` : op;
	const candidates = [
		lugar && `${t} | ${op} ${prep} ${lugar}`,
		zona && `${t} | ${op} ${prep} ${zona}`,
		`${t} | ${op}`,
		t
	];
	return candidates.find((x) => x && x.length <= 65) || t;
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
