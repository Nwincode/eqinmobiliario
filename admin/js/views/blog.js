import { h, badge, slugify, toast, formatDate } from '../ui.js';
import { crudView } from '../crud.js';
import { session } from '../session.js';
import { seoPreviewField, stripMd } from '../seo.js';

export const render = crudView({
	collection: 'posts',
	route: 'blog',
	title: 'Blog',
	singular: 'Artículo',
	intro: 'Artículos para atraer visitas desde Google: guías de zonas, financiamiento, consejos para comprar o vender. Publica al menos uno al mes.',
	defaults: { publicado: false, fecha: new Date().toISOString().slice(0, 10) },
	columns: [
		['Título', (p) => h('span', { class: 'fw-semibold' }, p.titulo)],
		['Fecha', (p) => (p.fecha ? formatDate(`${p.fecha}T12:00:00`, false) : '—')],
		['URL', (p) => h('code', {}, `/blog/${p.slug}/`)],
		['Estado', (p) => (p.publicado ? badge('Publicado', 'success') : badge('Borrador', 'secondary'))]
	],
	schema: () => [
		{ name: 'titulo', label: 'Título', required: true, cols: 8, placeholder: 'Ej. Guía para comprar casa en zona 16' },
		{ name: 'slug', label: 'URL (slug)', cols: 4, help: 'Vacío = se genera del título.' },
		{ name: 'resumen', label: 'Resumen', type: 'textarea', rows: 2, maxlength: 300, help: 'Aparece en el listado del blog y en Google.' },
		{ name: 'contenido', label: 'Contenido', type: 'markdown', rows: 18, required: true },
		{ name: 'imagen', label: 'Imagen principal', type: 'image' },
		{ name: 'fecha', label: 'Fecha', type: 'date', cols: 4 },
		{ name: 'autor', label: 'Autor', cols: 4, placeholder: session.profile?.nombre || '' },
		{ name: 'publicado', label: 'Publicado', type: 'checkbox', cols: 4 },
		{ type: 'section', label: 'SEO (opcional)' },
		{ name: 'seo.titulo', label: 'Título para Google', maxlength: 70 },
		{ name: 'seo.descripcion', label: 'Descripción para Google', type: 'textarea', rows: 2, maxlength: 160 },
		seoPreviewField({
			title: (d) => d.seo?.titulo || `${d.titulo || ''} | Blog Equipo Inmobiliario`,
			description: (d) => d.seo?.descripcion || d.resumen || stripMd(d.contenido),
			path: (d) => `/blog/${slugify(d.slug || d.titulo || '')}/`,
			checks: (d) => [
				[stripMd(d.contenido).split(/\s+/).filter(Boolean).length >= 300, 'Artículo de al menos 300 palabras.'],
				[Boolean(d.imagen), 'Tiene imagen principal.'],
				[/^##\s/m.test(d.contenido || ''), 'Usa subtítulos (## …) para organizar el texto.']
			]
		})
	],
	beforeSave: (d, ref, all) => {
		d.slug = slugify(d.slug || d.titulo);
		if (all.some((p) => p.id !== ref.id && p.slug === d.slug)) {
			toast(`Ya existe un artículo con la URL "${d.slug}".`, 'warning');
			return false;
		}
		return true;
	}
});
