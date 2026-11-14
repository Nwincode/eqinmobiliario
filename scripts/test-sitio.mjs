// Genera el sitio completo con un inventario inventado (scripts/lib/sitio-ejemplo.mjs), sin red ni base de datos,
// y lo recorre como lo haría Google: enlaces internos, JSON-LD, sitemap = páginas que se indexan, títulos,
// descripciones, canonical y pares de idioma. GUARDAR=<carpeta> deja el sitio ahí (para verlo o tomar capturas).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedEjemplo } from './lib/sitio-ejemplo.mjs';
import { revisarEnlaces } from './lib/enlaces.mjs';
import { precioTexto, dinero } from '../admin/js/formato.js';
import { formatPrice } from './lib/util.mjs';
import { celdaGaleriaVip } from './lib/templates.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(path.join(tmpdir(), 'eq-sitio-'));
const dist = process.env.GUARDAR ? path.resolve(process.env.GUARDAR) : path.join(tmp, 'dist');
const seed = path.join(tmp, 'seed.json');
writeFileSync(seed, JSON.stringify(seedEjemplo(path.join(ROOT, 'data/seed.json'))));
const env = { ...process.env, DATOS: 'seed', SEED_FILE: seed, DIST_DIR: dist };
delete env.CONTEXT; delete env.NETLIFY;
const log = execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let ok = 0;
function test(nombre, fn) {
	try { fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${String(err.message).slice(0, 600)}`); process.exitCode = 1; }
}

const BASE = 'https://eqinmobiliario.gt';
const paginas = [];
(function leer(dir) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const f = path.join(dir, e.name);
		if (e.isDirectory()) { if (path.relative(dist, f) !== 'admin') leer(f); } else if (e.name === 'index.html') paginas.push(f);
	}
})(dist);
const url = (f) => `/${path.relative(dist, path.dirname(f))}/`.replace(/^\/\/$/, '/').replace(/\/\/$/, '/');
const html = Object.fromEntries(paginas.map((f) => [url(f), readFileSync(f, 'utf8')]));
const de = (u) => html[u] || assert.fail(`no existe ${u}`);
const indexa = (h) => !/<meta name="robots" content="noindex/.test(h);
const attr = (h, re) => (re.exec(h) || [])[1];
const sitemap = new Set([...readFileSync(path.join(dist, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(BASE, '')));

const rotos = await revisarEnlaces(dist);
test('sin enlaces internos rotos (ni en las plantillas ni en el contenido)', () => assert.deepEqual(rotos, []));
test('el generador no avisa enlaces rotos ni páginas fuera del sitemap', () => assert.doesNotMatch(log, /enlaces? internos? rotos?|no están en el sitemap/));

test('todo JSON-LD se puede leer', () => {
	for (const [u, h] of Object.entries(html)) {
		for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => JSON.parse(m[1]), u);
	}
});

test('sitemap = exactamente las páginas que se indexan (salvo fichas vendidas o pausadas)', () => {
	const indexables = Object.keys(html).filter((u) => indexa(html[u]) && !/ficha-cerrada|<h2 id="ficha-aviso-titulo">/.test(html[u]));
	assert.deepEqual([...sitemap].sort(), indexables.sort());
});

test('cada página que se indexa: título ≤ 65, descripción 70–160, canonical propio', () => {
	for (const u of sitemap) {
		const h = de(u);
		const titulo = attr(h, /<title>([^<]*)<\/title>/);
		const desc = attr(h, /<meta name="description" content="([^"]*)"/);
		assert.ok(titulo.length <= 65, `${u}: título de ${titulo.length} «${titulo}»`);
		assert.ok(desc.length >= 70 && desc.length <= 160, `${u}: descripción de ${desc.length} «${desc}»`);
		assert.equal(attr(h, /<link rel="canonical" href="([^"]*)"/), BASE + u, u);
	}
});

test('hreflang: cada par se devuelve, con x-default, y apunta a páginas que se indexan', () => {
	for (const [u, h] of Object.entries(html)) {
		const alt = Object.fromEntries([...h.matchAll(/<link rel="alternate" hreflang="([a-z-]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2].replace(BASE, '')]));
		if (!Object.keys(alt).length) continue;
		assert.ok(alt.es && alt.en && alt['x-default'] === alt.es, `${u}: ${JSON.stringify(alt)}`);
		assert.ok([alt.es, alt.en].includes(u), `${u} no está en su propio par`);
		const otra = u === alt.es ? alt.en : alt.es;
		assert.match(de(otra), new RegExp(`hreflang="${u === alt.es ? 'es' : 'en'}" href="${BASE}${u}"`), `${otra} no devuelve el par a ${u}`);
		if (indexa(h)) assert.ok(indexa(de(otra)), `${u} se indexa y su par ${otra} no`);
	}
});

test('poco contenido: zona con 1 propiedad existe sin indexar; con 3 o más se indexa', () => {
	assert.equal(indexa(de('/propiedades/zona-1/')), false);
	assert.equal(indexa(de('/propiedades/zona-16/')), true);
	assert.equal(indexa(de('/propiedades/zona-10/')), true);
	// Zona 16 es toda venta: «venta en zona 16» repetiría la zona y no se genera.
	assert.ok(!existsSync(path.join(dist, 'propiedades/venta/zona-16')));
	assert.ok(indexa(de('/propiedades/venta/zona-10/')) && indexa(de('/propiedades/renta/zona-10/')));
	assert.ok(!existsSync(path.join(dist, 'propiedades/venta/zona-1')));
	// La misma regla en las páginas de tipo: 1 terreno → existe sin indexar y no se enlaza en «Buscar por tipo».
	assert.equal(indexa(de('/terrenos-en-venta/')), false);
	assert.equal(indexa(de('/casas-en-venta/')), true);
	assert.doesNotMatch(/<nav class="section pt-0" aria-labelledby="por-zona">[\s\S]*?<\/nav>/.exec(de('/propiedades/'))[0], /terrenos-en-venta/);
});

test('zona × tipo × operación cuelga de la página de tipo, con migas y canonical', () => {
	const h = de('/casas-en-venta/zona-16/');
	assert.match(h, /<h1 class="heading">Casas en venta en Zona 16<\/h1>/);
	assert.match(h, /href="\/casas-en-venta\/"/);
	assert.ok(sitemap.has('/casas-en-venta/zona-16/'));
	// Apartamentos en venta en zona 10 sería igual a «venta en zona 10»: no se genera.
	assert.ok(!existsSync(path.join(dist, 'apartamentos-en-venta/zona-10')));
});

test('bloque de precios: rango, mediana y m², sin mezclar monedas', () => {
	const h = de('/propiedades/zona-16/');
	assert.match(h, /Precios en Zona 16/);
	assert.match(h, /US\$ 198,000 – US\$ 515,000/);
	assert.match(h, /Precio mediano<\/dt><dd>US\$ 350,000</);
	assert.match(de('/propiedades/zona-15/'), /Q 2,500,000 – Q 3,400,000/);
	assert.match(de('/propiedades/renta/zona-10/'), /US\$ 1,800 \/mes/);
	assert.doesNotMatch(de('/propiedades/zona-1/'), /zona-precios/);
	// En el título y la descripción, el tipo que domina y un dato propio de la zona.
	// «Casas en venta en Zona 16» es de su propia página: la zona no compite con ella por el mismo título.
	assert.match(attr(h, /<title>([^<]*)/), /^Propiedades en venta en Zona 16/);
	assert.match(attr(de('/propiedades/venta/zona-15/'), /<title>([^<]*)/), /^Casas en venta en Zona 15/);
	assert.match(attr(h, /<meta name="description" content="([^"]*)"/), /precio mediano US\$ 350,000/);
});

test('inglés: zona × operación con su par en español', () => {
	const h = de('/en/properties/for-sale/zona-10/');
	assert.match(h, /hreflang="es" href="https:\/\/eqinmobiliario.gt\/propiedades\/venta\/zona-10\/"/);
	assert.ok(sitemap.has('/en/properties/for-sale/zona-10/'));
	assert.match(de('/en/properties/zona-16/'), /Median price per\ssq\sft/);
});

test('enlaces del contenido a listados que no existen van al padre que sí tiene casas', () => {
	const h = de('/blog/guia-ejemplo-zona-14/');
	assert.match(h, /<a href="\/propiedades\/">casas en zona 14<\/a>/);
	assert.match(h, /<a href="\/propiedades\/renta\/">casas en renta en zona 16<\/a>/);
	assert.match(h, /<a href="\/casas-en-venta\/zona-16\/">casas en venta en zona 16<\/a>/);
});

test('el menú y el pie no enlazan listados vacíos ni repiten destinos', () => {
	for (const u of ['/', '/propiedades/', '/en/']) {
		const pie = /<nav class="pie-enlaces"[\s\S]*?<\/nav>/.exec(de(u))[0];
		const hrefs = [...pie.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
		assert.equal(new Set(hrefs).size, hrefs.length, `${u}: enlaces repetidos en el pie`);
	}
});

test('ficha: sin bloques viejos en la descripción, ubicación sin repetir, departamento en JSON-LD', () => {
	const vac = Object.keys(html).find((u) => /^\/propiedad\/.*monterrico/.test(u) && /Casa frente al mar/.test(html[u]));
	assert.ok(vac);
	const desc = /<div class="prop-description">([\s\S]*?)<\/div>/.exec(de(vac))[1];
	assert.doesNotMatch(desc, /huésped|Estadía mínima|Revisá|Amenidades/);
	assert.match(de(vac), /"addressRegion":"Santa Rosa"/);
	assert.doesNotMatch(de(vac), /"streetAddress"|"geo"/);
	const z1 = Object.keys(html).find((u) => /^\/propiedad\/.*zona-1-/.test(u));
	assert.match(de(z1), /<dd>Centro Vivo, zona 1, Guatemala<\/dd>/);
	const terreno = Object.keys(html).find((u) => /^\/propiedad\/terreno/.test(u));
	assert.match(de(terreno), /"addressRegion":"Guatemala"/);
	assert.ok(attr(de(terreno), /<title>([^<]*)/).length <= 60);
});

test('VIP con propiedades se indexa; tarjetas sin puntos y con ancho y alto', () => {
	assert.ok(indexa(de('/vip/')));
	assert.doesNotMatch(de('/propiedades/'), /prop-puntos/);
	// Toda imagen con src lleva ancho y alto (sin saltos al cargar), en todas las páginas.
	for (const [u, h] of Object.entries(html)) {
		for (const m of h.matchAll(/<img\b[^>]*\ssrc="[^"]*"[^>]*>/g)) {
			if (/display:none/.test(m[0])) continue; // píxel de seguimiento
			assert.match(m[0], /width="\d+"[^>]*height="\d+"|height="\d+"[^>]*width="\d+"|class="nav-logo-img"/, `${u}: ${m[0].slice(0, 120)}`);
		}
	}
	// Solo las dos primeras tarjetas del listado se cargan de entrada.
	const cards = [...de('/propiedades/').matchAll(/<div class="property-item"[\s\S]*?<img src="[^"]+"[^>]*>/g)].map((m) => /loading="lazy"/.test(m[0]));
	assert.deepEqual(cards.slice(0, 3), [false, false, true]);
});

test('precio de una propiedad: sin centavos si es entero y de 1,000 o más; con centavos si no (una sola regla)', () => {
	assert.equal(precioTexto(350000, 'USD'), 'US$ 350,000');
	assert.equal(precioTexto(5000, 'GTQ', 'renta'), 'Q 5,000 /mes');
	assert.equal(precioTexto(1250.5, 'USD'), 'US$ 1,250.50');
	assert.equal(precioTexto(120, 'USD', 'vacacional'), 'Desde US$ 120.00 por noche');
	assert.equal(precioTexto(1200, 'USD', 'vacacional', 'en'), 'From US$ 1,200 per night');
	assert.equal(precioTexto(0), 'Precio a consultar');
	// Lo que se cobra o se suma sigue con centavos.
	assert.equal(dinero(350000, 'USD'), 'US$ 350,000.00');
	assert.equal(formatPrice, precioTexto);
	assert.match(de(Object.keys(html).find((u) => /^\/propiedad\/casa-en-venta-en-zona-16-1\//.test(u))), /US\$ 350,000</);
});

test('artículo sin imagen: el JSON-LD usa la imagen del sitio', () => {
	const ld = [...de('/blog/guia-ejemplo-zona-14/').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((x) => x['@type'] === 'BlogPosting');
	assert.match(ld.image, /^https:\/\/eqinmobiliario\.gt\/.+\.(jpg|webp|png)$/);
});

test('la ficha por noche no carga los textos del chat (solo /reserva/)', () => {
	const vac = Object.keys(html).find((u) => /^\/propiedad\/.*monterrico/.test(u));
	const datos = JSON.parse(/<script type="application\/json" class="vac-datos">([\s\S]*?)<\/script>/.exec(de(vac))[1]);
	assert.deepEqual(Object.keys(datos.t).filter((k) => k.startsWith('vacChat')), ['vacChatVer']);
	assert.match(de('/reserva/'), /vacChatSin/);
});

test('las pastillas de zona solo enlazan zonas que se indexan', () => {
	for (const u of ['/propiedades/', '/propiedades/venta/']) {
		const nav = /<nav class="section pt-0" aria-labelledby="por-zona">[\s\S]*?<\/nav>/.exec(de(u));
		for (const [, href] of (nav ? nav[0] : '').matchAll(/href="([^"]+)"/g)) assert.ok(indexa(de(href)), `${u} enlaza ${href}, que no se indexa`);
	}
});

test('galería VIP: sin celdas sueltas con cualquier número de fotos', () => {
	for (let n = 2; n <= 14; n++) {
		const celdas = Array.from({ length: n }, (_, i) => celdaGaleriaVip(i, n));
		// Computadora: 4 columnas, la primera 2×2 (y si hay una sola miniatura, 2×2 también).
		const area = celdas.slice(1).reduce((a, c) => a + (/vg-d4/.test(c) ? 4 : /vg-d2/.test(c) ? 2 : 1) * (/vg-dr2/.test(c) ? 2 : 1), 4);
		assert.equal(area % 4, 0, `${n} fotos: en computadora queda un hueco (${celdas.join('|')})`);
		assert.ok(area >= 8, `${n} fotos: las miniaturas no llenan el alto de la grande`);
		// Celular: 2 columnas, la primera 2×2.
		const cel = celdas.slice(1).reduce((a, c) => a + (/vg-m2/.test(c) ? 2 : 1), 0);
		assert.equal(cel % 2, 0, `${n} fotos: en celular queda una celda suelta`);
	}
});

// Sitio sin casas en renta: el listado vacío lo dice como tal (no como filtro) y ningún enlace del contenido lleva ahí.
{
	const seedSin = path.join(tmp, 'seed-sin-renta.json');
	const datos = seedEjemplo(path.join(ROOT, 'data/seed.json'));
	datos.properties = datos.properties.filter((p) => p.operacion !== 'renta');
	writeFileSync(seedSin, JSON.stringify(datos));
	const distSin = path.join(tmp, 'dist-sin-renta');
	execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env: { ...env, SEED_FILE: seedSin, DIST_DIR: distSin }, stdio: ['ignore', 'pipe', 'pipe'] });
	const leer = (u) => readFileSync(path.join(distSin, u, 'index.html'), 'utf8');
	test('enlaces de Contenido (portada) a un listado sin casas se esconden', () => {
		assert.ok(datos.settings.features.items.some((f) => f.enlace === '/propiedades/renta/'));
		assert.doesNotMatch(leer(''), /href="\/propiedades\/renta\/"/);
		assert.match(leer(''), /href="\/propiedades\/venta\/" class="learn-more"/);
	});
	test('listado vacío: mensaje propio con enlace a todas, sin filtros', () => {
		const h = leer('propiedades/renta');
		assert.match(h, /Por ahora no hay propiedades aquí\. <a href="\/propiedades\/">Ve todas las propiedades<\/a>\. <a href="#contacto-listado">Cuéntanos qué buscas<\/a>/);
		assert.doesNotMatch(h, /No encontramos propiedades con esos filtros|id="listing-filters"/);
		assert.match(h, /<meta name="robots" content="noindex/);
		assert.match(readFileSync(path.join(distSin, 'en/properties/for-rent/index.html'), 'utf8'), /There are no properties here yet\. <a href="\/en\/properties\/">See all properties<\/a>/);
	});
}

if (!process.env.GUARDAR) rmSync(tmp, { recursive: true, force: true });
console.log(`${ok} pruebas del sitio generado pasan${process.exitCode ? ' (con fallas)' : ''}.`);
