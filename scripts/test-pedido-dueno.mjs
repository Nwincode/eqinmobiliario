// Pruebas de netlify/functions/pedido-dueno.mjs (la carpeta de fotos de un pedido del dueño, apartada por el servidor) y
// del barrido de cada hora (netlify/lib/pedidos-dueno.mjs), con la base, la sesión y Storage simulados (scripts/simulado/).
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer } from './simulado/base.mjs';

const { default: pedidoDueno } = await import('../netlify/functions/pedido-dueno.mjs');
const { barrerPedidosDueno, MAX_ABIERTOS, VIGENCIA } = await import('../netlify/lib/pedidos-dueno.mjs');
let ok = 0;
const t = async (nombre, fn) => { limpiar(); base(); await fn(); ok++; console.log('✓', nombre); };
const SOCIO = { uid: 'u-socio', nombre: 'Rosa', propietarioId: 'p1' };
function base() {
	poner('properties/venta1', { titulo: 'Casa en venta', operacion: 'venta', propietarioId: 'p1' });
	poner('properties/venta2', { titulo: 'Otra en venta', operacion: 'venta', propietarioId: 'p1' });
	poner('properties/noche1', { titulo: 'Por noche', operacion: 'vacacional', propietarioId: 'p1' });
	poner('properties/ajena', { titulo: 'Ajena', operacion: 'venta', propietarioId: 'p2' });
	S.socio = SOCIO;
	S.archivos = new Map();
}
const llamar = async (casa) => { const r = await pedidoDueno({ method: 'POST', headers: new Headers(), json: async () => ({ casa }) }); return { status: r.status, ...(await r.json()) }; };
const foto = (casa, id, n) => S.archivos.set(`pedidosDueno/${casa}/${id}/${n}.webp`, { tipo: 'image/webp', datos: Buffer.from('x') });
const fotosDe = (casa, id) => [...S.archivos.keys()].filter((k) => k.startsWith(`pedidosDueno/${casa}/${id}/`)).sort();

await t('aparta la carpeta de un pedido de SU casa en venta; la misma mientras no lo envía', async () => {
	const r = await llamar('venta1');
	assert.equal(r.status, 200);
	assert.deepEqual({ ...leer(`pedidosDueno/${r.id}`), id: undefined, cuando: undefined }, { id: undefined, propietarioId: 'p1', uid: 'u-socio', casa: 'venta1', cuando: undefined });
	assert.equal((await llamar('venta1')).id, r.id);
	// Enviado, el siguiente pedido lleva otra carpeta.
	poner(`comentariosPropietarios/${r.id}`, { tipo: 'cambios', propiedadId: 'venta1' });
	assert.notEqual((await llamar('venta1')).id, r.id);
});
await t('al volver a abrir: la misma carpeta con las fotos que ya tiene; si le quedan menos de 6 h, una nueva', async () => {
	const r = await llamar('venta1');
	assert.deepEqual(r.fotos, []);
	foto('venta1', r.id, 2); foto('venta1', r.id, 1);
	const otra = await llamar('venta1');
	assert.equal(otra.id, r.id);
	assert.deepEqual(otra.fotos, [`pedidosDueno/venta1/${r.id}/1.webp`, `pedidosDueno/venta1/${r.id}/2.webp`]);
	// Con 19 h encima (le quedan 5): no se vuelve a dar.
	poner(`pedidosDueno/${r.id}`, { ...leer(`pedidosDueno/${r.id}`), cuando: new Date(S.reloj - 19 * 3600_000) });
	const nueva = await llamar('venta1');
	assert.notEqual(nueva.id, r.id);
	assert.deepEqual(nueva.fotos, []);
});
await t('el panel: al cerrar la ventana sin enviar, sus fotos se borran; al abrir, vuelven las que ya tenía', async () => {
	const { readFileSync } = await import('node:fs');
	const f = readFileSync(new URL('../admin/js/pedido-dueno.js', import.meta.url), 'utf8');
	assert.match(f, /alCerrar: \(\) => \{ for \(const f of form\.getData\(\)\.fotos \|\| \[\]\) deleteImage\(f\.path\); \}/);
	assert.match(f, /onClose: \(\) => \{ if \(!enviado && alCerrar\) alCerrar\(\); \}/);
	assert.match(f, /fotos: storage \? \(await Promise\.all\(ya\.map/);
});
await t('no: casa ajena, casa por noche, casa que no existe, sin sesión de socio', async () => {
	assert.equal((await llamar('ajena')).status, 403);
	assert.equal((await llamar('noche1')).status, 403);
	assert.equal((await llamar('no-existe')).status, 404);
	assert.equal((await llamar('../x')).status, 400);
	S.socio = null;
	assert.equal((await llamar('venta1')).status, 403);
});
await t(`tope: a lo más ${MAX_ABIERTOS} pedidos abiertos (vigentes y sin enviar) a la vez`, async () => {
	for (let i = 0; i < MAX_ABIERTOS; i++) poner(`pedidosDueno/abierto${i}`, { propietarioId: 'p1', uid: 'u-socio', casa: `c${i}`, cuando: new Date(S.reloj - 3600_000) });
	assert.equal((await llamar('venta1')).status, 429);
	// Uno vencido ya no cuenta.
	poner('pedidosDueno/abierto0', { propietarioId: 'p1', uid: 'u-socio', casa: 'c0', cuando: new Date(S.reloj - VIGENCIA - 1) });
	assert.equal((await llamar('venta1')).status, 200);
});
await t('cada hora: lo vencido sin enviar se borra con sus fotos; lo enviado conserva solo las fotos que lleva', async () => {
	poner('pedidosDueno/sinEnviar', { propietarioId: 'p1', uid: 'u-socio', casa: 'venta1', cuando: new Date(S.reloj - 2 * VIGENCIA) });
	foto('venta1', 'sinEnviar', 1); foto('venta1', 'sinEnviar', 2);
	poner('pedidosDueno/enviado', { propietarioId: 'p1', uid: 'u-socio', casa: 'venta1', cuando: new Date(S.reloj - 2 * VIGENCIA) });
	foto('venta1', 'enviado', 1); foto('venta1', 'enviado', 2); foto('venta1', 'enviado', 3);
	poner('comentariosPropietarios/enviado', { tipo: 'cambios', fotos: ['pedidosDueno/venta1/enviado/1.webp', 'pedidosDueno/venta1/enviado/3.webp'] });
	poner('pedidosDueno/reciente', { propietarioId: 'p1', uid: 'u-socio', casa: 'venta2', cuando: new Date(S.reloj - 3600_000) });
	foto('venta2', 'reciente', 1);
	assert.equal(await barrerPedidosDueno(), 2);
	assert.deepEqual(fotosDe('venta1', 'sinEnviar'), []);
	assert.equal(leer('pedidosDueno/sinEnviar'), null);
	assert.deepEqual(fotosDe('venta1', 'enviado'), ['pedidosDueno/venta1/enviado/1.webp', 'pedidosDueno/venta1/enviado/3.webp']);
	assert.equal(leer('pedidosDueno/enviado'), null);
	assert.ok(leer('comentariosPropietarios/enviado'));
	assert.deepEqual(fotosDe('venta2', 'reciente'), ['pedidosDueno/venta2/reciente/1.webp']);
	assert.ok(leer('pedidosDueno/reciente'));
});
await t('el barrido corre cada hora con los demás (comisiones-vencidas)', async () => {
	const { readFileSync } = await import('node:fs');
	assert.match(readFileSync(new URL('../netlify/functions/comisiones-vencidas.mjs', import.meta.url), 'utf8'), /await barrerPedidosDueno\(\)/);
});
console.log(`${ok} pruebas de los pedidos del dueño (servidor) correctas`);
