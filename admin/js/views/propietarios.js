// Propietarios: dueños de los inmuebles, exclusivas con vencimiento y comisión acordada.
import { db, doc, getDoc, setDoc, deleteDoc, collection, serverTimestamp } from '../firebase.js';
import { h, toast, showError, confirmDialog, pageHeader, emptyState, mount, badge } from '../ui.js';
import { renderForm } from '../form.js';
import { session, agentOptions, loadAgents } from '../session.js';
import { whatsappUrl } from '../ia.js';
import { loadPropietarios, loadPropiedades, telNorm, loadReglas, textoRegla } from '../crm.js';

// Días que faltan para que venza la exclusiva (negativo = vencida).
function diasExclusiva(p) {
	if (!p.exclusiva || !p.exclusivaFin) return null;
	const fin = new Date(`${p.exclusivaFin}T23:59:59`).getTime();
	return Math.ceil((fin - Date.now()) / 86400000);
}

export function estadoExclusiva(p) {
	const d = diasExclusiva(p);
	if (d === null) return p.exclusiva ? badge('Exclusiva sin fecha', 'secondary') : badge('Sin exclusiva', 'light');
	if (d < 0) return badge(`Vencida hace ${-d} días`, 'danger');
	if (d <= 30) return badge(`Vence en ${d} días`, 'warning');
	return badge(`Exclusiva · ${d} días`, 'success');
}

async function renderLista(container) {
	const [lista, propiedades, agentes, reglas] = await Promise.all([loadPropietarios(), loadPropiedades(), loadAgents(), loadReglas()]);
	const tituloProp = Object.fromEntries(propiedades.map((p) => [p.id, p.titulo]));
	const nombreAsesor = Object.fromEntries(agentes.map((a) => [a.id, a.nombre]));
	const porVencer = lista.filter((p) => { const d = diasExclusiva(p); return d !== null && d <= 30; });
	lista.sort((a, b) => (diasExclusiva(a) ?? 9999) - (diasExclusiva(b) ?? 9999));

	mount(container,
		pageHeader('Propietarios', h('a', { href: '#/propietarios/nuevo', class: 'btn btn-primary' }, '+ Propietario')),
		h('p', { class: 'text-muted' }, 'Dueños de los inmuebles que manejan: contacto, propiedades, exclusiva y comisión acordada.'),
		porVencer.length ? h('div', { class: 'alert alert-warning' }, `${porVencer.length} exclusiva(s) vencidas o por vencer en 30 días. Contacta al propietario para renovarla.`) : null,
		lista.length ? h('div', { class: 'card overflow-hidden' }, h('div', { class: 'table-responsive' }, h('table', { class: 'table table-hover table-admin mb-0' },
			h('thead', {}, h('tr', {}, ['Propietario', 'Propiedades', 'Exclusiva', 'Comisión', session.isAdmin ? 'Asesor' : null].filter(Boolean).map((t) => h('th', {}, t)))),
			h('tbody', {}, lista.map((p) => h('tr', { class: 'clickable', onclick: () => { location.hash = `#/propietarios/${p.id}`; } },
				h('td', {}, h('div', { class: 'fw-semibold' }, p.nombre), h('div', { class: 'small text-muted' }, p.telefono || p.email || '')),
				h('td', { class: 'small' }, (p.propiedades || []).map((x) => tituloProp[x.propertyId]).filter(Boolean).join(', ') || '—'),
				h('td', {}, estadoExclusiva(p)),
				h('td', { class: 'small' }, p.comisionPct ? `${p.comisionPct} %` : h('span', { class: 'text-muted' }, `${reglas.comisionVentaPct} % (general)`)),
				session.isAdmin ? h('td', { class: 'small' }, nombreAsesor[p.agentId] || 'Sin asignar') : null))))))
			: emptyState('Aún no hay propietarios registrados.', h('a', { href: '#/propietarios/nuevo', class: 'btn btn-primary' }, 'Registrar propietario')));
}

async function renderEditor(container, id) {
	const nuevo = id === 'nuevo';
	const ref = nuevo ? doc(collection(db, 'propietarios')) : doc(db, 'propietarios', id);
	const [snap, agentes, propiedades, reglas] = await Promise.all([nuevo ? null : getDoc(ref), agentOptions(), loadPropiedades(), loadReglas()]);
	if (!nuevo && !snap.exists()) {
		mount(container, emptyState('No se encontró.', h('a', { href: '#/propietarios', class: 'btn btn-primary' }, 'Volver')));
		return;
	}
	const data = nuevo ? { exclusiva: false, agentId: session.isAdmin ? '' : session.agentId, propiedades: [] } : snap.data();
	const opcionesProp = [['', 'Elegir propiedad…'], ...propiedades.map((p) => [p.id, p.titulo])];
	const form = renderForm([
		{ name: 'nombre', label: 'Nombre del propietario', required: true, cols: 6 },
		session.isAdmin ? { name: 'agentId', label: 'Asesor responsable', type: 'select', options: agentes, cols: 6 } : null,
		{ name: 'telefono', label: 'Teléfono / WhatsApp', cols: 6 },
		{ name: 'email', label: 'Correo', type: 'email', cols: 6 },
		{ type: 'section', label: 'Propiedades' },
		{ name: 'propiedades', label: 'Propiedades de este propietario', type: 'list', itemLabel: 'Propiedad', fields: [
			{ name: 'propertyId', label: 'Propiedad', type: 'select', options: opcionesProp, cols: 8 },
			{ name: 'precioMinimo', label: 'Precio mínimo aceptado', type: 'number', cols: 4 }
		] },
		{ type: 'section', label: 'Exclusiva y comisión' },
		{ name: 'exclusiva', label: 'Tenemos exclusiva', type: 'checkbox', cols: 4 },
		{ name: 'exclusivaInicio', label: 'Desde', type: 'date', cols: 4 },
		{ name: 'exclusivaFin', label: 'Hasta', type: 'date', cols: 4 },
		{ name: 'comisionPct', label: 'Comisión acordada %', type: 'number', cols: 4, help: `Vacío = regla general: ${textoRegla(reglas)}.` },
		{ name: 'contrato', label: 'Enlace al contrato (Drive, Dropbox…)', cols: 8, placeholder: 'https://…' },
		{ name: 'notas', label: 'Notas', type: 'textarea', rows: 3 }
	].filter(Boolean), data, { folder: `propietarios/${ref.id}` });

	const guardar = async (btn) => {
		if (!form.validate()) return;
		const d = form.getData();
		d.telefonoNorm = telNorm(d.telefono);
		d.propiedades = (d.propiedades || []).filter((x) => x.propertyId);
		d.propertyIds = d.propiedades.map((x) => x.propertyId);
		d.updatedAt = serverTimestamp();
		if (nuevo) d.createdAt = serverTimestamp();
		if (!session.isAdmin) d.agentId = session.agentId;
		btn.disabled = true;
		try {
			await setDoc(ref, d);
			toast('Propietario guardado.');
			location.hash = '#/propietarios';
		} catch (err) { showError(err); } finally { btn.disabled = false; }
	};
	const eliminar = async () => {
		if (!(await confirmDialog(`¿Eliminar a ${data.nombre}?`, { okText: 'Eliminar' }))) return;
		try { await deleteDoc(ref); toast('Eliminado.'); location.hash = '#/propietarios'; } catch (err) { showError(err); }
	};

	mount(container,
		pageHeader(nuevo ? 'Nuevo propietario' : data.nombre, h('a', { href: '#/propietarios', class: 'btn btn-light' }, 'Volver')),
		!nuevo ? h('div', { class: 'd-flex flex-wrap gap-2 mb-3 align-items-center' }, estadoExclusiva(data),
			data.telefono ? h('a', { href: whatsappUrl(data.telefono, `Hola ${String(data.nombre || '').split(' ')[0]}, te escribo de Equipo Inmobiliario.`), target: '_blank', rel: 'noopener', class: 'btn btn-sm btn-success' }, 'WhatsApp') : null,
			data.telefono ? h('a', { href: `tel:${data.telefono}`, class: 'btn btn-sm btn-outline-primary' }, 'Llamar') : null,
			data.contrato ? h('a', { href: data.contrato, target: '_blank', rel: 'noopener', class: 'btn btn-sm btn-outline-primary' }, 'Ver contrato') : null) : null,
		h('div', { class: 'card' }, h('div', { class: 'card-body' }, form.el)),
		h('div', { class: 'sticky-actions' },
			h('button', { class: 'btn btn-primary', onclick: (e) => guardar(e.currentTarget) }, 'Guardar'),
			h('a', { href: '#/propietarios', class: 'btn btn-light' }, 'Cancelar'),
			!nuevo && session.isAdmin ? h('button', { class: 'btn btn-outline-danger ms-auto', onclick: eliminar }, 'Eliminar') : null));
}

export async function render(container, [id]) {
	if (id) return renderEditor(container, id);
	return renderLista(container);
}
