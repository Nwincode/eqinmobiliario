// Plantillas HTML del sitio público. Cada función devuelve un string.
import {
	esc, formatPrice, TIPOS, ESTADOS, plural, lugarDe, truncate, markdown, stripMarkdown, resumenSeo,
	videoEmbedUrl, mapEmbedUrl, whatsappLink, cifra, departamentoDe
} from './util.mjs';
import { buscar, paginaDeZona, zonasHermanas, padres, nombreTipo } from './landings.mjs';
import { TEXTOS, RUTAS, TIPOS_EN, ESTADOS_EN, M2_A_FT2, M2_A_V2, fmt, textosCliente } from './i18n.mjs';
import { cssTema, colorTema } from '../../admin/js/tema-def.js';
import { estadoDe } from '../../admin/js/estados.js';
import { CODIGOS_PAIS } from '../../admin/js/formato.js';
import { autoSeoTitle as autoSeoTitleBase, autoSeoDescripcion, huespedesDe } from '../../admin/js/seo-auto.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Motor de la calculadora de renta (script clásico js/calc-renta.js): el mismo que usa el navegador.
const EQRenta = (() => {
	const sandbox = { module: { exports: {} }, Intl };
	vm.runInNewContext(readFileSync(new URL('../../js/calc-renta.js', import.meta.url), 'utf8'), sandbox);
	return sandbox.module.exports;
})();

// Idioma: ctx.lang ('es' por defecto); las propiedades traducidas llevan p._lang = 'en'.
const tr = (ctx) => TEXTOS[(ctx && ctx.lang) || 'es'];
// Ícono decorativo (el texto de al lado ya dice lo mismo). `fin` = va después del texto (flechas).
const ic = (nombre, fin = false) => `<span class="icon-${nombre} eq-ic${fin ? ' eq-ic-fin' : ''}" aria-hidden="true"></span>`;
// Flechas de carrusel (regla «Botones de carrusel»): solo el chevrón fino, sin texto;
// el nombre para lectores de pantalla va en aria-label. tiny-slider toma el 1.º y 2.º hijo.
const chevron = (d) => `<svg class="eq-flecha-ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const FLECHA_PREV = 'M14.5 5.5 8 12l6.5 6.5';
const FLECHA_NEXT = 'M9.5 5.5 16 12l-6.5 6.5';
// Teléfono del sitio como enlace tel: (vacío si no hay).
const telLink = (ctx) => { const n = String(ctx.site.contacto.telefono || '').replace(/[^\d+]/g, ''); return n ? `tel:${n}` : ''; };
const flechasCarrusel = (id, t, extra = '') => `<div id="${id}" class="eq-flechas" role="group" aria-label="${esc(t.navCarrusel)}"${extra}>
	<button type="button" class="eq-flecha eq-flecha-prev" data-controls="prev" aria-label="${esc(t.anterior)}">${chevron(FLECHA_PREV)}</button>
	<button type="button" class="eq-flecha eq-flecha-next" data-controls="next" aria-label="${esc(t.siguiente)}">${chevron(FLECHA_NEXT)}</button>
</div>`;
const rt = (ctx) => RUTAS[(ctx && ctx.lang) || 'es'];
// Enlaces según lo que existe (scripts/lib/landings.mjs crearEnlaces): un listado vacío no se enlaza y un enlace
// del contenido a un listado que no existe va a su padre. Sin plan (pruebas sueltas), todo queda igual.
const visible = (ctx, href) => !ctx.enlaces || ctx.enlaces.visible(href);
const md = (ctx, texto) => markdown(texto, ctx.enlaces ? ctx.enlaces.resolver : null);
const lng = (p) => p._lang || 'es';
const price = (p) => formatPrice(p.precio, p.moneda, p.operacion, lng(p));

// Precio rebajado: el último cambio de precio (misma moneda) fue una baja hace 60 días o menos.
// Sale del historial de precio que guarda el panel. Devuelve el precio anterior o 0.
const DIAS_REBAJA = 60;
export function precioAnterior(p, hoy = Date.now()) {
	if (!p || !Number(p.precio) || p.operacion === 'vacacional' || (p.estado && p.estado !== 'disponible')) return 0;
	if (p.vipLanding && p.vipLanding.ocultarPrecio) return 0;
	const h = (p.historialPrecio || []).filter((x) => x && Number(x.precio));
	if (h.length < 2) return 0;
	const ultimo = h[h.length - 1];
	const previo = h[h.length - 2];
	if (Number(ultimo.precio) !== Number(p.precio) || (ultimo.moneda || 'USD') !== (p.moneda || 'USD') || (previo.moneda || 'USD') !== (p.moneda || 'USD')) return 0;
	if (Number(previo.precio) <= Number(p.precio)) return 0;
	const f = Date.parse(ultimo.fecha);
	if (!f || hoy - f > DIAS_REBAJA * 864e5) return 0;
	return Number(previo.precio);
}
const precioAntes = (p) => {
	const a = precioAnterior(p);
	return a ? `<s class="precio-antes"><em class="visually-hidden">${TEXTOS[lng(p)].antes}: </em>${esc(formatPrice(a, p.moneda, p.operacion, lng(p)))}</s>` : '';
};
// Etiqueta de la operación: «En venta», «En renta» o «Renta vacacional».
// Casas por noche: la dirección y el mapa exactos no se publican (solo la zona); se dan al confirmar la reserva.
const porNoche = (p) => p.operacion === 'vacacional';
// Ancla del cuadro de reserva de la ficha vacacional.
const RESERVA = '#vac-titulo';
const enOperacion = (p, t) => (p.operacion === 'vacacional' ? t.enVacacional : p.operacion === 'renta' ? t.enRenta : t.enVenta);
const opNombre = (p, t) => (p.operacion === 'vacacional' ? t.vacacional : p.operacion === 'renta' ? t.renta : t.venta);
const tipoLabel = (p) => (lng(p) === 'en' ? TIPOS_EN[p.tipo] : TIPOS[p.tipo]) || p.tipo;
const estadoLabel = (p) => (lng(p) === 'en' ? ESTADOS_EN[p.estado] : ESTADOS[p.estado]) || p.estado;
// Superficie: m² en español; pies cuadrados (con m²) en inglés.
const area = (m2, lang) => (lang === 'en'
	? `${Math.round(m2 * M2_A_FT2).toLocaleString('en-US')} sq ft (${cifra(m2)} m²)`
	: `${cifra(m2)} m²`);
// Terreno: en Guatemala se habla en varas cuadradas (v²); en inglés, pies cuadrados.
const areaTerreno = (m2, lang) => (lang === 'en' ? area(m2, lang) : `${cifra(Math.round(m2 * M2_A_V2))} v² (${cifra(m2)} m²)`);

export function propertyUrl(p) {
	const r = RUTAS[lng(p)];
	return `${p.vip ? r.fichaVip : r.ficha}${p.slug}/`;
}

function absUrl(ctx, path) {
	if (!path) return '';
	if (/^https?:\/\//.test(path)) return path;
	return ctx.siteUrl.replace(/\/$/, '') + (path.startsWith('/') ? path : `/${path}`);
}

function firstPhoto(p) {
	return (p.fotos && p.fotos[0] && p.fotos[0].url) || '/images/hero_bg_1.webp';
}

// Ancho en pantalla de una tarjeta de propiedad y de cada foto de la galería de la ficha
// (css/site.css: .ficha-galeria-N). En celular la galería es un carrusel a todo el ancho.
const SIZES_TARJETA = '(max-width: 767px) 100vw, (max-width: 991px) 50vw, 33vw';
function sizesGaleria(n, i) {
	const [principal, resto] = n <= 1 ? [100] : n <= 3 ? [67, 33] : [50, 25];
	return `(max-width: 767px) 100vw, ${i ? resto : principal}vw`;
}

function photoAlt(p, i = 0) {
	const foto = p.fotos && p.fotos[i];
	return (foto && foto.alt) || `${p.titulo} – ${lng(p) === 'en' ? 'photo' : 'foto'} ${i + 1}`;
}

// Fondo con variante liviana para celulares cuando existe (/images/x-800.webp).
function bgStyle(ctx, url) {
	const mobile = ctx.mobileVariant(url);
	return `--bg:url('${esc(url)}')${mobile ? `;--bg-m:url('${esc(mobile)}')` : ''}`;
}

// CDN de imágenes de Netlify (netlify.toml → [images]): sirve una foto a otro ancho o formato.
export const fotoCdn = (u, w, extra = '') => `/.netlify/images?url=${encodeURIComponent(u)}&w=${w}${extra}`;

// Foto de Firebase Storage a un ancho menor. Solo en Netlify: fuera de ahí el CDN no existe
// y la foto se sirve tal cual (null).
export function fotoAncho(url, w) {
	return process.env.NETLIFY === 'true' && /^https:\/\/firebasestorage\.googleapis\.com\//.test(url || '') ? fotoCdn(url, w) : null;
}

// Versiones reducidas de una foto; vacío si la foto no pasa por el CDN.
function fotoSrcset(url, anchos = [480, 800, 1200]) {
	return anchos.map((w) => [fotoAncho(url, w), w]).filter(([u]) => u).map(([u, w]) => `${u} ${w}w`).join(', ');
}

// Atributos srcset/sizes de un <img>; `sizes` es el ancho que ocupa en pantalla.
function fotoAttrs(url, sizes, anchos) {
	const set = fotoSrcset(url, anchos);
	return set ? ` srcset="${esc(set)}" sizes="${sizes}"` : '';
}

// `sizes`: la imagen es un <img> con srcset y la precarga tiene que pedir la misma versión.
function preloadTags(ctx, url, sizes) {
	if (!url) return '';
	const set = sizes && fotoSrcset(url);
	if (set) return `<link rel="preload" as="image" href="${esc(url)}" imagesrcset="${esc(set)}" imagesizes="${sizes}" fetchpriority="high">`;
	const mobile = ctx.mobileVariant(url);
	if (!mobile) return `<link rel="preload" as="image" href="${esc(url)}" fetchpriority="high">`;
	return `<link rel="preload" as="image" href="${esc(mobile)}" media="(max-width: 800px)" fetchpriority="high">
	<link rel="preload" as="image" href="${esc(url)}" media="(min-width: 801px)" fetchpriority="high">`;
}

function jsonLd(data) {
	return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function breadcrumbLd(ctx, items) {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((it, i) => ({
			'@type': 'ListItem', position: i + 1, name: it.name, item: absUrl(ctx, it.url)
		}))
	};
}

function trackingHead(site) {
	const { gtmId, pixelId, ga4Id, adsId } = site.tracking || {};
	let out = '';
	// Google Analytics 4 y Google Ads comparten la misma etiqueta (gtag.js).
	const gtagIds = [ga4Id, adsId].filter(Boolean);
	if (gtagIds.length) {
		out += `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(gtagIds[0])}"></script>\n`;
		out += `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${gtagIds.map((id) => `gtag('config',${JSON.stringify(id)}${/^AW-/.test(id) ? ',{allow_enhanced_conversions:true}' : ''});`).join('')}</script>\n`;
	}
	if (gtmId) {
		out += `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(gtmId)});</script>\n`;
	}
	if (pixelId) {
		out += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/es_LA/fbevents.js');fbq('init',${JSON.stringify(pixelId)});fbq('track','PageView');</script>\n`;
	}
	return out;
}

function trackingBody(site) {
	const { gtmId, pixelId } = site.tracking || {};
	let out = '';
	if (gtmId) out += `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${esc(gtmId)}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n`;
	if (pixelId) out += `<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${esc(pixelId)}&ev=PageView&noscript=1"></noscript>\n`;
	return out;
}

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&display=swap';

function head(ctx, page) {
	const site = ctx.site;
	// Google corta los títulos de más de ~60 caracteres: si sobra, se quita el nombre de la marca del final.
	let title = page.title || site.seo.titulo;
	while (title.length > 60 && title.includes(' | ')) title = title.slice(0, title.lastIndexOf(' | '));
	const description = truncate(page.description || site.seo.descripcion, 160);
	const image = absUrl(ctx, page.image || site.seo.imagen);
	const url = absUrl(ctx, page.path);
	const seo = site.seo || {};
	const noindex = page.noindex || ctx.noindex;
	return `<!doctype html>
<html lang="${tr(ctx).htmlLang}">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${esc(title)}</title>
	<meta name="description" content="${esc(description)}">
	${site.seo.keywords ? `<meta name="keywords" content="${esc(site.seo.keywords)}">` : ''}
	<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}">
	${seo.googleVerification ? `<meta name="google-site-verification" content="${esc(seo.googleVerification)}">` : ''}
	${seo.bingVerification ? `<meta name="msvalidate.01" content="${esc(seo.bingVerification)}">` : ''}
	<link rel="canonical" href="${esc(url)}">
	<link rel="icon" href="${esc(site.general.favicon || '/favicon.png')}">
	<link rel="apple-touch-icon" href="/apple-touch-icon.png">
	<meta property="og:locale" content="${tr(ctx).ogLocale}">
	${Object.entries(page.alternates || {}).map(([l, u]) => `<link rel="alternate" hreflang="${l}" href="${esc(absUrl(ctx, u))}">`).join('\n\t')}
	${page.alternates && page.alternates.es ? `<link rel="alternate" hreflang="x-default" href="${esc(absUrl(ctx, page.alternates.es))}">` : ''}
	<meta property="og:site_name" content="${esc(site.general.nombre)}">
	<meta property="og:type" content="${esc(page.ogType || 'website')}">
	<meta property="og:title" content="${esc(title)}">
	<meta property="og:description" content="${esc(description)}">
	<meta property="og:url" content="${esc(url)}">
	<meta property="og:image" content="${esc(image)}">
	<meta name="twitter:card" content="summary_large_image">
	<meta name="twitter:title" content="${esc(title)}">
	<meta name="twitter:description" content="${esc(description)}">
	<meta name="twitter:image" content="${esc(image)}">
	<meta name="theme-color" content="${colorTema(site.tema, 'dark')}">
	${preloadTags(ctx, page.preloadImage, page.preloadSizes)}
	<link rel="stylesheet" href="__CSS_BUNDLE__">
	${page.noReferrer ? '<meta name="referrer" content="no-referrer">' : ''}
	${(page.extraCss || []).map((h) => `<link rel="stylesheet" href="${esc(h)}">`).join('\n\t')}
	${cssTema(site.tema) ? `<style id="eq-tema">${cssTema(site.tema)}</style>` : ''}
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link rel="preload" as="style" href="${FONTS_URL}" onload="this.onload=null;this.rel='stylesheet'">
	<noscript><link rel="stylesheet" href="${FONTS_URL}"></noscript>
	${page.sinRastreo ? '' : trackingHead(site)}
	${(page.jsonLd || []).map(jsonLd).join('\n\t')}
	<script>window.EQ_CONFIG=${JSON.stringify({ ...ctx.publicConfig, t: textosCliente(ctx.lang || 'es') }).replace(/</g, '\\u003c')};</script>
</head>`;
}

function nav(ctx, active) {
	const site = ctx.site;
	const hasVip = visible(ctx, rt(ctx).vip) && ctx.properties.some((p) => p.vip);
	// El enlace de contacto se muestra como el botón de acción de la barra.
	const items = (site.navegacion || []).filter((it) => visible(ctx, it.enlace)).map((it) => {
		const cls = [it.enlace === active ? 'active' : '', /#conta/.test(it.enlace || '') ? 'nav-cta' : '', it.enlace === rt(ctx).inicio ? 'nav-home' : ''].filter(Boolean).join(' ');
		const icono = /#conta/.test(it.enlace || '') ? ic('comments') : '';
		return `<li${cls ? ` class="${cls}"` : ''}><a href="${esc(it.enlace)}"${it.enlace === active ? ' aria-current="page"' : ''}>${icono}${esc(it.texto)}</a></li>`;
	});
	const t = tr(ctx);
	const r = rt(ctx);
	const propActive = active && active.startsWith(r.propiedades) ? ' active' : '';
	const propMenu = `<li class="has-children${propActive}">
								<a href="${r.propiedades}">${t.propiedades}</a>
								<ul class="dropdown">
									${operaciones(ctx).map((a) => `<li>${a}</li>`).join('')}
									${hasVip ? `<li><a href="${r.vip}">${ic('diamond')}${t.propiedadesVip}</a></li>` : ''}
									<li><a href="${r.propiedades}">${ic('th-large')}${t.verTodas}</a></li>
								</ul>
							</li>`;
	items.splice(Math.min(1, items.length), 0, propMenu);
	// Selector de idioma segmentado: el idioma actual queda marcado y el otro enlaza a la página equivalente.
	// Va fuera del menú para que en el celular se vea siempre junto a las tres rayas.
	let langSwitch = '';
	const cta = items.findIndex((it) => it.includes('nav-cta'));
	const ctaItem = cta >= 0 ? items.splice(cta, 1)[0] : '';
	if (ctx.altLang) {
		const otro = `<a href="${esc(ctx.altLang(active))}" hreflang="${ctx.lang === 'en' ? 'es' : 'en'}" lang="${ctx.lang === 'en' ? 'es' : 'en'}" aria-label="${t.otroIdiomaLabel}">${t.otroIdioma}</a>`;
		const actual = `<span aria-current="true">${ctx.lang === 'en' ? 'EN' : 'ES'}</span>`;
		langSwitch = `<div class="lang-switch">${ctx.lang === 'en' ? otro + actual : actual + otro}</div>`;
	}
	if (ctaItem) items.push(ctaItem);
	return `<div class="site-mobile-menu site-navbar-target">
		<div class="site-mobile-menu-header">
			<div class="site-mobile-menu-close">
				<span class="icofont-close js-menu-toggle"></span>
			</div>
		</div>
		<div class="site-mobile-menu-body"></div>
	</div>

	<nav class="site-nav" aria-label="${ctx.lang === 'en' ? 'Main' : 'Principal'}">
		${ctx.lang !== 'en' && ctx.altLang ? `<div class="aviso-idioma" hidden>${ic('globe')}<a href="${esc(ctx.altLang(active))}" hreflang="en" lang="en">View this site in English</a><button type="button" class="btn btn-ico" aria-label="${t.cerrarAviso}">${ic('close')}</button></div>` : ''}
		<div class="container">
			<div class="menu-bg-wrap">
				<a href="${rt(ctx).inicio}" class="logo nav-brand">${site.general.logoMenu
					? `<img class="nav-logo-img" src="${esc(site.general.logoMenu)}" alt="${esc(site.general.nombre)}" height="40">`
					: `<svg class="nav-mark" viewBox="0 0 110 110" aria-hidden="true"><g transform="translate(-49.847218,-93.347217)"><path class="nav-mark-aro" d="m 0,0 c -74.439,0 -135,-60.561 -135,-135 0,-74.439 60.561,-135 135,-135 74.439,0 135,60.561 135,135 C 135,-60.561 74.439,0 0,0 m 0,-280 c -79.953,0 -145,65.047 -145,145 0,79.953 65.047,145 145,145 79.953,0 145,-65.047 145,-145 0,-79.953 -65.047,-145 -145,-145" transform="matrix(0.35172414,0,0,-0.35172414,104.84722,100.86446)"/><path class="nav-mark-casa" d="m 0,0 -21.857,-0.254 c -1.469,-0.017 -2.65,-1.212 -2.65,-2.681 V -53.64 c 0,-4.451 -3.608,-8.058 -8.058,-8.058 h -50.297 l -0.017,50.26 c 0,4.977 -2.021,9.489 -5.281,12.75 -3.26,3.265 -7.766,5.28 -12.749,5.286 -9.953,-0.006 -18.023,-8.077 -18.023,-18.036 l 0.042,-50.26 h -50.266 c -4.454,0 -8.064,3.61 -8.064,8.064 V -2.94 c 0,1.468 -1.181,2.664 -2.65,2.68 L -201.913,0 c -9.213,0 -13.529,11.699 -6.776,17.963 l 100.777,93.524 c 3.958,3.672 10.085,3.672 14.048,0 l 37.125,-34.639 -0.018,5.054 c -0.012,3.486 2.81,6.318 6.296,6.318 h 19.618 c 3.487,0 6.306,-2.825 6.3,-6.306 L -24.585,46.768 6.908,17.963 C 13.667,11.699 9.22,0 0,0" transform="matrix(0.35239486,0,0,-0.35239486,140.40585,157.60516)"/></g></svg><span>${esc(site.general.nombre.replace(/\s*S\.A\.?$/i, ""))}</span>`}</a>
				<div class="site-navigation">
					<ul class="js-clone-nav d-none d-lg-flex site-menu">
						${items.join('\n\t\t\t\t\t\t')}
					</ul>
					${langSwitch}
					<a href="#" class="burger light site-menu-toggle js-menu-toggle d-inline-block d-lg-none" aria-label="${tr(ctx).abrirMenu}">
						<span></span>
					</a>
				</div>
			</div>
		</div>
	</nav>`;
}

// Nombre legal de la empresa: sale en el pie y en el copyright.
const EMPRESA = 'Equipo Inmobiliario S.A.';

function footer(ctx) {
	const site = ctx.site;
	const t = tr(ctx);
	const c = site.contacto || {};
	const r = site.redes || {};
	const todos = (site.footer.enlaces || []).map((l) => [l.enlace, l.texto]);
	if (ctx.posts.length) todos.push([rt(ctx).blog, t.blog]);
	ctx.pages.filter((p) => p.enFooter).forEach((p) => todos.push([p.url, p.titulo]));
	todos.push([rt(ctx).calculadora, t.rentaLink]);
	// Sin listados vacíos (Propiedades en renta sin casas, VIP sin propiedades) y un solo enlace por destino.
	const links = todos.filter(([url], i) => url && visible(ctx, url) && todos.findIndex(([u]) => u === url) === i);
	const boton = ([href, icono, nombre]) => href
		? `<a class="btn btn-outline-light btn-ico" href="${esc(href)}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''} aria-label="${nombre}">${ic(icono)}</a>` : '';
	const botones = [
		[whatsappLink(c.whatsapp, site.whatsappFlotante && site.whatsappFlotante.mensaje), 'whatsapp', 'WhatsApp'],
		[c.telefono && `tel:${c.telefono.replace(/[^\d+]/g, '')}`, 'phone', t.llamar],
		[c.email && `mailto:${c.email}`, 'envelope-o', t.correoBtn],
		[r.instagram, 'instagram', 'Instagram'],
		[r.facebook, 'facebook', 'Facebook'],
		[r.linkedin, 'linkedin', 'LinkedIn'],
		[r.youtube, 'youtube-play', 'YouTube'],
		[r.tiktok, 'play', 'TikTok']
	].map(boton).join('');
	return `<footer class="pie">
		<div class="container">
			<p class="pie-nombre">${EMPRESA}</p>
			${site.footer.texto ? `<p>${esc(site.footer.texto)}</p>` : ''}
			<nav class="pie-enlaces" aria-label="${t.enlaces}">
				${links.map(([url, texto]) => `<a href="${esc(url)}">${esc(texto)}</a>`).join('')}
			</nav>
			<div class="pie-botones">${botones}</div>
			${c.direccion || c.horario ? `<p class="pie-datos">${[c.direccion, c.horario].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
			<p class="pie-legal">&copy; ${new Date().getFullYear()} ${EMPRESA}${site.footer.mostrarCredito === false ? '' : ` · ${t.plantilla} <a href="https://untree.co" rel="noopener">Untree.co</a>`}</p>
		</div>
	</footer>`;
}

// «reserva»: en la ficha de renta vacacional lleva al cuadro de reserva, para que toda consulta quede registrada.
function whatsappFloat(ctx, mensaje, reserva = false) {
	const site = ctx.site;
	if (!site.whatsappFlotante || !site.whatsappFlotante.visible) return '';
	if (reserva) return `<a href="${RESERVA}" class="wa-float" aria-label="${tr(ctx).vacReservar}"><span class="icon-whatsapp"></span></a>`;
	const wa = whatsappLink(site.contacto.whatsapp, mensaje || site.whatsappFlotante.mensaje);
	if (!wa) return '';
	return `<a href="${esc(wa)}" class="wa-float" target="_blank" rel="noopener" aria-label="${tr(ctx).escribenos}" data-track="Contact"><span class="icon-whatsapp"></span></a>`;
}

function scripts(extra = '') {
	return `<script src="__JS_BUNDLE__" defer></script>
	${extra}`;
}

function layout(ctx, page, body) {
	const bodyAttrs = page.bodyAttrs ? ` ${page.bodyAttrs}` : '';
	// La imagen de portada (LCP) se precarga aunque la página no la indique.
	if (!page.preloadImage) {
		const hero = /--bg:url\('([^']+)'\)/.exec(body);
		if (hero) page = { ...page, preloadImage: hero[1] };
	}
	return `${head(ctx, page)}
<body${bodyAttrs}>
	${page.sinRastreo ? '' : trackingBody(ctx.site)}
	${page.bare ? '' : nav(ctx, page.path)}
	${body}
	${page.bare ? '' : footer(ctx)}
	${page.sinFlotante ? '' : whatsappFloat(ctx, page.waMensaje, page.waReserva)}
	${scripts(page.extraJs)}
</body>
</html>
`;
}

function pageHero(ctx, title, image, crumbs) {
	return `<div class="hero page-inner overlay" style="${bgStyle(ctx, image)}">
		<div class="container">
			<div class="row justify-content-center align-items-center">
				<div class="col-lg-9 text-center mt-5">
					<h1 class="heading">${esc(title)}</h1>
					<nav aria-label="breadcrumb">
						<ol class="breadcrumb text-center justify-content-center">
							${crumbs.map((c, i) => i === crumbs.length - 1
								? `<li class="breadcrumb-item active text-white-50" aria-current="page">${esc(c.name)}</li>`
								: `<li class="breadcrumb-item"><a href="${esc(c.url)}">${i === 0 ? ic('home') : ''}${esc(c.name)}</a></li>`).join('')}
						</ol>
					</nav>
				</div>
			</div>
		</div>
	</div>`;
}

// Datos cortos de la tarjeta: "3 hab · 4 baños · 2 parq." (o el área si no hay habitaciones).
function specs(p) {
	const t = TEXTOS[lng(p)];
	const dato = (icono, valor, nombre) => (valor ? `<span class="prop-dato">${ic(icono)}${esc(valor)}<span class="visually-hidden"> ${esc(nombre)}</span></span>` : '');
	return dato('bed', p.habitaciones, t.fHabitaciones) + dato('users', vacacionalVisible(p) && datosVacacional(p).huespedesMax, t.fHuespedesMax) + dato('bath', p.banos, t.fBanos) + dato('car', p.parqueos, t.fParqueos)
		// Construcción y terreno, los dos cuando existen (en una casa el terreno pesa tanto como lo construido).
		+ dato('construccion', p.m2Construccion && area(p.m2Construccion, lng(p)), t.fConstruccion) + dato('terreno', p.m2Terreno && areaTerreno(p.m2Terreno, lng(p)), t.fTerreno);
}

// Clases completas (el CSS se depura buscando estos nombres tal cual).
const CLASE_ESTADO = {
	proximamente: 'prop-badge-estado-proximamente',
	reservada: 'prop-badge-estado-reservada',
	vendida: 'prop-badge-estado-cerrada',
	rentada: 'prop-badge-estado-cerrada'
};

function estadoBadge(p, inline = false) {
	const parts = [];
	if (p.vip) parts.push('<span class="prop-badge prop-badge-vip">VIP</span>');
	const t = TEXTOS[lng(p)];
	if (precioAnterior(p)) parts.push(`<span class="prop-badge prop-badge-rebaja">${t.precioRebajado}</span>`);
	parts.push(`<span class="prop-badge">${enOperacion(p, t)}</span>`);
	if (p.estado && p.estado !== 'disponible') parts.push(`<span class="prop-badge prop-badge-estado ${CLASE_ESTADO[p.estado] || ''}">${esc(estadoLabel(p))}</span>`);
	return `<div class="prop-badges${inline ? ' prop-badges-inline' : ''}">${parts.join('')}</div>`;
}

export function propertyCard(p, { lazy = true, unaFoto = false } = {}) {
	const url = propertyUrl(p);
	const data = [
		['operacion', p.operacion], ['tipo', p.tipo], ['zona', p.zona], ['precio', p.precio || 0],
		['habitaciones', p.habitaciones || 0], ['fecha', p.fechaOrden || 0],
		['texto', `${p.titulo} ${p.zona} ${p.ciudad} ${porNoche(p) ? '' : p.direccion} ${tipoLabel(p)}`.toLowerCase()],
		...(vacacionalVisible(p) ? [['vac', JSON.stringify((({ bloqueos, huespedesMax, nochesMin, minimos, plan, limpieza }) => ({ bloqueos, huespedesMax, nochesMin, minimos, plan, limpieza, moneda: p.moneda || 'USD' }))(datosVacacional(p)))]] : [])
	].map(([k, v]) => `data-${k}="${esc(v ?? '')}"`).join(' ');
	const t = TEXTOS[lng(p)];
	// Hasta 8 fotos por tarjeta; solo la primera se descarga, el resto al primer gesto (js/site.js).
	// En la portada va una sola: ahí las flechas mueven el carrusel de tarjetas, no las fotos.
	const fotos = (p.fotos || []).filter((f) => f && f.url).slice(0, unaFoto ? 1 : 8);
	const varias = fotos.length > 1;
	return `<div class="property-item" ${data}>
								<div class="prop-fotos"${varias ? ` role="group" aria-label="${esc(`${t.galeriaFotos}: ${p.titulo}`)}"` : ''}>
									<a href="${url}" class="img" tabindex="-1">
										<img src="${esc(firstPhoto(p))}" alt="${esc(photoAlt(p))}" class="img-fluid"${fotoAttrs(firstPhoto(p), SIZES_TARJETA, [480, 800])}${lazy ? ' loading="lazy"' : ''} width="800" height="600">
										${fotos.slice(1).map((f, i) => `<img data-src="${esc(fotoAncho(f.url, 800) || f.url)}" alt="${esc(photoAlt(p, i + 1))}" class="img-fluid" width="800" height="600">`).join('')}
									</a>
									${estadoBadge(p)}
									${varias ? `<button type="button" class="eq-flecha eq-flecha-sobre eq-flecha-prev" aria-label="${t.anteriorFoto}">${chevron(FLECHA_PREV)}</button>
									<button type="button" class="eq-flecha eq-flecha-sobre eq-flecha-next" aria-label="${t.siguienteFoto}">${chevron(FLECHA_NEXT)}</button>
									<span class="foto-contador" aria-hidden="true">1 / ${fotos.length}</span>` : ''}
								</div>
								<div class="property-content">
									<span class="prop-etiqueta">${esc([tipoLabel(p), p.zona || p.ciudad].filter(Boolean).join(' · '))}</span>
									<a href="${url}" class="prop-titulo stretched-link">${esc(p.titulo)}</a>
									<div class="prop-pie">
										<div class="price"><span>${esc(price(p))}</span>${precioAntes(p)}</div>
										<span class="prop-datos">${specs(p)}</span>
									</div>
								</div>
							</div>`;
}

export function leadForm({ origen, property = null, agentId = '', titulo = '', boton = '', dark = false, visita = false, corto = false, lang = 'es', mensaje = '', icono = 'paper-plane' }) {
	const t = TEXTOS[lang];
	const pid = property ? property.id : '';
	const ptitle = property ? property.titulo : '';
	const msg = mensaje === false ? '' : mensaje || (property ? fmt(t.msgInteres, { titulo: property.titulo }) : '');
	return `<form class="lead-form${dark ? ' lead-form-dark' : ''}" data-origen="${esc(origen)}" data-property-id="${esc(pid)}" data-property-titulo="${esc(ptitle)}" data-agent-id="${esc(agentId)}"${property && property.propietarioId ? ` data-propietario-id="${esc(property.propietarioId)}"` : ''} data-lang="${lang}" novalidate>
		${titulo ? `<h2 class="h5 mb-3">${ic(visita ? 'calendar' : 'comments')}${esc(titulo)}</h2>` : ''}
		<div class="mb-3"><label class="form-label" for="lf-nombre-${esc(origen)}">${t.nombre} *</label><input id="lf-nombre-${esc(origen)}" class="form-control" name="nombre" required maxlength="100" autocomplete="name"></div>
		<div class="mb-3"><label class="form-label" for="lf-tel-${esc(origen)}">${t.telefono} *</label>
			<div class="input-group">
				<select class="form-select lf-codigo" name="codigo" aria-label="${t.codigoPais}" autocomplete="tel-country-code">${CODIGOS_PAIS.map(([c, pais]) => `<option value="${c}"${c === (lang === 'en' ? '1' : '502') ? ' selected' : ''}>+${c} ${pais}</option>`).join('')}</select>
				<input id="lf-tel-${esc(origen)}" class="form-control" name="telefono" type="tel" inputmode="tel" required maxlength="24" autocomplete="tel-national"${t.telefonoPh ? ` placeholder="${t.telefonoPh}"` : ''}>
			</div></div>
		${origen === 'reserva' ? `<div class="mb-3"><label class="form-label" for="lf-email-reserva">${t.vacCorreo} *</label><input id="lf-email-reserva" class="form-control" name="email" type="email" required maxlength="120" autocomplete="email"></div>` : ''}
		${mensaje === false ? '' : visita
		// Agendar visita: solo lo necesario; el mensaje va listo y oculto.
		? `<input type="hidden" name="mensaje" value="${esc(msg)}">`
		: corto
		? `<div class="mb-3"><label class="form-label" for="lf-msg-${esc(origen)}">${t.vendeQue}</label><input id="lf-msg-${esc(origen)}" class="form-control" name="mensaje" maxlength="200" placeholder="${t.vendeQuePh}"></div>`
		: `<div class="mb-3"><label class="form-label" for="lf-email-${esc(origen)}">${t.correo}</label><input id="lf-email-${esc(origen)}" class="form-control" name="email" type="email" maxlength="120" autocomplete="email"></div>
		<div class="mb-3"><label class="form-label" for="lf-msg-${esc(origen)}">${t.mensaje}</label><textarea id="lf-msg-${esc(origen)}" class="form-control" name="mensaje" rows="3" maxlength="2000">${esc(msg)}</textarea></div>`}
		${visita ? `<div class="row g-2 mb-3">
			<div class="col-sm-6"><label class="form-label" for="lf-tipo-${esc(origen)}">${t.tipoVisita}</label><select id="lf-tipo-${esc(origen)}" class="form-select" name="tipoVisita"><option value="presencial">${t.presencial}</option><option value="videollamada"${lang === 'en' ? ' selected' : ''}>${t.videollamada}</option></select></div>
			<div class="col-sm-6"><label class="form-label" for="lf-fecha-${esc(origen)}">${t.fechaVisita}</label><input id="lf-fecha-${esc(origen)}" class="form-control" name="fechaVisita" type="date"></div>
		</div>` : ''}
		<div class="hp-field" aria-hidden="true"><label>${t.empresa}<input name="empresa" tabindex="-1" autocomplete="off"></label></div>
		<div class="text-end"><button type="submit" class="btn btn-primary">${ic(icono)}${esc(boton || t.enviar)}</button></div>
		<div class="lead-form-status mt-3" role="status" aria-live="polite"></div>
	</form>`;
}

function agentBox(ctx, agent, property) {
	if (!agent) return '';
	const t = tr(ctx);
	const msg = property ? fmt(t.msgAsesor, { nombre: agent.nombre, titulo: property.titulo }) : '';
	const wa = whatsappLink(agent.whatsapp || ctx.site.contacto.whatsapp, msg);
	return `<div class="d-block agent-box p-4">
						<div class="img mb-3"><img src="${esc(agent.foto || '/images/person_1-min.webp')}" alt="${esc(agent.nombre)}" class="img-fluid" loading="lazy" width="80" height="80"></div>
						<div class="text">
							<h3 class="mb-0">${esc(agent.nombre)}</h3>
							<div class="meta mb-3">${esc(agent.cargo || t.asesorInmobiliario)}</div>
							${agent.bio ? `<p>${esc(agent.bio)}</p>` : ''}
							<ul class="list-unstyled d-flex flex-wrap gap-2 mb-0">
								${wa ? `<li><a href="${esc(wa)}" class="btn btn-success btn-ico" target="_blank" rel="noopener" data-track="Contact" aria-label="WhatsApp">${ic('whatsapp')}</a></li>` : ''}
								${agent.email ? `<li><a href="mailto:${esc(agent.email)}" class="btn btn-outline-primary btn-ico" data-track="Contact" aria-label="${t.correoBtn}">${ic('envelope-o')}</a></li>` : ''}
							</ul>
						</div>
					</div>`;
}

// Bloque para compradores que viven fuera de Guatemala (diáspora y estadounidenses).
function bloqueExterior(ctx) {
	const b = ctx.site.bloqueExterior;
	if (!b || !b.visible) return '';
	return `<div class="section exterior-block">
		<div class="container">
			<div class="row align-items-center g-4">
				<div class="col-lg-6">
					<span class="exterior-kicker">${ic('plane')}${esc(b.etiqueta || '')}</span>
					<h2 class="font-weight-bold heading text-primary mb-3">${esc(b.titulo)}</h2>
					<p class="text-black-50 mb-4">${esc(b.texto)}</p>
					${b.enlace ? `<a href="${esc(b.enlace)}" class="btn btn-primary btn-lg">${ic('globe')}${esc(b.boton)}</a>` : ''}
				</div>
				<div class="col-lg-6">
					<ul class="exterior-list">${(b.puntos || []).map((pt) => `<li><span class="icon-check"></span>${esc(pt)}</li>`).join('')}</ul>
				</div>
			</div>
		</div>
	</div>`;
}

// ---------------------------------------------------------------- Inicio

export function homePage(ctx) {
	const s = ctx.site;
	const t = tr(ctx);
	const r = rt(ctx);
	const destacadas = ctx.properties.filter((p) => p.destacada);
	const slider = destacadas.length ? destacadas : ctx.properties.slice(0, 8);
	const heroImgs = (s.hero.imagenes || []).filter(Boolean);
	const orgLd = {
		'@context': 'https://schema.org',
		'@type': 'RealEstateAgent',
		'@id': orgId(ctx),
		name: s.general.nombre,
		alternateName: s.general.nombreCorto || undefined,
		url: absUrl(ctx, r.inicio),
		logo: absUrl(ctx, s.general.logoGoogle || '/logo-equipo-inmobiliario.png'),
		areaServed: { '@type': 'Country', name: 'Guatemala' },
		knowsLanguage: ['es', 'en'],
		image: absUrl(ctx, s.seo.imagen),
		telephone: s.contacto.telefono || undefined,
		email: s.contacto.email || undefined,
		address: { '@type': 'PostalAddress', streetAddress: s.contacto.direccion || undefined, addressLocality: 'Guatemala', addressCountry: 'GT' },
		geo: geoDe(s.contacto.mapa),
		hasMap: s.tracking && s.tracking.googleBusinessUrl ? s.tracking.googleBusinessUrl : undefined,
		contactPoint: s.contacto.telefono ? { '@type': 'ContactPoint', telephone: s.contacto.telefono, contactType: 'sales', availableLanguage: ['Spanish', 'English'], areaServed: ['GT', 'US'] } : undefined,
		sameAs: [...Object.values(s.redes || {}), s.tracking && s.tracking.googleBusinessUrl].filter(Boolean)
	};
	const webLd = {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: s.general.nombre,
		url: absUrl(ctx, r.inicio),
		inLanguage: t.htmlLang,
		potentialAction: {
			'@type': 'SearchAction',
			target: `${absUrl(ctx, r.propiedades)}?q={search_term_string}`,
			'query-input': 'required name=search_term_string'
		}
	};

	const body = `
	<div class="hero">
		<div class="hero-slide">
			${heroImgs.map((img, i) => `<div class="img overlay" ${i ? 'data-bg' : 'style'}="${bgStyle(ctx, img)}"></div>`).join('\n\t\t\t')}
		</div>
		<div class="container">
			<div class="row justify-content-center align-items-center">
				<div class="col-lg-9 text-center">
					<h1 class="heading">${esc(s.hero.titulo)}</h1>
					<form action="${r.propiedades}" method="get" class="narrow-w form-search d-flex align-items-stretch mb-3" role="search">
						<label class="visually-hidden" for="hero-q">${t.buscarPropiedades}</label>
						<input id="hero-q" type="search" name="q" autocomplete="off" class="form-control px-4" placeholder="${esc(s.hero.placeholderBusqueda)}">
						<button type="submit" class="btn btn-primary">${ic('search')}${t.buscar}</button>
					</form>
				</div>
			</div>
		</div>
	</div>

	${slider.length ? `<div class="section">
		<div class="container">
			<div class="row mb-4 align-items-center">
				<div class="col">
					<h2 class="font-weight-bold text-primary heading mb-0">${esc(s.destacadas.titulo)}</h2>
				</div>
			</div>
			<div class="row">
				<div class="col-12">
					${slider.length <= 3 ? `<div class="row justify-content-center g-4 propiedades-pocas">
						${slider.map((p) => `<div class="col-md-6 col-lg-4">${propertyCard(p, { unaFoto: true })}</div>`).join('\n')}
					</div>` : `<div class="property-slider-wrap">
						<div class="property-slider">
							${slider.map((p) => propertyCard(p, { unaFoto: true })).join('\n')}
						</div>
						${flechasCarrusel('property-nav', t)}
					</div>`}
				</div>
			</div>
			<p class="text-center mt-4 mb-0"><a href="${r.propiedades}" class="btn btn-primary">${esc(s.destacadas.boton)}${ic('arrow-right', true)}</a></p>
		</div>
	</div>` : ''}

	${s.features.visible ? `<section class="features-1">
		<div class="container">
			<div class="row g-3 g-lg-4">
				${(s.features.items || []).map((f, i) => `<div class="col-6 col-lg-3" data-aos="fade-up" data-aos-delay="${300 + i * 100}">
					<div class="box-feature">
						<span class="${esc(f.icono || 'flaticon-house')}"></span>
						<h3 class="mb-3">${esc(f.titulo)}</h3>
						<p>${esc(f.texto)}</p>
						${f.enlace ? `<p><a href="${esc(f.enlace)}" class="learn-more">${t.masInfo}<span class="visually-hidden"> ${t.sobre} ${esc(f.titulo)}</span>${ic('arrow-right', true)}</a></p>` : ''}
					</div>
				</div>`).join('\n')}
			</div>
		</div>
	</section>` : ''}

	${s.testimonios.visible && (ctx.testimonials.length || s.testimonios.google) ? `<div class="section sec-testimonials">
		<div class="container">
			<div class="row mb-4 align-items-center">
				<div class="col">
					<h2 class="font-weight-bold heading text-primary mb-0">${esc(s.testimonios.titulo)}</h2>
				</div>
				<div class="col-auto">
					${flechasCarrusel('testimonial-nav', t, ctx.testimonials.length ? '' : ' hidden')}
				</div>
			</div>
			${s.testimonios.google ? `<div id="resenas-google" class="resenas-google" hidden data-lang="${ctx.lang || 'es'}" data-titulo="${esc(t.resenasGoogle)}" data-ver="${esc(t.verEnGoogle)}" data-dejar="${esc(t.dejarResena)}" data-total="${esc(t.resenasTotal)}" data-estrellas="${esc(t.deEstrellas)}" data-basado="${esc(t.basadoEn)}" data-mas="${esc(t.leerMas)}" data-menos="${esc(t.leerMenos)}" data-ver-resena="${esc(t.verResena)}" data-publicada="${esc(t.publicadaEn)}" data-anonimo="${esc(t.anonimo)}"></div>` : ''}
			${ctx.testimonials.length || s.testimonios.google ? `<div class="testimonial-slider-wrap">
				<div class="testimonial-slider">
					${ctx.testimonials.map((tm) => `<div class="item">
						<div class="testimonial">
							${tm.foto ? `<img src="${esc(tm.foto)}" alt="${esc(tm.nombre)}" class="img-fluid rounded-circle w-25 mb-4" loading="lazy" width="120" height="120">` : ''}
							<div class="rate" role="img" aria-label="${esc(tm.estrellas || 5)} ${t.deEstrellas}">
								${'<span class="icon-star text-warning"></span>'.repeat(Math.max(1, Math.min(5, Number(tm.estrellas) || 5)))}
							</div>
							<h3 class="h5 text-primary mb-4">${esc(tm.nombre)}</h3>
							<blockquote><p>&ldquo;${esc(tm.texto)}&rdquo;</p></blockquote>
							<p class="text-black-50">${esc(tm.rol)}</p>
						</div>
					</div>`).join('\n')}
				</div>
			</div>` : ''}
		</div>
	</div>` : ''}

	${s.servicios.visible ? `<div id="servicios" class="section section-4 bg-light">
		<div class="container">
			<div class="row justify-content-center text-center mb-4">
				<div class="col-lg-5">
					<h2 class="font-weight-bold heading text-primary mb-3">${esc(s.servicios.titulo)}</h2>
					<p class="text-black-50 mb-0">${esc(s.servicios.subtitulo)}</p>
				</div>
			</div>
			<div class="row justify-content-between">
				<div class="col-lg-7 mb-4 mb-lg-0 order-lg-2">
					<div class="img-about dots">
						<img src="${esc(s.servicios.imagen)}" alt="${esc(s.servicios.titulo)}" class="img-fluid" loading="lazy" width="1200" height="800">
					</div>
				</div>
				<div class="col-lg-4">
					${(s.servicios.items || []).map((it) => `<div class="d-flex feature-h">
						<span class="wrap-icon me-3"><span class="${esc(it.icono || 'icon-home2')}"></span></span>
						<div class="feature-text">
							<h3 class="heading">${esc(it.titulo)}</h3>
							<p class="text-black-50">${esc(it.texto)}</p>
						</div>
					</div>`).join('\n')}
				</div>
			</div>
			${s.contadores.visible ? `<div class="row section-counter mt-4">
				${(s.contadores.items || []).map((c, i) => `<div class="col-6 col-lg-3" data-aos="fade-up" data-aos-delay="${300 + i * 100}">
					<div class="counter-wrap">
						${c.icono ? `<span class="${esc(c.icono)} counter-icono" aria-hidden="true"></span>` : ''}
						<span class="number"><span class="countup text-primary">${esc(c.valor)}</span></span>
						<span class="caption text-black-50">${esc(c.etiqueta)}</span>
					</div>
				</div>`).join('\n')}
			</div>` : ''}
		</div>
	</div>` : ''}

	${s.cta.visible ? `<div class="section">
		<div class="row justify-content-center footer-cta" data-aos="fade-up">
			<div class="col-lg-7 mx-auto text-center">
				<h2 class="mb-3">${esc(s.cta.titulo)}</h2>
				<p class="mb-0"><a href="${esc(s.cta.enlace)}" class="btn btn-primary">${ic('briefcase')}${esc(s.cta.boton)}</a></p>
			</div>
		</div>
	</div>` : ''}

	${s.asesores.visible && ctx.agents.length ? `<div id="asesores" class="section section-5 bg-light">
		<div class="container">
			<div class="row justify-content-center text-center mb-2">
				<div class="col-lg-6">
					<h2 class="font-weight-bold heading text-primary mb-3">${esc(s.asesores.titulo)}</h2>
					<p class="text-black-50 mb-0">${esc(s.asesores.subtitulo)}</p>
				</div>
			</div>
			<div class="row g-4">
				${ctx.agents.map((a) => {
					const wa = whatsappLink(a.whatsapp);
					return `<div class="col-sm-6 col-lg-4">
					<div class="person">
						<img src="${esc(a.foto || '/images/person_1-min.webp')}" alt="${esc(a.nombre)}" class="img-fluid" loading="lazy" width="90" height="90">
						<div class="person-contents">
							<h3 class="h2 mb-0">${esc(a.nombre)}</h3>
							<span class="meta d-block mb-3">${esc(a.cargo)}</span>
							<p>${esc(a.bio)}</p>
							${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary" data-track="Contact"><span class="icon-whatsapp me-1"></span> ${t.escribir}</a>` : ''}
						</div>
					</div>
				</div>`;
				}).join('\n')}
			</div>
		</div>
	</div>` : ''}

	${bloqueExterior(ctx)}

	${porZona(ctx)}

	<div id="${ctx.lang === 'en' ? 'contact' : 'contacto'}" class="section">
		<div class="container">
			<div class="row justify-content-between align-items-start">
				<div class="col-lg-5 mb-4 mb-lg-0">
					<h2 class="font-weight-bold heading text-primary mb-4">${esc(s.contacto.titulo)}</h2>
					<p class="text-black-50 mb-4">${esc(s.contacto.subtitulo)}</p>
					<ul class="list-unstyled contact-list">
						${s.contacto.telefono ? `<li><span class="icon-phone"></span><a href="tel:${esc(s.contacto.telefono.replace(/[^\d+]/g, ''))}" data-track="Contact">${esc(s.contacto.telefono)}</a></li>` : ''}
						${s.contacto.whatsapp ? `<li><span class="icon-whatsapp"></span><a href="${esc(whatsappLink(s.contacto.whatsapp))}" target="_blank" rel="noopener" data-track="Contact">WhatsApp</a></li>` : ''}
						${s.contacto.email ? `<li><span class="icon-envelope-o"></span><a href="mailto:${esc(s.contacto.email)}" data-track="Contact">${esc(s.contacto.email)}</a></li>` : ''}
						${s.contacto.direccion ? `<li><span class="icon-map-marker"></span>${esc(s.contacto.direccion)}</li>` : ''}
						${s.contacto.horario ? `<li><span class="icon-clock-o"></span>${esc(s.contacto.horario)}</li>` : ''}
					</ul>
				</div>
				<div class="col-lg-6">
					<div class="lead-card">${leadForm({ origen: ctx.lang === 'en' ? 'contacto-en' : 'contacto', lang: ctx.lang })}</div>
				</div>
			</div>
		</div>
	</div>`;

	return layout(ctx, {
		path: r.inicio,
		alternates: ctx.enActivo ? { es: '/', en: '/en/' } : null,
		preloadImage: heroImgs[0],
		title: s.seo.titulo,
		description: s.seo.descripcion,
		image: s.seo.imagen,
		jsonLd: [orgLd, webLd]
	}, body);
}

// Enlaces a Comprar, Rentar y Renta vacacional (esta solo si hay alguna): los usan el menú y «Buscar por zona».
function operaciones(ctx) {
	const t = tr(ctx), r = rt(ctx);
	return [[r.venta, 'home', t.comprar], [r.renta, 'key', t.rentar], [r.vacacional, 'plane', t.vacacional]]
		.filter(([url]) => visible(ctx, url) && (ctx.enlaces || url !== r.vacacional || ctx.properties.some((p) => p.operacion === 'vacacional')))
		.map(([url, icono, txt]) => `<a href="${url}">${ic(icono)}${txt}</a>`);
}

// «Buscar por zona y tipo»: enlaces a cada zona y a cada tipo con propiedades (y cuántas tienen) y a las
// operaciones. Va al final de la portada y de los listados, para que las personas y Google lleguen a cada página.
// En una página de zona, las zonas son sus hermanas (misma operación y tipo) que se indexan, si las hay.
// En los listados de renta vacacional las zonas son los destinos: solo los que tienen casas por noche.
const ICONO_TIPO = { casa: 'home', apartamento: 'building-o', terreno: 'map-o', oficina: 'briefcase', local: 'shopping-bag', bodega: 'archive', finca: 'tree' };
function porZona(ctx, e = null) {
	const plan = ctx.plan || [];
	const en = ctx.lang === 'en';
	const actual = e ? e.url : '';
	const vac = e && e.operacion === 'vacacional';
	const chip = (url, icono, txt, n) => `<a href="${url}">${ic(icono)}${esc(txt)} (${n})</a>`;
	const hermanas = e && e.zona ? zonasHermanas(plan, e) : [];
	const zonas = hermanas.length ? hermanas.map((x) => [x.url, x.zona, x.total])
		: [...new Set(plan.filter((x) => x.zona).map((x) => x.zona))].map((z) => {
			const deZona = ctx.properties.filter((p) => p.zona === z && (!vac || p.operacion === 'vacacional'));
			const pg = deZona.length && paginaDeZona(plan, z, vac ? 'vacacional' : '');
			return pg ? [pg.url, z, deZona.length] : null;
		}).filter(Boolean).sort((a, b) => b[2] - a[2] || a[1].localeCompare(b[1], 'es', { numeric: true }));
	const zonasHtml = zonas.filter(([url]) => url !== actual).map(([url, z, n]) => chip(url, 'map-marker', z, n)).join('');
	const tipos = plan.filter((x) => x.pagina === 'tipo' && x.url !== actual).map((x) => chip(x.url, ICONO_TIPO[x.tipo] || 'building-o', nombreTipo(x.tipo, x.operacion, en), x.total)).join('');
	if (!zonasHtml && !tipos) return '';
	return `<nav class="section pt-0" aria-labelledby="por-zona">
		<div class="container">
			<h2 class="h5 mb-3" id="por-zona">${tipos ? tr(ctx).porZonaTipo : tr(ctx).porZona}</h2>
			${[zonasHtml, tipos].filter(Boolean).map((x) => `<div class="chips mb-3">${x}</div>`).join('')}
			<div class="chips">${operaciones(ctx).join('')}</div>
		</div>
	</nav>`;
}

// ---------------------------------------------------------------- Listado

// Opciones excluyentes como pastillas (radios): se tocan con el dedo sin abrir un desplegable.
function chips(col, titulo, name, opciones, sel = '') {
	return `<fieldset class="${col}">
					<legend class="form-label">${titulo}</legend>
					<div class="chips">${opciones.map(([v, txt]) => `<label><input type="radio" name="${name}" value="${esc(v)}"${v === sel ? ' checked' : ''}><span>${esc(txt)}</span></label>`).join('')}</div>
				</fieldset>`;
}

// Buscador del listado vacacional: fechas y huéspedes; js/vacacional.js oculta las casas ocupadas.
function vacBuscador(ctx, list) {
	const t = tr(ctx);
	const max = Math.max(2, ...list.map((p) => datosVacacional(p).huespedesMax));
	return `<form class="vac-buscar" id="vac-buscar" data-total1="${esc(t.vlTotal1)}" data-totaln="${esc(t.vlTotalN)}" role="search" aria-label="${t.vlBuscar}">
				${ic('calendar')}
				<div class="vac-buscar-campos">
					<span class="vac-buscar-fechas">
						<input type="date" name="llegada" aria-label="${t.vacLlegada}" required>
						<span aria-hidden="true">–</span>
						<input type="date" name="salida" aria-label="${t.vacSalida}" required>
					</span>
					<select name="huespedes" aria-label="${t.vacHuespedes}">
						${Array.from({ length: max }, (_, i) => `<option value="${i + 1}"${i === 1 ? ' selected' : ''}>${i ? fmt(t.vacHuespedesN, { n: i + 1 }) : t.vacHuesped1}</option>`).join('')}
					</select>
				</div>
				<button type="submit" class="btn btn-primary btn-ico" aria-label="${t.vlBuscar}">${ic('search')}</button>
			</form>`;
}

// Precios de una zona (scripts/lib/landings.mjs estadisticasPrecio): rango, mediana y precio por m², por noche o al mes.
function bloquePrecios(ctx, precios, zona) {
	if (!precios || !precios.length) return '';
	const t = tr(ctx), en = ctx.lang === 'en';
	const varias = precios.length > 1;
	const filas = precios.flatMap((s) => {
		const unidad = (x) => formatPrice(x, s.moneda, s.operacion === 'vacacional' ? 'renta' : s.operacion, ctx.lang || 'es')
			.replace(en ? ' /mo' : ' /mes', s.operacion === 'renta' ? (en ? ' /mo' : ' /mes') : s.operacion === 'vacacional' ? (en ? ' /night' : ' /noche') : '');
		const pre = varias ? `${opNombre({ operacion: s.operacion }, t)} · ` : '';
		return [
			['usd', `${pre}${t.preciosRango}`, `${unidad(s.min)} – ${unidad(s.max)}`],
			['bar-chart', `${pre}${t.preciosMediana}`, unidad(s.mediana)],
			s.porM2 ? ['area-chart', `${pre}${en ? t.preciosPorFt2 : t.preciosPorM2}`, formatPrice(Math.round(en ? s.porM2 / M2_A_FT2 : s.porM2), s.moneda, 'venta', ctx.lang || 'es')] : null
		].filter(Boolean);
	});
	const base = precios.map((s) => fmt(t.preciosBase, { n: s.n, moneda: s.moneda === 'GTQ' ? 'Q' : 'US$' })).join(' · ');
	return `<section class="zona-precios mb-4" aria-labelledby="zona-precios-t">
				<h2 class="h5 mb-0" id="zona-precios-t">${ic('line-chart')}${esc(fmt(t.preciosTitulo, { zona }))}</h2>
				${facts(filas)}
				<p class="small text-black-50 mt-2 mb-0">${esc(base)}</p>
			</section>`;
}

export function listingPage(ctx, { path, title, heading, description, operacion = '', zona = '', tipo = '', intro = '', alternates = null, contenido = '', imagen = '', precios = [], entrada = null }) {
	const heroImg = imagen || ctx.site.hero.imagenes[0] || '/images/hero_bg_1.webp';
	const t = tr(ctx);
	const vac = operacion === 'vacacional';
	const list = ctx.properties.filter((p) => (!operacion || p.operacion === operacion) && (!zona || p.zona === zona) && (!tipo || p.tipo === tipo));
	const zonas = [...new Set(ctx.properties.map((p) => p.zona).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
	const tipos = [...new Set(ctx.properties.map((p) => p.tipo).filter(Boolean))];
	const hayVacacional = ctx.properties.some((p) => p.operacion === 'vacacional');
	// Migas: inicio → propiedades → operación → tipo, según las páginas de arriba que existen (landings.mjs padres).
	const arriba = entrada && ctx.plan ? padres(ctx.plan, entrada).map((x) => ({ name: x.pagina === 'todas' ? t.propiedades : (x.opts && x.opts.heading) || t.propiedades, url: x.url }))
		: [(zona || operacion) && { name: t.propiedades, url: rt(ctx).propiedades }, vac && zona && { name: t.vacacional, url: rt(ctx).vacacional }].filter(Boolean);
	const crumbs = [{ name: t.inicio, url: rt(ctx).inicio }, ...arriba, { name: heading, url: path }];
	const itemListLd = {
		'@context': 'https://schema.org',
		'@type': 'ItemList',
		itemListElement: list.slice(0, 50).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: absUrl(ctx, propertyUrl(p)), name: p.titulo }))
	};

	const body = `
	${pageHero(ctx, heading, heroImg, crumbs)}
	<div class="section">
		<div class="container">
			${vac ? vacBuscador(ctx, list) : ''}
			${intro ? `<p class="lead text-black-50 mb-4">${esc(intro)}</p>` : ''}
			${bloquePrecios(ctx, precios, zona)}
			${vac ? '' : `<form class="listing-filters row g-2 align-items-end mb-md-4" id="listing-filters" role="search" aria-label="${t.filtrar}">
				<div class="col-12 filtros-cabeza d-md-none">
					<strong>${t.buscar}</strong>
					<button type="button" class="btn btn-outline-secondary btn-ico" id="filtros-cerrar" aria-label="${t.cerrarFiltros}">${ic('close')}</button>
				</div>
				${ctx.site.ia && ctx.site.ia.busquedaPublica ? `<div class="col-12 ia-search">
					<label class="form-label" for="ia-texto">${t.busquedaInteligente}</label>
					<div class="input-group">
						<input class="form-control" id="ia-texto" maxlength="300" placeholder="${esc(t.iaPh)}">
						<button class="btn btn-primary" type="button" id="ia-buscar">${ic('search')}${t.buscarIA}</button>
					</div>
					<p class="ia-search-status small mt-2 mb-0" aria-live="polite"></p>
				</div>` : ''}
				<div class="col-12 col-md-6 col-lg-4">
					<label class="form-label" for="f-q">${t.buscar}</label>
					<input class="form-control" id="f-q" name="q" type="search" autocomplete="off" placeholder="${t.buscarPh}">
				</div>
				<div class="col-12 col-md-6 col-lg-4">
					<label class="form-label" for="f-zona">${t.zona}</label>
					<select class="form-select" id="f-zona" name="zona">
						<option value="">${t.todas}</option>
						${zonas.map((z) => `<option value="${esc(z)}"${z === zona ? ' selected' : ''}>${esc(z)}</option>`).join('')}
					</select>
				</div>
				<div class="col-6 col-lg-2">
					<label class="form-label" for="f-min">${t.precioMin}</label>
					<input class="form-control" id="f-min" name="min" type="number" min="0" step="1000" inputmode="numeric">
				</div>
				<div class="col-6 col-lg-2">
					<label class="form-label" for="f-max">${t.precioMax}</label>
					<input class="form-control" id="f-max" name="max" type="number" min="0" step="1000" inputmode="numeric">
				</div>
				${chips('col-12 col-lg-6', t.operacion, 'operacion', [['', t.todas], ['venta', t.venta], ['renta', t.renta], ['vacacional', t.vacacional]]
					.filter(([v]) => !v || v === operacion || (v === 'vacacional' ? hayVacacional : visible(ctx, rt(ctx)[v]))), operacion)}
				${chips('col-12 col-lg-6', t.tipo, 'tipo', [['', t.todos], ...tipos.map((tp) => [tp, (ctx.lang === 'en' ? TIPOS_EN[tp] : TIPOS[tp]) || tp])], tipo)}
				${chips('col-12 col-md-8 col-lg-6', t.fHabitaciones, 'habitaciones', [['', t.todas], ['1', '1+'], ['2', '2+'], ['3', '3+'], ['4', '4+']])}
				<div class="col-12 col-md-4 col-lg-6 filtros-pie">
					<button type="reset" class="btn btn-link">${t.limpiar}</button>
					<button type="submit" class="btn btn-primary d-md-none" id="listing-ver">${t.jsVer} ${plural(list.length, t.propiedad, t.propiedadesN)}</button>
				</div>
			</form>

			<div class="listing-barra">
				<p class="mb-0" id="listing-count" aria-live="polite">${plural(list.length, t.propiedad, t.propiedadesN)}</p>
				<button type="button" class="btn btn-outline-primary btn-ico d-md-none" id="filtros-abrir" aria-label="${t.buscarFiltrar}" aria-controls="listing-filters" aria-expanded="false">${ic('search')}</button>
				<label class="listing-orden btn btn-outline-primary btn-ico">
					${ic('sort')}<span class="visually-hidden">${t.ordenar}</span>
					<select class="form-select" id="f-orden" name="orden" form="listing-filters">
						<option value="recientes">${t.recientes}</option>
						<option value="precio-asc">${t.precioAsc}</option>
						<option value="precio-desc">${t.precioDesc}</option>
					</select>
				</label>
			</div>`}

			<div class="row" id="${vac ? 'vac-grid' : 'listing-grid'}">
				${list.map((p, i) => `<div class="col-md-6 col-lg-4 mb-3 mb-md-5 listing-col">${propertyCard(p, { lazy: i > 1 })}</div>`).join('\n')}
			</div>
			<p class="text-center text-black-50 py-5" id="listing-empty"${list.length ? ' hidden' : ''}>${vac ? t.vlSinCasas : t.sinResultados} <a href="#contacto-listado">${t.cuentanos}</a> ${t.teAyudamos}</p>
			<nav class="custom-pagination text-center" id="listing-pagination" aria-label="${t.paginacion}"></nav>
			${vac ? `<h2 class="h5 mt-4 mb-3">${t.vlComo}</h2>
			<ol class="vac-pasos">${[t.vlPaso1, t.vlPaso2, t.vlPaso3].map((x) => `<li>${x}</li>`).join('')}</ol>` : ''}
		</div>
	</div>
	${contenido ? `<div class="section pt-0">
		<div class="container">
			<div class="row justify-content-center">
				<article class="col-lg-8 content-page zona-guia">${md(ctx, contenido)}</article>
			</div>
		</div>
	</div>` : ''}

	${porZona(ctx, entrada || (zona || operacion ? { url: path, zona, operacion } : null))}

	<div class="section bg-light" id="contacto-listado">
		<div class="container">
			<div class="row justify-content-center">
				<div class="col-lg-6">
					<div class="lead-card">${leadForm({ origen: 'listado', titulo: t.noEncuentras, lang: ctx.lang })}</div>
				</div>
			</div>
		</div>
	</div>`;

	return layout(ctx, {
		path,
		title,
		description,
		alternates,
		jsonLd: [breadcrumbLd(ctx, crumbs), itemListLd].filter(Boolean),
		// Un listado sin propiedades no aporta nada a Google: no se indexa hasta que tenga alguna. Una zona con pocas
		// (scripts/lib/landings.mjs MIN_INDEXABLE) tampoco: sus casas siguen enlazadas desde el listado de arriba.
		noindex: !list.length || (entrada ? !entrada.indexable : false),
		image: imagen || (list.length ? firstPhoto(list[0]) : undefined),
		extraJs: vac ? VAC_JS : '',
		preloadImage: heroImg,
		bodyAttrs: `data-listing="1" data-preset-operacion="${esc(operacion)}" data-preset-zona="${esc(zona)}" data-preset-tipo="${esc(tipo)}" data-base="${rt(ctx).propiedades}" data-ruta-venta="${rt(ctx).venta}" data-ruta-renta="${rt(ctx).renta}"${hayVacacional ? ` data-ruta-vacacional="${rt(ctx).vacacional}"` : ''}`
	}, body);
}

// ---------------------------------------------------------------- Detalle

// Código corto para que el cliente cite la propiedad por teléfono o WhatsApp.
export function propertyCode(p) {
	// El código del panel (p. ej. VLM-Z15-JA-001); las propiedades antiguas sin código usan EQ-xxxxxx.
	if (p.codigo) return String(p.codigo).trim().toUpperCase();
	return `EQ-${String(p.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()}`;
}

// Calculadora de cuota (sistema francés), referencial. Valores por defecto editables en el panel.
function mortgageCalculator(ctx, p) {
	const c = ctx.site.calculadora || {};
	const t = tr(ctx);
	if (c.visible === false || p.operacion === 'renta' || p.operacion === 'vacacional' || !p.precio) return '';
	return `<div class="calc-card mt-4" data-calc data-precio="${esc(p.precio)}" data-moneda="${esc(p.moneda || 'USD')}" data-lang="${ctx.lang || 'es'}">
						<h3 class="h5 mb-3">${ic('calculator')}${t.calcTitulo}</h3>
						<div class="row g-2">
							<div class="col-4"><label class="form-label" for="calc-enganche">${t.enganche}</label><input id="calc-enganche" class="form-control" type="number" min="0" max="90" step="1" value="${esc(c.enganche ?? 20)}" name="enganche"></div>
							<div class="col-4"><label class="form-label" for="calc-tasa">${t.tasa}</label><input id="calc-tasa" class="form-control" type="number" min="0" max="30" step="0.1" value="${esc(c.tasa ?? 8.5)}" name="tasa"></div>
							<div class="col-4"><label class="form-label" for="calc-anios">${t.anios}</label><input id="calc-anios" class="form-control" type="number" min="1" max="40" step="1" value="${esc(c.anios ?? 20)}" name="anios"></div>
						</div>
						<p class="calc-result mt-3 mb-1" aria-live="polite"></p>
						<p class="small text-black-50 mb-0">${t.calcNota}</p>
					</div>`;
}

// Calculadora de renta (versión pública). Las cuentas las hace js/calc-renta.js en el navegador.
// Se muestra en fichas en venta (no terrenos) con precio, y vacía en /calculadora-de-renta/.
export function rentaVisible(p) {
	return Boolean(p && p.operacion === 'venta' && p.tipo !== 'terreno' && Number(p.precio) > 0);
}
function rentaWidget(ctx, p = null) {
	const t = tr(ctx);
	const lang = ctx.lang || 'es';
	const moneda = (p && p.moneda) || 'USD';
	const uso = EQRenta.usoPorTipo(p && p.tipo);
	const sugerida = p ? EQRenta.rentaSugerida(Number(p.precio), p.tipo) : null;
	const renta = sugerida ? Math.round(sugerida / 10) * 10 : '';
	const pre = moneda === 'GTQ' ? 'Q' : 'US$';
	const textos = Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('renta')));
	const opt = (v, txt, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(txt)}</option>`;
	const num = (id, name, label, value, attrs) => `<label class="form-label" for="${id}">${label}</label><input id="${id}" class="form-control" name="${name}" type="number" inputmode="decimal" ${attrs} value="${esc(value)}">`;
	return `<div class="renta-card" data-renta data-tipo="${esc((p && p.tipo) || '')}" data-moneda="${esc(moneda)}" data-lang="${lang}" data-form="${p ? '.ficha-contacto .lead-form' : '.lead-form[data-origen=&quot;calculadora&quot;]'}">
						<script type="application/json" class="renta-t">${JSON.stringify(textos).replace(/</g, '\\u003c')}</script>
						<div class="row g-3">
							${p ? '' : `<div class="col-5 col-sm-3"><label class="form-label" for="rc-moneda">${t.rentaMoneda}</label><select id="rc-moneda" class="form-select" name="moneda">${opt('USD', 'US$', moneda === 'USD')}${opt('GTQ', 'Q', moneda === 'GTQ')}</select></div>`}
							<div class="${p ? 'col-sm-6' : 'col-7 col-sm-4'}">${num('rc-precio', 'precio', `${t.rentaPrecio} <span class="renta-moneda">(${pre})</span>`, p ? p.precio : '', 'min="0" step="1000"')}</div>
							<div class="${p ? 'col-sm-6' : 'col-sm-5'}">${num('rc-renta', 'renta', `${t.rentaMensual} <span class="renta-moneda">(${pre})</span>`, renta, `min="0" step="10"${p ? ' aria-describedby="rc-renta-ayuda"' : ''}`)}</div>
							${p ? `<p id="rc-renta-ayuda" class="renta-ayuda col-12 mt-1">${t.rentaSugerida}</p>` : ''}
							<div class="col-sm-6"><label class="form-label" for="rc-uso">${t.rentaUso}</label><select id="rc-uso" class="form-select" name="uso">${opt('habitacional', t.rentaHabitacional, uso === 'habitacional')}${opt('mixto', t.rentaMixto, uso === 'mixto')}${opt('comercial', t.rentaComercial, uso === 'comercial')}</select></div>
						</div>
						<details class="renta-supuestos">
							<summary>${ic('sliders')}${t.rentaSupuestos}</summary>
							<div class="row g-3 pt-2">
								<div class="col-6">${num('rc-vacancia', 'vacancia', t.rentaVacancia, 5, 'min="0" max="100" step="1"')}</div>
								<div class="col-6">${num('rc-gastos', 'gastos', t.rentaGastos, 10, 'min="0" max="100" step="1"')}</div>
								<div class="col-sm-6"><label class="form-label" for="rc-plazo">${t.rentaPlazoContrato}</label><select id="rc-plazo" class="form-select" name="plazoContrato">${[1, 2, 3, 5, 10, 30].map((n) => opt(n, n === 1 ? t.rentaPlazoAnio : String(t.rentaPlazoAnios).replace('{n}', n), n === EQRenta.PARAMS.plazoContrato.valor)).join('')}</select></div>
							</div>
						</details>
						<div class="renta-resultado" aria-live="polite" aria-atomic="true">
							<p class="renta-kpi-label">${t.rentaNetoMensual}</p>
							<p class="renta-kpi" data-out="neto">—</p>
							<div class="renta-mini">
								<div><span>${t.rentaRendNeto}</span><strong data-out="rendNeto">—</strong></div>
								<div><span>${t.rentaRendBruto}</span><strong data-out="rendBruto">—</strong></div>
							</div>
							<p class="renta-vacio" data-out="vacio">${t.rentaVacio}</p>
						</div>
						<div class="renta-desglose" data-out="desglose" hidden></div>
						<p class="renta-iva" data-out="iva" hidden></p>
						<div class="renta-escenarios" data-out="escenarios" hidden>
							<h3 class="renta-sub">${t.rentaEscenarios}</h3>
							<div class="renta-esc-grid"></div>
						</div>
						<button type="button" class="btn btn-primary w-100 renta-cta" data-renta-cta>${ic('comments')}${t.rentaCta}</button>
						<p class="renta-estado" role="status" aria-live="polite"></p>
						<p class="renta-nota">${ic('info-circle')}${t.rentaNota}</p>
						<p class="renta-nota mb-0">${t.rentaAviso}</p>
					</div>`;
}
function rentaCalculator(ctx, p) {
	if (!rentaVisible(p)) return '';
	const t = tr(ctx);
	return `<section class="ficha-bloque renta-bloque" id="renta">
						<h2>${ic('line-chart')}${t.rentaTitulo}</h2>
						<p class="renta-intro">${t.rentaIntro}</p>
						${rentaWidget(ctx, p)}
					</section>`;
}

function factsList(p) {
	const t = TEXTOS[lng(p)];
	const en = lng(p) === 'en';
	const m2 = p.m2Construccion || p.m2Terreno;
	const rows = [
		['building', t.fTipo, tipoLabel(p)],
		['tag', t.fOperacion, opNombre(p, t)],
		['info-circle', t.fEstado, estadoLabel(p)],
		['layers', t.fNiveles, p.niveles],
		['calendar', t.fAnio, p.anioConstruccion],
		['wrench', t.fMantenimiento, p.mantenimiento ? formatPrice(p.mantenimiento, p.moneda, 'renta', lng(p)) : ''],
		['map-marker', t.fUbicacion, lugarDe(p, !porNoche(p))],
		['usd', t.fPrecioM2, p.operacion === 'venta' && p.precio && m2
			? formatPrice(Math.round(p.precio / (en ? m2 * M2_A_FT2 : m2)), p.moneda, 'venta', lng(p)) : ''],
		['hashtag', t.fCodigo, propertyCode(p)]
	];
	return facts(rows);
}
const facts = (rows) => `<dl class="prop-facts">${rows.filter(([, , v]) => v).map(([i, k, v]) => `<div><dt>${ic(i)}${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

// Ícono según lo que dice el texto (amenidades y reglas); si nada calza, el genérico que se pida.
const ICONOS_TEXTO = [
	[/wi-?fi|internet/, 'wifi'], [/piscina|alberca|pool/, 'pool'], [/jacuzzi|hot tub/, 'hot_tub'], [/cocina|kitchen/, 'kitchen'],
	[/aire acond|a\/c|air con/, 'ac_unit'], [/parqueo|estacionamiento|parking|garage/, 'local_parking'], [/gimnasio|gym/, 'fitness_center'],
	[/\btv\b|televis|netflix/, 'tv'], [/chimenea|fogata|churrasqu|parrilla|bbq|grill|fire/, 'fire'], [/jard[ií]n|garden|bosque/, 'tree'],
	[/seguridad|garita|security/, 'shield'], [/playa|beach/, 'beach_access'], [/lavander|lavadora|laundry|washer/, 'local_laundry_service'],
	[/mascota|\bpets?\b/, 'pets'], [/desayuno|breakfast|caf[eé]|coffee/, 'free_breakfast'], [/agua caliente|ducha|shower/, 'shower'],
	[/fum|smok/, 'smoke_free'], [/ruido|silencio|m[uú]sica|fiesta|noise|quiet|part(y|ies)/, 'volume-off'], [/hu[eé]sped|visita|guest/, 'users']
];
const iconoTexto = (texto, generico) => (ICONOS_TEXTO.find(([re]) => re.test(String(texto).toLowerCase())) || [0, generico])[1];
const lineas = (texto) => String(texto || '').split('\n').map((x) => x.trim()).filter(Boolean);

// Lo que un huésped pregunta antes de reservar: horarios, cargos, mascotas, cómo llegar, reglas y cancelación.
// Reglas y cancelación: las de la casa o, si no tiene, las generales de Contenido → Textos.
function antesDeReservar(p) {
	const t = TEXTOS[lng(p)];
	const v = p.vacacional || {};
	const d = datosVacacional(p);
	const precio = (x) => (x > 0 ? formatPrice(x, p.moneda, 'venta', lng(p)) : '');
	const nota = (icono, titulo, texto) => (texto ? `<p class="ficha-nota"><strong>${ic(icono)}${titulo}</strong>${esc(texto)}</p>` : '');
	const reglas = lineas(v.reglas || t.vacReglasGenerales);
	return `<section class="ficha-bloque">
						<h2>${ic('info-circle')}${t.vacAntes}</h2>
						${facts([
		['clock-o', t.vacLlegada, fmt(t.vacCheckIn, { hora: d.checkIn })],
		['clock-o', t.vacSalida, fmt(t.vacCheckOut, { hora: d.checkOut })],
		['moon-o', t.fNochesMin, d.nochesMin > 1 ? fmt(t.vacNochesN, { n: d.nochesMin }) : t.vacNoche1],
		['pets', t.fMascotas, { si: t.vacMascotasSi, no: t.vacMascotasNo }[v.mascotas]],
		['brush', t.fLimpieza, precio(d.limpieza)],
		['shield', t.vacDeposito, precio(d.deposito)]
	])}
						${nota('directions_car', t.vacComoLlegar, v.comoLlegar)}
						${reglas.length ? `<div class="ficha-nota"><strong>${ic('list-ul')}${t.vacReglas}</strong><ul class="ficha-amenidades">${reglas.map((r) => `<li>${ic(iconoTexto(r, 'info-circle'))}${esc(r)}</li>`).join('')}</ul></div>` : ''}
						${nota('calendar-times-o', t.vacCancelacion, v.cancelacion || t.vacCancelacionGeneral)}
					</section>`;
}

// Coordenadas a partir del enlace de Google Maps (…@14.6,-90.5… o …q=14.6,-90.5…).
function geoDe(mapa) {
	const m = /(?:@|[?&](?:q|ll|query)=)(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(String(mapa || ''));
	return m ? { '@type': 'GeoCoordinates', latitude: Number(m[1]), longitude: Number(m[2]) } : undefined;
}

export function orgId(ctx) {
	return `${ctx.siteUrl.replace(/\/$/, '')}/#organizacion`;
}

// schema.org/ItemAvailability de cada estado (los cerrados u ocultos: SoldOut).
const DISPONIBILIDAD_LD = { disponible: 'InStock', proximamente: 'PreOrder', reservada: 'LimitedAvailability' };

function listingLd(ctx, p) {
	const agent = ctx.agentsById && ctx.agentsById[p.agentId];
	const video = videoEmbedUrl(p.video);
	const vac = p.operacion === 'vacacional' && p.vacacional;
	const offer = {
		'@type': 'Offer',
		url: absUrl(ctx, propertyUrl(p)),
		price: p.vipLanding && p.vipLanding.ocultarPrecio ? undefined : (p.precio || undefined),
		priceCurrency: p.moneda || 'USD',
		// Renta vacacional: el precio es por noche, antes de impuestos.
		priceSpecification: p.operacion === 'vacacional' && p.precio
			? { '@type': 'UnitPriceSpecification', price: p.precio, priceCurrency: p.moneda || 'USD', unitText: lng(p) === 'en' ? 'night' : 'noche', valueAddedTaxIncluded: false }
			: undefined,
		offeredBy: agent
			? { '@type': 'RealEstateAgent', name: agent.nombre, telephone: agent.telefono || undefined, worksFor: { '@id': orgId(ctx) } }
			: { '@id': orgId(ctx) },
		availability: `https://schema.org/${DISPONIBILIDAD_LD[p.estado] || (estadoDe(p).visibilidad === 'visible' ? 'InStock' : 'SoldOut')}`,
		businessFunction: p.operacion === 'renta' || p.operacion === 'vacacional' ? 'http://purl.org/goodrelations/v1#LeaseOut' : 'http://purl.org/goodrelations/v1#Sell'
	};
	return {
		'@context': 'https://schema.org',
		'@type': 'RealEstateListing',
		name: p.titulo,
		description: truncate(resumenSeo(p.descripcion), 300),
		url: absUrl(ctx, propertyUrl(p)),
		image: (p.fotos || []).map((f) => absUrl(ctx, f.url)),
		datePosted: p.createdAt || undefined,
		dateModified: p.updatedAt || undefined,
		inLanguage: lng(p),
		identifier: propertyCode(p),
		offers: offer,
		video: video ? { '@type': 'VideoObject', name: p.titulo, description: truncate(resumenSeo(p.descripcion), 200), embedUrl: video, thumbnailUrl: absUrl(ctx, firstPhoto(p)), uploadDate: p.updatedAt || p.createdAt || undefined } : undefined,
		about: {
			'@type': p.tipo === 'apartamento' ? 'Apartment' : p.tipo === 'casa' ? 'SingleFamilyResidence' : p.tipo === 'terreno' ? 'Place' : 'Accommodation',
			name: p.titulo,
			numberOfRooms: p.habitaciones || undefined,
			numberOfBedrooms: p.habitaciones || undefined,
			numberOfBathroomsTotal: p.banos || undefined,
			yearBuilt: p.anioConstruccion || undefined,
			floorSize: p.m2Construccion ? { '@type': 'QuantitativeValue', value: p.m2Construccion, unitCode: 'MTK' } : undefined,
			// Renta vacacional: cuántos caben, camas y mascotas (lo que filtra quien busca dónde quedarse).
			occupancy: huespedesDe(p) ? { '@type': 'QuantitativeValue', maxValue: huespedesDe(p), unitCode: 'C62' } : undefined,
			bed: vac && Number(p.vacacional.camas) > 0 ? { '@type': 'BedDetails', numberOfBeds: Number(p.vacacional.camas) } : undefined,
			petsAllowed: vac ? { si: true, no: false }[p.vacacional.mascotas] : undefined,
			amenityFeature: [
				...(p.amenidades || []).map((a) => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })),
				p.parqueos ? { '@type': 'LocationFeatureSpecification', name: lng(p) === 'en' ? 'Parking spaces' : 'Parqueos', value: p.parqueos } : null,
				p.m2Terreno ? { '@type': 'LocationFeatureSpecification', name: lng(p) === 'en' ? 'Lot size (m²)' : 'Terreno (m²)', value: p.m2Terreno } : null
			].filter(Boolean),
			geo: porNoche(p) ? undefined : geoDe(p.mapa),
			// Departamento según el municipio (util.mjs departamentoDe); si no se conoce, no se pone.
			address: { '@type': 'PostalAddress', streetAddress: (!porNoche(p) && p.direccion) || undefined, addressLocality: lugarDe(p), addressRegion: departamentoDe(p) || undefined, addressCountry: 'GT' }
		}
	};
}

export function autoSeoTitle(p) {
	return autoSeoTitleBase(p, lng(p) === 'en');
}

function seoTitle(p) {
	return (p.seo && p.seo.titulo) || autoSeoTitle(p);
}

function seoDescription(p) {
	const t = TEXTOS[lng(p)];
	return (p.seo && p.seo.descripcion) || autoSeoDescripcion(p, price(p), [
		p.habitaciones && plural(p.habitaciones, t.habitacion, t.habitaciones),
		p.banos && plural(p.banos, t.bano, t.banos),
		// Renta vacacional: a quien busca dónde quedarse le importa cuántos caben, no los m².
		huespedesDe(p) ? (huespedesDe(p) === 1 ? t.vacHuesped1 : t.vacHuespedesN.replace('{n}', huespedesDe(p))) : p.m2Construccion && area(p.m2Construccion, lng(p))
	]);
}

function viewContentAttrs(p) {
	return `data-view-content='${esc(JSON.stringify({ content_ids: [p.id], content_name: p.titulo, content_type: 'home_listing', value: p.precio || 0, currency: p.moneda || 'USD' }))}'`;
}

function shareButtons(ctx, p) {
	const t = tr(ctx);
	const url = absUrl(ctx, propertyUrl(p));
	const text = `${p.titulo} – ${price(p)}`;
	return `<div class="share-buttons mb-3" aria-label="${t.compartir}">
						<span class="small text-black-50 me-1">${t.compartir}:</span>
						<a href="https://wa.me/?text=${esc(encodeURIComponent(`${text} ${url}`))}" target="_blank" rel="noopener" aria-label="${t.compartirWa}"><span class="icon-whatsapp"></span></a>
						<a href="https://www.facebook.com/sharer/sharer.php?u=${esc(encodeURIComponent(url))}" target="_blank" rel="noopener" aria-label="${t.compartirFb}"><span class="icon-facebook"></span></a>
						<button type="button" class="js-copy-link" data-url="${esc(url)}" aria-label="${t.copiarEnlace}"><span class="icon-link"></span></button>
					</div>`;
}

// ---------------------------------------------------------------- Renta vacacional
// Cuadro de reserva de la ficha: calendario, fechas, huéspedes y desglose. Las cuentas las hace
// js/calc-vacacional.js en el navegador. Aquí solo van datos públicos (precios al público por
// noche y fechas ocupadas); el costo del socio, la ganancia y el iCal viven en privado/socio.
const VAC_JS = '<script src="__VAC_BUNDLE__" defer></script>';
export function vacacionalVisible(p) {
	return Boolean(p && p.operacion === 'vacacional' && p.vacacional && Number(p.vacacional.base) > 0);
}
function datosVacacional(p) {
	const v = p.vacacional || {};
	const num = (x, d = 0) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : d);
	const fecha = (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? String(x) : '';
	const hora = (x, d) => /^\d{2}:\d{2}$/.test(String(x || '')) ? String(x) : d;
	return {
		plan: {
			base: num(v.base),
			finde: num(v.finde),
			tarifas: (v.tarifas || []).map((x) => ({ desde: fecha(x.desde), hasta: fecha(x.hasta), precio: num(x.precio) })).filter((x) => x.desde && x.hasta && x.precio > 0)
		},
		nochesMin: Math.max(1, Math.round(num(v.nochesMin, 1)) || 1),
		// Mínimos de noches por fechas (Navidad, Semana Santa…): los pone el socio o el equipo.
		minimos: (v.minimos || []).map((x) => ({ desde: fecha(x.desde), hasta: fecha(x.hasta), noches: Math.round(num(x.noches)) })).filter((x) => x.desde && x.hasta && x.noches > 1),
		huespedesMax: Math.max(1, Math.round(num(v.huespedesMax, 2)) || 1),
		limpieza: num(v.limpieza),
		deposito: num(v.deposito),
		checkIn: hora(v.checkIn, '15:00'),
		checkOut: hora(v.checkOut, '11:00'),
		// Fechas ocupadas: bloqueos del panel y reservas confirmadas.
		bloqueos: [...(v.bloqueos || []), ...(v.reservadas || [])].map((x) => ({ desde: fecha(x.desde), hasta: fecha(x.hasta) })).filter((x) => x.desde && x.hasta)
	};
}
function reservaBox(ctx, p) {
	const t = tr(ctx);
	const lang = ctx.lang || 'es';
	const d = datosVacacional(p);
	const textos = Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('vac')));
	const json = JSON.stringify({ ...d, moneda: p.moneda || 'USD', t: textos }).replace(/</g, '\\u003c');
	const huespedes = Array.from({ length: d.huespedesMax }, (_, i) => i + 1)
		.map((n) => `<option value="${n}"${n === Math.min(2, d.huespedesMax) ? ' selected' : ''}>${n === 1 ? t.vacHuesped1 : fmt(t.vacHuespedesN, { n })}</option>`).join('');
	return `<section class="lead-card vac-card" data-vacacional data-id="${esc(p.id)}" data-lang="${lang}" aria-labelledby="vac-titulo">
						<script type="application/json" class="vac-datos">${json}</script>
						<h2 id="vac-titulo" class="h5 mb-1">${ic('calendar')}${t.vacTitulo}</h2>
						<p class="vac-desde"><strong>${esc(price(p))}</strong></p>
						<p class="vac-impuestos">${t.vacImpuestos}${d.nochesMin > 1 ? ` · ${fmt(t.vacMinimo, { n: d.nochesMin })}` : ''}</p>
						<div class="vac-fechas">
							<button type="button" class="vac-fecha" data-campo="llegada" aria-describedby="vac-ayuda">
								<span class="vac-fecha-label">${t.vacLlegada}</span>
								<strong class="vac-fecha-valor" data-out="llegada">${t.vacSinFecha}</strong>
								<span class="vac-fecha-hora">${fmt(t.vacCheckIn, { hora: d.checkIn })}</span>
							</button>
							<button type="button" class="vac-fecha" data-campo="salida" aria-describedby="vac-ayuda">
								<span class="vac-fecha-label">${t.vacSalida}</span>
								<strong class="vac-fecha-valor" data-out="salida">${t.vacSinFecha}</strong>
								<span class="vac-fecha-hora">${fmt(t.vacCheckOut, { hora: d.checkOut })}</span>
							</button>
						</div>
						<div class="vac-cal" role="group" aria-label="${esc(t.vacCalendario)}">
							<div class="vac-cal-cabecera">
								<button type="button" class="eq-flecha vac-cal-prev" aria-label="${esc(t.vacMesAnterior)}">${chevron(FLECHA_PREV)}</button>
								<h3 class="vac-cal-mes" aria-live="polite"></h3>
								<button type="button" class="eq-flecha vac-cal-next" aria-label="${esc(t.vacMesSiguiente)}">${chevron(FLECHA_NEXT)}</button>
							</div>
							<div class="vac-cal-cuerpo"></div>
						</div>
						<p class="vac-ayuda" id="vac-ayuda" role="status" aria-live="polite">${t.vacEligeLlegada}</p>
						<div class="vac-huespedes">
							<label class="form-label" for="vac-huespedes">${ic('users')}${t.vacHuespedes}</label>
							<select id="vac-huespedes" class="form-select" name="huespedes">${huespedes}</select>
						</div>
						<div class="vac-desglose" data-out="desglose" aria-live="polite" hidden></div>
						${leadForm({ origen: 'reserva', property: p, agentId: p.agentId, boton: t.vacSolicitar, icono: 'calendar', lang, mensaje: false })}
						<p class="vac-nota">${ic('info-circle')}${t.vacSinCobro}</p>
					</section>`;
}

// Tarjeta de venta y renta: mismo diseño que la de reserva (precio, acción y asesor en una sola).
function visitaBox(ctx, p, agent) {
	const t = tr(ctx);
	return `<section class="lead-card vac-card" id="ficha-form" aria-labelledby="visita-titulo">
						<h2 id="visita-titulo" class="h5 mb-1">${ic('calendar')}${t.agendaVisita}</h2>
						<p class="vac-desde"><strong>${esc(price(p))}</strong>${precioAntes(p)}</p>
						<p class="vac-impuestos">${esc([enOperacion(p, t), p.zona].filter(Boolean).join(' · '))}</p>
						${leadForm({ origen: 'propiedad', property: p, agentId: p.agentId, boton: t.agendarVisita, icono: 'calendar', visita: true, lang: ctx.lang })}
						${agentBox(ctx, agent, p)}
					</section>`;
}

export function propertyPage(ctx, p) {
	const t = tr(ctx);
	const r = rt(ctx);
	const agent = ctx.agentsById[p.agentId];
	const fotos = (p.fotos && p.fotos.length) ? p.fotos : [{ url: firstPhoto(p) }];
	// Su zona y la página más específica de su zona (zona + operación, o zona + tipo + operación) si existen.
	const zona = p.zona ? buscar(ctx.plan || [], 'zona', { zona: p.zona }) : null;
	const fina = p.zona ? paginaDeZona(ctx.plan || [], p.zona, p.operacion, p.tipo) : null;
	const crumbs = [{ name: t.inicio, url: r.inicio }, { name: t.propiedades, url: r.propiedades },
		zona && { name: p.zona, url: zona.url }, fina && fina !== zona && { name: fina.opts ? fina.opts.heading : p.zona, url: fina.url },
		{ name: p.titulo, url: propertyUrl(p) }].filter(Boolean);
	const video = videoEmbedUrl(p.video);
	const mapa = p.mapa && !porNoche(p) ? mapEmbedUrl(p.mapa) : '';
	// Vendida o rentada: la página sigue en su enlace con el aviso y propiedades parecidas.
	const cerrada = estadoDe(p).visibilidad === 'cerrada';
	const esVac = vacacionalVisible(p) && !cerrada;
	const related = parecidas(ctx, p, cerrada ? 6 : 3);
	const waMsg = fmt(cerrada ? t.msgWaCerrada : t.msgWaFicha, { titulo: p.titulo, url: absUrl(ctx, propertyUrl(p)) });
	const waCerrada = cerrada ? whatsappLink(ctx.site.contacto.whatsapp, waMsg) : '';
	const aviso = cerrada ? `<section class="ficha-aviso" aria-labelledby="ficha-aviso-titulo">
				<span class="ficha-aviso-icono" aria-hidden="true">${ic('key')}</span>
				<div class="ficha-aviso-texto">
					<h2 id="ficha-aviso-titulo">${p.estado === 'rentada' ? t.avisoRentada : t.avisoVendida}</h2>
					<p>${t.avisoCerradaTexto}</p>
					<div class="ficha-aviso-acciones">
						${related.length ? `<a href="#similares" class="btn btn-primary">${ic('th-large')}${t.verSimilares}</a>` : `<a href="${r.propiedades}" class="btn btn-primary">${ic('search')}${t.verPropiedades}</a>`}
						${waCerrada ? `<a href="${esc(waCerrada)}" class="btn btn-outline-primary" target="_blank" rel="noopener" data-track="Contact">${ic('whatsapp')}WhatsApp</a>` : ''}
					</div>
				</div>
			</section>` : '';

	// Barra fija de celular: la acción principal con texto y el resto solo con ícono.
	const waFicha = whatsappLink((agent && agent.whatsapp) || ctx.site.contacto.whatsapp, waMsg);
	const tel = telLink(ctx);
	const barra = `<div class="ficha-barra d-lg-none">
		<a href="#${esVac ? 'vac-titulo' : 'ficha-form'}" class="btn btn-primary">${ic(cerrada ? 'envelope-o' : 'calendar')}${esVac ? t.vacReservar : cerrada ? t.quieroInfo : t.agendarVisita}</a>
		${waFicha && !esVac ? `<a href="${esc(waFicha)}" class="btn btn-success btn-ico" target="_blank" rel="noopener" data-track="Contact" aria-label="WhatsApp">${ic('whatsapp')}</a>` : ''}
		${tel ? `<a href="${tel}" class="btn btn-outline-primary btn-ico" data-track="Contact" aria-label="${t.llamar}">${ic('phone')}</a>` : ''}
		<button type="button" class="btn btn-outline-primary btn-ico js-copy-link" data-compartir data-url="${esc(absUrl(ctx, propertyUrl(p)))}" aria-label="${t.compartir}">${ic('share-alt')}</button>
	</div>`;

	const lugar = lugarDe(p);
	const datosClave = [
		[esVac ? datosVacacional(p).huespedesMax : '', t.vacHuespedes, 'users'],
		[esVac ? p.vacacional.camas : '', t.fCamas, 'airline_seat_individual_suite'],
		[p.habitaciones, t.fHabitaciones, 'bed'],
		[p.banos, t.fBanos, 'bath'],
		[p.parqueos, t.fParqueos, 'car'],
		[p.m2Construccion ? area(p.m2Construccion, lng(p)) : '', t.fConstruccion, 'construccion'],
		[p.m2Terreno ? areaTerreno(p.m2Terreno, lng(p)) : '', t.fTerreno, 'terreno']
	].filter(([v]) => v);
	const visibles = fotos;
	const galeria = `<div class="ficha-galeria-wrap">
	<section class="ficha-galeria ficha-galeria-${Math.min(fotos.length, 5)}" aria-label="${t.galeriaFotos}">
		${visibles.map((f, i) => `<button type="button" class="ficha-foto" data-index="${i}" aria-label="${t.verFoto} ${i + 1}">
			<img src="${esc(f.url)}" alt="${esc(photoAlt(p, i))}"${fotoAttrs(f.url, sizesGaleria(fotos.length, i))}${i ? ' loading="lazy"' : ' fetchpriority="high"'}>
		</button>`).join('')}
	</section>
	${cerrada ? `<span class="ficha-sello">${ic('key')}${esc(estadoLabel(p))}</span>` : ''}
	${fotos.length > 1 ? `<button type="button" class="ficha-ver-todas" data-index="0">${ic('camera')}${fmt(t.verFotosN, { n: fotos.length })}</button>
	<span class="foto-contador ficha-contador" aria-hidden="true">1 / ${fotos.length}</span>
	<button type="button" class="eq-flecha eq-flecha-sobre eq-flecha-prev ficha-flecha" aria-label="${t.anteriorFoto}">${chevron(FLECHA_PREV)}</button>
	<button type="button" class="eq-flecha eq-flecha-sobre eq-flecha-next ficha-flecha" aria-label="${t.siguienteFoto}">${chevron(FLECHA_NEXT)}</button>` : ''}
	</div>
	<dialog class="ficha-lightbox" id="ficha-lightbox" aria-label="${t.galeriaFotos}">
		<button type="button" class="flb-cerrar" aria-label="${t.cerrar}">${ic('close')}</button>
		<button type="button" class="flb-prev" aria-label="${t.anteriorFoto}">${ic('chevron-left')}</button>
		<figure><img alt=""><figcaption></figcaption></figure>
		<button type="button" class="flb-next" aria-label="${t.siguienteFoto}">${ic('chevron-right')}</button>
		<div class="flb-fotos" hidden>${fotos.map((f, i) => `<span data-src="${esc(f.url)}" data-alt="${esc(photoAlt(p, i))}"></span>`).join('')}</div>
	</dialog>`;

	// Precio, acción y asesor (la casa por noche no muestra asesor: la atiende su anfitrión por la reserva).
	// En renta vacacional va justo después del precio y los datos, para que en
	// celular el calendario quede arriba; en computadora sigue siendo la columna derecha.
	const lateral = `<aside class="col-lg-4">
					<div class="ficha-contacto${esVac ? '' : ' ficha-contacto-corta'}">
						${esVac ? reservaBox(ctx, p) : cerrada
							? agentBox(ctx, agent, p) + `<div class="lead-card" id="ficha-form">${leadForm({ origen: 'propiedad', property: p, agentId: p.agentId, titulo: t.buscasParecida, boton: t.quieroInfo, lang: ctx.lang, mensaje: waMsg })}</div>`
							: visitaBox(ctx, p, agent)}
						${shareButtons(ctx, p)}
					</div>
				</aside>`;

	const body = `
	${galeria}
	<div class="ficha">
		<div class="container">
			<nav aria-label="breadcrumb" class="ficha-migas">
				<ol class="breadcrumb">${crumbs.map((c, i) => i === crumbs.length - 1
					? `<li class="breadcrumb-item active" aria-current="page">${esc(c.name)}</li>`
					: `<li class="breadcrumb-item"><a href="${esc(c.url)}">${i === 0 ? ic('home') : ''}${esc(c.name)}</a></li>`).join('')}</ol>
			</nav>
			${aviso}
			<div class="row justify-content-between${esVac ? ' ficha-vac' : ''}">
				<div class="col-lg-7">
					<header class="ficha-cabecera">
						<p class="ficha-tipo">${esc(tipoLabel(p))}${cerrada ? '' : ` · ${enOperacion(p, t)}${estadoLabel(p) && p.estado && p.estado !== 'disponible' ? ` · ${esc(estadoLabel(p))}` : ''}`}</p>
						<h1 class="ficha-titulo">${esc(p.titulo)}</h1>
						${lugar ? `<p class="ficha-lugar">${ic('map-marker')}${zona && lugar.startsWith(p.zona) ? `<a href="${zona.url}">${esc(p.zona)}</a>${esc(lugar.slice(p.zona.length))}` : esc(lugar)}</p>` : ''}
						${cerrada ? `<p class="ficha-precio ficha-precio-cerrada">${esc(estadoLabel(p))}</p>` : `<p class="ficha-precio">${esc(price(p))}${precioAntes(p)}</p>${esVac ? `<p class="ficha-precio-nota">${t.vacImpuestos}</p>` : ''}`}
					</header>
					${datosClave.length ? `<ul class="ficha-datos">${datosClave.map(([v, k, i]) => `<li>${ic(i)}<strong>${esc(v)}</strong><span>${k}</span></li>`).join('')}</ul>` : ''}
					${esVac ? `</div>
				${lateral}
				<div class="col-lg-7">` : ''}
					<section class="ficha-bloque">
						<h2>${ic('file-text-o')}${t.descripcion}</h2>
						<div class="prop-description">${md(ctx, p.descripcion)}</div>
					</section>
					${(p.amenidades || []).length ? `<section class="ficha-bloque">
						<h2>${ic('check-square-o')}${t.amenidades}</h2>
						<ul class="ficha-amenidades">${p.amenidades.map((a) => `<li>${ic(iconoTexto(a, 'check'))}${esc(a)}</li>`).join('')}</ul>
					</section>` : ''}
					<section class="ficha-bloque">
						<h2>${ic('list-ul')}${t.caracteristicas}</h2>
						${factsList(p)}
					</section>
					${esVac ? antesDeReservar(p) : ''}
					${video ? `<section class="ficha-bloque"><h2>${ic('play-circle')}${t.video}</h2><div class="ratio ratio-16x9"><iframe src="${esc(video)}" title="${t.videoDe} ${esc(p.titulo)}" loading="lazy" allowfullscreen></iframe></div></section>` : ''}
					${mapa ? `<section class="ficha-bloque"><h2>${ic('map-marker')}${t.ubicacion}</h2><div class="ratio ratio-16x9"><iframe src="${esc(mapa)}" title="${t.mapaDe} ${esc(p.titulo)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></section>` : ''}
					${!cerrada && mortgageCalculator(ctx, p) ? `<section class="ficha-bloque">${mortgageCalculator(ctx, p)}</section>` : ''}
					${!cerrada ? rentaCalculator(ctx, p) : ''}
				</div>
${esVac ? '' : lateral}
			</div>
		</div>
	</div>
	${related.length ? `<div class="section ficha-similares" id="similares">
		<div class="container">
			<h2 class="heading mb-5">${ic('th-large')}${t.similares}</h2>
			<div class="row">${related.map((o) => `<div class="col-md-6 col-lg-4 mb-5">${propertyCard(o)}</div>`).join('')}</div>
		</div>
	</div>` : ''}
	${barra}`;

	return layout(ctx, {
		path: propertyUrl(p),
		alternates: p._alternates,
		preloadImage: firstPhoto(p),
		preloadSizes: sizesGaleria((p.fotos || []).length, 0),
		title: seoTitle(p),
		description: seoDescription(p),
		image: firstPhoto(p),
		ogType: 'article',
		jsonLd: [listingLd(ctx, p), breadcrumbLd(ctx, crumbs)],
		bodyAttrs: cerrada ? 'class="pagina-ficha pagina-ficha-cerrada"' : `class="pagina-ficha" ${viewContentAttrs(p)}`,
		waMensaje: waMsg,
		waReserva: esVac,
		extraJs: esVac ? VAC_JS : !cerrada && rentaVisible(p) ? RENTA_JS : ''
	}, body);
}

// Propiedades parecidas que sí se ofrecen: primero misma zona y operación, luego cualquiera de las dos.
// Las casas por noche solo se sugieren entre ellas: quien busca dónde quedarse no busca comprar, ni al revés.
function parecidas(ctx, p, n) {
	const puntos = (o) => (o.zona === p.zona ? 2 : 0) + (o.operacion === p.operacion ? 1 : 0) + (o.tipo === p.tipo ? 0.5 : 0);
	return ctx.properties
		.filter((o) => o.id !== p.id && porNoche(o) === porNoche(p) && (o.zona === p.zona || o.operacion === p.operacion))
		.map((o, i) => [o, puntos(o), i])
		.sort((a, b) => b[1] - a[1] || a[2] - b[2])
		.slice(0, n)
		.map(([o]) => o);
}

// Propiedad pausada o retirada: su enlace no da error, pero no muestra fotos, precio ni datos,
// y Google no la indexa. Ofrece propiedades parecidas y contacto.
export function propertyGonePage(ctx, p) {
	const t = tr(ctx);
	const r = rt(ctx);
	const related = parecidas(ctx, p, 6);
	const waMsg = fmt(t.msgWaCerrada, { titulo: p.titulo, url: absUrl(ctx, propertyUrl(p)) });
	const wa = whatsappLink(ctx.site.contacto.whatsapp, waMsg);
	const body = `
	${pageHero(ctx, t.noDisponibleTitulo, ctx.site.hero.imagenes[0] || '/images/hero_bg_1.webp', [{ name: t.inicio, url: r.inicio }, { name: t.propiedades, url: r.propiedades }, { name: p.titulo, url: propertyUrl(p) }])}
	<div class="section ficha-no-disponible">
		<div class="container">
			<section class="ficha-aviso ficha-aviso-retirada" aria-labelledby="ficha-aviso-titulo">
				<span class="ficha-aviso-icono" aria-hidden="true">${ic('info-circle')}</span>
				<div class="ficha-aviso-texto">
					<h2 id="ficha-aviso-titulo">${esc(p.titulo)}</h2>
					<p>${t.noDisponibleTexto}</p>
					<div class="ficha-aviso-acciones">
						<a href="${r.propiedades}" class="btn btn-primary">${ic('search')}${t.verPropiedades}</a>
						${wa ? `<a href="${esc(wa)}" class="btn btn-outline-primary" target="_blank" rel="noopener" data-track="Contact">${ic('whatsapp')}WhatsApp</a>` : ''}
					</div>
				</div>
			</section>
		</div>
	</div>
	${related.length ? `<div class="section ficha-similares" id="similares">
		<div class="container">
			<h2 class="heading mb-5">${ic('th-large')}${t.similares}</h2>
			<div class="row">${related.map((o) => `<div class="col-md-6 col-lg-4 mb-5">${propertyCard(o)}</div>`).join('')}</div>
		</div>
	</div>` : ''}`;
	return layout(ctx, {
		path: propertyUrl(p),
		title: `${t.noDisponibleTitulo} | ${ctx.site.general.nombreCorto}`,
		description: t.noDisponibleTexto,
		noindex: true,
		waMensaje: waMsg
	}, body);
}

// ---------------------------------------------------------------- VIP

export function vipIndexPage(ctx, entrada = null) {
	const t = tr(ctx);
	const r = rt(ctx);
	const vips = ctx.properties.filter((p) => p.vip);
	const L = (ctx.site.listados && ctx.site.listados.vip) || {};
	const crumbs = [{ name: t.inicio, url: r.inicio }, { name: t.propiedadesVip, url: r.vip }];
	const body = `
	${pageHero(ctx, L.h1 || t.propiedadesVip, vips[0] ? firstPhoto(vips[0]) : '/images/hero_bg_2.webp', crumbs)}
	<div class="section">
		<div class="container">
			<div class="row justify-content-center text-center mb-5">
				<div class="col-lg-7">
					<p class="text-black-50">${esc(L.intro || t.vipIntro)}</p>
				</div>
			</div>
			<div class="row">
				${vips.length ? vips.map((p) => `<div class="col-md-6 mb-5">
					<a class="vip-card" href="${propertyUrl(p)}">
						<img src="${esc(firstPhoto(p))}" alt="${esc(photoAlt(p))}"${fotoAttrs(firstPhoto(p), '(max-width: 767px) 100vw, 50vw')} loading="lazy" width="800" height="600">
						<span class="vip-card-body">
							<span class="prop-badge prop-badge-vip">VIP</span>
							<span class="vip-card-title">${esc((p.vipLanding && p.vipLanding.titular) || p.titulo)}</span>
							<span class="vip-card-meta">${ic('map-marker')}${esc(lugarDe(p))}${p.vipLanding && p.vipLanding.ocultarPrecio ? '' : ` · ${esc(price(p))}`}</span>
						</span>
					</a>
				</div>`).join('\n') : `<p class="text-center text-black-50">${t.vipPronto} <a href="${r.contacto}">${t.contactanos}</a> ${t.paraConocerlas}</p>`}
			</div>
		</div>
	</div>`;
	return layout(ctx, {
		path: r.vip,
		alternates: entrada ? entrada.alternates || null : ctx.enActivo ? { es: '/vip/', en: '/en/luxury/' } : null,
		title: L.titulo || `${t.vipTitulo} | ${ctx.site.general.nombreCorto}`,
		description: L.descripcion || t.vipDesc,
		// «Muy pronto»: sin propiedades VIP no se indexa ni va al sitemap (igual que un listado vacío).
		noindex: !vips.length,
		jsonLd: [breadcrumbLd(ctx, crumbs)]
	}, body);
}

export function vipLandingPage(ctx, p) {
	const s = ctx.site;
	const t = tr(ctx);
	const r = rt(ctx);
	const v = p.vipLanding || {};
	const agent = ctx.agentsById[p.agentId];
	const fotos = (p.fotos && p.fotos.length) ? p.fotos : [{ url: firstPhoto(p) }];
	const portada = v.portada || firstPhoto(p);
	const video = videoEmbedUrl(v.video || p.video);
	const mapa = !porNoche(p) && (v.mapa || p.mapa) ? mapEmbedUrl(v.mapa || p.mapa) : '';
	const precio = v.ocultarPrecio ? t.precioConsultar : price(p);
	const waNumber = (agent && agent.whatsapp) || s.contacto.whatsapp;
	const wa = whatsappLink(waNumber, fmt(t.msgWaVip, { titulo: p.titulo, url: absUrl(ctx, propertyUrl(p)) }));
	const cta = v.ctaTexto || t.agendarPrivada;
	const crumbs = [{ name: t.inicio, url: r.inicio }, { name: t.propiedadesVip, url: r.vip }, { name: p.titulo, url: propertyUrl(p) }];
	const en = ctx.lang === 'en';
	const facts = [
		['icon-bed', p.habitaciones, t.fHabitaciones],
		['icon-bath', p.banos, t.fBanos],
		['icon-car', p.parqueos, t.fParqueos],
		['icon-construccion', p.m2Construccion && (en ? `${Math.round(p.m2Construccion * M2_A_FT2).toLocaleString('en-US')} sq ft` : `${cifra(p.m2Construccion)} m²`), t.fConstruccion],
		['icon-terreno', p.m2Terreno && (en ? `${Math.round(p.m2Terreno * M2_A_FT2).toLocaleString('en-US')} sq ft` : `${cifra(Math.round(p.m2Terreno * M2_A_V2))} v²`), t.fTerreno],
		['icon-map-marker', p.zona, p.ciudad || t.ubicacion]
	].filter(([, val]) => val);

	const body = `
	<header class="vip-header">
		<div class="container d-flex align-items-center justify-content-between">
			<a href="${r.inicio}" class="vip-logo"><img src="${esc(s.general.logo)}" alt="${esc(s.general.nombre)}" width="340" height="82"></a>
			<div class="d-flex gap-2">
				${ctx.altLang && p._alternates ? `<a href="${esc(ctx.altLang(propertyUrl(p), p))}" class="btn btn-sm btn-outline-light">${ic('globe')}${t.otroIdioma}</a>` : ''}
				<a href="${r.vip}" class="btn btn-sm btn-outline-light d-none d-md-inline-block">${ic('diamond')}${t.masVip}</a>
				${wa ? `<a href="${esc(wa)}" class="btn btn-sm btn-light" target="_blank" rel="noopener" data-track="Contact"><span class="icon-whatsapp me-1"></span> WhatsApp</a>` : ''}
			</div>
		</div>
	</header>

	<section class="vip-hero" style="${bgStyle(ctx, portada)}">
		<div class="vip-hero-inner container">
			<span class="vip-eyebrow">${ic('diamond')}${t.propiedadExclusiva} · ${esc(lugarDe(p))}</span>
			<h1>${esc(v.titular || p.titulo)}</h1>
			${v.subtitular ? `<p class="vip-sub">${esc(v.subtitular)}</p>` : ''}
			<p class="vip-price">${esc(precio)}</p>
			<div class="d-flex flex-wrap gap-3">
				<a href="#vip-contacto" class="btn btn-vip btn-lg">${ic('calendar')}${esc(cta)}</a>
				${wa ? `<a href="${esc(wa)}" class="btn btn-outline-light btn-lg" target="_blank" rel="noopener" data-track="Contact"><span class="icon-whatsapp me-1"></span> ${t.hablarAsesor}</a>` : ''}
			</div>
		</div>
	</section>

	${facts.length ? `<section class="vip-facts">
		<div class="container">
			<ul>
				${facts.map(([icon, val, label]) => `<li><span class="${icon}"></span><strong>${esc(val)}</strong><small>${esc(label)}</small></li>`).join('')}
			</ul>
		</div>
	</section>` : ''}

	<section class="vip-section">
		<div class="container">
			<div class="row g-4 g-lg-5 align-items-start">
				<div class="col-lg-7" data-aos="fade-up">
					<span class="vip-kicker">${ic('home')}${t.laPropiedad}</span>
					<h2 class="vip-h2">${esc(p.titulo)}</h2>
					<div class="vip-text">${md(ctx, p.descripcion)}</div>
				</div>
				${(v.puntosClave || []).length ? `<div class="col-lg-5" data-aos="fade-up" data-aos-delay="150">
					<div class="vip-highlights">
						<h3>${ic('star')}${t.unica}</h3>
						<ul>${v.puntosClave.map((h) => `<li><span class="icon-check"></span>${esc(h)}</li>`).join('')}</ul>
					</div>
				</div>` : ''}
			</div>
		</div>
	</section>

	${fotos.length > 1 ? `<section class="vip-section vip-dark">
		<div class="container">
			<span class="vip-kicker">${ic('camera')}${t.galeria}</span>
			<h2 class="vip-h2 mb-4">${t.recorre}</h2>
			<div class="vip-gallery">
				${fotos.map((f, i) => `<button type="button" class="vip-gallery-item${i === 0 ? ' is-wide' : ''}" data-index="${i}" aria-label="${t.verFoto} ${i + 1}"><img src="${esc(f.url)}" alt="${esc(photoAlt(p, i))}"${fotoAttrs(f.url, i ? '(max-width: 767px) 50vw, 33vw' : '(max-width: 767px) 100vw, 67vw')} loading="lazy" width="800" height="600"></button>`).join('\n')}
			</div>
		</div>
	</section>
	<dialog class="vip-lightbox" id="vip-lightbox" aria-label="${t.galeriaFotos}">
		<button type="button" class="vip-lb-close" aria-label="${t.cerrar}">${ic('close')}</button>
		<button type="button" class="vip-lb-prev" aria-label="${t.anterior}">${ic('chevron-left')}</button>
		<img alt="">
		<button type="button" class="vip-lb-next" aria-label="${t.siguiente}">${ic('chevron-right')}</button>
	</dialog>` : ''}

	${video ? `<section class="vip-section">
		<div class="container">
			<span class="vip-kicker">${ic('play-circle')}${t.video}</span>
			<h2 class="vip-h2 mb-4">${t.enMovimiento}</h2>
			<div class="ratio ratio-16x9 vip-video"><iframe src="${esc(video)}" title="${t.videoDe} ${esc(p.titulo)}" loading="lazy" allowfullscreen></iframe></div>
		</div>
	</section>` : ''}

	${(p.amenidades || []).length ? `<section class="vip-section bg-light">
		<div class="container">
			<span class="vip-kicker">${ic('check-square-o')}${t.amenidades}</span>
			<h2 class="vip-h2 mb-4">${t.todoIncluye}</h2>
			<ul class="vip-amenities">${p.amenidades.map((a) => `<li><span class="icon-check"></span>${esc(a)}</li>`).join('')}</ul>
		</div>
	</section>` : ''}

	${mapa ? `<section class="vip-section">
		<div class="container">
			<span class="vip-kicker">${ic('map-marker')}${t.ubicacion}</span>
			<h2 class="vip-h2 mb-4">${esc(lugarDe(p))}</h2>
			<div class="ratio ratio-21x9 vip-map"><iframe src="${esc(mapa)}" title="${t.mapaDe} ${esc(p.titulo)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
		</div>
	</section>` : ''}

	<section class="vip-section vip-contact" id="vip-contacto">
		<div class="container">
			<div class="row g-4 g-lg-5 align-items-center">
				<div class="col-lg-5">
					<span class="vip-kicker">${ic('calendar')}${t.visitaPrivada}</span>
					<h2 class="vip-h2">${esc(cta)}</h2>
					<p class="mb-4">${t.vipContactoTexto}</p>
					${agent ? `<div class="vip-agent">
						<img src="${esc(agent.foto || '/images/person_1-min.webp')}" alt="${esc(agent.nombre)}" loading="lazy" width="64" height="64">
						<div><strong>${esc(agent.nombre)}</strong><small>${esc(agent.cargo || t.asesorInmobiliario)}</small></div>
					</div>` : ''}
				</div>
				<div class="col-lg-6 offset-lg-1">
					<div class="lead-card">${leadForm({ origen: 'vip', property: p, agentId: p.agentId, boton: cta, visita: true, lang: ctx.lang })}</div>
				</div>
			</div>
		</div>
	</section>

	<footer class="vip-footer">
		<div class="container d-flex flex-wrap justify-content-between gap-3">
			<span>&copy; ${new Date().getFullYear()} ${esc(s.general.nombre)}</span>
			<span><a href="${r.inicio}">${t.inicio}</a> · <a href="${r.propiedades}">${t.propiedades}</a> · <a href="${r.vip}">VIP</a></span>
		</div>
	</footer>

	<div class="vip-sticky-cta d-md-none">
		<a href="#vip-contacto" class="btn btn-vip">${ic('calendar')}${esc(cta)}</a>
		${wa ? `<a href="${esc(wa)}" class="btn btn-success" target="_blank" rel="noopener" data-track="Contact" aria-label="WhatsApp"><span class="icon-whatsapp"></span></a>` : ''}
	</div>`;

	return layout(ctx, {
		path: propertyUrl(p),
		alternates: p._alternates,
		preloadImage: portada,
		title: (p.seo && p.seo.titulo) || `${v.titular || p.titulo} | ${t.propiedadExclusiva}`,
		description: (p.seo && p.seo.descripcion) || v.subtitular || seoDescription(p),
		image: portada,
		ogType: 'article',
		bare: true,
		jsonLd: [listingLd(ctx, p), breadcrumbLd(ctx, crumbs)],
		bodyAttrs: `class="vip-page" ${viewContentAttrs(p)}`,
		waMensaje: fmt(t.msgWaVip, { titulo: p.titulo, url: absUrl(ctx, propertyUrl(p)) })
	}, body);
}

// ---------------------------------------------------------------- Páginas de contenido

// Página «Vende o renta tu propiedad»: el formulario corto se abre debajo del botón, sin salir de la página.
const VENDE = '/vende-tu-propiedad/';
function vendeForm(ctx) {
	return `<details class="vende text-center">
		<summary class="btn btn-primary btn-lg">${ic('home')}${tr(ctx).vendeBoton}</summary>
		<div class="lead-card text-start">${leadForm({ origen: 'vende', corto: true, lang: ctx.lang })}</div>
	</details>`;
}

export function contentPage(ctx, page) {
	const crumbs = [{ name: tr(ctx).inicio, url: rt(ctx).inicio }, { name: page.titulo, url: page.url }];
	const body = `
	${pageHero(ctx, page.titulo, page.imagen || ctx.site.hero.imagenes[0] || '/images/hero_bg_1.webp', crumbs)}
	<div class="section">
		<div class="container">
			<div class="row justify-content-center">
				<article class="col-lg-8 content-page">${md(ctx, page.contenido)}
					${((page._alternates && page._alternates.es) || page.url) === VENDE ? vendeForm(ctx) : ''}</article>
			</div>
		</div>
	</div>`;
	return layout(ctx, {
		path: page.url,
		alternates: page._alternates,
		title: (page.seo && page.seo.titulo) || `${page.titulo} | ${ctx.site.general.nombreCorto}`,
		description: (page.seo && page.seo.descripcion) || stripMarkdown(page.contenido),
		image: page.imagen,
		jsonLd: [breadcrumbLd(ctx, crumbs), faqLd(page)].filter(Boolean)
	}, body);
}

// Página de la calculadora de renta (/calculadora-de-renta/, /en/rental-calculator/).
const RENTA_JS = '<script src="__RENTA_BUNDLE__" defer></script>';
export function rentalCalculatorPage(ctx) {
	const t = tr(ctx);
	const url = rt(ctx).calculadora;
	const crumbs = [{ name: t.inicio, url: rt(ctx).inicio }, { name: t.rentaPagTitulo, url }];
	const body = `
	${pageHero(ctx, t.rentaPagTitulo, ctx.site.hero.imagenes[0] || '/images/hero_bg_1.webp', crumbs)}
	<div class="section renta-pagina">
		<div class="container">
			<div class="row justify-content-center g-4 g-lg-5">
				<div class="col-lg-7">
					<p class="renta-intro renta-intro-lg">${t.rentaPagLead}</p>
					${rentaWidget(ctx)}
				</div>
				<aside class="col-lg-5 col-xl-4">
					<div class="lead-card renta-lead">
						${leadForm({ origen: 'calculadora', titulo: t.rentaPagForm, lang: ctx.lang || 'es' })}
						<p class="renta-nota mb-0 mt-3">${t.rentaPagFormTexto}</p>
					</div>
				</aside>
			</div>
		</div>
	</div>`;
	return layout(ctx, {
		path: url,
		alternates: ctx.enActivo ? { es: RUTAS.es.calculadora, en: RUTAS.en.calculadora } : undefined,
		title: `${t.rentaPagMeta} | ${ctx.site.general.nombreCorto}`,
		description: t.rentaPagDesc,
		jsonLd: [breadcrumbLd(ctx, crumbs)],
		extraJs: RENTA_JS
	}, body);
}

function faqLd(page) {
	if (!/preguntas|faq/i.test(page.slug || page.url || '')) return null;
	const items = String(page.contenido || '').split(/^##\s+/m).slice(1).map((bloque) => {
		const [pregunta, ...resto] = bloque.split('\n');
		return { pregunta: pregunta.trim(), respuesta: stripMarkdown(resto.join('\n')).trim() };
	}).filter((x) => x.pregunta.endsWith('?') && x.respuesta);
	if (items.length < 2) return null;
	return {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: items.map((x) => ({ '@type': 'Question', name: x.pregunta, acceptedAnswer: { '@type': 'Answer', text: x.respuesta } }))
	};
}

// ---------------------------------------------------------------- Blog

function postDate(post, ctx) {
	const d = new Date(post.fecha ? `${post.fecha}T12:00:00` : post.createdAt || Date.now());
	return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(tr(ctx).dateLocale, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function blogIndexPage(ctx) {
	const t = tr(ctx);
	const L = (ctx.site.listados && ctx.site.listados.blog) || {};
	const crumbs = [{ name: t.inicio, url: rt(ctx).inicio }, { name: t.blog, url: rt(ctx).blog }];
	const body = `
	${pageHero(ctx, L.h1 || 'Blog', ctx.site.hero.imagenes[1] || ctx.site.hero.imagenes[0] || '/images/hero_bg_2.webp', crumbs)}
	<div class="section">
		<div class="container">
			<div class="row">
				${ctx.posts.length ? ctx.posts.map((post) => `<div class="col-md-6 col-lg-4 mb-5">
					<article class="post-card">
						<a href="${esc(post.url)}" class="post-card-img"><img src="${esc(post.imagen || '/images/hero_bg_1.webp')}" alt="${esc(post.titulo)}"${fotoAttrs(post.imagen, SIZES_TARJETA, [480, 800])} loading="lazy" width="800" height="533"></a>
						<div class="post-card-body">
							<time class="small text-black-50" datetime="${esc(post.fecha || '')}">${ic('calendar')}${esc(postDate(post, ctx))}</time>
							<h2 class="h5 mt-2"><a href="${esc(post.url)}">${esc(post.titulo)}</a></h2>
							<p class="text-black-50 small">${esc(truncate(post.resumen || stripMarkdown(post.contenido), 150))}</p>
							<a href="${esc(post.url)}" class="small fw-semibold">${t.leerMas}<span class="visually-hidden">: ${esc(post.titulo)}</span>${ic('arrow-right', true)}</a>
						</div>
					</article>
				</div>`).join('\n') : `<p class="text-center text-black-50">${t.blogPronto}</p>`}
			</div>
		</div>
	</div>`;
	return layout(ctx, {
		path: rt(ctx).blog,
		title: L.titulo || `${t.blogTitulo} | ${ctx.site.general.nombreCorto}`,
		description: L.descripcion || t.blogDesc,
		jsonLd: [breadcrumbLd(ctx, crumbs)]
	}, body);
}

export function blogPostPage(ctx, post) {
	const t = tr(ctx);
	const crumbs = [{ name: t.inicio, url: rt(ctx).inicio }, { name: t.blog, url: rt(ctx).blog }, { name: post.titulo, url: post.url }];
	const description = (post.seo && post.seo.descripcion) || post.resumen || stripMarkdown(post.contenido);
	const articleLd = {
		'@context': 'https://schema.org',
		'@type': 'BlogPosting',
		headline: post.titulo,
		inLanguage: t.htmlLang,
		description: truncate(description, 300),
		image: post.imagen ? absUrl(ctx, post.imagen) : undefined,
		datePublished: post.fecha || post.createdAt || undefined,
		dateModified: post.updatedAt || post.fecha || undefined,
		author: { '@type': post.autor ? 'Person' : 'Organization', name: post.autor || ctx.site.general.nombre },
		publisher: { '@type': 'Organization', '@id': orgId(ctx), name: ctx.site.general.nombre, logo: { '@type': 'ImageObject', url: absUrl(ctx, ctx.site.general.logoGoogle || '/logo-equipo-inmobiliario.png') } },
		mainEntityOfPage: absUrl(ctx, post.url)
	};
	const others = ctx.posts.filter((o) => o.id !== post.id).slice(0, 3);
	const body = `
	${pageHero(ctx, post.titulo, post.imagen || ctx.site.hero.imagenes[0] || '/images/hero_bg_1.webp', crumbs)}
	<div class="section">
		<div class="container">
			<div class="row justify-content-center">
				<article class="col-lg-8 content-page">
					<p class="small text-black-50 mb-4">${ic('calendar')}${esc(postDate(post, ctx))}${post.autor ? ` · ${ic('user')}${esc(post.autor)}` : ''}</p>
					${md(ctx, post.contenido)}
					<div class="lead-card mt-5">${leadForm({ origen: 'blog', titulo: t.blogLead, lang: ctx.lang })}</div>
				</article>
			</div>
		</div>
	</div>
	${others.length ? `<div class="section bg-light">
		<div class="container">
			<h2 class="font-weight-bold text-primary heading mb-5">${ic('newspaper-o')}${t.masArticulos}</h2>
			<div class="row">${others.map((o) => `<div class="col-md-4 mb-4"><a class="d-block fw-semibold" href="${esc(o.url)}">${esc(o.titulo)}</a><span class="small text-black-50">${ic('calendar')}${esc(postDate(o, ctx))}</span></div>`).join('')}</div>
		</div>
	</div>` : ''}`;
	return layout(ctx, {
		path: post.url,
		alternates: post._alternates,
		title: (post.seo && post.seo.titulo) || `${post.titulo} | Blog ${ctx.site.general.nombreCorto}`,
		description,
		image: post.imagen,
		ogType: 'article',
		jsonLd: [articleLd, breadcrumbLd(ctx, crumbs)]
	}, body);
}

// Página del cliente con su solicitud de reserva y el chat (js/reserva-chat.js la llena con el token del enlace).
// Fuera de Google y del sitemap: solo llega quien tiene su enlace.
export function reservaPage(ctx) {
	const t = tr(ctx);
	const textos = Object.fromEntries(['es', 'en'].map((l) => [l, Object.fromEntries(Object.entries(TEXTOS[l]).filter(([k]) => /^vac(Chat|Noche1|NochesN|Huesped1|HuespedesN)/.test(k)))]));
	const dato = (icono, k) => `<li>${ic(icono)}<span data-out="${k}"></span></li>`;
	const body = `
	<div class="ficha">
		<div class="container">
			<div class="row justify-content-center">
				<div class="col-lg-7">
					<nav aria-label="breadcrumb" class="ficha-migas">
						<ol class="breadcrumb"><li class="breadcrumb-item"><a href="${rt(ctx).inicio}">${ic('home')}${t.inicio}</a></li><li class="breadcrumb-item active" aria-current="page">${t.vacChatTitulo}</li></ol>
					</nav>
					<h1 class="ficha-titulo mb-4">${t.vacChatTitulo}</h1>
					<section class="lead-card vac-chat" id="reserva-chat">
						<script type="application/json" class="vac-chat-textos">${JSON.stringify(textos).replace(/</g, '\\u003c')}</script>
						<p class="vac-chat-estado mb-0" role="status">${t.vacChatCargando}</p>
						<div class="vac-chat-cuerpo" hidden>
							<header class="vac-chat-cabeza">
								<a class="vac-chat-foto" data-out="casa" hidden><img alt="" width="96" height="72" loading="lazy"></a>
								<div>
									<p class="vac-chat-sello" data-out="estado">${ic('clock-o')}${ic('check-circle')}${ic('ban')}${ic('money')}<span></span></p>
									<h2 class="h5 mb-0" data-out="titulo"></h2>
								</div>
								<p class="vac-chat-sigue" data-out="sigue" role="status"></p>
								<ul class="vac-chat-datos">${dato('hashtag', 'codigo')}${dato('calendar', 'fechas')}${dato('moon-o', 'noches')}${dato('users', 'huespedes')}${dato('money', 'total')}</ul>
							</header>
							<ol class="vac-chat-mensajes" aria-live="polite"></ol>
							<form class="vac-chat-form">
								<input type="file" accept="image/jpeg,image/png,image/webp" hidden>
								<button type="button" class="btn btn-outline-primary btn-ico vac-chat-adjuntar">${ic('camera')}</button>
								<textarea class="form-control" rows="2" maxlength="1000" required></textarea>
								<button type="submit" class="btn btn-primary btn-ico">${ic('paper-plane')}</button>
							</form>
							<p class="vac-chat-aviso" role="status"></p>
							<p class="vac-nota">${ic('lock')}<span data-out="nota"></span></p>
						</div>
					</section>
				</div>
			</div>
		</div>
	</div>`;
	// Mismo marco que la ficha (sin portada): la conversación es lo primero que se ve. Sin WhatsApp flotante: aquí se conversa en la página.
	return layout(ctx, { path: '/reserva/', title: `${t.vacChatTitulo} | ${ctx.site.general.nombreCorto}`, noindex: true, extraJs: VAC_JS, bodyAttrs: 'class="pagina-ficha"', sinFlotante: true }, body);
}

export function notFoundPage(ctx) {
	const t = tr(ctx);
	const body = `
	${pageHero(ctx, t.noEncontrada, ctx.site.hero.imagenes[0] || '/images/hero_bg_1.webp', [{ name: t.inicio, url: rt(ctx).inicio }, { name: 'Error 404', url: '/404.html' }])}
	<div class="section">
		<div class="container text-center">
			<span class="icon-compass pagina-404-icono" aria-hidden="true"></span>
				<p class="mb-4">${t.noExiste}</p>
			<a href="${rt(ctx).propiedades}" class="btn btn-primary btn-lg">${ic('search')}${t.verPropiedades}</a>
		</div>
	</div>`;
	return layout(ctx, { path: '/404.html', title: `${t.noEncontrada} | ${ctx.site.general.nombreCorto}`, noindex: true }, body);
}

// ——— Propietarios y colaboradores (/propietarios/ y /en/owners/) ———
// Antes era el portal sin contraseña (enlace por WhatsApp o por correo); ahora todo está en el panel. La página queda
// para los enlaces que ya están en los WhatsApp de los dueños: dice a dónde ir. No se indexa ni va en el sitemap.
export function portalPage(ctx) {
	const t = tr(ctx);
	const path = ctx.lang === 'en' ? '/en/owners/' : '/propietarios/';
	const wa = whatsappLink(ctx.site.contacto.whatsapp, t.duenosMsgWa);
	const body = `
	${pageHero(ctx, t.duenosTitulo, ctx.site.hero.imagenes[0] || '/images/hero_bg_1.webp', [{ name: t.inicio, url: rt(ctx).inicio }, { name: t.duenosTitulo, url: path }])}
	<div class="section">
		<div class="container text-center">
			<span class="icon-key pagina-404-icono" aria-hidden="true"></span>
			<h2 class="h4 mb-3">${t.duenosLead}</h2>
			<p class="mb-4">${t.duenosTexto}</p>
			<a href="/admin/" class="btn btn-primary btn-lg">${ic('sign-in')}${t.duenosEntrar}</a>
			<p class="mt-4 mb-3">${t.duenosPrimeraVez}</p>
			${wa ? `<a href="${esc(wa)}" class="btn btn-success" target="_blank" rel="noopener">${ic('whatsapp')}${t.duenosPedir}</a>` : ''}
		</div>
	</div>`;
	return layout(ctx, {
		path,
		title: `${t.duenosTitulo} | ${ctx.site.general.nombreCorto}`,
		description: t.duenosLead,
		noindex: true,
		alternates: ctx.enActivo ? { es: '/propietarios/', en: '/en/owners/' } : null,
		// Los enlaces viejos llevan el id del resumen después de «#t=»: sin Analytics ni nada que lo mande a terceros.
		noReferrer: true,
		sinRastreo: true,
		// El WhatsApp ya está en la página («Pedir mi acceso»): sin el flotante, que tapaba el texto.
		sinFlotante: true
	}, body);
}
