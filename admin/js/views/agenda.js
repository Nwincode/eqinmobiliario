// Agenda: seguimientos, visitas y tareas por fecha (vencidas, hoy, próximos días).
import { db, doc, updateDoc, deleteDoc, serverTimestamp } from '../firebase.js';
import { h, toast, showError, pageHeader, mount } from '../ui.js';
import { session, loadAgents } from '../session.js';
import {
	TIPOS_ACTIVIDAD, tipoActividad, loadActividades, loadClientes, crearActividad, vencimiento, fechaCorta, ms
} from '../crm.js';

const GRUPOS = [
	['vencida', 'Vencidas', 'text-danger'],
	['hoy', 'Hoy', ''],
	['proxima', 'Próximos días', ''],
	['sin-fecha', 'Sin fecha', 'text-muted']
];

export async function render(container) {
	const [actividades, clientes, agentes] = await Promise.all([loadActividades(), loadClientes(), loadAgents()]);
	const nombreAsesor = Object.fromEntries(agentes.map((a) => [a.id, a.nombre]));
	const fAsesor = h('select', { class: 'form-select form-select-sm w-auto', hidden: !session.isAdmin },
		h('option', { value: '' }, 'Todo el equipo'), agentes.map((a) => h('option', { value: a.id, selected: a.id === session.agentId }, a.nombre)));
	const lista = h('div');

	const completar = async (a) => {
		try {
			await updateDoc(doc(db, 'actividades', a.id), { hecha: true, hechaEn: serverTimestamp() });
			if (a.clienteId) await updateDoc(doc(db, 'clientes', a.clienteId), { ultimoContacto: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => {});
			a.hecha = true;
			toast('Marcada como realizada.');
			dibujar();
		} catch (err) { showError(err); }
	};
	const posponer = async (a, dias) => {
		const base = Math.max(Date.now(), ms(a.fecha) || Date.now());
		const nueva = new Date(base + dias * 86400000);
		try {
			const { Timestamp } = await import('../firebase.js');
			await updateDoc(doc(db, 'actividades', a.id), { fecha: Timestamp.fromDate(nueva) });
			a.fecha = Timestamp.fromDate(nueva);
			dibujar();
		} catch (err) { showError(err); }
	};
	const borrar = async (a) => {
		try { await deleteDoc(doc(db, 'actividades', a.id)); actividades.splice(actividades.indexOf(a), 1); dibujar(); } catch (err) { showError(err); }
	};

	const dibujar = () => {
		const pend = actividades.filter((a) => !a.hecha && (!fAsesor.value || a.agentId === fAsesor.value));
		const grupos = GRUPOS.map(([k, label, cls]) => {
			const items = pend.filter((a) => vencimiento(a) === k).sort((a, b) => ms(a.fecha) - ms(b.fecha));
			if (!items.length) return null;
			return h('div', { class: 'card mb-4' },
				h('div', { class: `card-header bg-white fw-semibold ${cls}` }, `${label} (${items.length})`),
				h('ul', { class: 'list-group list-group-flush' }, items.map((a) => h('li', { class: 'list-group-item d-flex flex-wrap align-items-center gap-2' },
					h('span', { class: 'fs-5' }, tipoActividad(a.tipo)[2]),
					h('div', { class: 'me-auto' },
						h('div', { class: 'fw-semibold small' }, a.titulo || tipoActividad(a.tipo)[1]),
						h('div', { class: 'small text-muted' },
							a.clienteId ? h('a', { href: `#/clientes/${a.clienteId}` }, a.clienteNombre || 'Cliente') : null,
							a.clienteId ? ' · ' : '',
							a.fecha ? fechaCorta(a.fecha) : 'Sin fecha',
							session.isAdmin && a.agentId ? ` · ${nombreAsesor[a.agentId] || ''}` : '')),
					h('button', { class: 'btn btn-sm btn-outline-success', onclick: () => completar(a) }, 'Hecho'),
					h('button', { class: 'btn btn-sm btn-light', title: 'Pasar a mañana', onclick: () => posponer(a, 1) }, '+1 día'),
					h('button', { class: 'btn btn-sm btn-light', title: 'Pasar una semana', onclick: () => posponer(a, 7) }, '+7'),
					h('button', { class: 'btn btn-sm btn-light text-danger', title: 'Eliminar', onclick: () => borrar(a) }, '×')))));
		}).filter(Boolean);
		lista.replaceChildren(...(grupos.length ? grupos : [h('div', { class: 'card' }, h('div', { class: 'card-body text-muted' }, 'No hay pendientes. Agenda seguimientos desde la ficha de cada cliente o aquí arriba.'))]));
	};
	fAsesor.addEventListener('input', dibujar);

	// Agendar rápido
	const tipo = h('select', { class: 'form-select' }, TIPOS_ACTIVIDAD.filter(([v]) => v !== 'nota').map(([v, l, i]) => h('option', { value: v }, `${i} ${l}`)));
	const titulo = h('input', { class: 'form-control', placeholder: '¿Qué hay que hacer?', required: true, maxlength: 200 });
	const fecha = h('input', { class: 'form-control', type: 'datetime-local', required: true });
	const cliente = h('select', { class: 'form-select' }, h('option', { value: '' }, 'Sin cliente'), clientes.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map((c) => h('option', { value: c.id }, c.nombre)));
	const form = h('form', { class: 'row g-2 align-items-center', onsubmit: async (e) => {
		e.preventDefault();
		const c = clientes.find((x) => x.id === cliente.value);
		try {
			const a = await crearActividad({ tipo: tipo.value, titulo: titulo.value.trim(), fecha: new Date(fecha.value), clienteId: c ? c.id : '', clienteNombre: c ? c.nombre : '', agentId: c ? c.agentId : session.agentId });
			actividades.push({ ...a, fecha: { toDate: () => new Date(fecha.value), seconds: new Date(fecha.value).getTime() / 1000 } });
			titulo.value = '';
			toast('Agendado.');
			dibujar();
		} catch (err) { showError(err); }
	} },
	h('div', { class: 'col-md-2' }, tipo), h('div', { class: 'col-md-4' }, titulo), h('div', { class: 'col-md-3' }, fecha), h('div', { class: 'col-md-2' }, cliente),
	h('div', { class: 'col-md-1 d-grid' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Agendar')));

	mount(container,
		pageHeader('Agenda', fAsesor),
		h('div', { class: 'card mb-4' }, h('div', { class: 'card-body' }, form)),
		lista);
	dibujar();
}
