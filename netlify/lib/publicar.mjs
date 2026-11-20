// Publicar el sitio: el enlace de publicación de Netlify (settings/private.netlifyBuildHook) se llama solo desde el
// servidor y se revisa la respuesta (desde el navegador Netlify no deja leerla: un enlace borrado parecía un éxito).
// La usan netlify/functions/publicar.mjs (el botón «Publicar» y la publicación automática del panel),
// publicar-pendiente.mjs y comisiones-vencidas.mjs. Lo que pasa después del pedido lo dicen deploy-failed.mjs y
// deploy-succeeded.mjs (marcan y quitan `fallo` en meta/publish).
import { leerPrivado } from './firestore.mjs';

// Lo que deploy-failed.mjs deja en meta/publish; deploy-succeeded.mjs lo reconoce para quitar el «sin publicar».
export const DESC_FALLO = 'La última publicación falló; el sitio anterior sigue en línea';

// Pide la publicación. Lanza un error con el motivo si no hay enlace o Netlify no la aceptó.
export async function publicarSitio(hook) {
	if (!hook) throw new Error('Falta el enlace de publicación de Netlify (Publicar → Configuración).');
	const res = await fetch(hook, { method: 'POST', body: '{}' });
	if (!res.ok) throw new Error(res.status === 404 ? 'Netlify no reconoce el enlace de publicación: revisa que siga activo en Netlify.' : `Netlify respondió ${res.status}.`);
}

// Estado y configuración de la publicación, leídos con la cuenta de solo lectura.
export async function estadoPublicacion() {
	const [estado, priv] = await Promise.all([leerPrivado('meta/publish'), leerPrivado('settings/private')]);
	return { estado: estado || {}, hook: priv?.netlifyBuildHook || '', auto: Boolean(priv?.autoPublicar) };
}
