import { h, badge, slugify, toast } from '../ui.js';
import { crudView } from '../crud.js';
import { seoPreviewField, stripMd } from '../seo.js';
import { reservada, urlPagina } from '../rutas.js';

export const render = crudView({
	collection: 'pages',
	route: 'paginas',
	title: 'Páginas',
	singular: 'Página',
	intro: 'Páginas de contenido como Privacidad, Términos, Misión y Visión o Preguntas frecuentes.',
	defaults: { publicado: false, enFooter: true },
	columns: [
		['Título', (p) => h('span', { class: 'fw-semibold' }, p.titulo)],
		// Una de antes con un nombre que ahora es del sitio se publica en /pagina/…: se le dice al dueño dónde quedó.
		['URL', (p) => h('div', {}, h('code', {}, urlPagina(p.slug, p.idioma)),
			reservada(p.slug, p.idioma) ? h('div', { class: 'small text-muted' }, `Se movió aquí: «${p.slug}» es una dirección del sitio.`) : null)],
		['Pie de página', (p) => (p.enFooter ? 'Sí' : 'No')],
		['Estado', (p) => (p.publicado ? badge('Publicada', 'success') : badge('Borrador', 'secondary'))]
	],
	schema: () => [
		{ name: 'titulo', label: 'Título', required: true, cols: 8 },
		{ name: 'slug', label: 'URL (slug)', cols: 4, help: 'Vacío = se genera del título.' },
		{ name: 'contenido', label: 'Contenido', type: 'markdown', rows: 14, required: true },
		{ name: 'imagen', label: 'Imagen de cabecera (opcional)', type: 'image' },
		{ name: 'orden', label: 'Orden', type: 'number', cols: 4 },
		{ name: 'enFooter', label: 'Mostrar en el pie de página', type: 'checkbox', cols: 4 },
		{ name: 'publicado', label: 'Publicada', type: 'checkbox', cols: 4 },
		{ name: 'idioma', label: 'Idioma', type: 'select', options: [['es', 'Español (sitio principal)'], ['en', 'Inglés (/en/)']], cols: 6 },
		{ name: 'traduccion', label: 'URL (slug) de la versión en el otro idioma', cols: 6, help: 'Opcional. Une ambas versiones para Google (hreflang). Ej.: buying-property-in-guatemala' },
		{ type: 'section', label: 'SEO (opcional)' },
		{ name: 'seo.titulo', label: 'Título para Google', maxlength: 70 },
		{ name: 'seo.descripcion', label: 'Descripción para Google', type: 'textarea', rows: 2, maxlength: 160 },
		seoPreviewField({
			title: (d) => d.seo?.titulo || `${d.titulo || ''} | Equipo Inmobiliario`,
			description: (d) => d.seo?.descripcion || stripMd(d.contenido),
			path: (d) => urlPagina(slugify(d.slug || d.titulo || ''), d.idioma)
		})
	],
	beforeSave: (d, ref, all) => {
		d.slug = slugify(d.slug || d.titulo);
		const antes = all.find((p) => p.id === ref.id);
		// Una de antes que ya tiene un nombre reservado se puede seguir editando con ese nombre (sale en /pagina/…).
		const mismoNombre = antes && antes.slug === d.slug && (antes.idioma || 'es') === (d.idioma || 'es');
		if (reservada(d.slug, d.idioma) && !mismoNombre) {
			toast(`"${d.slug}" es una dirección reservada del sitio; elige otra.`, 'warning');
			return false;
		}
		if (all.some((p) => p.id !== ref.id && p.slug === d.slug && (p.idioma || 'es') === (d.idioma || 'es'))) {
			toast(`Ya existe una página con la URL "${d.slug}".`, 'warning');
			return false;
		}
		// Al cambiarle el nombre o el idioma, su dirección de antes se guarda: el sitio la redirige a la nueva.
		const previas = antes?.urlsAnteriores || [];
		const vieja = antes?.slug ? urlPagina(antes.slug, antes.idioma) : '';
		d.urlsAnteriores = [...new Set([...previas, vieja])].filter((u) => u && u !== urlPagina(d.slug, d.idioma)).slice(-20);
		return true;
	}
});
