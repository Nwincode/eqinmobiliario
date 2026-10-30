import { h, badge } from '../ui.js';
import { crudView } from '../crud.js';

export const render = crudView({
	collection: 'testimonials',
	route: 'resenas',
	title: 'Reseñas',
	singular: 'Reseña',
	intro: 'Testimonios de clientes que se muestran en la portada.',
	defaults: { activo: true, estrellas: 5 },
	columns: [
		['', (t) => h('img', { class: 'avatar', src: t.foto || '', alt: '' })],
		['Cliente', (t) => h('span', { class: 'fw-semibold' }, t.nombre)],
		['Reseña', (t) => h('span', { class: 'small text-muted' }, String(t.texto || '').slice(0, 90) + (String(t.texto || '').length > 90 ? '…' : ''))],
		['Estrellas', (t) => '★'.repeat(t.estrellas || 5)],
		['Estado', (t) => (t.activo ? badge('Visible', 'success') : badge('Oculta', 'secondary'))]
	],
	schema: () => [
		{ name: 'nombre', label: 'Nombre del cliente', required: true, cols: 6 },
		{ name: 'rol', label: 'Tipo de cliente', cols: 6, placeholder: 'Comprador, propietaria…' },
		{ name: 'texto', label: 'Reseña', type: 'textarea', rows: 4, required: true },
		{ name: 'estrellas', label: 'Estrellas', type: 'select', options: [['5', '5'], ['4', '4'], ['3', '3']], cols: 3 },
		{ name: 'orden', label: 'Orden', type: 'number', cols: 3 },
		{ name: 'activo', label: 'Visible en el sitio', type: 'checkbox', cols: 6 },
		{ name: 'foto', label: 'Foto (opcional)', type: 'image' }
	],
	beforeSave: (d) => { d.estrellas = Number(d.estrellas) || 5; }
});
