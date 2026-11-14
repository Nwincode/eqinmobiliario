// Resumen del dueño (admin/js/portal.js): clientes interesados (anónimos) y eventos automáticos de la línea de tiempo.
// Módulo puro, sin Firebase ni DOM, para poder probarlo con `npm run test:portal`.
// Regla de privacidad: lo que sale de aquí va al documento público. Nada de ids, nombres,
// teléfonos, correos ni textos escritos a mano: solo un número de orden, canal, fechas y etapa.

const DIA = 86400000;
export const MAX_CLIENTES = 30;

// Fecha en milisegundos (Timestamp de Firestore, Date, texto o número).
export function msDe(v) {
	if (!v) return 0;
	if (typeof v.toDate === 'function') return v.toDate().getTime() || 0;
	if (typeof v.seconds === 'number') return v.seconds * 1000;
	const t = new Date(v).getTime();
	return Number.isNaN(t) ? 0 : t;
}
const dia = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '');

// Canales que entiende el portal (los textos están en TEXTOS_PORTAL).
export const CANALES = ['web', 'whatsapp', 'portal', 'anuncio', 'redes', 'referido', 'llamada', 'otro'];
const ORIGENES_WEB = new Set(['contacto', 'propiedad', 'vip', 'listado', 'blog', 'calculadora']);

// Traduce la fuente libre del cliente o la campaña del lead a un canal fijo.
export function canalDe(texto) {
	const s = String(texto || '').toLowerCase();
	if (!s.trim()) return '';
	if (/whats|wa\.me|wsp/.test(s)) return 'whatsapp';
	if (/gclid|google ?ads|adwords|fbclid|meta ?ads|facebook ?ads|anuncio|\bads?\b|\bcpc\b|pagad/.test(s)) return 'anuncio';
	if (/encuentra|marketplace|portal|olx|inmuebles|propiedades\.com|zillow|realtor|vivanuncios|mercado ?libre/.test(s)) return 'portal';
	if (/refer|recomend|amig|familia|conocid|boca/.test(s)) return 'referido';
	if (/facebook|instagram|\bfb\b|\big\b|tiktok|linkedin|red(es)? social|meta/.test(s)) return 'redes';
	if (/llam|tel[eé]f|rótulo|rotulo|letrero|oficina|walk|visita directa/.test(s)) return 'llamada';
	if (/web|sitio|p[aá]gina|google|org[aá]nico|directo|seo|eqinmobiliario/.test(s)) return 'web';
	return 'otro';
}

function canalLead(l) {
	const c = l.campana || {};
	if (c.gclid || c.fbclid || /cpc|paid|ads/i.test(c.utm_medium || '')) return 'anuncio';
	const porFuente = canalDe(c.utm_source);
	if (porFuente) return porFuente;
	if (ORIGENES_WEB.has(l.origen)) return 'web';
	return canalDe(l.origen) || 'web';
}

// Etapa en palabras sencillas: interesado, visito, negociando, oferto, cerro, perdido.
export function etapaPortal(c, { visitasHechas = 0, reuniones = 0 } = {}) {
	switch (c.etapa) {
		case 'perdido': return 'perdido';
		case 'cierre': return 'cerro';
		case 'oferta': return 'oferto';
		default:
			if (reuniones > 0 && visitasHechas > 0) return 'negociando';
			if (visitasHechas > 0) return 'visito';
			return 'interesado';
	}
}

const esVisitaHecha = (a, ahora) => a.hecha || (msDe(a.fecha) && msDe(a.fecha) < ahora);

// Fecha en que el cliente pasó a oferta (o cierre): la nota «Etapa: … → Oferta», etapaFecha o updatedAt.
export function fechaOferta(c, acts = []) {
	const notas = acts.filter((a) => a.tipo === 'nota' && /→\s*(Oferta|Cierre)/.test(a.titulo || ''))
		.map((a) => msDe(a.hechaEn) || msDe(a.createdAt) || msDe(a.fecha)).filter(Boolean).sort((x, y) => x - y);
	return notas[0] || msDe(c.etapaFecha) || msDe(c.updatedAt) || msDe(c.createdAt);
}

/**
 * Clientes interesados en una propiedad, sin datos personales.
 * @param {object} o
 * @param {string} o.propertyId
 * @param {object[]} o.clientes   documentos de clientes (con id, interes, etapa, fuente, createdAt)
 * @param {object[]} o.leads      consultas de esta propiedad (clienteId, origen, campana, createdAt)
 * @param {object[]} o.visitas    actividades de visita de esta propiedad (clienteId, fecha, hecha)
 * @param {object[]} o.actividades todas las actividades disponibles (para reuniones y notas de etapa)
 * @returns {{n:number, canal:string, desde:string, visitas:number, ultimaVisita:string, visitaProxima:boolean, etapa:string, etapaFecha:string}[]}
 */
// Filas con el id del cliente: solo para uso interno del panel (numeración estable y copia privada).
export function filasClientes({ propertyId, clientes = [], leads = [], visitas = [], actividades = [], ahora = Date.now() } = {}) {
	if (!propertyId) return [];
	const porId = new Map(clientes.filter((c) => c && c.id).map((c) => [c.id, c]));
	const ids = new Set();
	for (const c of porId.values()) if ((c.interes || []).includes(propertyId)) ids.add(c.id);
	for (const l of leads) if (l.clienteId && l.propertyId === propertyId && porId.has(l.clienteId)) ids.add(l.clienteId);
	for (const a of visitas) if (a.clienteId && porId.has(a.clienteId)) ids.add(a.clienteId);

	const filas = [...ids].map((id) => {
		const c = porId.get(id);
		const susLeads = leads.filter((l) => l.clienteId === id && l.propertyId === propertyId)
			.sort((x, y) => msDe(x.createdAt) - msDe(y.createdAt));
		const susVisitas = visitas.filter((a) => a.clienteId === id);
		const hechas = susVisitas.filter((a) => esVisitaHecha(a, ahora)).map((a) => msDe(a.fecha) || msDe(a.hechaEn)).filter(Boolean).sort((x, y) => x - y);
		const proxima = susVisitas.some((a) => !a.hecha && msDe(a.fecha) >= ahora);
		const susActs = actividades.filter((a) => a.clienteId === id && (!a.propertyId || a.propertyId === propertyId));
		const reuniones = susActs.filter((a) => a.tipo === 'reunion' && a.hecha).length;
		const fechas = [msDe(susLeads[0]?.createdAt), msDe(c.createdAt), ...susVisitas.map((a) => msDe(a.fecha))].filter(Boolean);
		const desde = fechas.length ? Math.min(...fechas) : 0;
		const canal = susLeads.length ? canalLead(susLeads[0]) : (canalDe(c.fuente) || (c.leadIds?.length ? 'web' : 'otro'));
		const etapa = etapaPortal(c, { visitasHechas: hechas.length, reuniones });
		const etapaFecha = ['oferto', 'cerro'].includes(etapa) ? fechaOferta(c, susActs) : 0;
		return { id, canal, desde: dia(desde), visitas: hechas.length, ultimaVisita: dia(hechas[hechas.length - 1]), visitaProxima: proxima, etapa, etapaFecha: dia(etapaFecha) };
	});
	return filas;
}

const CAMPOS_FILA = ['canal', 'desde', 'visitas', 'ultimaVisita', 'visitaProxima', 'etapa', 'etapaFecha'];

/**
 * Numera las filas sin que cambien los números ya dados: `numeros` es { idCliente: n } guardado
 * en privado. Los clientes nuevos reciben el siguiente número por orden de primer contacto.
 * Devuelve la lista pública (sin ids; si hay más de 30, los 30 más recientes) y el mapa actualizado.
 */
export function numerarClientes(filas, numeros = {}) {
	const mapa = { ...numeros };
	let max = Object.values(mapa).reduce((m, n) => Math.max(m, Number(n) || 0), 0);
	const orden = (f) => f.desde || '9999';
	filas.filter((f) => !mapa[f.id]).sort((a, b) => orden(a).localeCompare(orden(b)) || String(a.id).localeCompare(String(b.id)))
		.forEach((f) => { mapa[f.id] = ++max; });
	const lista = filas.map((f) => ({ n: mapa[f.id], ...Object.fromEntries(CAMPOS_FILA.map((k) => [k, f[k]])) }))
		.sort((a, b) => a.n - b.n).slice(-MAX_CLIENTES);
	return { lista, numeros: mapa };
}

/**
 * Junta las filas recién calculadas con la copia privada anterior. Un asesor solo lee sus clientes:
 * los que no puede ver (`visibles` no los tiene) se conservan tal como los dejó el administrador.
 */
export function combinarClientes(filas, anteriores = {}, visibles = null) {
	if (!visibles) return filas;
	const ya = new Set(filas.map((f) => f.id));
	const resto = Object.entries(anteriores).filter(([id]) => !ya.has(id) && !visibles.has(id)).map(([id, f]) => ({ ...f, id }));
	return [...filas, ...resto];
}

// Lista pública (sin ids ni nombres): número de orden, canal, fechas y etapa.
export function clientesInteresados(args = {}) {
	return numerarClientes(filasClientes(args)).lista;
}

/**
 * Eventos automáticos de la línea de tiempo, sacados de datos que ya existen.
 * No repite lo que ya está en la bitácora manual: si hay una entrada del mismo tipo el mismo día, se omite.
 * @returns {{fecha:string, tipo:string, auto:string, portal?:string, precio?:number, moneda?:string}[]}
 */
export function eventosAuto({ enMercadoDesde = '', enLinea = false, portales = [], historialPrecio = [], visitasHechas = [], ofertas = [], manuales = [] } = {}) {
	const ya = new Set(manuales.map((e) => `${e.tipo}|${String(e.fecha || '').slice(0, 10)}`));
	const out = [];
	const add = (e) => { if (e.fecha && !ya.has(`${e.tipo}|${e.fecha}`)) out.push(e); };

	if (enLinea && enMercadoDesde) add({ fecha: dia(msDe(enMercadoDesde)), tipo: 'publicado', auto: 'web' });
	for (const p of portales) {
		const t = msDe(p.desde);
		if (t && p.nombre) add({ fecha: dia(t), tipo: 'portal', auto: 'portal', portal: String(p.nombre).slice(0, 80) });
	}
	const precios = historialPrecio.filter((x) => x && Number(x.precio)).slice().sort((a, b) => msDe(a.fecha) - msDe(b.fecha));
	for (let i = 1; i < precios.length; i++) {
		const x = precios[i];
		if (Number(x.precio) === Number(precios[i - 1].precio) && x.moneda === precios[i - 1].moneda) continue;
		add({ fecha: dia(msDe(x.fecha)), tipo: 'precio', auto: 'precio', precio: Number(x.precio), moneda: x.moneda || 'USD' });
	}
	for (const t of visitasHechas) add({ fecha: dia(msDe(t)), tipo: 'visita', auto: 'visita' });
	for (const t of ofertas) add({ fecha: dia(msDe(t)), tipo: 'oferta', auto: 'oferta' });
	// Un mismo tipo el mismo día se cuenta una vez (dos visitas el mismo día = un evento con «2»).
	const unicos = new Map();
	for (const e of out) {
		const k = `${e.tipo}|${e.fecha}|${e.portal || ''}|${e.precio || ''}`;
		if (unicos.has(k)) unicos.get(k).veces = (unicos.get(k).veces || 1) + 1; else unicos.set(k, { ...e });
	}
	return [...unicos.values()];
}

// Utilidad para las pruebas: días desde una fecha ISO.
export const hace = (dias, ahora = Date.now()) => new Date(ahora - dias * DIA).toISOString();
