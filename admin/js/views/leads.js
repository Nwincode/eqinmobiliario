import {
	db, doc, getDocs, updateDoc, deleteDoc, collection, query, where, serverTimestamp, arrayUnion, Timestamp
} from '../firebase.js';
import {
	h, toast, showError, confirmDialog, pageHeader, badge, emptyState, formatDate, modal, downloadCsv, toDate
, mount } from '../ui.js';
import { session, loadAgents } from '../session.js';

export const ESTADOS = [
	['nuevo', 'Nuevo', 'primary'],
	['contactado', 'Contactado', 'info'],
	['en_proceso', 'En proceso', 'warning'],
	['cerrado', 'Cerrado (ganado)', 'success'],
	['descartado', 'Descartado', 'secondary']
];
export const ORIGENES = { contacto: 'Formulario de contacto', propiedad: 'Ficha de propiedad', vip: 'Landing VIP', listado: 'Listado', blog: 'Blog' };

// Fuente del lead: campaña de anuncios si la hay; si no, el formulario de origen.
export function fuenteLead(l) {
	const c = l.campana || {};
	if (c.gclid || /google/i.test(c.utm_source || '')) return `Google Ads${c.utm_campaign ? ` · ${c.utm_campaign}` : ''}`;
	if (c.fbclid || /facebook|instagram|meta/i.test(c.utm_source || '')) return `Meta Ads${c.utm_campaign ? ` · ${c.utm_campaign}` : ''}`;
	if (c.utm_source) return `${c.utm_source}${c.utm_campaign ? ` · ${c.utm_campaign}` : ''}`;
	return 'Orgánico / directo';
}

export function estadoBadge(estado) {
	const e = ESTADOS.find(([v]) => v === estado) || ESTADOS[0];
	return badge(e[1], e[2]);
}

// El asesor solo puede consultar sus propios leads (lo exigen las reglas de seguridad).
export async function loadLeads() {
	const col = collection(db, 'leads');
	const q = session.isAdmin ? col : query(col, where('agentId', '==', session.agentId || '-'));
	const snap = await getDocs(q);
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
		.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
}

function waLink(tel, nombre) {
	let n = String(tel || '').replace(/\D/g, '');
	if (n.length === 8) n = `502${n}`;
	return n ? `https://wa.me/${n}?text=${encodeURIComponent(`Hola ${nombre}, te escribo de Equipo Inmobiliario.`)}` : '';
}

function openLead(lead, agents, onChange) {
	const estado = h('select', { class: 'form-select' }, ESTADOS.map(([v, l]) => h('option', { value: v }, l)));
	estado.value = lead.estado || 'nuevo';
	const agent = h('select', { class: 'form-select', disabled: !session.isAdmin },
		h('option', { value: '' }, 'Sin asignar'), agents.map((a) => h('option', { value: a.id }, a.nombre)));
	agent.value = lead.agentId || '';
	const nota = h('textarea', { class: 'form-control', rows: 2, placeholder: 'Agregar nota de seguimiento…' });
	const notes = h('div', {}, (lead.notas || []).slice().reverse().map((n) => h('div', { class: 'lead-note' },
		h('div', {}, n.texto),
		h('div', { class: 'small text-muted' }, `${n.autor || ''} · ${formatDate(n.fecha)}`))));
	const wa = waLink(lead.telefono, lead.nombre);

	const save = async () => {
		const patch = { estado: estado.value, updatedAt: serverTimestamp() };
		if (session.isAdmin) patch.agentId = agent.value;
		if (nota.value.trim()) {
			patch.notas = arrayUnion({ texto: nota.value.trim(), autor: session.profile.nombre || session.user.email, fecha: Timestamp.now() });
		}
		try {
			await updateDoc(doc(db, 'leads', lead.id), patch);
			toast('Lead actualizado.');
			m.close();
			onChange();
		} catch (err) { showError(err); }
	};
	const remove = async () => {
		if (!(await confirmDialog(`¿Eliminar el lead de ${lead.nombre}?`, { okText: 'Eliminar' }))) return;
		try {
			await deleteDoc(doc(db, 'leads', lead.id));
			toast('Lead eliminado.');
			m.close();
			onChange();
		} catch (err) { showError(err); }
	};

	const m = modal({
		title: lead.nombre,
		size: 'modal-lg',
		body: h('div', {},
			h('div', { class: 'd-flex flex-wrap gap-2 mb-3' },
				wa ? h('a', { href: wa, target: '_blank', rel: 'noopener', class: 'btn btn-success btn-sm' }, 'WhatsApp') : null,
				lead.telefono ? h('a', { href: `tel:${lead.telefono}`, class: 'btn btn-outline-primary btn-sm' }, `Llamar ${lead.telefono}`) : null,
				lead.email ? h('a', { href: `mailto:${lead.email}`, class: 'btn btn-outline-primary btn-sm' }, lead.email) : null,
				h('a', { href: `#/ia/seguimiento/${lead.id}`, class: 'btn btn-primary btn-sm ms-auto', onclick: () => m.close() }, '✨ Qué le escribo (IA)')),
			h('dl', { class: 'row small' },
				h('dt', { class: 'col-sm-3' }, 'Recibido'), h('dd', { class: 'col-sm-9' }, formatDate(lead.createdAt)),
				h('dt', { class: 'col-sm-3' }, 'Origen'), h('dd', { class: 'col-sm-9' }, ORIGENES[lead.origen] || lead.origen || '—', lead.pagina ? ` (${lead.pagina})` : ''),
				lead.propertyTitulo ? [h('dt', { class: 'col-sm-3' }, 'Propiedad'), h('dd', { class: 'col-sm-9' }, lead.propertyId ? h('a', { href: `#/propiedades/${lead.propertyId}` }, lead.propertyTitulo) : lead.propertyTitulo)] : null,
				lead.fechaVisita || lead.tipoVisita ? [h('dt', { class: 'col-sm-3' }, 'Visita preferida'), h('dd', { class: 'col-sm-9 fw-semibold' },
					[lead.tipoVisita === 'videollamada' ? 'Videollamada' : lead.tipoVisita === 'presencial' ? 'Presencial' : '', lead.fechaVisita ? formatDate(`${lead.fechaVisita}T12:00:00`, false) : ''].filter(Boolean).join(' · '))] : null,
				lead.idioma === 'en' ? [h('dt', { class: 'col-sm-3' }, 'Idioma'), h('dd', { class: 'col-sm-9' }, badge('Inglés (sitio en inglés)', 'info'))] : null,
				lead.campana ? [h('dt', { class: 'col-sm-3' }, 'Campaña'), h('dd', { class: 'col-sm-9 small' },
					[lead.campana.gclid ? 'Google Ads' : lead.campana.fbclid ? 'Meta Ads' : '', lead.campana.utm_source, lead.campana.utm_campaign, lead.campana.utm_term].filter(Boolean).join(' · ') || '—')] : null,
				h('dt', { class: 'col-sm-3' }, 'Mensaje'), h('dd', { class: 'col-sm-9', style: 'white-space:pre-wrap' }, lead.mensaje || '—')),
			h('div', { class: 'row g-3 mb-3' },
				h('div', { class: 'col-md-6' }, h('label', { class: 'form-label' }, 'Estado'), estado),
				h('div', { class: 'col-md-6' }, h('label', { class: 'form-label' }, 'Asesor asignado'), agent)),
			h('label', { class: 'form-label' }, 'Seguimiento'), nota,
			h('div', { class: 'mt-3' }, notes)),
		footer: [
			session.isAdmin ? h('button', { class: 'btn btn-outline-danger me-auto', onclick: remove }, 'Eliminar') : null,
			h('button', { class: 'btn btn-light', 'data-bs-dismiss': 'modal' }, 'Cerrar'),
			h('button', { class: 'btn btn-primary', onclick: save }, 'Guardar')
		]
	});
}

export async function render(container) {
	if (!session.isAdmin && !session.agentId) {
		mount(container, h('div', { class: 'alert alert-warning' }, 'Tu usuario no está vinculado a un asesor, así que no tienes leads asignados.'));
		return;
	}
	const [leads, agents] = await Promise.all([loadLeads(), loadAgents()]);
	const agentName = Object.fromEntries(agents.map((a) => [a.id, a.nombre]));

	const search = h('input', { class: 'form-control', type: 'search', placeholder: 'Buscar por nombre, teléfono, correo o propiedad…' });
	const fEstado = h('select', { class: 'form-select' }, h('option', { value: '' }, 'Todos los estados'), ESTADOS.map(([v, l]) => h('option', { value: v }, l)));
	const fAgent = h('select', { class: 'form-select', hidden: !session.isAdmin },
		h('option', { value: '' }, 'Todos los asesores'), h('option', { value: '-' }, 'Sin asignar'), agents.map((a) => h('option', { value: a.id }, a.nombre)));
	const tbody = h('tbody');

	const filtered = () => {
		const q = search.value.trim().toLowerCase();
		return leads.filter((l) =>
			(!q || `${l.nombre} ${l.telefono} ${l.email} ${l.propertyTitulo}`.toLowerCase().includes(q))
			&& (!fEstado.value || (l.estado || 'nuevo') === fEstado.value)
			&& (!fAgent.value || (fAgent.value === '-' ? !l.agentId : l.agentId === fAgent.value)));
	};
	const draw = () => {
		tbody.replaceChildren(...filtered().map((l) => h('tr', { class: 'clickable', onclick: () => openLead(l, agents, () => render(container.replaceChildren() || container)) },
			h('td', { class: 'small text-muted text-nowrap' }, formatDate(l.createdAt)),
			h('td', {}, h('div', { class: 'fw-semibold' }, l.nombre), h('div', { class: 'small text-muted' }, l.telefono)),
			h('td', { class: 'small' }, l.propertyTitulo || ORIGENES[l.origen] || l.origen || '—', l.idioma === 'en' ? h('span', { class: 'badge text-bg-info ms-1' }, 'EN') : null),
			h('td', { class: 'small text-muted' }, fuenteLead(l)),
			h('td', { class: 'small' }, agentName[l.agentId] || h('span', { class: 'text-muted' }, 'Sin asignar')),
			h('td', {}, estadoBadge(l.estado)))));
	};
	[search, fEstado, fAgent].forEach((el) => el.addEventListener('input', draw));
	draw();

	const exportCsv = () => downloadCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, [
		['Fecha', 'Nombre', 'Teléfono', 'Correo', 'Mensaje', 'Propiedad', 'Origen', 'Fuente', 'Campaña', 'Idioma', 'Asesor', 'Estado'],
		...filtered().map((l) => [formatDate(l.createdAt), l.nombre, l.telefono, l.email, l.mensaje, l.propertyTitulo, ORIGENES[l.origen] || l.origen, fuenteLead(l), l.campana?.utm_campaign || '', l.idioma || 'es', agentName[l.agentId] || '', ESTADOS.find(([v]) => v === l.estado)?.[1] || l.estado])
	]);

	mount(container, 
		pageHeader('Leads', leads.length ? h('button', { class: 'btn btn-outline-primary', onclick: exportCsv }, 'Exportar a Excel (CSV)') : null),
		leads.length ? h('div', {},
			h('div', { class: 'row g-2 mb-3' },
				h('div', { class: 'col-md-6' }, search),
				h('div', { class: 'col-6 col-md-3' }, fEstado),
				h('div', { class: 'col-6 col-md-3' }, fAgent)),
			h('div', { class: 'card overflow-hidden' }, h('div', { class: 'table-responsive' },
				h('table', { class: 'table table-hover table-admin' },
					h('thead', {}, h('tr', {}, ['Fecha', 'Contacto', 'Interés', 'Fuente', 'Asesor', 'Estado'].map((t) => h('th', {}, t)))),
					tbody))))
			: emptyState(session.isAdmin ? 'Todavía no han llegado leads. Aparecerán aquí cuando alguien llene un formulario del sitio.' : 'No tienes leads asignados todavía.'));
}
