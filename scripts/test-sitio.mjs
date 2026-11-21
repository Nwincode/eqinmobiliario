// Genera el sitio completo con un inventario inventado (scripts/lib/sitio-ejemplo.mjs), sin red ni base de datos,
// y lo recorre como lo haría Google: enlaces internos, JSON-LD, sitemap = páginas que se indexan, títulos,
// descripciones, canonical y pares de idioma. GUARDAR=<carpeta> deja el sitio ahí (para verlo o tomar capturas).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedEjemplo } from './lib/sitio-ejemplo.mjs';
import { revisarEnlaces } from './lib/enlaces.mjs';
import { precioTexto, dinero, TIPO_CAMBIO, enUSD, correoValido, horarioEn, conPiesCuadrados } from '../admin/js/formato.js';
import { formatPrice } from './lib/util.mjs';
import { celdaGaleriaVip, imgFoto } from './lib/templates.mjs';
import { codigosEnCss } from './lib/assets.mjs';
import { reservada } from '../admin/js/rutas.js';
import { slugify } from '../admin/js/formato.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(path.join(tmpdir(), 'eq-sitio-'));
const dist = process.env.GUARDAR ? path.resolve(process.env.GUARDAR) : path.join(tmp, 'dist');
const seed = path.join(tmp, 'seed.json');
// Dos páginas guardadas antes con un nombre que ahora es del sitio (admin/js/rutas.js): pasan a /pagina/ y su
// dirección de antes redirige; la de inglés «properties» no tapa el listado ni se redirige encima de él.
const ejemplo = seedEjemplo(path.join(ROOT, 'data/seed.json'));
ejemplo.pages.push(
	{ id: 'pg-docs', titulo: 'Documentos', slug: 'docs', orden: 90, enFooter: false, publicado: true, contenido: 'Documentos que pide el banco para comprar una casa en Guatemala: identificación, constancia de ingresos y estados de cuenta.' },
	{ id: 'pg-props-en', titulo: 'Properties', slug: 'properties', idioma: 'en', orden: 91, enFooter: false, publicado: true, contenido: 'All about how we list our properties in Guatemala: photos, prices, documents and visits with an advisor.' });
writeFileSync(seed, JSON.stringify(ejemplo));
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

test('cada carpeta que escribe el generador es una página de contenido o está reservada (admin/js/rutas.js)', () => {
	const datos = JSON.parse(readFileSync(seed, 'utf8'));
	const paginasDe = (en) => new Set(datos.pages.filter((p) => p.publicado && (p.idioma === 'en') === en).map((p) => slugify(p.slug || p.titulo)));
	for (const [dir, lang] of [[dist, 'es'], [path.join(dist, 'en'), 'en']]) {
		const propias = paginasDe(lang === 'en');
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			// Los listados por tipo o zona (/apartamentos-en-venta/) le ceden su dirección a una página (planListados, `ocupadas`).
			const listado = existsSync(path.join(dir, e.name, 'index.html')) && /<body data-listing="1"/.test(readFileSync(path.join(dir, e.name, 'index.html'), 'utf8'));
			if (e.isDirectory() && !propias.has(e.name) && !listado) assert.ok(reservada(e.name, lang), `${lang}: /${e.name}/ la escribe el sitio y no está en RESERVADAS`);
		}
	}
});

test('una página con nombre reservado sale en /pagina/ y su dirección de antes redirige, sin tapar una del sitio', () => {
	const reglas = readFileSync(path.join(dist, '_redirects'), 'utf8').split('\n');
	assert.ok(existsSync(path.join(dist, 'pagina/docs/index.html')));
	assert.ok(existsSync(path.join(dist, 'en/pagina/properties/index.html')));
	const docs = reglas.indexOf('/docs/ /pagina/docs/ 301');
	assert.ok(docs >= 0, 'redirige /docs/');
	assert.ok(!reglas.some((l) => l.startsWith('/en/properties/ ')), 'el listado en inglés no se redirige');
	// Antes de las reglas generales (Netlify usa la primera que coincide).
	const general = reglas.findIndex((l) => /\* /.test(l));
	assert.ok(general === -1 || docs < general);
	assert.match(de('/en/properties/'), /data-listing="1"/);
});

test('sitemap = exactamente las páginas que se indexan (salvo fichas vendidas o pausadas)', () => {
	const indexables = Object.keys(html).filter((u) => indexa(html[u]) && !/ficha-cerrada|id="ficha-aviso-titulo"/.test(html[u]));
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
	assert.match(h, /US\$ 198,000\.00 – US\$ 515,000\.00/);
	assert.match(h, /Precio mediano<\/dt><dd>US\$ 350,000\.00</);
	assert.match(de('/propiedades/zona-15/'), /Q 2,500,000\.00 – Q 3,400,000\.00/);
	assert.match(de('/propiedades/renta/zona-10/'), /US\$ 1,800\.00 \/mes/);
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

test('precio de una propiedad: siempre con centavos, como lo pidió el dueño (una sola regla)', () => {
	assert.equal(precioTexto(350000, 'USD'), 'US$ 350,000.00');
	assert.equal(precioTexto(5000, 'GTQ', 'renta'), 'Q 5,000.00 /mes');
	assert.equal(precioTexto(1250.5, 'USD'), 'US$ 1,250.50');
	assert.equal(precioTexto(120, 'USD', 'vacacional'), 'US$ 120.00 por noche');
	assert.equal(precioTexto(1200, 'USD', 'vacacional', 'en'), 'US$ 1,200.00 per night');
	assert.equal(precioTexto(0), 'Precio a consultar');
	// Lo que se cobra o se suma sigue con centavos.
	assert.equal(dinero(350000, 'USD'), 'US$ 350,000.00');
	assert.equal(formatPrice, precioTexto);
	assert.match(de(Object.keys(html).find((u) => /^\/propiedad\/casa-en-venta-en-zona-16-1\//.test(u))), /US\$ 350,000\.00</);
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

test('ninguna página que se indexa enlaza un listado que no se indexa (pastillas, migas, ubicación)', () => {
	const malos = [];
	for (const [u, h] of Object.entries(html)) {
		if (!indexa(h)) continue;
		for (const [, href] of h.matchAll(/href="(\/[^"#?]*)"/g)) {
			const d = html[href];
			if (d && /data-listing="1"/.test(d) && !indexa(d)) malos.push(`${u} → ${href}`);
		}
	}
	assert.deepEqual([...new Set(malos)], []);
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

test('precios de las tarjetas en US$ (un tipo de cambio): Q 970,000 queda debajo de US$ 378,200 al ordenar', () => {
	const h = de('/propiedades/');
	const precios = [...h.matchAll(/class="property-item"[^>]*data-precio="(\d+)"/g)].map((m) => Number(m[1]));
	assert.ok(precios.includes(Math.round(970000 / TIPO_CAMBIO)), 'la casa de Q 970,000 no está en US$');
	assert.ok(!precios.includes(970000) && !precios.includes(2500000), 'quedan precios en quetzales');
	assert.match(h, /Precio mínimo \(US\$\)<\/label>/);
});

test('buscador de las tarjetas sin «undefined» ni espacios dobles cuando falta un dato', () => {
	for (const [u, h] of Object.entries(html)) {
		for (const m of h.matchAll(/data-texto="([^"]*)"/g)) assert.ok(!/undefined|null|\s{2}/.test(m[1]), `${u}: «${m[1]}»`);
	}
});

test('títulos en orden en todas las páginas (sin saltar de h1 a h3, nada antes del h1)', () => {
	for (const [u, h] of Object.entries(html)) {
		let antes = 0;
		for (const m of h.matchAll(/<h([1-6])\b/g)) {
			assert.ok(Number(m[1]) <= antes + 1, `${u}: h${antes} → h${m[1]}`);
			antes = Number(m[1]);
		}
	}
});

test('fotos: srcset del CDN de Netlify, la original de respaldo y width/height con la proporción pedida', () => {
	let fotos = 0;
	for (const [u, h] of Object.entries(html)) {
		for (const [img] of h.matchAll(/<img [^>]*srcset="[^"]*"[^>]*>/g)) {
			fotos++;
			const src = attr(img, /src="([^"]+)"/), w = Number(attr(img, /width="(\d+)"/)), alto = Number(attr(img, /height="(\d+)"/));
			assert.ok(!src.startsWith('/.netlify/'), `${u}: src debe ser la original`);
			for (const [, url, ancho] of attr(img, /srcset="([^"]+)"/).matchAll(/(\S+) (\d+)w/g)) {
				assert.equal(url.replace(/&amp;/g, '&'), `/.netlify/images?url=${encodeURIComponent(src.replace(/&amp;/g, '&'))}&w=${ancho}`, u);
			}
			assert.ok(w > 0 && alto > 0 && [4 / 3, 16 / 10, 16 / 9, 3 / 2].some((r) => Math.abs(w / alto - r) < 0.01), `${u}: ${w}×${alto}`);
		}
	}
	assert.ok(fotos > 50, `solo ${fotos} fotos con srcset`);
	assert.equal(imgFoto('/images/a.webp', { sizes: '100vw', anchos: [480, 800], aspecto: [16, 9] }).match(/width="(\d+)" height="(\d+)"/).slice(1).join('×'), '800×450');
	assert.doesNotMatch(imgFoto('https://otro.com/a.jpg', { sizes: '100vw' }), /srcset/, 'una foto de otro sitio no pasa por el CDN');
});

test('íconos: la fuente del sitio tiene todos los que pide el CSS (sin bajar la completa)', () => {
	const { sitio } = JSON.parse(readFileSync(path.join(ROOT, 'fonts/icomoon/sitio.json'), 'utf8'));
	const css = readFileSync(path.join(dist, attr(de('/'), /href="(\/assets\/[^"]+\/site\.css)"/)), 'utf8');
	const faltan = codigosEnCss(css).filter((c) => !sitio.includes(c.toString(16)));
	assert.deepEqual(faltan.map((c) => c.toString(16)), [], 'regenera con node scripts/fuente-iconos.mjs');
	assert.match(css, /icomoon-sitio\.woff2\?v=/);
	assert.doesNotMatch(css, /icomoon\.(ttf|eot|svg)/);
	assert.doesNotMatch(log, /íconos fuera de la fuente del sitio/);
});

test('horario: el inglés sale del español (días y 12 h); el guardado en inglés no se usa', () => {
	assert.equal(horarioEn('Lunes a sábado, 8:00 a 17:00'), 'Monday to Saturday, 8:00 a.m. to 5:00 p.m.');
	assert.equal(horarioEn('Lunes a viernes de 8:00 a 12:30 y 14:00 a 18:00; domingos cerrado'), 'Monday to Friday from 8:00 a.m. to 12:30 p.m. and 2:00 p.m. to 6:00 p.m.; Sundays closed');
	assert.equal(horarioEn('Lunes a viernes 8 a. m. a 5 p. m.'), 'Monday to Friday 8:00 a.m. to 5:00 p.m.');
	assert.equal(horarioEn('Todos los días con cita previa'), 'Every day by appointment');
	assert.equal(horarioEn('Horario por WhatsApp'), 'Horario por WhatsApp', 'lo que no reconoce queda igual');
	assert.equal(horarioEn(''), '');
	const es = attr(de('/'), /ini-dato"><span class="icon-clock-o[^>]*><\/span>([^<]+)/), en = attr(de('/en/'), /ini-dato"><span class="icon-clock-o[^>]*><\/span>([^<]+)/);
	assert.equal(en, horarioEn(es));
});

test('correo: una sola regla (formato.js) también en el JavaScript del sitio', () => {
	for (const c of ['ana@', 'ana@correo', 'ana @correo.com', 'ana@correo.c', 'ana@@correo.com', '']) assert.equal(correoValido(c), false, c);
	for (const c of ['ana@correo.com', 'ana.p+x@sub.dominio.gt', 'ANA@CORREO.COM']) assert.equal(correoValido(c), true, c);
	const js = readFileSync(path.join(dist, attr(de('/'), /src="(\/assets\/[^"]+\/site\.js)"/)), 'utf8');
	assert.match(js, /EQFormato/);
	assert.match(readFileSync(path.join(ROOT, 'js/site.js'), 'utf8'), /EQFormato\.correoValido\(lead\.email\)/);
});

test('en inglés, los m² llevan sus sq ft (descripción, meta y JSON-LD)', () => {
	assert.equal(conPiesCuadrados('149 m² apartment on 229.30 m2.'), '149 m² (1,604 sq ft) apartment on 229.30 m2 (2,468 sq ft).');
	assert.equal(conPiesCuadrados('1,604 sq ft (149 m²); a 2,226.47 m² (23,966 sq ft) lot'), '1,604 sq ft (149 m²); a 2,226.47 m² (23,966 sq ft) lot');
	assert.equal(enUSD(7700, 'GTQ'), 1000);
});

const lds = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const ldDe = (h, tipo) => lds(h).find((x) => x['@type'] === tipo);

test('JSON-LD de la empresa: horario de Contenido, redes de Contenido, logo, teléfono y dirección', () => {
	const datos = JSON.parse(readFileSync(seed, 'utf8')).settings;
	for (const u of ['/', '/en/']) {
		const org = ldDe(de(u), 'RealEstateAgent');
		assert.ok(org.name && org.url && org.logo && org.telephone && org.address && org.areaServed, u);
		// «Lunes a sábado, 9:00 a 18:00» (data/seed.json): también en /en/, que muestra el horario en inglés.
		assert.deepEqual(org.openingHoursSpecification, [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '09:00', closes: '18:00' }], u);
		assert.deepEqual(org.sameAs, Object.values(datos.redes).filter((r) => /^https?:\/\//.test(r)), u);
	}
	assert.ok(!/eqinmobilariogt/.test(readFileSync(path.join(ROOT, 'data/seed.json'), 'utf8')), 'las redes del ejemplo llevan el usuario correcto (eqinmobiliario.gt)');
});

test('JSON-LD de fichas, artículos y migas: los campos que pide Google', () => {
	for (const u of sitemap) {
		const h = de(u);
		if (u !== '/' && u !== '/en/') assert.ok(ldDe(h, 'BreadcrumbList'), `${u} sin BreadcrumbList`);
		const ficha = ldDe(h, 'RealEstateListing');
		if (ficha) {
			const o = ficha.offers;
			assert.ok(ficha.name && ficha.datePosted && ficha.image.length > 1 && ficha.image.every((i) => /^https:\/\//.test(i)), u);
			assert.ok(o.priceCurrency && /^https:\/\/schema\.org\//.test(o.availability) && (o.price || ficha.offers.price === undefined), u);
			if (ficha.about.floorSize) assert.equal(ficha.about.floorSize.unitCode, 'MTK', u);
		}
		const art = ldDe(h, 'BlogPosting');
		if (art) assert.ok(art.headline && art.author && art.author.name && art.datePublished && /^https:\/\//.test(art.image) && art.publisher, u);
	}
	assert.ok(ldDe(de('/propiedad/casa-en-venta-en-zona-16-2/'), 'RealEstateListing').about.numberOfRooms);
});

test('títulos y descripciones únicos; un solo h1 en cada página que se indexa', () => {
	const vistos = { titulo: new Map(), descripcion: new Map() };
	for (const u of sitemap) {
		const h = de(u);
		for (const [k, re] of [['titulo', /<title>([^<]*)<\/title>/], ['descripcion', /<meta name="description" content="([^"]*)"/]]) {
			const v = attr(h, re);
			assert.ok(!vistos[k].has(v), `${k} repetido en ${u} y ${vistos[k].get(v)}: «${v}»`);
			vistos[k].set(v, u);
		}
		assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, `${u}: h1`);
	}
});

test('al compartir: foto de la ficha en JPG 1200×630 por el CDN, con medidas, texto y tarjeta grande', () => {
	const h = de('/propiedad/casa-en-venta-en-zona-16-2/');
	assert.match(attr(h, /<meta property="og:image" content="([^"]*)"/), /^https:\/\/eqinmobiliario\.gt\/\.netlify\/images\?url=%2Fimages%2Fimg_3\.webp&amp;w=1200&amp;h=630&amp;fit=cover&amp;fm=jpg$/);
	assert.match(h, /<meta property="og:image:width" content="1200">\s*<meta property="og:image:height" content="630">/);
	assert.match(h, /<meta property="og:image:alt" content="Casa en venta en Zona 16 2 – foto 1">/);
	assert.equal(attr(h, /<meta name="twitter:image" content="([^"]*)"/), attr(h, /<meta property="og:image" content="([^"]*)"/));
	for (const u of sitemap) assert.match(de(u), /<meta name="twitter:card" content="summary_large_image">/, u);
});

test('sitemap: lastmod real en fichas (también en inglés) y fotos de cada ficha; robots.txt y llms.txt al día', () => {
	const xml = readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
	const urls = [...xml.matchAll(/<url><loc>([^<]+)<\/loc>(.*?)<\/url>/g)];
	for (const [, loc, resto] of urls.filter(([, l]) => /\/(propiedad|property)\//.test(l))) {
		assert.match(resto, /<lastmod>2026-\d\d-\d\d<\/lastmod>/, loc);
		assert.match(resto, /<image:image><image:loc>https:\/\//, loc);
	}
	const robots = readFileSync(path.join(dist, 'robots.txt'), 'utf8');
	for (const bot of ['Bingbot', 'DuckDuckBot', 'Applebot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended']) {
		assert.match(robots, new RegExp(`User-agent: ${bot}\\nAllow: /\\nDisallow: /admin/`), bot);
	}
	assert.match(robots, /^Sitemap: https:\/\/eqinmobiliario\.gt\/sitemap\.xml$/m);
	// llms.txt: solo páginas del sitemap (nada que no se indexa).
	const llms = [...readFileSync(path.join(dist, 'llms.txt'), 'utf8').matchAll(/\]\((https:\/\/eqinmobiliario\.gt[^)]*)\)/g)].map((m) => m[1].replace(BASE, ''));
	assert.ok(llms.length > 10);
	for (const u of llms) assert.ok(sitemap.has(u), `llms.txt enlaza ${u}, que no está en el sitemap`);
	const full = [...readFileSync(path.join(dist, 'llms-full.txt'), 'utf8').matchAll(/Enlace: (https:\/\/eqinmobiliario\.gt\S*)/g)].map((m) => m[1].replace(BASE, ''));
	assert.ok(full.length > 10);
	for (const u of full) assert.ok(sitemap.has(u), `llms-full.txt enlaza ${u}, que no está en el sitemap`);
});

test('ruta crítica: Work Sans del propio sitio y precargada con la misma URL; primera tarjeta del listado con prioridad', () => {
	const h = de('/');
	assert.doesNotMatch(h, /fonts\.(googleapis|gstatic)\.com/);
	const pre = attr(h, /<link rel="preload" as="font" type="font\/woff2" href="([^"]+)" crossorigin>/);
	const css = readFileSync(path.join(dist, attr(h, /<link rel="stylesheet" href="([^"]+)"/)), 'utf8');
	assert.ok(css.includes(`url(${pre})`), `la precarga ${pre} no es la del CSS`);
	assert.ok(existsSync(path.join(dist, pre)));
	const tarjetas = de('/propiedades/').match(/<img src="[^"]*" [^>]*class="img-fluid"[^>]*>/g);
	assert.match(tarjetas[0], /fetchpriority="high"/);
	assert.doesNotMatch(tarjetas[1], /fetchpriority|loading="lazy"/);
	assert.match(tarjetas[2], /loading="lazy"/);
});

test('404: además del botón, enlaces a las zonas y tipos que se indexan', () => {
	const h = readFileSync(path.join(dist, '404.html'), 'utf8');
	assert.match(h, /<meta name="robots" content="noindex/);
	assert.match(h, /aria-labelledby="por-zona"[\s\S]*href="\/propiedades\/zona-16\/"[\s\S]*href="\/casas-en-venta\/"/);
});

// Sitio sin casas en renta: el listado vacío lo dice como tal (no como filtro) y ningún enlace del contenido lleva ahí.
{
	const seedSin = path.join(tmp, 'seed-sin-renta.json');
	const datos = seedEjemplo(path.join(ROOT, 'data/seed.json'));
	datos.properties = datos.properties.filter((p) => p.operacion !== 'renta');
	// Un enlace de Contenido (el botón del bloque para EE. UU.) que apunta al listado vacío.
	datos.settings.bloqueExterior.enlace = '/propiedades/renta/';
	writeFileSync(seedSin, JSON.stringify(datos));
	const distSin = path.join(tmp, 'dist-sin-renta');
	execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env: { ...env, SEED_FILE: seedSin, DIST_DIR: distSin }, stdio: ['ignore', 'pipe', 'pipe'] });
	const leer = (u) => readFileSync(path.join(distSin, u, 'index.html'), 'utf8');
	test('enlaces de Contenido (portada) a un listado sin casas se esconden', () => {
		assert.doesNotMatch(leer(''), /href="\/propiedades\/renta\/"/);
		assert.match(leer(''), /href="\/propiedades\/venta\/"/);
	});
	test('listado vacío: mensaje propio con enlace a todas, sin filtros', () => {
		const h = leer('propiedades/renta');
		assert.match(h, /Por ahora no hay propiedades aquí\. <a href="\/propiedades\/">Ve todas las propiedades<\/a>\. <a href="#contacto-listado">Cuéntanos qué buscas<\/a>/);
		assert.doesNotMatch(h, /No encontramos propiedades con esos filtros|id="listing-filters"/);
		assert.match(h, /<meta name="robots" content="noindex/);
		assert.match(readFileSync(path.join(distSin, 'en/properties/for-rent/index.html'), 'utf8'), /There are no properties here yet\. <a href="\/en\/properties\/">See all properties<\/a>/);
	});
}

// Casos de la tanda 3: precio oculto VIP, casa de prueba, amenidades que el diccionario no tiene, zona escrita distinto,
// dos casas con el mismo título en inglés y su dirección anterior.
{
	const seedT = path.join(tmp, 'seed-tanda3.json');
	const datos = seedEjemplo(path.join(ROOT, 'data/seed.json'));
	const vip = datos.properties.find((p) => p.vip);
	vip.vipLanding = { ...vip.vipLanding, ocultarPrecio: true };
	vip.precio = 987654;
	// Descripciones guardadas con el precio: la del panel antes de ser VIP y la del traductor en inglés.
	vip.seo = { descripcion: 'Casa en venta en Zona 16, Guatemala: 4 habitaciones. US$ 987,654.00.', auto: {} };
	vip.en = { ...vip.en, seo: { descripcion: 'House for sale in Zona 16, Guatemala. US$ 987,654.' }, descripcion: 'Asking US$ 987,654.00, view of the forest.',
		vipLanding: { titular: 'Forest house', subtitular: 'Only $987,654', puntosClave: ['4 bedrooms', 'US$ 987.654'] } };
	// Y en los textos escritos a mano: descripción y página VIP.
	vip.descripcion = 'Casa con vista al bosque. Precio: US$ 987,654.00, negociable (unos 988 mil, 987k o Q 7.6 millones).';
	vip.vipLanding = { ...vip.vipLanding, subtitular: 'Por solo Q 987.654', puntosClave: ['4 habitaciones', 'US$ 987,654'] };
	// Una casa que no es VIP con «Ocultar precio» marcado (dejó de ser VIP): tampoco sale.
	const oculta = datos.properties.find((p) => p.zona === 'Zona 15' && p.operacion === 'venta' && !p.vip);
	Object.assign(oculta, { precio: 876543, vipLanding: { ocultarPrecio: true }, titulo: 'Casa de Q 876,543 en zona 15', slug: 'casa-de-q-876543-en-zona-15', descripcion: 'Casa en zona 15 de Q 876,543.00.' });
	const z10 = datos.properties.filter((p) => p.zona === 'Zona 10');
	z10[0].zona = 'zona 10 ';
	z10[1].amenidades = ['Piscina', 'Agua municipal', 'Lobby de recepción'];
	const [a, b] = datos.properties.filter((p) => p.zona === 'Zona 15' && p.operacion === 'venta');
	b.en = { ...b.en, titulo: a.en.titulo, slugsAnteriores: ['Old title of the second'] };
	datos.properties.push({ ...datos.properties[0], id: 'prueba-1', titulo: 'Casa de PRUEBA Monterrico', slug: 'casa-de-prueba-monterrico', destacada: false, vip: false,
		en: { ...datos.properties[0].en, titulo: 'Test house in Monterrico' } });
	writeFileSync(seedT, JSON.stringify(datos));
	const distT = path.join(tmp, 'dist-tanda3');
	const corrida = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env: { ...env, SEED_FILE: seedT, DIST_DIR: distT }, encoding: 'utf8' });
	if (corrida.status !== 0) throw new Error(corrida.stderr);
	const todo = [];
	(function leer(dir) {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const f = path.join(dir, e.name);
			if (e.isDirectory()) { if (e.name !== 'admin') leer(f); } else if (/\.(html|txt|xml|json|csv)$|^_redirects$/.test(e.name)) todo.push(f);
		}
	})(distT);
	const leerT = (u) => readFileSync(path.join(distT, u), 'utf8');
	test('VIP con «ocultar precio»: el precio no sale en ninguna página, catálogo ni archivo', () => {
		assert.deepEqual(todo.filter((f) => /987[,.]?654|876[,.]?543|988 mil|987k|7\.6 millones/.test(readFileSync(f, 'utf8'))).map((f) => path.relative(distT, f)), []);
		assert.ok(!readdirSync(path.join(distT, 'propiedad')).some((d) => /876543/.test(d)), 'la URL no lleva el precio');
		assert.match(corrida.stderr, new RegExp(`Precio oculto escrito en sus textos[^\\n]*${oculta.id}`));
		assert.ok(todo.some((f) => path.relative(distT, f).startsWith('vip' + path.sep) && /Por solo precio a consultar/.test(readFileSync(f, 'utf8'))), 'la página VIP cambia el monto por «precio a consultar»');
	});
	test('casa de prueba: su ficha abre pero no se indexa ni va al sitemap, llms.txt ni los catálogos', () => {
		assert.match(leerT('propiedad/casa-de-prueba-monterrico/index.html'), /<meta name="robots" content="noindex/);
		// No salió del botón «Casas de prueba»: el build avisa por si es una casa real.
		assert.match(corrida.stderr, /Se tratan como casas de prueba[^\n]*«Casa de PRUEBA Monterrico»/);
		for (const f of ['sitemap.xml', 'llms.txt', 'llms-full.txt']) assert.doesNotMatch(leerT(f), /casa-de-prueba-monterrico|test-house-in-monterrico/, f);
		assert.ok(!todo.filter((f) => path.relative(distT, f).startsWith('feeds')).some((f) => /casa-de-prueba-monterrico/.test(readFileSync(f, 'utf8'))));
		// Ni en listados, portada ni «similares» de otras fichas: solo su propia ficha (y la suya en inglés) la nombran.
		const laNombran = todo.filter((f) => f.endsWith('.html') && !/casa-de-prueba-monterrico|test-house-in-monterrico/.test(f) && /casa-de-prueba-monterrico|test-house-in-monterrico/.test(readFileSync(f, 'utf8')));
		assert.deepEqual(laNombran.map((f) => path.relative(distT, f)), []);
		// Tampoco en la lista que lee Google (ItemList) de ningún listado.
		const listas = todo.filter((f) => f.endsWith('.html')).map((f) => readFileSync(f, 'utf8')).flatMap((h) => [...h.matchAll(/<script type="application\/ld\+json">([^<]*"ItemList"[^<]*)<\/script>/g)].map((m) => m[1]));
		assert.ok(listas.length > 0);
		assert.ok(listas.every((j) => !/casa-de-prueba-monterrico/.test(j)), 'ninguna ItemList lleva la casa de prueba');
	});
	const repetidosT = await (await import('./lib/enlaces.mjs')).repetidosSeo(distT);
	test('ninguna página que Google indexa repite el título o la descripción de otra (el build lo avisa)', () => {
		assert.deepEqual(repetidosT, []);
	});
	test('inglés: no se pierde la amenidad que el diccionario no tiene', () => {
		const ficha = todo.find((f) => path.relative(distT, f).startsWith(path.join('en', 'property')) && /Lobby de recepción/.test(readFileSync(f, 'utf8')));
		assert.ok(ficha, 'la ficha en inglés muestra «Lobby de recepción»');
		assert.match(readFileSync(ficha, 'utf8'), /Pool[\s\S]*Agua municipal/);
	});
	test('zona escrita distinto: una sola página de zona con todas sus casas', () => {
		const h = leerT('propiedades/zona-10/index.html');
		assert.doesNotMatch(h, /<meta name="robots" content="noindex/);
		assert.equal((h.match(/class="property-item"/g) || []).length, 6);
		assert.doesNotMatch(leerT('propiedades/index.html'), />zona 10/);
	});
	test('dos casas con el mismo título en inglés: la dirección anterior de la segunda lleva a la segunda', () => {
		const r = leerT('_redirects').split('\n').find((l) => l.startsWith('/en/property/old-title-of-the-second/ '));
		assert.ok(r, 'falta la redirección');
		assert.match(r, new RegExp(`-${b.id.slice(0, 8)}/ 301$`));
	});
}

test('tarjetas: la foto no es un segundo enlace para el lector de pantalla (el título ya cubre la tarjeta)', () => {
	const h = html['/propiedades/'];
	const fotos = h.match(/<a [^>]*class="img"[^>]*>/g) || [];
	assert.ok(fotos.length > 0);
	for (const a of fotos) assert.match(a, /tabindex="-1" aria-hidden="true"/);
});

test('formularios: la trampa para bots no se parece a nada que el autollenado del navegador llene', () => {
	// Un campo oculto que el autollenado reconoce (empresa, company, website…) se llena solo y el envío del cliente se pierde.
	const autollenado = /compan|empresa|organi|business|web|url|site|address|direcc|email|correo|phone|tel|name|nombre|city|ciudad|zip|postal/i;
	let n = 0;
	for (const [u, h] of Object.entries(html)) {
		for (const m of h.matchAll(/<div class="hp-field"[^>]*><label>([^<]*)<input name="([^"]+)"/g)) {
			n++;
			assert.doesNotMatch(m[1] + ' ' + m[2], autollenado, `${u}: «${m[1]}» / ${m[2]}`);
		}
	}
	assert.ok(n > 0, 'no hay formularios con trampa');
});

if (!process.env.GUARDAR) rmSync(tmp, { recursive: true, force: true });
console.log(`${ok} pruebas del sitio generado pasan${process.exitCode ? ' (con fallas)' : ''}.`);
