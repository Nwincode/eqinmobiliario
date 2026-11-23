// Pruebas de la revisión de comprobantes (netlify/lib/comprobantes.mjs): la comparación con la reserva (en el código, no
// la IA), que la foto salga solo del mensaje guardado y de la carpeta de su chat, una revisión por foto, el tope por chat
// y que sin IA no se haga nada. La IA y la foto se simulan.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer } from './simulado/base.mjs';

process.env.ANTHROPIC_API_KEY = 'prueba';
const { compararComprobante, revisarComprobante, urlDelComprobante } = await import('../netlify/lib/comprobantes.mjs');
const { estadoDeFoto } = await import('../admin/js/hilo.js');

let n = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); n++; console.log('✓', nombre); };
const T = 'TokenDePruebaLargoYAlAzar2345';
const URL_FOTO = `https://firebasestorage.googleapis.com/v0/b/eqinmobiliariobd.firebasestorage.app/o/chats%2F${T}%2Ffoto1.webp?alt=media&token=abc-123`;
const esperado = { total: 1122.4, moneda: 'USD', confirmada: '2026-11-18' };
const leido = (o = {}) => ({ esComprobante: true, contactoVisible: false, monto: 1122.4, moneda: 'USD', fecha: '2026-11-19', banco: 'Banco Industrial', referencia: '998877', ...o });

await t('cuadra: monto (con centavos de diferencia), moneda y fecha después de confirmar', () => {
	assert.deepEqual(compararComprobante(leido({ monto: 1122 }), esperado), { cuadra: true, texto: 'El comprobante cuadra', oculta: false, motivoOculta: '' });
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

await t('foto con un dato de contacto o que no es un comprobante: se oculta al socio (lo decide el código) y el chat lo marca para el cliente', async () => {
	assert.deepEqual(compararComprobante(leido({ contactoVisible: true }), esperado), { cuadra: true, texto: 'El comprobante cuadra', oculta: true, motivoOculta: 'Posible dato de contacto' });
	assert.equal(compararComprobante({ esComprobante: false, contactoVisible: false }, esperado).motivoOculta, 'No parece un comprobante');
	preparar();
	const r = await revisarComprobante(T, { leer: async () => leido({ contactoVisible: true }), bajar, ahora: S.reloj });
	assert.equal(r.oculta, true);
	assert.equal(leer('revisionesComprobante/l1').oculta, true);
	assert.equal(leer('revisionesComprobante/l1').leido.contactoVisible, true);
	assert.equal(leer(`chats/${T}`).comprobanteOculto, 'm1');
	assert.deepEqual(leer('revisionesComprobante/l1').fotos.fm1, { oculta: true, motivo: 'Posible dato de contacto' });
	// Uno que sí es comprobante y sin contacto: el chat queda sin marca.
	limpiar(); preparar();
	await revisarComprobante(T, { leer: async () => leido(), bajar, ahora: S.reloj });
	assert.equal(leer(`chats/${T}`).comprobanteOculto, '');
	assert.equal(leer('revisionesComprobante/l1').oculta, false);
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

await t('la cuarta foto (el tope ya se gastó con 3 cualesquiera): no se revisa y queda oculta para el socio; el equipo la ve «Sin revisar»', async () => {
	preparar();
	for (let i = 1; i <= 4; i++) {
		poner(`chats/${T}`, { ...leer(`chats/${T}`), comprobanteMensaje: `m${i}` });
		poner(`chats/${T}/mensajes/m${i}`, { de: 'cliente', tipo: 'foto', texto: URL_FOTO, createdAt: S.reloj });
		await revisarComprobante(T, { leer: async () => leido(), bajar, ahora: S.reloj });
	}
	const cuarta = { id: 'm4', tipo: 'foto', de: 'cliente', createdAt: S.reloj };
	const rv = leer('revisionesComprobante/l1'), chat = leer(`chats/${T}`);
	assert.equal(rv.mensaje, 'm3');
	// Al momento y pasados los 20 minutos: oculta (antes, a los 20 minutos se le mostraba al socio).
	for (const ahora of [S.reloj + 60_000, S.reloj + 21 * 60_000]) assert.deepEqual(estadoDeFoto(cuarta, { chat, rv, ia: true, ahora }), { ver: false, oculta: true, marca: 'Sin revisar' });
	// «Mostrar al socio» del equipo: se ve.
	assert.equal(estadoDeFoto(cuarta, { chat: { ...chat, fotosVisibles: ['m4'] }, rv, ia: true, ahora: S.reloj }).ver, true);
	// Sin IA configurada: como siempre.
	assert.equal(estadoDeFoto(cuarta, { chat, rv, ia: false, ahora: S.reloj }).ver, true);
});
await t('la foto que falló 3 veces queda oculta para el socio (con 1 o 2 fallos sigue «en revisión», aunque pasen los 20 minutos)', async () => {
	preparar();
	const foto = { id: 'm1', tipo: 'foto', de: 'cliente', createdAt: S.reloj };
	const mal = async () => { throw new Error('IA: refusal'); };
	await assert.rejects(revisarComprobante(T, { leer: mal, bajar, ahora: S.reloj }));
	assert.equal(estadoDeFoto(foto, { chat: leer(`chats/${T}`), rv: leer('revisionesComprobante/l1'), ia: true, ahora: S.reloj + 21 * 60_000 }).enRevision, true);
	for (let i = 1; i < 3; i++) await assert.rejects(revisarComprobante(T, { leer: mal, bajar, ahora: S.reloj + i * 15 * 60_000 }));
	assert.deepEqual(estadoDeFoto(foto, { chat: leer(`chats/${T}`), rv: leer('revisionesComprobante/l1'), ia: true, ahora: S.reloj + 46 * 60_000 }), { ver: false, oculta: true, marca: 'Sin revisar' });
});

await t('tope de la IA por chat: fotos nuevas que fallan (o se cortan) no la llaman sin fin', async () => {
	preparar();
	let veces = 0;
	const mal = async () => { veces++; throw new Error('IA: max_tokens'); };
	for (let i = 1; i <= 10; i++) {
		poner(`chats/${T}`, { ...leer(`chats/${T}`), comprobanteMensaje: `f${i}` });
		poner(`chats/${T}/mensajes/f${i}`, { de: 'cliente', tipo: 'foto', texto: URL_FOTO });
		for (let k = 0; k < 3; k++) await revisarComprobante(T, { leer: mal, bajar }).catch(() => {});
	}
	assert.equal(veces, 6);
	// Cortada (la función se cerró sin anotar el fallo): pasado el apartado, también cuenta.
	limpiar(); preparar(); veces = 0;
	const corta = () => { veces++; return new Promise(() => {}); };
	for (let k = 0; k < 10; k++) { revisarComprobante(T, { leer: corta, bajar, ahora: S.reloj + k * 11 * 60_000 }); await new Promise((r) => setTimeout(r, 5)); }
	assert.equal(veces, 6);
});

await t('sin moneda a la vista no cuadra (un monto igual en quetzales no es lo mismo que en dólares)', () => {
	assert.match(compararComprobante(leido({ moneda: '' }), esperado).texto, /no se lee la moneda/);
});

await t('un mensaje que no es la foto del cliente no aparta ni deja revisión', async () => {
	preparar();
	poner(`chats/${T}/mensajes/m1`, { de: 'socio', tipo: 'foto', texto: URL_FOTO });
	assert.equal(await revisarComprobante(T, { leer: async () => leido(), bajar }), null);
	assert.equal(leer('revisionesComprobante/l1'), null);
});

await t('sin la IA configurada, nada', async () => {
	preparar();
	delete process.env.ANTHROPIC_API_KEY;
	assert.equal(await revisarComprobante(T, { leer: async () => leido(), bajar }), null);
	assert.equal(leer('revisionesComprobante/l1'), null);
	process.env.ANTHROPIC_API_KEY = 'prueba';
});

console.log(`${n} pruebas de la revisión de comprobantes pasan.`);
