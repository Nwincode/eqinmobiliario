// Lo que scripts/build.mjs revisa de los datos antes de publicar. Sin red ni archivos: lo prueba
// scripts/test-antes-de-publicar.mjs.
//  - casasSanas: una casa con un dato de forma equivocada (fotos como texto, una foto vacía, `reservadas` como
//    mapa…, escrita a mano en la consola o por una importación vieja) se deja fuera y se avisa con su id; las demás
//    se publican. Antes, una sola detenía toda publicación con un error que no decía cuál era.
//  - ajustesSanos: lo que falta o viene mal en settings/site toma el valor de data/seed.json, o queda vacío.
//  - revisarCatalogo: no se publica un catálogo vacío ni uno que perdió más de la mitad de las casas contra el
//    sitemap publicado (una base borrada o despublicada de golpe sacaría todas las fichas de Google e IndexNow).
import { isPlainObject } from './util.mjs';
import { RUTAS } from './i18n.mjs';
import { urlsDelSitemap } from '../../netlify/lib/indexnow.mjs';

// Variable de entorno para publicar a propósito un catálogo mucho más chico (se pone en Netlify para un build y se quita).
export const FORZAR = 'PUBLICAR_CATALOGO_REDUCIDO';
// Más de esta parte de las casas que se pierde de una publicación a otra detiene el build.
export const CAIDA_MAXIMA = 0.5;

const esTexto = (v) => typeof v === 'string';
const esTitulo = (v) => v == null || esTexto(v) || typeof v === 'number';
const listaDe = (v, item) => v == null || (Array.isArray(v) && v.every(item));
const objeto = (v) => v == null || isPlainObject(v);
const foto = (f) => isPlainObject(f) && esTexto(f.url);
const rango = (x) => isPlainObject(x);

// Qué tiene mal una casa (texto para el aviso) o '' si se puede publicar.
export function problemaDeCasa(p) {
	if (!isPlainObject(p)) return 'no es un documento';
	if (!esTexto(p.id) || !p.id) return 'sin id';
	const v = p.vacacional, en = p.en;
	const revisiones = [
		[esTitulo(p.titulo), 'titulo'],
		[esTitulo(p.slug), 'slug'],
		[listaDe(p.fotos, foto), 'fotos (una lista de fotos, cada una con su url)'],
		[listaDe(p.amenidades, esTexto), 'amenidades (una lista de textos)'],
		[listaDe(p.slugsAnteriores, esTexto), 'slugsAnteriores'],
		[objeto(p.seo), 'seo'],
		[objeto(p.vipLanding) && listaDe(p.vipLanding?.puntosClave, esTexto), 'vipLanding'],
		[objeto(en), 'en'],
		[!isPlainObject(en) || (listaDe(en.amenidades, esTexto) && listaDe(en.slugsAnteriores, esTexto) && objeto(en.seo) && objeto(en.vacacional) && objeto(en.vipLanding)), 'en (traducción)'],
		[objeto(v), 'vacacional'],
		...['tarifas', 'minimos', 'bloqueos', 'reservadas'].map((k) => [!isPlainObject(v) || listaDe(v[k], rango), `vacacional.${k} (una lista de fechas)`])
	];
	return revisiones.filter(([ok]) => !ok).map(([, campo]) => campo).join(', ');
}

// Las casas que se pueden publicar; de las otras, un aviso con su id y el dato que falla.
export function casasSanas(lista, avisar = console.warn) {
	return (lista || []).filter((p) => {
		const mal = problemaDeCasa(p);
		if (mal) avisar(`  ⚠ No se publica la casa «${p?.id || '?'}»: tiene mal ${mal}. Corrígela en el panel (o en la base) y vuelve a publicar.`);
		return !mal;
	});
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

// Cuántas fichas de casas (en español) tiene un sitemap: /propiedad/… y /vip/… (no el listado /vip/).
export function fichasEnSitemap(xml, siteUrl) {
	const base = String(siteUrl).replace(/\/$/, '');
	const { ficha, fichaVip } = RUTAS.es;
	return urlsDelSitemap(xml, siteUrl).map((u) => u.slice(base.length))
		.filter((p) => [ficha, fichaVip].some((r) => p.startsWith(r) && p.length > r.length)).length;
}

// Error (texto) si no se debe publicar; '' si se puede. `antes`: fichas del sitemap publicado (null si no se pudo leer).
export function revisarCatalogo({ ahora, antes = null, forzar = false }) {
	if (forzar) return '';
	const como = `Si es a propósito, publica una vez con la variable ${FORZAR}=1 en Netlify (Site configuration → Environment variables) y quítala después.`;
	if (!ahora) return `No hay ninguna propiedad para publicar: no se publica (el sitio anterior sigue en línea). Revisa en el panel que las propiedades sigan guardadas y marcadas como publicadas. ${como}`;
	if (antes && ahora < antes * (1 - CAIDA_MAXIMA)) return `Se publicarían ${ahora} propiedades y el sitio tiene ${antes}: se perdería más de la mitad y no se publica (el sitio anterior sigue en línea). Revisa en el panel que no se hayan borrado o despublicado casas por error. ${como}`;
	return '';
}
