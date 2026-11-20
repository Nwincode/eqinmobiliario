// Pruebas de lo que el build revisa antes de publicar (scripts/lib/antes-de-publicar.mjs): casas y ajustes mal
// formados no detienen la publicación, y un catálogo vacío o que perdió más de la mitad no se publica.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { problemaDeCasa, casasSanas, ajustesSanos, fichasEnSitemap, revisarCatalogo, FORZAR } from './lib/antes-de-publicar.mjs';
import { deepMerge } from './lib/util.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0;
const t = (nombre, fn) => { try { fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${err.stack}`); process.exitCode = 1; } };

const casa = (extra = {}) => ({ id: 'c1', titulo: 'Casa', fotos: [{ url: '/a.webp' }], amenidades: ['Piscina'], ...extra });
const MALAS = {
	'foto-texto': { fotos: 'https://x/y.jpg' },
	'foto-nula': { fotos: [null] },
	'foto-sin-url': { fotos: [{ url: 5 }] },
	'amenidades-texto': { amenidades: 'piscina' },
	'vacacional-texto': { operacion: 'vacacional', vacacional: 'x' },
	'reservadas-mapa': { operacion: 'vacacional', vacacional: { reservadas: { a: 1 } } },
	'bloqueos-texto': { operacion: 'vacacional', vacacional: { bloqueos: 'x' } },
	'tarifa-nula': { operacion: 'vacacional', vacacional: { tarifas: [null] } },
	'minimos-numero': { operacion: 'vacacional', vacacional: { minimos: 5 } },
	'puntos-texto': { vip: true, vipLanding: { puntosClave: 'x' } },
	'en-amenidades': { en: { titulo: 'House', descripcion: 'x', amenidades: 'pool' } },
	'zona-numero': { zona: 5 },
	'video-objeto': { video: { a: 1 } }
};

t('una casa bien formada pasa (y lo que antes se publicaba: título numérico, precio en texto, seo o en de otra forma)', () => {
	assert.equal(problemaDeCasa(casa()), '');
	assert.equal(problemaDeCasa(casa({ titulo: 12345, precio: 'Q.5,000', seo: 'x', en: 'x', vipLanding: 'x', slugsAnteriores: 'x', fotos: [{}], amenidades: [5] })), '');
	assert.equal(problemaDeCasa(casa({ operacion: 'venta', vacacional: 'x' })), '', 'vacacional solo cuenta en una casa por noche');
	assert.equal(problemaDeCasa(casa({ operacion: 'vacacional', vacacional: { reservadas: [{ desde: '2026-12-01', hasta: '2026-12-03' }], tarifas: [] } })), '');
});

t('cada forma equivocada se reconoce y el aviso nombra la casa y el dato', () => {
	for (const [id, extra] of Object.entries(MALAS)) assert.notEqual(problemaDeCasa(casa({ id, ...extra })), '', id);
	const avisos = [];
	const quedan = casasSanas([casa({ id: 'buena' }), casa({ id: 'mala', fotos: 'x' }), null], (m) => avisos.push(m));
	assert.deepEqual(quedan.map((p) => p.id), ['buena']);
	assert.equal(avisos.length, 2);
	assert.match(avisos[0], /«mala».*fotos/);
});

t('ajustes: lo que falta o viene con otra forma queda vacío, y el nombre del sitio nunca falta', () => {
	const avisos = [];
	const s = ajustesSanos({ general: null, contacto: 'x', seo: { redirecciones: 'x' }, hero: { imagenes: [null, '/a.webp'] }, zonas: [null, { nombre: 'Zona 10' }], en: 'x' }, 'https://eqinmobiliario.gt', (m) => avisos.push(m));
	assert.deepEqual(s.contacto, {});
	assert.deepEqual(s.seo.redirecciones, []);
	assert.deepEqual(s.hero.imagenes, ['/a.webp']);
	assert.deepEqual(s.zonas, [{ nombre: 'Zona 10' }]);
	assert.equal(s.general.nombre, 'eqinmobiliario.gt');
	assert.ok(!('en' in s), 'un «en» que no es grupo no enciende el sitio en inglés');
	assert.ok(avisos.some((m) => /contacto/.test(m)) && avisos.some((m) => /nombre del sitio/.test(m)));
});

t('deepMerge: un dato con otra forma no reemplaza el del ejemplo', () => {
	const m = deepMerge({ contacto: { telefono: '1' }, navegacion: [{ a: 1 }], general: { nombre: 'EQ' } }, { contacto: 'x', navegacion: 'y', general: { nombre: 'Nuevo' } });
	assert.deepEqual(m, { contacto: { telefono: '1' }, navegacion: [{ a: 1 }], general: { nombre: 'Nuevo' } });
});

t('fichas del sitemap publicado: /propiedad/… y /vip/…, no el listado /vip/ ni las de inglés', () => {
	const B = 'https://eqinmobiliario.gt';
	const xml = ['/', '/vip/', '/vip/casa-a/', '/propiedad/casa-b/', '/propiedad/casa-c/', '/en/property/house-b/', '/propiedades/venta/'].map((u) => `<url><loc>${B}${u}</loc></url>`).join('');
	assert.equal(fichasEnSitemap(xml, B), 3);
	assert.equal(fichasEnSitemap('', B), 0);
});

t('catálogo: vacío o con más de la mitad menos no se publica; con la variable, sí', () => {
	assert.match(revisarCatalogo({ ahora: 0 }), /No hay ninguna propiedad/);
	assert.match(revisarCatalogo({ ahora: 0, antes: null }), new RegExp(FORZAR));
	assert.match(revisarCatalogo({ ahora: 4, antes: 10 }), /Se publicarían 4 propiedades y el sitio tiene 10/);
	assert.equal(revisarCatalogo({ ahora: 5, antes: 10 }), '', 'la mitad exacta todavía se publica');
	assert.equal(revisarCatalogo({ ahora: 12, antes: 10 }), '');
	assert.equal(revisarCatalogo({ ahora: 3, antes: null }), '', 'sin sitemap publicado solo se frena el vacío');
	assert.equal(revisarCatalogo({ ahora: 0, antes: 10, forzar: true }), '');
});

// El build de verdad (DATOS=seed): todas las casas malas y los ajustes rotos en un solo sitio; y uno vacío.
const tmp = mkdtempSync(path.join(tmpdir(), 'eq-antes-'));
const seedBase = JSON.parse(readFileSync(path.join(ROOT, 'data/seed.json'), 'utf8'));
const construir = (seed, extraEnv = {}) => {
	const file = path.join(tmp, `seed-${Math.random().toString(36).slice(2)}.json`), dist = path.join(tmp, path.basename(file, '.json'));
	writeFileSync(file, JSON.stringify(seed));
	const env = { ...process.env, DATOS: 'seed', SEED_FILE: file, DIST_DIR: dist };
	delete env.NETLIFY; delete env.CONTEXT;
	Object.assign(env, extraEnv);
	const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env, encoding: 'utf8' });
	return { ok: r.status === 0, out: r.stdout + r.stderr, dist };
};
{
	const seed = structuredClone(seedBase);
	const buena = seed.properties.find((p) => p.publicado);
	seed.properties.push(...Object.entries(MALAS).map(([id, extra]) => ({ ...structuredClone(buena), id, slug: id, publicado: true, ...extra })));
	delete seed.settings.contacto; seed.settings.general = null; seed.settings.seo = 'x';
	const r = construir(seed);
	t('build con casas y ajustes mal formados: publica las buenas y avisa cada id', () => {
		assert.ok(r.ok, r.out.slice(-400));
		for (const id of Object.keys(MALAS)) assert.match(r.out, new RegExp(`No se publica la casa «${id}»`));
		assert.ok(existsSync(path.join(r.dist, 'propiedad', buena.slug, 'index.html')));
		assert.ok(!existsSync(path.join(r.dist, 'propiedad', 'foto-texto')));
		// Lo que faltaba en settings/site sale de data/seed.json.
		assert.match(readFileSync(path.join(r.dist, 'index.html'), 'utf8'), new RegExp(seedBase.settings.general.nombreCorto));
	});
}
{
	const seed = structuredClone(seedBase);
	seed.properties.forEach((p) => { p.publicado = false; });
	const r = construir(seed);
	t('build sin ninguna casa publicada: no publica y explica cómo forzarlo', () => {
		assert.equal(r.ok, false);
		assert.match(r.out, /No hay ninguna propiedad para publicar/);
		assert.match(r.out, new RegExp(`${FORZAR}=1`));
		assert.ok(!existsSync(r.dist), 'no se borró ni escribió nada en la carpeta de salida');
	});
	t('build sin casas con la variable puesta: publica', () => assert.ok(construir(seed, { [FORZAR]: '1' }).ok));
}
{
	// Publicación en Netlify: el sitemap en línea se simula (fetch de mentira, sin red) con 10 fichas y con 3.
	const enLinea = (n) => {
		const f = path.join(tmp, `en-linea-${n}.mjs`);
		const xml = `<urlset>${Array.from({ length: n }, (_, i) => `<url><loc>https://eqinmobiliario.gt/propiedad/casa-${i}/</loc></url>`).join('')}<url><loc>https://eqinmobiliario.gt/vip/</loc></url></urlset>`;
		writeFileSync(f, `globalThis.fetch = async () => new Response(${JSON.stringify(xml)});\n`);
		return f;
	};
	const publicadas = seedBase.properties.filter((p) => p.publicado).length;
	const r = construir(seedBase, { NETLIFY: 'true', NODE_OPTIONS: `--import=${enLinea(10)}` });
	t('Netlify: con menos de la mitad de las fichas del sitio en línea, no publica', () => {
		assert.equal(r.ok, false, r.out.slice(-300));
		assert.match(r.out, new RegExp(`Se publicarían ${publicadas} propiedades y el sitio tiene 10`));
	});
	t('Netlify: con una caída menor a la mitad, publica (y IndexNow compara con ese sitemap)', () => {
		const b = construir(seedBase, { NETLIFY: 'true', NODE_OPTIONS: `--import=${enLinea(publicadas + 1)}` });
		assert.ok(b.ok, b.out.slice(-300));
		assert.ok(JSON.parse(readFileSync(path.join(b.dist, 'feeds', 'indexnow.json'), 'utf8')).urls.includes('https://eqinmobiliario.gt/propiedad/casa-0/'));
	});
}
rmSync(tmp, { recursive: true, force: true });
console.log(`${ok} pruebas de lo que se revisa antes de publicar pasan${process.exitCode ? ' (con fallas)' : ''}.`);
