import { h, badge } from '../ui.js';
import { crudView } from '../crud.js';
import { invalidateAgents } from '../session.js';

export const render = crudView({
	collection: 'agents',
	route: 'asesores',
	title: 'Asesores',
	singular: 'Asesor',
	intro: 'El equipo que aparece en la portada y en cada propiedad. Para que un asesor entre al panel, crea su usuario en "Usuarios" y vincúlalo aquí.',
	defaults: { activo: true, cargo: 'Agente de Bienes Raíces' },
	columns: [
		['', (a) => h('img', { class: 'avatar', src: a.foto || '', alt: '' })],
		['Nombre', (a) => h('span', { class: 'fw-semibold' }, a.nombre)],
		['Cargo', (a) => a.cargo || '—'],
		['WhatsApp', (a) => a.whatsapp || '—'],
		['Estado', (a) => (a.activo ? badge('Visible', 'success') : badge('Oculto', 'secondary'))]
	],
	schema: () => [
		{ name: 'nombre', label: 'Nombre', required: true, cols: 6 },
		{ name: 'cargo', label: 'Cargo', cols: 6 },
		{ name: 'whatsapp', label: 'WhatsApp', type: 'tel', cols: 6, help: 'Con código de país, sin espacios. Ej. 50259131276' },
		{ name: 'email', label: 'Correo', type: 'email', cols: 6 },
		{ name: 'bio', label: 'Descripción breve', type: 'textarea', rows: 3 },
		{ name: 'foto', label: 'Foto', type: 'image' },
		{ name: 'orden', label: 'Orden', type: 'number', cols: 3 },
		{ name: 'activo', label: 'Visible en el sitio', type: 'checkbox', cols: 9 },
		{ type: 'section', label: 'Sitio en inglés' },
		{ name: 'en.cargo', label: 'Title (English)', cols: 6, placeholder: 'Real estate advisor' },
		{ name: 'en.bio', label: 'Bio (English)', type: 'textarea', rows: 3 }
	],
	afterSave: invalidateAgents
});
