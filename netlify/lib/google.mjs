// Acceso a Google Search Console con una cuenta de servicio.
// Variables de entorno en Netlify: GOOGLE_SA_EMAIL y GOOGLE_SA_KEY (la "private_key" del JSON).
// La cuenta de servicio debe agregarse como usuario en Search Console (Configuración → Usuarios y permisos).
import { SignJWT, importPKCS8 } from 'jose';
import siteConfig from '../../site.config.json' with { type: 'json' };

const SCOPE = 'https://www.googleapis.com/auth/webmasters';
let cache = { token: '', exp: 0 };

export function googleConfigurado() {
	return Boolean(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_KEY);
}

export function propiedadPorDefecto() {
	return process.env.GSC_PROPERTY || `sc-domain:${new URL(siteConfig.siteUrl).hostname.replace(/^www\./, '')}`;
}

export async function googleToken() {
	if (cache.token && cache.exp > Date.now() + 60_000) return cache.token;
	const key = await importPKCS8(process.env.GOOGLE_SA_KEY.replace(/\\n/g, '\n'), 'RS256');
	const now = Math.floor(Date.now() / 1000);
	const assertion = await new SignJWT({ scope: SCOPE })
		.setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
		.setIssuer(process.env.GOOGLE_SA_EMAIL)
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
	if (!res.ok) throw new Error(`Google rechazó la cuenta de servicio: ${body.error_description || body.error || res.status}`);
	cache = { token: body.access_token, exp: Date.now() + body.expires_in * 1000 };
	return cache.token;
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
		throw new Error(res.status === 403
			? `Sin permiso en Search Console. Agrega ${process.env.GOOGLE_SA_EMAIL} como usuario de la propiedad. (${msg})`
			: msg);
	}
	return data;
}
