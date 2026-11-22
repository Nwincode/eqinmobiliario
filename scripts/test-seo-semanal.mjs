// Pruebas del informe semanal de Search Console (netlify/functions/seo-semanal.mjs y netlify/lib/seo-semanal.mjs), con la
// base simulada (scripts/simulado/) y Google simulado: qué páginas bajaron, qué búsquedas son nuevas, qué páginas se
// revisan cada semana y que lo no revisado conserva lo de la última vez.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { S, limpiar, poner, leer } from './simulado/base.mjs';
import { bajaron, nuevas, porRevisar, indexacionAlDia } from '../netlify/lib/seo-semanal.mjs';

let ok = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); ok++; console.log('✓', nombre); };
const f = (clave, clics, impresiones, posicion) => ({ claves: [clave], clics, impresiones, ctr: impresiones ? clics / impresiones : 0, posicion });

await t('bajaron: perdió 30 % de 5 clics o más y más que el azar, desapareció, o cayó 3 posiciones con 50 apariciones en los dos', () => {
	const antes = [f('/a', 20, 400, 4), f('/b', 10, 100, 4), f('/c', 6, 60, 3), f('/d', 2, 80, 5), f('/e', 1, 10, 2), f('/f', 8, 200, 6), f('/g', 30, 30, 4), f('/h', 4, 40, 5)];
	const ahora = [f('/a', 10, 300, 4), f('/b', 6, 90, 4), f('/d', 2, 60, 9), f('/e', 0, 10, 9), f('/f', 3, 200, 6.5), f('/g', 30, 40, 8), f('/h', 0, 40, 5)];
	// /a: 20 → 10, pero 10 < 2·√30 ≈ 11 (azar); /b: 10 → 6, azar; /c: 6 → 0, 6 ≥ 2·√6 ≈ 4.9, bajó; /d: 4 posiciones con 80 y
	// 60 apariciones, bajó; /e: 1 clic, poco; /f: 8 → 3, 5 < 2·√11 ≈ 6.6 (azar); /g: 4 posiciones pero 30 apariciones antes;
	// /h: 4 clics, menos de 5.
	assert.deepEqual(bajaron(ahora, antes).map((x) => x.pagina), ['/c', '/d']);
	assert.equal(bajaron(ahora, antes)[0].ahora.clics, 0, 'la que desapareció, con cero');
	assert.deepEqual(bajaron([f('/a', 8, 400, 4)], [f('/a', 20, 400, 4)]).map((x) => x.pagina), ['/a'], '20 → 8: 12 ≥ 2·√28 ≈ 10.6');
	assert.deepEqual(bajaron([f('/a', 7, 100, 4)], [f('/a', 10, 100, 4)]), [], 'perdió el 30 % justo, pero es azar');
});

// Un sitio con pocas visitas, con semilla (siempre los mismos números): 30 páginas con 0.15 a 1.5 clics al día y la
// posición media con su ruido. Cuántas marca un lunes sin que nada cambiara (falsas alarmas), con 28 días contra 28 (lo de
// ahora) y con la regla de antes (7 contra 7); y cuántas de las que perdieron la mitad de sus clics encuentra: depende de
// las visitas (con 2 clics al día, más de 8 de cada 10; con 1, más o menos la mitad; con menos, no se distingue del azar).
await t('simulación: 28 contra 28 casi no da falsas alarmas y encuentra las que bajaron a la mitad', () => {
	let semilla = 20261122;
	const azar = () => { semilla = (semilla + 0x6D2B79F5) | 0; let x = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
	const poisson = (l) => { let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= azar(); } while (p > L); return k - 1; };
	const normal = () => Math.sqrt(-2 * Math.log(1 - azar())) * Math.cos(2 * Math.PI * azar());
	// Clics e impresiones de `dias` días; la posición media se mueve menos cuantas más impresiones.
	const periodo = (pagina, porDia, dias, posicion) => {
		const impresiones = poisson(porDia * 25 * dias), clics = poisson(porDia * dias);
		return f(pagina, clics, impresiones, impresiones ? posicion + normal() * 6 / Math.sqrt(impresiones) : 0);
	};
	const RONDAS = 300;
	// Promedio de páginas marcadas por lunes; `clicsAlDia`: todas con esos clics (si no, de 0.15 a 1.5).
	const cuenta = (dias, regla, { mitad = false, clicsAlDia = 0 } = {}) => {
		let marcadas = 0;
		for (let r = 0; r < RONDAS; r++) {
			const paginas = Array.from({ length: 30 }, (_, i) => ({ p: `/p${i}`, porDia: clicsAlDia || 0.15 + azar() * 1.35, pos: 3 + azar() * 12 }));
			const antes = paginas.map((x) => periodo(x.p, x.porDia, dias, x.pos));
			const ahora = paginas.map((x) => periodo(x.p, mitad ? x.porDia / 2 : x.porDia, dias, x.pos));
			marcadas += regla(ahora, antes).length;
		}
		return marcadas / RONDAS;
	};
	// La regla de antes, para comparar: 3 clics y 30 %, o 3 posiciones con 20 apariciones antes.
	const deAntes = (ahora, antes) => antes.filter((a, i) => (a.clics >= 3 && ahora[i].clics < a.clics * 0.7) || (a.impresiones >= 20 && ahora[i].posicion && a.posicion && ahora[i].posicion - a.posicion >= 3));
	const falsas = cuenta(28, bajaron), falsasAntes = cuenta(7, deAntes);
	const con2 = cuenta(28, bajaron, { mitad: true, clicsAlDia: 2 }) / 30, con1 = cuenta(28, bajaron, { mitad: true, clicsAlDia: 1 }) / 30;
	console.log(`  falsas alarmas por lunes: ${falsas.toFixed(2)} de 30 (antes, 7 contra 7: ${falsasAntes.toFixed(2)}); de las que bajaron a la mitad encuentra el ${Math.round(con2 * 100)} % con 2 clics al día y el ${Math.round(con1 * 100)} % con 1`);
	assert.ok(falsas < 1.5, `pocas falsas alarmas (${falsas})`);
	assert.ok(falsasAntes > 3 * falsas, 'la regla de antes daba muchas más');
	assert.ok(con2 > 0.75, `con 2 clics al día encuentra la mayoría (${con2})`);
	assert.ok(con1 > 0.4, `con 1 clic al día, cerca de la mitad (${con1})`);
});

await t('búsquedas nuevas: 3 apariciones o más y ausentes la semana anterior, las que más aparecen primero', () => {
	const r = nuevas([f('casa zona 10', 1, 40, 8), f('apartamento', 0, 2, 30), f('casa antigua', 3, 90, 5), f('renta monterrico', 0, 12, 15)], [f('casa antigua', 2, 80, 5)]);
	assert.deepEqual(r.map((x) => x.consulta), ['casa zona 10', 'renta monterrico']);
});

await t('indexación: primero las nunca revisadas, luego las que no estaban en Google, luego las más viejas; lo no revisado conserva lo anterior', () => {
	const anteriores = [{ url: 'u1', veredicto: 'PASS', cuando: '2026-11-02' }, { url: 'u2', veredicto: 'NEUTRAL', cuando: '2026-11-09' }, { url: 'u3', veredicto: 'PASS', cuando: '2026-10-26' }, { url: 'vieja', veredicto: 'PASS', cuando: '2026-11-09' }];
	assert.deepEqual(porRevisar(['u1', 'u2', 'u3', 'u4'], anteriores), ['u4', 'u2', 'u3', 'u1']);
	const al = indexacionAlDia(['u1', 'u2', 'u3', 'u4'], anteriores, [{ url: 'u4', veredicto: 'PASS', cuando: '2026-11-16' }]);
	assert.deepEqual(al.map((x) => x.url), ['u1', 'u2', 'u3', 'u4'], 'la que salió del sitemap ya no está');
});

// ---------------------------------------------------------------- La función, con Google simulado
process.env.GOOGLE_SA_EMAIL = 'pruebas@demo.iam.gserviceaccount.com';
process.env.GOOGLE_SA_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const { default: seoSemanal } = await import('../netlify/functions/seo-semanal.mjs');
const SITIO = 'https://eqinmobiliario.gt';
let inspeccionadas = [];
const consultas = [];
let cuotaTras = Infinity;
const google = (url, op = {}) => {
	const u = String(url);
	if (u.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 't', expires_in: 3600 });
	if (u === `${SITIO}/sitemap.xml`) return new Response(`<urlset>${['/', '/propiedades/', '/propiedad/casa-1/', '/propiedad/casa-2/'].map((p) => `<url><loc>${SITIO}${p}</loc></url>`).join('')}</urlset>`);
	if (u.includes('/searchAnalytics/query')) {
		const b = JSON.parse(op.body);
		const actual = b.endDate >= '2026-11-15';
		const dim = (b.dimensions || [])[0];
		consultas.push(b);
		const filas = !dim ? [{ clicks: actual ? 20 : 30, impressions: 500, ctr: 0.04, position: 8 }]
			: dim === 'page' ? (actual ? [{ keys: [`${SITIO}/`], clicks: 20, impressions: 400, position: 6 }] : [{ keys: [`${SITIO}/`], clicks: 22, impressions: 400, position: 6 }, { keys: [`${SITIO}/propiedad/casa-1/`], clicks: 8, impressions: 60, position: 5 }])
				: (actual ? [{ keys: ['casa en venta zona 14'], clicks: 1, impressions: 30, position: 9 }] : []);
		return Response.json({ rows: filas });
	}
	if (u.includes('urlInspection/index:inspect')) {
		if (inspeccionadas.length >= cuotaTras) return Response.json({ error: { message: 'Quota exceeded' } }, { status: 429 });
		const { inspectionUrl } = JSON.parse(op.body);
		inspeccionadas.push(inspectionUrl);
		const fuera = inspectionUrl.endsWith('casa-2/');
		return Response.json({ inspectionResult: { indexStatusResult: { verdict: fuera ? 'NEUTRAL' : 'PASS', coverageState: fuera ? 'Descubierta: actualmente sin indexar' : 'Enviada e indexada' } } });
	}
	return new Response('no', { status: 404 });
};
globalThis.fetch = async (url, op) => google(url, op);

await t('el informe del lunes: bajó la casa 1 (28 días), búsqueda nueva, la casa 2 no está en Google con su motivo', async () => {
	inspeccionadas = []; cuotaTras = Infinity;
	poner('settings/site', { seo: { searchConsolePropiedad: 'sc-domain:otro-sitio.com' } });
	await seoSemanal();
	const d = leer(`seoSemanal/${globalThis.EQVacacional.hoy()}`);
	assert.ok(d, 'quedó el informe');
	assert.equal(d.propiedad, 'sc-domain:eqinmobiliario.gt', 'solo la propiedad de este sitio');
	assert.equal(d.error, '');
	assert.deepEqual(d.bajaron.map((x) => x.pagina), [`${SITIO}/propiedad/casa-1/`]);
	// Las páginas, 28 días contra los 28 anteriores; los clics y las búsquedas, la semana.
	const dias = (r) => Math.round((Date.parse(r.endDate) - Date.parse(r.startDate)) / 86_400_000) + 1;
	assert.deepEqual(consultas.filter((b) => b.dimensions?.[0] === 'page').map(dias), [28, 28]);
	assert.deepEqual(consultas.filter((b) => b.dimensions?.[0] !== 'page').map(dias), [7, 7, 7, 7]);
	assert.equal(dias(d.rangoBajaron), 28);
	assert.equal(globalThis.EQVacacional.sumarDias(d.rangoBajaronAntes.endDate, 1), d.rangoBajaron.startDate, 'seguidos, sin hueco');
	assert.equal(dias(d.rango), 7);
	assert.deepEqual(d.nuevas.map((x) => x.consulta), ['casa en venta zona 14']);
	assert.equal(d.paginasSitemap, 4);
	assert.equal(d.revisadasHoy, 4);
	assert.deepEqual(d.indexacion.filter((x) => x.veredicto !== 'PASS').map((x) => [x.url, x.cobertura]), [[`${SITIO}/propiedad/casa-2/`, 'Descubierta: actualmente sin indexar']]);
	assert.ok(d.creado instanceof Date);
});

await t('sin cuota: revisa lo que alcanza, lo dice, y lo demás queda con lo de la semana pasada', async () => {
	const hoy = globalThis.EQVacacional.hoy(), pasada = globalThis.EQVacacional.sumarDias(hoy, -7);
	poner(`seoSemanal/${pasada}`, { fecha: pasada, indexacion: [`${SITIO}/`, `${SITIO}/propiedades/`, `${SITIO}/propiedad/casa-1/`, `${SITIO}/propiedad/casa-2/`].map((url) => ({ url, veredicto: 'PASS', cobertura: 'Enviada e indexada', cuando: pasada })) });
	inspeccionadas = []; cuotaTras = 2;
	await seoSemanal();
	const d = leer(`seoSemanal/${hoy}`);
	assert.equal(d.revisadasHoy, 2);
	assert.match(d.errorIndexacion, /Quota/);
	assert.equal(d.indexacion.length, 4, 'las 4 con dato');
	assert.equal(d.indexacion.filter((x) => x.cuando === pasada).length, 2, 'dos con lo de la semana pasada');
	assert.equal(d.sinRevisar, 0);
});

await t('Search Console falla: queda el informe con el motivo; si luego corre bien, el motivo se borra', async () => {
	globalThis.fetch = async (url, op) => (String(url).includes('searchAnalytics') ? Response.json({ error: { message: 'Backend Error' } }, { status: 500 }) : google(url, op));
	// «Estado del sistema» lo da por fallado, con el motivo (no por bueno porque el reloj corrió).
	await assert.rejects(seoSemanal(), /Backend Error/);
	const hoy = globalThis.EQVacacional.hoy();
	assert.equal(leer(`seoSemanal/${hoy}`).error, 'Backend Error');
	const { rota } = await import('../admin/js/estado-sistema.js');
	assert.ok(rota(leer('estado/seo-semanal')), 'el reloj queda fallado');
	assert.match(leer('estado/seo-semanal').motivo, /Search Console: Backend Error/);
	globalThis.fetch = async (url, op) => google(url, op);
	inspeccionadas = []; cuotaTras = Infinity;
	S.reloj += 60_000;
	await seoSemanal();
	assert.equal(leer(`seoSemanal/${hoy}`).error, '');
	assert.ok(!rota(leer('estado/seo-semanal')), 'al correr bien, ya no');
	assert.equal([...S.docs.keys()].filter((k) => k.startsWith('seoSemanal/')).length, 1, 'un solo informe por día');
});

await t('una semana con error o sin sitemap no borra la indexación: se toma el último informe que la tiene', async () => {
	const V = globalThis.EQVacacional, hoy = V.hoy();
	const lista = [{ url: `${SITIO}/`, veredicto: 'PASS', cobertura: 'Enviada e indexada', cuando: V.sumarDias(hoy, -14) }];
	poner(`seoSemanal/${V.sumarDias(hoy, -14)}`, { fecha: V.sumarDias(hoy, -14), indexacion: lista });
	poner(`seoSemanal/${V.sumarDias(hoy, -7)}`, { fecha: V.sumarDias(hoy, -7), error: 'Backend Error' });
	globalThis.fetch = async (url, op) => (String(url).endsWith('/sitemap.xml') ? new Response('', { status: 503 }) : google(url, op));
	inspeccionadas = []; cuotaTras = Infinity;
	await seoSemanal();
	const d = leer(`seoSemanal/${hoy}`);
	assert.deepEqual(d.indexacion, lista);
	assert.equal(inspeccionadas.length, 0);
	assert.match(d.errorIndexacion, /sitemap/);
	globalThis.fetch = async (url, op) => google(url, op);
});

console.log(`\n${ok} pruebas del informe semanal pasan.`);
