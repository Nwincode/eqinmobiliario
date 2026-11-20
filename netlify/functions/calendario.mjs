// El calendario de EQ de una casa por noche, para Airbnb, Booking y VRBO: así esas plataformas saben qué noches ya
// reservó un cliente de EQ y no las venden otra vez.
//   GET /api/calendario?casa=<id>&t=<llave>   → text/calendar con las reservas confirmadas (y pagadas) de la casa:
//     solo fechas, sin nombres ni datos del huésped (V.aICal). La llave es privada: sin ella, 404.
//   GET /api/calendario?casa=<id> con el token del panel (el administrador o el dueño de la casa) → { url }: el enlace
//     para pegar en la plataforma. La llave se crea la primera vez (properties/{id}/privado/calendario, con la cuenta
//     de escritura: en su propio documento, así privado/socio sigue sin existir hasta que haya precios) y sigue igual;
//     para cambiarla, el administrador borra ese documento y la vuelve a pedir.
// No van las noches que vienen de esas plataformas (cada una ya las tiene) ni las solicitudes sin confirmar.
// Ojo: Airbnb vuelve a mandar en su propio calendario lo que importa de aquí; una reserva de EQ que se cancela queda
// ocupada en el sitio hasta que Airbnb lea este calendario otra vez (unas horas).
import '../../js/calc-vacacional.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import siteConfig from '../../site.config.json' with { type: 'json' };
import { leerPrivado, donde, datosConfigurados } from '../lib/firestore.mjs';
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { json, usuario } from '../lib/auth.mjs';
import { etiquetaCasa } from '../lib/ocupacion.mjs';

const V = globalThis.EQVacacional;
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const LLAVE = /^[a-f0-9]{48}$/;
const RUTA = (id) => `properties/${id}/privado/calendario`;

const igual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const enlace = (id, llave) => `${siteConfig.siteUrl.replace(/\/$/, '')}/api/calendario?casa=${encodeURIComponent(id)}&t=${llave}`;

// El enlace para el administrador o el dueño de la casa (la llave se crea si no existe).
async function elEnlace(req, id) {
	let u = null;
	try { u = await usuario(req); } catch { /* token inválido */ }
	if (!u) return json(401, { error: 'Sesión inválida: vuelve a entrar.' });
	const casa = await leerPrivado(`properties/${id}`).catch(() => null);
	if (!casa || casa.operacion !== 'vacacional') return json(404, { error: 'No es una casa por noche.' });
	const suya = u.rol === 'socio' && u.propietarioId && casa.propietarioId === u.propietarioId;
	if (u.rol !== 'admin' && !suya) return json(403, { error: 'Solo el administrador o el dueño de la casa.' });
	const ya = (await leerPrivado(RUTA(id)).catch(() => null))?.llave;
	if (LLAVE.test(ya || '')) return json(200, { url: enlace(id, ya) });
	if (!escrituraConfigurada()) return json(503, { error: 'El servidor no está configurado.' });
	const llave = await transaccion(async (tx) => {
		const s = await tx.leer(RUTA(id));
		if (LLAVE.test(s?.llave || '')) return s.llave;
		const nueva = randomBytes(24).toString('hex');
		tx.crear(RUTA(id), { llave: nueva }, { ahora: ['creada'] });
		return nueva;
	});
	return json(200, { url: enlace(id, llave) });
}

export default async (req) => {
	if (req.method !== 'GET') return json(405, { error: 'Método no permitido' });
	const url = new URL(req.url);
	const id = url.searchParams.get('casa') || '';
	const llave = url.searchParams.get('t') || '';
	if (!ID.test(id)) return json(400, { error: 'casa' });
	if (!datosConfigurados()) return json(503, { error: 'El servidor no está configurado.' });
	if (!llave) return elEnlace(req, id);
	const guardada = LLAVE.test(llave) ? (await leerPrivado(RUTA(id)).catch(() => null))?.llave : '';
	const casa = guardada ? await leerPrivado(`properties/${id}`).catch(() => null) : null;
	if (!igual(llave, guardada) || casa?.operacion !== 'vacacional') return new Response('No existe', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
	const desde = V.sumarDias(V.hoy(), -30);
	const estancias = (await donde('reservas', 'propertyId', id)).filter((r) => r.estado === 'confirmada' && V.esFecha(r.llegada) && r.salida > desde)
		.map((r) => ({ id: r.id, desde: r.llegada, hasta: r.salida }));
	const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
	return new Response(V.aICal(estancias, sello), { status: 200, headers: {
		'Content-Type': 'text/calendar; charset=utf-8',
		'Cache-Control': 'public, max-age=0, must-revalidate',
		'Netlify-CDN-Cache-Control': 'public, s-maxage=300',
		'Netlify-Cache-Tag': etiquetaCasa(id),
		'Netlify-Vary': 'query=casa|t',
		'X-Robots-Tag': 'noindex'
	} });
};

export const config = { path: '/api/calendario' };
