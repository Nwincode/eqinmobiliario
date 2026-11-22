// Pruebas de admin/js/rutas.js: las direcciones que una página de contenido no puede usar (una sola lista para el
// panel y el generador, en los dos idiomas) y dónde sale una página con nombre reservado.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RUTAS, RESERVADAS, reservada, urlPagina, redireccionesPaginas } from '../admin/js/rutas.js';
import { RUTAS as RUTAS_SITIO } from './lib/i18n.mjs';
import { slugify as slugSitio } from './lib/util.mjs';
import { slugify } from '../admin/js/formato.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };

t('el generador usa las mismas rutas que el panel', () => assert.equal(RUTAS_SITIO, RUTAS));

t('cada carpeta de las rutas del sitio está reservada en su idioma', () => {
	for (const lang of ['es', 'en']) {
		for (const r of Object.values(RUTAS[lang])) {
			const carpeta = r.replace(lang === 'en' ? /^\/en\// : /^\//, '').split(/[/#]/)[0];
			if (carpeta) assert.ok(reservada(carpeta, lang), `${lang}: ${carpeta}`);
		}
	}
});

t('inglés: «properties», «luxury», «owners» y «rental-calculator» no se pueden usar (antes tapaban el listado)', () => {
	for (const s of ['properties', 'luxury', 'owners', 'rental-calculator', 'property', 'blog']) assert.ok(reservada(s, 'en'), s);
	assert.equal(urlPagina('properties', 'en'), '/en/pagina/properties/');
	assert.equal(urlPagina('about-us', 'en'), '/en/about-us/');
});

t('español: «en», «propietarios», «calculadora-de-renta», «reserva», «api», «feeds» y «docs» están reservadas', () => {
	for (const s of ['en', 'propietarios', 'calculadora-de-renta', 'reserva', 'api', 'feeds', 'docs', 'pagina', 'admin']) assert.ok(reservada(s, 'es'), s);
	assert.equal(urlPagina('en'), '/pagina/en/');
	assert.equal(urlPagina('calculadora-de-renta'), '/pagina/calculadora-de-renta/');
	assert.equal(urlPagina('privacidad'), '/privacidad/');
	// Una palabra en español no es reservada en inglés (y al revés).
	assert.ok(!reservada('propiedades', 'en'));
	assert.ok(!reservada('properties', 'es'));
});

t('una sola slugify en el panel y el sitio', () => {
	assert.equal(slugSitio, slugify);
	assert.equal(slugify('  Términos y Condiciones! '), 'terminos-y-condiciones');
	assert.equal(slugify('Ñandú Zona 10'), 'nandu-zona-10');
});

t('el panel no tiene otra lista (pages.js usa rutas.js)', () => {
	const pages = readFileSync(new URL('../admin/js/views/pages.js', import.meta.url), 'utf8');
	assert.match(pages, /from '\.\.\/rutas\.js'/);
	assert.doesNotMatch(pages, /RESERVED/);
	assert.equal(RESERVADAS.es.size > 10, true);
});

t('una página que pasó a /pagina/ redirige su dirección de antes, nunca encima de una página del sitio', () => {
	const pag = (slug, idioma) => ({ slug, idioma, url: urlPagina(slug, idioma) });
	const escritas = new Set(['/', '/en/', '/en/properties/', '/propietarios/', '/reserva/']);
	const r = redireccionesPaginas([pag('docs'), pag('feeds'), pag('en'), pag('propietarios'), pag('privacidad'), pag('properties', 'en'), pag('luxury', 'en')], escritas);
	assert.deepEqual(r, [['/docs/', '/pagina/docs/'], ['/feeds/', '/pagina/feeds/'], ['/en/luxury/', '/en/pagina/luxury/']]);
});

t('al cambiarle el nombre a una página, su dirección de antes (también /pagina/x/) lleva a la nueva', () => {
	const p = { slug: 'documentos', idioma: 'es', url: urlPagina('documentos'), urlsAnteriores: ['/pagina/docs/', '/viejo/', 'javascript:alert(1)', '/privacidad/'] };
	assert.deepEqual(redireccionesPaginas([p], new Set(['/privacidad/'])), [['/pagina/docs/', '/documentos/'], ['/viejo/', '/documentos/']]);
	assert.match(readFileSync(new URL('../admin/js/views/pages.js', import.meta.url), 'utf8'), /d\.urlsAnteriores = /);
});

console.log(`\n${ok} pruebas de rutas pasan.`);
