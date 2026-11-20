// Publicar el sitio desde el panel: POST /api/publicar (Authorization: Bearer <token del equipo>).
// Lo usan «Publicar» y la publicación automática del panel (admin/js/session.js `publicarAhora`). El enlace de Netlify se
// lee aquí (nunca lo manda quien llama) y se revisa la respuesta: desde el navegador no se podía leer y un enlace
// borrado en Netlify se veía como publicado. Respuestas: 200 { ok }, 401/403, 502 { error } si Netlify no la aceptó,
// 503 sin la cuenta de servicio.
import { json, staffUser } from '../lib/auth.mjs';
import { datosConfigurados } from '../lib/firestore.mjs';
import { publicarSitio, estadoPublicacion } from '../lib/publicar.mjs';

export default async (req) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	let staff = null;
	try { staff = await staffUser(req); } catch { return json(401, { error: 'Sesión inválida: vuelve a entrar.' }); }
	if (!staff) return json(403, { error: 'Solo el equipo puede publicar.' });
	if (!datosConfigurados()) return json(503, { error: 'Falta la cuenta de servicio de Google en Netlify: no se puede publicar desde el panel.' });
	let hook;
	try { ({ hook } = await estadoPublicacion()); } catch (err) {
		console.error('publicar (leer):', err.message);
		return json(502, { error: 'No se pudo leer la configuración de publicación. Vuelve a intentarlo.' });
	}
	try {
		await publicarSitio(hook);
		return json(200, { ok: true });
	} catch (err) {
		console.error('publicar:', err.message);
		return json(502, { error: err.message });
	}
};

export const config = { path: '/api/publicar' };
