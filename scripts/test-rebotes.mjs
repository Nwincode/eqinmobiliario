// Pruebas de los rebotes de correo (/api/rebote-correo): la llave, qué direcciones se leen del aviso y la marca en los
// leads de esa dirección; lo que no es de ningún lead va a «Estado del sistema». Base simulada.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { limpiar, poner, leer } from './simulado/base.mjs';

process.env.REBOTE_CORREO_LLAVE = 'llave-de-prueba-larga-y-al-azar-123';
process.env.CORREO_REMITENTE = 'Equipo <avisos@eqinmobiliario.gt>';
const { leerRebote, quitarRebote, DIAS_VIGENTE } = await import('../netlify/lib/rebotes.mjs');
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

await t('sin la palabra «bounce» no es un rebote; lo que va bajo «from» (reservas@ incluido) nunca se marca', () => {
	assert.deepEqual(leerRebote({ event_name: ['open'], to: [{ email_address: { address: 'ana@correo.com' } }] }).correos, []);
	const r = leerRebote({ event_name: ['hardbounce'], from: { address: 'reservas@eqinmobiliario.gt' }, reply_to: [{ address: 'equipo@eqinmobiliario.gt' }], to: [{ email_address: { address: 'ana@correo.com' } }] });
	assert.deepEqual(r.correos, ['ana@correo.com']);
});

const reciente = () => new Date(Date.now() - 86_400_000);
const viejo = () => new Date(Date.now() - (DIAS_VIGENTE + 5) * 86_400_000);
const diaIso = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

await t('sin la llave o con otra: 401 y nada se marca', async () => {
	poner('leads/l1', { email: 'ana@correo.com', createdAt: reciente() });
	assert.equal((await rebote(pedido(aviso('ana@correo.com'), 'otra'))).status, 401);
	assert.equal((await rebote(pedido(aviso('ana@correo.com'), ''))).status, 401);
	assert.equal(leer('leads/l1').reboteCorreo, undefined);
});

await t('con la llave: marca cada lead de esa dirección («El correo no llegó» en Solicitudes)', async () => {
	poner('leads/l1', { email: 'ana@correo.com', createdAt: reciente() });
	poner('leads/l2', { email: 'ana@correo.com', createdAt: reciente() });
	poner('leads/l3', { email: 'otro@correo.com', createdAt: reciente() });
	assert.equal((await rebote(pedido(aviso('ana@correo.com')))).status, 200);
	assert.equal(leer('leads/l1').reboteCorreo.motivo, 'Mailbox does not exist');
	assert.ok(leer('leads/l2').reboteCorreo);
	assert.equal(leer('leads/l3').reboteCorreo, undefined);
});

await t('una dirección sin lead (un dueño, el equipo) va a estado/rebotes; la respuesta es la misma', async () => {
	assert.equal((await rebote(pedido(aviso('socio@correo.com')))).status, 200);
	assert.match(leer('estado/rebotes').motivo, /socio@correo.com/);
});

await t('solo los leads vigentes: uno de hace meses no se marca; una reserva vieja que aún no termina, sí', async () => {
	poner('leads/viejo', { email: 'ana@correo.com', createdAt: viejo() });
	poner('leads/reserva', { email: 'ana@correo.com', createdAt: viejo(), reserva: { codigo: 'R-1', llegada: diaIso(3), salida: diaIso(5) } });
	poner('leads/pasada', { email: 'ana@correo.com', createdAt: viejo(), reserva: { codigo: 'R-0', llegada: diaIso(-9), salida: diaIso(-7) } });
	assert.equal((await rebote(pedido(aviso('ana@correo.com')))).status, 200);
	assert.equal(leer('leads/viejo').reboteCorreo, undefined);
	assert.equal(leer('leads/pasada').reboteCorreo, undefined);
	assert.ok(leer('leads/reserva').reboteCorreo);
	assert.equal(leer('estado/rebotes'), null);
});

await t('una dirección con solo leads de antes va a estado/rebotes (no se marca ninguno)', async () => {
	poner('leads/viejo', { email: 'ana@correo.com', createdAt: viejo() });
	assert.equal((await rebote(pedido(aviso('ana@correo.com')))).status, 200);
	assert.equal(leer('leads/viejo').reboteCorreo, undefined);
	assert.match(leer('estado/rebotes').motivo, /ana@correo.com/);
});

await t('el cliente vuelve a escribir en su chat después del rebote: la marca se quita; un mensaje de antes no la quita', async () => {
	const cuando = new Date(Date.now() - 3600_000);
	poner('leads/l1', { email: 'ana@correo.com', createdAt: reciente(), reboteCorreo: { cuando, motivo: 'x' } });
	assert.equal(await quitarRebote('l1', new Date(cuando.getTime() - 60_000)), false);
	assert.ok(leer('leads/l1').reboteCorreo);
	assert.equal(await quitarRebote('l1', new Date()), true);
	assert.equal(leer('leads/l1').reboteCorreo, undefined);
	assert.equal(await quitarRebote('l1', new Date()), false);
	assert.equal(await quitarRebote('no-existe', new Date()), false);
});

await t('cuerpo que no es JSON o demasiado grande', async () => {
	assert.equal((await rebote(pedido('no es json'))).status, 400);
	assert.equal((await rebote(pedido('x'.repeat(70 * 1024)))).status, 413);
});

console.log(`${n} pruebas de rebotes de correo pasan.`);
