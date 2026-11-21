// Cloudflare Turnstile: la prueba de «no soy un robot» (sin acertijos casi siempre) de la solicitud de reserva.
// Las llaves viven en Netlify: TURNSTILE_SITE_KEY (la pública, la recibe la página por GET /api/solicitud) y
// TURNSTILE_SECRET (la secreta, solo aquí). Se exige solo con las dos puestas: con una sola, una página sin la prueba no
// podría reservar. Sin llaves, la solicitud sigue con el límite por IP y por correo (netlify/lib/limite.mjs) y el
// registro de la función lo dice una vez por instancia.
const VERIFICAR = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
let avisado = false;

export const turnstileConfigurado = () => Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET);
export const llavePublica = () => (turnstileConfigurado() ? process.env.TURNSTILE_SITE_KEY : '');

// 'ok' si la prueba pasó (o si no está configurada); 'mala' si Cloudflare la rechazó; 'sin' si no llegó prueba (el
// navegador no pudo cargarla o hacerla) o Cloudflare no respondió: entonces la solicitud sigue, pero con un límite más
// estricto por IP y por correo (netlify/functions/solicitud.mjs). Nunca «pasa cualquier respuesta».
export async function pasaTurnstile(respuesta, ip) {
	if (!turnstileConfigurado()) {
		if (!avisado) { avisado = true; console.warn('Turnstile sin configurar (TURNSTILE_SITE_KEY y TURNSTILE_SECRET): las solicitudes solo tienen el límite por IP y por correo.'); }
		return 'ok';
	}
	if (typeof respuesta !== 'string' || !respuesta) return 'sin';
	if (respuesta.length > 2048) return 'mala';
	try {
		const cuerpo = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: respuesta });
		if (ip && ip !== 'anon') cuerpo.set('remoteip', ip);
		const res = await fetch(VERIFICAR, { method: 'POST', body: cuerpo, signal: AbortSignal.timeout(5000) });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const datos = await res.json();
		return datos.success === true ? 'ok' : 'mala';
	} catch (err) {
		console.error('Turnstile sin respuesta, sigue con el límite estricto:', err.message);
		return 'sin';
	}
}
