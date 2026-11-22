// Pruebas de la revisión de comprobantes (netlify/lib/comprobantes.mjs): la comparación con la reserva (en el código, no
// la IA), que la foto salga solo del mensaje guardado y de la carpeta de su chat, una revisión por foto, el tope por chat
// y que sin IA no se haga nada. La IA y la foto se simulan.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer } from './simulado/base.mjs';

process.env.ANTHROPIC_API_KEY = 'prueba';
const { compararComprobante, revisarComprobante, urlDelComprobante } = await import('../netlify/lib/comprobantes.mjs');

let n = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); n++; console.log('✓', nombre); };
const T = 'TokenDePruebaLargoYAlAzar2345';
const URL_FOTO = `https://firebasestorage.googleapis.com/v0/b/eqinmobiliariobd.firebasestorage.app/o/chats%2F${T}%2Ffoto1.webp?alt=media&token=abc-123`;
const esperado = { total: 1122.4, moneda: 'USD', confirmada: '2026-11-18' };
const leido = (o = {}) => ({ esComprobante: true, monto: 1122.4, moneda: 'USD', fecha: '2026-11-19', banco: 'Banco Industrial', referencia: '998877', ...o });

await t('cuadra: monto (con centavos de diferencia), moneda y fecha después de confirmar', () => {
	assert.deepEqual(compararComprobante(leido({ monto: 1122 }), esperado), { cuadra: true, texto: 'El comprobante cuadra' });
});
await t('no cuadra: dice qué y cuánto se esperaba', () => {
	assert.equal(compararComprobante(leido({ monto: 500 }), esperado).texto, 'No cuadra: monto US$ 500.00, esperado US$ 1,122.40');
	assert.match(compararComprobante(leido({ moneda: 'GTQ' }), esperado).texto, /moneda GTQ, esperada USD/);
	assert.match(compararComprobante(leido({ fecha: '2026-11-01' }), esperado).texto, /antes de confirmar/);
	assert.match(compararComprobante(leido({ fecha: null }), esperado).texto, /no se lee la fecha/);
	assert.match(compararComprobante({ esComprobante: false }, esperado).texto, /no parece un comprobante/);
});
await t('la foto solo puede ser de la carpeta de ese chat', () => {
	assert.ok(urlDelComprobante(T, URL_FOTO));
	assert.ok(!urlDelComprobante('OtroToken1234567890123', URL_FOTO));
	assert.ok(!urlDelComprobante(T, 'https://malo.com/x.webp'));
});

const preparar = () => {
	poner(`chats/${T}`, { leadId: 'l1', estado: 'confirmada', comprobanteMensaje: 'm1', propietarioId: 'o1', propertyId: 'c1', total: 1122.4, moneda: 'USD' });
	poner(`chats/${T}/mensajes/m1`, { de: 'cliente', tipo: 'foto', texto: URL_FOTO });
	poner('reservas/l1', { moneda: 'USD', createdAt: new Date('2026-11-18T15:00:00Z') });
};
const bajar = async () => ({ tipo: 'image/webp', datos: 'xx' });

await t('revisa una vez por foto y deja el aviso para el socio y el equipo', async () => {
	preparar();
	let veces = 0;
	const r = await revisarComprobante(T, { leer: async () => { veces++; return leido(); }, bajar, ahora: S.reloj });
	assert.equal(r.texto, 'El comprobante cuadra');
	const doc = leer('revisionesComprobante/l1');
	assert.equal(doc.propietarioId, 'o1');
	assert.equal(doc.leido.banco, 'Banco Industrial');
	assert.equal(await revisarComprobante(T, { leer: async () => { veces++; return leido(); }, bajar, ahora: S.reloj }), null);
	assert.equal(veces, 1);
});

await t('un mensaje que no es la foto del cliente o de otra carpeta: no se manda a la IA', async () => {
	preparar();
	poner(`chats/${T}/mensajes/m1`, { de: 'cliente', tipo: 'foto', texto: 'https://malo.com/x.webp' });
	let veces = 0;
	assert.equal(await revisarComprobante(T, { leer: async () => { veces++; return leido(); }, bajar }), null);
	assert.equal(veces, 0);
});

await t('si la IA falla o se corta, cuenta como fallida (no como revisada) y se reintenta; a las 3 fallidas de la misma foto, ya no', async () => {
	preparar();
	const mal = async () => { throw new Error('IA: tardó'); };
	for (let i = 0; i < 3; i++) await assert.rejects(revisarComprobante(T, { leer: mal, bajar }));
	assert.equal(leer('revisionesComprobante/l1').fallos, 3);
	assert.equal(leer('revisionesComprobante/l1').texto, '');
	assert.equal(await revisarComprobante(T, { leer: async () => leido(), bajar }), null);
});

await t('tope: 3 fotos por chat', async () => {
	preparar();
	for (let i = 1; i <= 4; i++) {
		poner(`chats/${T}`, { ...leer(`chats/${T}`), comprobanteMensaje: `m${i}` });
		poner(`chats/${T}/mensajes/m${i}`, { de: 'cliente', tipo: 'foto', texto: URL_FOTO });
		const r = await revisarComprobante(T, { leer: async () => leido(), bajar });
		assert.equal(Boolean(r), i <= 3, `foto ${i}`);
	}
});

await t('sin la IA configurada, nada', async () => {
	preparar();
	delete process.env.ANTHROPIC_API_KEY;
	assert.equal(await revisarComprobante(T, { leer: async () => leido(), bajar }), null);
	assert.equal(leer('revisionesComprobante/l1'), null);
	process.env.ANTHROPIC_API_KEY = 'prueba';
});

console.log(`${n} pruebas de la revisión de comprobantes pasan.`);
