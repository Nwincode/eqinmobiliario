// Cloudflare Turnstile: la prueba de «no soy un robot» (sin acertijos casi siempre) de la solicitud de reserva.
// Las llaves viven en Netlify: TURNSTILE_SITE_KEY (la pública, la recibe la página por GET /api/solicitud) y
// TURNSTILE_SECRET (la secreta, solo aquí). Se exige solo con las dos puestas: con una sola, una página sin la prueba no
// podría reservar. Sin llaves, la solicitud sigue con el límite por IP y por correo (netlify/lib/limite.mjs) y el
// registro de la función lo dice una vez por instancia.
const VERIFICAR = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
let avisado = false;

export const turnstileConfigurado = () => Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET);
export const llavePublica = () => (turnstileConfigurado() ? process.env.TURNSTILE_SITE_KEY : '');

// true si la prueba pasó (o si no está configurada); false si no.
export async function pasaTurnstile(respuesta, ip) {
	if (!turnstileConfigurado()) {
		if (!avisado) { avisado = true; console.warn('Turnstile sin configurar (TURNSTILE_SITE_KEY y TURNSTILE_SECRET): las solicitudes solo tienen el límite por IP y por correo.'); }
		return true;
	}
	if (typeof respuesta !== 'string' || !respuesta || respuesta.length > 2048) return false;
	try {
		const cuerpo = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: respuesta });
		if (ip && ip !== 'anon') cuerpo.set('remoteip', ip);
		const res = await fetch(VERIFICAR, { method: 'POST', body: cuerpo, signal: AbortSignal.timeout(5000) });
		const datos = await res.json().catch(() => ({}));
		return datos.success === true;
	} catch (err) {
		// Cloudflare no respondió (caído o lento): una reserva de verdad no se pierde por una falla de fuera; sigue
		// frenando el límite por IP y por correo, y el registro lo dice.
		console.error('Turnstile sin respuesta, sigue con el límite:', err.message);
		return true;
	}
}
