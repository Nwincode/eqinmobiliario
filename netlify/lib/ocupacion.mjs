// Lo que ocupa las noches de una casa por noche, visto desde el servidor, y su copia en el CDN de Netlify.
// - externasDe(privado): las noches de Airbnb, Booking y VRBO (los calendarios iCal de properties/{id}/privado/socio),
//   cada rango con su plataforma. Una plataforma que no responde no tumba a las demás.
// - purgarCasa(id): borra del CDN lo que responde /api/disponibilidad (y el calendario de salida) de esa casa, con su
//   etiqueta `casa-{id}` (Netlify-Cache-Tag). La llaman quienes cambian sus fechas: aviso-chat (solicitud nueva),
//   reservas (el socio), plazos-reservas (lo que vence solo), mi-casa y el panel (POST /api/disponibilidad).
//   Usa NETLIFY_PURGE_API_TOKEN, que Netlify pone en las funciones (y SITE_ID si está); sin él no hace nada y el CDN
//   igual olvida en 30 s. Cada falla queda en el registro («CDN: no se pudo purgar»).
import '../../js/calc-vacacional.js';
import { leerPrivado, desde } from './firestore.mjs';
import { apartaFechas, yaRespondida, HORAS_RESPUESTA } from '../../admin/js/reservas-calculo.js';
import { escrituraConfigurada, transaccion } from './firestore-escritura.mjs';

const V = globalThis.EQVacacional;

export const etiquetaCasa = (id) => `casa-${id}`;

async function leerIcal(url, espera = 8000) {
	if (!/^https:\/\//i.test(url || '')) return null;
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), espera);
	try {
		const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'text/calendar' } });
		if (!res.ok) return null;
		const texto = (await res.text()).slice(0, 2_000_000);
		return /BEGIN:VCALENDAR/i.test(texto) ? V.parseICal(texto) : null;
	} catch {
		return null;
	} finally {
		clearTimeout(t);
	}
}

// Cada calendario leído se recuerda 10 min en la función (las plataformas no reciben un pedido por cada visita) y lo
// último que respondió queda en la base (properties/{id}/privado/icalLeido, con la cuenta de escritura) para todas las
// funciones: si después no responde, vale eso durante un día (un calendario caído no deja libres sus noches). Uno que no
// responde y no tiene nada guardado de ese día va en `sinLeer` (al confirmar, el socio revisa la plataforma a mano).
const LEIDOS = new Map();
const FRESCO = 10 * 60_000, ULTIMO = 24 * 3600_000;
const RUTA = (id) => `properties/${id}/privado/icalLeido`;

// { rangos: [{ desde, hasta, fuente }], fuentes: ['airbnb', …], sinLeer: ['Airbnb', …] }.
// `espera`: cuánto se espera a cada plataforma (al confirmar, poco: la función de Netlify se corta a los 10 s).
export async function externasDe(privado, casaId = '', { espera = 8000 } = {}) {
	const ahora = Date.now();
	const cals = V.CALENDARIOS.filter((c) => privado?.[c.campo]);
	let guardado;
	const deLaBase = async () => {
		if (guardado === undefined) guardado = casaId ? await leerPrivado(RUTA(casaId)).catch(() => null) : null;
		return guardado;
	};
	const nuevos = {};
	const leidos = await Promise.all(cals.map(async (c) => {
		const url = privado[c.campo];
		const mem = LEIDOS.get(url);
		if (mem && ahora - mem.cuando < FRESCO) return [c, mem.rangos];
		const rangos = await leerIcal(url, espera);
		if (rangos) {
			LEIDOS.set(url, { rangos, cuando: ahora });
			if (LEIDOS.size > 500) LEIDOS.delete(LEIDOS.keys().next().value);
			const g = (await deLaBase())?.[c.campo];
			if (!g || g.url !== url || ahora - (Number(g.cuando) || 0) > FRESCO || JSON.stringify(g.rangos) !== JSON.stringify(rangos)) nuevos[c.campo] = { url, rangos, cuando: ahora };
			return [c, rangos];
		}
		const g = (await deLaBase())?.[c.campo];
		if (g && g.url === url && ahora - (Number(g.cuando) || 0) < ULTIMO) return [c, g.rangos || []];
		return [c, null];
	}));
	if (casaId && Object.keys(nuevos).length && escrituraConfigurada()) {
		await transaccion(async (tx) => { if (await tx.leer(RUTA(casaId))) tx.cambiar(RUTA(casaId), nuevos); else tx.crear(RUTA(casaId), nuevos); })
			.catch((err) => console.error('Calendarios (guardar lo leído):', err.message));
	}
	const rangos = [], fuentes = [], sinLeer = [];
	for (const [c, r] of leidos) {
		if (r) { rangos.push(...r.map((x) => ({ desde: x.desde, hasta: x.hasta, fuente: c.nombre }))); fuentes.push(c.nombre.toLowerCase()); }
		else sinLeer.push(c.nombre);
	}
	return { rangos, fuentes, sinLeer };
}

export async function purgarCasa(...ids) {
	const token = process.env.NETLIFY_PURGE_API_TOKEN;
	const tags = [...new Set(ids.filter((x) => /^[A-Za-z0-9_-]{1,60}$/.test(x || '')))].map(etiquetaCasa);
	if (!token || !tags.length) return false;
	// A lo más 3 s: quien la llama (una respuesta, el cron) no se queda esperando; el CDN igual olvida en 30 s.
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 3000);
	try {
		const res = await fetch('https://api.netlify.com/api/v1/purge', {
			method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
			body: JSON.stringify({ cache_tags: tags, ...(process.env.SITE_ID ? { site_id: process.env.SITE_ID } : {}) })
		});
		if (!res.ok) console.error('CDN: no se pudo purgar', res.status, tags.join(','));
		return res.ok;
	} catch (err) {
		console.error('CDN: no se pudo purgar', err.message, tags.join(','));
		return false;
	} finally {
		clearTimeout(t);
	}
}

// Las fechas que apartan las solicitudes abiertas de una casa: [{ desde, hasta, leadId }]. Solo las que el servidor
// cotizó a un precio válido (montosSolicitud: una escrita a mano contra la base no aparta) y siguen en su plazo. La usan
// /api/disponibilidad (el calendario) y /api/solicitud (una nueva no se guarda encima). Si la lista no se puede leer, lanza.
const msDe = (v) => (v instanceof Date ? v.getTime() : Date.parse(v || '') || 0);
export async function apartadasDe(propertyId, ahora = Date.now()) {
	const recientes = await desde('leads', 'createdAt', new Date(ahora - HORAS_RESPUESTA * 3600_000));
	const abiertas = (recientes || []).filter((l) => l.propertyId === propertyId && l.reserva?.llegada && !yaRespondida('', l.solicitud?.estado));
	const montos = await Promise.all(abiertas.map((l) => leerPrivado(`montosSolicitud/${l.id}`).catch(() => null)));
	return abiertas.filter((l, i) => apartaFechas('', l.solicitud?.estado, msDe(l.createdAt), montos[i], ahora))
		.map((l) => ({ desde: l.reserva.llegada, hasta: l.reserva.salida, leadId: l.id }));
}
