// Pruebas de las reglas de SEO del sitio: páginas con poco contenido, precios por zona, lugares sin repetir,
// departamento, enlaces a listados que no existen, revisión de enlaces, descripciones viejas y títulos. Sin red.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { planListados, buscar, estadisticasPrecio, crearEnlaces, tipoDominante, MIN_INDEXABLE } from './lib/landings.mjs';
import { lugarDe, departamentoDe } from './lib/util.mjs';
import { revisarEnlaces } from './lib/enlaces.mjs';
import { sinRepetir, autoSeoTitle } from '../admin/js/seo-auto.js';
import { sinBloquesGenerados, generarDescripcion } from '../admin/js/descripcion.js';

let ok = 0;
function test(nombre, fn) {
	try { fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${err.stack}`); process.exitCode = 1; }
}
let id = 0;
const p = (d) => ({ id: `p${++id}`, operacion: 'venta', tipo: 'casa', moneda: 'USD', precio: 100000, ...d });

test('poco contenido: la zona se indexa desde 3; con 1 o 2 existe sin indexar', () => {
	const props = [p({ zona: 'Zona 16' }), p({ zona: 'Zona 16' }), p({ zona: 'Zona 16' }), p({ zona: 'Zona 1' }), p({ zona: 'Zona 1', operacion: 'renta' })];
	const plan = planListados(props);
	assert.equal(MIN_INDEXABLE, 3);
	assert.equal(buscar(plan, 'zona', { zona: 'Zona 16' }).indexable, true);
	assert.equal(buscar(plan, 'zona', { zona: 'Zona 1' }).indexable, false);
	// Tipo: misma regla (3 casas + 1 apartamento en venta → casas sí, apartamentos no).
	const tipos = planListados([...props, p({ zona: 'Zona 1', tipo: 'apartamento' })]);
	assert.equal(buscar(tipos, 'tipo', { operacion: 'venta', tipo: 'casa' }).indexable, true);
	assert.equal(buscar(tipos, 'tipo', { operacion: 'venta', tipo: 'apartamento' }).indexable, false);
	// Zona + operación con menos de 3 no se genera; igual a la zona, tampoco.
	assert.equal(buscar(plan, 'zonaOp', { operacion: 'venta', zona: 'Zona 1' }), null);
	assert.equal(buscar(plan, 'zonaOp', { operacion: 'venta', zona: 'Zona 16' }), null);
});

test('no se genera una página cuya lista es igual a la de su padre', () => {
	// Una sola zona: la zona sería igual a «todas».
	assert.equal(buscar(planListados([p({ zona: 'Zona 16' }), p({ zona: 'Zona 16' }), p({ zona: 'Zona 16' })]), 'zona', { zona: 'Zona 16' }), null);
	const props = [
		...[1, 2, 3, 4].map(() => p({ zona: 'Zona 16' })), p({ zona: 'Zona 16', tipo: 'apartamento' }),
		...[1, 2, 3].map(() => p({ zona: 'Zona 10', tipo: 'apartamento' })), ...[1, 2, 3].map(() => p({ zona: 'Zona 10', tipo: 'apartamento', operacion: 'renta' })),
		p({ zona: 'Zona 15', operacion: 'renta' }), p({ zona: 'Zona 15' })
	];
	const plan = planListados(props);
	assert.ok(buscar(plan, 'zonaTipoOp', { operacion: 'venta', tipo: 'casa', zona: 'Zona 16' }));
	assert.ok(buscar(plan, 'zonaOp', { operacion: 'venta', zona: 'Zona 10' }));
	// Apartamentos en venta en zona 10 = venta en zona 10: no se repite.
	assert.equal(buscar(plan, 'zonaTipoOp', { operacion: 'venta', tipo: 'apartamento', zona: 'Zona 10' }), null);
	assert.equal(buscar(plan, 'zonaTipoOp', { operacion: 'venta', tipo: 'casa', zona: 'Zona 16' }).url, '/casas-en-venta/zona-16/');
	assert.equal(planListados(props, { lang: 'en' }).find((e) => e.pagina === 'zonaOp' && e.zona === 'Zona 10' && e.operacion === 'venta').url, '/en/properties/for-sale/zona-10/');
	// Renta vacía tiene su página (enlaces de siempre) pero no se indexa.
	assert.equal(buscar(planListados([p({ zona: 'Zona 1' })]), 'op', { operacion: 'renta' }).indexable, false);
});

test('precios: rango, mediana y m²; con menos de 3 en una moneda no hay bloque; no se mezclan monedas', () => {
	const l = [p({ precio: 300000, m2Construccion: 200 }), p({ precio: 400000, m2Construccion: 200 }), p({ precio: 500000, m2Construccion: 250 }), p({ precio: 3000000, moneda: 'GTQ' })];
	const s = estadisticasPrecio(l, 'venta');
	assert.deepEqual([s.moneda, s.n, s.total, s.min, s.max, s.mediana, s.porM2], ['USD', 3, 4, 300000, 500000, 400000, 2000]);
	assert.equal(estadisticasPrecio(l.slice(0, 2), 'venta'), null);
	// Precio oculto (VIP) no cuenta.
	assert.equal(estadisticasPrecio([...l.slice(0, 2), p({ precio: 9, vipLanding: { ocultarPrecio: true } })], 'venta'), null);
	// Renta: al mes y sin m². Terrenos: por m² de terreno.
	const r = estadisticasPrecio([1000, 1500, 2000, 2500].map((precio) => p({ operacion: 'renta', precio, m2Construccion: 100 })), 'renta');
	assert.deepEqual([r.mediana, r.porM2], [1750, 0]);
	const t = estadisticasPrecio([100000, 200000, 300000].map((precio) => p({ tipo: 'terreno', precio, m2Terreno: 1000 })), 'venta');
	assert.equal(t.porM2, 200);
	assert.equal(tipoDominante([p({}), p({}), p({ tipo: 'apartamento' })]), 'casa');
	assert.equal(tipoDominante([p({}), p({ tipo: 'apartamento' })]), '');
});

test('lugar sin repetir: sin mayúsculas ni tildes y por palabras completas', () => {
	assert.equal(lugarDe({ direccion: 'Centro Vivo, zona 1', zona: 'Zona 1', ciudad: 'Guatemala' }, true), 'Centro Vivo, zona 1, Guatemala');
	// «Zona 1» no está dentro de «zona 10».
	assert.equal(lugarDe({ direccion: 'Edificio X, zona 10', zona: 'Zona 1', ciudad: 'Guatemala' }, true), 'Edificio X, zona 10, Zona 1, Guatemala');
	assert.equal(lugarDe({ zona: 'Antigua Guatemala', ciudad: 'Guatemala' }), 'Antigua Guatemala');
	assert.equal(lugarDe({ zona: 'Petén', ciudad: 'peten' }), 'Petén');
	assert.deepEqual(sinRepetir(['', 'Zona 16', null, 'Guatemala']), ['Zona 16', 'Guatemala']);
	// La casa por noche no muestra su dirección.
	assert.equal(lugarDe({ direccion: 'Calle 1', zona: 'Monterrico', ciudad: 'Taxisco' }, false), 'Monterrico, Taxisco');
});

test('departamento: por zona y después por ciudad; si no se conoce, vacío', () => {
	assert.equal(departamentoDe({ zona: 'Zona 10', ciudad: 'Guatemala' }), 'Guatemala');
	assert.equal(departamentoDe({ zona: 'Monterrico', ciudad: 'Guatemala' }), 'Santa Rosa');
	assert.equal(departamentoDe({ zona: 'Km 25.5 Carretera a El Salvador', ciudad: 'Villa Canales' }), 'Guatemala');
	assert.equal(departamentoDe({ ciudad: 'Santa Catarina Pinula' }), 'Guatemala');
	assert.equal(departamentoDe({ zona: 'Antigua Guatemala', ciudad: 'Guatemala' }), 'Sacatepéquez');
	assert.equal(departamentoDe({ ciudad: 'Panajachel' }), 'Sololá');
	assert.equal(departamentoDe({ zona: 'Zona 4', ciudad: 'Narnia' }), '');
	// Una colonia o aldea que contiene el nombre de otro lugar no es ese lugar.
	assert.equal(departamentoDe({ zona: 'Colonia Las Flores', ciudad: 'Guatemala' }), 'Guatemala');
	assert.equal(departamentoDe({ zona: 'Tikal Futura', ciudad: 'Guatemala' }), 'Guatemala');
	assert.equal(departamentoDe({ zona: 'Santa Elena Barillas', ciudad: 'Villa Canales' }), 'Guatemala');
	assert.equal(departamentoDe({ zona: 'Zona 10', ciudad: 'Ciudad de Guatemala' }), 'Guatemala');
});

test('enlaces a listados que no existen van al padre más cercano con casas; los vacíos no se muestran', () => {
	const es = planListados([p({ zona: 'Zona 16' }), p({ zona: 'Zona 16' }), p({ zona: 'Zona 16' }), p({ zona: 'Zona 10', tipo: 'apartamento' })]);
	const e = crearEnlaces(es, []);
	assert.equal(e.resolver('/propiedades/zona-14/'), '/propiedades/');
	assert.equal(e.resolver('/propiedades/zona-16/#mapa'), '/propiedades/zona-16/#mapa');
	assert.equal(e.resolver('/propiedades/venta/zona-14/'), '/propiedades/venta/');
	// Renta vacía: sube a /propiedades/.
	assert.equal(e.resolver('/propiedades/renta/zona-16/'), '/propiedades/');
	assert.equal(e.resolver('/casas-en-venta/zona-14'), '/casas-en-venta/');
	assert.equal(e.resolver('/oficinas-en-renta/zona-10/'), '/propiedades/');
	assert.equal(e.resolver('/blog/x/'), '/blog/x/');
	assert.equal(e.resolver('https://otro.com/propiedades/zona-14/'), 'https://otro.com/propiedades/zona-14/');
	assert.equal(e.visible('/propiedades/renta/'), false);
	assert.equal(e.visible('/vip/'), false);
	assert.equal(e.visible('/propiedades/venta/'), true);
	assert.equal(e.visible('/#contacto'), true);
});

test('revisión de enlaces: encuentra los rotos, acepta archivos y anclas, se salta el panel', async () => {
	const d = mkdtempSync(path.join(tmpdir(), 'eq-enlaces-'));
	mkdirSync(path.join(d, 'a'));
	mkdirSync(path.join(d, 'admin'));
	writeFileSync(path.join(d, 'logo.png'), '');
	writeFileSync(path.join(d, 'a', 'index.html'), '');
	writeFileSync(path.join(d, 'admin', 'index.html'), '<a href="/no-existe/">');
	writeFileSync(path.join(d, 'index.html'), '<a href="/a/">a</a><a href="/a/#x">a</a><a href="/#contacto">c</a><img src="/x.png"><a href="/logo.png">l</a><a href="/b/">b</a><a href="//cdn.x/y">y</a><a href="/admin/">p</a>');
	const rotos = await revisarEnlaces(d);
	rmSync(d, { recursive: true, force: true });
	assert.deepEqual(rotos, [{ pagina: '/', href: '/b/' }]);
});

test('descripción vieja: se quitan exactamente las secciones que armaba la plantilla', () => {
	const vieja = 'Casa frente al mar.\n\n**Características de la propiedad**\n- Hasta 1 huésped\n\n**Amenidades**\n- Piscina\n- Jardín\n\n**Detalles técnicos**\n- Tipo: Casa\n\n**Para tu estadía**\n- Estadía mínima: 1 noche\n- Revisá el calendario\n\n*El precio no incluye gastos de escrituración ni timbres fiscales.*';
	assert.equal(sinBloquesGenerados(vieja), 'Casa frente al mar.\n\n*El precio no incluye gastos de escrituración ni timbres fiscales.*');
	assert.equal(sinBloquesGenerados('Intro.\n\n**Property features**\n- Up to 1 guest\n\n**For your stay**\n- Minimum stay: 1 night'), 'Intro.');
	assert.equal(sinBloquesGenerados('Intro.\n\nKey facts: 4 bedrooms and 2 bathrooms. Price: $120.00/night.'), 'Intro.');
	// Lo escrito a mano con otro título queda.
	assert.equal(sinBloquesGenerados('Intro.\n\n**Lo mejor**\n- Vista'), 'Intro.\n\n**Lo mejor**\n- Vista');
	// El generador ya no copia campos: solo la presentación y la nota del precio.
	const nueva = generarDescripcion({ tipo: 'casa', operacion: 'vacacional', zona: 'Monterrico', habitaciones: 3, amenidades: ['Piscina'], vacacional: { huespedesMax: 8, nochesMin: 2 }, descripcion: vieja });
	assert.equal(nueva, 'Casa frente al mar.');
	assert.doesNotMatch(generarDescripcion({ tipo: 'apartamento', operacion: 'renta', zona: 'Zona 10', habitaciones: 2 }), /habitaci|Consultá|Revisá/);
});

test('título automático: cabe en 60, sin repetir la zona y con el municipio en inglés', () => {
	const largo = autoSeoTitle({ titulo: 'Casa en venta en Residencial Villa Capri, km 25.5 Carretera a El Salvador', operacion: 'venta', zona: 'Km 25.5 Carretera a El Salvador', ciudad: 'Villa Canales' });
	assert.ok(largo.length <= 60, largo);
	assert.equal(largo, 'Casa en venta en Residencial Villa Capri | Villa Canales');
	assert.equal(autoSeoTitle({ titulo: 'Apartamento en venta en Centro Vivo, zona 1', operacion: 'venta', zona: 'Zona 1', ciudad: 'Guatemala' }), 'Apartamento en venta en Centro Vivo, zona 1 | Guatemala');
	const en = autoSeoTitle({ titulo: 'Land for Sale in Aldea Laguna Bermeja', operacion: 'venta', zona: '', ciudad: 'Santa Catarina Pinula' }, true);
	// Antes «Lot for Sale Guatemala»: ahora con el lugar (el municipio no cabe en 60 y se pone el país).
	assert.equal(en, 'Land for Sale in Aldea Laguna Bermeja | Guatemala');
	assert.equal(autoSeoTitle({ titulo: 'Lot for Sale in Laguna Bermeja', operacion: 'venta', ciudad: 'Santa Catarina Pinula' }, true), 'Lot for Sale in Laguna Bermeja | Santa Catarina Pinula');
});

console.log(`${ok} pruebas de SEO pasan${process.exitCode ? ' (con fallas)' : ''}.`);
