// Lo que el dueño (socio) cambia él solo de su casa por noche («Mis propiedades» → su casa → «La casa»). Puro: lo usan el
// panel (admin/js/views/mis-casas.js, para armar el formulario y decir qué cambió) y el servidor
// (netlify/functions/mi-casa.mjs, que lo vuelve a revisar todo antes de escribir con la cuenta de escritura).
// Se publica sin esperar al administrador; el administrador ve cada cambio (antes y ahora) y lo puede deshacer
// (admin/js/views/cambios-dueno.js). Lo que no está aquí no lo toca el dueño: dueño, asesor, margen, código, visible,
// Google, inglés (se traduce al marcar «Listo»), precios por noche (su calendario) ni borrar la casa.
// Pruebas: scripts/test-mi-casa.mjs.
import { estadoDe } from './estados.js';

export const HORAS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
export const MAX_FOTOS = 40;
export const ESTADOS_DUENO = ['disponible', 'pausada'];

const texto = (max, { min = 0 } = {}) => (v) => {
	const s = String(v ?? '').replace(/\r\n/g, '\n').trim();
	if (s.length < min) return { error: min > 1 ? `escribe al menos ${min} letras` : 'no puede quedar vacío' };
	if (s.length > max) return { error: `hasta ${max} letras` };
	return { valor: s };
};
const numero = (max, paso = 1) => (v) => {
	const n = v === '' || v === null || v === undefined ? 0 : Number(v);
	if (!Number.isFinite(n) || n < 0 || n > max) return { error: `de 0 a ${max}` };
	return { valor: Math.round(n / paso) * paso };
};
const deLista = (opciones) => (v) => (opciones.includes(v ?? '') ? { valor: v ?? '' } : { error: 'elige una opción de la lista' });

// Calendarios de otras plataformas: solo https y de su página (el servidor los descarga).
const HOSTS_ICAL = { icalUrl: ['airbnb.com', 'airbnb.mx', 'airbnb.es', 'airbnb.com.gt'], icalBooking: ['booking.com'], icalVrbo: ['vrbo.com', 'homeaway.com'] };
const ical = (campo) => (v) => {
	const s = String(v ?? '').trim();
	if (!s) return { valor: '' };
	let u;
	try { u = new URL(s); } catch { return { error: 'pega el enlace completo (empieza con https://)' }; }
	const host = u.hostname.toLowerCase();
	if (u.protocol !== 'https:' || !HOSTS_ICAL[campo].some((h) => host === h || host.endsWith(`.${h}`)) || s.length > 600) return { error: 'tiene que ser el enlace del calendario de esa plataforma' };
	return { valor: s };
};
// Mapa de llegada: un enlace de Google Maps, o la dirección o coordenadas escritas (sin código ni otros enlaces).
const HOSTS_MAPA = ['google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl'];
const mapa = (v) => {
	const s = String(v ?? '').trim();
	if (!s) return { valor: '' };
	if (s.length > 600 || /[<>]/.test(s)) return { error: 'pega el enlace de Google Maps o escribe la dirección' };
	if (/^[a-z]+:/i.test(s) || /\bwww\./i.test(s)) {
		let u;
		try { u = new URL(s); } catch { return { error: 'pega el enlace completo de Google Maps' }; }
		const host = u.hostname.toLowerCase().replace(/^www\./, '');
		const esMaps = HOSTS_MAPA.includes(host) && (host !== 'google.com' || u.pathname.startsWith('/maps')) && (host !== 'goo.gl' || u.pathname.startsWith('/maps'));
		if (u.protocol !== 'https:' || !esMaps) return { error: 'solo enlaces de Google Maps' };
	}
	return { valor: s };
};
const amenidades = (v) => {
	if (!Array.isArray(v)) return { error: 'lista inválida' };
	const lista = [...new Set(v.map((a) => String(a ?? '').trim()).filter(Boolean))];
	if (lista.length > 40 || lista.some((a) => a.length > 60)) return { error: 'hasta 40, de 60 letras cada una' };
	return { valor: lista };
};

// Campo por campo: dónde vive (casa, privado/socio o privado/llegada), cómo se llama en la pantalla y su revisión.
// `ruta`: la del documento (con puntos). Huéspedes, precios, bloqueos y mínimos siguen en su calendario.
export const CAMPOS_DUENO = [
	{ campo: 'fotos', donde: 'casa', ruta: 'fotos', etiqueta: 'Fotos' },
	{ campo: 'titulo', donde: 'casa', ruta: 'titulo', etiqueta: 'Título', revisar: texto(90, { min: 5 }) },
	{ campo: 'descripcion', donde: 'casa', ruta: 'descripcion', etiqueta: 'Descripción', revisar: texto(6000, { min: 20 }) },
	{ campo: 'amenidades', donde: 'casa', ruta: 'amenidades', etiqueta: 'Amenidades', revisar: amenidades },
	{ campo: 'habitaciones', donde: 'casa', ruta: 'habitaciones', etiqueta: 'Habitaciones', revisar: numero(50) },
	{ campo: 'camas', donde: 'casa', ruta: 'vacacional.camas', etiqueta: 'Camas', revisar: numero(100) },
	{ campo: 'banos', donde: 'casa', ruta: 'banos', etiqueta: 'Baños', revisar: numero(50, 0.5) },
	{ campo: 'parqueos', donde: 'casa', ruta: 'parqueos', etiqueta: 'Parqueos', revisar: numero(50) },
	{ campo: 'checkIn', donde: 'casa', ruta: 'vacacional.checkIn', etiqueta: 'Hora de entrada', revisar: deLista(HORAS) },
	{ campo: 'checkOut', donde: 'casa', ruta: 'vacacional.checkOut', etiqueta: 'Hora de salida', revisar: deLista(HORAS) },
	{ campo: 'limpieza', donde: 'casa', ruta: 'vacacional.limpieza', etiqueta: 'Limpieza (por estancia)', revisar: numero(10000, 0.01) },
	{ campo: 'deposito', donde: 'casa', ruta: 'vacacional.deposito', etiqueta: 'Depósito', revisar: numero(50000, 0.01) },
	{ campo: 'mascotas', donde: 'casa', ruta: 'vacacional.mascotas', etiqueta: 'Mascotas', revisar: deLista(['', 'si', 'no']) },
	{ campo: 'cancelacion', donde: 'casa', ruta: 'vacacional.cancelacion', etiqueta: 'Cancelación', revisar: texto(1500) },
	{ campo: 'reglas', donde: 'casa', ruta: 'vacacional.reglas', etiqueta: 'Reglas de la casa', revisar: texto(2000) },
	{ campo: 'comoLlegar', donde: 'casa', ruta: 'vacacional.comoLlegar', etiqueta: 'Cómo llegar', revisar: texto(1500) },
	{ campo: 'estado', donde: 'casa', ruta: 'estado', etiqueta: 'En la página', revisar: deLista(ESTADOS_DUENO) },
	{ campo: 'direccion', donde: 'llegada', ruta: 'direccion', etiqueta: 'Dirección', revisar: texto(300) },
	{ campo: 'mapa', donde: 'llegada', ruta: 'mapa', etiqueta: 'Mapa', revisar: mapa },
	{ campo: 'icalUrl', donde: 'socio', ruta: 'icalUrl', etiqueta: 'Calendario de Airbnb', revisar: ical('icalUrl') },
	{ campo: 'icalBooking', donde: 'socio', ruta: 'icalBooking', etiqueta: 'Calendario de Booking', revisar: ical('icalBooking') },
	{ campo: 'icalVrbo', donde: 'socio', ruta: 'icalVrbo', etiqueta: 'Calendario de VRBO', revisar: ical('icalVrbo') }
];
const POR_CAMPO = Object.fromEntries(CAMPOS_DUENO.map((c) => [c.campo, c]));
export const campoDueno = (campo) => POR_CAMPO[campo];

// Textos que salen también en inglés: si cambian, el inglés se rehace (al marcar «Listo» en el aviso).
export const CAMPOS_CON_INGLES = ['titulo', 'descripcion', 'amenidades', 'reglas', 'cancelacion', 'comoLlegar'];

const NUMEROS = ['habitaciones', 'camas', 'banos', 'parqueos', 'limpieza', 'deposito'];
const leerRuta =(o, ruta) => ruta.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
// Lo que tiene guardado la casa ahora, con los nombres de campo de esta lista.
export function valoresDueno({ casa = {}, socio = {}, llegada = {} } = {}) {
	const fuente = { casa, socio, llegada };
	const out = {};
	for (const c of CAMPOS_DUENO) {
		const v = leerRuta(fuente[c.donde], c.ruta);
		if (c.campo === 'estado') out.estado = estadoDe(casa).valor;
		else if (c.campo === 'fotos') out.fotos = (v || []).map((f) => ({ ...f }));
		else if (c.campo === 'amenidades') out.amenidades = [...(v || [])];
		else if (c.campo === 'checkIn' || c.campo === 'checkOut') out[c.campo] = v || (c.campo === 'checkIn' ? '15:00' : '11:00');
		else if (NUMEROS.includes(c.campo)) out[c.campo] = Number(v) || 0;
		else out[c.campo] = v == null ? '' : String(v);
	}
	return out;
}

// Una foto con solo lo que se guarda de ella (lo demás que traiga se descarta).
function fotoLimpia(f = {}) {
	const o = { url: String(f.url || ''), path: String(f.path || '') };
	for (const k of ['ancho', 'alto']) if (Number.isFinite(Number(f[k])) && Number(f[k]) > 0) o[k] = Math.round(Number(f[k]));
	if (f.marca) o.marca = true;
	if (f.sinMarca) o.sinMarca = String(f.sinMarca);
	if (f.alt) o.alt = String(f.alt).slice(0, 200);
	return o;
}

// ¿Esta foto nueva es de la carpeta de esta casa en nuestro almacenamiento? (dirección de descarga de Firebase).
// `origenes`: de dónde sirve el almacenamiento (en el entorno de pruebas, además, el emulador).
export function fotoDeLaCasa(f, casaId, bucket, origenes = ['https://firebasestorage.googleapis.com']) {
	const path = String(f?.path || '');
	if (!path.startsWith(`properties/${casaId}/`) || path.includes('..') || path.length > 300) return false;
	let u;
	try { u = new URL(String(f.url || '')); } catch { return false; }
	return origenes.includes(u.origin)
		&& u.pathname === `/v0/b/${bucket}/o/${encodeURIComponent(path)}`;
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Revisa lo que manda el dueño contra lo guardado ahora. Devuelve qué se escribe en cada documento y la lista de
// cambios (antes y ahora, para el aviso del administrador). Lanza Error con un texto para el dueño si algo no va.
// `pedido`: { campo: valor } solo con lo que cambió en su pantalla. `fotosDe`: las fotos que esa casa ya tuvo (las
// de ahora y las que se quitaron antes), que pueden volver; una nueva tiene que ser de la carpeta de la casa.
export function revisarCambiosDueno({ casaId, bucket, actual, pedido = {}, fotosConocidas = [], origenes }) {
	const escribir = { casa: {}, socio: {}, llegada: {} };
	const cambios = [];
	const conocidas = new Set([...(actual.fotos || []), ...fotosConocidas].map((f) => f.path).filter(Boolean));
	for (const [campo, crudo] of Object.entries(pedido)) {
		const def = POR_CAMPO[campo];
		if (!def) throw new Error(`«${campo}» no se puede cambiar desde aquí.`);
		let valor;
		if (campo === 'fotos') {
			if (!Array.isArray(crudo) || crudo.length > MAX_FOTOS) throw new Error(`Fotos: hasta ${MAX_FOTOS}.`);
			if (!crudo.length) throw new Error('Fotos: deja al menos una.');
			valor = crudo.map(fotoLimpia);
			if (new Set(valor.map((f) => f.path)).size !== valor.length) throw new Error('Fotos: hay una repetida.');
			const ajena = valor.find((f) => !(conocidas.has(f.path) || fotoDeLaCasa(f, casaId, bucket, origenes)));
			if (ajena) throw new Error('Fotos: una de las fotos no es de esta casa. Súbela de nuevo.');
			// Una que ya estaba se guarda tal como estaba (solo cambia su lugar).
			const previas = new Map((actual.fotos || []).map((f) => [f.path, f]));
			valor = valor.map((f) => (previas.has(f.path) ? previas.get(f.path) : f));
		} else {
			const r = def.revisar(crudo);
			if (r.error) throw new Error(`${def.etiqueta}: ${r.error}.`);
			valor = r.valor;
		}
		if (campo === 'estado' && !ESTADOS_DUENO.includes(actual.estado)) throw new Error('El administrador cambió el estado de esta casa: pídele que la vuelva a poner disponible.');
		if (igual(valor, actual[campo])) continue;
		escribir[def.donde][def.ruta] = valor;
		cambios.push({ campo, etiqueta: def.etiqueta, antes: actual[campo] ?? '', ahora: valor });
	}
	return { escribir, cambios };
}

// Para deshacer: solo los campos que siguen como los dejó el dueño (si alguien los cambió después, no se pisan).
export function paraDeshacer(cambios, actual, campos = null) {
	const escribir = { casa: {}, socio: {}, llegada: {} };
	const hechos = [], saltados = [];
	for (const c of cambios) {
		if (campos && !campos.includes(c.campo)) continue;
		const def = POR_CAMPO[c.campo];
		if (!def) continue;
		if (!igual(actual[c.campo], c.ahora)) { saltados.push(c.etiqueta); continue; }
		escribir[def.donde][def.ruta] = c.antes;
		hechos.push(c.campo);
	}
	return { escribir, hechos, saltados };
}

// Texto corto de un valor para el aviso (antes / ahora).
export function textoValor(campo, v) {
	if (campo === 'fotos') return `${(v || []).length} fotos`;
	if (campo === 'amenidades') return (v || []).join(', ') || '—';
	if (campo === 'mascotas') return { si: 'Se aceptan', no: 'No se aceptan' }[v] || 'Sin indicar';
	if (campo === 'estado') return v === 'pausada' ? 'Pausada (no sale en la página)' : 'Disponible';
	if (v === '' || v === null || v === undefined) return '—';
	return String(v);
}
