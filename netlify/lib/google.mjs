// Acceso a Google Search Console con una cuenta de servicio.
// Variables de entorno en Netlify: GOOGLE_SA_EMAIL y GOOGLE_SA_KEY (la "private_key" del JSON).
// La cuenta de servicio debe agregarse como usuario en Search Console (Configuración → Usuarios y permisos).
// Aparte, la cuenta que ESCRIBE en la base (solo las reservas del socio, netlify/functions/reservas.mjs):
// GOOGLE_SA_ESCRITURA_EMAIL y GOOGLE_SA_ESCRITURA_KEY, con el rol «Cloud Datastore User». La de arriba sigue de solo lectura.
import { SignJWT, importPKCS8 } from 'jose';
import siteConfig from '../../site.config.json' with { type: 'json' };

const SCOPE = 'https://www.googleapis.com/auth/webmasters';
const cache = new Map(); // un token por cuenta y permiso (scope)

// Las dos cuentas de servicio, leídas en cada pedido (null si falta alguna de sus dos variables).
const cuenta = (email, key) => (email && key ? { email, key } : null);
export const cuentaLectura = () => cuenta(process.env.GOOGLE_SA_EMAIL, process.env.GOOGLE_SA_KEY);
export const cuentaEscritura = () => cuenta(process.env.GOOGLE_SA_ESCRITURA_EMAIL, process.env.GOOGLE_SA_ESCRITURA_KEY);
// La que pide a Google los enlaces para poner la contraseña (netlify/functions/contrasena.mjs), con el rol «Firebase
// Authentication Admin». Siempre una aparte: junto con la de escritura, una sola clave filtrada lo abriría todo.
export const cuentaAccesos = () => cuenta(process.env.GOOGLE_SA_ACCESOS_EMAIL, process.env.GOOGLE_SA_ACCESOS_KEY);

export function googleConfigurado() {
	return Boolean(cuentaLectura());
}

export function propiedadPorDefecto() {
	return process.env.GSC_PROPERTY || `sc-domain:${new URL(siteConfig.siteUrl).hostname.replace(/^www\./, '')}`;
}

// Un token de Google para esa cuenta (por defecto, la de solo lectura). Con `err.rechazo` si Google no la aceptó.
export async function googleToken(scope = SCOPE, sa = cuentaLectura()) {
	if (!sa) throw new Error('Falta la cuenta de servicio en las variables de Netlify.');
	const clave = `${sa.email} ${scope}`;
	const guardado = cache.get(clave);
	if (guardado && guardado.exp > Date.now() + 60_000) return guardado.token;
	let key;
	try {
		// La clave puede venir pegada tal cual del JSON: entre comillas y con \n escritos.
		key = await importPKCS8(sa.key.trim().replace(/^"|"$/g, '').replace(/\\n/g, '\n'), 'RS256');
	} catch {
		throw Object.assign(new Error('La clave de la cuenta de servicio no es válida: debe ser el "private_key" completo del JSON, desde -----BEGIN PRIVATE KEY----- hasta -----END PRIVATE KEY-----.'), { rechazo: true });
	}
	const now = Math.floor(Date.now() / 1000);
	const assertion = await new SignJWT({ scope })
		.setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
		.setIssuer(sa.email)
		.setAudience('https://oauth2.googleapis.com/token')
		.setIssuedAt(now)
		.setExpirationTime(now + 3600)
		.sign(key);
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
	});
	const body = await res.json();
	if (!res.ok) throw Object.assign(new Error(`Google rechazó la cuenta de servicio: ${body.error_description || body.error || res.status}`), { rechazo: true });
	cache.set(clave, { token: body.access_token, exp: Date.now() + body.expires_in * 1000 });
	return body.access_token;
}

export async function gsc(method, url, body) {
	const res = await fetch(url, {
		method,
		headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
	const text = await res.text();
	const data = text ? JSON.parse(text) : {};
	if (!res.ok) {
		const msg = data.error?.message || `Error ${res.status}`;
		// Google responde 403 tanto si la API está apagada como si la cuenta no es usuaria de la propiedad.
		const apiApagada = /has not been used|is disabled/i.test(msg);
		const err = new Error(apiApagada
			? 'La API "Google Search Console API" no está activada en Google Cloud.'
			: res.status === 403
				? `Sin permiso en Search Console. Agrega ${process.env.GOOGLE_SA_EMAIL} como usuario de la propiedad. (${msg})`
				: msg);
		err.falta = apiApagada ? 'api' : res.status === 403 ? 'permiso' : '';
		throw err;
	}
	return data;
}
