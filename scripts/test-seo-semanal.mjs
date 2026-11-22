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

await t('bajaron: perdió 30 % de clics, desapareció o cayó 3 posiciones; lo demás no', () => {
	const antes = [f('/a', 10, 100, 4), f('/b', 10, 100, 4), f('/c', 5, 50, 3), f('/d', 2, 30, 5), f('/e', 1, 10, 2)];
	const ahora = [f('/a', 6, 90, 4), f('/b', 8, 100, 4.5), f('/d', 2, 30, 9), f('/e', 0, 10, 9)];
	assert.deepEqual(bajaron(ahora, antes).map((x) => x.pagina), ['/c', '/a', '/d']);
	assert.equal(bajaron(ahora, antes)[0].ahora.clics, 0, 'la que desapareció, con cero');
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
let cuotaTras = Infinity;
const google = (url, op = {}) => {
	const u = String(url);
	if (u.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 't', expires_in: 3600 });
	if (u === `${SITIO}/sitemap.xml`) return new Response(`<urlset>${['/', '/propiedades/', '/propiedad/casa-1/', '/propiedad/casa-2/'].map((p) => `<url><loc>${SITIO}${p}</loc></url>`).join('')}</urlset>`);
	if (u.includes('/searchAnalytics/query')) {
		const b = JSON.parse(op.body);
		const actual = b.endDate >= '2026-11-15';
		const dim = (b.dimensions || [])[0];
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

await t('el informe del lunes: bajó la casa 1, búsqueda nueva, la casa 2 no está en Google con su motivo', async () => {
	inspeccionadas = []; cuotaTras = Infinity;
	poner('settings/site', { seo: { searchConsolePropiedad: 'sc-domain:otro-sitio.com' } });
	await seoSemanal();
	const d = leer(`seoSemanal/${globalThis.EQVacacional.hoy()}`);
	assert.ok(d, 'quedó el informe');
	assert.equal(d.propiedad, 'sc-domain:eqinmobiliario.gt', 'solo la propiedad de este sitio');
	assert.equal(d.error, '');
	assert.deepEqual(d.bajaron.map((x) => x.pagina), [`${SITIO}/propiedad/casa-1/`]);
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
	await seoSemanal();
	const hoy = globalThis.EQVacacional.hoy();
	assert.equal(leer(`seoSemanal/${hoy}`).error, 'Backend Error');
	globalThis.fetch = async (url, op) => google(url, op);
	inspeccionadas = []; cuotaTras = Infinity;
	await seoSemanal();
	assert.equal(leer(`seoSemanal/${hoy}`).error, '');
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

await t('«Páginas que bajaron» en vivo pide 1,000 páginas de cada periodo (con 100, una que salió de la lista se veía con 0 clics)', async () => {
	const pedidos = [];
	globalThis.fetch = async (url, op) => { if (String(url).includes('searchAnalytics')) pedidos.push(JSON.parse(op.body)); return google(url, op); };
	const { resumen } = await import('../netlify/functions/gsc.mjs');
	await resumen('sc-domain:eqinmobiliario.gt', 28);
	const paginas = pedidos.filter((b) => (b.dimensions || []).join() === 'page');
	assert.equal(paginas.length, 2);
	assert.ok(paginas.every((b) => b.rowLimit === 1000));
	globalThis.fetch = async (url, op) => google(url, op);
});

console.log(`\n${ok} pruebas del informe semanal pasan.`);
