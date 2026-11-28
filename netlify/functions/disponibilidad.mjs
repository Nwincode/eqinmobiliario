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
// navegador no la guarda. GET /api/disponibilidad/al-dia?id= (el sitio justo antes de enviar una solicitud, y el panel)
// no pasa por el CDN ni por lo recordado de las plataformas (las lee en ese momento: `fresco` en ocupacion.mjs); con
// límite por IP. Si privado/socio no se pudo leer (no es lo mismo que no tener calendarios), responde `sinLeer`: quien
// confirma revisa las plataformas a mano. Lleva también el precio, la limpieza, el depósito y los mínimos de noches de
// hoy: /api/solicitud los compara con lo que se le mostró al cliente.
// POST /api/disponibilidad { id } con el token del panel: el panel cambió fechas de la casa (Rentas, Solicitudes,
// el calendario del dueño) y se purga su copia del CDN.
import '../../js/calc-vacacional.js';
import { leerPublico, leerPrivado, datosConfigurados } from '../lib/firestore.mjs';
import { moraDe } from '../lib/comisiones.mjs';
import { externasDe, purgarCasa, etiquetaCasa, apartadasDe, sinLeerTodo } from '../lib/ocupacion.mjs';
import { json, usuario } from '../lib/auth.mjs';
import { condicionesDeLaCasa } from '../../admin/js/reservas-calculo.js';
import { limitador, limitadorDurable, ipDe } from '../lib/limite.mjs';

const V = globalThis.EQVacacional;
const CACHE = 30;
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const porUsuario = limitador(120);
// La consulta al día (sin CDN): límite por IP guardado en la base, compartido por todas las instancias.
// Si la base no responde, el de memoria: un cliente que va a reservar no se queda con un 429 por una falla nuestra.
const porIp = limitadorDurable('al-dia', 60, 10 * 60_000, { siFalla: 'memoria' });

function respuesta(status, body, id = '', fresco = false) {
	const headers = { 'Content-Type': 'application/json; charset=utf-8' };
	if (id && !fresco) {
		headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
		headers['Netlify-CDN-Cache-Control'] = `public, s-maxage=${CACHE}`;
		headers['Netlify-Cache-Tag'] = etiquetaCasa(id);
		headers['Netlify-Vary'] = 'query=id';
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
	// El equipo, cualquier casa; el socio, solo las suyas (la casa decide de quién es).
	const equipo = u.rol === 'admin' || u.rol === 'asesor';
	const suyas = equipo ? ids : (await Promise.all(ids.map(async (id) => ((await leerPrivado(`properties/${id}`).catch(() => null))?.propietarioId === u.propietarioId && u.propietarioId ? id : '')))).filter(Boolean);
	if (!suyas.length) return json(403, { error: 'Sin permiso' });
	return json(200, { purgado: await purgarCasa(...suyas) });
}

export default async (req, context) => {
	const entrada = Date.now();
	if (req.method === 'POST') return purgar(req);
	const url = new URL(req.url);
	const id = url.searchParams.get('id') || '';
	const fresco = url.pathname.endsWith('/al-dia');
	if (!ID.test(id)) return respuesta(400, { error: 'id' });
	if (fresco && await porIp(ipDe(req, context))) return respuesta(429, { error: 'Demasiados pedidos seguidos' });

	const p = await leerPublico(`properties/${id}`);
	if (!p || p.publicado !== true || p.operacion !== 'vacacional') return respuesta(404, { error: 'no encontrada' }, id, fresco);

	const manuales = [...(p.vacacional?.bloqueos || []), ...(p.vacacional?.reservadas || [])].map((b) => ({ desde: b?.desde, hasta: b?.hasta }));
	let externas = [];
	let fuentes = [];
	let apartadas = [];
	let atraso = 0;
	let sinLeer = [];
	let deHace = [];
	const ahora = Date.now();
	if (datosConfigurados()) {
		// Cada lectura falla por su cuenta: sin Airbnb o sin socio, el calendario igual responde. privado/socio que no se
		// pudo leer no cuenta como «sin calendarios»: `sinLeer`.
		const FALLO = Symbol('fallo');
		const [privado, abiertas, mora] = await Promise.all([
			leerPrivado(`properties/${id}/privado/socio`).catch(() => FALLO),
			apartadasDe(id, ahora),
			moraDe(p.propietarioId, ahora)
		].map((x) => Promise.resolve(x).catch(() => null)));
		// Al día: a lo más 3 s por plataforma (la página espera 5 s y Netlify corta a los 10); al confirmar desde el panel
		// (`para=confirmar`), 5 s, como /api/reservas. Lo que no responde, con lo último guardado del día (`deHace`: al
		// confirmar se revisa a mano) o en `sinLeer`. Guardar lo leído no pasa de los 8,5 s.
		const espera = url.searchParams.get('para') === 'confirmar' ? 5000 : 3000;
		const ext = privado === FALLO ? sinLeerTodo() : await externasDe(privado, id, fresco ? { fresco: true, espera, hasta: entrada + 8500 } : {});
		externas = ext.rangos.map((r) => ({ desde: r.desde, hasta: r.hasta }));
		fuentes = ext.fuentes;
		sinLeer = ext.sinLeer;
		deHace = ext.deHace || [];
		// Las que apartan las solicitudes abiertas (ocupacion.mjs `apartadasDe`, la misma que revisa /api/solicitud).
		apartadas = (abiertas || []).map((r) => ({ desde: r.desde, hasta: r.hasta }));
		atraso = mora || 0;
	}
	const hoy = V.hoy();
	const vigentes = (lista) => V.unirRangos(lista).filter((r) => r.hasta > hoy);
	const ocupadas = vigentes([...manuales, ...apartadas, ...externas]);
	// Precios al público, mínimos de noches, limpieza y depósito al día: el socio los cambia sin esperar a que se publique
	// el sitio. Los mismos que cotiza /api/solicitud (condicionesDeLaCasa, una sola pieza).
	const v = p.vacacional || {};
	const { plan, nochesMin, minimos, limpieza, deposito } = condicionesDeLaCasa(p, hoy);
	// Las personas que caben, al día (el socio las cambia en su panel): la regla de la solicitud compara con esto.
	// Solo un número de 1 o más (la regla `caben` igual: lo demás, sin tope).
	const huespedesMax = typeof v.huespedesMax === 'number' && v.huespedesMax >= 1 ? Math.floor(v.huespedesMax) : undefined;
	return respuesta(200, { ocupadas, externas: vigentes(externas), apartadas: vigentes(apartadas), plan, nochesMin, minimos, limpieza, deposito, ...(huespedesMax ? { huespedesMax } : {}), ...(atraso === 3 ? { pausada: true } : {}),
		fuente: fuentes.length ? fuentes.join(',') : 'manual', ...(sinLeer.length ? { sinLeer } : {}), ...(fresco && deHace.length ? { deHace } : {}) }, id, fresco);
};

export const config = { path: ['/api/disponibilidad', '/api/disponibilidad/al-dia'] };
