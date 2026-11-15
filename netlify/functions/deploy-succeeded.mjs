// Se ejecuta sola después de cada publicación exitosa en Netlify (función de evento).
// 1) Avisa a IndexNow (Bing, Copilot, Yandex, Seznam, Naver) de las URLs del sitemap que cambiaron (netlify/lib/indexnow.mjs).
//    Si falla, solo queda anotado: nunca detiene la publicación.
// 2) Si Search Console está conectado, vuelve a enviar el sitemap a Google.
import { createHash } from 'node:crypto';
import siteConfig from '../../site.config.json' with { type: 'json' };
import { gsc, googleConfigurado, propiedadPorDefecto } from '../lib/google.mjs';
import { urlsDelSitemap } from '../lib/indexnow.mjs';

const SITE_URL = siteConfig.siteUrl.replace(/\/$/, '');
// Debe coincidir con indexNowKey() de scripts/build.mjs.
const KEY = createHash('sha256').update(`indexnow:${siteConfig.siteUrl}`).digest('hex').slice(0, 32);

export async function handler(event) {
	let deploy = {};
	try {
		deploy = JSON.parse(event.body || '{}').payload || {};
	} catch {
		// Sin datos del deploy: se asume producción.
	}
	if (deploy.context && deploy.context !== 'production') return { statusCode: 200, body: 'Vista previa: no se notifica a buscadores.' };

	const resultado = {};
	try {
		// La lista la arma el build (/feeds/indexnow.json); sin ella, todo el sitemap.
		const cambios = await fetch(`${SITE_URL}/feeds/indexnow.json`).then((r) => (r.ok ? r.json() : { todas: true })).catch(() => ({ todas: true }));
		const urls = Array.isArray(cambios.urls) ? cambios.urls : urlsDelSitemap(await (await fetch(`${SITE_URL}/sitemap.xml`)).text(), SITE_URL);
		if (!urls.length) resultado.indexnow = 'sin cambios';
		else {
			const res = await fetch('https://api.indexnow.org/indexnow', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
				body: JSON.stringify({ host: new URL(SITE_URL).hostname, key: KEY, keyLocation: `${SITE_URL}/${KEY}.txt`, urlList: urls })
			});
			resultado.indexnow = `${res.status} (${urls.length} URLs)`;
		}
	} catch (err) {
		resultado.indexnow = `error: ${err.message}`;
	}
	if (googleConfigurado()) {
		try {
			const prop = process.env.GSC_PROPERTY || propiedadPorDefecto();
			await gsc('PUT', `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(prop)}/sitemaps/${encodeURIComponent(`${SITE_URL}/sitemap.xml`)}`);
			resultado.google = 'sitemap enviado';
		} catch (err) {
			resultado.google = `error: ${err.message}`;
		}
	}
	console.log('Notificación a buscadores:', resultado);
	return { statusCode: 200, body: JSON.stringify(resultado) };
}
