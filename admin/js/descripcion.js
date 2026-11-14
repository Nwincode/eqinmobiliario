// «Mejorar descripción»: deja el párrafo de presentación de la propiedad (el que escribió el asesor o, si no hay,
// uno armado con el tipo, la operación y el lugar) y la nota de lo que no incluye el precio. Nada de lo que ya
// es un campo de la ficha (habitaciones, huéspedes, amenidades, estadía mínima…): la página lo muestra de esos
// campos, siempre al día. Sin precio en el texto (ya sale en la ficha).
// En la web va sin emojis; conEmojis() los agrega para Meta (Facebook, Instagram, WhatsApp).
import { sinRepetir } from './seo-auto.js';

const TIPO = { casa: 'Casa', apartamento: 'Apartamento', terreno: 'Terreno', oficina: 'Oficina', local: 'Local comercial', bodega: 'Bodega', finca: 'Finca' };
const OPERACION = { venta: 'en venta', renta: 'en alquiler', vacacional: 'para vacacionar' };
// Títulos de las secciones que armaba la plantilla anterior (y como quedaron al traducirlas al inglés).
const TITULOS = ['Características de la propiedad', 'Amenidades', 'Detalles técnicos', 'Términos del alquiler', 'Para tu estadía',
	'Property features', 'Amenities', 'Technical details', 'Rental terms', 'Lease terms', 'For your stay'];

// Ícono según la amenidad (si no hay uno que corresponda, ✅).
const ICONOS = [
	[/piscina|alberca/i, '🏊'], [/garita|seguridad|vigilancia|cámara/i, '👮'], [/jard[ií]n|verde|parque/i, '🌳'],
	[/gimnasio|gym/i, '🏋️'], [/terraza|balc[oó]n|rooftop/i, '🌇'], [/bbq|churrasquera|parrilla|asador/i, '🍖'],
	[/sal[oó]n|social|eventos/i, '🎉'], [/juegos|niños|infantil/i, '🛝'], [/cancha|tenis|f[uú]tbol|p[aá]del/i, '🎾'],
	[/elevador|ascensor/i, '🛗'], [/estudio|oficina/i, '💻'], [/lavander[ií]a/i, '🧺'], [/bodega/i, '📦'],
	[/cocina/i, '🍳'], [/chimenea/i, '🔥'], [/vista/i, '🏞️'], [/mascota|pet/i, '🐾'], [/agua|cisterna|pozo/i, '💧'],
	[/planta|generador|energ[ií]a|solar/i, '⚡'], [/aire|a\/c/i, '❄️'], [/amueblad/i, '🛋️'], [/wifi|internet/i, '📶'],
	[/servicio|dormitorio de servicio/i, '🧹'], [/parqueo|garaje|visita/i, '🚗']
];
// Íconos de los datos que arma la plantilla (van antes que los de amenidades).
const ICONOS_DATOS = [
	[/^\d[\d,.]*\s+habitaci/i, '🛏️'], [/^\d[\d,.]*\s+baño/i, '🚿'], [/^\d[\d,.]*\s+parqueo/i, '🚗'], [/^hasta .*hu[eé]sped/i, '👥'],
	[/^construcci[oó]n:/i, '📐'], [/^terreno:/i, '🗺️'], [/^tipo:/i, '🏠'], [/^check-in/i, '🕒'], [/^check-out/i, '🕚'],
	[/^estad[ií]a m[ií]nima/i, '🌙'], [/^contrato/i, '📝'], [/disponib|calendario/i, '📅']
];
const icono = (txt) => ([...ICONOS_DATOS, ...ICONOS].find(([re]) => re.test(txt)) || [, '✅'])[1];
const NOTA = /^\s*(⚠️\s*|\*)?El precio no incluye/;

// Versión para Meta: un ícono al inicio de cada viñeta y ⚠️ en la nota del precio.
export function conEmojis(texto = '') {
	return String(texto).split('\n').map((l) => {
		const m = l.match(/^(\s*[-*+]\s+)(.*)$/);
		if (m && !/^\p{Extended_Pictographic}/u.test(m[2])) return `${m[1]}${icono(m[2])} ${m[2]}`;
		if (NOTA.test(l) && !l.includes('⚠️')) return `⚠️ ${l.replace(/^\s*\*|\*\s*$/g, '')}`;
		return l;
	}).join('\n');
}

// Texto propio de la propiedad que ya existía: lo que está antes de las secciones generadas,
// o los párrafos sin viñetas ni títulos. Así no se pierde lo que escribió el asesor.
export function textoBase(descripcion = '') {
	const lineas = String(descripcion).replace(/\r/g, '').split('\n');
	const corte = lineas.findIndex((l) => TITULOS.some((t) => l.replace(/[*#\s]/g, '').startsWith(t.replace(/\s/g, ''))) || /^\s*⚠️/.test(l) || NOTA.test(l));
	const previas = corte >= 0 ? lineas.slice(0, corte) : lineas;
	return previas
		.filter((l) => !/^\s*([-*+]\s|#|>|\p{Extended_Pictographic})/u.test(l))
		.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Párrafo de presentación cuando el asesor no escribió uno: tipo, operación y lugar (los datos van en sus campos).
function introduccion(p) {
	const donde = sinRepetir([p.direccion, p.zona, p.ciudad]);
	return `${`${TIPO[p.tipo] || 'Propiedad'} ${OPERACION[p.operacion] || ''}`.replace(/\s+/g, ' ').trim()}${donde.length ? ` en ${donde.join(', ')}` : ''}.`;
}

// Formato viejo: hasta 2026 la plantilla agregaba debajo del párrafo las secciones Características, Amenidades,
// Detalles técnicos, Términos del alquiler y Para tu estadía, con viñetas copiadas de los campos. Esas copias
// quedaban viejas («Hasta 1 huésped» con la ficha en 7) y repetían los bloques de la página. Aquí se quita
// exactamente cada sección generada: una línea que es solo uno de esos títulos en negrita y las viñetas que la
// siguen. Lo demás (párrafos, la nota del precio, listas escritas a mano con otro título) queda igual.
// También el párrafo «Key facts: … Price: …» que el traductor sin IA (admin/js/reglas.js) agregaba al inglés.
const esTitulo = (l) => {
	const m = /^\s*\*\*([^*]+?):?\*\*\s*:?\s*$/.exec(l);
	return Boolean(m) && TITULOS.some((t) => t.toLowerCase() === m[1].trim().toLowerCase());
};
export function sinBloquesGenerados(descripcion = '') {
	const lineas = String(descripcion || '').replace(/\r/g, '').split('\n');
	const out = [];
	for (let i = 0; i < lineas.length; i++) {
		if (/^\s*Key facts: .*\.\s*$/.test(lineas[i])) continue;
		if (!esTitulo(lineas[i])) { out.push(lineas[i]); continue; }
		while (i + 1 < lineas.length && /^\s*([-*+]\s|$)/.test(lineas[i + 1]) && !(lineas[i + 1].trim() === '' && !/^\s*[-*+]\s/.test(lineas[i + 2] || ''))) i++;
	}
	return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function generarDescripcion(p = {}) {
	const partes = [textoBase(p.descripcion) || introduccion(p)];
	if (p.operacion === 'renta') partes.push('*El precio no incluye servicios, mantenimiento ni impuestos, salvo que se indique lo contrario.*');
	else if (p.operacion !== 'vacacional') partes.push('*El precio no incluye gastos de escrituración ni timbres fiscales.*');
	return partes.filter(Boolean).join('\n\n');
}
