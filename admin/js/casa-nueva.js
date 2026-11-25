// La casa nueva que sube el socio (propietario o colaborador) desde «Mis propiedades», de cualquier tipo: por noche, venta
// o renta. Puro: lo usan la ficha (admin/js/views/properties.js en modo socio, para decirle lo que falta antes de mandar)
// y el servidor (netlify/functions/mi-casa-nueva.mjs, que lo vuelve a revisar todo y la publica al momento con la cuenta
// de escritura). Solo entra lo de esta lista; lo demás lo pone el servidor (dueño, asesor, publicado, estado, código, URL,
// margen) o el equipo después (acuerdo, inglés, Google, destacada, VIP, video).
// Cada dato se revisa con la misma pieza que «La casa» (admin/js/mi-casa.js): textos sin teléfonos, correos, enlaces ni
// redes (V.tieneContacto, el filtro del chat), fotos solo de la carpeta de esta casa en nuestro almacenamiento.
// Pruebas: scripts/test-casa-nueva.mjs.
import { texto, numero, deLista, mapa, amenidades, fotoLimpia, fotoDeLaCasa, sinContacto, HORAS, MAX_FOTOS } from './mi-casa.js';
import { TIPOS, OPERACIONES, tipoAplica } from './estados.js';
import { vacacionalPublico } from './cambios-casa.js';
import '../../js/calc-vacacional.js';

const V = globalThis.EQVacacional;

export const MIN_FOTOS = 5;
// Hasta 10 precios por fechas a la vez (las reglas los revisan uno por uno cuando el socio los cambia después).
export const MAX_TARIFAS = 10;
const ANIO_MAX = new Date().getFullYear() + 5;

const obligatorio = (revisar, falta) => (v) => (v === '' || v === null || v === undefined ? { error: falta } : revisar(v));
const positivo = (max, paso, falta) => (v) => {
	const r = numero(max, paso)(v);
	return r.error ? r : r.valor > 0 ? r : { error: falta };
};
const entero = (min, max) => (v) => {
	const n = Number(v);
	return Number.isInteger(n) && n >= min && n <= max ? { valor: n } : { error: `de ${min} a ${max}` };
};
// Precios por fechas del socio: hasta 10, con fechas de verdad, la última el mismo día o después, y que no hayan pasado.
const tarifas = (v) => {
	const lista = (Array.isArray(v) ? v : []).filter((t) => t && (t.desde || t.hasta || Number(t.precio)));
	if (lista.length > MAX_TARIFAS) return { error: `hasta ${MAX_TARIFAS}` };
	const hoy = V.hoy();
	const out = [];
	for (const t of lista) {
		const precio = Number(t.precio);
		if (!V.esFecha(t.desde) || !V.esFecha(t.hasta) || t.hasta < t.desde) return { error: 'cada una con su primera y su última noche (la última, el mismo día o después)' };
		if (!(precio > 0) || precio > 50000) return { error: 'cada una con su precio por noche (hasta 50,000)' };
		if (t.hasta < hoy) continue;
		out.push({ desde: t.desde, hasta: t.hasta, precio: V.r2(precio) });
	}
	return { valor: out.sort((a, b) => a.desde.localeCompare(b.desde)) };
};

// Campo por campo, con el nombre que tiene en la ficha: dónde va (casa, privado/socio o privado/llegada), para qué
// operaciones (vac: por noche; otra: venta y renta) y su revisión. `ruta`: dónde se guarda (con puntos).
const NOCHE = 'vac', OTRA = 'otra';
export const CAMPOS_NUEVA = [
	{ campo: 'operacion', etiqueta: 'Operación', revisar: deLista(OPERACIONES.map(([v]) => v)) },
	{ campo: 'tipo', etiqueta: 'Tipo', revisar: deLista(TIPOS.map(([v]) => v)) },
	{ campo: 'moneda', etiqueta: 'Moneda', revisar: deLista(['USD', 'GTQ']) },
	{ campo: 'titulo', etiqueta: 'Título', revisar: texto(90, { min: 5 }) },
	{ campo: 'descripcion', etiqueta: 'Descripción', revisar: texto(6000, { min: 20 }) },
	{ campo: 'precio', etiqueta: 'Precio', para: OTRA, revisar: positivo(100000000, 1, 'escribe el precio') },
	{ campo: 'zona', etiqueta: 'Zona', revisar: texto(60, { min: 1 }) },
	{ campo: 'ciudad', etiqueta: 'Ciudad / municipio', revisar: texto(60, { min: 1 }) },
	// En venta y renta la dirección y el mapa salen en la página; en una casa por noche son privados (el cliente los recibe
	// al pagar) y la dirección es obligatoria (sin ella la casa no se muestra: revisarPublicar).
	{ campo: 'direccion', etiqueta: 'Residencial / dirección', para: OTRA, revisar: texto(160) },
	{ campo: 'direccion', etiqueta: 'Dirección exacta', para: NOCHE, donde: 'llegada', revisar: texto(300, { min: 5, privado: true }) },
	{ campo: 'mapa', etiqueta: 'Mapa', para: OTRA, revisar: mapa },
	{ campo: 'mapa', etiqueta: 'Mapa', para: NOCHE, donde: 'llegada', revisar: mapa },
	{ campo: 'habitaciones', etiqueta: 'Habitaciones', revisar: numero(50) },
	{ campo: 'banos', etiqueta: 'Baños', revisar: numero(50, 0.5) },
	{ campo: 'parqueos', etiqueta: 'Parqueos', revisar: numero(50) },
	{ campo: 'm2Construccion', etiqueta: 'm² construcción', revisar: numero(1000000, 0.01) },
	{ campo: 'm2Terreno', etiqueta: 'm² terreno', revisar: numero(10000000, 0.01) },
	{ campo: 'niveles', etiqueta: 'Niveles', revisar: numero(200) },
	{ campo: 'anioConstruccion', etiqueta: 'Año de construcción', revisar: (v) => (v === '' || v == null || Number(v) === 0 ? { valor: 0 } : entero(1800, ANIO_MAX)(v)) },
	{ campo: 'mantenimiento', etiqueta: 'Mantenimiento al mes', para: OTRA, revisar: numero(1000000, 0.01) },
	{ campo: 'amenidades', etiqueta: 'Amenidades', revisar: (v) => amenidades(v ?? []) },
	{ campo: 'socio.precioBase', etiqueta: 'Precio por noche', para: NOCHE, donde: 'socio', ruta: 'precioBase', revisar: positivo(50000, 0.01, 'escribe tu precio por noche') },
	{ campo: 'socio.precioFinde', etiqueta: 'Precio en fin de semana', para: NOCHE, donde: 'socio', ruta: 'precioFinde', revisar: numero(50000, 0.01) },
	{ campo: 'socio.tarifas', etiqueta: 'Precios por fechas', para: NOCHE, donde: 'socio', ruta: 'tarifas', revisar: tarifas },
	{ campo: 'vacacional.limpieza', etiqueta: 'Cargo de limpieza', para: NOCHE, revisar: numero(10000, 0.01) },
	{ campo: 'vacacional.deposito', etiqueta: 'Depósito', para: NOCHE, revisar: numero(50000, 0.01) },
	{ campo: 'vacacional.nochesMin', etiqueta: 'Noches mínimas', para: NOCHE, revisar: obligatorio(entero(1, 30), 'de 1 a 30') },
	{ campo: 'vacacional.huespedesMax', etiqueta: 'Huéspedes máximos', para: NOCHE, revisar: obligatorio(entero(1, 50), 'de 1 a 50') },
	{ campo: 'vacacional.checkIn', etiqueta: 'Hora de entrada', para: NOCHE, revisar: deLista(HORAS) },
	{ campo: 'vacacional.checkOut', etiqueta: 'Hora de salida', para: NOCHE, revisar: deLista(HORAS) },
	{ campo: 'vacacional.camas', etiqueta: 'Camas', para: NOCHE, revisar: numero(100) },
	{ campo: 'vacacional.mascotas', etiqueta: 'Mascotas', para: NOCHE, revisar: deLista(['', 'si', 'no']) },
	{ campo: 'vacacional.comoLlegar', etiqueta: 'Cómo llegar', para: NOCHE, revisar: texto(1500) },
	{ campo: 'vacacional.reglas', etiqueta: 'Reglas de la casa', para: NOCHE, revisar: texto(2000) },
	{ campo: 'vacacional.cancelacion', etiqueta: 'Cancelación', para: NOCHE, revisar: texto(1500) }
];
// Los nombres de la ficha que manda el socio (lo demás de la ficha no se manda: es del equipo o lo pone el servidor).
export const NOMBRES_NUEVA = [...new Set([...CAMPOS_NUEVA.map((c) => c.campo), 'agentId', 'fotos'])];

const leer = (o, ruta) => ruta.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const poner = (o, ruta, v) => { const p = ruta.split('.'); let x = o; for (const k of p.slice(0, -1)) x = x[k] ||= {}; x[p.at(-1)] = v; };

// Lo que manda la ficha: solo los nombres de la lista, con su forma (sin los ocultos del equipo).
export function datosParaServidor(d = {}) {
	const out = {};
	for (const k of NOMBRES_NUEVA) { const v = leer(d, k); if (v !== undefined) poner(out, k, v); }
	return out;
}

// Revisa la casa nueva entera y la separa en lo que va a cada documento. Devuelve { errores, casa, socio, llegada }:
// errores = [{ campo, msg }] (todos juntos, con el nombre del campo de la ficha); sin errores, lo demás está listo.
//  - casaId, bucket, origenes: las fotos tienen que ser de properties/{casaId}/ en nuestro almacenamiento.
//  - dueno: su ficha ({ tipo, agentId }): el colaborador elige el asesor de su casa en venta o renta; el propietario, el
//    que lo atiende. agentes: los asesores activos (ids). Una casa por noche no lleva asesor.
//  - revisarOrigen: false en la ficha (de dónde es cada foto lo revisa el servidor, que sabe cuál es el almacenamiento).
export function revisarCasaNueva({ datos = {}, casaId, bucket, origenes, dueno = {}, agentes = [], revisarOrigen = true } = {}) {
	const errores = [];
	const falla = (campo, etiqueta, msg) => errores.push({ campo, msg: `${etiqueta}: ${msg}.` });
	const casa = {}, socio = {}, llegada = {};
	const operacion = String(datos.operacion || '');
	const vac = operacion === 'vacacional';
	for (const def of CAMPOS_NUEVA) {
		if (def.para === NOCHE && !vac) continue;
		if (def.para === OTRA && vac) continue;
		const r = def.revisar(leer(datos, def.campo));
		if (r.error) { falla(def.campo, def.etiqueta, r.error); continue; }
		const destino = def.donde === 'socio' ? socio : def.donde === 'llegada' ? llegada : casa;
		poner(destino, def.ruta || def.campo, r.valor);
	}
	if (casa.tipo && casa.operacion && !tipoAplica(casa.tipo, casa.operacion)) falla('tipo', 'Tipo', 'una casa por noche es casa, apartamento o finca');
	// Fotos: de 5 a 40, sin repetir, todas de la carpeta de esta casa. La descripción de cada una (para Google) la que
	// escribió, sin contacto; si la dejó vacía, «Título – foto N».
	const fotos = Array.isArray(datos.fotos) ? datos.fotos.map(fotoLimpia) : [];
	if (fotos.length < MIN_FOTOS) falla('fotos', 'Fotos', `sube al menos ${MIN_FOTOS} (llevas ${fotos.length})`);
	else if (fotos.length > MAX_FOTOS) falla('fotos', 'Fotos', `hasta ${MAX_FOTOS}`);
	else if (new Set(fotos.map((f) => f.path)).size !== fotos.length) falla('fotos', 'Fotos', 'hay una repetida');
	else if (revisarOrigen && fotos.some((f) => !fotoDeLaCasa(f, casaId, bucket, origenes))) falla('fotos', 'Fotos', 'una de las fotos no es de esta casa: súbela de nuevo');
	const titulo = casa.titulo || '';
	const conContacto = fotos.find((f) => f.alt && sinContacto(f.alt));
	if (conContacto) falla('fotos', 'Descripción de una foto', `«${conContacto.alt}» ${sinContacto(conContacto.alt)}`);
	casa.fotos = fotos.map((f, i) => ({ ...f, alt: String(f.alt || '').trim() || `${titulo} – foto ${i + 1}` }));
	// El asesor: el que elige el colaborador (de los activos) o el que atiende al dueño. Por noche, ninguno.
	const elegido = String(datos.agentId || '');
	if (vac) casa.agentId = '';
	else if (dueno.tipo === 'colaborador' && elegido) {
		if (agentes.includes(elegido)) casa.agentId = elegido;
		else falla('agentId', 'Asesor', 'elige uno de la lista');
	} else casa.agentId = agentes.includes(dueno.agentId) ? dueno.agentId : '';
	if (socio.precioFinde === 0) delete socio.precioFinde;
	return { errores, casa, socio, llegada };
}

// La casa lista para guardar: lo revisado más lo que pone el sistema. `quien`: { fecha, por, porUid }. `extra`: dueño,
// URL, código y lo de siempre (publicada al momento, disponible). La de por noche lleva sus precios públicos (los del
// socio más el margen de siempre) y su privado/socio con ese margen.
export function armarCasaNueva(revisada, extra = {}) {
	const { casa, socio } = revisada;
	const vac = casa.operacion === 'vacacional';
	const d = { ...casa, ...extra, estado: 'disponible', publicado: true, destacada: false, vip: false };
	if (vac) {
		const priv = { margen: V.MARGEN, ...socio, tarifas: socio.tarifas || [] };
		const pub = vacacionalPublico({ socio: priv, vacacional: casa.vacacional });
		d.precio = pub.precio;
		d.vacacional = { ...pub.vacacional, minimos: [], reservadas: [] };
		return { casa: d, socio: priv, llegada: revisada.llegada };
	}
	delete d.vacacional;
	return { casa: d, socio: null, llegada: null };
}
