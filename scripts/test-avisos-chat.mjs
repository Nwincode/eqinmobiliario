// Pruebas de los avisos por correo del chat de la reserva (netlify/lib/avisos-chat.mjs). Sin dependencias.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avisosChat, sinResponder } from '../netlify/lib/avisos-chat.mjs';

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
test('cliente en inglés: su correo en inglés (fechas y «guests»); el socio lo lee en español con el título en español', () => {
	const a = avisosChat({ chat: { ...chat, idioma: 'en' }, casa: { titulo: 'Casa de playa', en: { titulo: 'Beach house' } }, mensajes: [], correos, sitio: 'https://ejemplo.gt', ahora: AHORA });
	assert.match(a.at(-1).intro, /^The host of Beach house reviews it/);
	assert.deepEqual(a.at(-1).datos.slice(0, 3).map((f) => f[1]), ['Mon, Nov 16', 'Fri, Nov 20', '2 guests']);
	assert.match(a[0].intro, /^Respóndela pronto/);
	assert.deepEqual(a[0].datos.slice(0, 4).map((f) => f[1]), ['Casa de playa', 'lun, 16 nov', 'vie, 20 nov', '2 personas']);
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
console.log(`\n${ok} pruebas correctas${process.exitCode ? ' (con fallas)' : ''}.`);
