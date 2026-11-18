import { h, badge } from '../ui.js';
import { crudView } from '../crud.js';

export const render = crudView({
	collection: 'testimonials',
	route: 'resenas',
	title: 'Reseñas',
	singular: 'Reseña',
	intro: 'Testimonios de clientes que se muestran en la portada.',
	defaults: { activo: true },
	columns: [
		['Cliente', (t) => h('span', { class: 'fw-semibold' }, t.nombre)],
		['Reseña', (t) => h('span', { class: 'small text-muted' }, String(t.texto || '').slice(0, 90) + (String(t.texto || '').length > 90 ? '…' : ''))],
		['Estado', (t) => (t.activo ? badge('Visible', 'success') : badge('Oculta', 'secondary'))]
	],
	schema: () => [
		{ name: 'nombre', label: 'Nombre del cliente', required: true, cols: 6 },
		{ name: 'rol', label: 'Tipo de cliente', cols: 6, placeholder: 'Comprador, propietaria…' },
		{ name: 'texto', label: 'Reseña', type: 'textarea', rows: 4, required: true },
		{ name: 'orden', label: 'Orden', type: 'number', cols: 6 },
		{ name: 'activo', label: 'Visible en el sitio', type: 'checkbox', cols: 6 },
		{ type: 'section', label: 'Sitio en inglés', help: 'Si la dejas vacía, la reseña no aparece en el sitio en inglés.' },
		{ name: 'en.texto', label: 'Review (English)', type: 'textarea', rows: 3 },
		{ name: 'en.rol', label: 'Client type (English)', cols: 6, placeholder: 'Buyer' }
	]
});
