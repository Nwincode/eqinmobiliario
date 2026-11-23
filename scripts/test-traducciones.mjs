// Pruebas de la traducción del chat (netlify/lib/traducciones.mjs): a qué idioma va cada mensaje, qué se salta (2
// palabras o menos, ya en ese idioma, con tipo, lo ya traducido), el tope por chat, que la traducción no cuele un
// contacto y que sin IA no se haga nada. La IA se simula.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { limpiar, poner, leer } from './simulado/base.mjs';

process.env.ANTHROPIC_API_KEY = 'prueba';
const { traducirChat, TOPE } = await import('../netlify/lib/traducciones.mjs');

let n = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); n++; console.log('✓', nombre); };
const T = 'TokenDePruebaLargoYAlAzar2345';
let k = 0;
const msj = (de, texto, extra = {}) => { const id = `m${String(++k).padStart(3, '0')}`; poner(`chats/${T}/mensajes/${id}`, { de, texto, createdAt: new Date(Date.parse('2026-11-20T10:00:00Z') + k * 60000), ...extra }); return id; };
const ia = (respuestas = {}) => { const pedidos = []; return { pedidos, traducir: async (texto, idioma) => { pedidos.push([texto, idioma]); return respuestas[texto] ?? `[${idioma}] ${texto}`; } }; };

await t('cliente en inglés: lo suyo al español y lo del socio al inglés, guardado en el mensaje', async () => {
	poner(`chats/${T}`, { idioma: 'en', leadId: 'l1' });
	const a = msj('cliente', 'What time can we check in?');
	const b = msj('socio', 'Pueden entrar desde las 3 de la tarde.');
	const x = ia();
	assert.equal(await traducirChat(T, x), 2);
	assert.deepEqual(leer(`chats/${T}/mensajes/${a}`).traduccion, { es: '[es] What time can we check in?' });
	assert.deepEqual(leer(`chats/${T}/mensajes/${b}`).traduccion, { en: '[en] Pueden entrar desde las 3 de la tarde.' });
	assert.equal(leer(`traduccionesChat/${T}`).n, 2);
	// Una segunda vez no vuelve a pedir nada.
	assert.equal(await traducirChat(T, x), 0);
	assert.equal(x.pedidos.length, 2);
});
await t('se salta lo corto, lo que tiene tipo (pago, llegada, foto) y lo que ya estaba en ese idioma', async () => {
	poner(`chats/${T}`, { idioma: 'en' });
	const corto = msj('cliente', 'Ok thanks');
	msj('socio', 'Banco Industrial, cuenta 123', { tipo: 'pago' });
	const ya = msj('cliente', 'Hola, ¿cómo están todos?');
	const x = ia({ 'Hola, ¿cómo están todos?': '' });
	assert.equal(await traducirChat(T, x), 0);
	assert.equal(leer(`chats/${T}/mensajes/${corto}`).traduccion, undefined);
	assert.deepEqual(leer(`chats/${T}/mensajes/${ya}`).traduccion, { es: '' });
	assert.deepEqual(x.pedidos.map((p) => p[0]), ['Hola, ¿cómo están todos?']);
});
await t('cliente en español: nada se traduce (el panel ya lee español)', async () => {
	poner(`chats/${T}`, { idioma: 'es' });
	msj('cliente', 'Hola, quisiera saber si hay parqueo.');
	const x = ia();
	assert.equal(await traducirChat(T, x), 0);
	assert.equal(x.pedidos.length, 0);
});
await t('una traducción que parece un contacto no se guarda (el original ya pasó el filtro)', async () => {
	poner(`chats/${T}`, { idioma: 'en' });
	const a = msj('cliente', 'My number is five five five five, one two three four');
	const x = ia({ 'My number is five five five five, one two three four': 'Mi número es 5555 1234' });
	assert.equal(await traducirChat(T, x), 0);
	assert.deepEqual(leer(`chats/${T}/mensajes/${a}`).traduccion, { es: '' });
});
await t('tope por chat: pasado el tope, ya no se llama a la IA', async () => {
	poner(`chats/${T}`, { idioma: 'en' });
	poner(`traduccionesChat/${T}`, { n: TOPE - 1 });
	msj('cliente', 'First message to translate please');
	msj('cliente', 'Second message to translate please');
	const x = ia();
	assert.equal(await traducirChat(T, x), 1);
	assert.equal(leer(`traduccionesChat/${T}`).n, TOPE);
	assert.equal(await traducirChat(T, x), 0);
	assert.equal(x.pedidos.length, 1);
});
await t('si la IA falla, el mensaje queda sin traducción y no se reintenta sin fin', async () => {
	poner(`chats/${T}`, { idioma: 'en' });
	const a = msj('cliente', 'Can we bring our dog with us?');
	let veces = 0;
	assert.equal(await traducirChat(T, { traducir: async () => { veces++; throw new Error('IA caída'); } }), 0);
	assert.equal(await traducirChat(T, { traducir: async () => { veces++; return 'x'; } }), 0);
	assert.equal(veces, 1);
	assert.deepEqual(leer(`chats/${T}/mensajes/${a}`).traduccion, { es: '' });
});
await t('sin la IA configurada no se hace nada', async () => {
	poner(`chats/${T}`, { idioma: 'en' });
	msj('cliente', 'What time can we check in?');
	delete process.env.ANTHROPIC_API_KEY;
	const x = ia();
	assert.equal(await traducirChat(T, x), 0);
	assert.equal(x.pedidos.length, 0);
	process.env.ANTHROPIC_API_KEY = 'prueba';
});

console.log(`\n${n} pruebas de la traducción del chat pasan.`);
