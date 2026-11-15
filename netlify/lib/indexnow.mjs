// IndexNow (Bing, Copilot, Yandex, Seznam, Naver): después de publicar se avisa solo de lo que cambió. Mandar todo el
// sitemap en cada publicación hace que los buscadores ignoren los avisos. El build compara su sitemap con el que está
// publicado (antes de reemplazarlo) y deja la lista en /feeds/indexnow.json; netlify/functions/deploy-succeeded.mjs
// la manda. Lo prueba scripts/test-seo.mjs.

const entradas = (xml, base) => new Map([...String(xml || '').matchAll(/<url>([\s\S]*?)<\/url>/g)]
	.map((m) => [(/<loc>([^<]+)<\/loc>/.exec(m[1]) || [])[1], (/<lastmod>([^<]+)<\/lastmod>/.exec(m[1]) || [])[1] || ''])
	.filter(([loc]) => loc && loc.startsWith(base)));

// URLs nuevas, con otro lastmod (la fecha real de la casa, la página o el artículo) o que ya no están (Google y Bing
// las vuelven a pedir y ven que se fueron).
export function urlsCambiadas(nuevo, anterior, siteUrl) {
	const base = String(siteUrl).replace(/\/$/, '');
	const ahora = entradas(nuevo, base), antes = entradas(anterior, base);
	return [
		...[...ahora].filter(([loc, mod]) => !antes.has(loc) || antes.get(loc) !== mod).map(([loc]) => loc),
		...[...antes.keys()].filter((loc) => !ahora.has(loc))
	].slice(0, 10000);
}

// Todas las URLs del sitemap: cuando no se pudo comparar (primera publicación, sitemap publicado ilegible).
export const urlsDelSitemap = (xml, siteUrl) => [...entradas(xml, String(siteUrl).replace(/\/$/, '')).keys()].slice(0, 10000);
