import { h, badge, slugify, toast } from '../ui.js';
import { crudView } from '../crud.js';

const RESERVED = ['propiedades', 'propiedad', 'vip', 'admin', 'css', 'js', 'images', 'fonts', 'data', 'scripts', '404'];

export const render = crudView({
	collection: 'pages',
	route: 'paginas',
	title: 'Páginas',
	singular: 'Página',
	intro: 'Páginas de contenido como Privacidad, Términos, Misión y Visión o Preguntas frecuentes.',
	defaults: { publicado: false, enFooter: true },
	columns: [
		['Título', (p) => h('span', { class: 'fw-semibold' }, p.titulo)],
		['URL', (p) => h('code', {}, `/${p.slug}/`)],
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
		{ type: 'section', label: 'SEO (opcional)' },
		{ name: 'seo.titulo', label: 'Título para Google', maxlength: 70 },
		{ name: 'seo.descripcion', label: 'Descripción para Google', type: 'textarea', rows: 2, maxlength: 160 }
	],
	beforeSave: (d, ref, all) => {
		d.slug = slugify(d.slug || d.titulo);
		if (RESERVED.includes(d.slug)) {
			toast(`"${d.slug}" es una dirección reservada del sitio; elige otra.`, 'warning');
			return false;
		}
		if (all.some((p) => p.id !== ref.id && p.slug === d.slug)) {
			toast(`Ya existe una página con la URL "${d.slug}".`, 'warning');
			return false;
		}
		return true;
	}
});
