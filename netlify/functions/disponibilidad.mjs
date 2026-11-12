// Noches ocupadas de una renta vacacional. GET /api/disponibilidad?id=<id de la propiedad>
// Une las fechas bloqueadas y las reservas confirmadas del panel con el calendario de Airbnb (iCal) del socio
// y con las solicitudes de reserva sin responder de las últimas 2 horas (las fechas se apartan mientras tanto).
// También devuelve el WhatsApp del socio, a donde el sitio manda la solicitud.
// El enlace iCal es privado (properties/{id}/privado/socio) y se lee con la cuenta de servicio
// (GOOGLE_SA_EMAIL y GOOGLE_SA_KEY, rol "Cloud Datastore Viewer"). La respuesta lleva solo fechas:
// nada de nombres, descripciones ni el enlace. El CDN la recuerda 10 minutos.
import '../../js/calc-vacacional.js';
import { leerPublico, leerPrivado, desde, datosConfigurados } from '../lib/firestore.mjs';
import { telefonoWa } from '../../admin/js/formato.js';

const V = globalThis.EQVacacional;
const CACHE = 600;
const APARTADO = 2 * 3600_000;

function respuesta(status, body, cacheSegundos = 0) {
	const headers = { 'Content-Type': 'application/json; charset=utf-8' };
	if (cacheSegundos) {
		headers['Cache-Control'] = `public, max-age=${Math.min(cacheSegundos, 300)}`;
		headers['Netlify-CDN-Cache-Control'] = `public, s-maxage=${cacheSegundos}, stale-while-revalidate=300`;
		headers['Netlify-Vary'] = 'query=id';
	} else {
		headers['Cache-Control'] = 'no-store';
	}
	return new Response(JSON.stringify(body), { status, headers });
}

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

export default async (req) => {
	const id = new URL(req.url).searchParams.get('id') || '';
	if (!/^[A-Za-z0-9_-]{1,60}$/.test(id)) return respuesta(400, { error: 'id' });

	const p = await leerPublico(`properties/${id}`);
	if (!p || p.publicado !== true || p.operacion !== 'vacacional') return respuesta(404, { error: 'no encontrada' }, 60);

	const manuales = [...(p.vacacional?.bloqueos || []), ...(p.vacacional?.reservadas || [])].map((b) => ({ desde: b?.desde, hasta: b?.hasta }));
	let airbnb = null;
	let apartadas = [];
	let whatsapp = '';
	if (datosConfigurados()) {
		// Cada lectura falla por su cuenta: sin Airbnb o sin socio, el calendario igual responde.
		const [privado, recientes, socio] = await Promise.all([
			leerPrivado(`properties/${id}/privado/socio`),
			desde('leads', 'createdAt', new Date(Date.now() - APARTADO)),
			p.propietarioId ? leerPrivado(`propietarios/${p.propietarioId}`) : null
		].map((x) => Promise.resolve(x).catch(() => null)));
		if (privado?.icalUrl) airbnb = await leerIcal(privado.icalUrl);
		apartadas = (recientes || []).filter((l) => l.propertyId === id && l.reserva?.llegada && !l.solicitud?.estado)
			.map((l) => ({ desde: l.reserva.llegada, hasta: l.reserva.salida }));
		whatsapp = telefonoWa(socio?.telefono);
	}
	const hoy = new Date().toISOString().slice(0, 10);
	const ocupadas = V.unirRangos([...manuales, ...apartadas, ...(airbnb || [])]).filter((r) => r.hasta > hoy);
	// Precios al público y mínimos de noches al día: el socio los cambia sin esperar a que se publique el sitio.
	const v = p.vacacional || {};
	const plan = { base: Number(v.base) || 0, finde: Number(v.finde) || 0, tarifas: (v.tarifas || []).filter((x) => x?.hasta >= hoy) };
	const minimos = (v.minimos || []).filter((x) => x?.hasta >= hoy);
	return respuesta(200, { ocupadas, plan, minimos, whatsapp, fuente: airbnb ? 'airbnb' : 'manual' }, CACHE);
};

export const config = { path: '/api/disponibilidad' };
