// Pruebas de «Estado del sistema»: admin/js/estado-sistema.js (qué se muestra y desde cuándo) y lo que anota el servidor
// (netlify/lib/estado.mjs: ok, fallo y desde cuándo; los relojes; los topes) con la base y el correo simulados.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer } from './simulado/base.mjs';

const { armarEstado, rotoMasDeUnDia, correosDe, calendariosDe, RELOJES } = await import('../admin/js/estado-sistema.js');
const { anotarOk, anotarFallo, anotarTope, conReloj } = await import('../netlify/lib/estado.mjs');
const { avisarSiSigueRoto } = await import('../netlify/lib/estado-sistema.mjs');

const H = 3600_000, D = 24 * H;
let n = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); n++; console.log('✓', nombre); };
const AHORA = S.reloj;
const relojesAlDia = () => Object.fromEntries(Object.keys(RELOJES).map((k) => [k, { ok: AHORA - 5 * 60_000 }]));

await t('todo bien: nada que mostrar', async () => {
	assert.deepEqual(armarEstado({ estados: relojesAlDia(), ahora: AHORA }), []);
});

await t('correos: roto cuando el último fallo es más nuevo que el último ok, con desde cuándo', async () => {
	const rota = armarEstado({ estados: { ...relojesAlDia(), correo: { ok: AHORA - 5 * H, fallo: AHORA - H, falloDesde: AHORA - 3 * H, motivo: 'ZeptoMail 401' } }, ahora: AHORA });
	assert.equal(rota.length, 1);
	assert.equal(rota[0].desde, AHORA - 3 * H);
	assert.match(rota[0].detalle, /401/);
	assert.equal(armarEstado({ estados: { ...relojesAlDia(), correo: { ok: AHORA - 10 * 60_000, fallo: AHORA - H } }, ahora: AHORA }).length, 0);
});

await t('relojes: atrasado, fallido y sin correr (solo si el servidor ya anota desde antes)', async () => {
	const e = relojesAlDia();
	e['plazos-reservas'] = { ok: AHORA - 2 * H };
	const l = armarEstado({ estados: e, ahora: AHORA });
	assert.deepEqual(l.map((x) => x.clave), ['reloj-plazos-reservas']);
	assert.match(l[0].titulo, /no corre/);
	// Recién publicado: ninguno ha corrido todavía, no se avisa.
	assert.deepEqual(armarEstado({ estados: { 'plazos-reservas': { ok: AHORA - 60_000 } }, ahora: AHORA }), []);
	// Ya anota desde hace dos días y uno nunca corrió: sí.
	const sin = relojesAlDia(); delete sin['resumen-diario']; sin['plazos-reservas'] = { ok: AHORA - 60_000 }; sin['comisiones-vencidas'] = { ok: AHORA - 2 * H, fallo: AHORA - H, falloDesde: AHORA - H, motivo: 'x' };
	sin['publicar-pendiente'] = { ok: AHORA - 60_000 };
	const viejo = { ...sin, 'solicitudes-sin-respuesta': { ok: AHORA - 60_000 } };
	// El más viejo anotó hace 5 min: «resumen-diario» (26 h) todavía no cuenta como sin correr.
	assert.ok(!armarEstado({ estados: viejo, ahora: AHORA }).some((x) => x.clave === 'reloj-resumen-diario'));
	assert.ok(armarEstado({ estados: viejo, ahora: AHORA }).some((x) => x.clave === 'reloj-comisiones-vencidas' && /falló/.test(x.titulo)));
	const conViejo = { ...viejo, 'plazos-reservas': { ok: AHORA - 30 * H, fallo: AHORA - 30 * H - 1 } };
	assert.ok(armarEstado({ estados: conViejo, ahora: AHORA }).some((x) => x.clave === 'reloj-resumen-diario' && /no ha corrido/.test(x.titulo)));
	// El estado de cuenta (una vez al mes) no avisa por no haber corrido todavía.
	assert.ok(!armarEstado({ estados: conViejo, ahora: AHORA }).some((x) => x.clave === 'reloj-estado-cuenta'));
});

await t('publicación fallida o frenada, correos de reservas por reintentar, datos de pago sin aviso, calendarios', async () => {
	const l = armarEstado({ estados: relojesAlDia(), ahora: AHORA,
		publish: { fallo: true, falloCuando: AHORA - 2 * D, freno: 'El catálogo bajó de 40 a 3 fichas.' },
		correos: correosDe([{ codigo: 'EQ-1', avisoPendiente: 'm1', avisoApartado: AHORA - 2 * H }, { codigo: 'EQ-2', avisoPendiente: 'nueva', avisoApartado: AHORA - 60_000 }, { codigo: 'EQ-3', avisoPendiente: '' }]),
		pagos: [{ desde: AHORA - 3 * H }, { desde: AHORA - 60_000 }],
		calendarios: calendariosDe({ id: 'c1', titulo: 'Casa Lago' }, { icalUrl: { url: 'https://a/1', fallo: AHORA - 5 * H }, icalBooking: { url: 'https://b/1', fallo: AHORA - H } }, { icalUrl: 'https://a/1', icalBooking: 'https://b/otro' }, globalThis.EQVacacional?.CALENDARIOS || [{ campo: 'icalUrl', nombre: 'Airbnb' }, { campo: 'icalBooking', nombre: 'Booking' }]) });
	assert.deepEqual(l.map((x) => x.clave), ['publicar', 'ical-c1-Airbnb', 'aviso-pago', 'correos-chat']);
	assert.match(l[0].titulo, /se frenó/);
	assert.equal(l[0].href, '#/publicar');
	assert.match(l.find((x) => x.clave === 'correos-chat').titulo, /^1 correo de reservas/);
	assert.equal(l.find((x) => x.clave === 'correos-chat').href, '#/solicitudes/EQ-1');
	// Solo lo roto hace más de un día va al correo.
	assert.deepEqual(rotoMasDeUnDia(l, AHORA).map((x) => x.clave), ['publicar']);
});

await t('topes anti-robots de las últimas 24 h van al final, como aviso (no al correo)', async () => {
	const l = armarEstado({ estados: { ...relojesAlDia(), limites: { a: { nombre: 'solicitud-sin-prueba-sitio', max: 20, minutos: 60, cuando: AHORA - H }, b: { nombre: 'viejo', cuando: AHORA - 2 * D } },
		cdn: { fallo: AHORA - 3 * D, falloDesde: AHORA - 3 * D, motivo: 'Falta NETLIFY_PURGE_API_TOKEN en Netlify' } }, ahora: AHORA });
	assert.deepEqual(l.map((x) => [x.clave, x.aviso]), [['cdn', false], ['tope-solicitud-sin-prueba-sitio', true]]);
	assert.deepEqual(rotoMasDeUnDia(l, AHORA).map((x) => x.clave), ['cdn']);
});

await t('respaldo: si existe, roto o atrasado más de 26 h', async () => {
	assert.equal(armarEstado({ estados: { ...relojesAlDia(), respaldo: { ok: AHORA - 30 * H } }, ahora: AHORA })[0]?.clave, 'respaldo');
	assert.equal(armarEstado({ estados: { ...relojesAlDia(), respaldo: { ok: AHORA - 2 * H } }, ahora: AHORA }).length, 0);
});

await t('el servidor anota: falloDesde solo al pasar de bien a mal; ok lo deja sano', async () => {
	await anotarFallo('correo', 'primero', { cada: 0 });
	const desde = leer('estado/correo').falloDesde.getTime();
	S.reloj += H;
	await anotarFallo('correo', 'segundo', { cada: 0 });
	assert.equal(leer('estado/correo').falloDesde.getTime(), desde);
	assert.equal(leer('estado/correo').motivo, 'segundo');
	S.reloj += H;
	await anotarOk('correo', { cada: 0 });
	assert.equal(armarEstado({ estados: { correo: leer('estado/correo') }, ahora: S.reloj }).length, 0);
	S.reloj += H;
	await anotarFallo('correo', 'otra vez', { cada: 0 });
	assert.equal(leer('estado/correo').falloDesde.getTime(), S.reloj);
	S.reloj = AHORA;
});

await t('un reloj anota su vuelta buena; si lanza, anota el fallo y el error sigue', async () => {
	await conReloj('plazos-reservas', async () => 'listo')();
	assert.equal(leer('estado/plazos-reservas').ok.getTime(), S.reloj);
	await assert.rejects(conReloj('comisiones-vencidas', async () => { throw new Error('se cayó'); })(), /se cayó/);
	assert.equal(leer('estado/comisiones-vencidas').motivo, 'se cayó');
});

await t('si la base falla, anotar no lanza (nunca tumba a quien llama)', async () => {
	S.escrituraFalla = true;
	await anotarFallo('cdn', 'x', { cada: 0 });
	await conReloj('publicar-pendiente', async () => 1)();
	S.escrituraFalla = false;
});

await t('tope: uno por límite en estado/limites, a lo más una vez por hora', async () => {
	await anotarTope('solicitud-ip-sin-prueba', 3, 60);
	await anotarTope('solicitud-ip-sin-prueba', 3, 60);
	assert.equal(leer('estado/limites').solicitud_ip_sin_prueba.max, 3);
});

await t('correo de cada mañana: solo si algo sigue roto más de 24 h', async () => {
	for (const [k, v] of Object.entries(relojesAlDia())) poner(`estado/${k}`, v);
	assert.equal(await avisarSiSigueRoto(AHORA), 0);
	assert.equal(S.salida.length, 0);
	poner('meta/publish', { fallo: true, falloCuando: new Date(AHORA - 2 * D) });
	assert.equal(await avisarSiSigueRoto(AHORA), 1);
	assert.match(S.salida[0].asunto, /publicación/);
});

await t('calendario: si deja de responder se marca «fallo» una vez y se conserva lo último bueno; al volver, se quita', async () => {
	const { externasDe } = await import('../netlify/lib/ocupacion.mjs');
	const ICAL = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20261201\nDTEND;VALUE=DATE:20261205\nEND:VEVENT\nEND:VCALENDAR';
	let responde = true;
	const fetchAntes = globalThis.fetch;
	globalThis.fetch = async () => (responde ? new Response(ICAL, { status: 200 }) : new Response('', { status: 500 }));
	const privado = { icalUrl: 'https://airbnb.test/cal-1.ics' };
	poner('properties/c9', { operacion: 'vacacional' });
	try {
		assert.equal((await externasDe(privado, 'c9')).rangos.length, 1);
		const bueno = leer('properties/c9/privado/icalLeido').icalUrl;
		assert.ok(!bueno.fallo && bueno.rangos.length === 1);
		// Pasan 11 minutos (sale de la memoria de la función) y deja de responder.
		responde = false; S.reloj += 11 * 60_000;
		const r = await externasDe(privado, 'c9');
		assert.equal(r.rangos.length, 1, 'usa lo último bueno');
		const caido = leer('properties/c9/privado/icalLeido').icalUrl;
		assert.equal(caido.rangos.length, 1, 'no borra lo último bueno');
		assert.equal(caido.cuando.getTime?.() ?? Number(caido.cuando), bueno.cuando.getTime?.() ?? Number(bueno.cuando));
		const desde = Number(caido.fallo);
		S.reloj += 11 * 60_000;
		await externasDe(privado, 'c9');
		assert.equal(Number(leer('properties/c9/privado/icalLeido').icalUrl.fallo), desde, 'fallo se marca una sola vez');
		responde = true; S.reloj += 11 * 60_000;
		await externasDe(privado, 'c9');
		assert.ok(!leer('properties/c9/privado/icalLeido').icalUrl.fallo);
	} finally { globalThis.fetch = fetchAntes; S.reloj = AHORA; }
});

console.log(`${n} pruebas de estado del sistema pasan.`);
