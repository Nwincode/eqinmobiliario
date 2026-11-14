// Qué listados y páginas de aterrizaje existen en el sitio, cuáles se indexan y sus textos automáticos.
// Es lo único que decide estas páginas: el generador (scripts/build.mjs) escribe lo que esto planea, y de aquí
// salen el sitemap, llms.txt, los pares de idioma (hreflang), los enlaces que se esconden por vacíos y los enlaces
// del contenido que apuntan a un listado que no existe (van a su padre).
import { slugify, TIPOS, TIPOS_LANDING, truncate, departamentoDe } from './util.mjs';
import { RUTAS } from './i18n.mjs';
import { dinero } from '../../admin/js/formato.js';
import { sinRepetir, TITULO_MAX } from '../../admin/js/seo-auto.js';

// Una página de zona (zona, zona + operación, zona + tipo + operación) se indexa solo con al menos tantas
// propiedades a la vista; con menos es «poco contenido» para Google. Con menos, la zona sola existe sin indexar
// (sus casas siguen enlazadas desde el listado de arriba) y las otras no se generan.
export const MIN_INDEXABLE = 3;
// La misma regla para tipo y zona: ¿hay suficientes propiedades para que la página se indexe?
export const bastante = (lista) => lista.length >= MIN_INDEXABLE;
// Bloque de precios: necesita al menos tantos precios a la vista en una misma moneda.
export const MIN_PRECIOS = 3;

const OPS = ['venta', 'renta', 'vacacional'];
const op = (p) => p.operacion || 'venta';
const firma = (lista) => lista.map((p) => p.id).sort().join(',');
// Rutas de una zona que chocarían con las de una operación.
const RESERVADAS = ['venta', 'renta', 'vacacional', 'for-sale', 'for-rent', 'vacation-rentals'];
export const slugZona = (nombre) => {
	const s = slugify(nombre);
	return RESERVADAS.includes(s) ? `zona-${s}` : s;
};
// «Casas en venta» / «Houses for sale» y su dirección (/casas-en-venta/, /en/houses-for-sale/).
const OP_TIPO = { venta: ['en venta', 'for sale'], renta: ['en renta', 'for rent'] };
export const nombreTipo = (tipo, operacion, en = false) => {
	const n = TIPOS_LANDING[tipo];
	return en ? `${n.en} ${OP_TIPO[operacion][1]}` : `${n.plural} ${OP_TIPO[operacion][0]}`;
};
const urlTipo = (tipo, operacion, en) => `${en ? '/en' : ''}/${slugify(nombreTipo(tipo, operacion, en))}/`;

// Plan de un idioma. `ocupadas`: direcciones que ya usa una página de contenido.
// Cada entrada: { clave, pagina, url, operacion, tipo, zona, lista, total, indexable }.
// pagina: todas · op · tipo · vip · zona · zonaOp · zonaTipoOp. Solo vienen las páginas que se generan.
export function planListados(props, { lang = 'es', ocupadas = new Set() } = {}) {
	const en = lang === 'en';
	const r = RUTAS[lang];
	const plan = [];
	const add = (e) => {
		const x = { operacion: '', tipo: '', zona: '', ...e, total: e.lista.length, firma: firma(e.lista) };
		x.clave = [x.pagina, x.operacion, x.tipo, x.zona].join('|');
		plan.push(x);
		return x;
	};
	// ¿La lista es idéntica a la de alguna página de arriba que ya existe? Entonces no aporta nada nuevo.
	const repite = (lista, ...padres) => padres.some((pd) => pd && pd.firma === firma(lista));
	const todas = add({ pagina: 'todas', url: r.propiedades, lista: props, indexable: props.length > 0 });
	const porOp = {};
	for (const o of OPS) {
		const lista = props.filter((p) => op(p) === o);
		// Venta y renta siempre tienen su página (enlaces de siempre); la vacacional solo si hay alguna casa.
		if (o === 'vacacional' && !lista.length) continue;
		porOp[o] = add({ pagina: 'op', operacion: o, url: r[o], lista, indexable: lista.length > 0 });
	}
	add({ pagina: 'vip', url: r.vip, lista: props.filter((p) => p.vip), indexable: props.some((p) => p.vip) });
	const porTipo = {};
	for (const o of ['venta', 'renta']) {
		for (const tipo of Object.keys(TIPOS_LANDING)) {
			const lista = props.filter((p) => op(p) === o && p.tipo === tipo);
			const url = urlTipo(tipo, o, en);
			if (!lista.length || repite(lista, porOp[o]) || ocupadas.has(url)) continue;
			porTipo[`${o}|${tipo}`] = add({ pagina: 'tipo', operacion: o, tipo, url, lista, indexable: bastante(lista) });
		}
	}
	const zonas = [...new Set(props.map((p) => p.zona).filter(Boolean))];
	for (const nombre of zonas) {
		const slug = slugZona(nombre);
		if (!slug) continue;
		const deZona = props.filter((p) => p.zona === nombre);
		const zona = repite(deZona, todas) ? null
			: add({ pagina: 'zona', zona: nombre, slug, url: `${r.propiedades}${slug}/`, lista: deZona, indexable: bastante(deZona) });
		for (const o of OPS) {
			const lista = deZona.filter((p) => op(p) === o);
			const zOp = bastante(lista) && !repite(lista, zona, porOp[o])
				? add({ pagina: 'zonaOp', operacion: o, zona: nombre, slug, url: `${r[o]}${slug}/`, lista, indexable: true }) : null;
			if (o === 'vacacional') continue;
			for (const tipo of Object.keys(TIPOS_LANDING)) {
				const deTipo = lista.filter((p) => p.tipo === tipo);
				const url = `${urlTipo(tipo, o, en)}${slug}/`;
				if (!bastante(deTipo) || repite(deTipo, zOp, zona, porTipo[`${o}|${tipo}`], porOp[o]) || ocupadas.has(url)) continue;
				add({ pagina: 'zonaTipoOp', operacion: o, tipo, zona: nombre, slug, url, lista: deTipo, indexable: true });
			}
		}
	}
	return plan;
}

// Busca una página del plan; null si no se genera.
export const buscar = (plan, pagina, { operacion = '', tipo = '', zona = '' } = {}) =>
	plan.find((e) => e.clave === [pagina, operacion, tipo, zona].join('|')) || null;

// La página más específica que existe para una zona (y operación, y tipo): para migas y enlaces.
export function paginaDeZona(plan, zona, operacion = '', tipo = '') {
	return (tipo && buscar(plan, 'zonaTipoOp', { operacion, tipo, zona }))
		|| (operacion && buscar(plan, 'zonaOp', { operacion, zona }))
		|| buscar(plan, 'zona', { zona });
}

// Páginas de arriba de una del plan (para las migas): propiedades → operación → tipo.
export function padres(plan, e) {
	const todas = buscar(plan, 'todas');
	const deOp = e.operacion && buscar(plan, 'op', { operacion: e.operacion });
	const deTipo = e.tipo && buscar(plan, 'tipo', { operacion: e.operacion, tipo: e.tipo });
	const chain = { todas: [], op: [todas], vip: [todas], tipo: [todas, deOp], zona: [todas], zonaOp: [todas, deOp], zonaTipoOp: [todas, deOp, deTipo] }[e.pagina] || [todas];
	return chain.filter((x) => x && x.total);
}

// Otras zonas con la misma clase de página (misma operación y tipo) que se indexan: para enlazarlas entre sí.
export function zonasHermanas(plan, e, max = 6) {
	return plan.filter((x) => x.pagina === e.pagina && x.operacion === e.operacion && x.tipo === e.tipo && x.zona !== e.zona && x.indexable)
		.sort((a, b) => b.total - a.total || a.zona.localeCompare(b.zona, 'es', { numeric: true }))
		.slice(0, max);
}

// Familias de direcciones de listados y a dónde va una que no existe. /propiedades/zona-16/ sin casas → /propiedades/;
// /casas-en-venta/zona-16/ → /casas-en-venta/ o, si tampoco existe, /propiedades/venta/.
export function familias() {
	const out = [];
	for (const [lang, en] of [['es', false], ['en', true]]) {
		const r = RUTAS[lang];
		for (const o of ['venta', 'renta']) for (const tipo of Object.keys(TIPOS_LANDING)) out.push([urlTipo(tipo, o, en), r[o]]);
		out.push([r.propiedades, r.propiedades]);
	}
	return out;
}

// Enlaces del sitio según el plan de los dos idiomas.
// - resolver(href): un enlace a un listado que no existe o está vacío → el listado padre más cercano que tiene casas.
// - visible(href): false si lleva a un listado vacío o que no existe (el menú, el pie y las pastillas lo esconden).
export function crearEnlaces(...planes) {
	const todas = planes.flat();
	const conCasas = new Set(todas.filter((e) => e.total > 0).map((e) => e.url));
	const vacias = new Set(todas.filter((e) => !e.total).map((e) => e.url));
	const fam = familias();
	const ruta = (href) => {
		const m = /^(\/(?!\/)[^?#]*)(.*)$/.exec(String(href || ''));
		if (!m) return null;
		const path = /\.[a-z0-9]+$/i.test(m[1]) || m[1].endsWith('/') ? m[1] : `${m[1]}/`;
		return { path, resto: m[2] };
	};
	const familia = (path) => fam.find(([pref]) => path.startsWith(pref));
	return {
		resolver(href) {
			const x = ruta(href);
			if (!x || conCasas.has(x.path)) return href;
			const f = familia(x.path);
			if (!f) return href;
			let p = x.path;
			while (p.length > f[0].length) {
				p = p.replace(/[^/]+\/$/, '');
				if (conCasas.has(p)) return p + x.resto;
			}
			const padre = conCasas.has(f[1]) ? f[1] : RUTAS[f[0].startsWith('/en/') ? 'en' : 'es'].propiedades;
			return padre + x.resto;
		},
		visible(href) {
			const x = ruta(href);
			if (!x) return true;
			if (vacias.has(x.path)) return false;
			return !familia(x.path) || conCasas.has(x.path);
		},
		familias: fam
	};
}

// ------------------------------------------------ Números de una lista (precios y habitaciones)

const visiblesConPrecio = (lista) => lista.filter((p) => Number(p.precio) > 0 && !(p.vipLanding && p.vipLanding.ocultarPrecio));
const mediana = (xs) => {
	const s = [...xs].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Precios de una operación en una lista: rango, mediana y (en venta) precio por m². Solo con al menos
// MIN_PRECIOS precios a la vista en una misma moneda; nunca se mezclan monedas: se usa la que más se repite.
// Venta: por m² construido; si es una lista de terrenos, por m² de terreno. Renta: al mes. Vacacional: por noche.
export function estadisticasPrecio(lista, operacion) {
	const conPrecio = visiblesConPrecio(lista.filter((p) => op(p) === operacion));
	const cuenta = {};
	for (const p of conPrecio) cuenta[p.moneda || 'USD'] = (cuenta[p.moneda || 'USD'] || 0) + 1;
	const moneda = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a] || (a === 'USD' ? -1 : 1))[0];
	const deMoneda = conPrecio.filter((p) => (p.moneda || 'USD') === moneda);
	if (deMoneda.length < MIN_PRECIOS) return null;
	const precios = deMoneda.map((p) => Number(p.precio));
	let porM2 = 0;
	if (operacion === 'venta') {
		const terrenos = deMoneda.every((p) => p.tipo === 'terreno');
		const conArea = deMoneda.map((p) => [Number(p.precio), Number(terrenos ? p.m2Terreno : p.tipo === 'terreno' ? 0 : p.m2Construccion)]).filter(([, a]) => a > 0);
		if (conArea.length >= MIN_PRECIOS) porM2 = mediana(conArea.map(([pr, a]) => pr / a));
	}
	return { operacion, moneda, n: deMoneda.length, total: conPrecio.length, min: Math.min(...precios), max: Math.max(...precios), mediana: mediana(precios), porM2 };
}

// «3 propiedades en venta desde US$ 250,000.00 y 2 en renta desde US$ 1,200.00 al mes. De 2 a 5 habitaciones.»
// Solo datos publicados: sin precios ocultos (VIP) y sin mezclar monedas ni precio por noche con venta.
export function resumenInventario(lista, en = false) {
	const partes = [];
	for (const [o, es, eng, cola, tail] of [['venta', 'en venta', 'for sale', '', ''], ['renta', 'en renta', 'for rent', ' al mes', ' a month'], ['vacacional', 'de renta vacacional', 'vacation rentals', ' por noche', ' a night']]) {
		const l = lista.filter((p) => op(p) === o);
		if (!l.length) continue;
		const conPrecio = visiblesConPrecio(l);
		const monedas = new Set(conPrecio.map((p) => p.moneda || 'USD'));
		const desde = monedas.size === 1 ? ` ${en ? 'from' : 'desde'} ${dinero(Math.min(...conPrecio.map((p) => Number(p.precio))), [...monedas][0])}${en ? tail : cola}` : '';
		// El sustantivo solo en la primera parte: «2 propiedades en venta… y 1 en renta…».
		const que = en ? (o === 'vacacional' ? (l.length === 1 ? 'vacation rental' : eng) : `${partes.length ? '' : l.length === 1 ? 'property ' : 'properties '}${eng}`)
			: `${partes.length ? '' : l.length === 1 ? 'propiedad ' : 'propiedades '}${es}`;
		partes.push(`${l.length} ${que}${desde}`);
	}
	if (!partes.length) return '';
	const y = en ? ' and ' : ' y ';
	return `${partes.length > 1 ? `${partes.slice(0, -1).join(', ')}${y}${partes[partes.length - 1]}` : partes[0]}.${habitaciones(lista, en)}`;
}

function habitaciones(lista, en) {
	const hab = lista.map((p) => Number(p.habitaciones)).filter((h) => h > 0);
	if (!hab.length) return '';
	const [min, max] = [Math.min(...hab), Math.max(...hab)];
	if (min !== max) return en ? ` ${min} to ${max} bedrooms.` : ` De ${min} a ${max} habitaciones.`;
	return en ? ` ${min} bedroom${min === 1 ? '' : 's'}.` : ` ${min} habitaci${min === 1 ? 'ón' : 'ones'}.`;
}

// El tipo que es más de la mitad de la lista (para decir «Casas en venta…» en vez de «Propiedades…»).
export function tipoDominante(lista) {
	const cuenta = {};
	for (const p of lista) cuenta[p.tipo] = (cuenta[p.tipo] || 0) + 1;
	const [tipo, n] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0] || [];
	return tipo && TIPOS_LANDING[tipo] && n > lista.length / 2 ? tipo : '';
}

// ------------------------------------------------ Textos automáticos de las páginas de zona y de tipo

// Cierres para que la descripción no termine igual en todas las páginas: uno por página, siempre el mismo.
const CIERRES = {
	es: {
		venta: ['Agenda tu visita presencial o por videollamada.', 'Te acompañamos en el financiamiento y la escritura.', 'Fotos y precios verificados, con asesoría.'],
		renta: ['Agenda tu visita y conoce las condiciones del contrato.', 'Contratos claros y un asesor que te acompaña.', 'Fotos y precios al mes, sin sorpresas.'],
		vacacional: ['Elige tus fechas y solicita tu reserva.', 'Revisa la disponibilidad y reserva en línea.', 'Precios por noche y calendario al día.'],
		'': ['Agenda tu visita presencial o por videollamada.', 'Te ayudamos a comparar y elegir.', 'Fotos, precios y asesoría personalizada.']
	},
	en: {
		venta: ['Live video tours for buyers in the US.', 'English-speaking support from offer to closing.', 'Verified listings with photos and prices.'],
		renta: ['Schedule a tour and review the lease terms.', 'Clear contracts and an English-speaking contact.', 'Photos and monthly prices, no surprises.'],
		vacacional: ['Pick your dates and request your booking.', 'Check availability and book online.', 'Nightly prices and an up-to-date calendar.'],
		'': ['Live video tours for buyers in the US.', 'English-speaking support from offer to closing.', 'Photos, prices and personal advice.']
	}
};
const cierre = (url, lang, o) => {
	const lista = CIERRES[lang][o] || CIERRES[lang][''];
	let h = 0;
	for (const c of url) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return lista[h % lista.length];
};
const recorte = (txt, max) => truncate(txt, max);
// El primer título que cabe con el nombre del sitio; si ninguno cabe, el más corto sin el nombre.
const tituloCorto = (nombre, ...c) => c.map((t) => `${t} | ${nombre}`).find((t) => t.length <= TITULO_MAX) || c.find((t) => t.length <= TITULO_MAX) || recorte(c[c.length - 1], TITULO_MAX);

// Dónde queda: «Zona 16, Guatemala»; «Km 25.5 Carretera a El Salvador, Villa Canales»; «Monterrico, Santa Rosa»
// (un lugar de otro departamento lleva su departamento); en inglés, la capital es «Guatemala City».
function lugarZona(zona, lista, en) {
	const dep = departamentoDe({ zona });
	if (dep && dep !== 'Guatemala') return sinRepetir([zona, dep]).join(', ');
	const ciudades = [...new Set(lista.map((p) => String(p.ciudad || '').trim()).filter(Boolean))];
	const capital = ciudades.length === 1 && /^(ciudad de )?guatemala( city)?$/i.test(ciudades[0]);
	const ciudad = ciudades.length === 1 && !capital ? ciudades[0] : en && capital ? 'Guatemala City' : 'Guatemala';
	return sinRepetir([zona, ciudad]).join(', ');
}

// Sustantivo de la lista: el tipo dominante o «propiedades». `dominante` = '' para no usarlo.
function sustantivo(lista, tipo, en, plural = true, dominante = tipoDominante(lista)) {
	const t = tipo || dominante;
	if (!t) return en ? (plural ? 'Properties' : 'Property') : plural ? 'Propiedades' : 'Propiedad';
	const n = TIPOS_LANDING[t];
	return en ? (plural ? n.en : n.enN[0].replace(/^./, (c) => c.toUpperCase())) : plural ? n.plural : TIPOS[t];
}
// Para contar: «4 casas», «1 terreno»; en inglés «2 lots», no «2 land».
function contable(lista, tipo, en, n, dominante = tipoDominante(lista)) {
	const t = tipo || dominante;
	if (en && t) return TIPOS_LANDING[t].enN[n === 1 ? 0 : 1];
	return sustantivo(lista, tipo, en, n !== 1, dominante).toLowerCase();
}
// Descripción de 70 a 155: el dato propio de la página y uno o dos cierres si caben.
function conCierre(desc, url, lang, o) {
	const lista = CIERRES[lang][o] || CIERRES[lang][''];
	let out = desc;
	for (let i = 0, k = lista.indexOf(cierre(url, lang, o)); i < lista.length && out.length < 100; i++) {
		const c = lista[(k + i) % lista.length];
		if (`${out} ${c}`.length <= 155) out = `${out} ${c}`;
	}
	return recorte(out, 155);
}
const FRASE_OP = { es: { venta: 'en venta', renta: 'en renta', vacacional: 'en renta vacacional' }, en: { venta: 'for sale', renta: 'for rent', vacacional: 'vacation rentals' } };

// Dato que distingue a la página en su descripción: el precio mediano (o desde) y el precio por m².
function datoPrecio(s, en) {
	// Solo si todos los precios a la vista son de esa moneda: el dato no deja fuera a nadie.
	if (!s || s.n !== s.total) return '';
	const unidad = { renta: en ? ' a month' : ' al mes', vacacional: en ? ' a night' : ' por noche' }[s.operacion] || '';
	const m2 = s.porM2 ? (en ? `, ${dinero(Math.round(s.porM2), s.moneda)}/m²` : `, ${dinero(Math.round(s.porM2), s.moneda)} por m²`) : '';
	return en ? `: median price ${dinero(s.mediana, s.moneda)}${unidad}${m2}` : `: precio mediano ${dinero(s.mediana, s.moneda)}${unidad}${m2}`;
}

// Sin estadísticas (menos de MIN_PRECIOS precios): «desde» el menor, si todos están en una moneda.
function datoDesde(lista, o, en) {
	const c = visiblesConPrecio(lista.filter((p) => op(p) === o));
	if (!c.length || new Set(c.map((p) => p.moneda || 'USD')).size > 1) return '';
	const unidad = { renta: en ? ' a month' : ' al mes', vacacional: en ? ' a night' : ' por noche' }[o] || '';
	return ` ${en ? 'from' : 'desde'} ${dinero(Math.min(...c.map((p) => Number(p.precio))), c[0].moneda || 'USD')}${unidad}`;
}

// Textos de una página de tipo o de zona del plan: { heading, title, description, intro, precios }.
// Lo que se edita en el panel (Contenido del sitio → Zonas, y Listados) siempre gana sobre esto.
export function textosListado(e, { nombre, lang = 'es', plan = [] }) {
	const en = lang === 'en';
	const lista = e.lista;
	const n = lista.length;
	const ops = [...new Set(lista.map(op))];
	const o = e.operacion || (ops.length === 1 ? ops[0] : '');
	const precios = (o ? [o] : OPS).map((x) => estadisticasPrecio(lista, x)).filter(Boolean);
	const resumen = resumenInventario(lista, en);
	const fraseOp = o ? FRASE_OP[lang][o] : '';
	if (e.pagina === 'tipo') {
		const heading = `${nombreTipo(e.tipo, o, en)} ${en ? 'in' : 'en'} Guatemala`;
		const desc = `${n} ${contable(lista, e.tipo, en, n)} ${fraseOp} ${en ? 'in' : 'en'} Guatemala${datoPrecio(precios[0], en) || datoDesde(lista, o, en)}.${habitaciones(lista, en)}`;
		return {
			heading, precios,
			title: tituloCorto(nombre, heading, nombreTipo(e.tipo, o, en)),
			description: conCierre(desc, e.url, lang, o),
			intro: `${resumen} ${en ? "Can't find what you need? Tell us and we'll send you options that aren't listed yet." : 'Si no encuentras lo que buscas, déjanos tus datos y te enviamos opciones que aún no están publicadas.'}`
		};
	}
	const lugar = lugarZona(e.zona, lista, en);
	// «Casas en venta en Zona 16» es de la página de ese tipo si existe: la zona dice «Propiedades…» (dos páginas
	// con el mismo título compiten entre sí en Google).
	const dom = tipoDominante(lista);
	const dominante = dom && o && o !== 'vacacional' && e.pagina !== 'zonaTipoOp' && buscar(plan, 'zonaTipoOp', { operacion: o, tipo: dom, zona: e.zona }) ? '' : dom;
	// Solo casas por noche: «Renta vacacional en Monterrico».
	const heading = o === 'vacacional'
		? (en ? `Vacation rentals in ${e.zona}` : `Renta vacacional en ${e.zona}`)
		: [sustantivo(lista, e.tipo, en, true, dominante), fraseOp, en ? 'in' : 'en', e.zona].filter(Boolean).join(' ');
	const cuantos = o === 'vacacional'
		? (en ? `${n} ${n === 1 ? 'vacation rental' : 'vacation rentals'}` : `${n} ${n === 1 ? 'alojamiento' : 'alojamientos'} por noche`)
		: `${n} ${contable(lista, e.tipo, en, n, dominante)}${fraseOp ? ` ${fraseOp}` : ''}`;
	const masDe = !o && ops.length > 1 ? ` (${ops.map((x) => FRASE_OP[lang][x]).join(en ? ', ' : ', ')})` : '';
	const desc = `${cuantos}${masDe} ${en ? 'in' : 'en'} ${lugar}${o ? datoPrecio(precios[0], en) || datoDesde(lista, o, en) : ''}.${habitaciones(lista, en)}`;
	return {
		heading, precios,
		title: tituloCorto(nombre, ...(lugar === e.zona ? [] : [`${heading}, ${lugar.slice(lugar.indexOf(', ') + 2)}`]), heading),
		description: conCierre(desc, e.url, lang, o),
		intro: `${resumen} ${o === 'vacacional' ? (en ? 'Pick your dates to see what is available.' : 'Elige tus fechas para ver cuáles están disponibles.')
			: en ? "Can't find what you need? Tell us and we'll send you options that aren't listed yet." : 'Si no encuentras lo que buscas, déjanos tus datos y te enviamos opciones que aún no están publicadas.'}`
	};
}
