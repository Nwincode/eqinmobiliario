// El enlace de la reserva, otra vez, después de corregir el correo del cliente (/api/reenviar-enlace, desde admin/js/crm.js
// corregirCorreo), con la base, la sesión y el correo simulados (scripts/simulado/): quién lo pide, a qué correo sale (el
// guardado, nunca otro), cuándo no sale (lead de contacto, solicitud cerrada o pasada) y sus límites (por solicitud y
// correo: el correo bueno de un error de dedo también lo recibe). Y el renglón del historial que no cuenta como «lo último».
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer } from './simulado/base.mjs';

let ok = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); ok++; console.log('✓', nombre); };
const { default: reenviar } = await import('../netlify/functions/reenviar-enlace.mjs');
await import('../js/calc-vacacional.js');
const { esNotaDelHistorial, ultimoDelHistorial, diaQueConfirmo, queCorreoCorregido, queEnlaceReenviado, queConfirmo } = await import('../admin/js/reservas-calculo.js');
const pedir = async (leadId, correo) => { const r = await reenviar({ method: 'POST', headers: new Headers(), json: async () => ({ leadId, ...(correo === undefined ? {} : { correo }) }) }); return [r.status, await r.json()]; };
const hoy = () => new Date(S.reloj - 6 * 3600000).toISOString().slice(0, 10);
const masDias = (n) => new Date(Date.parse(`${hoy()}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const TOKEN = 'Token00000000000000000000001';
// La solicitud con su chat (con el token de siempre: cada reenvío lo cambia).
const solicitud = (extra = {}, sol = {}) => {
	poner('leads/l1', { email: 'ana.ok@example.com', idioma: 'es', agentId: '', reserva: { codigo: 'EQ-ABC123', llegada: masDias(5), salida: masDias(8) }, solicitud: sol, ...extra });
	poner('chatsPorSolicitud/l1', { token: TOKEN });
	poner(`chats/${TOKEN}`, { leadId: 'l1', codigo: 'EQ-ABC123', estado: sol.estado === 'confirmada' ? 'confirmada' : '' });
};
// El token de ahora (el del índice).
const tokenDe = () => leer('chatsPorSolicitud/l1')?.token;
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
	// Con el enlace nuevo: el de antes deja de servir (pudo llegar a otra persona).
	assert.notEqual(tokenDe(), TOKEN);
	assert.ok(S.salida[0].texto.includes(`/reserva/#${tokenDe()}`));
	assert.ok(!S.salida[0].texto.includes(TOKEN));
	assert.equal(leer(`chats/${TOKEN}`), null);
	assert.doesNotMatch(S.salida[0].texto, /volvió a pedir/);
});

await t('en inglés, el texto en inglés y el enlace a la página en inglés', async () => {
	S.staff = ADMIN;
	solicitud({ idioma: 'en' });
	await pedir('l1');
	assert.match(S.salida[0].texto, /We corrected your email/);
	assert.ok(S.salida[0].texto.includes(`/en/reservation/#${tokenDe()}`));
});

await t('sin sesión del equipo, 403; el asesor de otra solicitud (o sin asesor), 403; el asesor de la suya, también 403 (una reserva, solo el administrador) y sin correo', async () => {
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
	const [s, d] = await pedir('l1');
	assert.deepEqual([s, d.error], [403, 'Solo el administrador corrige el correo de una reserva.']);
	assert.equal(S.salida.length, 0);
	// El asesor con su lead de contacto (sin reserva): como antes, no sale nada (200, sin correo).
	solicitud({ agentId: 'a7', reserva: null });
	assert.deepEqual(await pedir('l1'), [200, { cambio: false, enviado: false, motivo: 'Sin reserva abierta' }]);
	assert.equal(S.salida.length, 0);
	// El administrador, con la misma solicitud del asesor: sale.
	solicitud({ agentId: 'a7' });
	S.staff = ADMIN;
	assert.equal((await pedir('l1'))[1].enviado, true);
	assert.equal(S.salida.length, 1);
});

await t('no sale: lead de contacto (sin reserva), solicitud cerrada («No se dio», cancelada), estancia pasada o sin chat', async () => {
	S.staff = ADMIN;
	poner('leads/l2', { email: 'b@example.com', nombre: 'Beto' });
	assert.equal((await pedir('l2'))[1].enviado, false);
	// Sin correo, pero el enlace cambia igual (el viejo pudo llegar a otra persona): cerrada, pagada o ya pasada.
	for (const estado of ['no', 'cancelada']) { solicitud({}, { estado }); const [, d] = await pedir('l1'); assert.deepEqual([d.enviado, d.rotado], [false, true], estado); assert.notEqual(tokenDe(), TOKEN); }
	solicitud({ reserva: { codigo: 'EQ-ABC123', llegada: masDias(-5), salida: masDias(-2) } });
	assert.deepEqual((await pedir('l1'))[1].rotado, true);
	poner('leads/l3', { email: 'c@example.com', reserva: { codigo: 'EQ-XYZ', llegada: masDias(5), salida: masDias(8) } });
	assert.equal((await pedir('l3'))[1].enviado, false);
	assert.equal(S.salida.length, 0);
	assert.equal((await pedir('../users/x'))[0], 400);
	assert.equal((await pedir('no-existe'))[0], 404);
});

await t('confirmada: sí sale; un error de dedo corregido al minuto también le llega al correo bueno; el mismo correo otra vez, también (es otro enlace)', async () => {
	S.staff = ADMIN;
	solicitud({ email: 'ana@exmaple.com' }, { estado: 'confirmada' });
	assert.equal((await pedir('l1'))[1].para, 'ana@exmaple.com');
	minutos(1);
	solicitud({ email: 'ana@example.com' }, { estado: 'confirmada' });
	assert.equal((await pedir('l1'))[1].para, 'ana@example.com');
	minutos(1);
	assert.equal((await pedir('l1'))[1].enviado, true);
	assert.deepEqual(S.salida.map((c) => c.para), ['ana@exmaple.com', 'ana@example.com', 'ana@example.com']);
});

await t('a lo más 6 al día por solicitud (aunque cada vez sea otro correo)', async () => {
	S.staff = ADMIN;
	for (let i = 0; i < 8; i++) { solicitud({ email: `ana${i}@example.com` }); await pedir('l1'); minutos(1); }
	assert.equal(S.salida.length, 6);
});

await t('el enlace nuevo se lleva todo lo del chat: mensajes, notas del equipo, reserva, traducciones y aviso de contacto; la foto de hoy no se mueve (carpeta de la solicitud) y las de antes pasan a ella; lo viejo ya no existe', async () => {
	S.staff = ADMIN;
	solicitud({}, { estado: 'confirmada' });
	const vieja = `https://firebasestorage.googleapis.com/v0/b/eqinmobiliariobd.firebasestorage.app/o/chats%2F${TOKEN}%2Fa1.webp?alt=media&token=abc-1`;
	poner(`chats/${TOKEN}/mensajes/m1`, { de: 'cliente', texto: 'Hola', createdAt: new Date(S.reloj - 60_000) });
	poner(`chats/${TOKEN}/mensajes/m2`, { de: 'cliente', tipo: 'foto', texto: vieja });
	poner(`chats/${TOKEN}/mensajes/m3`, { de: 'cliente', tipo: 'foto', texto: `chats/${TOKEN}/b2.webp` });
	poner(`chats/${TOKEN}/mensajes/c4`, { de: 'cliente', tipo: 'foto', texto: 'fotosChat/l1/1' });
	poner(`notasEquipo/${TOKEN}/notas/n1`, { de: 'equipo', texto: 'Nota del equipo' });
	poner(`traduccionesChat/${TOKEN}`, { n: 3 });
	poner(`alertas/contacto-${TOKEN}`, { ultimo: 'm1', n: 1 });
	poner('reservas/l1', { chat: TOKEN, estado: 'confirmada' });
	S.archivos = new Map([[`chats/${TOKEN}/a1.webp`, { tipo: 'image/webp', datos: 'a', llave: 'abc-1' }], [`chats/${TOKEN}/b2.webp`, { tipo: 'image/webp', datos: 'b', llave: '' }], ['fotosChat/l1/1', { tipo: 'image/webp', datos: 'c', llave: '' }]]);
	const [s, d] = await pedir('l1');
	const nuevo = tokenDe();
	assert.deepEqual([s, d.enviado], [200, true]);
	assert.equal(leer(`chats/${nuevo}`).codigo, 'EQ-ABC123');
	assert.equal(leer(`chats/${nuevo}/mensajes/m1`).texto, 'Hola');
	assert.equal(leer(`chats/${nuevo}/mensajes/m2`).texto, 'fotosChat/l1/a1.webp');
	assert.equal(leer(`chats/${nuevo}/mensajes/m3`).texto, 'fotosChat/l1/b2.webp');
	assert.equal(leer(`chats/${nuevo}/mensajes/c4`).texto, 'fotosChat/l1/1');
	assert.equal(leer(`notasEquipo/${nuevo}/notas/n1`).texto, 'Nota del equipo');
	assert.equal(leer(`traduccionesChat/${nuevo}`).n, 3);
	assert.equal(leer(`alertas/contacto-${nuevo}`).ultimo, 'm1');
	assert.equal(leer('reservas/l1').chat, nuevo);
	for (const r of [`chats/${TOKEN}`, `chats/${TOKEN}/mensajes/m1`, `chats/${TOKEN}/mensajes/m2`, `notasEquipo/${TOKEN}/notas/n1`, `traduccionesChat/${TOKEN}`, `alertas/contacto-${TOKEN}`]) assert.equal(leer(r), null, r);
	assert.deepEqual([...S.archivos.keys()].sort(), ['fotosChat/l1/1', 'fotosChat/l1/a1.webp', 'fotosChat/l1/b2.webp']);
	// La copia no lleva el token de descarga de antes (solo la abre la cuenta de servicio: /api/foto).
	assert.equal(S.archivos.get('fotosChat/l1/a1.webp').llave, '');
	// Con el enlace viejo, /api/foto ya no da nada.
	const { decidirFoto } = await import('../netlify/functions/foto.mjs');
	assert.equal((await decidirFoto(TOKEN, 'm3', null)).estado, 404);
	assert.equal((await decidirFoto(nuevo, 'm3', { rol: 'admin' })).ruta, 'fotosChat/l1/b2.webp');
	assert.equal((await decidirFoto(nuevo, 'c4', { rol: 'admin' })).ruta, 'fotosChat/l1/1');
});

await t('con el correo corregido: el servidor lo guarda (minúsculas, sin la marca de rebote, con sus dos renglones) junto con el enlace nuevo, y le llega al corregido', async () => {
	S.staff = ADMIN;
	solicitud({ email: 'ana@exmaple.com', reboteCorreo: { motivo: 'no existe' } }, { estado: 'confirmada', historial: [] });
	const [s, d] = await pedir('l1', ' Ana@Example.com ');
	assert.deepEqual([s, d.cambio, d.enviado, d.para], [200, true, true, 'ana@example.com']);
	const l = leer('leads/l1');
	assert.equal(l.email, 'ana@example.com');
	assert.ok(!('reboteCorreo' in l));
	assert.deepEqual(l.solicitud.historial.map((x) => x.que), [queCorreoCorregido('ana@exmaple.com', 'ana@example.com'), queEnlaceReenviado('ana@example.com')]);
	assert.equal(l.solicitud.historial[0].quien, 'u-admin');
	assert.equal(S.salida[0].para, 'ana@example.com');
	assert.notEqual(tokenDe(), TOKEN);
});

await t('si no se puede cambiar el enlace, el correo tampoco cambia (los dos juntos), el enlace de antes sigue y no queda nada con el nuevo', async () => {
	S.staff = ADMIN;
	solicitud({ email: 'ana@exmaple.com' }, { estado: 'confirmada' });
	poner(`chats/${TOKEN}/mensajes/c1`, { de: 'cliente', texto: 'Hola' });
	S.fallarSi = (ruta) => ruta === 'chatsPorSolicitud/l1';
	try {
		const [s, d] = await pedir('l1', 'ana@example.com');
		assert.equal(s, 502);
		assert.match(d.error, /el correo sigue como estaba/);
	} finally { S.fallarSi = null; }
	assert.equal(leer('leads/l1').email, 'ana@exmaple.com');
	assert.equal(tokenDe(), TOKEN);
	assert.deepEqual([...S.docs.keys()].filter((k) => k.startsWith('chats/') && !k.startsWith(`chats/${TOKEN}`)), []);
	assert.equal(S.salida.length, 0);
});

await t('si el cambio llegó pero su respuesta se perdió, se sigue con el enlace nuevo (no se borra lo copiado)', async () => {
	S.staff = ADMIN;
	solicitud({}, { estado: 'confirmada' });
	poner(`chats/${TOKEN}/mensajes/c1`, { de: 'cliente', texto: 'Hola' });
	S.perderRespuestaSi = (ruta) => ruta === 'chatsPorSolicitud/l1';
	try { assert.equal((await pedir('l1'))[1].enviado, true); } finally { S.perderRespuestaSi = null; }
	assert.equal(leer(`chats/${tokenDe()}/mensajes/c1`).texto, 'Hola');
	assert.equal(leer(`chats/${TOKEN}/mensajes/c1`), null);
});

await t('un índice que apunta a un chat que ya no existe: se guarda el correo y se dice, sin error que se repita', async () => {
	S.staff = ADMIN;
	solicitud({ email: 'ana@exmaple.com' }, { estado: 'confirmada' });
	S.docs.delete(`chats/${TOKEN}`);
	assert.deepEqual(await pedir('l1', 'ana@example.com'), [200, { cambio: true, rotado: false, enviado: false, motivo: 'La reserva no tiene chat' }]);
	assert.equal(leer('leads/l1').email, 'ana@example.com');
});

await t('el enlace nuevo vuelve a empezar los topes del cliente (gen); si no se pudo terminar, queda anotado y el control de cada hora lo termina', async () => {
	const { rotarEnlace, terminarRotaciones } = await import('../netlify/lib/rotar-enlace.mjs');
	solicitud({}, { estado: 'confirmada' });
	poner(`chats/${TOKEN}`, { leadId: 'l1', estado: 'confirmada', gen: 2 });
	poner(`chats/${TOKEN}/mensajes/c2-1`, { de: 'cliente', texto: 'Hola' });
	// El borrado de lo viejo falla: queda en rotaciones/{viejo}.
	S.fallarSi = (ruta) => ruta === `chats/${TOKEN}/mensajes/c2-1`;
	const nuevo = await rotarEnlace('l1', { nuevo: 'TokenNuevoDePruebaLargo12345' });
	S.fallarSi = null;
	assert.equal(leer(`chats/${nuevo}`).gen, 3);
	assert.ok(leer(`rotaciones/${TOKEN}`));
	assert.ok(leer(`chats/${TOKEN}/mensajes/c2-1`));
	assert.equal(await terminarRotaciones(), 1);
	assert.equal(leer(`rotaciones/${TOKEN}`), null);
	assert.equal(leer(`chats/${TOKEN}/mensajes/c2-1`), null);
	assert.equal(leer(`chats/${nuevo}/mensajes/c2-1`).texto, 'Hola');
});

await t('reserva cerrada: se guarda el correo y el enlace cambia igual, sin correo; con el tope del día lleno, el enlace cambia y el correo no sale', async () => {
	S.staff = ADMIN;
	solicitud({ email: 'a@exmaple.com' }, { estado: 'cancelada' });
	assert.deepEqual(await pedir('l1', 'a@example.com'), [200, { cambio: true, rotado: true, enviado: false, motivo: 'Sin reserva abierta' }]);
	assert.equal(leer('leads/l1').email, 'a@example.com');
	assert.notEqual(tokenDe(), TOKEN);
	assert.equal(S.salida.length, 0);
	// Seis reenvíos en el día: el séptimo cambia el enlace pero ya no manda correo (y lo dice).
	for (let i = 0; i < 6; i++) { solicitud({ email: `x${i}@example.com` }); await pedir('l1'); minutos(1); }
	solicitud({ email: 'y@example.com' });
	const [, d] = await pedir('l1');
	assert.deepEqual([d.rotado, d.enviado, d.motivo], [true, false, 'Ya se le mandó muchas veces hoy']);
	assert.equal(S.salida.length, 6);
});

await t('el límite cuenta solo lo que salió: si el correo falla, el reintento sí sale', async () => {
	S.staff = ADMIN;
	solicitud({}, { estado: 'confirmada' });
	S.correoFalla = true;
	try { assert.deepEqual((await pedir('l1'))[1].enviado, false); } finally { S.correoFalla = false; }
	assert.equal((await pedir('l1'))[1].enviado, true);
});

await t('rotarEnlace: un chat con 200 mensajes del cliente y 250 más se mueve entero (por lotes); si el cambio falla, no queda nada con el token nuevo', async () => {
	S.fallarSi = null;
	const { rotarEnlace } = await import('../netlify/lib/rotar-enlace.mjs');
	solicitud({}, { estado: 'confirmada' });
	for (let i = 1; i <= 200; i++) poner(`chats/${TOKEN}/mensajes/c${i}`, { de: 'cliente', texto: `m${i}` });
	for (let i = 1; i <= 250; i++) poner(`chats/${TOKEN}/mensajes/s${i}`, { de: 'socio', texto: `s${i}` });
	const nuevo = await rotarEnlace('l1', { nuevo: 'TokenNuevoDePruebaLargo12345' });
	assert.equal(nuevo, 'TokenNuevoDePruebaLargo12345');
	const cuenta = (t) => [...S.docs.keys()].filter((k) => k.startsWith(`chats/${t}/mensajes/`)).length;
	assert.deepEqual([cuenta(nuevo), cuenta(TOKEN)], [450, 0]);
	// Falla el cambio (otro ya cambió el índice): lo copiado se borra.
	limpiar(); solicitud({}, { estado: 'confirmada' });
	poner(`chats/${TOKEN}/mensajes/c1`, { de: 'cliente', texto: 'Hola' });
	S.fallarSi = (ruta) => ruta === 'chatsPorSolicitud/l1';
	try { await assert.rejects(rotarEnlace('l1', { nuevo: 'TokenNuevoDePruebaLargo12345' })); } finally { S.fallarSi = null; }
	assert.deepEqual([cuenta('TokenNuevoDePruebaLargo12345'), cuenta(TOKEN)], [0, 1]);
});

await t('un correo mal escrito o en un lead de contacto, 400', async () => {
	S.staff = ADMIN;
	solicitud();
	assert.equal((await pedir('l1', 'ana@'))[0], 400);
	poner('leads/l2', { email: 'b@example.com', nombre: 'Beto' });
	assert.equal((await pedir('l2', 'c@example.com'))[0], 400);
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
