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
		err.status = res.status;
		throw err;
	}
	return data;
}

// ---- Search Console: lo usan el panel (netlify/functions/gsc.mjs) y el informe semanal (seo-semanal.mjs).
const SITIO = siteConfig.siteUrl.replace(/\/$/, '');
export const sitioGSC = (prop) => `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(prop)}`;

// Solo la propiedad de Search Console de ESTE sitio: la del dominio (sc-domain:) o la de su dirección, con o sin www,
// o la de GSC_PROPERTY. La que manda el panel (Contenido → SEO) vale si es una de esas; cualquier otra (otra propiedad a
// la que la cuenta de servicio tenga acceso) se cambia por la del sitio: un asesor no consulta datos ajenos.
const DOMINIO = new URL(SITIO).hostname.replace(/^www\./, '').toLowerCase();
export function propiedadValida(p) {
	const v = String(p || '').trim();
	const delSitio = new Set([propiedadPorDefecto(), `sc-domain:${DOMINIO}`,
		...['https', 'http'].flatMap((esquema) => [`${esquema}://${DOMINIO}/`, `${esquema}://www.${DOMINIO}/`])]);
	return delSitio.has(v) || delSitio.has(v.toLowerCase()) ? v : propiedadPorDefecto();
}

const dia = (d) => d.toISOString().slice(0, 10);
// Los últimos `dias` (o los de antes, con `desplazamiento`). Search Console tarda ~2 días en consolidar los datos.
export function rangoGSC(dias, desplazamiento = 0) {
	const fin = new Date(Date.now() - (2 + desplazamiento) * 86400000);
	const inicio = new Date(fin.getTime() - (dias - 1) * 86400000);
	return { startDate: dia(inicio), endDate: dia(fin) };
}

export const filaGSC = (r) => ({ claves: r.keys || [], clics: r.clicks || 0, impresiones: r.impressions || 0, ctr: r.ctr || 0, posicion: r.position || 0 });

// Búsquedas, clics, impresiones y posición (searchAnalytics/query), con los datos ya consolidados.
export async function consultaGSC(prop, cuerpo) {
	const data = await gsc('POST', `${sitioGSC(prop)}/searchAnalytics/query`, { dataState: 'final', ...cuerpo });
	return (data.rows || []).map(filaGSC);
}

// ¿Está esta página en Google? (URL Inspection API: 2,000 por día y 600 por minuto por propiedad.)
export async function inspeccionarGSC(prop, url) {
	const r = await gsc('POST', 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: url, siteUrl: prop, languageCode: 'es' });
	const idx = r.inspectionResult?.indexStatusResult || {};
	return {
		veredicto: idx.verdict,
		cobertura: idx.coverageState,
		rastreo: idx.lastCrawlTime,
		canonicaGoogle: idx.googleCanonical,
		canonicaUsuario: idx.userCanonical,
		robots: idx.robotsTxtState,
		indexacion: idx.indexingState,
		movil: r.inspectionResult?.mobileUsabilityResult?.verdict,
		enriquecidos: (r.inspectionResult?.richResultsResult?.detectedItems || []).map((d) => d.richResultType),
		enlace: r.inspectionResult?.inspectionResultLink
	};
}
