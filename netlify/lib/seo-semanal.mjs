// Comparaciones de Search Console (puras, sin red): las usa el informe de cada lunes (netlify/functions/seo-semanal.mjs;
// el panel lo muestra en «Bajaron en los últimos 28 días»). Las prueba scripts/test-seo-semanal.mjs.

// Páginas que bajaron frente al periodo anterior (el informe compara 28 días contra los 28 anteriores: con pocas visitas,
// una semana contra otra marca páginas que no cambiaron). Bajó si:
//  - tenía 5 clics o más, perdió el 30 % o más (o desapareció) y la caída es más que el azar: antes − ahora ≥ 2·√(antes + ahora)
//    (dos desviaciones de la diferencia de dos conteos de Poisson);
//  - o cayó 3 posiciones o más con 50 apariciones o más en los dos periodos (con menos, la posición media es puro ruido).
// Las que más clics perdieron, primero.
export function bajaron(ahora, antes, tope = 25) {
	const hoy = new Map(ahora.map((r) => [r.claves[0], r]));
	const cero = { clics: 0, impresiones: 0, ctr: 0, posicion: 0 };
	const perdio = (a, h) => a >= 5 && 10 * (a - h) >= 3 * a && a - h >= 2 * Math.sqrt(a + h);
	return antes
		.map((a) => ({ pagina: a.claves[0], antes: a, ahora: hoy.get(a.claves[0]) || cero }))
		.filter(({ antes: a, ahora: h }) => perdio(a.clics, h.clics)
			|| (a.impresiones >= 50 && h.impresiones >= 50 && h.posicion && a.posicion && h.posicion - a.posicion >= 3))
		.sort((x, y) => (y.antes.clics - y.ahora.clics) - (x.antes.clics - x.ahora.clics) || (y.ahora.posicion - y.antes.posicion) - (x.ahora.posicion - x.antes.posicion))
		.slice(0, tope);
}

// Búsquedas nuevas: aparecen 3 veces o más esta semana (7 días) y no aparecían la anterior. Las que más aparecen, primero.
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
