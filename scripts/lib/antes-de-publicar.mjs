// Lo que scripts/build.mjs revisa de los datos antes de publicar. Sin red ni archivos: lo prueba
// scripts/test-antes-de-publicar.mjs.
//  - separarCasas: una casa con un dato de forma equivocada (fotos como texto, una foto vacía, `reservadas` como
//    mapa…, escrita a mano en la consola o por una importación vieja) sale de listados, sitemap y catálogos y se avisa
//    con su id; las demás se publican. Antes, una sola detenía toda publicación con un error que no decía cuál era.
//    `casaReparada` le quita lo roto para que su enlace siga abriendo (sin indexar; Publicar, en el panel, la lista).
//  - ajustesSanos: lo que falta o viene mal en settings/site toma el valor de data/seed.json, o queda vacío.
//  - revisarCatalogo: no se publica un catálogo vacío ni uno que perdió más de la mitad de las casas contra el
//    sitemap publicado (una base borrada o despublicada de golpe sacaría todas las fichas de Google e IndexNow).
//    Una vez, a propósito: Publicar → «Publicar aunque baje» en el panel (`forzarCatalogo` en meta/publish).
import { isPlainObject } from './util.mjs';
import { RUTAS } from './i18n.mjs';
import { urlsDelSitemap } from '../../netlify/lib/indexnow.mjs';

// Variable de entorno de antes para saltar el freno. Sigue sirviendo, pero cada build que la ve lo avisa: lo de siempre
// es el botón del panel, que vale para un solo build.
export const FORZAR = 'PUBLICAR_CATALOGO_REDUCIDO';
// Más de esta parte de las casas que se pierde de una publicación a otra detiene el build…
export const CAIDA_MAXIMA = 0.5;
// …si el sitio tenía al menos tantas fichas o se pierden más de tantas (en un catálogo chico, unas pocas son la mitad).
export const MINIMO_ANTES = 10;
export const MAXIMO_PERDIDAS = 5;

const esTexto = (v) => typeof v === 'string';
const texto = (v) => v == null || esTexto(v);
const lista = (v, item = () => true) => v == null || (Array.isArray(v) && v.every(item));
const grupo = (v) => isPlainObject(v);
// Una foto puede venir sin url (no se muestra), pero no vacía ni con una url que no es texto.
const foto = (f) => grupo(f) && texto(f.url);

// Qué tiene mal una casa (texto para el aviso) o '' si se puede publicar. Solo lo que rompe la publicación o
// mostraría mal la casa: lo demás (un título numérico, un precio en texto) se publica como antes.
export function problemaDeCasa(p) {
	if (!grupo(p)) return 'no es un documento';
	if (!esTexto(p.id) || !p.id) return 'sin id';
	const v = p.vacacional, en = p.en;
	const revisiones = [
		[lista(p.fotos, foto), 'fotos (una lista de fotos, cada una con su url)'],
		[lista(p.amenidades), 'amenidades (una lista)'],
		[texto(p.zona), 'zona'],
		[texto(p.video), 'video'],
		[!grupo(p.vipLanding) || lista(p.vipLanding.puntosClave), 'vipLanding.puntosClave (una lista)'],
		[!grupo(en) || !en.amenidades || lista(en.amenidades), 'en.amenidades (una lista)'],
		// Una casa por noche sin su calendario se vería libre todos los días: no se publica.
		[p.operacion !== 'vacacional' || v == null || grupo(v), 'vacacional'],
		...['tarifas', 'minimos', 'bloqueos', 'reservadas'].map((k) => [p.operacion !== 'vacacional' || !grupo(v) || lista(v[k], grupo), `vacacional.${k} (una lista de fechas)`])
	];
	return revisiones.filter(([ok]) => !ok).map(([, campo]) => campo).join(', ');
}

// Las casas que se pueden publicar y las que no ({ casa, motivo }), con un aviso por cada una.
export function separarCasas(lista, avisar = console.warn) {
	const sanas = [], omitidas = [];
	for (const p of lista || []) {
		const motivo = problemaDeCasa(p);
		if (!motivo) { sanas.push(p); continue; }
		avisar(`  ⚠ La casa «${p?.id || '?'}» sale de listados, sitemap y catálogos: tiene mal ${motivo}. Corrígela en el panel y vuelve a publicar.`);
		omitidas.push({ casa: p, motivo });
	}
	return { sanas, omitidas };
}

// Una casa omitida sin lo que tiene roto, para que su enlace siga abriendo. `sinCalendario`: casa por noche cuyo calendario
// no se puede leer; se muestra sin reservar (con él se vería libre o con otro precio).
export function casaReparada(p) {
	if (!isPlainObject(p) || !esTexto(p.id) || !p.id) return null;
	const c = { ...p };
	c.fotos = Array.isArray(p.fotos) ? p.fotos.filter(foto) : [];
	if (!Array.isArray(p.amenidades)) c.amenidades = [];
	for (const k of ['zona', 'video']) if (!texto(p[k])) c[k] = '';
	if (isPlainObject(p.vipLanding) && !lista(p.vipLanding.puntosClave)) c.vipLanding = { ...p.vipLanding, puntosClave: [] };
	if (isPlainObject(p.en) && p.en.amenidades && !lista(p.en.amenidades)) c.en = { ...p.en, amenidades: [] };
	const v = p.vacacional;
	const sinCalendario = p.operacion === 'vacacional' && v != null
		&& (!grupo(v) || ['tarifas', 'minimos', 'bloqueos', 'reservadas'].some((k) => !lista(v[k], grupo)));
	if (sinCalendario) c.vacacional = {};
	return { casa: c, sinCalendario, motivo: problemaDeCasa(c) };
}

// Partes de settings/site que las plantillas leen sin revisar: si no vienen como deben, quedan vacías.
const OBJETOS = ['general', 'seo', 'contacto', 'tracking', 'hero', 'redes', 'footer', 'listados', 'whatsappFlotante', 'destacadas', 'testimonios', 'servicios', 'contadores', 'asesores', 'calculadora', 'bloqueExterior', 'ia'];
const LISTAS = [['navegacion'], ['zonas'], ['seo', 'redirecciones'], ['hero', 'imagenes']];

// settings/site ya mezclado con data/seed.json (deepMerge): lo que aún falta o vino de otra forma se arregla aquí,
// con aviso. El nombre del sitio, si no está en ningún lado, es el dominio.
export function ajustesSanos(site, siteUrl = '', avisar = console.warn) {
	const s = isPlainObject(site) ? { ...site } : {};
	for (const k of OBJETOS) {
		if (!isPlainObject(s[k])) {
			if (s[k] != null) avisar(`  ⚠ settings/site: «${k}» no tiene la forma esperada; se usa vacío.`);
			s[k] = {};
		}
	}
	for (const ruta of LISTAS) {
		const padre = ruta.length > 1 ? (s[ruta[0]] = { ...s[ruta[0]] }) : s;
		const k = ruta.at(-1);
		if (padre[k] != null && !Array.isArray(padre[k])) avisar(`  ⚠ settings/site: «${ruta.join('.')}» no es una lista; se ignora.`);
		padre[k] = Array.isArray(padre[k]) ? padre[k].filter((x) => x != null && (k === 'imagenes' ? esTexto(x) || isPlainObject(x) : isPlainObject(x))) : [];
	}
	const g = s.general;
	const dominio = String(siteUrl).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
	if (!g.nombre || !g.nombreCorto) {
		avisar('  ⚠ settings/site: falta el nombre del sitio (Contenido → General).');
		s.general = { ...g, nombre: g.nombre || g.nombreCorto || dominio, nombreCorto: g.nombreCorto || g.nombre || dominio };
	}
	if (!isPlainObject(s.textos)) s.textos = {};
	// Sin «en» como grupo no hay sitio en inglés (un texto ahí no lo enciende).
	if (s.en != null && !isPlainObject(s.en)) delete s.en;
	return s;
}

// Cuántas fichas de casas (en español) tiene un sitemap: /propiedad/… y /vip/… (no el listado /vip/). `excluir`: slugs
// que no cuentan (las casas de prueba).
export function fichasEnSitemap(xml, siteUrl, excluir = new Set()) {
	const base = String(siteUrl).replace(/\/$/, '');
	const { ficha, fichaVip } = RUTAS.es;
	return urlsDelSitemap(xml, siteUrl).map((u) => u.slice(base.length)).filter((p) => {
		const r = [ficha, fichaVip].find((x) => p.startsWith(x) && p.length > x.length);
		return r && !excluir.has(p.slice(r.length).replace(/\/$/, ''));
	}).length;
}

// Por qué no se publica (una línea, la que muestra Publicar en el panel) o '' si se puede. `ahora`: casas que se
// ofrecerían (sin las de prueba); `antes`: fichas del sitemap publicado (null si no se pudo leer).
export function revisarCatalogo({ ahora, antes = null, forzar = false }) {
	if (forzar) return '';
	if (!ahora) return 'No hay ninguna propiedad publicada: se frenó para no dejar el sitio sin casas.';
	const perdidas = antes ? antes - ahora : 0;
	if (perdidas > 0 && ahora < antes * (1 - CAIDA_MAXIMA) && (antes >= MINIMO_ANTES || perdidas > MAXIMO_PERDIDAS)) {
		return `Se publicarían ${ahora} de las ${antes} propiedades del sitio: se frenó por si se borraron o despublicaron por error.`;
	}
	return '';
}
