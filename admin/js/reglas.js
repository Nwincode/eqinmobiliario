// Herramientas del asesor que funcionan sin IA: reglas, plantillas y un diccionario.
// Devuelven lo mismo que devolvía la IA, para que las vistas no cambien.
import { M2_A_FT2, dinero, decimales } from './formato.js';
import { enOperacion, operacionHashtag } from './estados.js';

const TC = 7.7; // 1 US$ ≈ 7.7 Q
const TIPOS = ['casa', 'apartamento', 'terreno', 'oficina', 'local', 'bodega', 'finca'];
const TIPO_ES = { casa: 'Casa', apartamento: 'Apartamento', terreno: 'Terreno', oficina: 'Oficina', local: 'Local comercial', bodega: 'Bodega', finca: 'Finca' };
const TIPO_EN = { casa: 'House', apartamento: 'Apartment', terreno: 'Lot', oficina: 'Office', local: 'Retail space', bodega: 'Warehouse', finca: 'Farm' };

// Palabras con que la gente pide cada tipo.
const SINONIMOS_TIPO = {
	casa: ['casa', 'casas', 'house', 'home', 'chalet'],
	apartamento: ['apartamento', 'apartamentos', 'apto', 'aptos', 'depto', 'departamento', 'apartment', 'condo', 'penthouse', 'loft'],
	terreno: ['terreno', 'terrenos', 'lote', 'lotes', 'lot', 'land'],
	oficina: ['oficina', 'oficinas', 'office'],
	local: ['local', 'locales', 'comercial', 'retail'],
	bodega: ['bodega', 'bodegas', 'galera', 'warehouse'],
	finca: ['finca', 'fincas', 'farm', 'rancho']
};

const sinAcentos = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const n = (v) => Number(v) || 0;
const fmt = (v, moneda) => dinero(n(v), moneda === 'GTQ' ? 'GTQ' : 'USD');
const enUSD = (precio, moneda) => (moneda === 'GTQ' ? n(precio) / TC : n(precio));
const unir = (arr, y = 'y') => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} ${y} ${arr[arr.length - 1]}`);
const plural = (c, uno, varios) => `${c} ${c === 1 ? uno : varios}`;
// ¿El texto `a` ya nombra a `b`? Compara sin acentos y por palabras completas ("zona 1" no es "zona 10").
const nombra = (a, b) => new RegExp(`(^|[^a-z0-9])${sinAcentos(b).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(sinAcentos(a));
// Quita las partes que otra ya dice ("Vista Hermosa, zona 15" + "Zona 15" → solo la primera).
const sinRepetir = (partes) => partes.filter(Boolean).filter((x, i, a) => !a.some((y, j) => j !== i && nombra(y, x) && (j < i || !nombra(x, y))));
const lugar = (p) => sinRepetir([p.direccion, p.zona, p.ciudad]).join(', ');
const url = (p) => (p.slug ? `${location.origin}/propiedad/${p.slug}/` : location.origin);

// ------------------------------------------------------------ Leer un pedido escrito

// Convierte "350 mil", "1.2 millones", "Q 2,500,000", "$300k" en número.
function leerMonto(txt) {
	const m = txt.match(/(\d+(?:[.,]\d+)*)\s*(millones|millon|mil|mm|k|m\b)?/);
	if (!m) return 0;
	let num = m[1];
	// "1,200,000" o "1.200.000" → miles; "1.5" → decimal.
	if (/^\d{1,3}([.,]\d{3})+$/.test(num)) num = num.replace(/[.,]/g, '');
	else num = num.replace(',', '.');
	let v = parseFloat(num);
	const mult = m[2];
	if (mult === 'k' || mult === 'mil') v *= 1000;
	else if (mult) v *= 1000000;
	return v;
}

// Saca del texto los criterios de búsqueda.
export function leerPedido(texto, { zonas = [], tipos = TIPOS } = {}) {
	const t = sinAcentos(texto);
	const criterios = { operacion: 'cualquiera', tipos: [], zonas: [], presupuestoMaximo: 0, presupuestoMinimo: 0, moneda: 'USD', habitacionesMinimas: 0, otros: [] };

	if (/\b(rent|renta|rentar|alquiler|alquilar|arrendar|arrendamiento|for rent)\b/.test(t)) criterios.operacion = 'renta';
	else if (/\b(venta|vender|comprar|compra|buy|for sale|sale)\b/.test(t)) criterios.operacion = 'venta';

	for (const tipo of tipos) {
		const pals = SINONIMOS_TIPO[tipo] || [tipo];
		if (pals.some((w) => new RegExp(`\\b${w}\\b`).test(t))) criterios.tipos.push(tipo);
	}

	// Zonas: "zona 15 o 16", "z.10", "zonas 14, 15 y 16", o un nombre de la lista (p. ej. "Carretera a El Salvador").
	const nums = new Set();
	for (const m of t.matchAll(/\b(?:zonas?|z\.?)\s*((?:\d{1,2}(?!\d|\s*(?:hab|cuart|rec|dorm|bed|ban|parq|carr|m2|mts|metro|mil|k\b))(?:\s*(?:,|y|o|and|or|\/|-)\s*)?)+)/g)) {
		for (const d of m[1].match(/\d{1,2}/g) || []) nums.add(Number(d));
	}
	const zonasNorm = zonas.map((z) => [z, sinAcentos(z)]);
	for (const num of nums) {
		const hit = zonasNorm.find(([, zn]) => new RegExp(`\\bzona\\s*${num}\\b`).test(zn));
		criterios.zonas.push(hit ? hit[0] : `Zona ${num}`);
	}
	for (const [z, zn] of zonasNorm) {
		if (!/^zona\s*\d+$/.test(zn) && zn.length > 3 && t.includes(zn) && !criterios.zonas.includes(z)) criterios.zonas.push(z);
	}

	// Habitaciones: "3 habitaciones", "3 cuartos", "3 recámaras", "3 dormitorios", "3 bedrooms", "3br".
	const hab = t.match(/(\d+)\s*(?:\+\s*)?(?:habitacion|habitaciones|hab\b|cuartos?|recamaras?|dormitorios?|bedrooms?|beds?|br\b)/);
	if (hab) criterios.habitacionesMinimas = Math.min(10, Number(hab[1]));

	// Presupuesto: busca montos con moneda o con palabras como "hasta", "presupuesto", "máximo".
	const quetzal = /\bq\s*\d|quetzal/.test(t);
	criterios.moneda = quetzal ? 'GTQ' : 'USD';
	const topes = [...t.matchAll(/(?:hasta|maximo|max|presupuesto(?:\s+de)?|no mas de|menos de|under|up to|budget(?: of)?|tope)\s*(?:de\s*)?(?:us\s*\$|usd|\$|q\.?)?\s*(\d[\d.,]*\s*(?:millones|millon|mil|mm|k|m\b)?)/g)];
	const pisos = [...t.matchAll(/(?:desde|minimo|min|mas de|from|at least)\s*(?:us\s*\$|usd|\$|q\.?)?\s*(\d[\d.,]*\s*(?:millones|millon|mil|mm|k|m\b)?)/g)];
	const sueltos = [...t.matchAll(/(?:us\s*\$|usd|\$|\bq\.?)\s*(\d[\d.,]*\s*(?:millones|millon|mil|mm|k|m\b)?)|(\d[\d.,]*\s*(?:millones|millon|mil|mm|k)\b)\s*(?:de\s*)?(?:dolares|usd|quetzales)?/g)];
	const monto = (arr) => arr.map((m) => leerMonto(m[1] || m[2] || '')).filter((v) => v >= 100);
	const max = monto(topes)[0] || 0;
	const min = monto(pisos)[0] || 0;
	criterios.presupuestoMaximo = max || (!min ? monto(sueltos).sort((a, b) => b - a)[0] || 0 : 0);
	criterios.presupuestoMinimo = min && min !== criterios.presupuestoMaximo ? min : 0;

	const EXTRAS = [
		[/parqueo|garage|garaje|carros?\b|parking/, 'parqueos'], [/jardin|garden|patio/, 'jardín'], [/piscina|pool/, 'piscina'],
		[/mascota|perro|gato|pet/, 'acepta mascotas'], [/amueblad|furnished/, 'amueblado'], [/seguridad|garita|security|gated/, 'seguridad'],
		[/terraza|balcon/, 'terraza'], [/vista|view/, 'vista'], [/estudio|study/, 'estudio'], [/gimnasio|gym/, 'gimnasio']
	];
	for (const [re, label] of EXTRAS) if (re.test(t)) criterios.otros.push(label);
	const parq = t.match(/(\d+)\s*(?:parqueos?|carros?|estacionamientos?|parking)/);
	if (parq) criterios.parqueosMinimos = Number(parq[1]);

	const partes = [
		criterios.tipos.length ? unir(criterios.tipos.map((x) => TIPO_ES[x] || x), 'o') : 'Propiedad',
		criterios.operacion !== 'cualquiera' ? `en ${criterios.operacion}` : '',
		criterios.zonas.length ? `en ${unir(criterios.zonas, 'o')}` : '',
		criterios.habitacionesMinimas ? `con ${criterios.habitacionesMinimas}+ habitaciones` : '',
		criterios.presupuestoMaximo ? `hasta ${fmt(criterios.presupuestoMaximo, criterios.moneda)}` : '',
		criterios.presupuestoMinimo ? `desde ${fmt(criterios.presupuestoMinimo, criterios.moneda)}` : ''
	];
	criterios.resumen = partes.filter(Boolean).join(' ');
	return criterios;
}

// ------------------------------------------------------------ Comparar una propiedad con un pedido

// (En una casa por noche, las mascotas se dicen en su selector, no como amenidad.)
const textoProp = (p) => sinAcentos([p.titulo, p.descripcion, (p.amenidades || []).join(' '), p.vacacional?.mascotas === 'si' ? 'acepta mascotas' : ''].join(' '));
const zonaCoincide = (p, zonas) => {
	if (!zonas.length) return true;
	const pz = sinAcentos(`${p.zona} ${p.direccion} ${p.ciudad}`);
	return zonas.some((z) => {
		const zn = sinAcentos(z);
		const num = zn.match(/^zona\s*(\d+)$/);
		return num ? new RegExp(`\\bzona\\s*${num[1]}\\b`).test(pz) : pz.includes(zn);
	});
};

export function evaluar(p, c) {
	let puntaje = 100;
	const cumple = [];
	const falla = [];
	if (c.operacion && c.operacion !== 'cualquiera' && p.operacion !== c.operacion) return null;
	if (c.tipos?.length) {
		if (!c.tipos.includes(p.tipo)) return null;
		cumple.push(TIPO_ES[p.tipo] || p.tipo);
	}
	if (c.zonas?.length) {
		if (zonaCoincide(p, c.zonas)) cumple.push(p.zona);
		else { puntaje -= 35; falla.push(`está en ${p.zona || 'otra zona'}`); }
	}
	if (c.presupuestoMaximo) {
		const tope = enUSD(c.presupuestoMaximo, c.moneda);
		const precio = enUSD(p.precio, p.moneda);
		if (precio && precio <= tope) cumple.push('dentro del presupuesto');
		else if (precio) {
			const exceso = (precio - tope) / tope;
			if (exceso > 0.25) return null;
			puntaje -= Math.round(20 + exceso * 120);
			falla.push(`excede el presupuesto en ${fmt(p.moneda === 'GTQ' ? (precio - tope) * TC : precio - tope, p.moneda)}`);
		}
	}
	if (c.presupuestoMinimo && enUSD(p.precio, p.moneda) < enUSD(c.presupuestoMinimo, c.moneda) * 0.7) puntaje -= 15;
	if (c.habitacionesMinimas) {
		if (n(p.habitaciones) >= c.habitacionesMinimas) cumple.push(plural(n(p.habitaciones), 'habitación', 'habitaciones'));
		else if (n(p.habitaciones)) { puntaje -= 25 * (c.habitacionesMinimas - n(p.habitaciones)); falla.push(`tiene ${plural(n(p.habitaciones), 'habitación', 'habitaciones')}`); }
		else puntaje -= 10;
	}
	if (c.parqueosMinimos && n(p.parqueos) && n(p.parqueos) < c.parqueosMinimos) { puntaje -= 10; falla.push(`tiene ${plural(n(p.parqueos), 'parqueo', 'parqueos')}`); }
	const tp = textoProp(p);
	const CLAVES = { jardín: /jardin|garden/, piscina: /piscina|pool/, 'acepta mascotas': /mascota|pet/, amueblado: /amueblad|furnished/, seguridad: /seguridad|garita|security/, terraza: /terraza|balcon/, vista: /vista|view/, estudio: /estudio|study/, gimnasio: /gimnasio|gym/ };
	for (const o of c.otros || []) {
		if (o === 'parqueos') continue;
		if (CLAVES[o]?.test(tp)) cumple.push(o);
		else { puntaje -= 5; falla.push(`no se indica ${o}`); }
	}
	if (p.estado === 'reservada') { puntaje -= 15; falla.push('está reservada'); }
	return { puntaje: Math.max(5, Math.min(100, puntaje)), motivo: cumple.length ? `Cumple: ${unir(cumple)}.` : 'Encaja con lo que busca.', diferencias: falla.length ? `Ojo: ${unir(falla)}.` : '' };
}

const lineaProp = (p) => `• ${p.titulo} — ${fmt(p.precio, p.moneda)}${p.operacion === 'renta' ? '/mes' : ''}\n${url(p)}`;

function buscar({ texto, inventario = [] }) {
	const zonas = [...new Set(inventario.map((p) => p.zona).filter(Boolean))];
	const criterios = leerPedido(texto, { zonas });
	const resultados = inventario.map((p) => ({ p, r: evaluar(p, criterios) }))
		.filter((x) => x.r && x.r.puntaje >= 35)
		.sort((a, b) => b.r.puntaje - a.r.puntaje || (b.p.destacada ? 1 : 0) - (a.p.destacada ? 1 : 0))
		.slice(0, 8)
		.map(({ p, r }) => ({ id: p.id, ...r }));
	const preguntas = [];
	if (criterios.operacion === 'cualquiera') preguntas.push('¿La busca para comprar o para rentar?');
	if (!criterios.zonas.length) preguntas.push('¿En qué zonas o sectores le gustaría?');
	if (!criterios.presupuestoMaximo) preguntas.push('¿Cuál es su presupuesto aproximado?');
	if (!criterios.habitacionesMinimas && !criterios.tipos.some((x) => ['terreno', 'oficina', 'local', 'bodega'].includes(x))) preguntas.push('¿Cuántas habitaciones necesita?');
	if (!criterios.tipos.length) preguntas.push('¿Busca casa, apartamento u otro tipo de inmueble?');
	const top = resultados.slice(0, 3).map((r) => inventario.find((p) => p.id === r.id));
	const mensajeCliente = top.length
		? `Buen día. Según lo que me comentó, le comparto ${top.length === 1 ? 'una opción' : `${top.length} opciones`} que le pueden interesar:\n\n${top.map(lineaProp).join('\n\n')}\n\n¿Le gustaría agendar una visita para conocer alguna?`
		: `Buen día. Gracias por contarme lo que busca. En este momento estoy revisando opciones que se ajusten a lo que busca (${criterios.resumen.charAt(0).toLowerCase()}${criterios.resumen.slice(1)}). ${preguntas[0] || '¿Hay algo más que deba tomar en cuenta?'}`;
	return { criterios, resultados, preguntas, mensajeCliente };
}

// ------------------------------------------------------------ Seguimiento de un lead

function seguimiento({ lead, propiedad, inventario = [] }) {
	const dias = lead.diasDesdeQueEscribio;
	const notas = lead.notas || [];
	const estado = lead.estado || 'nuevo';
	const nombre = String(lead.nombre || '').split(' ')[0] || '';
	const disponible = propiedad && ['disponible', 'proximamente'].includes(propiedad.estado);
	let temperatura = 'tibio';
	if (['visita', 'negociacion', 'oferta'].some((x) => estado.includes(x)) || (dias !== null && dias <= 2)) temperatura = 'caliente';
	else if ((dias !== null && dias > 14 && !notas.length) || dias > 45) temperatura = 'frio';

	const siguientePaso = {
		caliente: 'Llamarlo hoy y proponerle dos horarios de visita concretos.',
		tibio: notas.length ? 'Escribirle hoy por WhatsApp con una novedad o una opción parecida y proponer visita.' : 'Hacer el primer contacto hoy: confirmar qué busca, presupuesto y cuándo puede visitar.',
		frio: 'Mandarle un mensaje corto para retomar; si no responde en una semana, marcarlo como descartado.'
	}[temperatura];

	const sugeridas = [];
	if (propiedad) {
		const c = { operacion: propiedad.operacion, tipos: [propiedad.tipo], zonas: propiedad.zona ? [propiedad.zona] : [], presupuestoMaximo: n(propiedad.precio) * 1.15, moneda: propiedad.moneda, habitacionesMinimas: 0, otros: [] };
		inventario.filter((p) => p.id !== propiedad.id).map((p) => ({ p, r: evaluar(p, c) })).filter((x) => x.r && x.r.puntaje >= 60)
			.sort((a, b) => b.r.puntaje - a.r.puntaje).slice(0, 3)
			.forEach(({ p }) => sugeridas.push({ id: p.id, motivo: `Parecida: ${TIPO_ES[p.tipo] || p.tipo} en ${p.zona}, ${fmt(p.precio, p.moneda)}.` }));
	}

	const saludo = `Hola${nombre ? ` ${nombre}` : ''}, le saluda su asesor de Equipo Inmobiliario.`;
	let cuerpo;
	if (propiedad && !disponible) cuerpo = `La propiedad por la que preguntó (${propiedad.titulo}) ya no está disponible, pero tengo opciones parecidas que le pueden interesar.`;
	else if (propiedad) cuerpo = `Le escribo por ${propiedad.titulo}. Sigue disponible y con gusto le cuento más detalles.\n${url(propiedad)}`;
	else cuerpo = 'Le escribo para darle seguimiento a su consulta y ayudarle a encontrar la propiedad que busca.';
	const cierre = temperatura === 'frio' ? '¿Sigue buscando o ya encontró lo que necesitaba?' : '¿Le queda bien visitarla esta semana?';
	const mensajeWhatsApp = `${saludo}\n${cuerpo}\n${cierre}`;
	const correoAsunto = propiedad ? `Seguimiento: ${propiedad.titulo}` : 'Seguimiento a su consulta';
	const correoCuerpo = `Buen día${nombre ? ` ${nombre}` : ''}:\n\n${cuerpo}\n\n${cierre}\n\nQuedo atento a sus comentarios.\n\nSaludos cordiales,\nEquipo Inmobiliario`;
	const resumen = `${lead.nombre || 'El cliente'} escribió${dias !== null ? ` hace ${plural(dias, 'día', 'días')}` : ''}${lead.propiedad ? ` por ${lead.propiedad}` : ''}${lead.origen ? ` (desde ${lead.origen})` : ''}. Estado: ${estado}${notas.length ? `, con ${plural(notas.length, 'nota', 'notas')}` : ', sin notas todavía'}.`;
	return { resumen, temperatura, siguientePaso, mensajeWhatsApp, correoAsunto, correoCuerpo, propiedadesSugeridas: sugeridas };
}

// ------------------------------------------------------------ Clientes que buscan algo parecido

function coincidencias({ propiedad: p, requerimientos = [] }) {
	const lista = requerimientos.map((req) => {
		const c = req.criterios && Object.keys(req.criterios).length ? { ...leerPedido(req.texto || ''), ...req.criterios } : leerPedido(req.texto || '');
		const r = evaluar(p, c);
		if (!r || r.puntaje < 50) return null;
		const nombre = String(req.cliente || '').split(' ')[0];
		return {
			id: req.id, puntaje: r.puntaje, motivo: [r.motivo, r.diferencias].filter(Boolean).join(' '),
			mensajeWhatsApp: `Hola${nombre ? ` ${nombre}` : ''}, acaba de entrar una propiedad que se parece a lo que me pidió:\n${p.titulo} — ${fmt(p.precio, p.moneda)}${p.operacion === 'renta' ? '/mes' : ''}\n${url(p)}\n¿Le gustaría verla?`
		};
	}).filter(Boolean).sort((a, b) => b.puntaje - a.puntaje).slice(0, 10);
	return { coincidencias: lista };
}

// ------------------------------------------------------------ Redactar la ficha con plantillas

function datosClave(p) {
	const d = [];
	if (n(p.habitaciones)) d.push(plural(n(p.habitaciones), 'habitación', 'habitaciones'));
	if (n(p.banos)) d.push(plural(n(p.banos), 'baño', 'baños'));
	if (n(p.parqueos)) d.push(plural(n(p.parqueos), 'parqueo', 'parqueos'));
	if (n(p.m2Construccion)) d.push(`${n(p.m2Construccion)} m² de construcción`);
	if (n(p.m2Terreno)) d.push(`${n(p.m2Terreno)} m² de terreno`);
	return d;
}

function descripcion({ propiedad: p, notas = '' }) {
	const tipo = TIPO_ES[p.tipo] || 'Propiedad';
	const op = enOperacion(p);
	const donde = lugar(p);
	const d = datosClave(p);
	const amen = [...new Set([...(p.amenidades || []), ...amenidadesDe(notas)])];
	const titulo = `${tipo} ${op} en ${sinRepetir([p.direccion, p.zona]).join(', ') || p.ciudad || 'Guatemala'}`.slice(0, 70);
	const parrafos = [
		`${tipo} ${op} ubicada en ${donde || 'Guatemala'}.${d.length ? ` Cuenta con ${unir(d)}.` : ''}`,
		String(notas || '').trim(),
		amen.length ? `**Amenidades:**\n${amen.map((a) => `- ${a}`).join('\n')}` : '',
		`Precio: ${fmt(p.precio, p.moneda)}${p.operacion === 'renta' ? ' al mes' : ''}. Contacte a un asesor para más detalles o para agendar una visita.`
	].filter(Boolean);
	const corto = `${tipo} ${op} en ${p.zona || p.ciudad || 'Guatemala'}${d.length ? `: ${d.slice(0, 3).join(', ')}` : ''}. ${fmt(p.precio, p.moneda)}.`;
	const zonaTag = sinAcentos(p.zona || 'guatemala').replace(/\s+/g, '');
	const hashtags = ['#BienesRaicesGuatemala', `#${tipo.split(' ')[0]}${operacionHashtag(p)}`, `#${zonaTag}`, '#Guatemala', '#Inmuebles', '#EquipoInmobiliario'].join(' ');
	const puntos = [...d.slice(0, 4), ...amen.slice(0, 2)].slice(0, 6);
	return {
		titulo,
		descripcion: parrafos.join('\n\n'),
		seoTitulo: `${tipo} ${op} ${p.zona || 'Guatemala'} | ${d[0] || fmt(p.precio, p.moneda)}`.slice(0, 65),
		seoDescripcion: corto.slice(0, 155),
		vipTitular: p.direccion || titulo,
		vipSubtitular: `${tipo} ${op} en ${p.zona || 'Guatemala'}${d.length ? ` con ${unir(d.slice(0, 2))}` : ''}.`,
		puntosClave: puntos.length ? puntos : [donde].filter(Boolean),
		amenidades: amen,
		postInstagram: `${titulo}\n\n${d.length ? `${d.map((x) => `✔ ${x}`).join('\n')}\n` : ''}${fmt(p.precio, p.moneda)}${p.operacion === 'renta' ? '/mes' : ''}\n\nEscríbenos para agendar tu visita.\n${url(p)}\n\n${hashtags}`,
		postFacebook: `${titulo}\n\n${parrafos[0]}\n${amen.length ? `\nAmenidades: ${amen.join(', ')}.\n` : ''}\nPrecio: ${fmt(p.precio, p.moneda)}${p.operacion === 'renta' ? ' al mes' : ''}.\nMás información y fotos: ${url(p)}`
	};
}

function amenidadesDe(texto) {
	const t = sinAcentos(texto);
	const LISTA = [
		[/piscina/, 'Piscina'], [/jardin/, 'Jardín'], [/garita|seguridad 24/, 'Garita de seguridad'], [/gimnasio|gym/, 'Gimnasio'],
		[/terraza/, 'Terraza'], [/balcon/, 'Balcón'], [/estudio/, 'Estudio'], [/bodega/, 'Bodega'], [/lavanderia/, 'Área de lavandería'],
		[/cuarto de servicio|dormitorio de servicio/, 'Cuarto de servicio'], [/chimenea/, 'Chimenea'], [/ascensor|elevador/, 'Elevador'],
		[/area social|salon social|club house|casa club/, 'Área social'], [/juegos infantiles|area de ninos/, 'Área de juegos infantiles'],
		[/planta electrica|generador/, 'Planta eléctrica'], [/cisterna/, 'Cisterna'], [/paneles solares/, 'Paneles solares'], [/amueblad/, 'Amueblado']
	];
	return LISTA.filter(([re]) => re.test(t)).map(([, label]) => label);
}

// ------------------------------------------------------------ Versión en inglés

// Diccionario de amenidades y frases comunes en anuncios.
const DICCIONARIO = {
	piscina: 'Swimming pool', jardin: 'Garden', 'garita de seguridad': '24/7 gated security', garita: 'Gated security', seguridad: 'Security',
	'seguridad 24 horas': '24/7 security', gimnasio: 'Gym', terraza: 'Terrace', balcon: 'Balcony', estudio: 'Study', bodega: 'Storage room',
	'area de lavanderia': 'Laundry area', lavanderia: 'Laundry room', 'cuarto de servicio': "Maid's quarters", 'dormitorio de servicio': "Maid's quarters",
	chimenea: 'Fireplace', elevador: 'Elevator', ascensor: 'Elevator', 'area social': 'Clubhouse', 'salon social': 'Event room', 'casa club': 'Clubhouse',
	'area de juegos infantiles': "Children's play area", 'juegos infantiles': 'Playground', 'planta electrica': 'Backup generator', generador: 'Backup generator',
	cisterna: 'Water cistern', 'paneles solares': 'Solar panels', amueblado: 'Furnished', 'semi amueblado': 'Semi-furnished', 'cocina equipada': 'Equipped kitchen',
	'cocina integral': 'Fitted kitchen', 'walk in closet': 'Walk-in closet', 'vestidor': 'Walk-in closet', 'sala familiar': 'Family room', 'sala de estar': 'Living room',
	comedor: 'Dining room', parqueo: 'Parking', 'parqueo de visitas': 'Guest parking', 'area de bbq': 'BBQ area', bbq: 'BBQ area', rancho: 'Gazebo',
	'cancha de tenis': 'Tennis court', 'cancha deportiva': 'Sports court', 'sendero': 'Walking trail', 'vista': 'View', 'vista panoramica': 'Panoramic view',
	'acepta mascotas': 'Pet friendly', 'pet friendly': 'Pet friendly', 'calentador solar': 'Solar water heater', 'agua caliente': 'Hot water',
	'aire acondicionado': 'Air conditioning', 'pozo': 'Private well', 'area verde': 'Green area', 'areas verdes': 'Green areas', 'jacuzzi': 'Jacuzzi',
	'sauna': 'Sauna', 'business center': 'Business center', 'cowork': 'Coworking space', 'roof top': 'Rooftop', 'rooftop': 'Rooftop', 'azotea': 'Rooftop'
};
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const traducirAmenidad = (a) => DICCIONARIO[sinAcentos(a).replace(/\s+/g, ' ').trim()] || a;
const sqft = (m2) => Math.round(n(m2) * M2_A_FT2).toLocaleString('en-US');

function datosEn(p) {
	const d = [];
	if (n(p.habitaciones)) d.push(`${n(p.habitaciones)} bedroom${n(p.habitaciones) === 1 ? '' : 's'}`);
	if (n(p.banos)) d.push(`${n(p.banos)} bathroom${n(p.banos) === 1 ? '' : 's'}`);
	if (n(p.parqueos)) d.push(`${n(p.parqueos)} parking space${n(p.parqueos) === 1 ? '' : 's'}`);
	if (n(p.m2Construccion)) d.push(`${n(p.m2Construccion)} m² (${sqft(p.m2Construccion)} sq ft) of living space`);
	if (n(p.m2Terreno)) d.push(`a ${n(p.m2Terreno)} m² (${sqft(p.m2Terreno)} sq ft) lot`);
	return d;
}
const unirEn = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);
const OP_EN = { renta: 'for Rent', vacacional: 'for Vacation Rental' };
const opEn = (p) => OP_EN[p.operacion] || 'for Sale';
const precioEn = (p) => `${p.moneda === 'GTQ' ? 'Q' : '$'}${decimales(n(p.precio))}${{ renta: '/month', vacacional: '/night' }[p.operacion] || ''}`;

// Título en inglés: tipo + operación + lugar, sin repetir la zona ni cortar palabras.
export function tituloEn(p) {
	// La dirección a veces empieza con el tipo en español ("Terreno camino…"): ya lo dice el título.
	const es = (TIPO_ES[p.tipo] || '').split(' ')[0];
	let sitio = sinRepetir([p.direccion, p.zona]).join(', ') || p.ciudad || 'Guatemala';
	if (es) sitio = sitio.replace(new RegExp(`^[${es[0]}${es[0].toLowerCase()}]${es.slice(1)}\\s+(?=[a-záéíóúñ])`), '').replace(/^en\s+/, '');
	const base = `${TIPO_EN[p.tipo] || 'Property'} ${opEn(p)} in `;
	const partes = capital(sitio).split(/,\s*/);
	while (partes.length > 1 && (base + partes.join(', ')).length > 90) partes.pop();
	const t = base + partes.join(', ');
	return t.length <= 90 ? t : t.slice(0, 90).replace(/\s+\S*$/, '');
}

// Traductor automático gratuito (sin clave). Si falla, se usa la plantilla y no se le vuelve a
// preguntar por unos minutos: así una importación larga no espera en cada fila.
let traductorCaidoHasta = 0;
// «par»: idiomas de origen y destino (es|en para las fichas; en|es para leer a un cliente que escribe en inglés).
export async function traductorLibre(texto, par = 'es|en') {
	const limpio = String(texto || '').trim();
	if (!limpio) return '';
	if (Date.now() < traductorCaidoHasta) throw new Error('Traductor no disponible');
	// El servicio acepta hasta ~500 caracteres por consulta: se traduce por oraciones agrupadas.
	const bloques = [];
	for (const parrafo of limpio.split(/\n{2,}/)) {
		const partes = [];
		let actual = '';
		for (const frase of parrafo.match(/[^.!?\n]+[.!?]*\s*|\n/g) || [parrafo]) {
			if ((actual + frase).length > 450 && actual) { partes.push(actual); actual = ''; }
			actual += frase;
		}
		if (actual) partes.push(actual);
		bloques.push(partes);
	}
	if (bloques.flat().length > 12) throw new Error('Texto muy largo para el traductor gratuito.');
	const uno = async (q) => {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 8000);
		try {
			const res = await fetch(`https://api.mymemory.translated.net/get?langpair=${par}&q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
			const body = await res.json();
			const txt = body?.responseData?.translatedText || '';
			if (Number(body?.responseStatus) !== 200 || !txt || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(txt)) throw new Error('Traductor no disponible');
			return txt.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
		} catch (err) {
			traductorCaidoHasta = Date.now() + 5 * 60000;
			throw err;
		} finally { clearTimeout(timer); }
	};
	const out = [];
	for (const partes of bloques) {
		const tr = [];
		for (const q of partes) tr.push(q.trim() === '' ? '' : await uno(q));
		out.push(tr.join(' ').replace(/\s+\n/g, '\n').trim());
	}
	return out.join('\n\n');
}

// Descripción en inglés armada con los datos de la propiedad (cuando no hay traductor).
function descripcionPlantillaEn(p, amenEn) {
	const tipo = TIPO_EN[p.tipo] || 'Property';
	const d = datosEn(p);
	return [
		`${tipo} ${opEn(p).toLowerCase()} in ${lugar(p) || 'Guatemala'}.${d.length ? ` It features ${unirEn(d)}.` : ''}`,
		amenEn.length ? `**Amenities:**\n${amenEn.map((a) => `- ${a}`).join('\n')}` : '',
		`Price: ${precioEn(p)}. Contact an advisor for full details or to schedule an in-person or live video tour.`
	].filter(Boolean).join('\n\n');
}

// Título que armaba la regla anterior (repetía la zona y cortaba a 90 letras). Solo sirve para reconocer
// los que quedaron guardados así y corregirlos; un título escrito por alguien no coincide.
export const tituloEnViejo = (p) => `${TIPO_EN[p.tipo] || 'Property'} ${p.operacion === 'renta' ? 'for Rent' : 'for Sale'} in ${
	p.direccion && p.direccion !== p.zona ? `${p.direccion}, ${p.zona || ''}` : p.zona || p.ciudad || 'Guatemala'}`.replace(/,\s*$/, '').slice(0, 90);

async function traducir({ propiedad: p }) {
	const tipo = TIPO_EN[p.tipo] || 'Property';
	const op = opEn(p);
	const amenidades = (p.amenidades || []).map(traducirAmenidad).map(capital);
	const titulo = tituloEn(p);
	let descripcion = '';
	try {
		descripcion = await traductorLibre(p.descripcion);
	} catch {
		descripcion = '';
	}
	if (!descripcion) descripcion = descripcionPlantillaEn(p, amenidades);
	else if (datosEn(p).length && !/bedroom|sq ft/i.test(descripcion)) descripcion += `\n\nKey facts: ${unirEn(datosEn(p))}. Price: ${precioEn(p)}.`;
	const d = datosEn(p);
	const vip = p.vip ? p.vipLanding || {} : {};
	// Textos de la renta vacacional, línea por línea (las reglas van una por línea). Si el traductor
	// no responde quedan vacíos y la ficha en inglés muestra el original.
	const v = p.vacacional || {};
	const porLineas = async (texto) => {
		const en = [];
		try {
			for (const l of String(texto || '').split('\n')) en.push(await traductorLibre(l));
		} catch {
			return '';
		}
		return en.join('\n');
	};
	const comoLlegar = await porLineas(v.comoLlegar), reglas = await porLineas(v.reglas), cancelacion = await porLineas(v.cancelacion);
	return {
		titulo, descripcion, amenidades, comoLlegar, reglas, cancelacion,
		seoTitulo: `${tipo} ${op} ${p.zona || ''} Guatemala${n(p.habitaciones) ? ` | ${n(p.habitaciones)} Bed` : ''}`.replace(/\s+/g, ' ').slice(0, 65),
		seoDescripcion: `${tipo} ${op.toLowerCase()} in ${p.zona || 'Guatemala'}, Guatemala${d.length ? `: ${d.slice(0, 3).join(', ')}` : ''}. ${precioEn(p)}.`.slice(0, 155),
		vipTitular: vip.titular ? titulo : '',
		vipSubtitular: vip.subtitular ? `${tipo} ${op.toLowerCase()} in ${p.zona || 'Guatemala'}${d.length ? ` with ${unirEn(d.slice(0, 2))}` : ''}.` : '',
		puntosClave: (vip.puntosClave || []).length ? [...d.slice(0, 4), ...amenidades.slice(0, 2)].slice(0, 6) : [],
		ctaTexto: vip.ctaTexto ? 'Schedule a tour' : ''
	};
}

export const REGLAS = { buscar, seguimiento, descripcion, traducir, coincidencias };
