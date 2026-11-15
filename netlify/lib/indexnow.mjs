// IndexNow (Bing, Copilot, Yandex, Seznam, Naver): después de publicar se avisa solo de lo que cambió. Mandar todo el
// sitemap en cada publicación hace que los buscadores ignoren los avisos. «Cambió» = su lastmod (la fecha real de la
// casa, la página o el artículo; scripts/build.mjs) cae en los últimos `dias` días. Lo prueba scripts/test-seo.mjs.
export function urlsCambiadas(xml, siteUrl, { hoy = new Date(), dias = 2 } = {}) {
	const base = String(siteUrl).replace(/\/$/, '');
	const desde = new Date(hoy.getTime() - dias * 86400000).toISOString().slice(0, 10);
	return [...String(xml).matchAll(/<url>([\s\S]*?)<\/url>/g)]
		.map((m) => ({ loc: (/<loc>([^<]+)<\/loc>/.exec(m[1]) || [])[1], lastmod: (/<lastmod>([^<]+)<\/lastmod>/.exec(m[1]) || [])[1] }))
		.filter((u) => u.loc && u.loc.startsWith(base) && u.lastmod && u.lastmod.slice(0, 10) >= desde)
		.map((u) => u.loc)
		.slice(0, 10000);
}
