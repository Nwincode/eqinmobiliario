// /api/foto (netlify/functions/foto.mjs): la foto del comprobante del cliente la sirve el servidor según quién la pide y lo
// que vio la revisión (estadoDeFoto de admin/js/hilo.js). El administrador, todas; el socio de la casa y quien llega solo
// con el enlace del chat (el socio conoce esa llave), las visibles; nadie más. Base, sesión y Storage simulados.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner } from './simulado/base.mjs';

process.env.ANTHROPIC_API_KEY = 'prueba';
const { default: foto } = await import('../netlify/functions/foto.mjs');
let n = 0;
const t = async (nombre, fn) => { limpiar(); S.usuario = null; await fn(); n++; console.log('✓', nombre); };
const T = 'TokenDeFotoLargoYAlAzar12345';
const pedir = async (cuerpo = { token: T, mensaje: 'm1' }) => {
	const r = await foto(new Request('http://x/api/foto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }), { ip: `ip-${n}` });
	return { estado: r.status, tipo: r.headers.get('content-type'), cache: r.headers.get('cache-control'), cuerpo: r.headers.get('content-type')?.startsWith('image/') ? Buffer.from(await r.arrayBuffer()).toString() : await r.json() };
};
const ADMIN = { uid: 'a', rol: 'admin' }, SOCIO = { uid: 's', rol: 'socio', propietarioId: 'o1' }, OTRO = { uid: 's2', rol: 'socio', propietarioId: 'o2' }, ASESOR = { uid: 'z', rol: 'asesor', agentId: 'a7' };
// Una foto del cliente con su veredicto (`oculta`: la revisión la ocultó al socio; null: sin revisar todavía).
function preparar({ oculta = false, revisada = true, chat = {}, texto = 'fotosChat/l1/1' } = {}) {
	poner(`chats/${T}`, { leadId: 'l1', estado: 'confirmada', comprobanteMensaje: 'm1', propietarioId: 'o1', propertyId: 'c1', ...chat });
	poner(`chats/${T}/mensajes/m1`, { de: 'cliente', tipo: 'foto', texto, createdAt: new Date(S.reloj - 60_000) });
	poner('properties/c1', { propietarioId: 'o1', operacion: 'vacacional' });
	if (revisada) poner('revisionesComprobante/l1', { mensaje: 'm1', texto: 'x', oculta, fotos: { fm1: { oculta, motivo: oculta ? 'Posible dato de contacto' : '' } } });
	S.archivos = new Map([['fotosChat/l1/1', { tipo: 'image/webp', datos: 'FOTO', llave: '' }], [`chats/${T}/f1.webp`, { tipo: 'image/webp', datos: 'FOTO', llave: '' }]]);
}

await t('una foto que la revisión dejó ver: la ven el administrador, el socio de la casa y el enlace del chat, sin caché', async () => {
	preparar();
	for (const u of [ADMIN, SOCIO, null]) {
		S.usuario = u;
		const r = await pedir();
		assert.deepEqual([r.estado, r.tipo, r.cuerpo], [200, 'image/webp', 'FOTO'], u?.rol || 'sin sesión');
		assert.match(r.cache, /no-store/);
	}
});

await t('una foto oculta (un contacto, no es un comprobante): solo el administrador; al socio y al enlace, 403 sin la foto', async () => {
	preparar({ oculta: true });
	S.usuario = ADMIN;
	assert.equal((await pedir()).estado, 200);
	for (const u of [SOCIO, null]) {
		S.usuario = u;
		assert.deepEqual(await pedir().then((r) => [r.estado, r.cuerpo]), [403, { ver: false, enRevision: false }], u?.rol || 'sin sesión');
	}
});

await t('«Mostrar al socio» del equipo: se le sirve al socio y al enlace', async () => {
	preparar({ oculta: true, chat: { fotosVisibles: ['m1'] } });
	for (const u of [SOCIO, null]) { S.usuario = u; assert.equal((await pedir()).estado, 200); }
});

await t('en revisión (recién subida, sin veredicto): al socio no, con «en revisión»; al administrador sí', async () => {
	preparar({ revisada: false });
	S.usuario = SOCIO;
	assert.deepEqual(await pedir().then((r) => [r.estado, r.cuerpo]), [403, { ver: false, enRevision: true }]);
	S.usuario = ADMIN;
	assert.equal((await pedir()).estado, 200);
});

await t('con la IA apagada después, el veredicto que ya había manda (la oculta sigue oculta)', async () => {
	preparar({ oculta: true });
	delete process.env.ANTHROPIC_API_KEY;
	try { S.usuario = null; assert.equal((await pedir()).estado, 403); } finally { process.env.ANTHROPIC_API_KEY = 'prueba'; }
});

await t('otro socio, un asesor: 403 aunque la foto se vea; una casa que ya no es del socio, 403', async () => {
	preparar();
	for (const u of [OTRO, ASESOR]) { S.usuario = u; assert.equal((await pedir()).estado, 403, u.rol); }
	poner('properties/c1', { propietarioId: 'o2', operacion: 'vacacional' });
	S.usuario = SOCIO;
	assert.equal((await pedir()).estado, 403);
});

await t('la ruta sale del mensaje guardado: un mensaje que no es foto del cliente, de otra carpeta o que no existe, 404; un pedido mal formado, 400', async () => {
	preparar({ texto: 'fotosChat/otra-solicitud/1' });
	S.usuario = ADMIN;
	assert.equal((await pedir()).estado, 404);
	preparar({ texto: `chats/OtroTokenLargoYAlAzar1234567/f1.webp` });
	S.usuario = ADMIN;
	assert.equal((await pedir()).estado, 404);
	preparar();
	poner(`chats/${T}/mensajes/m2`, { de: 'socio', tipo: 'foto', texto: 'fotosChat/l1/1' });
	assert.equal((await pedir({ token: T, mensaje: 'm2' })).estado, 404);
	assert.equal((await pedir({ token: T, mensaje: 'no-existe' })).estado, 404);
	assert.equal((await pedir({ token: 'TokenQueNoExisteLargo123456', mensaje: 'm1' })).estado, 404);
	assert.equal((await pedir({ token: '../users', mensaje: 'm1' })).estado, 400);
	assert.equal((await pedir({ token: T, mensaje: '../x' })).estado, 400);
});

await t('una foto de antes (la dirección con el token de descarga en el mensaje) se sirve igual por su ruta', async () => {
	preparar({ texto: `https://firebasestorage.googleapis.com/v0/b/eqinmobiliariobd.firebasestorage.app/o/chats%2F${T}%2Ff1.webp?alt=media&token=abc-1` });
	S.usuario = SOCIO;
	assert.equal((await pedir()).cuerpo, 'FOTO');
});

await t('una foto de la carpeta de antes (chats/{token}/…) se sirve por su ruta', async () => {
	preparar({ texto: `chats/${T}/f1.webp` });
	S.usuario = ADMIN;
	assert.equal((await pedir()).cuerpo, 'FOTO');
});

await t('el comprobante del pago a EQ ({ reserva }): el administrador y el socio de la reserva; otro socio, un asesor o sin sesión, no', async () => {
	poner('reservas/r1', { propietarioId: 'o1', comision: { monto: 10, comprobante: 'comprobantes/r1/123-pago.webp' } });
	S.archivos = new Map([['comprobantes/r1/123-pago.webp', { tipo: 'image/webp', datos: 'RECIBO', llave: '' }]]);
	for (const [u, estado] of [[ADMIN, 200], [SOCIO, 200], [OTRO, 403], [ASESOR, 403], [null, 403]]) {
		S.usuario = u;
		assert.equal((await pedir({ reserva: 'r1' })).estado, estado, u?.rol || 'sin sesión');
	}
	// La de antes (la dirección con el token) se lee por su ruta; una ruta de otra reserva, no.
	poner('reservas/r1', { propietarioId: 'o1', comision: { comprobante: 'https://firebasestorage.googleapis.com/v0/b/eqinmobiliariobd.firebasestorage.app/o/comprobantes%2Fr1%2F123-pago.webp?alt=media&token=ab-1' } });
	S.usuario = SOCIO;
	assert.equal((await pedir({ reserva: 'r1' })).cuerpo, 'RECIBO');
	poner('reservas/r1', { propietarioId: 'o1', comision: { comprobante: 'comprobantes/r2/123-pago.webp' } });
	assert.equal((await pedir({ reserva: 'r1' })).estado, 404);
});

console.log(`${n} pruebas de /api/foto pasan.`);
