import { db, getDocs, collection } from '../firebase.js';
import { h, pageHeader, formatDate, toDate , mount } from '../ui.js';
import { session, getPublishState } from '../session.js';
import { loadLeads, estadoBadge, ESTADOS, ORIGENES, fuenteLead } from './leads.js';
import { loadActividades, loadClientes, loadPropietarios, vencimiento, tipoActividad, fechaCorta, ms } from '../crm.js';

function stat(label, value, href) {
	return h('div', { class: 'col-6 col-lg-3' },
		h('a', { href, class: 'card stat-card text-decoration-none h-100' },
			h('div', { class: 'card-body' }, h('div', { class: 'stat-value' }, value), h('div', { class: 'stat-label' }, label))));
}

export async function render(container) {
	const canSeeLeads = session.isAdmin || session.agentId;
	const [propSnap, leads, publish, actividades, clientes, propietarios] = await Promise.all([
		getDocs(collection(db, 'properties')),
		canSeeLeads ? loadLeads() : [],
		getPublishState().catch(() => ({})),
		canSeeLeads ? loadActividades().catch(() => []) : [],
		canSeeLeads ? loadClientes().catch(() => []) : [],
		canSeeLeads ? loadPropietarios().catch(() => []) : []
	]);
	// Lo que hay que atender hoy (el administrador con ficha de asesor ve lo suyo y lo no asignado).
	const mias = actividades.filter((a) => !a.hecha && (!session.isAdmin || !session.agentId || a.agentId === session.agentId || !a.agentId));
	const vencidas = mias.filter((a) => vencimiento(a) === 'vencida');
	const deHoy = mias.filter((a) => vencimiento(a) === 'hoy').sort((a, b) => ms(a.fecha) - ms(b.fecha));
	const conPendiente = new Set(actividades.filter((a) => !a.hecha && a.clienteId).map((a) => a.clienteId));
	const sinSeguimiento = clientes.filter((c) => !['cierre', 'perdido'].includes(c.etapa) && !conPendiente.has(c.id));
	const exclusivas = propietarios.filter((p) => p.exclusiva && p.exclusivaFin && (new Date(`${p.exclusivaFin}T23:59:59`) - Date.now()) / 86400000 <= 30);
	let props = propSnap.docs.map((d) => d.data());
	if (!session.isAdmin) props = props.filter((p) => p.agentId === session.agentId);

	const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
	const last30 = leads.filter((l) => (toDate(l.createdAt)?.getTime() || 0) > monthAgo);
	const nuevos = leads.filter((l) => (l.estado || 'nuevo') === 'nuevo');
	const byEstado = ESTADOS.map(([v, l]) => [l, leads.filter((x) => (x.estado || 'nuevo') === v).length]);
	const byOrigen = Object.entries(last30.reduce((acc, l) => { const k = fuenteLead(l).split(' · ')[0]; acc[k] = (acc[k] || 0) + 1; return acc; }, {}));
	const max = Math.max(1, ...byEstado.map(([, n]) => n));

	mount(container, 
		pageHeader(`Hola, ${(session.profile.nombre || '').split(' ')[0] || 'bienvenido'}`,
			h('a', { href: '#/propiedades/nuevo', class: 'btn btn-primary' }, '+ Nueva propiedad')),
		publish.pendiente ? h('div', { class: 'alert alert-warning d-flex flex-wrap align-items-center gap-2' },
			h('span', { class: 'me-auto' }, `Hay cambios sin publicar${publish.ultimoCambioDesc ? ` (último: ${publish.ultimoCambioDesc})` : ''}.`),
			h('a', { href: '#/publicar', class: 'btn btn-sm btn-warning' }, 'Publicar ahora')) : null,
		canSeeLeads ? h('div', { class: 'card mb-4' },
			h('div', { class: 'card-header bg-white fw-semibold d-flex align-items-center' }, h('span', { class: 'me-auto' }, 'Para hoy'), h('a', { href: '#/agenda', class: 'small' }, 'Abrir agenda →')),
			h('div', { class: 'card-body' },
				h('div', { class: 'd-flex flex-wrap gap-2 mb-3' },
					vencidas.length ? h('a', { href: '#/agenda', class: 'badge text-bg-danger text-decoration-none' }, `${vencidas.length} seguimientos vencidos`) : h('span', { class: 'badge text-bg-success' }, 'Sin seguimientos vencidos'),
					sinSeguimiento.length ? h('a', { href: '#/clientes', class: 'badge text-bg-warning text-decoration-none' }, `${sinSeguimiento.length} clientes sin seguimiento agendado`) : null,
					exclusivas.length ? h('a', { href: '#/propietarios', class: 'badge text-bg-warning text-decoration-none' }, `${exclusivas.length} exclusivas por vencer`) : null),
				deHoy.length ? h('ul', { class: 'list-unstyled mb-0' }, deHoy.slice(0, 8).map((a) => h('li', { class: 'small mb-1' },
					`${tipoActividad(a.tipo)[2]} ${fechaCorta(a.fecha)} · ${a.titulo || tipoActividad(a.tipo)[1]}`,
					a.clienteId ? [' · ', h('a', { href: `#/clientes/${a.clienteId}` }, a.clienteNombre || 'Cliente')] : null)))
					: h('p', { class: 'small text-muted mb-0' }, 'No hay actividades agendadas para hoy.'))) : null,
		h('div', { class: 'row g-3 mb-4' },
			stat(session.isAdmin ? 'Propiedades publicadas' : 'Mis propiedades publicadas', props.filter((p) => p.publicado).length, '#/propiedades'),
			stat('Propiedades VIP', props.filter((p) => p.vip && p.publicado).length, '#/propiedades'),
			stat('Leads nuevos sin atender', nuevos.length, '#/leads'),
			stat('Leads últimos 30 días', last30.length, '#/leads')),
		canSeeLeads ? h('div', { class: 'row g-3' },
			h('div', { class: 'col-lg-7' }, h('div', { class: 'card h-100' },
				h('div', { class: 'card-header bg-white fw-semibold' }, 'Leads recientes'),
				leads.length ? h('ul', { class: 'list-group list-group-flush' }, leads.slice(0, 8).map((l) =>
					h('li', { class: 'list-group-item d-flex align-items-center gap-2' },
						h('div', { class: 'me-auto' },
							h('div', { class: 'fw-semibold' }, l.nombre),
							h('div', { class: 'small text-muted' }, `${l.propertyTitulo || ORIGENES[l.origen] || l.origen || ''} · ${formatDate(l.createdAt)}`)),
						estadoBadge(l.estado))))
					: h('div', { class: 'card-body text-muted' }, 'Aún no hay leads.'),
				h('div', { class: 'card-footer bg-white' }, h('a', { href: '#/leads' }, 'Ver todos los leads →')))),
			h('div', { class: 'col-lg-5' },
				h('div', { class: 'card mb-3' },
					h('div', { class: 'card-header bg-white fw-semibold' }, 'Embudo de leads'),
					h('div', { class: 'card-body' }, byEstado.map(([label, n]) => h('div', { class: 'mb-2' },
						h('div', { class: 'd-flex justify-content-between small' }, h('span', {}, label), h('strong', {}, n)),
						h('div', { class: 'bar' }, h('span', { style: `width:${(n / max) * 100}%` })))))),
				h('div', { class: 'card' },
					h('div', { class: 'card-header bg-white fw-semibold' }, 'Fuente de leads (30 días)'),
					h('div', { class: 'card-body' }, byOrigen.length
						? byOrigen.map(([o, n]) => h('div', { class: 'd-flex justify-content-between small mb-1' }, h('span', {}, ORIGENES[o] || o), h('strong', {}, n)))
						: h('span', { class: 'text-muted small' }, 'Sin datos todavía.'))))) : null);
}
