// Pruebas del envío de correo (netlify/lib/correo.mjs) sin red: cada correo con su remitente, y que un rechazo de
// reservas@ no pierda el correo.
import assert from 'node:assert/strict';

process.env.ZEPTOMAIL_TOKEN = 'token-de-prueba';
process.env.CORREO_REMITENTE = 'Equipo Inmobiliario <noreply@ejemplo.gt>';
process.env.AVISO_CORREO = 'reservas@ejemplo.gt,otro@ejemplo.gt';
const { enviarCorreo } = await import('../netlify/lib/correo.mjs');

let ok = 0;
async function test(nombre, fn) {
	try { await fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${err.stack}`); process.exitCode = 1; }
}
const enviados = [];
let rechazar = 0;
globalThis.fetch = async (url, op) => {
	enviados.push(JSON.parse(op.body));
	if (rechazar-- > 0) return new Response(JSON.stringify({ error: { message: 'remitente no verificado' } }), { status: 400 });
	return new Response(JSON.stringify({ request_id: 'r1' }), { status: 201 });
};
const correo = (extra = {}) => enviarCorreo({ para: 'cliente@ejemplo.com', asunto: 'a', html: '<p>a</p>', texto: 'a', ...extra });

await test('contraseñas y avisos internos: desde noreply@, sin «Responder a»', async () => {
	enviados.length = 0;
	await correo();
	assert.equal(enviados[0].from.address, 'noreply@ejemplo.gt');
	assert.equal(enviados[0].reply_to, undefined);
});
await test('reservas: desde reservas@ (primer correo del equipo, mismo dominio) y se responde ahí', async () => {
	enviados.length = 0;
	await correo({ responder: true });
	assert.deepEqual(enviados[0].from, { name: 'Equipo Inmobiliario', address: 'reservas@ejemplo.gt' });
	assert.deepEqual(enviados[0].reply_to, [{ address: 'reservas@ejemplo.gt', name: 'Equipo Inmobiliario' }]);
});
await test('si Zoho no acepta reservas@, el correo sale igual desde noreply@', async () => {
	enviados.length = 0; rechazar = 1;
	assert.equal(await correo({ responder: true }), 'r1');
	assert.equal(enviados.length, 2);
	assert.equal(enviados[1].from.address, 'noreply@ejemplo.gt');
	assert.equal(enviados[1].reply_to, undefined);
});
await test('equipo con correo de otro dominio: sale de noreply@ con «Responder a» ese correo', async () => {
	process.env.AVISO_CORREO = 'alguien@hotmail.com';
	enviados.length = 0;
	await correo({ responder: true });
	assert.equal(enviados[0].from.address, 'noreply@ejemplo.gt');
	assert.deepEqual(enviados[0].reply_to, [{ address: 'alguien@hotmail.com', name: 'Equipo Inmobiliario' }]);
});
console.log(`${ok} pruebas del correo pasan.`);
