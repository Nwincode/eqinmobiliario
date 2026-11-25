// Pruebas de admin/js/casa-nueva.js: la casa nueva que sube el socio (lo que se revisa y lo que pone el sistema).
import assert from 'node:assert/strict';
import { revisarCasaNueva, armarCasaNueva, datosParaServidor, MIN_FOTOS } from '../admin/js/casa-nueva.js';
import '../js/calc-vacacional.js';

const V = globalThis.EQVacacional;
let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };
const B = 'eqinmobiliariobd.firebasestorage.app';
const foto = (casa, n) => { const path = `properties/${casa}/${n}-f.webp`; return { url: `https://firebasestorage.googleapis.com/v0/b/${B}/o/${encodeURIComponent(path)}?alt=media&token=x`, path, marca: true }; };
const fotos = (casa, n = 5) => Array.from({ length: n }, (_, i) => foto(casa, i + 1));
const venta = (extra = {}) => ({ operacion: 'venta', tipo: 'casa', moneda: 'USD', titulo: 'Casa con jardín en Zona 15', descripcion: 'Casa amplia con jardín, cuatro habitaciones y sala familiar.',
	precio: 350000, zona: 'Zona 15', ciudad: 'Guatemala', habitaciones: 4, banos: 3.5, parqueos: 2, amenidades: ['Jardín'], fotos: fotos('c1'), ...extra });
const noche = (extra = {}) => ({ operacion: 'vacacional', tipo: 'casa', moneda: 'USD', titulo: 'Casa de playa en Monterrico', descripcion: 'Casa frente al mar con piscina privada y rancho.',
	zona: 'Monterrico', ciudad: 'Taxisco', direccion: 'Lote 4, calle al mar', socio: { precioBase: 100, precioFinde: 120, tarifas: [] },
	vacacional: { nochesMin: 2, huespedesMax: 8, checkIn: '15:00', checkOut: '11:00', camas: 4, mascotas: 'no', limpieza: 25 }, fotos: fotos('c1'), ...extra });
const revisar = (datos, op = {}) => revisarCasaNueva({ datos, casaId: 'c1', bucket: B, dueno: { tipo: 'propietario', agentId: 'a1' }, agentes: ['a1', 'a2'], ...op });
const campos = (r) => r.errores.map((e) => e.campo);

t('una casa en venta completa pasa; el asesor es el que atiende al dueño', () => {
	const r = revisar(venta());
	assert.deepEqual(r.errores, []);
	assert.equal(r.casa.agentId, 'a1');
	assert.equal(r.casa.precio, 350000);
	assert.equal(r.casa.fotos[0].alt, 'Casa con jardín en Zona 15 – foto 1');
	assert.equal(r.casa.vacacional, undefined);
});
t('el colaborador elige el asesor (de los activos); el propietario no', () => {
	assert.equal(revisar(venta({ agentId: 'a2' }), { dueno: { tipo: 'colaborador', agentId: 'a1' } }).casa.agentId, 'a2');
	assert.deepEqual(campos(revisar(venta({ agentId: 'otro' }), { dueno: { tipo: 'colaborador' } })), ['agentId']);
	assert.equal(revisar(venta({ agentId: 'a2' })).casa.agentId, 'a1');
});
t('una casa por noche no lleva asesor, ni precio de venta; su dirección y mapa van a lo privado', () => {
	const r = revisar(noche({ agentId: 'a2', precio: 5 }), { dueno: { tipo: 'colaborador', agentId: 'a1' } });
	assert.deepEqual(r.errores, []);
	assert.equal(r.casa.agentId, '');
	assert.equal(r.casa.precio, undefined);
	assert.equal(r.casa.direccion, undefined);
	assert.deepEqual(r.llegada, { direccion: 'Lote 4, calle al mar', mapa: '' });
	assert.equal(r.socio.precioBase, 100);
});
t(`mínimo ${MIN_FOTOS} fotos, sin repetir y de la carpeta de esta casa`, () => {
	assert.match(revisar(venta({ fotos: fotos('c1', 4) })).errores[0].msg, /al menos 5 \(llevas 4\)/);
	assert.deepEqual(campos(revisar(venta({ fotos: [...fotos('c1', 4), foto('otra', 9)] }))), ['fotos']);
	assert.deepEqual(campos(revisar(venta({ fotos: [...fotos('c1', 4), foto('c1', 1)] }))), ['fotos']);
	// La descripción de cada foto: la suya si la escribió (sin contacto); si no, la del título.
	const conAlt = revisar(venta({ fotos: [{ ...foto('c1', 1), alt: 'Fachada con jardín' }, ...fotos('c1', 5).slice(1)] }));
	assert.equal(conAlt.casa.fotos[0].alt, 'Fachada con jardín');
	assert.equal(conAlt.casa.fotos[1].alt, 'Casa con jardín en Zona 15 – foto 2');
	assert.deepEqual(campos(revisar(venta({ fotos: [{ ...foto('c1', 1), alt: 'Llama al 5512 3456' }, ...fotos('c1', 5).slice(1)] }))), ['fotos']);
	// En la ficha el origen no se revisa (lo revisa el servidor).
	assert.deepEqual(revisar(venta({ fotos: [...fotos('c1', 4), { ...foto('c1', 9), url: 'http://127.0.0.1:9199/x' }] }), { revisarOrigen: false }).errores, []);
});
t('textos sin teléfonos, correos, enlaces ni redes (el filtro del chat), todos los errores juntos', () => {
	const r = revisar(venta({ descripcion: 'Casa amplia con jardín. Llámame al 5512 3456 para verla.', titulo: 'Casa en www.micasa.gt', amenidades: ['Jardín', 'yo@gmail.com'] }));
	assert.deepEqual(campos(r).sort(), ['amenidades', 'descripcion', 'titulo']);
	assert.match(r.errores.find((e) => e.campo === 'descripcion').msg, /parece un teléfono/);
	assert.deepEqual(campos(revisar(noche({ vacacional: { ...noche().vacacional, reglas: 'Escríbeme por insta @casaplaya' } }))), ['vacacional.reglas']);
});
t('datos reales de venta y renta no se toman por contacto (direcciones, montos, medidas)', () => {
	const r = revisar(venta({ direccion: '13 calle 8-44 zona 10, nivel 5', zona: 'Zona 10', descripcion: 'Apartamento de 480 m², mantenimiento Q1,500 al mes. Precio Q 1,250,000. Km 14.5 carretera a El Salvador, 2 parqueos.',
		amenidades: ['Área social', 'Gimnasio 24/7'], m2Construccion: 480, mantenimiento: 1500 }));
	assert.deepEqual(r.errores, []);
	assert.deepEqual(revisar(venta({ operacion: 'renta', precio: 1500, titulo: 'Apartamento en renta, edificio Torre 5, nivel 12' })).errores, []);
});
t('lo obligatorio de cada operación: precio en venta; precio por noche y dirección por noche', () => {
	assert.deepEqual(campos(revisar(venta({ precio: '' }))), ['precio']);
	assert.deepEqual(campos(revisar(noche({ direccion: '', socio: { precioBase: 0 } }))).sort(), ['direccion', 'socio.precioBase']);
	assert.deepEqual(campos(revisar(venta({ zona: '', titulo: '' }))).sort(), ['titulo', 'zona']);
	assert.deepEqual(campos(revisar(noche({ tipo: 'terreno' }))), ['tipo']);
});
t('lo del equipo no entra aunque lo manden (dueño, publicado, margen, código, acuerdo, inglés)', () => {
	const d = datosParaServidor({ ...venta(), propietarioId: 'otro', publicado: false, codigo: 'X', socio: { margen: 0, precioBase: 1 }, acuerdo: { comisionPct: 0 }, en: { titulo: 'x' }, destacada: true, vip: true });
	for (const k of ['propietarioId', 'publicado', 'codigo', 'acuerdo', 'en', 'destacada', 'vip']) assert.equal(k in d, false, k);
	assert.deepEqual(d.socio, { precioBase: 1 });
	const r = revisar(d);
	assert.equal('margen' in r.socio, false);
});
t('armar: publicada y disponible al momento; por noche, sus precios públicos con el margen de siempre', () => {
	const v = armarCasaNueva(revisar(venta()), { propietarioId: 'p1', slug: 's', codigo: 'IND-Z15-XX-001' });
	assert.equal(v.casa.publicado, true);
	assert.equal(v.casa.estado, 'disponible');
	assert.equal(v.casa.propietarioId, 'p1');
	assert.equal(v.socio, null);
	const n = armarCasaNueva(revisar(noche()), { propietarioId: 'p1' });
	assert.equal(n.socio.margen, V.MARGEN);
	assert.equal(n.casa.vacacional.base, V.nochePublica(100, V.MARGEN));
	assert.equal(n.casa.vacacional.huespedesMax, 8);
	assert.deepEqual(n.casa.vacacional.reservadas, []);
	assert.equal(n.casa.agentId, '');
	assert.deepEqual(n.llegada.direccion, 'Lote 4, calle al mar');
});
console.log(`${ok} pruebas de la casa nueva del socio correctas`);
