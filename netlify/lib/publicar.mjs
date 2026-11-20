// Publicar el sitio: el enlace de publicación de Netlify (settings/private.netlifyBuildHook) se llama solo desde el
// servidor y se revisa la respuesta (desde el navegador Netlify no deja leerla: un enlace borrado parecía un éxito).
// La usan netlify/functions/publicar.mjs (el botón «Publicar» y la publicación automática del panel),
// publicar-pendiente.mjs y comisiones-vencidas.mjs. Lo que pasa después del pedido lo dicen deploy-failed.mjs y
// deploy-succeeded.mjs (marcan y quitan `fallo` en meta/publish).
import { leerPrivado } from './firestore.mjs';
import { escrituraConfigurada, transaccion } from './firestore-escritura.mjs';

// Lo que deploy-failed.mjs deja en meta/publish; deploy-succeeded.mjs lo reconoce para quitar el «sin publicar».
export const DESC_FALLO = 'La última publicación falló; el sitio anterior sigue en línea';

// Pide la publicación. Lanza un error con el motivo si no hay enlace o Netlify no la aceptó.
export async function publicarSitio(hook) {
	if (!hook) throw new Error('Falta el enlace de publicación de Netlify (Publicar → Configuración).');
	const res = await fetch(hook, { method: 'POST', body: '{}' });
	if (!res.ok) throw new Error(res.status === 404 ? 'Netlify no reconoce el enlace de publicación: revisa que siga activo en Netlify.' : `Netlify respondió ${res.status}.`);
}

// Después de que Netlify aceptó la publicación: «publicado» en meta/publish (sin pendiente ni fallo), con la cuenta de
// escritura. Así lo que se publicó al cerrar el panel (sendBeacon) no lo vuelve a publicar publicar-pendiente.mjs.
// Devuelve true si quedó marcado (sin la cuenta, lo marca el panel).
export async function marcarPublicado({ por = '', automatica = false } = {}) {
	if (!escrituraConfigurada()) return false;
	await transaccion(async ({ leer, crear, cambiar }) => {
		const datos = { pendiente: false, fallo: false, ultimaPublicacionPor: por, ultimaPublicacionAuto: automatica };
		if (await leer('meta/publish')) cambiar('meta/publish', datos, { ahora: ['ultimaPublicacion'] });
		else crear('meta/publish', datos, { ahora: ['ultimaPublicacion'] });
	});
	return true;
}

// Estado y configuración de la publicación, leídos con la cuenta de solo lectura.
export async function estadoPublicacion() {
	const [estado, priv] = await Promise.all([leerPrivado('meta/publish'), leerPrivado('settings/private')]);
	return { estado: estado || {}, hook: priv?.netlifyBuildHook || '', auto: Boolean(priv?.autoPublicar) };
}
