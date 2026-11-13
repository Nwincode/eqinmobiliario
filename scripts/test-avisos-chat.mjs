// Pruebas de los avisos por correo del chat de la reserva (netlify/lib/avisos-chat.mjs). Sin dependencias.
import assert from 'node:assert/strict';
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
	assert.deepEqual(a.map((x) => x.para), [['socio@example.com'], ['ana@example.com']]);
	assert.equal(a[0].url, 'https://ejemplo.gt/admin/#/solicitudes/EQ-PRUEBA');
	assert.equal(a[1].url, 'https://ejemplo.gt/reserva/#TokenDePruebaLargoYAlAzar2345');
});
test('solicitud vieja sin mensajes: no se vuelve a avisar', () => assert.equal(avisos([], { createdAt: hace(30) }).length, 0));
test('el cliente escribe: se avisa a la casa, no al cliente', () => assert.deepEqual(avisos([m('cliente', 1)]).map((x) => x.para), [['socio@example.com']]));
test('el socio responde: se avisa al cliente', () => assert.deepEqual(avisos([m('cliente', 5), m('socio', 1)]).map((x) => x.para), [['ana@example.com']]));
test('segundo mensaje seguido del mismo lado: sin aviso', () => {
	assert.equal(avisos([m('cliente', 3), m('cliente', 1)]).length, 0);
	assert.equal(avisos([m('socio', 3), m('equipo', 1)]).length, 0);
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
	assert.match(avisos([m('socio', 3), m('socio', 1)], { estado: 'no' })[0].asunto, /no disponible/);
	assert.match(avisos([m('socio', 3, 'pago'), m('equipo', 1)], { estado: 'cancelada' })[0].asunto, /cancelada/);
	assert.deepEqual(avisos([m('socio', 1)], { estado: 'cancelada' })[0].para, ['ana@example.com']);
});
test('mensaje viejo: sin aviso', () => assert.equal(avisos([m('cliente', 30)]).length, 0));
test('ningún aviso lleva teléfono ni correo de la otra parte', () => {
	for (const a of [...avisos([]), ...avisos([m('cliente', 1)]), ...avisos([m('cliente', 5), m('socio', 1)])]) assert.doesNotMatch(JSON.stringify({ ...a, para: '' }), /@|\d{8}/);
});
test('cliente en inglés: su correo va en inglés', () => assert.match(avisos([m('cliente', 5), m('socio', 1)], { idioma: 'en' })[0].asunto, /you have a reply/));

console.log(`\n${ok} pruebas correctas${process.exitCode ? ' (con fallas)' : ''}.`);
