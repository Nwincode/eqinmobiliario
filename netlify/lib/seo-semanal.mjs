// Comparaciones de Search Console (puras, sin red): las usa el informe de cada semana (netlify/functions/seo-semanal.mjs;
// el panel lo muestra en «Bajaron esta semana»). Las prueba scripts/test-seo-semanal.mjs.

// Páginas que bajaron frente al periodo anterior: perdieron 30 % o más de sus clics (o desaparecieron) teniendo al menos
// 3, o cayeron 3 posiciones o más teniendo al menos 20 apariciones. Las que más clics perdieron, primero.
export function bajaron(ahora, antes, tope = 25) {
	const hoy = new Map(ahora.map((r) => [r.claves[0], r]));
	const cero = { clics: 0, impresiones: 0, ctr: 0, posicion: 0 };
	return antes
		.map((a) => ({ pagina: a.claves[0], antes: a, ahora: hoy.get(a.claves[0]) || cero }))
		.filter(({ antes: a, ahora: h }) => (a.clics >= 3 && h.clics < a.clics * 0.7)
			|| (a.impresiones >= 20 && h.posicion && a.posicion && h.posicion - a.posicion >= 3))
		.sort((x, y) => (y.antes.clics - y.ahora.clics) - (x.antes.clics - x.ahora.clics) || (y.ahora.posicion - y.antes.posicion) - (x.ahora.posicion - x.antes.posicion))
		.slice(0, tope);
}

// Búsquedas nuevas: aparecen 3 veces o más esta semana y no aparecían la anterior. Las que más aparecen, primero.
export function nuevas(ahora, antes, tope = 25) {
	const ya = new Set(antes.map((r) => r.claves[0]));
	return ahora.filter((r) => r.impresiones >= 3 && !ya.has(r.claves[0]))
		.sort((a, b) => b.impresiones - a.impresiones)
		.slice(0, tope)
		.map((r) => ({ consulta: r.claves[0], clics: r.clics, impresiones: r.impresiones, posicion: r.posicion }));
}

// Qué páginas del sitemap se revisan esta vez (la URL Inspection API tiene cuota y la función, poco tiempo): primero las
// nunca revisadas, luego las que no estaban en Google, luego las revisadas hace más tiempo.
export function porRevisar(urls, anteriores) {
	const antes = new Map(anteriores.map((x) => [x.url, x]));
	const orden = (u) => { const x = antes.get(u); return x ? [x.veredicto === 'PASS' ? 2 : 1, x.cuando || ''] : [0, '']; };
	return [...urls].sort((a, b) => { const [ga, ca] = orden(a), [gb, cb] = orden(b); return ga - gb || (ca < cb ? -1 : ca > cb ? 1 : 0); });
}

// La indexación de cada página del sitemap: lo revisado hoy y, de las demás, lo de la última vez (con su fecha).
// Las que ya no están en el sitemap salen.
export function indexacionAlDia(urls, anteriores, revisadas) {
	const antes = new Map(anteriores.map((x) => [x.url, x]));
	const hoy = new Map(revisadas.map((x) => [x.url, x]));
	return urls.map((u) => hoy.get(u) || antes.get(u)).filter(Boolean);
}
