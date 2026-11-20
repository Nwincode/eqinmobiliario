// Lo que ocupa las noches de una casa por noche, visto desde el servidor, y su copia en el CDN de Netlify.
// - externasDe(privado): las noches de Airbnb, Booking y VRBO (los calendarios iCal de properties/{id}/privado/socio),
//   cada rango con su plataforma. Una plataforma que no responde no tumba a las demás.
// - purgarCasa(id): borra del CDN lo que responde /api/disponibilidad (y el calendario de salida) de esa casa, con su
//   etiqueta `casa-{id}` (Netlify-Cache-Tag). La llaman quienes cambian sus fechas: aviso-chat (solicitud nueva),
//   reservas (el socio), plazos-reservas (lo que vence solo), mi-casa y el panel (POST /api/disponibilidad).
//   Usa NETLIFY_PURGE_API_TOKEN, que Netlify pone en las funciones; sin él no hace nada y el CDN igual olvida en 30 s.
import '../../js/calc-vacacional.js';

const V = globalThis.EQVacacional;

export const etiquetaCasa = (id) => `casa-${id}`;

async function leerIcal(url) {
	if (!/^https:\/\//i.test(url || '')) return null;
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 8000);
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

// Cada calendario leído se recuerda 10 min en la función (las plataformas no reciben un pedido por cada visita) y, si
// después no responde, vale lo último que respondió durante un día (un calendario caído no deja libres sus noches).
const LEIDOS = new Map();
const FRESCO = 10 * 60_000, ULTIMO = 24 * 3600_000;
async function leerIcalRecordado(url) {
	const ya = LEIDOS.get(url), ahora = Date.now();
	if (ya && ahora - ya.cuando < FRESCO) return ya.rangos;
	const rangos = await leerIcal(url);
	if (rangos) { LEIDOS.set(url, { rangos, cuando: ahora }); if (LEIDOS.size > 500) LEIDOS.delete(LEIDOS.keys().next().value); return rangos; }
	return ya && ahora - ya.cuando < ULTIMO ? ya.rangos : null;
}

// { rangos: [{ desde, hasta, fuente }], fuentes: ['airbnb', …] } (solo las que respondieron o se recuerdan).
export async function externasDe(privado) {
	const leidos = await Promise.all(V.CALENDARIOS.filter((c) => privado?.[c.campo]).map(async (c) => [c.nombre, await leerIcalRecordado(privado[c.campo])]));
	const rangos = [], fuentes = [];
	for (const [nombre, r] of leidos) if (r) { rangos.push(...r.map((x) => ({ ...x, fuente: nombre }))); fuentes.push(nombre.toLowerCase()); }
	return { rangos, fuentes };
}

export async function purgarCasa(...ids) {
	const token = process.env.NETLIFY_PURGE_API_TOKEN;
	const tags = [...new Set(ids.filter((x) => /^[A-Za-z0-9_-]{1,60}$/.test(x || '')))].map(etiquetaCasa);
	if (!token || !tags.length) return false;
	try {
		const res = await fetch('https://api.netlify.com/api/v1/purge', {
			method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
			body: JSON.stringify({ cache_tags: tags, ...(process.env.SITE_ID ? { site_id: process.env.SITE_ID } : {}) })
		});
		if (!res.ok) console.error('CDN: no se pudo purgar', res.status);
		return res.ok;
	} catch (err) {
		console.error('CDN: no se pudo purgar', err.message);
		return false;
	}
}
