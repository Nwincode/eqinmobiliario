// Pruebas de netlify/functions/mi-casa-nueva.mjs con la base y la sesión simuladas (scripts/simulado/): el socio aparta
// la carpeta de fotos de su casa nueva y la publica; quién no puede y qué se rechaza.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer, hijos } from './simulado/base.mjs';

const { default: casaNueva } = await import('../netlify/functions/mi-casa-nueva.mjs');
const { default: miCasa } = await import('../netlify/functions/mi-casa.mjs');
let ok = 0;
const t = async (nombre, fn) => { limpiar(); base(); await fn(); ok++; console.log('✓', nombre); };
const pedido = (cuerpo) => ({ method: 'POST', headers: new Headers(), json: async () => cuerpo });
const llamar = async (cuerpo) => { const r = await casaNueva(pedido(cuerpo)); return { status: r.status, ...(await r.json()) }; };
const B = 'eqinmobiliariobd.firebasestorage.app';
const foto = (casa, n) => { const path = `properties/${casa}/${n}-f.webp`; return { url: `https://firebasestorage.googleapis.com/v0/b/${B}/o/${encodeURIComponent(path)}?alt=media&token=x`, path }; };
const fotos = (casa, n = 5) => Array.from({ length: n }, (_, i) => foto(casa, i + 1));
const SOCIO = { uid: 'u-socio', nombre: 'Rosa', propietarioId: 'p1' };
function base() {
	poner('propietarios/p1', { tipo: 'propietario', nombre: 'Rosa', agentId: 'a1', propiedades: [{ propertyId: 'vieja' }] });
	poner('propietarios/p2', { tipo: 'colaborador', nombre: 'Aliada', agentId: 'a1', propiedades: [] });
	poner('agents/a1', { nombre: 'Ana Asesora', activo: true });
	poner('agents/a2', { nombre: 'Beto Asesor', activo: true });
	poner('agents/a3', { nombre: 'Ya no está', activo: false });
	poner('properties/otra', { titulo: 'Otra casa', slug: 'casa-con-jardin-en-zona-15', codigo: 'IND-Z15-AA-001', operacion: 'venta' });
	S.socio = SOCIO;
}
const venta = (casa, extra = {}) => ({ operacion: 'venta', tipo: 'casa', moneda: 'USD', titulo: 'Casa con jardín en Zona 15', descripcion: 'Casa amplia con jardín, cuatro habitaciones y sala familiar.',
	precio: 350000, zona: 'Zona 15', ciudad: 'Guatemala', habitaciones: 4, banos: 3, amenidades: ['Jardín'], fotos: fotos(casa), ...extra });
const noche = (casa) => ({ operacion: 'vacacional', tipo: 'casa', moneda: 'USD', titulo: 'Casa de playa en Monterrico', descripcion: 'Casa frente al mar con piscina privada y rancho.',
	zona: 'Monterrico', ciudad: 'Taxisco', direccion: 'Lote 4, calle al mar', socio: { precioBase: 100 }, vacacional: { nochesMin: 1, huespedesMax: 6, checkIn: '15:00', checkOut: '11:00' }, fotos: fotos(casa) });
const apartar = async () => (await llamar({ accion: 'apartar' })).id;

await t('aparta su carpeta (y la misma si vuelve a abrir la ficha) y publica la casa en venta al momento, con su asesor', async () => {
	const id = await apartar();
	assert.equal(await apartar(), id);
	assert.equal(leer(`casasNuevas/${id}`).propietarioId, 'p1');
	const r = await llamar({ casa: id, datos: venta(id) });
	assert.equal(r.status, 200, r.error);
	const c = leer(`properties/${id}`);
	assert.equal(c.publicado, true);
	assert.equal(c.estado, 'disponible');
	assert.equal(c.propietarioId, 'p1');
	assert.equal(c.agentId, 'a1');
	// URL y código únicos (otra casa ya usa ese título y ese código).
	assert.equal(c.slug, 'casa-con-jardin-en-zona-15-2');
	assert.ok(c.codigo && c.codigo !== 'IND-Z15-AA-001', c.codigo);
	assert.equal(c.historialEstado.length, 1);
	assert.equal(leer(`casasNuevas/${id}`), null);
	assert.deepEqual(leer('propietarios/p1').propiedades, [{ propertyId: 'vieja' }, { propertyId: id }]);
	const aviso = hijos('cambiosDueno')[0];
	assert.equal(aviso.nueva, true);
	assert.equal(aviso.estado, 'nuevo');
	assert.equal(aviso.ingles, true);
	assert.equal(leer('meta/publish').pendiente, true);
	assert.equal(hijos(`properties/${id}/bitacora`).length, 1);
	// En la campana del administrador, con los demás cambios; no se «deshace» (se corrige en la ficha o se elimina).
	S.socio = null; S.staff = { uid: 'u-admin', admin: true, nombre: 'Admin' };
	const lista = await (await miCasa({ method: 'GET', headers: new Headers() })).json();
	assert.equal(lista.cambios[0].nueva, true);
	assert.equal((await miCasa(pedido({ accion: 'deshacer', id: aviso.id }))).status, 409);
	assert.equal((await miCasa(pedido({ accion: 'listo', id: aviso.id }))).status, 200);
});
await t('la casa por noche: sin asesor, su precio en privado con el margen, su dirección privada y el dueño pasa a «por noche»', async () => {
	S.socio = { uid: 'u-colab', nombre: 'Aliada', propietarioId: 'p2' };
	const id = await apartar();
	const r = await llamar({ casa: id, datos: { ...noche(id), agentId: 'a2' } });
	assert.equal(r.status, 200, r.error);
	const c = leer(`properties/${id}`);
	assert.equal(c.agentId, '');
	assert.equal(c.direccion, undefined);
	assert.ok(c.vacacional.base > 100);
	assert.equal(leer(`properties/${id}/privado/socio`).margen, 20);
	assert.equal(leer(`properties/${id}/privado/llegada`).direccion, 'Lote 4, calle al mar');
	assert.equal(leer('propietarios/p2').porNoche, true);
});
await t('el colaborador elige el asesor de su casa en venta, solo entre los activos', async () => {
	S.socio = { uid: 'u-colab', nombre: 'Aliada', propietarioId: 'p2' };
	const id = await apartar();
	assert.equal((await llamar({ casa: id, datos: venta(id, { agentId: 'a3' }) })).status, 422);
	assert.equal((await llamar({ casa: id, datos: venta(id, { agentId: 'a2' }) })).status, 200);
	assert.equal(leer(`properties/${id}`).agentId, 'a2');
});
await t('la carpeta de otro socio: 403 (no la crea); una casa que ya existe: 409', async () => {
	const id = await apartar();
	S.socio = { uid: 'u-colab', nombre: 'Aliada', propietarioId: 'p2' };
	const r = await llamar({ casa: id, datos: venta(id) });
	assert.equal(r.status, 403);
	assert.equal(leer(`properties/${id}`), null);
	assert.equal((await llamar({ casa: 'sin-apartar', datos: venta('sin-apartar') })).status, 403);
	S.socio = SOCIO;
	assert.equal((await llamar({ casa: 'otra', datos: venta('otra') })).status, 409);
});
await t('sin el permiso «Ingresar inmuebles» (apagado o por atraso): 403 al apartar y al publicar', async () => {
	const id = await apartar();
	poner('permisosSocios/p1', { precios: true, fechas: true, casa: true, inmuebles: false, motivo: 'atraso' });
	assert.equal((await llamar({ accion: 'apartar' })).status, 403);
	const r = await llamar({ casa: id, datos: venta(id) });
	assert.equal(r.status, 403);
	assert.match(r.error, /ingresar inmuebles/);
	assert.equal(leer(`properties/${id}`), null);
});
await t('apagado para todos, o solo para él, aunque todavía no tenga su documento de permisos (sin casas por noche): 403', async () => {
	S.socio = { uid: 'u-colab', nombre: 'Aliada', propietarioId: 'p2' };
	const id = await apartar();
	poner('settings/permisosSocios', { inmuebles: false });
	assert.equal((await llamar({ casa: id, datos: venta(id) })).status, 403);
	assert.equal((await llamar({ accion: 'apartar' })).status, 403);
	poner('settings/permisosSocios', { inmuebles: true });
	poner('propietarios/p2', { tipo: 'colaborador', nombre: 'Aliada', agentId: 'a1', propiedades: [], permisos: { inmuebles: false } });
	assert.equal((await llamar({ casa: id, datos: venta(id) })).status, 403);
	assert.equal(leer(`properties/${id}`), null);
});
await t('un texto con teléfono, menos de 5 fotos o una foto de otra carpeta: 422 con cada campo, y no se crea nada', async () => {
	const id = await apartar();
	const r = await llamar({ casa: id, datos: venta(id, { descripcion: 'Casa amplia con jardín. Llámame al 5512 3456 para verla.', fotos: fotos(id, 4) }) });
	assert.equal(r.status, 422);
	assert.deepEqual(r.errores.map((e) => e.campo).sort(), ['descripcion', 'fotos']);
	assert.equal((await llamar({ casa: id, datos: venta(id, { fotos: [...fotos(id, 4), foto('otra', 1)] }) })).status, 422);
	assert.equal(leer(`properties/${id}`), null);
	assert.equal(hijos('cambiosDueno').length, 0);
	assert.ok(leer(`casasNuevas/${id}`));
});
await t('sin sesión de socio: 403; límite de 10 casas al día', async () => {
	S.socio = null;
	assert.equal((await llamar({ accion: 'apartar' })).status, 403);
	S.socio = SOCIO;
	for (let i = 0; i < 10; i++) {
		const id = await apartar();
		assert.equal((await llamar({ casa: id, datos: venta(id, { titulo: `Casa con jardín número ${i + 1}` }) })).status, 200, `casa ${i + 1}`);
	}
	const id = await apartar();
	assert.equal((await llamar({ casa: id, datos: venta(id) })).status, 429);
});
console.log(`${ok} pruebas de la casa nueva (servidor) correctas`);
