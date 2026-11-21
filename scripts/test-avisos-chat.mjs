// Pruebas de los avisos por correo del chat de la reserva (netlify/lib/avisos-chat.mjs). Sin dependencias.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avisosChat, sinResponder } from '../netlify/lib/avisos-chat.mjs';
import { puedeApartar, EN_CURSO } from '../netlify/lib/aviso-chat-envio.mjs';

const AHORA = Date.parse('2026-11-13T12:00:00Z');
const hace = (min) => new Date(AHORA - min * 60_000);
const chat = { id: 'TokenDePruebaLargoYAlAzar2345', codigo: 'EQ-PRUEBA', propertyTitulo: 'Casa de playa', llegada: '2026-11-16', salida: '2026-11-20', huespedes: 2, nombre: 'Ana', idioma: 'es', createdAt: hace(1) };
const correos = { cliente: 'ana@example.com', socio: 'socio@example.com', equipo: ['equipo@example.com'] };
const avisos = (mensajes, extra = {}) => avisosChat({ chat: { ...chat, ...extra }, mensajes, correos, sitio: 'https://ejemplo.gt', ahora: AHORA });
const m = (de, min, tipo) => ({ de, texto: 'hola', createdAt: hace(min), ...(tipo ? { tipo } : {}) });
let ok = 0;
function test(nombre, fn) {
	try { fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${err.stack}`); process.exitCode = 1; }
}

test('solicitud nueva: al socio y al equipo (panel) y al cliente (su reserva)', () => {
	const a = avisos([]);
	assert.deepEqual(a.map((x) => x.para), [['socio@example.com'], ['equipo@example.com'], ['ana@example.com']]);
	assert.equal(a[0].url, 'https://ejemplo.gt/admin/#/solicitudes/EQ-PRUEBA');
	assert.equal(a[1].url, 'https://ejemplo.gt/admin/#/solicitudes/EQ-PRUEBA');
	assert.equal(a[2].url, 'https://ejemplo.gt/reserva/#TokenDePruebaLargoYAlAzar2345');
	// Sin socio con correo, el equipo la recibe una sola vez.
	assert.deepEqual(avisosChat({ chat, mensajes: [], correos: { ...correos, socio: '' }, sitio: 'https://ejemplo.gt', ahora: AHORA }).map((x) => x.para), [['equipo@example.com'], ['ana@example.com']]);
});
test('solicitud que confirma el equipo (cotizada por debajo): al socio no se le pide responder ni al cliente se le prometen fechas apartadas', () => {
	const a = avisos([], { confirmaEquipo: true });
	assert.match(a[0].intro, /La confirma el equipo/);
	assert.ok(a.every((x) => !/apartad|held/i.test(`${x.intro} ${x.titulo}`)), a.map((x) => x.intro).join(' | '));
	assert.match(avisos([], { confirmaEquipo: true, idioma: 'en' }).at(-1).intro, /Our team reviews your request/);
});
test('lo que se cerró solo por un plazo dice el motivo de verdad: la casa salió del sitio, el equipo no la confirmó o nadie respondió', () => {
	const cerrada = (motivo) => avisos([m('cliente', 60), { de: 'equipo', texto: 'Cerramos…', plazo: true, motivo, createdAt: hace(0) }], { estado: 'no' }).find((x) => x.para[0] === 'socio@example.com');
	assert.match(cerrada('La casa ya no está disponible').asunto, /la casa ya no está en el sitio/);
	assert.doesNotMatch(cerrada('La casa ya no está disponible').intro, /Nadie la respondió/);
	assert.match(cerrada('No se confirmó a tiempo').intro, /La confirmaba el equipo/);
	assert.match(cerrada('Sin respuesta del anfitrión').intro, /Nadie la respondió en 24 h/);
});
test('recordatorio de pago (lo que vence solo): al cliente y al socio, por si ya le pagaron', () => {
	const a = avisos([m('socio', 60, 'pago'), { de: 'equipo', tipo: 'recordatorio', texto: 'Recuerda…', createdAt: hace(0) }], { estado: 'confirmada' });
	assert.deepEqual(a.map((x) => x.para), [['ana@example.com'], ['socio@example.com']]);
	assert.match(a[1].intro, /marca «Pago recibido»/);
});
test('se canceló o cerró sola por un plazo (mensaje del equipo): el anfitrión y el cliente se enteran; el equipo no recibe «el socio canceló»', () => {
	const a = avisos([m('socio', 60, 'pago'), { de: 'equipo', texto: 'No recibimos tu pago…', plazo: true, createdAt: hace(0) }], { estado: 'cancelada' });
	assert.deepEqual(a.map((x) => x.para), [['socio@example.com'], ['ana@example.com']]);
	assert.match(a[0].titulo, /se canceló sola/);
	const b = avisos([{ de: 'equipo', texto: 'El anfitrión no respondió…', plazo: true, createdAt: hace(0) }], { estado: 'no' });
	assert.match(b[0].titulo, /se cerró sola/);
});
test('cliente en inglés: su correo en inglés (fechas y «guests»); el socio lo lee en español con el título en español', () => {
	const a = avisosChat({ chat: { ...chat, idioma: 'en' }, casa: { titulo: 'Casa de playa', en: { titulo: 'Beach house' } }, mensajes: [], correos, sitio: 'https://ejemplo.gt', ahora: AHORA });
	assert.match(a.at(-1).intro, /^The host of Beach house reviews it/);
	assert.deepEqual(a.at(-1).datos.slice(0, 3).map((f) => f[1]), ['Mon, Nov 16', 'Fri, Nov 20', '2 guests']);
	assert.match(a[0].intro, /^Respóndela pronto/);
	assert.deepEqual(a[0].datos.slice(0, 4).map((f) => f[1]), ['Casa de playa', 'lun, 16 nov', 'vie, 20 nov', '2 personas']);
});
test('código del socio: va en el correo del socio y del equipo, nunca en el del cliente', () => {
	const a = avisosChat({ chat, casa: { titulo: 'Casa de playa', codigoSocio: 'CH-07' }, mensajes: [], correos, sitio: 'https://ejemplo.gt', ahora: AHORA });
	assert.equal(a[0].datos[0][1], 'Casa de playa (CH-07)');
	assert.equal(a[1].datos[0][1], 'Casa de playa (CH-07)');
	assert.ok(!JSON.stringify(a.at(-1)).includes('CH-07'));
});
test('sin correos del equipo (AVISO_CORREO): el cliente y el socio igual reciben lo suyo', () => {
	const a = avisosChat({ chat, mensajes: [], correos: { ...correos, equipo: [] }, sitio: 'https://ejemplo.gt', ahora: AHORA });
	assert.deepEqual(a.map((x) => x.para), [['socio@example.com'], ['ana@example.com']]);
	// El envío (y su función) no se apagan por falta de AVISO_CORREO: solo piden el servicio de correo.
	for (const f of ['netlify/lib/aviso-chat-envio.mjs', 'netlify/functions/aviso-chat.mjs', 'netlify/functions/solicitudes-sin-respuesta.mjs']) {
		assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), /correoConfigurado\(/, f);
	}
});
test('solicitud vieja sin mensajes: no se vuelve a avisar', () => assert.equal(avisos([], { createdAt: hace(30) }).length, 0));
test('el cliente escribe: se avisa a la casa, no al cliente', () => assert.deepEqual(avisos([m('cliente', 1)]).map((x) => x.para), [['socio@example.com']]));
test('el socio responde: se avisa al cliente', () => assert.deepEqual(avisos([m('cliente', 5), m('socio', 1)]).map((x) => x.para), [['ana@example.com']]));
test('segundo mensaje seguido del mismo lado: sin aviso', () => {
	assert.equal(avisos([m('cliente', 3), m('cliente', 1)]).length, 0);
	assert.equal(avisos([m('socio', 3), m('equipo', 1)]).length, 0);
});
test('conversación en vivo: ida y vuelta sin un correo por mensaje', () => {
	// El cliente ya vio la respuesta anterior (vistoCliente después de ella) y vuelve a escribir: al socio le llega uno.
	const charla = [m('cliente', 9), m('socio', 8), m('cliente', 1)];
	assert.equal(avisos(charla, { vistoCliente: hace(7.5), vistoSocio: hace(8.5) }).length, 1);
	// El socio está en el chat (lo abrió hace 1 minuto): sin correo.
	assert.equal(avisos(charla, { vistoSocio: hace(1) }).length, 0);
	// El cliente no ha visto el mensaje anterior del socio: el segundo del socio no manda otro correo.
	assert.equal(avisos([m('cliente', 30), m('socio', 6), m('socio', 1)], { vistoCliente: hace(20) }).length, 0);
	// Pero si ya lo vio y no está en el chat, el nuevo sí avisa (una vez).
	assert.equal(avisos([m('cliente', 30), m('socio', 20), m('socio', 1)], { vistoCliente: hace(10) }).length, 1);
});
test('un mensaje que no salió por correo (estaba conversando) no frena los siguientes', () => {
	// El socio respondió, el cliente lo leyó al momento y se fue; el socio vuelve a escribir 2 min después (sin correo:
	// el cliente acababa de leer) y otra vez ahora: este sí avisa.
	const charla = [m('socio', 10), m('cliente', 9), m('socio', 8), m('socio', 0.1)];
	assert.equal(avisos(charla, { vistoCliente: hace(9.8) }).length, 1);
});
test('repaso de cada hora: el mensaje callado y sin leer avisa una vez; lo ya avisado o leído, no', () => {
	const repaso = (mensajes, extra) => avisosChat({ chat: { ...chat, ...extra }, mensajes, correos, sitio: 'https://ejemplo.gt', ahora: AHORA, repaso: true });
	// El cliente leyó, contestó y se fue; el socio respondió 90 s después (callado) y nada más: el repaso avisa al cliente.
	const charla = [m('socio', 30), m('cliente', 29), m('socio', 27.5)];
	assert.deepEqual(repaso(charla, { vistoCliente: hace(29) }).map((x) => x.para), [['ana@example.com']]);
	// Si ya lo leyó, o si salió por correo en su momento, el repaso no manda nada.
	assert.equal(repaso(charla, { vistoCliente: hace(20) }).length, 0);
	assert.equal(repaso([m('cliente', 60), m('socio', 30)], { vistoCliente: hace(50) }).length, 0);
	// Comprobantes y avisos de estado tienen su propio correo: el repaso no los toca.
	assert.equal(repaso([m('socio', 30, 'pago')], { vistoCliente: hace(31) }).length, 0);
});
test('después de un comprobante o un aviso de estado, el siguiente texto sí avisa', () => {
	assert.equal(avisos([m('cliente', 5, 'foto'), m('cliente', 1)], { vistoSocio: hace(30) }).length, 1);
});
test('que el equipo lea el chat no le quita el correo al socio', () => {
	assert.equal(avisos([m('socio', 30), m('cliente', 1)], { vistoEquipo: hace(1), vistoSocio: hace(25) }).length, 1);
});
test('datos de pago y de llegada: siempre al cliente', () => {
	assert.match(avisos([m('socio', 2), m('socio', 1, 'pago')])[0].asunto, /confirmada/);
	assert.match(avisos([m('socio', 2, 'pago'), m('socio', 1, 'llegada')])[0].asunto, /pago recibido/);
});
test('comprobante del cliente: al socio, para que marque el pago', () => assert.match(avisos([m('socio', 3, 'pago'), m('cliente', 1, 'foto')])[0].asunto, /comprobante/));
test('socio sin correo guardado: el aviso va al equipo', () => assert.deepEqual(avisosChat({ chat, mensajes: [m('cliente', 1)], correos: { ...correos, socio: '' }, sitio: 'https://ejemplo.gt', ahora: AHORA })[0].para, ['equipo@example.com']));
test('control de cada hora: mensaje del cliente con más de 2 h sin respuesta, una sola vez', () => {
	const opciones = { ahora: AHORA, plazo: 120 * 60_000, ventana: 60 * 60_000 };
	assert.equal(sinResponder([m('socio', 200), m('cliente', 150)], opciones), true);
	assert.equal(sinResponder([m('cliente', 60)], opciones), false);
	assert.equal(sinResponder([m('cliente', 300)], opciones), false);
	assert.equal(sinResponder([m('cliente', 150), m('socio', 10)], opciones), false);
});
test('reserva que no se dio o se canceló: siempre al cliente', () => {
	assert.match(avisos([m('socio', 3), m('socio', 1)], { estado: 'no' })[0].asunto, /no se concretó/);
	assert.match(avisos([m('socio', 3, 'pago'), m('equipo', 1)], { estado: 'cancelada' })[0].asunto, /cancelada/);
	assert.deepEqual(avisos([m('socio', 1)], { estado: 'cancelada' }).at(-1).para, ['ana@example.com']);
});
test('mensaje viejo: sin aviso', () => assert.equal(avisos([m('cliente', 30)]).length, 0));
test('ningún aviso lleva teléfono ni correo de la otra parte', () => {
	for (const a of [...avisos([]), ...avisos([m('cliente', 1)]), ...avisos([m('cliente', 5), m('socio', 1)])]) assert.doesNotMatch(JSON.stringify({ ...a, para: '' }), /@|\d{8}/);
});
test('cliente en inglés: su correo va en inglés', () => assert.match(avisos([m('cliente', 5), m('socio', 1)], { idioma: 'en' })[0].asunto, /you have a reply/));

test('el título del correo sale de la casa guardada, no del chat', () => {
	const casa = { titulo: 'Casa de playa en Monterrico', en: { titulo: 'Beach house in Monterrico' } };
	const nuevo = (extra) => avisosChat({ chat: { ...chat, propertyTitulo: 'Gana dinero en estafa.example', ...extra }, casa, mensajes: [], correos, sitio: 'https://ejemplo.gt', ahora: AHORA });
	const a = nuevo({});
	assert.ok(a.every((x) => /Casa de playa en Monterrico/.test(x.intro + JSON.stringify(x.datos)) && !/estafa/.test(JSON.stringify(x))));
	assert.match(nuevo({ idioma: 'en' }).at(-1).intro, /Beach house in Monterrico/);
	assert.ok(avisosChat({ chat, casa: null, mensajes: [], correos, sitio: 'https://ejemplo.gt', ahora: AHORA }).every((x) => !/Casa de playa ·/.test(x.intro)));
});
test('código o fechas con texto libre: no sale ningún correo', () => {
	assert.equal(avisos([], { codigo: 'Visita estafa.example' }).length, 0);
	assert.equal(avisos([], { llegada: 'gana $$$' }).length, 0);
});
test('el socio cancela: al cliente y también al equipo; el equipo cancela: solo al cliente', () => {
	const socio = avisos([m('cliente', 5), m('socio', 1)], { estado: 'cancelada' });
	assert.deepEqual(socio.map((x) => x.para), [['equipo@example.com'], ['ana@example.com']]);
	assert.match(socio[0].asunto, /socio canceló/);
	assert.deepEqual(avisos([m('cliente', 5), m('equipo', 1)], { estado: 'cancelada' }).map((x) => x.para), [['ana@example.com']]);
	assert.deepEqual(avisos([m('cliente', 5), m('socio', 1)], { estado: 'no' }).map((x) => x.para), [['ana@example.com']]);
});
test('«cómo pagar» dice el plazo exacto (hora de Guatemala); sin plazo automático, «antes de llegar»', () => {
	const vence = Date.parse('2026-11-15T05:00:00Z');
	const a = avisos([m('socio', 0, 'pago')], { estado: 'confirmada', vencePago: vence });
	assert.match(a[0].intro, /Paga antes del sáb, 14 nov, 11:00/);
	assert.match(avisos([m('socio', 0, 'pago')], { estado: 'confirmada', vencePago: 0 })[0].intro, /Paga antes de llegar/);
	assert.match(avisos([m('socio', 0, 'pago')], { estado: 'confirmada', vencePago: vence, idioma: 'en' })[0].intro, /Pay before Sat, Nov 14, 11:00 PM/);
});
test('«No me llegó» antes de la llegada: al cliente, con el plazo nuevo, y el equipo se entera', () => {
	const a = avisos([m('socio', 60, 'pago'), { de: 'socio', tipo: 'reabierto', texto: 'El anfitrión todavía no ve tu pago…', createdAt: hace(0) }], { estado: 'confirmada' });
	assert.deepEqual(a.map((x) => x.para), [['equipo@example.com'], ['ana@example.com']]);
	assert.match(a[0].asunto, /no le llegó el pago/);
	assert.match(a[1].intro, /todavía no ve tu pago/);
});
test('el socio cancela con el comprobante del cliente: el correo al equipo lo dice', () => {
	const a = avisos([m('socio', 60, 'pago'), { de: 'socio', texto: 'El anfitrión no recibió tu pago…', createdAt: hace(0) }], { estado: 'cancelada', comprobanteCliente: hace(30) });
	assert.match(a[0].asunto, /con comprobante del cliente/);
	const sin = avisos([m('socio', 60, 'pago'), { de: 'socio', texto: 'La reserva se canceló.', createdAt: hace(0) }], { estado: 'cancelada' });
	assert.doesNotMatch(sin[0].asunto, /comprobante/);
});
test('una solicitud repetida se cierra sin correo (aunque alguien llame /api/aviso-chat)', () => {
	assert.deepEqual(avisos([{ de: 'equipo', texto: 'Esta solicitud estaba repetida…', silencioso: true, createdAt: hace(0) }], { estado: 'no' }), []);
});
test('reintento de un aviso pendiente: se revisa como en el momento del mensaje (una hora después igual sale)', () => {
	const pago = { ...m('socio', 60, 'pago'), id: 'msjPago' };
	// Sin reintento, una hora después ya no sale (FRESCO).
	assert.deepEqual(avisos([pago], { estado: 'confirmada' }), []);
	const r = avisosChat({ chat: { ...chat, estado: 'confirmada' }, mensajes: [pago, { ...m('cliente', 30), id: 'despues' }], correos, sitio: 'https://ejemplo.gt', ahora: AHORA, mensaje: 'msjPago' });
	assert.deepEqual(r.map((x) => x.para), [['ana@example.com']]);
	assert.match(r[0].asunto, /cómo pagar/);
	// La solicitud nueva cuyo correo no salió ('nueva').
	const n = avisosChat({ chat: { ...chat, createdAt: hace(120) }, mensajes: [pago], correos, sitio: 'https://ejemplo.gt', ahora: AHORA, mensaje: 'nueva' });
	assert.equal(n.length, 3);
	assert.deepEqual(avisosChat({ chat, mensajes: [pago], correos, sitio: 'https://ejemplo.gt', ahora: AHORA, mensaje: 'noExiste' }), []);
});
test('el reintento de cada hora no manda otra vez un aviso que otra llamada está mandando ahora', () => {
	const t = AHORA;
	// En camino (apartado hace 1 min): el reintento no lo toca.
	assert.equal(puedeApartar({ avisoPendiente: 'm1', avisoEnviado: 'm1', avisoApartado: t - 60_000 }, 'm1', true, t), false);
	// Falló (marcar quita avisoEnviado): se reintenta.
	assert.equal(puedeApartar({ avisoPendiente: 'm1', avisoEnviado: '' }, 'm1', true, t), true);
	// Apartado hace más que EN_CURSO (la función se cortó): se reintenta.
	assert.equal(puedeApartar({ avisoPendiente: 'm1', avisoEnviado: 'm1', avisoApartado: t - EN_CURSO - 1 }, 'm1', true, t), true);
	// Ya no pendiente: no.
	assert.equal(puedeApartar({ avisoPendiente: '', avisoEnviado: '' }, 'm1', true, t), false);
	// La primera vez: solo si no salió ya.
	assert.equal(puedeApartar({ avisoEnviado: 'm1' }, 'm1', false, t), false);
	assert.equal(puedeApartar({ avisoEnviado: 'm0' }, 'm1', false, t), true);
});
console.log(`\n${ok} pruebas correctas${process.exitCode ? ' (con fallas)' : ''}.`);
