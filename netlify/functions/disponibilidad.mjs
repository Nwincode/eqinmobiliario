// Noches ocupadas de una renta vacacional. GET /api/disponibilidad?id=<id de la propiedad>
// Une las fechas bloqueadas y las reservas confirmadas del panel con los calendarios (iCal) de Airbnb, Booking y VRBO
// y con las solicitudes que apartan sus fechas (sin responder y dentro de su plazo de 24 h: apartaFechas en
// admin/js/reservas-calculo.js, la misma regla del calendario del socio y de Solicitudes).
// La solicitud va al chat de la reserva (la atiende el dueño desde su panel): el contacto del socio nunca sale de aquí.
// Si el socio debe una comisión hace más de 72 h, la casa queda en pausa.
// Los enlaces iCal son privados (properties/{id}/privado/socio) y se leen con la cuenta de servicio
// (GOOGLE_SA_EMAIL y GOOGLE_SA_KEY, rol "Cloud Datastore Viewer"). La respuesta lleva solo fechas:
// nada de nombres, descripciones ni los enlaces (`externas`: las de las plataformas, para el calendario del socio).
// Caché: el CDN la guarda 30 s con la etiqueta de la casa (netlify/lib/ocupacion.mjs la purga en cada cambio) y el
// navegador no la guarda. Con `&fresco=1` (el sitio, justo antes de enviar una solicitud) no pasa por el CDN.
// POST /api/disponibilidad { id } con el token del panel: el panel cambió fechas de la casa (Rentas, Solicitudes,
// el calendario del dueño, la ficha) y se purga su copia del CDN.
import '../../js/calc-vacacional.js';
import { leerPublico, leerPrivado, desde, datosConfigurados } from '../lib/firestore.mjs';
import { sociosEnMora } from '../lib/comisiones.mjs';
import { externasDe, purgarCasa, etiquetaCasa } from '../lib/ocupacion.mjs';
import { json, usuario } from '../lib/auth.mjs';
import { limitador } from '../lib/limite.mjs';
import { apartaFechas, HORAS_RESPUESTA } from '../../admin/js/reservas-calculo.js';

const V = globalThis.EQVacacional;
const CACHE = 30;
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const porUsuario = limitador(120);
const ms = (v) => (v instanceof Date ? v.getTime() : Date.parse(v || '') || 0);

function respuesta(status, body, id = '', fresco = false) {
	const headers = { 'Content-Type': 'application/json; charset=utf-8' };
	if (id && !fresco) {
		headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
		headers['Netlify-CDN-Cache-Control'] = `public, s-maxage=${CACHE}`;
		headers['Netlify-Cache-Tag'] = etiquetaCasa(id);
		headers['Netlify-Vary'] = 'query=id|fresco';
	} else {
		headers['Cache-Control'] = 'no-store';
	}
	return new Response(JSON.stringify(body), { status, headers });
}

async function purgar(req) {
	let u = null;
	try { u = await usuario(req); } catch { /* token inválido */ }
	if (!u) return json(401, { error: 'Sesión inválida' });
	if (porUsuario(u.uid)) return json(429, { error: 'Demasiados pedidos seguidos' });
	let ids = [];
	try { const b = await req.json(); ids = [].concat(b?.id || []).map(String).filter((x) => ID.test(x)).slice(0, 10); } catch { /* sin cuerpo */ }
	if (!ids.length) return json(400, { error: 'id' });
	return json(200, { purgado: await purgarCasa(...ids) });
}

export default async (req) => {
	if (req.method === 'POST') return purgar(req);
	const url = new URL(req.url);
	const id = url.searchParams.get('id') || '';
	const fresco = url.searchParams.get('fresco') === '1';
	if (!ID.test(id)) return respuesta(400, { error: 'id' });

	const p = await leerPublico(`properties/${id}`);
	if (!p || p.publicado !== true || p.operacion !== 'vacacional') return respuesta(404, { error: 'no encontrada' }, id, fresco);

	const manuales = [...(p.vacacional?.bloqueos || []), ...(p.vacacional?.reservadas || [])].map((b) => ({ desde: b?.desde, hasta: b?.hasta }));
	let externas = [];
	let fuentes = [];
	let apartadas = [];
	let atraso = 0;
	const ahora = Date.now();
	if (datosConfigurados()) {
		// Cada lectura falla por su cuenta: sin Airbnb o sin socio, el calendario igual responde.
		const [privado, recientes, mora] = await Promise.all([
			leerPrivado(`properties/${id}/privado/socio`),
			desde('leads', 'createdAt', new Date(ahora - HORAS_RESPUESTA * 3600_000)),
			p.propietarioId ? sociosEnMora() : null
		].map((x) => Promise.resolve(x).catch(() => null)));
		const ext = await externasDe(privado);
		externas = ext.rangos.map((r) => ({ desde: r.desde, hasta: r.hasta }));
		fuentes = ext.fuentes;
		apartadas = (recientes || []).filter((l) => l.propertyId === id && l.reserva?.llegada && apartaFechas('', l.solicitud?.estado, ms(l.createdAt), ahora))
			.map((l) => ({ desde: l.reserva.llegada, hasta: l.reserva.salida }));
		atraso = mora?.[p.propietarioId] || 0;
	}
	const hoy = V.hoy();
	const vigentes = (lista) => V.unirRangos(lista).filter((r) => r.hasta > hoy);
	const ocupadas = vigentes([...manuales, ...apartadas, ...externas]);
	// Precios al público y mínimos de noches al día: el socio los cambia sin esperar a que se publique el sitio.
	const v = p.vacacional || {};
	const plan = { base: Number(v.base) || 0, finde: Number(v.finde) || 0, tarifas: (v.tarifas || []).filter((x) => x?.hasta >= hoy) };
	// Un mínimo con la fecha final antes de la inicial (dato malo) no vale.
	const minimos = (v.minimos || []).filter((x) => x?.hasta >= hoy && x.desde <= x.hasta);
	// Las personas que caben, al día (el socio las cambia en su panel): la regla de la solicitud compara con esto.
	const huespedesMax = Number.isInteger(v.huespedesMax) && v.huespedesMax > 0 ? v.huespedesMax : undefined;
	return respuesta(200, { ocupadas, externas: vigentes(externas), apartadas: vigentes(apartadas), plan, minimos, ...(huespedesMax ? { huespedesMax } : {}), ...(atraso === 3 ? { pausada: true } : {}),
		fuente: fuentes.length ? fuentes.join(',') : 'manual' }, id, fresco);
};

export const config = { path: '/api/disponibilidad' };
