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
	const { propiedadValida } = await import('../netlify/lib/google.mjs');
	for (const p of ['sc-domain:eqinmobiliario.gt', 'https://eqinmobiliario.gt/', 'https://www.eqinmobiliario.gt/', 'http://eqinmobiliario.gt/']) assert.equal(propiedadValida(p), p);
	for (const p of ['sc-domain:otro-sitio.com', 'https://otro-sitio.com/', 'https://eqinmobiliario.gt.otro.com/', '', 'x']) assert.equal(propiedadValida(p), 'sc-domain:eqinmobiliario.gt', p);
});

await t('datos de pago cambiados: un correo al equipo por cambio (quién, antes y después), una sola vez; solo el administrador lo pide', async () => {
	const { default: avisoPago } = await import('../netlify/functions/aviso-pago.mjs');
	poner('propietarios/p1', { nombre: 'Rodrigo', datosPago: 'Banco B 222' });
	poner('cambiosDatosPago/c1', { propietarioId: 'p1', antes: 'Banco A 111', despues: 'Banco B 222', quien: 'u-admin', nombre: 'Admin', cuando: new Date(S.reloj), avisado: false });
	S.staff = { uid: 'u-asesor', admin: false, nombre: 'Asesor' };
	assert.equal((await avisoPago(pedido('POST'))).status, 403);
	S.staff = { uid: 'u-admin', admin: true, nombre: 'Admin' };
	assert.equal((await (await avisoPago(pedido('POST'))).json()).enviados, 1);
	const correo = S.salida.find((c) => /Datos de pago cambiados: Rodrigo/.test(c.asunto));
	assert.ok(correo);
	assert.match(correo.texto, /Antes: Banco A 111[\s\S]*Ahora: Banco B 222/);
	assert.equal(leer('cambiosDatosPago/c1').avisado, true);
	assert.equal((await (await avisoPago(pedido('POST'))).json()).enviados, 0, 'no se repite');
});

await t('mora con el comprobante del cliente: la pausa del servidor y el nivel del panel coinciden cada día, y el corte de permisos también (una sola condición para leer el chat)', async () => {
	const { moraDe } = await import('../netlify/lib/comisiones.mjs');
	const { conDatosDelChat } = await import('../admin/js/reservas-calculo.js');
	const { deudaDe, faltaSaberSiPago } = await import('../admin/js/permisos-socio.js');
	const V = globalThis.EQVacacional;
	const gt = (x) => Date.parse(`${x}:00-06:00`);
	const T = 'ChatConComprobanteDelCliente1';
	const chat = { estado: 'confirmada', comprobanteCliente: new Date(gt('2026-11-28T10:00')) };
	const r = { propietarioId: 'p-mora-dia', estado: 'confirmada', chat: T, llegada: '2026-12-01', salida: '2026-12-03', moneda: 'USD', comision: { monto: 80, vence: '2026-12-01', pagada: false } };
	poner('reservas/r-mora', r);
	poner(`chats/${T}`, chat);
	const reloj = S.reloj;
	try {
		for (let d = 2; d <= 14; d++) for (const h of ['06:00', '23:00']) {
			const ahora = gt(`2026-12-${String(d).padStart(2, '0')}T${h}`);
			S.reloj = ahora;
			// (moraDe recuerda 5 min por socio: cada día es otro momento.)
			const servidor = await moraDe(r.propietarioId, ahora);
			const panel = V.nivelMora(conDatosDelChat(r, chat), ahora);
			assert.equal(servidor, panel >= 2 ? panel : 0, `pausa el ${d} a las ${h}: servidor ${servidor}, panel ${panel}`);
			const corteServidor = deudaDe([faltaSaberSiPago(r, r.propietarioId, ahora) ? conDatosDelChat(r, chat) : r], r.propietarioId, ahora)?.corta || false;
			assert.equal(corteServidor, deudaDe([conDatosDelChat(r, chat)], r.propietarioId, ahora)?.corta || false, `corte el ${d} a las ${h}`);
		}
		// El caso del informe: el 5 de diciembre la pausa ya no baja a 0 (antes: 2 el 4, 0 el 5, 3 recién el 8).
		assert.equal(await moraDe(r.propietarioId, gt('2026-12-05T12:00') + 3600000), 3);
	} finally { S.reloj = reloj; }
});

// ---- La reserva por noche: /api/disponibilidad (y /al-dia), la confirmación del socio y el calendario de salida.
{
	await import('../js/calc-vacacional.js');
	const V = globalThis.EQVacacional;
	const { default: disponibilidad } = await import('../netlify/functions/disponibilidad.mjs');
	const { default: reservasFn } = await import('../netlify/functions/reservas.mjs');
	const { default: solicitudFn } = await import('../netlify/functions/solicitud.mjs');
	const { default: calendario } = await import('../netlify/functions/calendario.mjs');
	// Lo que «tiene» Airbnb ahora (su iCal simulado).
	let airbnb = [];
	const ical = () => `BEGIN:VCALENDAR\r\n${airbnb.map((e, i) => `BEGIN:VEVENT\r\nUID:${i}\r\nDTSTART;VALUE=DATE:${e.desde.replace(/-/g, '')}\r\nDTEND;VALUE=DATE:${e.hasta.replace(/-/g, '')}\r\nEND:VEVENT`).join('\r\n')}\r\nEND:VCALENDAR\r\n`;
	let caido = false;
	const conAirbnb = () => { respuestas = (url) => (url.startsWith('https://airbnb.example/') ? new Response(caido ? 'caído' : ical(), { status: caido ? 503 : 200 }) : new Response('{}', { status: 200 })); };
	let n = 0;
	const casaNoche = (id, vac = {}) => {
		poner(`properties/${id}`, { titulo: 'Casa del lago', operacion: 'vacacional', publicado: true, estado: 'disponible', propietarioId: 'p1', agentId: '', moneda: 'USD',
			vacacional: { base: 120, finde: 0, tarifas: [], huespedesMax: 4, ...vac } });
		poner(`properties/${id}/privado/socio`, { precioBase: 100, margen: 20, icalUrl: `https://airbnb.example/${id}.ics` });
		poner(`properties/${id}/privado/llegada`, { direccion: 'Calle 1' });
		poner('propietarios/p1', { datosPago: 'Banco X, cuenta 1' });
	};
	const al = (id, diaFresco = false) => disponibilidad({ method: 'GET', url: `https://x/api/disponibilidad${diaFresco ? '/al-dia' : ''}?id=${id}${diaFresco ? '&para=confirmar' : ''}`, headers: new Headers() }, { ip: `10.4.0.${++n}` }).then((r) => r.json());
	const pedir = async (casa, llegada, salida, c = V.cotizarEstancia({ plan: { base: 120 }, llegada, salida })) => {
		n++;
		const cuerpo = { leadId: `Lead${String(n).padStart(16, '0')}`, token: `Token${String(n).padStart(23, '0')}`, lead: { nombre: 'Ana Morales', telefono: '+502 5555 1234', email: `ana${n}@example.com`, mensaje: '', origen: 'reserva', pagina: '/x/', propertyId: casa, idioma: 'es' },
			reserva: { llegada, salida, noches: c.noches, huespedes: 2, subtotal: c.subtotal, impuestos: c.impuestos, total: c.total, deposito: c.deposito, moneda: 'USD' }, chat: {} };
		const r = await solicitudFn({ method: 'POST', headers: new Headers(), json: async () => cuerpo }, { ip: `10.5.0.${n}` });
		assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
		return cuerpo.leadId;
	};
	const confirmar = async (leadId, extra = {}) => {
		S.socio = { uid: 'u-socio', nombre: 'Rodrigo', propietarioId: 'p1' };
		const r = await reservasFn({ method: 'POST', headers: new Headers(), json: async () => ({ accion: 'confirmar', leadId, ...extra }) }, {});
		return [r.status, await r.json()];
	};

	await t('/api/disponibilidad lleva el mínimo general, la limpieza y el depósito de hoy (los que revisa /api/solicitud)', async () => {
		conAirbnb();
		casaNoche('cv1', { nochesMin: 3, limpieza: 0, deposito: 150 });
		const r = await al('cv1');
		assert.deepEqual([r.nochesMin, r.limpieza, r.deposito], [3, 0, 150]);
		casaNoche('cv1');
		assert.deepEqual([(await al('cv1', true)).nochesMin, (await al('cv1', true)).limpieza], [1, 0], 'sin dato: 1 noche y sin limpieza');
	});

	await t('privado/socio que no se pudo leer no es «sin calendarios»: /al-dia responde sinLeer (el panel pide «Revisé») y el socio tampoco confirma sin revisar', async () => {
		conAirbnb();
		casaNoche('cv2');
		const lead = await pedir('cv2', '2027-02-01', '2027-02-04');
		S.lecturaFalla = true;
		try {
			for (const diaFresco of [false, true]) assert.deepEqual((await al('cv2', diaFresco)).sinLeer, ['las plataformas'], diaFresco ? '/al-dia' : 'la ficha');
			const [s, d] = await confirmar(lead);
			assert.deepEqual([s, d.faltaRevisar], [409, ['las plataformas']], JSON.stringify(d));
		} finally { S.lecturaFalla = false; }
		airbnb = [];
		assert.equal((await al('cv2', true)).sinLeer, undefined, 'leído: sin aviso');
	});

	await t('la ficha usa lo recordado de Airbnb (10 min); /al-dia y la confirmación lo leen en ese momento', async () => {
		conAirbnb();
		airbnb = [];
		casaNoche('cv3');
		const antes = S.reloj;
		try {
			assert.deepEqual((await al('cv3')).externas, []);
			const lead = await pedir('cv3', '2027-01-10', '2027-01-13');
			// A los 3 min Airbnb vende esas noches.
			S.reloj += 3 * 60_000;
			airbnb = [{ desde: '2027-01-10', hasta: '2027-01-13' }];
			assert.deepEqual((await al('cv3')).externas, [], 'la ficha: lo recordado');
			// El socio confirma (sin que nadie haya pedido /al-dia): la lectura es de ahora, no la de hace 3 min.
			const [s, d] = await confirmar(lead);
			assert.equal(s, 409, JSON.stringify(d));
			assert.match(d.error, /ocupadas en Airbnb/);
			assert.equal(leer(`reservas/${lead}`), null);
			// Airbnb las suelta y vende otras: la ficha sigue con lo recordado; /al-dia, al momento.
			S.reloj += 60_000;
			airbnb = [{ desde: '2027-01-20', hasta: '2027-01-22' }];
			assert.deepEqual((await al('cv3')).externas, [{ desde: '2027-01-10', hasta: '2027-01-13' }], 'la ficha: lo recordado');
			assert.deepEqual((await al('cv3', true)).externas, [{ desde: '2027-01-20', hasta: '2027-01-22' }], '/al-dia: al momento');
		} finally { S.reloj = antes; airbnb = []; }
	});

	await t('confirmar: con el mínimo de noches de hoy (el dueño lo subió después de la solicitud), no se confirma', async () => {
		conAirbnb();
		casaNoche('cv4');
		const lead = await pedir('cv4', '2027-03-01', '2027-03-03');
		poner('properties/cv4', { ...leer('properties/cv4'), vacacional: { ...leer('properties/cv4').vacacional, nochesMin: 3 } });
		const [s, d] = await confirmar(lead);
		assert.equal(s, 409);
		assert.match(d.error, /Son 2 noches y la casa pide al menos 3/);
		assert.equal(leer(`reservas/${lead}`), null);
	});

	await t('el calendario de EQ para las plataformas lleva las reservas confirmadas y los bloqueos del dueño; nunca lo que vino de Airbnb', async () => {
		casaNoche('cv5', { bloqueos: [{ desde: '2026-12-10', hasta: '2026-12-12' }, { desde: '2026-01-01', hasta: '2026-01-03' }] });
		const llave = 'a'.repeat(48);
		poner('properties/cv5/privado/calendario', { llave, propietarioId: 'p1' });
		poner('properties/cv5/privado/icalLeido', { icalUrl: { url: 'https://airbnb.example/cv5.ics', rangos: [{ desde: '2026-12-20', hasta: '2026-12-22' }], cuando: S.reloj } });
		poner('reservas/rc1', { propertyId: 'cv5', estado: 'confirmada', llegada: '2027-01-05', salida: '2027-01-07' });
		poner('reservas/rc2', { propertyId: 'cv5', estado: 'cancelada', llegada: '2027-01-15', salida: '2027-01-17' });
		const r = await calendario({ method: 'GET', url: `https://x/api/calendario?casa=cv5&t=${llave}`, headers: new Headers() });
		assert.equal(r.status, 200);
		const texto = await r.text();
		assert.deepEqual(JSON.parse(JSON.stringify(V.parseICal(texto))), [{ desde: '2026-12-10', hasta: '2026-12-12' }, { desde: '2027-01-05', hasta: '2027-01-07' }]);
		assert.match(texto, /UID:bloqueo-2026-12-10-2026-12-12@eqinmobiliario\.gt/);
		assert.match(texto, /UID:rc1@eqinmobiliario\.gt/);
	});
	await t('lo que cotiza la página con la respuesta de /api/disponibilidad (fin de semana, tarifa, limpieza con centavos y depósito) lo acepta /api/solicitud', async () => {
		conAirbnb();
		casaNoche('cv6', { base: 120, finde: 150.5, tarifas: [{ desde: '2027-04-02', hasta: '2027-04-03', precio: 199.99 }, { desde: '2026-01-01', hasta: '2026-01-05', precio: 1 }], limpieza: 37.25, deposito: 80.5 });
		poner('properties/cv6/privado/socio', { precioBase: 100, precioFinde: 125.42, margen: 20, tarifas: [{ desde: '2027-04-02', hasta: '2027-04-03', precio: 166.66 }] });
		const d = await al('cv6');
		const c = V.cotizarEstancia({ plan: d.plan, llegada: '2027-04-01', salida: '2027-04-11', limpieza: d.limpieza, deposito: d.deposito });
		assert.ok(c.detalle.some((x) => x.precio === 199.99) && c.detalle.some((x) => x.precio === 150.5) && c.deposito === 80.5, JSON.stringify(c));
		await pedir('cv6', '2027-04-01', '2027-04-11', c);
	});

	await t('al confirmar, una plataforma que no respondió y salió de lo último guardado se revisa a mano («Airbnb no respondió; lo último que vimos es de hace 23 h»); la ficha la usa sin preguntar', async () => {
		conAirbnb();
		casaNoche('cv7');
		const antes = S.reloj;
		try {
			airbnb = [{ desde: '2027-05-20', hasta: '2027-05-22' }];
			assert.deepEqual((await al('cv7', true)).externas, [{ desde: '2027-05-20', hasta: '2027-05-22' }], 'leído y guardado');
			const lead = await pedir('cv7', '2027-05-10', '2027-05-13');
			S.reloj += 23 * 3600_000;
			caido = true;
			// La ficha: lo guardado, sin aviso.
			const ficha = await al('cv7');
			assert.deepEqual([ficha.externas, ficha.sinLeer, ficha.deHace], [[{ desde: '2027-05-20', hasta: '2027-05-22' }], undefined, undefined]);
			// El panel (administrador): /al-dia para confirmar dice de cuándo es.
			const panel = await al('cv7', true);
			assert.deepEqual(panel.deHace, [{ nombre: 'Airbnb', minutos: 1380 }]);
			const { aRevisar, textoSinLeer } = await import('../admin/js/reservas-calculo.js');
			assert.deepEqual(aRevisar(panel), ['Airbnb']);
			assert.equal(textoSinLeer(panel), 'Airbnb no respondió; lo último que vimos es de hace 23 h: revisa allá que esas noches estén libres.');
			// El socio, por el servidor: lo mismo; con «Revisé Airbnb», sí.
			let [s, d] = await confirmar(lead);
			assert.deepEqual([s, d.faltaRevisar, d.error], [409, ['Airbnb'], 'Airbnb no respondió; lo último que vimos es de hace 23 h: revisa allá que esas noches estén libres.']);
			assert.equal(leer(`reservas/${lead}`), null);
			[s, d] = await confirmar(lead, { revisado: true });
			assert.equal(s, 200, JSON.stringify(d));
			assert.deepEqual(leer(`reservas/${lead}`).revisadoAMano, ['Airbnb']);
			// Sus noches siguen bloqueando: encima de lo guardado, no se confirma ni revisando.
			const encima = await pedir('cv7', '2027-05-20', '2027-05-22');
			[s, d] = await confirmar(encima, { revisado: true });
			assert.equal(s, 409);
			assert.match(d.error, /ocupadas en Airbnb/);
		} finally { S.reloj = antes; caido = false; airbnb = []; }
	});
	respuestas = () => new Response('{}', { status: 200 });
}

await t('«Pasar datos al formato nuevo»: borra el nombre (`por`) del historial de estados de cada casa, sin tocar lo demás; repetirla no cambia nada', async () => {
	const { tanda, tandaAplicando, FASES_TOTAL } = await import('../netlify/lib/migrar-chats.mjs');
	const fecha = new Date('2026-03-01T10:00:00.123Z'), actualizada = new Date('2026-04-01T00:00:00Z');
	poner('properties/c1', { titulo: 'Casa del lago', publicado: true, updatedAt: actualizada, historialEstado: [
		{ estado: 'disponible', fecha, por: 'Ana López', porUid: 'u1' }, { estado: 'reservada', fecha: '2026-03-05T10:00:00.000Z', por: 'Dueño', porUid: 'u2' }, { estado: 'disponible', fecha: null, porUid: 'u3' }] });
	poner('properties/c2', { titulo: 'Sin nombres', historialEstado: [{ estado: 'disponible', fecha, porUid: 'u1' }] });
	poner('properties/c3', { titulo: 'Sin historial' });
	const vuelta = async (aplicar) => { let cuenta = 0, cursor = null; do { const r = aplicar ? await tandaAplicando({ cursor }) : await tanda({ cursor }); cuenta += r.cuenta.nombres; cursor = r.cursor; } while (cursor); return cuenta; };
	assert.equal(await vuelta(false), 1);
	assert.equal(leer('properties/c1').historialEstado[0].por, 'Ana López', 'el simulacro no escribe');
	assert.equal(await vuelta(true), 1);
	const c1 = leer('properties/c1');
	assert.deepEqual(c1.historialEstado, [{ estado: 'disponible', fecha, porUid: 'u1' }, { estado: 'reservada', fecha: '2026-03-05T10:00:00.000Z', porUid: 'u2' }, { estado: 'disponible', fecha: null, porUid: 'u3' }]);
	assert.ok(c1.historialEstado[0].fecha instanceof Date, 'la fecha sigue siendo fecha');
	assert.equal(c1.updatedAt.getTime(), actualizada.getTime(), 'no cuenta como un cambio de la casa');
	assert.deepEqual(leer('properties/c2').historialEstado, [{ estado: 'disponible', fecha, porUid: 'u1' }]);
	assert.equal(await vuelta(true), 0);
	// La marca dice cuántas fases cubrió: con una fase nueva el panel vuelve a ofrecer el botón.
	assert.equal(leer('estado/migracion-chats').fases, FASES_TOTAL);
});

console.log(`\n${ok} pruebas de las funciones pasan.`);
