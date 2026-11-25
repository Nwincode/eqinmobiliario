// El aviso al equipo de un contacto partido en varios mensajes (netlify/lib/aviso-chat-envio.mjs avisarContactoPartido, que
// llama /api/aviso-chat), con la base y el correo simulados (scripts/simulado/): sale un correo al equipo, una sola vez por
// mensaje que lo completa, con tope por chat, y nada se bloquea ni se borra. La decisión (qué se junta) se prueba en
// scripts/test-avisos-chat.mjs.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer } from './simulado/base.mjs';

const { avisarContactoPartido, TOPE_CONTACTO } = await import('../netlify/lib/aviso-chat-envio.mjs');
const { default: avisoChat } = await import('../netlify/functions/aviso-chat.mjs');
let ok = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); ok++; console.log('✓', nombre); };
const T = 'TokenDePruebaLargoYAlAzar2345';
const msj = (id, de, texto, min) => poner(`chats/${T}/mensajes/${id}`, { de, texto, createdAt: new Date(S.reloj - min * 60_000) });
const preparar = () => { poner(`chats/${T}`, { leadId: 'l1', codigo: 'EQ-ABC123', estado: 'confirmada' }); poner('leads/l1', { propertyTitulo: 'Casa del lago', reserva: { codigo: 'EQ-ABC123' } }); };
const pedir = () => avisoChat({ method: 'POST', headers: new Headers(), json: async () => ({ chat: T }) }, {});

await t('«5555» y luego «1234»: un correo al equipo con el enlace a la conversación; los mensajes siguen ahí', async () => {
	preparar();
	msj('a', 'cliente', 'mi número es 5555', 2); msj('b', 'cliente', '1234', 1);
	assert.equal(await avisarContactoPartido(T), true);
	assert.equal(S.salida.length, 1);
	assert.equal(S.salida[0].para, 'equipo@ejemplo.test');
	assert.match(S.salida[0].asunto, /Posible contacto en el chat: EQ-ABC123/);
	assert.match(S.salida[0].texto, /El cliente escribió en 2 mensajes seguidos algo que, junto, parece un teléfono/);
	assert.ok(S.salida[0].texto.includes('/admin/#/mensajes/EQ-ABC123'));
	assert.ok(leer(`chats/${T}/mensajes/a`) && leer(`chats/${T}/mensajes/b`));
	assert.equal(leer('alertas/contacto-' + T).ultimo, 'b');
});
await t('dos llamadas con el mismo mensaje: un solo correo', async () => {
	preparar();
	msj('a', 'socio', 'cinco cinco cinco cinco', 2); msj('b', 'socio', 'zero five five five', 1);
	await Promise.all([avisarContactoPartido(T), avisarContactoPartido(T)]);
	await avisarContactoPartido(T);
	assert.equal(S.salida.length, 1);
	assert.match(S.salida[0].texto, /El socio escribió/);
});
await t('mensajes normales de una reserva: nada', async () => {
	preparar();
	msj('a', 'cliente', 'llegamos a las 3', 3); msj('b', 'cliente', 'somos 4 adultos', 2); msj('c', 'cliente', 'mil gracias', 1);
	assert.equal(await avisarContactoPartido(T), false);
	assert.equal(S.salida.length, 0);
	assert.equal(leer('alertas/contacto-' + T), null);
});
await t(`tope: a lo más ${TOPE_CONTACTO} avisos por chat`, async () => {
	preparar();
	for (let i = 0; i < TOPE_CONTACTO + 3; i++) {
		S.reloj += 60 * 60_000;
		msj(`x${i}`, 'cliente', '5555', 2); msj(`y${i}`, 'cliente', '1234', 1);
		await avisarContactoPartido(T);
	}
	assert.equal(S.salida.length, TOPE_CONTACTO);
});

await t('por su entrada real (POST /api/aviso-chat): «5555» y «1234» mandan el aviso al equipo; repetido, ninguno más', async () => {
	preparar();
	msj('a', 'cliente', 'mi número es 5555', 2); msj('b', 'cliente', '1234', 1);
	await pedir(); await pedir();
	const aviso = S.salida.filter((c) => /Posible contacto/.test(c.asunto));
	assert.equal(aviso.length, 1);
	assert.equal(aviso[0].para, 'equipo@ejemplo.test');
	assert.match(aviso[0].texto, /Casa: Casa del lago/);
});

console.log(`${ok} pruebas del aviso de contacto partido pasan.`);
