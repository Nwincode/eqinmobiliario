// El cron de plazos (netlify/functions/plazos-reservas.mjs) con la base, el correo y el reloj simulados (scripts/simulado/):
// una solicitud sin chat no se queda en cada vuelta y las de verdad se atienden primero; al confirmar, se cierran las
// abiertas de esa casa que se cruzan (netlify/lib/reservas-servidor.mjs cerrarLasQueSeCruzan).
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer } from './simulado/base.mjs';

let ok = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); ok++; console.log('✓', nombre); };
const { default: plazos } = await import('../netlify/functions/plazos-reservas.mjs');
const { MOTIVO_SIN_CHAT, MOTIVO_SIN_RESPUESTA } = await import('../admin/js/reservas-calculo.js');
const hace = (min) => new Date(S.reloj - min * 60000);
const TOKEN = 'TokenDeUnChatDePrueba0001';
const solicitud = (id, min, extra = {}) => poner(`leads/${id}`, { nombre: 'Ana', propertyId: 'c1', createdAt: hace(min),
	reserva: { codigo: `EQ-${id}`, llegada: '2026-12-20', salida: '2026-12-23', noches: 3, huespedes: 2, moneda: 'USD' }, ...extra });

await t('una solicitud sin chat se cierra («Sin chat», sin correo) y la de verdad se cierra igual en la misma vuelta', async () => {
	poner('properties/c1', { titulo: 'Casa del lago', operacion: 'vacacional', publicado: true, estado: 'disponible', vacacional: { reservadas: [] } });
	for (let i = 0; i < 40; i++) solicitud(`falsa${i}`, 60);
	solicitud('nueva', 2);
	solicitud('real', 25 * 60);
	poner('chatsPorSolicitud/real', { token: TOKEN });
	poner(`chats/${TOKEN}`, { leadId: 'real', codigo: 'EQ-real', propertyId: 'c1', llegada: '2026-12-20', salida: '2026-12-23', createdAt: hace(25 * 60) });
	await plazos();
	assert.equal(leer('leads/real').solicitud?.motivo, MOTIVO_SIN_RESPUESTA, 'la de verdad se cerró por su plazo');
	for (let i = 0; i < 40; i++) {
		assert.equal(leer(`leads/falsa${i}`).solicitud?.estado, 'no');
		assert.equal(leer(`leads/falsa${i}`).solicitud?.motivo, MOTIVO_SIN_CHAT);
	}
	assert.equal(leer('leads/nueva').solicitud, undefined, 'recién llegada: su chat puede estar naciendo');
	assert.ok(!S.salida.some((c) => /falsa/.test(JSON.stringify(c))), 'sin correo por las que no tienen chat');
});

await t('con la vuelta cortada, lo de verdad va antes que las solicitudes sin chat', async () => {
	poner('properties/c1', { titulo: 'Casa del lago', operacion: 'vacacional', publicado: true, estado: 'disponible', vacacional: { reservadas: [] } });
	for (let i = 0; i < 40; i++) solicitud(`falsa${i}`, 60);
	solicitud('real', 25 * 60);
	poner('chatsPorSolicitud/real', { token: TOKEN });
	poner(`chats/${TOKEN}`, { leadId: 'real', codigo: 'EQ-real', propertyId: 'c1', llegada: '2026-12-20', salida: '2026-12-23', createdAt: hace(25 * 60) });
	// Cada consulta de la hora avanza 1 s: la vuelta (20 s) no alcanza para las 40 sin chat.
	const reloj = Date.now;
	let n = 0;
	Date.now = () => S.reloj + (n++) * 1000;
	try { await plazos(); } finally { Date.now = reloj; }
	assert.equal(leer('leads/real').solicitud?.motivo, MOTIVO_SIN_RESPUESTA);
	assert.ok(Array.from({ length: 40 }, (_, i) => leer(`leads/falsa${i}`).solicitud).some((x) => !x), 'quedaron sin chat para la vuelta siguiente');
});

await t('al confirmar, se cierran las abiertas de esa casa que se cruzan (solo de esa casa, también una de hace más de 30 días)', async () => {
	const { cerrarLasQueSeCruzan } = await import('../netlify/lib/reservas-servidor.mjs');
	for (const c of ['c1', 'c2']) poner(`properties/${c}`, { titulo: c, operacion: 'vacacional', publicado: true, estado: 'disponible', vacacional: { reservadas: [{ desde: '2026-12-20', hasta: '2026-12-23' }] } });
	const conChat = (id, casa, min) => {
		solicitud(id, min, { propertyId: casa });
		const token = `TokenDelChatDe${id}000000000`;
		poner(`chatsPorSolicitud/${id}`, { token });
		poner(`chats/${token}`, { leadId: id, codigo: `EQ-${id}`, propertyId: casa, llegada: '2026-12-20', salida: '2026-12-23' });
	};
	conChat('deC1', 'c1', 60);
	conChat('vieja', 'c1', 40 * 24 * 60);
	conChat('deC2', 'c2', 60);
	const cerradas = await cerrarLasQueSeCruzan('c1', '2026-12-20', '2026-12-23');
	assert.equal(cerradas.length, 2);
	assert.equal(leer('leads/deC1').solicitud?.estado, 'no');
	assert.equal(leer('leads/vieja').solicitud?.estado, 'no');
	assert.equal(leer('leads/deC2').solicitud, undefined, 'la de otra casa no se toca');
	assert.deepEqual(await cerrarLasQueSeCruzan('', '2026-12-20', '2026-12-23'), []);
});

// Una reserva cuya solicitud se borró a mano (antes de que las reglas lo impidieran): ni el cron ni el socio fallan.
const sinSolicitud = () => {
	poner('properties/c1', { titulo: 'Casa del lago', operacion: 'vacacional', publicado: true, estado: 'disponible', propietarioId: 'p1', vacacional: { reservadas: [{ desde: '2026-12-20', hasta: '2026-12-23' }] } });
	poner('chatsPorSolicitud/borrada', { token: TOKEN });
	poner(`chats/${TOKEN}`, { leadId: 'borrada', codigo: 'EQ-B', propertyId: 'c1', propietarioId: 'p1', estado: 'confirmada', llegada: '2026-12-20', salida: '2026-12-23', idioma: 'es' });
	poner('reservas/borrada', { leadId: 'borrada', chat: TOKEN, codigo: 'EQ-B', propertyId: 'c1', propietarioId: 'p1', estado: 'confirmada', llegada: '2026-12-20', salida: '2026-12-23', moneda: 'USD',
		createdAt: hace(30 * 60), pagoDesde: S.reloj - 30 * 3600000, vencePago: S.reloj - 3600000, comision: { monto: 40, vence: '2026-12-20', pagada: false } });
};
await t('sin su solicitud, la reserva sin pago se cancela sola igual (antes: NOT_FOUND en cada vuelta y las fechas trabadas)', async () => {
	sinSolicitud();
	await plazos();
	assert.equal(leer('reservas/borrada').estado, 'cancelada');
	assert.equal(leer(`chats/${TOKEN}`).estado, 'cancelada');
	assert.deepEqual(leer('properties/c1').vacacional.reservadas, []);
	assert.equal(leer('leads/borrada'), null, 'no se inventa la solicitud');
});
await t('sin su solicitud, el socio cancela y marca el pago (antes: 404 «No encontramos esa solicitud»)', async () => {
	const { default: reservas } = await import('../netlify/functions/reservas.mjs');
	const pedir = (accion, extra = {}) => reservas({ method: 'POST', headers: new Headers(), json: async () => ({ accion, leadId: 'borrada', ...extra }) }, {});
	S.socio = { uid: 'u-socio', nombre: 'Rodrigo', propietarioId: 'p1' };
	sinSolicitud();
	poner(`reservas/borrada`, { ...leer('reservas/borrada'), vencePago: S.reloj + 86400000 });
	poner('properties/c1/privado/llegada', { direccion: 'Km 98.5, Monterrico', mapa: '' });
	assert.equal((await pedir('pago')).status, 200);
	assert.equal(leer(`chats/${TOKEN}`).estado, 'pagada');
	sinSolicitud();
	poner(`reservas/borrada`, { ...leer('reservas/borrada'), vencePago: S.reloj + 86400000 });
	assert.equal((await pedir('cancelar', { motivo: 'Cliente canceló' })).status, 200);
	assert.equal(leer('reservas/borrada').estado, 'cancelada');
	assert.equal(leer('leads/borrada'), null);
});

await t('a las 24 h, la que confirmaba el equipo se cierra con su motivo («No se confirmó a tiempo»), no «sin respuesta del anfitrión»; el cliente en inglés lo lee en inglés', async () => {
	const { MOTIVO_EQUIPO_NO_CONFIRMO } = await import('../admin/js/reservas-calculo.js');
	poner('properties/c1', { titulo: 'Casa del lago', operacion: 'vacacional', publicado: true, estado: 'disponible', vacacional: { reservadas: [] } });
	solicitud('equipo', 25 * 60);
	poner('chatsPorSolicitud/equipo', { token: TOKEN });
	poner(`chats/${TOKEN}`, { leadId: 'equipo', codigo: 'EQ-equipo', propertyId: 'c1', llegada: '2026-12-20', salida: '2026-12-23', idioma: 'en', confirmaEquipo: true, createdAt: hace(25 * 60) });
	await plazos();
	assert.equal(leer('leads/equipo').solicitud?.motivo, MOTIVO_EQUIPO_NO_CONFIRMO);
	const msj = [...S.docs.keys()].filter((k) => k.startsWith(`chats/${TOKEN}/mensajes/`)).map((k) => leer(k));
	assert.equal(msj.length, 1);
	assert.match(msj[0].texto, /^We could not confirm your request in time/);
	assert.equal(msj[0].motivo, MOTIVO_EQUIPO_NO_CONFIRMO);
});
await t('sin pago a tiempo, el cliente en inglés lee la cancelación en inglés', async () => {
	sinSolicitud();
	poner(`chats/${TOKEN}`, { ...leer(`chats/${TOKEN}`), idioma: 'en' });
	await plazos();
	const msj = [...S.docs.keys()].filter((k) => k.startsWith(`chats/${TOKEN}/mensajes/`)).map((k) => leer(k));
	assert.match(msj.at(-1).texto, /^We did not receive your payment in time/);
});

await t('«por publicar» que se perdió: una reserva confirmada después de la última publicación marca meta/publish; si ya está al día, no', async () => {
	poner('meta/publish', { pendiente: false, ultimaPublicacion: hace(60) });
	poner('reservas/r1', { estado: 'confirmada', propertyId: 'c1', createdAt: hace(10), updatedAt: hace(10) });
	await plazos();
	assert.equal(leer('meta/publish').pendiente, true);
	limpiar();
	poner('meta/publish', { pendiente: false, ultimaPublicacion: hace(5) });
	poner('reservas/r1', { estado: 'confirmada', propertyId: 'c1', createdAt: hace(10), updatedAt: hace(10) });
	await plazos();
	assert.equal(leer('meta/publish').pendiente, false);
});

console.log(`${ok} pruebas del cron de plazos pasan.`);
