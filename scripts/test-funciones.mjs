// Pruebas de las funciones de Netlify con la base, la sesión y el correo simulados (scripts/simulado/): el límite de
// /api/mi-casa, qué se le dice al dueño al guardar, la publicación (el enlace de Netlify revisado en el servidor, la
// marca de fallo y su correo, quién la quita y quién espera), las reseñas de Google y «Enviarme el resumen».
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer } from './simulado/base.mjs';

let ok = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); ok++; console.log('✓', nombre); };
const pedido = (method, cuerpo) => ({ method, headers: new Headers(), json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
const evento = (payload = { context: 'production' }) => ({ json: async () => ({ payload }) });
// fetch simulado: cada URL pedida queda en `pedidos`; `respuestas` dice qué contesta cada una (por defecto 200).
const pedidos = [];
let respuestas = () => new Response('{}', { status: 200 });
globalThis.fetch = async (url, op = {}) => { pedidos.push({ url: String(url), metodo: op.method || 'GET' }); return respuestas(String(url)); };
const HOOK = 'https://api.netlify.com/build_hooks/abc';
const alHook = () => pedidos.filter((p) => p.url === HOOK).length;

const { default: miCasa } = await import('../netlify/functions/mi-casa.mjs');
const { default: publicar } = await import('../netlify/functions/publicar.mjs');
const { default: deployFailed } = await import('../netlify/functions/deploy-failed.mjs');
const { default: deploySucceeded } = await import('../netlify/functions/deploy-succeeded.mjs');
const { default: publicarPendiente } = await import('../netlify/functions/publicar-pendiente.mjs');
const { default: comisionesVencidas } = await import('../netlify/functions/comisiones-vencidas.mjs');
const { default: resenas } = await import('../netlify/functions/resenas-google.mjs');
const { default: automatizaciones } = await import('../netlify/functions/automatizaciones.mjs');
const { DESC_FALLO, DESC_FRENO } = await import('../netlify/lib/publicar.mjs');

const casa = () => poner('properties/c1', { titulo: 'Casa del lago', operacion: 'vacacional', propietarioId: 'p1', descripcion: 'Casa frente al lago con muelle propio.', amenidades: [], fotos: [] });
const guardarDueno = (descripcion) => miCasa(pedido('POST', { casa: 'c1', cambios: { descripcion } }));

await t('el administrador no gasta el límite del dueño: 100 lecturas y «Deshacer» seguidos responden (antes, 429 al 14.º)', async () => {
	S.staff = { uid: 'u-admin', admin: true, nombre: 'Admin' };
	casa();
	poner('cambiosDueno/a1', { propertyId: 'c1', estado: 'nuevo', cuando: new Date(S.reloj - 60000), cambios: [{ campo: 'descripcion', antes: 'x', ahora: 'y' }] });
	for (let i = 0; i < 100; i++) assert.equal((await miCasa(pedido('GET'))).status, 200, `lectura ${i + 1}`);
	assert.equal((await miCasa(pedido('POST', { accion: 'listo', id: 'a1' }))).status, 200);
});

await t('el dueño sí tiene límite: 40 guardados en 10 minutos; el 41.º, 429', async () => {
	S.socio = { uid: 'u-socio-limite', nombre: 'Rodrigo', propietarioId: 'p1' };
	casa();
	for (let i = 0; i < 40; i++) assert.notEqual((await guardarDueno(`Casa frente al lago con muelle propio, versión ${i}.`)).status, 429, `guardado ${i + 1}`);
	assert.equal((await guardarDueno('Casa frente al lago con muelle, la última versión.')).status, 429);
});

await t('al dueño se le dice si su cambio sale solo (publicación automática sin fallo) o cuando el equipo publique', async () => {
	S.socio = { uid: 'u-socio-texto', nombre: 'Rodrigo', propietarioId: 'p1' };
	casa();
	poner('settings/private', { autoPublicar: true, netlifyBuildHook: HOOK });
	poner('meta/publish', { pendiente: false });
	assert.equal((await (await guardarDueno('Casa frente al lago con muelle propio y rancho.')).json()).publicaSola, true);
	poner('meta/publish', { pendiente: true, fallo: true });
	assert.equal((await (await guardarDueno('Casa frente al lago con muelle propio, rancho y lancha.')).json()).publicaSola, false);
	poner('settings/private', { autoPublicar: false, netlifyBuildHook: HOOK });
	poner('meta/publish', { pendiente: false });
	assert.equal((await (await guardarDueno('Casa frente al lago, muelle propio, rancho y kayaks.')).json()).publicaSola, false);
});

await t('«Publicar» del panel: el servidor llama al enlace y, si Netlify no lo acepta, responde el error (antes se marcaba publicado)', async () => {
	S.staff = { uid: 'u-asesor', admin: false, nombre: 'Ana' };
	poner('settings/private', { netlifyBuildHook: HOOK });
	pedidos.length = 0;
	assert.equal((await publicar(pedido('POST'))).status, 200);
	assert.equal(alHook(), 1);
	respuestas = (u) => new Response('Not found', { status: u === HOOK ? 404 : 200 });
	const r = await publicar(pedido('POST'));
	assert.equal(r.status, 502);
	assert.match((await r.json()).error, /no reconoce el enlace/);
	respuestas = () => new Response('{}', { status: 200 });
	S.staff = null;
	assert.equal((await publicar(pedido('POST'))).status, 403);
});

await t('al cerrar el panel (token en el cuerpo, sin encabezado) se publica y queda marcado: publicar-pendiente no la repite', async () => {
	S.staff = { uid: 'u-admin', admin: true, nombre: 'Admin' };
	poner('settings/private', { autoPublicar: true, netlifyBuildHook: HOOK });
	poner('meta/publish', { pendiente: true, ultimoCambio: new Date(S.reloj - 60 * 60000) });
	pedidos.length = 0;
	const r = await publicar(pedido('POST', { token: 'token-de-la-sesion', automatica: true }));
	assert.equal(r.status, 200);
	assert.equal((await r.json()).marcado, true);
	assert.equal(leer('meta/publish').pendiente, false);
	assert.equal(leer('meta/publish').ultimaPublicacionAuto, true);
	await publicarPendiente();
	assert.equal(alHook(), 1, 'una sola publicación');
});

await t('una publicación fallida marca el fallo y avisa al equipo una sola vez; la siguiente que sale bien lo quita', async () => {
	poner('meta/publish', { pendiente: false });
	await deployFailed(evento({ context: 'production', error_message: 'Firestore no respondió' }));
	assert.equal(leer('meta/publish').fallo, true);
	assert.equal(leer('meta/publish').ultimoCambioDesc, DESC_FALLO);
	await deployFailed(evento());
	assert.equal(S.salida.length, 1, 'un correo, no uno por cada fallo seguido');
	assert.match(S.salida[0].asunto, /publicación del sitio falló/);
	await deploySucceeded(evento());
	assert.equal(leer('meta/publish').fallo, false);
	assert.equal(leer('meta/publish').pendiente, false, 'nada cambió desde el fallo: ya no queda nada sin publicar');
	// Con un cambio después del fallo, queda pendiente para la publicación automática.
	await deployFailed(evento());
	poner('meta/publish', { ...leer('meta/publish'), ultimoCambioDesc: 'Casa del lago: precio' });
	await deploySucceeded(evento());
	assert.equal(leer('meta/publish').fallo, false);
	assert.equal(leer('meta/publish').pendiente, true);
	// Una vista previa no toca nada.
	await deployFailed(evento({ context: 'deploy-preview' }));
	assert.equal(leer('meta/publish').fallo, false);
});

await t('un build frenado por el catálogo dice «se frenó» (no «falló»), con el motivo del build, y la siguiente que sale bien lo quita', async () => {
	const motivo = 'No hay ninguna propiedad publicada: se frenó para no dejar el sitio sin casas.';
	poner('meta/publish', { pendiente: false, freno: motivo, frenoCuando: new Date(S.reloj - 60000) });
	await deployFailed(evento({ context: 'production', error_message: 'Build script returned non-zero exit code: 1' }));
	assert.equal(leer('meta/publish').fallo, true);
	assert.equal(leer('meta/publish').ultimoCambioDesc, DESC_FRENO);
	assert.equal(S.salida.length, 1);
	assert.match(S.salida[0].asunto, /se frenó/);
	assert.match(S.salida[0].texto, /Publicar aunque baje/);
	await deploySucceeded(evento());
	assert.equal(leer('meta/publish').fallo, false);
	assert.equal(leer('meta/publish').pendiente, false, 'nada cambió desde el freno');
	// Un freno de hace horas (de otra publicación) no cuenta: es un fallo.
	poner('meta/publish', { pendiente: false, freno: motivo, frenoCuando: new Date(S.reloj - 3 * 3600000) });
	await deployFailed(evento());
	assert.equal(leer('meta/publish').ultimoCambioDesc, DESC_FALLO);
});

await t('la publicación automática espera mientras hay fallo y vuelve sola al quitarse', async () => {
	poner('settings/private', { autoPublicar: true, netlifyBuildHook: HOOK });
	poner('meta/publish', { pendiente: true, fallo: true, ultimoCambio: new Date(S.reloj - 60 * 60000) });
	pedidos.length = 0;
	await publicarPendiente();
	assert.equal(alHook(), 0);
	await deploySucceeded(evento());
	await publicarPendiente();
	assert.equal(alHook(), 1);
});

await t('comisiones-vencidas no llama al enlace de Netlify mientras la última publicación esté fallida', async () => {
	poner('settings/private', { netlifyBuildHook: HOOK });
	poner('meta/publish', { pendiente: true, fallo: true });
	respuestas = (u) => new Response(u.endsWith('/pausados.txt') ? 'socio-viejo' : '{}', { status: 200 });
	pedidos.length = 0;
	await comisionesVencidas();
	assert.ok(pedidos.some((p) => p.url.endsWith('/pausados.txt')), 'sí compara la lista publicada');
	assert.equal(alHook(), 0);
	// Pasadas 12 horas del fallo, lo vuelve a intentar (como mucho dos veces al día).
	poner('meta/publish', { pendiente: true, fallo: true, ultimoCambio: new Date(S.reloj - 11 * 3600_000) });
	await comisionesVencidas();
	assert.equal(alHook(), 0);
	poner('meta/publish', { pendiente: true, fallo: true, ultimoCambio: new Date(S.reloj - 13 * 3600_000) });
	await comisionesVencidas();
	assert.equal(alHook(), 1);
	poner('meta/publish', { pendiente: false, fallo: false });
	await comisionesVencidas();
	assert.equal(alHook(), 2);
	respuestas = () => new Response('{}', { status: 200 });
});

await t('reseñas de Google: tras un error no se vuelve a llamar a Google durante 5 minutos', async () => {
	process.env.GOOGLE_PLACES_API_KEY = 'k';
	process.env.GOOGLE_PLACE_ID = 'p';
	const aGoogle = () => pedidos.filter((p) => p.url.startsWith('https://places.googleapis.com/')).length;
	respuestas = () => new Response('{"error":{"message":"caído"}}', { status: 503 });
	pedidos.length = 0;
	for (let i = 0; i < 5; i++) assert.equal((await resenas(new Request('https://x.test/api/resenas-google'))).status, 502);
	assert.equal(aGoogle(), 1);
	assert.match((await resenas(new Request('https://x.test/api/resenas-google'))).headers.get('Netlify-CDN-Cache-Control'), /s-maxage=300/);
	S.reloj += 5 * 60000 + 1;
	respuestas = () => new Response(JSON.stringify({ rating: 4.9, userRatingCount: 2, reviews: [{ rating: 5, text: { text: 'Excelente' } }, { rating: 4 }] }), { status: 200 });
	const r = await resenas(new Request('https://x.test/api/resenas-google'));
	assert.equal(r.status, 200);
	assert.deepEqual((await r.json()).resenas.map((x) => x.texto), ['Excelente'], 'las de solo estrellas no llegan');
	assert.equal(aGoogle(), 2);
	respuestas = () => new Response('{}', { status: 200 });
});

await t('«Enviarme el resumen de hoy» lo manda solo a quien lo pide', async () => {
	S.staff = { uid: 'u-admin', admin: true, nombre: 'Admin' };
	S.sesion = { uid: 'u-admin', email: 'admin@ejemplo.test' };
	const r = await automatizaciones(pedido('POST', { accion: 'resumen' }));
	assert.equal(r.status, 200);
	assert.deepEqual(S.resumenes, [{ para: 'admin@ejemplo.test' }]);
	assert.match((await r.json()).mensaje, /admin@ejemplo\.test/);
});

await t('/api/gsc: solo la propiedad de Search Console de este sitio; otra que mande el panel se cambia por la del sitio', async () => {
	const { propiedadValida } = await import('../netlify/functions/gsc.mjs');
	for (const p of ['sc-domain:eqinmobiliario.gt', 'https://eqinmobiliario.gt/', 'https://www.eqinmobiliario.gt/', 'http://eqinmobiliario.gt/']) assert.equal(propiedadValida(p), p);
	for (const p of ['sc-domain:otro-sitio.com', 'https://otro-sitio.com/', 'https://eqinmobiliario.gt.otro.com/', '', 'x']) assert.equal(propiedadValida(p), 'sc-domain:eqinmobiliario.gt', p);
});

console.log(`\n${ok} pruebas de las funciones pasan.`);
