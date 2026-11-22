// El enlace de la reserva, otra vez, después de corregir el correo del cliente (/api/reenviar-enlace, desde admin/js/crm.js
// corregirCorreo), con la base, la sesión y el correo simulados (scripts/simulado/): quién lo pide, a qué correo sale (el
// guardado, nunca otro), cuándo no sale (lead de contacto, solicitud cerrada o pasada) y sus límites (por solicitud y
// correo: el correo bueno de un error de dedo también lo recibe). Y el renglón del historial que no cuenta como «lo último».
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner } from './simulado/base.mjs';

let ok = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); ok++; console.log('✓', nombre); };
const { default: reenviar } = await import('../netlify/functions/reenviar-enlace.mjs');
await import('../js/calc-vacacional.js');
const { esNotaDelHistorial, ultimoDelHistorial, diaQueConfirmo, queCorreoCorregido, queEnlaceReenviado, queConfirmo } = await import('../admin/js/reservas-calculo.js');
const pedir = async (leadId) => { const r = await reenviar({ method: 'POST', headers: new Headers(), json: async () => ({ leadId }) }); return [r.status, await r.json()]; };
const hoy = () => new Date(S.reloj - 6 * 3600000).toISOString().slice(0, 10);
const masDias = (n) => new Date(Date.parse(`${hoy()}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const TOKEN = 'Token00000000000000000000001';
const solicitud = (extra = {}, sol = {}) => {
	poner('leads/l1', { email: 'ana.ok@example.com', idioma: 'es', agentId: '', reserva: { codigo: 'EQ-ABC123', llegada: masDias(5), salida: masDias(8) }, solicitud: sol, ...extra });
	poner('chatsPorSolicitud/l1', { token: TOKEN });
};
const ADMIN = { uid: 'u-admin', admin: true, nombre: 'Admin', agentId: '' };
const minutos = (n) => { S.reloj += n * 60_000; };

await t('el administrador lo pide: sale el enlace de su reserva al correo guardado, con el texto del correo corregido', async () => {
	S.staff = ADMIN;
	solicitud();
	const [s, d] = await pedir('l1');
	assert.deepEqual([s, d.enviado, d.para], [200, true, 'ana.ok@example.com']);
	assert.equal(S.salida.length, 1);
	assert.equal(S.salida[0].para, 'ana.ok@example.com');
	assert.match(S.salida[0].texto, /Corregimos tu correo/);
	assert.ok(S.salida[0].texto.includes(`/reserva/#${TOKEN}`));
	assert.doesNotMatch(S.salida[0].texto, /volvió a pedir/);
});

await t('en inglés, el texto en inglés y el enlace a la página en inglés', async () => {
	S.staff = ADMIN;
	solicitud({ idioma: 'en' });
	await pedir('l1');
	assert.match(S.salida[0].texto, /We corrected your email/);
	assert.ok(S.salida[0].texto.includes(`/en/reservation/#${TOKEN}`));
});

await t('sin sesión del equipo, 403; el asesor de otra solicitud (o sin asesor), 403; el asesor de la suya, sí', async () => {
	solicitud({ agentId: 'a7' });
	assert.equal((await pedir('l1'))[0], 403);
	S.staff = { uid: 'u-a9', admin: false, nombre: 'Asesor', agentId: 'a9' };
	assert.equal((await pedir('l1'))[0], 403);
	// Una solicitud sin asesor ('') no es de un asesor sin asesor: como myAgentId() de las reglas.
	solicitud({ agentId: '' });
	S.staff = { uid: 'u-sin', admin: false, nombre: 'Asesor', agentId: '' };
	assert.equal((await pedir('l1'))[0], 403);
	solicitud({ agentId: 'a7' });
	S.staff = { uid: 'u-a7', admin: false, nombre: 'Asesor', agentId: 'a7' };
	assert.deepEqual((await pedir('l1'))[1].enviado, true);
	assert.equal(S.salida.length, 1);
});

await t('no sale: lead de contacto (sin reserva), solicitud cerrada («No se dio», cancelada), estancia pasada o sin chat', async () => {
	S.staff = ADMIN;
	poner('leads/l2', { email: 'b@example.com', nombre: 'Beto' });
	assert.equal((await pedir('l2'))[1].enviado, false);
	for (const estado of ['no', 'cancelada']) { solicitud({}, { estado }); assert.equal((await pedir('l1'))[1].enviado, false, estado); }
	solicitud({ reserva: { codigo: 'EQ-ABC123', llegada: masDias(-5), salida: masDias(-2) } });
	assert.equal((await pedir('l1'))[1].enviado, false);
	poner('leads/l3', { email: 'c@example.com', reserva: { codigo: 'EQ-XYZ', llegada: masDias(5), salida: masDias(8) } });
	assert.equal((await pedir('l3'))[1].enviado, false);
	assert.equal(S.salida.length, 0);
	assert.equal((await pedir('../users/x'))[0], 400);
	assert.equal((await pedir('no-existe'))[0], 404);
});

await t('confirmada: sí sale; un error de dedo corregido al minuto también le llega al correo bueno; el mismo correo otra vez, no', async () => {
	S.staff = ADMIN;
	solicitud({ email: 'ana@exmaple.com' }, { estado: 'confirmada' });
	assert.equal((await pedir('l1'))[1].para, 'ana@exmaple.com');
	minutos(1);
	solicitud({ email: 'ana@example.com' }, { estado: 'confirmada' });
	assert.equal((await pedir('l1'))[1].para, 'ana@example.com');
	minutos(1);
	assert.equal((await pedir('l1'))[1].enviado, false);
	assert.deepEqual(S.salida.map((c) => c.para), ['ana@exmaple.com', 'ana@example.com']);
	minutos(11);
	assert.equal((await pedir('l1'))[1].enviado, true);
});

await t('a lo más 6 al día por solicitud (aunque cada vez sea otro correo)', async () => {
	S.staff = ADMIN;
	for (let i = 0; i < 8; i++) { solicitud({ email: `ana${i}@example.com` }); await pedir('l1'); minutos(1); }
	assert.equal(S.salida.length, 6);
});

await t('el historial: el correo corregido y el enlace reenviado no son «lo último que pasó» ni mueven la fecha de «Confirmó»', () => {
	const h = [{ que: queConfirmo(), cuando: '2026-10-05T15:00:00.000Z' }, { que: 'Pago recibido', cuando: '2026-10-07T15:00:00.000Z' },
		{ que: queCorreoCorregido('a@x.com', 'b@x.com'), cuando: '2026-11-21T15:00:00.000Z' }, { que: queEnlaceReenviado('b@x.com'), cuando: '2026-11-21T15:00:01.000Z' }];
	assert.ok(esNotaDelHistorial(h[2]) && esNotaDelHistorial(h[3]) && !esNotaDelHistorial(h[0]) && !esNotaDelHistorial(h[1]));
	assert.equal(ultimoDelHistorial(h).que, 'Pago recibido');
	// Antes contaba por el último renglón: una confirmación de octubre salía en las de noviembre.
	assert.equal(diaQueConfirmo(h), '2026-10-05');
	assert.equal(diaQueConfirmo([{ que: queConfirmo(['Airbnb']), cuando: '2026-11-01T05:30:00.000Z' }]), '2026-10-31', 'el día de Guatemala, no el de UTC');
	assert.equal(diaQueConfirmo([{ que: 'No se dio', cuando: '2026-11-01T15:00:00.000Z' }]), '');
	assert.equal(ultimoDelHistorial([h[2]]).que, h[2].que, 'con solo notas, la última nota');
});

console.log(`${ok} pruebas del reenvío del enlace pasan.`);
