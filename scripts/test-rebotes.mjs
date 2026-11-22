// Pruebas de los rebotes de correo (/api/rebote-correo): la llave, qué direcciones se leen del aviso y la marca en los
// leads de esa dirección; lo que no es de ningún lead va a «Estado del sistema». Base simulada.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { limpiar, poner, leer } from './simulado/base.mjs';

process.env.REBOTE_CORREO_LLAVE = 'llave-de-prueba-larga-y-al-azar-123';
process.env.CORREO_REMITENTE = 'Equipo <avisos@eqinmobiliario.gt>';
const { leerRebote } = await import('../netlify/lib/rebotes.mjs');
const { default: rebote } = await import('../netlify/functions/rebote-correo.mjs');

let n = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); n++; console.log('✓', nombre); };
const pedido = (cuerpo, llave = process.env.REBOTE_CORREO_LLAVE) => new Request(`https://eqinmobiliario.gt/api/rebote-correo?llave=${encodeURIComponent(llave)}`, { method: 'POST', body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) });
const aviso = (correo) => ({ event_name: ['hardbounce'], event_message: [{ email_info: { from: { address: 'avisos@eqinmobiliario.gt' }, to: [{ email_address: { address: correo } }] }, event_data: [{ details: [{ reason: 'Mailbox does not exist' }] }] }] });

await t('del aviso salen el destinatario y el motivo, sin el remitente propio', () => {
	const r = leerRebote(aviso('Ana@Correo.com'), { propios: ['avisos@eqinmobiliario.gt'] });
	assert.deepEqual(r.correos, ['ana@correo.com']);
	assert.equal(r.motivo, 'Mailbox does not exist');
});

await t('sin la llave o con otra: 401 y nada se marca', async () => {
	poner('leads/l1', { email: 'ana@correo.com' });
	assert.equal((await rebote(pedido(aviso('ana@correo.com'), 'otra'))).status, 401);
	assert.equal((await rebote(pedido(aviso('ana@correo.com'), ''))).status, 401);
	assert.equal(leer('leads/l1').reboteCorreo, undefined);
});

await t('con la llave: marca cada lead de esa dirección («El correo no llegó» en Solicitudes)', async () => {
	poner('leads/l1', { email: 'ana@correo.com' });
	poner('leads/l2', { email: 'ana@correo.com' });
	poner('leads/l3', { email: 'otro@correo.com' });
	assert.equal((await rebote(pedido(aviso('ana@correo.com')))).status, 200);
	assert.equal(leer('leads/l1').reboteCorreo.motivo, 'Mailbox does not exist');
	assert.ok(leer('leads/l2').reboteCorreo);
	assert.equal(leer('leads/l3').reboteCorreo, undefined);
});

await t('una dirección sin lead (un dueño, el equipo) va a estado/rebotes; la respuesta es la misma', async () => {
	assert.equal((await rebote(pedido(aviso('socio@correo.com')))).status, 200);
	assert.match(leer('estado/rebotes').motivo, /socio@correo.com/);
});

await t('cuerpo que no es JSON o demasiado grande', async () => {
	assert.equal((await rebote(pedido('no es json'))).status, 400);
	assert.equal((await rebote(pedido('x'.repeat(70 * 1024)))).status, 413);
});

console.log(`${n} pruebas de rebotes de correo pasan.`);
