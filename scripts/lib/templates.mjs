// Plantillas HTML del sitio público. Cada función devuelve un string.
import {
	esc, formatPrice, TIPOS, ESTADOS, plural, truncate, markdown, stripMarkdown,
	videoEmbedUrl, mapEmbedUrl, whatsappLink
} from './util.mjs';
import { TEXTOS, RUTAS, TIPOS_EN, ESTADOS_EN, M2_A_FT2 } from './i18n.mjs';

// Idioma: ctx.lang ('es' por defecto); las propiedades traducidas llevan p._lang = 'en'.
const tr = (ctx) => TEXTOS[(ctx && ctx.lang) || 'es'];
const rt = (ctx) => RUTAS[(ctx && ctx.lang) || 'es'];
const lng = (p) => p._lang || 'es';
const price = (p) => formatPrice(p.precio, p.moneda, p.operacion, lng(p));
const tipoLabel = (p) => (lng(p) === 'en' ? TIPOS_EN[p.tipo] : TIPOS[p.tipo]) || p.tipo;
const estadoLabel = (p) => (lng(p) === 'en' ? ESTADOS_EN[p.estado] : ESTADOS[p.estado]) || p.estado;
// Superficie: m² en español; pies cuadrados (con m²) en inglés.
const area = (m2, lang) => (lang === 'en'
	? `${Math.round(m2 * M2_A_FT2).toLocaleString('en-US')} sq ft (${m2} m²)`
	: `${m2} m²`);

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

function photoAlt(p, i = 0) {
	const foto = p.fotos && p.fotos[i];
	return (foto && foto.alt) || `${p.titulo} – ${lng(p) === 'en' ? 'photo' : 'foto'} ${i + 1}`;
}

// Fondo con variante liviana para celulares cuando existe (/images/x-800.webp).
function bgStyle(ctx, url) {
	const mobile = ctx.mobileVariant(url);
	return `--bg:url('${esc(url)}')${mobile ? `;--bg-m:url('${esc(mobile)}')` : ''}`;
}

function preloadTags(ctx, url) {
	if (!url) return '';
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
		out += `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${gtagIds.map((id) => `gtag('config',${JSON.stringify(id)});`).join('')}</script>\n`;
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
	const title = page.title || site.seo.titulo;
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
	<meta name="theme-color" content="#101317">
	${preloadTags(ctx, page.preloadImage)}
	<link rel="stylesheet" href="__CSS_BUNDLE__">
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link rel="preload" as="style" href="${FONTS_URL}" onload="this.onload=null;this.rel='stylesheet'">
	<noscript><link rel="stylesheet" href="${FONTS_URL}"></noscript>
	${trackingHead(site)}
	${(page.jsonLd || []).map(jsonLd).join('\n\t')}
	<script>window.EQ_CONFIG=${JSON.stringify(ctx.publicConfig).replace(/</g, '\\u003c')};</script>
</head>`;
}

function nav(ctx, active) {
	const site = ctx.site;
	const hasVip = ctx.properties.some((p) => p.vip);
	// El enlace de contacto se muestra como el botón de acción de la barra.
	const items = (site.navegacion || []).map((it) => {
		const cls = [it.enlace === active ? 'active' : '', /#conta/.test(it.enlace || '') ? 'nav-cta' : ''].filter(Boolean).join(' ');
		return `<li${cls ? ` class="${cls}"` : ''}><a href="${esc(it.enlace)}"${it.enlace === active ? ' aria-current="page"' : ''}>${esc(it.texto)}</a></li>`;
	});
	const t = tr(ctx);
	const r = rt(ctx);
	const propActive = active && active.startsWith(r.propiedades) ? ' active' : '';
	const propMenu = `<li class="has-children${propActive}">
								<a href="${r.propiedades}">${t.propiedades}</a>
								<ul class="dropdown">
									<li><a href="${r.venta}">${t.comprar}</a></li>
									<li><a href="${r.renta}">${t.rentar}</a></li>
									${hasVip ? `<li><a href="${r.vip}">${t.propiedadesVip}</a></li>` : ''}
									<li><a href="${r.propiedades}">${t.verTodas}</a></li>
								</ul>
							</li>`;
	items.splice(Math.min(1, items.length), 0, propMenu);
	// Selector de idioma segmentado: el idioma actual queda marcado y el otro enlaza a la página equivalente.
	const cta = items.findIndex((it) => it.includes('nav-cta'));
	const ctaItem = cta >= 0 ? items.splice(cta, 1)[0] : '';
	if (ctx.altLang) {
		const otro = `<a href="${esc(ctx.altLang(active))}" hreflang="${ctx.lang === 'en' ? 'es' : 'en'}" lang="${ctx.lang === 'en' ? 'es' : 'en'}" aria-label="${t.otroIdiomaLabel}">${t.otroIdioma}</a>`;
		const actual = `<span aria-current="true">${ctx.lang === 'en' ? 'EN' : 'ES'}</span>`;
		items.push(`<li class="lang-switch">${ctx.lang === 'en' ? otro + actual : actual + otro}</li>`);
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
		<div class="container">
			<div class="menu-bg-wrap">
				<a href="${rt(ctx).inicio}" class="logo nav-brand"><svg class="nav-mark" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="5"/><path fill="currentColor" d="M50 24 77 50h-8v25H56V61H44v14H31V50h-8Z M61 29h7v13l-7-6.5Z"/></svg><span>${esc(site.general.nombre.replace(/\s*S\.A\.?$/i, ""))}</span></a>
				<div class="site-navigation">
					<ul class="js-clone-nav d-none d-lg-flex site-menu">
						${items.join('\n\t\t\t\t\t\t')}
					</ul>
					<a href="#" class="burger light site-menu-toggle js-menu-toggle d-inline-block d-lg-none" aria-label="${tr(ctx).abrirMenu}">
						<span></span>
					</a>
				</div>
			</div>
		</div>
	</nav>`;
}

function socialLinks(site) {
	const r = site.redes || {};
	const map = [
		['instagram', 'icon-instagram', 'Instagram'],
		['facebook', 'icon-facebook', 'Facebook'],
		['linkedin', 'icon-linkedin', 'LinkedIn'],
		['youtube', 'icon-youtube-play', 'YouTube'],
		['tiktok', 'icon-play', 'TikTok']
	];
	return map
		.filter(([k]) => r[k])
		.map(([k, icon, label]) => `<li><a href="${esc(r[k])}" target="_blank" rel="noopener" aria-label="${label}"><span class="${icon}"></span></a></li>`)
		.join('');
}

function footer(ctx) {
	const site = ctx.site;
	const t = tr(ctx);
	const c = site.contacto || {};
	const hasVip = ctx.properties.some((p) => p.vip);
	const links = (site.footer.enlaces || []).filter((l) => hasVip || l.enlace !== rt(ctx).vip);
	const pageLinks = ctx.pages.filter((p) => p.enFooter);
	if (ctx.posts.length) pageLinks.unshift({ url: rt(ctx).blog, titulo: t.blog });
	const wa = whatsappLink(c.whatsapp, site.whatsappFlotante && site.whatsappFlotante.mensaje);
	return `<div class="site-footer">
		<div class="container">
			<div class="row">
				<div class="col-lg-4">
					<div class="widget">
						<h3>${esc(site.general.nombre)}</h3>
						${site.footer.texto ? `<p>${esc(site.footer.texto)}</p>` : ''}
						<ul class="list-unstyled links">
							${c.telefono ? `<li><a href="tel:${esc(c.telefono.replace(/[^\d+]/g, ''))}">${esc(c.telefono)}</a></li>` : ''}
							${wa ? `<li><a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a></li>` : ''}
							${c.email ? `<li><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>` : ''}
							${c.direccion ? `<li>${esc(c.direccion)}</li>` : ''}
							${c.horario ? `<li>${esc(c.horario)}</li>` : ''}
						</ul>
					</div>
				</div>
				<div class="col-lg-4">
					<div class="widget">
						<h3>${t.enlaces}</h3>
						<ul class="list-unstyled float-start links me-5">
							${links.map((l) => `<li><a href="${esc(l.enlace)}">${esc(l.texto)}</a></li>`).join('')}
						</ul>
						${pageLinks.length ? `<ul class="list-unstyled float-start links">
							${pageLinks.map((p) => `<li><a href="${esc(p.url)}">${esc(p.titulo)}</a></li>`).join('')}
						</ul>` : ''}
					</div>
				</div>
				<div class="col-lg-4">
					<div class="widget">
						<h3>${t.siguenos}</h3>
						<ul class="list-unstyled social">${socialLinks(site)}</ul>
						${ctx.zonas.length ? `<h3 class="mt-4">${t.zonas}</h3>
						<ul class="list-unstyled links">
							${ctx.zonas.slice(0, 8).map((z) => `<li><a href="${esc(z.url)}" title="${t.propiedades} ${esc(z.nombre)}">${esc(z.nombre)}</a></li>`).join('')}
						</ul>` : ''}
					</div>
				</div>
			</div>
			<div class="row mt-5">
				<div class="col-12 text-center">
					<p>Copyright &copy; ${new Date().getFullYear()} ${esc(String(site.general.nombre).replace(/\.$/, ''))}. ${t.derechos}
					<small class="d-block mt-2 text-black-50">${t.plantilla} <a href="https://untree.co" rel="noopener">Untree.co</a></small></p>
				</div>
			</div>
		</div>
	</div>`;
}

function whatsappFloat(ctx, mensaje) {
	const site = ctx.site;
	if (!site.whatsappFlotante || !site.whatsappFlotante.visible) return '';
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
	return `${head(ctx, page)}
<body${bodyAttrs}>
	${trackingBody(ctx.site)}
	${page.bare ? '' : nav(ctx, page.path)}
	${body}
	${page.bare ? '' : footer(ctx)}
	${whatsappFloat(ctx, page.waMensaje)}
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
					<h1 class="heading" data-aos="fade-up">${esc(title)}</h1>
					<nav aria-label="breadcrumb" data-aos="fade-up" data-aos-delay="200">
						<ol class="breadcrumb text-center justify-content-center">
							${crumbs.map((c, i) => i === crumbs.length - 1
								? `<li class="breadcrumb-item active text-white-50" aria-current="page">${esc(c.name)}</li>`
								: `<li class="breadcrumb-item"><a href="${esc(c.url)}">${esc(c.name)}</a></li>`).join('')}
						</ol>
					</nav>
				</div>
			</div>
		</div>
	</div>`;
}

function specs(p) {
	const t = TEXTOS[lng(p)];
	const out = [];
	if (p.habitaciones) out.push(`<span class="d-block d-flex align-items-center me-3"><span class="icon-bed me-2"></span><span class="caption">${plural(p.habitaciones, t.habitacion, t.habitaciones)}</span></span>`);
	if (p.banos) out.push(`<span class="d-block d-flex align-items-center me-3"><span class="icon-bath me-2"></span><span class="caption">${plural(p.banos, t.bano, t.banos)}</span></span>`);
	if (!out.length && p.m2Terreno) out.push(`<span class="d-block d-flex align-items-center"><span class="icon-expand me-2"></span><span class="caption">${esc(area(p.m2Terreno, lng(p)))}</span></span>`);
	return out.length ? `<div class="specs d-flex flex-wrap mb-4">${out.join('')}</div>` : '';
}

function estadoBadge(p, inline = false) {
	const parts = [];
	if (p.vip) parts.push('<span class="prop-badge prop-badge-vip">VIP</span>');
	const t = TEXTOS[lng(p)];
	parts.push(`<span class="prop-badge">${p.operacion === 'renta' ? t.enRenta : t.enVenta}</span>`);
	if (p.estado && p.estado !== 'disponible') parts.push(`<span class="prop-badge prop-badge-estado">${esc(estadoLabel(p))}</span>`);
	return `<div class="prop-badges${inline ? ' prop-badges-inline' : ''}">${parts.join('')}</div>`;
}

export function propertyCard(p, { lazy = true } = {}) {
	const url = propertyUrl(p);
	const data = [
		['operacion', p.operacion], ['tipo', p.tipo], ['zona', p.zona], ['precio', p.precio || 0],
		['habitaciones', p.habitaciones || 0], ['fecha', p.fechaOrden || 0],
		['texto', `${p.titulo} ${p.zona} ${p.ciudad} ${p.direccion} ${tipoLabel(p)}`.toLowerCase()]
	].map(([k, v]) => `data-${k}="${esc(v ?? '')}"`).join(' ');
	return `<div class="property-item" ${data}>
								<a href="${url}" class="img">
									<img src="${esc(firstPhoto(p))}" alt="${esc(photoAlt(p))}" class="img-fluid"${lazy ? ' loading="lazy"' : ''} width="800" height="600">
									${estadoBadge(p)}
								</a>
								<div class="property-content">
									<div class="price mb-2"><span>${esc(price(p))}</span></div>
									<div>
										<span class="d-block mb-2 text-black-50">${esc(p.titulo)}</span>
										<span class="city d-block mb-3">${esc([p.zona, p.ciudad].filter(Boolean).join(', '))}</span>
										${specs(p)}
										<a href="${url}" class="btn btn-primary py-2 px-3">${TEXTOS[lng(p)].verDetalles}<span class="visually-hidden">: ${esc(p.titulo)}</span></a>
									</div>
								</div>
							</div>`;
}

export function leadForm({ origen, property = null, agentId = '', titulo = '', boton = '', dark = false, visita = false, lang = 'es' }) {
	const t = TEXTOS[lang];
	const pid = property ? property.id : '';
	const ptitle = property ? property.titulo : '';
	const msg = property ? t.msgInteres(property.titulo) : '';
	return `<form class="lead-form${dark ? ' lead-form-dark' : ''}" data-origen="${esc(origen)}" data-property-id="${esc(pid)}" data-property-titulo="${esc(ptitle)}" data-agent-id="${esc(agentId)}" data-lang="${lang}" novalidate>
		${titulo ? `<h2 class="h5 mb-3">${esc(titulo)}</h2>` : ''}
		<div class="mb-3"><label class="form-label" for="lf-nombre-${esc(origen)}">${t.nombre} *</label><input id="lf-nombre-${esc(origen)}" class="form-control" name="nombre" required maxlength="100" autocomplete="name"></div>
		<div class="mb-3"><label class="form-label" for="lf-tel-${esc(origen)}">${t.telefono} *</label><input id="lf-tel-${esc(origen)}" class="form-control" name="telefono" type="tel" required maxlength="30" autocomplete="tel"${t.telefonoPh ? ` placeholder="${t.telefonoPh}"` : ''}></div>
		<div class="mb-3"><label class="form-label" for="lf-email-${esc(origen)}">${t.correo}</label><input id="lf-email-${esc(origen)}" class="form-control" name="email" type="email" maxlength="120" autocomplete="email"></div>
		<div class="mb-3"><label class="form-label" for="lf-msg-${esc(origen)}">${t.mensaje}</label><textarea id="lf-msg-${esc(origen)}" class="form-control" name="mensaje" rows="3" maxlength="2000">${esc(msg)}</textarea></div>
		${visita ? `<div class="row g-2 mb-3">
			<div class="col-sm-6"><label class="form-label" for="lf-tipo-${esc(origen)}">${t.tipoVisita}</label><select id="lf-tipo-${esc(origen)}" class="form-select" name="tipoVisita"><option value="presencial">${t.presencial}</option><option value="videollamada"${lang === 'en' ? ' selected' : ''}>${t.videollamada}</option></select></div>
			<div class="col-sm-6"><label class="form-label" for="lf-fecha-${esc(origen)}">${t.fechaVisita}</label><input id="lf-fecha-${esc(origen)}" class="form-control" name="fechaVisita" type="date"></div>
		</div>` : ''}
		<div class="hp-field" aria-hidden="true"><label>${t.empresa}<input name="empresa" tabindex="-1" autocomplete="off"></label></div>
		<button type="submit" class="btn btn-primary w-100 py-3">${esc(boton || t.enviar)}</button>
		<div class="lead-form-status mt-3" role="status" aria-live="polite"></div>
	</form>`;
}

function agentBox(ctx, agent, property) {
	if (!agent) return '';
	const t = tr(ctx);
	const msg = property ? t.msgAsesor(agent.nombre, property.titulo) : '';
	const wa = whatsappLink(agent.whatsapp || ctx.site.contacto.whatsapp, msg);
	return `<div class="d-block agent-box p-4">
						<div class="img mb-3"><img src="${esc(agent.foto || '/images/person_1-min.webp')}" alt="${esc(agent.nombre)}" class="img-fluid" loading="lazy" width="80" height="80"></div>
						<div class="text">
							<h3 class="mb-0">${esc(agent.nombre)}</h3>
							<div class="meta mb-3">${esc(agent.cargo || t.asesorInmobiliario)}</div>
							${agent.bio ? `<p>${esc(agent.bio)}</p>` : ''}
							<ul class="list-unstyled d-flex flex-wrap gap-2 mb-0">
								${wa ? `<li><a href="${esc(wa)}" class="btn btn-success btn-sm" target="_blank" rel="noopener" data-track="Contact"><span class="icon-whatsapp me-1"></span> WhatsApp</a></li>` : ''}
								${agent.email ? `<li><a href="mailto:${esc(agent.email)}" class="btn btn-outline-primary btn-sm" data-track="Contact">${t.correoBtn}</a></li>` : ''}
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
					<span class="exterior-kicker">${esc(b.etiqueta || '')}</span>
					<h2 class="font-weight-bold heading text-primary mb-3">${esc(b.titulo)}</h2>
					<p class="text-black-50 mb-4">${esc(b.texto)}</p>
					${b.enlace ? `<a href="${esc(b.enlace)}" class="btn btn-primary py-3 px-4">${esc(b.boton)}</a>` : ''}
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
		name: s.general.nombre,
		url: absUrl(ctx, r.inicio),
		logo: absUrl(ctx, s.general.logo),
		areaServed: { '@type': 'Country', name: 'Guatemala' },
		knowsLanguage: ['es', 'en'],
		image: absUrl(ctx, s.seo.imagen),
		telephone: s.contacto.telefono || undefined,
		email: s.contacto.email || undefined,
		address: { '@type': 'PostalAddress', streetAddress: s.contacto.direccion || undefined, addressLocality: 'Guatemala', addressCountry: 'GT' },
		sameAs: Object.values(s.redes || {}).filter(Boolean)
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
			${heroImgs.map((img) => `<div class="img overlay" style="${bgStyle(ctx, img)}"></div>`).join('\n\t\t\t')}
		</div>
		<div class="container">
			<div class="row justify-content-center align-items-center">
				<div class="col-lg-9 text-center">
					<h1 class="heading" data-aos="fade-up">${esc(s.hero.titulo)}</h1>
					<form action="${r.propiedades}" method="get" class="narrow-w form-search d-flex align-items-stretch mb-3" data-aos="fade-up" data-aos-delay="200" role="search">
						<label class="visually-hidden" for="hero-q">${t.buscarPropiedades}</label>
						<input id="hero-q" type="search" name="q" class="form-control px-4" placeholder="${esc(s.hero.placeholderBusqueda)}">
						<button type="submit" class="btn btn-primary">${t.buscar}</button>
					</form>
				</div>
			</div>
		</div>
	</div>

	${slider.length ? `<div class="section">
		<div class="container">
			<div class="row mb-5 align-items-center">
				<div class="col-lg-6">
					<h2 class="font-weight-bold text-primary heading">${esc(s.destacadas.titulo)}</h2>
				</div>
				<div class="col-lg-6 text-lg-end">
					<p><a href="${r.propiedades}" class="btn btn-primary text-white py-3 px-4">${esc(s.destacadas.boton)}</a></p>
				</div>
			</div>
			<div class="row">
				<div class="col-12">
					<div class="property-slider-wrap">
						<div class="property-slider">
							${slider.map((p, i) => propertyCard(p, { lazy: i > 2 })).join('\n')}
						</div>
						${slider.length > 1 ? `<div id="property-nav" class="controls" tabindex="0" aria-label="${t.navCarrusel}">
							<span class="prev" data-controls="prev" aria-controls="property" tabindex="-1">${t.anterior}</span>
							<span class="next" data-controls="next" aria-controls="property" tabindex="-1">${t.siguiente}</span>
						</div>` : ''}
					</div>
				</div>
			</div>
		</div>
	</div>` : ''}

	${s.features.visible ? `<section class="features-1">
		<div class="container">
			<div class="row">
				${(s.features.items || []).map((f, i) => `<div class="col-6 col-lg-3" data-aos="fade-up" data-aos-delay="${300 + i * 100}">
					<div class="box-feature">
						<span class="${esc(f.icono || 'flaticon-house')}"></span>
						<h3 class="mb-3">${esc(f.titulo)}</h3>
						<p>${esc(f.texto)}</p>
						${f.enlace ? `<p><a href="${esc(f.enlace)}" class="learn-more">${t.masInfo}<span class="visually-hidden"> ${t.sobre} ${esc(f.titulo)}</span></a></p>` : ''}
					</div>
				</div>`).join('\n')}
			</div>
		</div>
	</section>` : ''}

	${s.testimonios.visible && ctx.testimonials.length ? `<div class="section sec-testimonials">
		<div class="container">
			<div class="row mb-5 align-items-center">
				<div class="col-md-6">
					<h2 class="font-weight-bold heading text-primary mb-4 mb-md-0">${esc(s.testimonios.titulo)}</h2>
				</div>
				<div class="col-md-6 text-md-end">
					<div id="testimonial-nav">
						<span class="prev" data-controls="prev">${t.anterior}</span>
						<span class="next" data-controls="next">${t.siguiente}</span>
					</div>
				</div>
			</div>
			<div class="testimonial-slider-wrap">
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
			</div>
		</div>
	</div>` : ''}

	${s.servicios.visible ? `<div id="servicios" class="section section-4 bg-light">
		<div class="container">
			<div class="row justify-content-center text-center mb-5">
				<div class="col-lg-5">
					<h2 class="font-weight-bold heading text-primary mb-4">${esc(s.servicios.titulo)}</h2>
					<p class="text-black-50">${esc(s.servicios.subtitulo)}</p>
				</div>
			</div>
			<div class="row justify-content-between mb-5">
				<div class="col-lg-7 mb-5 mb-lg-0 order-lg-2">
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
			${s.contadores.visible ? `<div class="row section-counter mt-5">
				${(s.contadores.items || []).map((c, i) => `<div class="col-6 col-lg-3" data-aos="fade-up" data-aos-delay="${300 + i * 100}">
					<div class="counter-wrap mb-5 mb-lg-0">
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
				<h2 class="mb-4">${esc(s.cta.titulo)}</h2>
				<p><a href="${esc(s.cta.enlace)}" class="btn btn-primary text-white py-3 px-4">${esc(s.cta.boton)}</a></p>
			</div>
		</div>
	</div>` : ''}

	${s.asesores.visible && ctx.agents.length ? `<div id="asesores" class="section section-5 bg-light">
		<div class="container">
			<div class="row justify-content-center text-center mb-5">
				<div class="col-lg-6 mb-5">
					<h2 class="font-weight-bold heading text-primary mb-4">${esc(s.asesores.titulo)}</h2>
					<p class="text-black-50">${esc(s.asesores.subtitulo)}</p>
				</div>
			</div>
			<div class="row">
				${ctx.agents.map((a) => {
					const wa = whatsappLink(a.whatsapp);
					return `<div class="col-sm-6 col-lg-4 mb-5">
					<div class="h-100 person">
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

	<div id="${ctx.lang === 'en' ? 'contact' : 'contacto'}" class="section">
		<div class="container">
			<div class="row justify-content-between align-items-start">
				<div class="col-lg-5 mb-5">
					<h2 class="font-weight-bold heading text-primary mb-4">${esc(s.contacto.titulo)}</h2>
					<p class="text-black-50 mb-4">${esc(s.contacto.subtitulo)}</p>
					<ul class="list-unstyled contact-list">
						${s.contacto.telefono ? `<li><span class="icon-phone"></span><a href="tel:${esc(s.contacto.telefono.replace(/[^\d+]/g, ''))}" data-track="Contact">${esc(s.contacto.telefono)}</a></li>` : ''}
						${s.contacto.whatsapp ? `<li><span class="icon-whatsapp"></span><a href="${esc(whatsappLink(s.contacto.whatsapp))}" target="_blank" rel="noopener" data-track="Contact">WhatsApp</a></li>` : ''}
						${s.contacto.email ? `<li><span class="icon-envelope-square"></span><a href="mailto:${esc(s.contacto.email)}" data-track="Contact">${esc(s.contacto.email)}</a></li>` : ''}
						${s.contacto.direccion ? `<li><span class="icon-map-marker"></span>${esc(s.contacto.direccion)}</li>` : ''}
						${s.contacto.horario ? `<li><span class="icon-calendar-check-o"></span>${esc(s.contacto.horario)}</li>` : ''}
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

// ---------------------------------------------------------------- Listado

export function listingPage(ctx, { path, title, heading, description, operacion = '', zona = '', intro = '', alternates = null }) {
	const t = tr(ctx);
	const list = ctx.properties.filter((p) => (!operacion || p.operacion === operacion) && (!zona || p.zona === zona));
	const zonas = [...new Set(ctx.properties.map((p) => p.zona).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
	const tipos = [...new Set(ctx.properties.map((p) => p.tipo).filter(Boolean))];
	const crumbs = [{ name: t.inicio, url: rt(ctx).inicio }, { name: heading, url: path }];
	const itemListLd = {
		'@context': 'https://schema.org',
		'@type': 'ItemList',
		itemListElement: list.slice(0, 50).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: absUrl(ctx, propertyUrl(p)), name: p.titulo }))
	};

	const body = `
	${pageHero(ctx, heading, ctx.site.hero.imagenes[0] || '/images/hero_bg_1.webp', crumbs)}
	<div class="section">
		<div class="container">
			<form class="listing-filters row g-2 align-items-end mb-5" id="listing-filters" role="search" aria-label="${t.filtrar}">
				${ctx.site.ia && ctx.site.ia.busquedaPublica ? `<div class="col-12 ia-search">
					<label class="form-label" for="ia-texto">${t.busquedaInteligente}</label>
					<div class="input-group">
						<input class="form-control" id="ia-texto" maxlength="300" placeholder="${esc(t.iaPh)}">
						<button class="btn btn-primary" type="button" id="ia-buscar">${t.buscarIA}</button>
					</div>
					<p class="ia-search-status small mt-2 mb-0" aria-live="polite"></p>
				</div>` : ''}
				<div class="col-12 col-md-6 col-lg-4">
					<label class="form-label" for="f-q">${t.buscar}</label>
					<input class="form-control" id="f-q" name="q" type="search" placeholder="${t.buscarPh}">
				</div>
				<div class="col-6 col-md-3 col-lg-2">
					<label class="form-label" for="f-operacion">${t.operacion}</label>
					<select class="form-select" id="f-operacion" name="operacion">
						<option value="">${t.todas}</option>
						<option value="venta"${operacion === 'venta' ? ' selected' : ''}>${t.venta}</option>
						<option value="renta"${operacion === 'renta' ? ' selected' : ''}>${t.renta}</option>
					</select>
				</div>
				<div class="col-6 col-md-3 col-lg-3">
					<label class="form-label" for="f-tipo">${t.tipo}</label>
					<select class="form-select" id="f-tipo" name="tipo">
						<option value="">${t.todos}</option>
						${tipos.map((tp) => `<option value="${esc(tp)}">${esc((ctx.lang === 'en' ? TIPOS_EN[tp] : TIPOS[tp]) || tp)}</option>`).join('')}
					</select>
				</div>
				<div class="col-6 col-md-4 col-lg-3">
					<label class="form-label" for="f-zona">${t.zona}</label>
					<select class="form-select" id="f-zona" name="zona">
						<option value="">${t.todas}</option>
						${zonas.map((z) => `<option value="${esc(z)}"${z === zona ? ' selected' : ''}>${esc(z)}</option>`).join('')}
					</select>
				</div>
				<div class="col-6 col-md-4 col-lg-2">
					<label class="form-label" for="f-hab">${t.fHabitaciones}</label>
					<select class="form-select" id="f-hab" name="habitaciones">
						<option value="">${t.todas}</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option>
					</select>
				</div>
				<div class="col-12 col-md-4 col-lg-3">
					<label class="form-label" for="f-orden">${t.ordenar}</label>
					<select class="form-select" id="f-orden" name="orden">
						<option value="recientes">${t.recientes}</option>
						<option value="precio-asc">${t.precioAsc}</option>
						<option value="precio-desc">${t.precioDesc}</option>
					</select>
				</div>
				<div class="col-6 col-md-3 col-lg-2">
					<label class="form-label" for="f-min">${t.precioMin}</label>
					<input class="form-control" id="f-min" name="min" type="number" min="0" step="1000" inputmode="numeric">
				</div>
				<div class="col-6 col-md-3 col-lg-2">
					<label class="form-label" for="f-max">${t.precioMax}</label>
					<input class="form-control" id="f-max" name="max" type="number" min="0" step="1000" inputmode="numeric">
				</div>
				<div class="col-12 col-md-3 col-lg-3">
					<button type="reset" class="btn btn-outline-secondary w-100">${t.limpiar}</button>
				</div>
			</form>

			${intro ? `<p class="lead text-black-50 mb-4">${esc(intro)}</p>` : ''}
			<p class="text-black-50 mb-4" id="listing-count" aria-live="polite">${plural(list.length, t.propiedad, t.propiedadesN)}</p>

			<div class="row" id="listing-grid">
				${list.map((p) => `<div class="col-md-6 col-lg-4 mb-5 listing-col">${propertyCard(p)}</div>`).join('\n')}
			</div>
			<p class="text-center text-black-50 py-5" id="listing-empty"${list.length ? ' hidden' : ''}>${t.sinResultados} <a href="#contacto-listado">${t.cuentanos}</a> ${t.teAyudamos}</p>
			<nav class="custom-pagination text-center" id="listing-pagination" aria-label="${t.paginacion}"></nav>
		</div>
	</div>

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
		jsonLd: [breadcrumbLd(ctx, crumbs), itemListLd],
		preloadImage: ctx.site.hero.imagenes[0] || '/images/hero_bg_1.webp',
		bodyAttrs: `data-listing="1" data-preset-operacion="${esc(operacion)}" data-preset-zona="${esc(zona)}" data-base="${rt(ctx).propiedades}" data-ruta-venta="${rt(ctx).venta}" data-ruta-renta="${rt(ctx).renta}"`
	}, body);
}

// ---------------------------------------------------------------- Detalle

// Código corto para que el cliente cite la propiedad por teléfono o WhatsApp.
export function propertyCode(p) {
	return `EQ-${String(p.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()}`;
}

// Calculadora de cuota (sistema francés), referencial. Valores por defecto editables en el panel.
function mortgageCalculator(ctx, p) {
	const c = ctx.site.calculadora || {};
	const t = tr(ctx);
	if (c.visible === false || p.operacion === 'renta' || !p.precio) return '';
	return `<div class="calc-card mt-4" data-calc data-precio="${esc(p.precio)}" data-moneda="${esc(p.moneda || 'USD')}" data-lang="${ctx.lang || 'es'}">
						<h3 class="h5 mb-3">${t.calcTitulo}</h3>
						<div class="row g-2">
							<div class="col-4"><label class="form-label" for="calc-enganche">${t.enganche}</label><input id="calc-enganche" class="form-control" type="number" min="0" max="90" step="1" value="${esc(c.enganche ?? 20)}" name="enganche"></div>
							<div class="col-4"><label class="form-label" for="calc-tasa">${t.tasa}</label><input id="calc-tasa" class="form-control" type="number" min="0" max="30" step="0.1" value="${esc(c.tasa ?? 8.5)}" name="tasa"></div>
							<div class="col-4"><label class="form-label" for="calc-anios">${t.anios}</label><input id="calc-anios" class="form-control" type="number" min="1" max="40" step="1" value="${esc(c.anios ?? 20)}" name="anios"></div>
						</div>
						<p class="calc-result mt-3 mb-1" aria-live="polite"></p>
						<p class="small text-black-50 mb-0">${t.calcNota}</p>
					</div>`;
}

function factsList(p) {
	const t = TEXTOS[lng(p)];
	const en = lng(p) === 'en';
	const m2 = p.m2Construccion || p.m2Terreno;
	const rows = [
		[t.fTipo, tipoLabel(p)],
		[t.fOperacion, p.operacion === 'renta' ? t.renta : t.venta],
		[t.fEstado, estadoLabel(p)],
		[t.fHabitaciones, p.habitaciones],
		[t.fBanos, p.banos],
		[t.fParqueos, p.parqueos],
		[t.fConstruccion, p.m2Construccion ? area(p.m2Construccion, lng(p)) : ''],
		[t.fTerreno, p.m2Terreno ? area(p.m2Terreno, lng(p)) : ''],
		[t.fUbicacion, [p.direccion, p.zona, p.ciudad].filter(Boolean).join(', ')],
		[t.fPrecioM2, p.operacion !== 'renta' && p.precio && m2
			? formatPrice(Math.round(p.precio / (en ? m2 * M2_A_FT2 : m2)), p.moneda, 'venta', lng(p)) : ''],
		[t.fCodigo, propertyCode(p)]
	].filter(([, v]) => v);
	return `<dl class="prop-facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function listingLd(ctx, p) {
	const offer = {
		'@type': 'Offer',
		price: p.precio || undefined,
		priceCurrency: p.moneda || 'USD',
		availability: p.estado === 'disponible' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
		businessFunction: p.operacion === 'renta' ? 'http://purl.org/goodrelations/v1#LeaseOut' : 'http://purl.org/goodrelations/v1#Sell'
	};
	return {
		'@context': 'https://schema.org',
		'@type': 'RealEstateListing',
		name: p.titulo,
		description: truncate(stripMarkdown(p.descripcion), 300),
		url: absUrl(ctx, propertyUrl(p)),
		image: (p.fotos || []).map((f) => absUrl(ctx, f.url)),
		datePosted: p.createdAt || undefined,
		offers: offer,
		about: {
			'@type': p.tipo === 'apartamento' ? 'Apartment' : p.tipo === 'casa' ? 'SingleFamilyResidence' : 'Place',
			numberOfRooms: p.habitaciones || undefined,
			numberOfBathroomsTotal: p.banos || undefined,
			floorSize: p.m2Construccion ? { '@type': 'QuantitativeValue', value: p.m2Construccion, unitCode: 'MTK' } : undefined,
			address: { '@type': 'PostalAddress', streetAddress: p.direccion || undefined, addressLocality: [p.zona, p.ciudad].filter(Boolean).join(', '), addressCountry: 'GT' }
		}
	};
}

// Título automático que cabe en Google (~65 caracteres): se acorta quitando detalles.
export function autoSeoTitle(p) {
	const en = lng(p) === 'en';
	const op = en ? (p.operacion === 'renta' ? 'For Rent' : 'For Sale') : (p.operacion === 'renta' ? 'Renta' : 'Venta');
	const prep = en ? 'in' : 'en';
	const candidates = [
		`${p.titulo} | ${op} ${prep} ${[p.zona, p.ciudad].filter(Boolean).join(', ')}`,
		p.zona && `${p.titulo} | ${op} ${prep} ${p.zona}`,
		`${p.titulo} | ${op}`,
		p.titulo
	].filter(Boolean);
	return candidates.find((t) => t.length <= 65) || candidates[candidates.length - 1];
}

function seoTitle(p) {
	return (p.seo && p.seo.titulo) || autoSeoTitle(p);
}

function seoDescription(p) {
	const t = TEXTOS[lng(p)];
	return (p.seo && p.seo.descripcion) || `${price(p)}. ${[
		p.habitaciones && plural(p.habitaciones, t.habitacion, t.habitaciones),
		p.banos && plural(p.banos, t.bano, t.banos),
		p.m2Construccion && area(p.m2Construccion, lng(p))
	].filter(Boolean).join(', ')}. ${stripMarkdown(p.descripcion)}`;
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
						<button type="button" class="js-copy-link" data-url="${esc(url)}" aria-label="${t.copiarEnlace}"><span class="icon-external-link-square"></span></button>
					</div>`;
}

export function propertyPage(ctx, p) {
	const t = tr(ctx);
	const r = rt(ctx);
	const agent = ctx.agentsById[p.agentId];
	const fotos = (p.fotos && p.fotos.length) ? p.fotos : [{ url: firstPhoto(p) }];
	const crumbs = [{ name: t.inicio, url: r.inicio }, { name: t.propiedades, url: r.propiedades }, { name: p.titulo, url: propertyUrl(p) }];
	const video = videoEmbedUrl(p.video);
	const mapa = p.mapa ? mapEmbedUrl(p.mapa) : '';
	const related = ctx.properties
		.filter((o) => o.id !== p.id && (o.zona === p.zona || o.operacion === p.operacion))
		.slice(0, 3);
	const waMsg = t.msgWaFicha(p.titulo, absUrl(ctx, propertyUrl(p)));

	const body = `
	${pageHero(ctx, p.titulo, firstPhoto(p), crumbs)}
	<div class="section">
		<div class="container">
			<div class="row justify-content-between">
				<div class="col-lg-7 mb-5">
					<div class="img-property-slide-wrap">
						<div class="img-property-slide">
							${fotos.map((f, i) => `<img src="${esc(f.url)}" alt="${esc(photoAlt(p, i))}" class="img-fluid"${i ? ' loading="lazy"' : ''}>`).join('\n')}
						</div>
					</div>
					<div class="mt-5">
						<h2 class="h4 text-primary mb-3">${t.descripcion}</h2>
						<div class="prop-description">${markdown(p.descripcion)}</div>
					</div>
					${(p.amenidades || []).length ? `<div class="mt-4">
						<h2 class="h4 text-primary mb-3">${t.amenidades}</h2>
						<ul class="amenities-list">${p.amenidades.map((a) => `<li><span class="icon-check text-primary me-2"></span>${esc(a)}</li>`).join('')}</ul>
					</div>` : ''}
					${video ? `<div class="mt-4"><h2 class="h4 text-primary mb-3">${t.video}</h2><div class="ratio ratio-16x9"><iframe src="${esc(video)}" title="${t.videoDe} ${esc(p.titulo)}" loading="lazy" allowfullscreen></iframe></div></div>` : ''}
					${mapa ? `<div class="mt-4"><h2 class="h4 text-primary mb-3">${t.ubicacion}</h2><div class="ratio ratio-16x9"><iframe src="${esc(mapa)}" title="${t.mapaDe} ${esc(p.titulo)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></div>` : ''}
				</div>
				<div class="col-lg-4">
					<h2 class="heading text-primary">${esc(p.titulo)}</h2>
					<p class="meta">${esc([p.zona, p.ciudad].filter(Boolean).join(', '))}</p>
					<p class="prop-price">${esc(price(p))}</p>
					${shareButtons(ctx, p)}
					${estadoBadge(p, true)}
					${factsList(p)}
					${mortgageCalculator(ctx, p)}
					${agentBox(ctx, agent, p)}
					<div class="lead-card mt-4">${leadForm({ origen: 'propiedad', property: p, agentId: p.agentId, titulo: t.agendaVisita, boton: t.quieroInfo, visita: true, lang: ctx.lang })}</div>
				</div>
			</div>
		</div>
	</div>
	${related.length ? `<div class="section bg-light">
		<div class="container">
			<h2 class="font-weight-bold text-primary heading mb-5">${t.similares}</h2>
			<div class="row">${related.map((o) => `<div class="col-md-6 col-lg-4 mb-5">${propertyCard(o)}</div>`).join('')}</div>
		</div>
	</div>` : ''}`;

	return layout(ctx, {
		path: propertyUrl(p),
		alternates: p._alternates,
		preloadImage: firstPhoto(p),
		title: seoTitle(p),
		description: seoDescription(p),
		image: firstPhoto(p),
		ogType: 'article',
		jsonLd: [listingLd(ctx, p), breadcrumbLd(ctx, crumbs)],
		bodyAttrs: viewContentAttrs(p),
		waMensaje: waMsg
	}, body);
}

// ---------------------------------------------------------------- VIP

export function vipIndexPage(ctx) {
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
						<img src="${esc(firstPhoto(p))}" alt="${esc(photoAlt(p))}" loading="lazy">
						<span class="vip-card-body">
							<span class="prop-badge prop-badge-vip">VIP</span>
							<span class="vip-card-title">${esc((p.vipLanding && p.vipLanding.titular) || p.titulo)}</span>
							<span class="vip-card-meta">${esc([p.zona, p.ciudad].filter(Boolean).join(', '))}${p.vipLanding && p.vipLanding.ocultarPrecio ? '' : ` · ${esc(price(p))}`}</span>
						</span>
					</a>
				</div>`).join('\n') : `<p class="text-center text-black-50">${t.vipPronto} <a href="${r.contacto}">${t.contactanos}</a> ${t.paraConocerlas}</p>`}
			</div>
		</div>
	</div>`;
	return layout(ctx, {
		path: r.vip,
		alternates: ctx.enActivo ? { es: '/vip/', en: '/en/luxury/' } : null,
		title: L.titulo || `${t.vipTitulo} | ${ctx.site.general.nombreCorto}`,
		description: L.descripcion || t.vipDesc,
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
	const mapa = (v.mapa || p.mapa) ? mapEmbedUrl(v.mapa || p.mapa) : '';
	const precio = v.ocultarPrecio ? t.precioConsultar : price(p);
	const waNumber = (agent && agent.whatsapp) || s.contacto.whatsapp;
	const wa = whatsappLink(waNumber, t.msgWaVip(p.titulo, absUrl(ctx, propertyUrl(p))));
	const cta = v.ctaTexto || t.agendarPrivada;
	const crumbs = [{ name: t.inicio, url: r.inicio }, { name: t.propiedadesVip, url: r.vip }, { name: p.titulo, url: propertyUrl(p) }];
	const en = ctx.lang === 'en';
	const facts = [
		['icon-bed', p.habitaciones, t.fHabitaciones],
		['icon-bath', p.banos, t.fBanos],
		['icon-car', p.parqueos, t.fParqueos],
		['icon-home2', p.m2Construccion && (en ? `${Math.round(p.m2Construccion * M2_A_FT2).toLocaleString('en-US')} sq ft` : `${p.m2Construccion} m²`), t.fConstruccion],
		['icon-expand', p.m2Terreno && (en ? `${Math.round(p.m2Terreno * M2_A_FT2).toLocaleString('en-US')} sq ft` : `${p.m2Terreno} m²`), t.fTerreno],
		['icon-map-marker', p.zona, p.ciudad || t.ubicacion]
	].filter(([, val]) => val);

	const body = `
	<header class="vip-header">
		<div class="container d-flex align-items-center justify-content-between">
			<a href="${r.inicio}" class="vip-logo"><img src="${esc(s.general.logo)}" alt="${esc(s.general.nombre)}" width="340" height="82"></a>
			<div class="d-flex gap-2">
				${ctx.altLang && p._alternates ? `<a href="${esc(ctx.altLang(propertyUrl(p), p))}" class="btn btn-sm btn-outline-light">${t.otroIdioma}</a>` : ''}
				<a href="${r.vip}" class="btn btn-sm btn-outline-light d-none d-md-inline-block">${t.masVip}</a>
				${wa ? `<a href="${esc(wa)}" class="btn btn-sm btn-light" target="_blank" rel="noopener" data-track="Contact"><span class="icon-whatsapp me-1"></span> WhatsApp</a>` : ''}
			</div>
		</div>
	</header>

	<section class="vip-hero" style="${bgStyle(ctx, portada)}">
		<div class="vip-hero-inner container">
			<span class="vip-eyebrow" data-aos="fade-up">${t.propiedadExclusiva} · ${esc([p.zona, p.ciudad].filter(Boolean).join(', '))}</span>
			<h1 data-aos="fade-up" data-aos-delay="100">${esc(v.titular || p.titulo)}</h1>
			${v.subtitular ? `<p class="vip-sub" data-aos="fade-up" data-aos-delay="200">${esc(v.subtitular)}</p>` : ''}
			<p class="vip-price" data-aos="fade-up" data-aos-delay="250">${esc(precio)}</p>
			<div class="d-flex flex-wrap gap-3" data-aos="fade-up" data-aos-delay="300">
				<a href="#vip-contacto" class="btn btn-vip">${esc(cta)}</a>
				${wa ? `<a href="${esc(wa)}" class="btn btn-outline-light" target="_blank" rel="noopener" data-track="Contact"><span class="icon-whatsapp me-1"></span> ${t.hablarAsesor}</a>` : ''}
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
					<span class="vip-kicker">${t.laPropiedad}</span>
					<h2 class="vip-h2">${esc(p.titulo)}</h2>
					<div class="vip-text">${markdown(p.descripcion)}</div>
				</div>
				${(v.puntosClave || []).length ? `<div class="col-lg-5" data-aos="fade-up" data-aos-delay="150">
					<div class="vip-highlights">
						<h3>${t.unica}</h3>
						<ul>${v.puntosClave.map((h) => `<li><span class="icon-check"></span>${esc(h)}</li>`).join('')}</ul>
					</div>
				</div>` : ''}
			</div>
		</div>
	</section>

	${fotos.length > 1 ? `<section class="vip-section vip-dark">
		<div class="container">
			<span class="vip-kicker">${t.galeria}</span>
			<h2 class="vip-h2 mb-4">${t.recorre}</h2>
			<div class="vip-gallery">
				${fotos.map((f, i) => `<button type="button" class="vip-gallery-item${i === 0 ? ' is-wide' : ''}" data-index="${i}" aria-label="${t.verFoto} ${i + 1}"><img src="${esc(f.url)}" alt="${esc(photoAlt(p, i))}" loading="lazy"></button>`).join('\n')}
			</div>
		</div>
	</section>
	<dialog class="vip-lightbox" id="vip-lightbox" aria-label="${t.galeriaFotos}">
		<button type="button" class="vip-lb-close" aria-label="${t.cerrar}">&times;</button>
		<button type="button" class="vip-lb-prev" aria-label="${t.anterior}">&#8249;</button>
		<img alt="">
		<button type="button" class="vip-lb-next" aria-label="${t.siguiente}">&#8250;</button>
	</dialog>` : ''}

	${video ? `<section class="vip-section">
		<div class="container">
			<span class="vip-kicker">${t.video}</span>
			<h2 class="vip-h2 mb-4">${t.enMovimiento}</h2>
			<div class="ratio ratio-16x9 vip-video"><iframe src="${esc(video)}" title="${t.videoDe} ${esc(p.titulo)}" loading="lazy" allowfullscreen></iframe></div>
		</div>
	</section>` : ''}

	${(p.amenidades || []).length ? `<section class="vip-section bg-light">
		<div class="container">
			<span class="vip-kicker">${t.amenidades}</span>
			<h2 class="vip-h2 mb-4">${t.todoIncluye}</h2>
			<ul class="vip-amenities">${p.amenidades.map((a) => `<li><span class="icon-check"></span>${esc(a)}</li>`).join('')}</ul>
		</div>
	</section>` : ''}

	${mapa ? `<section class="vip-section">
		<div class="container">
			<span class="vip-kicker">${t.ubicacion}</span>
			<h2 class="vip-h2 mb-4">${esc([p.zona, p.ciudad].filter(Boolean).join(', '))}</h2>
			<div class="ratio ratio-21x9 vip-map"><iframe src="${esc(mapa)}" title="${t.mapaDe} ${esc(p.titulo)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
		</div>
	</section>` : ''}

	<section class="vip-section vip-contact" id="vip-contacto">
		<div class="container">
			<div class="row g-4 g-lg-5 align-items-center">
				<div class="col-lg-5">
					<span class="vip-kicker">${t.visitaPrivada}</span>
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
		<a href="#vip-contacto" class="btn btn-vip">${esc(cta)}</a>
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
		waMensaje: t.msgWaVip(p.titulo, absUrl(ctx, propertyUrl(p)))
	}, body);
}

// ---------------------------------------------------------------- Páginas de contenido

export function contentPage(ctx, page) {
	const crumbs = [{ name: tr(ctx).inicio, url: rt(ctx).inicio }, { name: page.titulo, url: page.url }];
	const body = `
	${pageHero(ctx, page.titulo, page.imagen || ctx.site.hero.imagenes[0] || '/images/hero_bg_1.webp', crumbs)}
	<div class="section">
		<div class="container">
			<div class="row justify-content-center">
				<article class="col-lg-8 content-page">${markdown(page.contenido)}</article>
			</div>
		</div>
	</div>`;
	return layout(ctx, {
		path: page.url,
		alternates: page._alternates,
		title: (page.seo && page.seo.titulo) || `${page.titulo} | ${ctx.site.general.nombreCorto}`,
		description: (page.seo && page.seo.descripcion) || stripMarkdown(page.contenido),
		image: page.imagen,
		jsonLd: [breadcrumbLd(ctx, crumbs)]
	}, body);
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
						<a href="${esc(post.url)}" class="post-card-img"><img src="${esc(post.imagen || '/images/hero_bg_1.webp')}" alt="${esc(post.titulo)}" loading="lazy"></a>
						<div class="post-card-body">
							<time class="small text-black-50" datetime="${esc(post.fecha || '')}">${esc(postDate(post, ctx))}</time>
							<h2 class="h5 mt-2"><a href="${esc(post.url)}">${esc(post.titulo)}</a></h2>
							<p class="text-black-50 small">${esc(truncate(post.resumen || stripMarkdown(post.contenido), 150))}</p>
							<a href="${esc(post.url)}" class="small fw-semibold">${t.leerMas}<span class="visually-hidden">: ${esc(post.titulo)}</span></a>
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
		publisher: { '@type': 'Organization', name: ctx.site.general.nombre, logo: { '@type': 'ImageObject', url: absUrl(ctx, ctx.site.general.logo) } },
		mainEntityOfPage: absUrl(ctx, post.url)
	};
	const others = ctx.posts.filter((o) => o.id !== post.id).slice(0, 3);
	const body = `
	${pageHero(ctx, post.titulo, post.imagen || ctx.site.hero.imagenes[0] || '/images/hero_bg_1.webp', crumbs)}
	<div class="section">
		<div class="container">
			<div class="row justify-content-center">
				<article class="col-lg-8 content-page">
					<p class="small text-black-50 mb-4">${esc(postDate(post, ctx))}${post.autor ? ` · ${esc(post.autor)}` : ''}</p>
					${markdown(post.contenido)}
					<div class="lead-card mt-5">${leadForm({ origen: 'blog', titulo: t.blogLead, lang: ctx.lang })}</div>
				</article>
			</div>
		</div>
	</div>
	${others.length ? `<div class="section bg-light">
		<div class="container">
			<h2 class="font-weight-bold text-primary heading mb-5">${t.masArticulos}</h2>
			<div class="row">${others.map((o) => `<div class="col-md-4 mb-4"><a class="d-block fw-semibold" href="${esc(o.url)}">${esc(o.titulo)}</a><span class="small text-black-50">${esc(postDate(o, ctx))}</span></div>`).join('')}</div>
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

export function notFoundPage(ctx) {
	const t = tr(ctx);
	const body = `
	${pageHero(ctx, t.noEncontrada, ctx.site.hero.imagenes[0] || '/images/hero_bg_1.webp', [{ name: t.inicio, url: rt(ctx).inicio }, { name: 'Error 404', url: '/404.html' }])}
	<div class="section">
		<div class="container text-center">
			<p class="mb-4">${t.noExiste}</p>
			<a href="${rt(ctx).propiedades}" class="btn btn-primary py-3 px-4">${t.verPropiedades}</a>
		</div>
	</div>`;
	return layout(ctx, { path: '/404.html', title: `${t.noEncontrada} | ${ctx.site.general.nombreCorto}`, noindex: true }, body);
}
