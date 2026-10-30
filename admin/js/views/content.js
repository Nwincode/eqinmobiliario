import { db, doc, getDoc, setDoc, serverTimestamp } from '../firebase.js';
import { h, toast, showError, pageHeader } from '../ui.js';
import { renderForm } from '../form.js';
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
		id: 'seo', label: 'SEO y seguimiento', keys: ['seo', 'tracking'], fields: [
			{ name: 'seo.titulo', label: 'Título de la portada (Google)', maxlength: 70, required: true },
			{ name: 'seo.descripcion', label: 'Descripción (Google)', type: 'textarea', rows: 3, maxlength: 160, required: true, help: 'Máximo 160 caracteres. Aparece debajo del título en Google.' },
			{ name: 'seo.keywords', label: 'Palabras clave', type: 'textarea', rows: 2 },
			{ name: 'seo.imagen', label: 'Imagen al compartir en redes (1200×630 ideal)', type: 'image' },
			{ type: 'section', label: 'Seguimiento' },
			{ name: 'tracking.gtmId', label: 'Google Tag Manager (ID)', cols: 6, placeholder: 'GTM-XXXXXXX' },
			{ name: 'tracking.pixelId', label: 'Meta Pixel (ID)', cols: 6, placeholder: '212605361803683', help: 'El sitio envía PageView, ViewContent, Search, Contact y Lead automáticamente.' }
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
		const out = { ...data };
		forms.forEach(({ g, form }) => g.keys.forEach((k) => { out[k] = form.getData()[k]; }));
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

	container.append(
		pageHeader('Contenido del sitio'),
		snap.exists() ? null : h('div', { class: 'alert alert-info' }, 'Todavía no has guardado el contenido. Se muestran los textos actuales del sitio; al guardar quedarán en la base de datos. También puedes importar todo desde "Publicar".'),
		tabs, panes,
		h('div', { class: 'sticky-actions' }, h('button', { class: 'btn btn-primary', onclick: (e) => save(e.currentTarget) }, 'Guardar cambios')));
}
