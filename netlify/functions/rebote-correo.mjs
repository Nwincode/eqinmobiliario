// POST /api/rebote-correo?llave=…: el aviso de rebotes de ZeptoMail (webhook). La llave secreta va en la dirección
// (REBOTE_CORREO_LLAVE en Netlify; el dueño la pone al configurar el webhook: docs/pasos-del-dueno.md) y se compara en
// tiempo constante. Responde igual haya o no un lead con esa dirección; el cuerpo, hasta 64 KB.
import { timingSafeEqual, createHash } from 'node:crypto';
import { leerRebote, marcarRebote } from '../lib/rebotes.mjs';

const MAX = 64 * 1024;
const huella = (s) => createHash('sha256').update(String(s)).digest();
const llaveValida = (dada) => {
	const buena = String(process.env.REBOTE_CORREO_LLAVE || '');
	return buena.length >= 24 && timingSafeEqual(huella(dada), huella(buena));
};
const remitentes = () => String(process.env.CORREO_REMITENTE || '').match(/[^\s<>"]+@[^\s<>"]+/g) || [];

export default async (req) => {
	if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
	if (!llaveValida(new URL(req.url).searchParams.get('llave') || '')) return new Response('No autorizado', { status: 401 });
	const texto = await req.text();
	if (texto.length > MAX) return new Response('Demasiado grande', { status: 413 });
	let aviso;
	try { aviso = JSON.parse(texto); } catch { return new Response('JSON inválido', { status: 400 }); }
	try {
		const r = leerRebote(aviso, { propios: remitentes() });
		if (r.correos.length) await marcarRebote(r);
	} catch (err) {
		console.error('Rebote de correo:', err.message);
		return new Response('Error', { status: 500 });
	}
	return new Response('ok');
};

export const config = { path: '/api/rebote-correo' };
