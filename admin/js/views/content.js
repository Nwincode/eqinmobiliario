import { db, doc, getDoc, setDoc, serverTimestamp } from '../firebase.js';
import { h, toast, showError, pageHeader , mount } from '../ui.js';
import { renderForm, getPath, setPath } from '../form.js';
import { markPending } from '../session.js';

const FLATICONS = [['flaticon-house', 'Casa'], ['flaticon-building', 'Edificio'], ['flaticon-house-1', 'Casa 2'], ['flaticon-house-2', 'Casa 3'], ['flaticon-house-3', 'Casa 4'], ['flaticon-house-4', 'Casa 5']];
const ICONS = [['icon-home2', 'Casa'], ['icon-person', 'Persona'], ['icon-security', 'Seguridad'], ['icon-check', 'Check'], ['icon-star', 'Estrella'], ['icon-map-marker', 'Ubicación'], ['icon-phone', 'Teléfono'], ['icon-credit-card', 'Financiamiento']];
const link = [{ name: 'texto', label: 'Texto', cols: 6 }, { name: 'enlace', label: 'Enlace', cols: 6, placeholder: '/propiedades/ o https://…' }];

// Cada grupo es una pestaña; `keys` son las claves de settings/site que edita.
const GROUPS = [
	{
		id: 'general', label: 'General', keys: ['general', 'whatsappFlotante'], fields: [
			{ name: 'general.nombre', label: 'Nombre de la empresa', cols: 6, required: true },
			{ name: 'general.nombreCorto', label: 'Nombre corto', cols: 6, help: 'Se usa en los títulos de las páginas.' },
			{ name: 'general.logo', label: 'Logo', type: 'image', cols: 6 },
			{ name: 'general.favicon', label: 'Ícono de pestaña (favicon)', type: 'image', cols: 6 },
			{ type: 'section', label: 'Botón flotante de WhatsApp' },
			{ name: 'whatsappFlotante.visible', label: 'Mostrar el botón', type: 'checkbox', cols: 4 },
			{ name: 'whatsappFlotante.mensaje', label: 'Mensaje inicial', cols: 8 }
		]
	},
	{
		id: 'google', label: 'Google y anuncios', keys: ['seo', 'tracking'], fields: [
			{ type: 'section', label: 'Google Search Console', help: 'Para que Google indexe el sitio y ver cómo te encuentran. En search.google.com/search-console agrega el dominio con "Prefijo de URL", elige el método "Etiqueta HTML" y pega aquí solo el código del atributo content. Luego envía el sitemap: /sitemap.xml' },
			{ name: 'seo.googleVerification', label: 'Código de verificación de Google', cols: 6, placeholder: 'p. ej. AbC123xyz…' },
			{ name: 'seo.bingVerification', label: 'Código de verificación de Bing (opcional)', cols: 6 },
			{ name: 'seo.indexar', label: 'Permitir que Google indexe el sitio', type: 'checkbox', default: true, help: 'Desactívalo solo si el sitio no debe aparecer en buscadores.' },
			{ type: 'section', label: 'Google Analytics 4', help: 'Mide visitas y conversiones. Si ya configuraste GA4 dentro de Google Tag Manager, deja este campo vacío para no contar doble.' },
			{ name: 'tracking.ga4Id', label: 'ID de medición de GA4', cols: 6, placeholder: 'G-XXXXXXXXXX' },
			{ type: 'section', label: 'Google Ads', help: 'Para medir qué anuncios generan clientes. En Google Ads → Objetivos → Conversiones crea una acción "Enviar formulario de clientes potenciales" (y opcional otra de "Contacto"), elige "Configurar con Google tag" y copia el ID (AW-…) y la etiqueta de conversión.' },
			{ name: 'tracking.adsId', label: 'ID de Google Ads', cols: 4, placeholder: 'AW-123456789' },
			{ name: 'tracking.adsLeadLabel', label: 'Etiqueta de conversión: formulario', cols: 4, placeholder: 'AbCdEfGh123' },
			{ name: 'tracking.adsContactLabel', label: 'Etiqueta de conversión: WhatsApp / llamada', cols: 4 },
			{ type: 'section', label: 'Meta (Facebook / Instagram) y Tag Manager' },
			{ name: 'tracking.pixelId', label: 'Meta Pixel (ID)', cols: 6, placeholder: '212605361803683', help: 'Envía PageView, ViewContent, Search, Contact y Lead automáticamente.' },
			{ name: 'tracking.gtmId', label: 'Google Tag Manager (ID)', cols: 6, placeholder: 'GTM-XXXXXXX' },
			{ type: 'section', label: 'Redirecciones 301', help: 'Para URLs viejas que ya están en Google (p. ej. de la web anterior). Los cambios de URL de propiedades se redirigen solos.' },
			{ name: 'seo.redirecciones', label: 'Redirecciones', type: 'list', itemLabel: 'Redirección', fields: [
				{ name: 'desde', label: 'Desde', cols: 6, placeholder: '/casa-zona-16-vieja/' },
				{ name: 'hacia', label: 'Hacia', cols: 6, placeholder: '/propiedad/casa-residencial-san-antonio-zona-16/' }] }
		]
	},
	{
		id: 'exterior', label: 'Compradores en EE. UU.', keys: ['bloqueExterior'], fields: [
			{ type: 'section', label: 'Bloque en la portada (español)', help: 'Para guatemaltecos que viven en Estados Unidos. Enlaza a la guía "Compra desde EE. UU.".' },
			{ name: 'bloqueExterior.visible', label: 'Mostrar', type: 'checkbox' },
			{ name: 'bloqueExterior.etiqueta', label: 'Etiqueta', cols: 6 },
			{ name: 'bloqueExterior.titulo', label: 'Título', cols: 6 },
			{ name: 'bloqueExterior.texto', label: 'Texto', type: 'textarea', rows: 3 },
			{ name: 'bloqueExterior.puntos', label: 'Puntos', type: 'tags' },
			{ name: 'bloqueExterior.boton', label: 'Texto del botón', cols: 6 },
			{ name: 'bloqueExterior.enlace', label: 'Enlace', cols: 6 }
		]
	},
	{
		id: 'ingles', label: 'Sitio en inglés', keys: ['en'], fields: [
			{ type: 'section', label: 'English site (/en/)', help: 'Versión del sitio para compradores de Estados Unidos. Las propiedades aparecen cuando tienen su versión en inglés (botón "Traducir al inglés" en cada propiedad).' },
			{ name: 'en.activo', label: 'Publicar el sitio en inglés', type: 'checkbox', default: true },
			{ name: 'en.seo.titulo', label: 'Google title (home)', maxlength: 70, cols: 6 },
			{ name: 'en.seo.descripcion', label: 'Google description (home)', maxlength: 160, cols: 6 },
			{ name: 'en.hero.titulo', label: 'Hero headline', cols: 6 },
			{ name: 'en.hero.placeholderBusqueda', label: 'Search placeholder', cols: 6 },
			{ name: 'en.destacadas.titulo', label: 'Featured title', cols: 6 },
			{ name: 'en.destacadas.boton', label: 'Featured button', cols: 6 },
			{ type: 'section', label: 'Buying from the US block' },
			{ name: 'en.bloqueExterior.visible', label: 'Show', type: 'checkbox' },
			{ name: 'en.bloqueExterior.etiqueta', label: 'Label', cols: 6 },
			{ name: 'en.bloqueExterior.titulo', label: 'Title', cols: 6 },
			{ name: 'en.bloqueExterior.texto', label: 'Text', type: 'textarea', rows: 3 },
			{ name: 'en.bloqueExterior.puntos', label: 'Bullet points', type: 'tags' },
			{ name: 'en.bloqueExterior.boton', label: 'Button', cols: 6 },
			{ name: 'en.bloqueExterior.enlace', label: 'Link', cols: 6 },
			{ type: 'section', label: 'Feature cards' },
			{ name: 'en.features.items', label: 'Cards', type: 'list', itemLabel: 'Card', max: 4, fields: [
				{ name: 'icono', label: 'Icon', type: 'select', options: FLATICONS, cols: 4 },
				{ name: 'titulo', label: 'Title', cols: 8 },
				{ name: 'texto', label: 'Text', type: 'textarea', rows: 2 },
				{ name: 'enlace', label: 'Link' }] },
			{ type: 'section', label: 'Services' },
			{ name: 'en.servicios.titulo', label: 'Title', cols: 6 },
			{ name: 'en.servicios.subtitulo', label: 'Subtitle', cols: 6 },
			{ name: 'en.servicios.items', label: 'Services', type: 'list', itemLabel: 'Service', fields: [
				{ name: 'icono', label: 'Icon', type: 'select', options: ICONS, cols: 4 },
				{ name: 'titulo', label: 'Title', cols: 8 },
				{ name: 'texto', label: 'Text', type: 'textarea', rows: 2 }] },
			{ name: 'en.contadores.items', label: 'Counters', type: 'list', itemLabel: 'Counter', max: 4, fields: [
				{ name: 'valor', label: 'Number', type: 'number', cols: 4 },
				{ name: 'etiqueta', label: 'Label', cols: 8 }] },
			{ type: 'section', label: 'Reviews, team and contact' },
			{ name: 'en.testimonios.titulo', label: 'Reviews title', cols: 6 },
			{ name: 'en.asesores.titulo', label: 'Team title', cols: 6 },
			{ name: 'en.asesores.subtitulo', label: 'Team text', type: 'textarea', rows: 2 },
			{ name: 'en.contacto.titulo', label: 'Contact title', cols: 6 },
			{ name: 'en.contacto.horario', label: 'Business hours', cols: 6 },
			{ name: 'en.contacto.subtitulo', label: 'Contact text', type: 'textarea', rows: 2 },
			{ name: 'en.whatsappFlotante.mensaje', label: 'WhatsApp button message' },
			{ type: 'section', label: 'Menu and footer' },
			{ name: 'en.navegacion', label: 'Menu', type: 'list', itemLabel: 'Link', fields: link },
			{ name: 'en.footer.texto', label: 'Footer text', type: 'textarea', rows: 2 },
			{ name: 'en.footer.enlaces', label: 'Footer links', type: 'list', itemLabel: 'Link', fields: link }
		]
	},
	{
		id: 'herramientas', label: 'IA y herramientas', keys: ['ia', 'calculadora'], fields: [
			{ type: 'section', label: 'Búsqueda inteligente en el sitio', help: 'Los visitantes describen lo que buscan con sus palabras y la IA aplica los filtros. Requiere configurar ANTHROPIC_API_KEY en Netlify (ver README). Cada búsqueda cuesta aprox. US$ 0.01.' },
			{ name: 'ia.busquedaPublica', label: 'Activar la búsqueda con IA en los listados', type: 'checkbox' },
			{ type: 'section', label: 'Calculadora de cuota', help: 'Aparece en las propiedades en venta. Estos son los valores iniciales; el visitante puede cambiarlos.' },
			{ name: 'calculadora.visible', label: 'Mostrar la calculadora', type: 'checkbox', default: true },
			{ name: 'calculadora.enganche', label: 'Enganche %', type: 'number', cols: 4 },
			{ name: 'calculadora.tasa', label: 'Tasa anual %', type: 'number', step: 0.1, cols: 4 },
			{ name: 'calculadora.anios', label: 'Plazo (años)', type: 'number', cols: 4 }
		]
	},
	{
		id: 'seo', label: 'SEO de la portada', keys: ['seo'], fields: [
			{ name: 'seo.titulo', label: 'Título de la portada (Google)', maxlength: 70, required: true },
			{ name: 'seo.descripcion', label: 'Descripción (Google)', type: 'textarea', rows: 3, maxlength: 160, required: true, help: 'Máximo 160 caracteres. Aparece debajo del título en Google.' },
			{ name: 'seo.keywords', label: 'Palabras clave', type: 'textarea', rows: 2 },
			{ name: 'seo.imagen', label: 'Imagen al compartir en redes (1200×630 ideal)', type: 'image' }
		]
	},
	{
		id: 'listados', label: 'Títulos de listados', keys: ['listados'], fields: [
			{ type: 'section', label: 'Listados', help: 'Títulos y descripciones de las páginas de listado. Si los dejas vacíos se usan unos predeterminados optimizados.' },
			{ type: 'section', label: 'Todas las propiedades (/propiedades/)' },
			{ name: 'listados.todas.h1', label: 'Título visible (H1)', cols: 6 },
			{ name: 'listados.todas.titulo', label: 'Título para Google', maxlength: 70, cols: 6 },
			{ name: 'listados.todas.descripcion', label: 'Descripción para Google', type: 'textarea', rows: 2, maxlength: 160 },
			{ name: 'listados.todas.intro', label: 'Texto de introducción', type: 'textarea', rows: 2 },
			{ type: 'section', label: 'En venta (/propiedades/venta/)' },
			{ name: 'listados.venta.h1', label: 'Título visible (H1)', cols: 6 },
			{ name: 'listados.venta.titulo', label: 'Título para Google', maxlength: 70, cols: 6 },
			{ name: 'listados.venta.descripcion', label: 'Descripción para Google', type: 'textarea', rows: 2, maxlength: 160 },
			{ name: 'listados.venta.intro', label: 'Texto de introducción', type: 'textarea', rows: 2 },
			{ type: 'section', label: 'En renta (/propiedades/renta/)' },
			{ name: 'listados.renta.h1', label: 'Título visible (H1)', cols: 6 },
			{ name: 'listados.renta.titulo', label: 'Título para Google', maxlength: 70, cols: 6 },
			{ name: 'listados.renta.descripcion', label: 'Descripción para Google', type: 'textarea', rows: 2, maxlength: 160 },
			{ name: 'listados.renta.intro', label: 'Texto de introducción', type: 'textarea', rows: 2 },
			{ type: 'section', label: 'Propiedades VIP (/vip/)' },
			{ name: 'listados.vip.h1', label: 'Título visible (H1)', cols: 6 },
			{ name: 'listados.vip.titulo', label: 'Título para Google', maxlength: 70, cols: 6 },
			{ name: 'listados.vip.descripcion', label: 'Descripción para Google', type: 'textarea', rows: 2, maxlength: 160 },
			{ name: 'listados.vip.intro', label: 'Texto de introducción', type: 'textarea', rows: 2 },
			{ type: 'section', label: 'Blog (/blog/)' },
			{ name: 'listados.blog.h1', label: 'Título visible (H1)', cols: 6 },
			{ name: 'listados.blog.titulo', label: 'Título para Google', maxlength: 70, cols: 6 },
			{ name: 'listados.blog.descripcion', label: 'Descripción para Google', type: 'textarea', rows: 2, maxlength: 160 },
			{ name: 'listados.blog.intro', label: 'Texto de introducción', type: 'textarea', rows: 2 },
		]
	},
	{
		id: 'portada', label: 'Portada', keys: ['hero', 'destacadas'], fields: [
			{ name: 'hero.titulo', label: 'Título principal', required: true },
			{ name: 'hero.placeholderBusqueda', label: 'Texto del buscador' },
			{ name: 'hero.imagenes', label: 'Imágenes del carrusel', type: 'list', itemLabel: 'Imagen', fields: [{ name: 'url', label: 'Imagen', type: 'image' }] },
			{ type: 'section', label: 'Propiedades destacadas' },
			{ name: 'destacadas.titulo', label: 'Título', cols: 6 },
			{ name: 'destacadas.boton', label: 'Texto del botón', cols: 6 }
		]
	},
	{
		id: 'secciones', label: 'Secciones', keys: ['features', 'testimonios', 'servicios', 'contadores', 'cta', 'asesores'], fields: [
			{ type: 'section', label: 'Tarjetas bajo las destacadas' },
			{ name: 'features.visible', label: 'Mostrar', type: 'checkbox' },
			{ name: 'features.items', label: 'Tarjetas', type: 'list', itemLabel: 'Tarjeta', max: 4, fields: [
				{ name: 'icono', label: 'Ícono', type: 'select', options: FLATICONS, cols: 4 },
				{ name: 'titulo', label: 'Título', cols: 8 },
				{ name: 'texto', label: 'Texto', type: 'textarea', rows: 2 },
				{ name: 'enlace', label: 'Enlace', placeholder: '/propiedades/venta/' }] },
			{ type: 'section', label: 'Reseñas' },
			{ name: 'testimonios.visible', label: 'Mostrar', type: 'checkbox', cols: 4 },
			{ name: 'testimonios.titulo', label: 'Título', cols: 8 },
			{ type: 'section', label: 'Servicios' },
			{ name: 'servicios.visible', label: 'Mostrar', type: 'checkbox', cols: 4 },
			{ name: 'servicios.titulo', label: 'Título', cols: 8 },
			{ name: 'servicios.subtitulo', label: 'Subtítulo' },
			{ name: 'servicios.imagen', label: 'Imagen', type: 'image' },
			{ name: 'servicios.items', label: 'Servicios', type: 'list', itemLabel: 'Servicio', fields: [
				{ name: 'icono', label: 'Ícono', type: 'select', options: ICONS, cols: 4 },
				{ name: 'titulo', label: 'Título', cols: 8 },
				{ name: 'texto', label: 'Texto', type: 'textarea', rows: 2 }] },
			{ type: 'section', label: 'Contadores' },
			{ name: 'contadores.visible', label: 'Mostrar', type: 'checkbox' },
			{ name: 'contadores.items', label: 'Contadores', type: 'list', itemLabel: 'Contador', max: 4, fields: [
				{ name: 'valor', label: 'Número', type: 'number', cols: 4 },
				{ name: 'etiqueta', label: 'Etiqueta', cols: 8 }] },
			{ type: 'section', label: 'Llamado a la acción (reclutamiento)' },
			{ name: 'cta.visible', label: 'Mostrar', type: 'checkbox' },
			{ name: 'cta.titulo', label: 'Título', cols: 6 },
			{ name: 'cta.boton', label: 'Texto del botón', cols: 3 },
			{ name: 'cta.enlace', label: 'Enlace', cols: 3 },
			{ type: 'section', label: 'Equipo de asesores' },
			{ name: 'asesores.visible', label: 'Mostrar', type: 'checkbox', cols: 4 },
			{ name: 'asesores.titulo', label: 'Título', cols: 8 },
			{ name: 'asesores.subtitulo', label: 'Texto', type: 'textarea', rows: 2 }
		]
	},
	{
		id: 'contacto', label: 'Contacto y redes', keys: ['contacto', 'redes'], fields: [
			{ name: 'contacto.titulo', label: 'Título de la sección', cols: 6 },
			{ name: 'contacto.subtitulo', label: 'Texto', cols: 6 },
			{ name: 'contacto.telefono', label: 'Teléfono', type: 'tel', cols: 4 },
			{ name: 'contacto.whatsapp', label: 'WhatsApp (con código de país)', type: 'tel', cols: 4, placeholder: '50259131276' },
			{ name: 'contacto.email', label: 'Correo', type: 'email', cols: 4 },
			{ name: 'contacto.direccion', label: 'Dirección', cols: 8 },
			{ name: 'contacto.horario', label: 'Horario', cols: 4 },
			{ type: 'section', label: 'Redes sociales (deja vacío para ocultar)' },
			{ name: 'redes.instagram', label: 'Instagram', type: 'url', cols: 6 },
			{ name: 'redes.facebook', label: 'Facebook', type: 'url', cols: 6 },
			{ name: 'redes.linkedin', label: 'LinkedIn', type: 'url', cols: 4 },
			{ name: 'redes.tiktok', label: 'TikTok', type: 'url', cols: 4 },
			{ name: 'redes.youtube', label: 'YouTube', type: 'url', cols: 4 }
		]
	},
	{
		id: 'menu', label: 'Menú y pie', keys: ['navegacion', 'footer'], fields: [
			{ name: 'navegacion', label: 'Menú principal', type: 'list', itemLabel: 'Enlace', fields: link, help: 'El menú "Propiedades" (Comprar, Rentar, VIP) se agrega automáticamente.' },
			{ type: 'section', label: 'Pie de página' },
			{ name: 'footer.texto', label: 'Texto', type: 'textarea', rows: 2 },
			{ name: 'footer.enlaces', label: 'Enlaces', type: 'list', itemLabel: 'Enlace', fields: link, help: 'Las páginas marcadas "Mostrar en el pie" se agregan automáticamente.' }
		]
	}
];

export async function render(container) {
	const ref = doc(db, 'settings', 'site');
	const snap = await getDoc(ref);
	let data = snap.exists() ? snap.data() : null;
	if (!data) {
		const seed = await (await fetch('/data/seed.json')).json();
		data = seed.settings;
	}
	// El carrusel guarda URLs simples; el editor de listas trabaja con objetos.
	const heroImgs = (data.hero?.imagenes || []).map((url) => ({ url }));
	data = { ...data, hero: { ...data.hero, imagenes: heroImgs } };

	const forms = GROUPS.map((g) => ({ g, form: renderForm(g.fields, data, { folder: 'site' }) }));
	const tabs = h('ul', { class: 'nav nav-pills flex-wrap gap-1 mb-3', role: 'tablist' });
	const panes = h('div');
	const show = (id) => {
		tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
		[...panes.children].forEach((p) => { p.hidden = p.dataset.id !== id; });
	};
	forms.forEach(({ g, form }) => {
		tabs.append(h('li', { class: 'nav-item' }, h('button', { type: 'button', class: 'nav-link', dataset: { id: g.id }, onclick: () => show(g.id) }, g.label)));
		panes.append(h('div', { class: 'card', dataset: { id: g.id } }, h('div', { class: 'card-body' }, form.el)));
	});
	show(GROUPS[0].id);

	const save = async (btn) => {
		for (const { g, form } of forms) {
			if (!form.validate()) { show(g.id); return; }
		}
		const out = structuredClone(data);
		// Campo por campo: varias pestañas editan partes distintas de la misma sección (p. ej. "seo").
		forms.forEach(({ g, form }) => {
			const d = form.getData();
			g.fields.filter((f) => f.name).forEach((f) => setPath(out, f.name, getPath(d, f.name)));
		});
		out.hero.imagenes = (out.hero.imagenes || []).map((i) => i.url).filter(Boolean);
		out.updatedAt = serverTimestamp();
		btn.disabled = true;
		try {
			await setDoc(ref, out);
			await Promise.all(forms.map(({ form }) => form.flushDeletes()));
			await markPending('Contenido del sitio');
			toast('Contenido guardado. Publica para ver los cambios en el sitio.');
		} catch (err) {
			showError(err);
		} finally {
			btn.disabled = false;
		}
	};

	mount(container, 
		pageHeader('Contenido del sitio'),
		snap.exists() ? null : h('div', { class: 'alert alert-info' }, 'Todavía no has guardado el contenido. Se muestran los textos actuales del sitio; al guardar quedarán en la base de datos. También puedes importar todo desde "Publicar".'),
		tabs, panes,
		h('div', { class: 'sticky-actions' }, h('button', { class: 'btn btn-primary', onclick: (e) => save(e.currentTarget) }, 'Guardar cambios')));
}
