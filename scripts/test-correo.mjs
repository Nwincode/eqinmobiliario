// Pruebas del envío de correo (netlify/lib/correo.mjs) sin red: el «Responder a» y que un rechazo de él no pierda el correo.
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
	const cuerpo = JSON.parse(op.body);
	enviados.push(cuerpo);
	if (rechazar-- > 0) return new Response(JSON.stringify({ error: { message: 'reply_to inválido' } }), { status: 400 });
	return new Response(JSON.stringify({ request_id: 'r1' }), { status: 201 });
};

await test('cada correo responde al primer correo del equipo, con el remitente noreply', async () => {
	enviados.length = 0;
	await enviarCorreo({ para: 'cliente@ejemplo.com', asunto: 'a', html: '<p>a</p>', texto: 'a' });
	assert.deepEqual(enviados[0].reply_to, [{ address: 'reservas@ejemplo.gt', name: 'Equipo Inmobiliario' }]);
	assert.equal(enviados[0].from.address, 'noreply@ejemplo.gt');
});
await test('si Zoho rechaza el «Responder a», el correo sale igual sin él', async () => {
	enviados.length = 0; rechazar = 1;
	assert.equal(await enviarCorreo({ para: 'cliente@ejemplo.com', asunto: 'a', html: '<p>a</p>', texto: 'a' }), 'r1');
	assert.equal(enviados.length, 2);
	assert.equal(enviados[1].reply_to, undefined);
});
console.log(`${ok} pruebas del correo pasan.`);
