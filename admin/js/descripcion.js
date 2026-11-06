// Arma la descripción de una propiedad con la plantilla de la casa:
// párrafo de ubicación + secciones con viñetas (Características, Amenidades, Detalles técnicos,
// Términos) y la nota de lo que no incluye el precio. Sin precio en el texto (ya sale en la ficha).
// En la web va sin emojis; conEmojis() los agrega para Meta (Facebook, Instagram, WhatsApp).

const TIPO = { casa: 'Casa', apartamento: 'Apartamento', terreno: 'Terreno', oficina: 'Oficina', local: 'Local comercial', bodega: 'Bodega', finca: 'Finca' };
const OPERACION = { venta: 'en venta', renta: 'en alquiler', vacacional: 'para vacacionar' };
const TITULOS = ['Características de la propiedad', 'Amenidades', 'Detalles técnicos', 'Términos del alquiler', 'Para tu estadía'];

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

const num = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const plural = (n, uno, varios) => `${num(n)} ${Number(n) === 1 ? uno : varios}`;

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

function introduccion(p) {
	const tipo = TIPO[p.tipo] || 'Propiedad';
	const donde = [p.direccion, p.zona, p.ciudad].map((x) => String(x || '').trim()).filter(Boolean);
	const lugar = donde.length ? ` en ${donde.join(', ')}` : '';
	const gancho = [];
	if (p.habitaciones) gancho.push(plural(p.habitaciones, 'habitación', 'habitaciones'));
	if (p.m2Construccion) gancho.push(`${num(p.m2Construccion)} m² de construcción`);
	const extra = (p.amenidades || []).slice(0, 2).map((a) => a.toLowerCase());
	let txt = `${tipo} ${OPERACION[p.operacion] || ''}${lugar}`.replace(/\s+/g, ' ').trim();
	if (gancho.length) txt += `, con ${gancho.join(' y ')}`;
	txt += '.';
	if (extra.length) txt += ` Cuenta con ${extra.join(' y ')}.`;
	return txt;
}

const seccion = (titulo, items) => (items.length ? `**${titulo}**\n${items.map((i) => `- ${i}`).join('\n')}` : '');

export function generarDescripcion(p = {}) {
	const partes = [textoBase(p.descripcion) || introduccion(p)];
	const v = p.vacacional || {};

	const carac = [];
	if (p.habitaciones) carac.push(`${plural(p.habitaciones, 'habitación', 'habitaciones')}`);
	if (p.banos) carac.push(`${plural(p.banos, 'baño', 'baños')}`);
	if (p.parqueos) carac.push(`${plural(p.parqueos, 'parqueo', 'parqueos')}`);
	if (p.operacion === 'vacacional' && v.huespedesMax) carac.push(`Hasta ${plural(v.huespedesMax, 'huésped', 'huéspedes')}`);
	partes.push(seccion('Características de la propiedad', carac));

	partes.push(seccion('Amenidades', (p.amenidades || []).filter(Boolean)));

	const tec = [];
	if (p.m2Construccion) tec.push(`Construcción: ${num(p.m2Construccion)} m²`);
	if (p.m2Terreno) tec.push(`Terreno: ${num(p.m2Terreno)} m²`);
	if (p.tipo) tec.push(`Tipo: ${TIPO[p.tipo] || p.tipo}`);
	partes.push(seccion('Detalles técnicos', tec));

	if (p.operacion === 'renta') {
		partes.push(seccion('Términos del alquiler', ['Contrato y condiciones a convenir con el asesor', 'Consultá la disponibilidad para agendar tu visita']));
		partes.push('*El precio no incluye servicios, mantenimiento ni impuestos, salvo que se indique lo contrario.*');
	} else if (p.operacion === 'vacacional') {
		const est = [];
		if (v.checkIn) est.push(`Check-in: ${v.checkIn}`);
		if (v.checkOut) est.push(`Check-out: ${v.checkOut}`);
		if (v.nochesMin) est.push(`Estadía mínima: ${plural(v.nochesMin, 'noche', 'noches')}`);
		est.push('Revisá el calendario para ver las fechas disponibles');
		partes.push(seccion('Para tu estadía', est));
	} else {
		partes.push('*El precio no incluye gastos de escrituración ni timbres fiscales.*');
	}

	return partes.filter(Boolean).join('\n\n');
}
