// Publicar el sitio desde el panel: POST /api/publicar (Authorization: Bearer <token del equipo>).
// Lo usan «Publicar» y la publicación automática del panel (admin/js/session.js `publicarAhora`), también al cerrar el
// panel (sendBeacon no manda encabezados: el token va en el cuerpo, { token, automatica }). El enlace de Netlify se lee
// aquí (nunca lo manda quien llama) y se revisa la respuesta: desde el navegador no se podía leer y un enlace borrado en
// Netlify se veía como publicado. Si Netlify la aceptó, se marca publicado aquí (marcarPublicado). Respuestas:
// 200 { ok, marcado }, 401/403, 502 { error } si Netlify no la aceptó, 503 sin la cuenta de servicio.
import { json, staffUser } from '../lib/auth.mjs';
import { datosConfigurados } from '../lib/firestore.mjs';
import { publicarSitio, estadoPublicacion, marcarPublicado } from '../lib/publicar.mjs';

export default async (req) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	let cuerpo = {};
	try { cuerpo = JSON.parse((await req.text()) || '{}') || {}; } catch { /* sin cuerpo */ }
	const conToken = req.headers.get('authorization') || !cuerpo.token ? req
		: { headers: new Headers({ authorization: `Bearer ${String(cuerpo.token).slice(0, 4096)}` }) }; // auth.mjs solo lee el encabezado
	let staff = null;
	try { staff = await staffUser(conToken); } catch { return json(401, { error: 'Sesión inválida: vuelve a entrar.' }); }
	if (!staff) return json(403, { error: 'Solo el equipo puede publicar.' });
	if (!datosConfigurados()) return json(503, { error: 'Falta la cuenta de servicio de Google en Netlify: no se puede publicar desde el panel.' });
	let hook;
	try { ({ hook } = await estadoPublicacion()); } catch (err) {
		console.error('publicar (leer):', err.message);
		return json(502, { error: 'No se pudo leer la configuración de publicación. Vuelve a intentarlo.' });
	}
	try {
		await publicarSitio(hook);
	} catch (err) {
		console.error('publicar:', err.message);
		return json(502, { error: err.message });
	}
	let marcado = false;
	try { marcado = await marcarPublicado({ por: staff.nombre || '', automatica: cuerpo.automatica === true }); } catch (err) { console.error('publicar (marcar):', err.message); }
	return json(200, { ok: true, marcado });
};

export const config = { path: '/api/publicar' };
