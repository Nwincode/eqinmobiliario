import {
	auth, db, doc, getDocs, setDoc, updateDoc, collection, serverTimestamp, createAccount, sendPasswordResetEmail
} from '../firebase.js';
import { h, toast, showError, pageHeader, badge, modal, formatDate , mount, cajaTabla } from '../ui.js';
import { session, loadAgents } from '../session.js';
import { loadPropietarios } from '../crm.js';
import { etiquetaDueno } from '../duenos.js';
import { ponerAcceso } from './propietarios.js';

// Aquí se crean solo cuentas del equipo. Propietarios y colaboradores entran con «Dar acceso» en su ficha
// (Propietarios): una sola forma de darles entrada. Sus usuarios se listan aquí con el nombre que les corresponde.
const ROLES = [['asesor', 'Asesor (sus propiedades y leads)'], ['admin', 'Administrador (acceso total)']];
const NOMBRE_ROL = { admin: ['Administrador', 'primary'], asesor: ['Asesor', 'info'] };

function userForm(agents, user = {}) {
	const nombre = h('input', { class: 'form-control', value: user.nombre || '' });
	const email = h('input', { class: 'form-control', type: 'email', value: user.email || '', disabled: Boolean(user.uid) });
	const pass = h('input', { class: 'form-control', type: 'text', placeholder: 'Mínimo 8 caracteres' });
	const rol = h('select', { class: 'form-select' }, ROLES.map(([v, l]) => h('option', { value: v }, l)));
	rol.value = user.rol || 'asesor';
	const agentId = h('select', { class: 'form-select' }, h('option', { value: '' }, 'Ninguno'), agents.map((a) => h('option', { value: a.id }, a.nombre)));
	agentId.value = user.agentId || '';
	const activo = h('input', { class: 'form-check-input', type: 'checkbox', id: 'u-activo' });
	activo.checked = user.activo !== false;
	const isSelf = user.uid === session.user.uid;
	if (isSelf) { rol.disabled = true; activo.disabled = true; }

	const cajaAsesor = h('div', { class: 'col-md-6' }, h('label', { class: 'form-label' }, 'Asesor vinculado'), agentId,
		h('div', { class: 'form-text' }, 'Necesario para que un asesor vea y edite sus propiedades y leads.'));

	const body = h('div', { class: 'row g-3' },
		h('div', { class: 'col-md-6' }, h('label', { class: 'form-label' }, 'Nombre *'), nombre),
		h('div', { class: 'col-md-6' }, h('label', { class: 'form-label' }, 'Correo *'), email),
		user.uid ? null : h('div', { class: 'col-md-6' }, h('label', { class: 'form-label' }, 'Contraseña temporal *'), pass,
			h('div', { class: 'form-text' }, 'Compártela con la persona; podrá cambiarla con "¿Olvidaste tu contraseña?".')),
		h('div', { class: 'col-md-6' }, h('label', { class: 'form-label' }, 'Rol'), rol),
		cajaAsesor,
		h('div', { class: 'col-12' }, h('div', { class: 'form-check form-switch' }, activo, h('label', { class: 'form-check-label', for: 'u-activo' }, 'Acceso activo'))));

	return {
		body,
		values: () => ({ nombre: nombre.value.trim(), email: email.value.trim(), password: pass.value, rol: rol.value, activo: activo.checked, agentId: agentId.value })
	};
}

export async function render(container) {
	const [snap, agents, propietarios] = await Promise.all([getDocs(collection(db, 'users')), loadAgents(), loadPropietarios()]);
	const users = snap.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
	const agentName = Object.fromEntries(agents.map((a) => [a.id, a.nombre]));
	const reload = () => { container.replaceChildren(); render(container); };

	const falta = (v) => (v.rol === 'asesor' && !v.agentId ? 'Vincula el usuario a un asesor (créalo antes en "Asesores").' : '');
	const fichaDe = (u) => propietarios.find((p) => p.id === u.propietarioId);
	const rolDe = (u) => (u.rol === 'socio' ? [etiquetaDueno(fichaDe(u)?.tipo), 'warning'] : NOMBRE_ROL[u.rol] || NOMBRE_ROL.asesor);

	const create = () => {
		const f = userForm(agents);
		const m = modal({
			title: 'Nuevo usuario',
			size: 'modal-lg',
			body: f.body,
			footer: [
				h('button', { class: 'btn btn-light', 'data-bs-dismiss': 'modal' }, 'Cancelar'),
				h('button', {
					class: 'btn btn-primary',
					onclick: async (e) => {
						const v = f.values();
						if (!v.nombre || !v.email) return toast('Completa nombre y correo.', 'warning');
						if (v.password.length < 8) return toast('La contraseña temporal debe tener al menos 8 caracteres.', 'warning');
						if (falta(v)) return toast(falta(v), 'warning');
						e.currentTarget.disabled = true;
						try {
							const uid = await createAccount(v.email, v.password);
							await setDoc(doc(db, 'users', uid), {
								nombre: v.nombre, email: v.email, rol: v.rol, agentId: v.agentId, propietarioId: '', activo: v.activo,
								createdAt: serverTimestamp(), createdBy: session.user.uid
							});
							toast('Usuario creado.');
							m.close();
							reload();
						} catch (err) {
							showError(err);
							e.currentTarget.disabled = false;
						}
					}
				}, 'Crear usuario')
			]
		});
	};

	// Propietario o colaborador: su acceso se maneja en su ficha (ahí se da, se quita y se reenvía el correo).
	const editDueno = (u) => {
		const p = fichaDe(u);
		// El mismo interruptor que «Quitar acceso» / «Devolver acceso» de su ficha (ponerAcceso).
		const activo = h('input', { class: 'form-check-input', type: 'checkbox', id: 'u-activo-dueno', checked: u.activo !== false, onchange: async (e) => {
			e.target.disabled = true;
			try { await ponerAcceso(p || { id: u.propietarioId }, u, e.target.checked); toast(e.target.checked ? 'Acceso devuelto.' : 'Acceso quitado.'); m.close(); reload(); }
			catch (err) { showError(err); e.target.checked = !e.target.checked; e.target.disabled = false; }
		} });
		const m = modal({
			title: u.nombre || u.email,
			body: h('div', { class: 'd-grid gap-2' },
				h('p', { class: 'mb-0' }, badge(...rolDe(u)), ' ', h('span', { class: 'small' }, u.email)),
				h('div', { class: 'form-check form-switch' }, activo, h('label', { class: 'form-check-label', for: 'u-activo-dueno' }, 'Acceso activo')),
				h('p', { class: 'small text-muted mb-0' }, 'Dar acceso o reenviarle el correo para poner su contraseña se hace en su ficha.')),
			footer: [p ? h('a', { class: 'btn btn-primary', href: `#/propietarios/${p.id}`, 'data-bs-dismiss': 'modal' }, h('span', { class: 'icon-key me-1', 'aria-hidden': 'true' }), 'Abrir su ficha')
				: h('span', { class: 'small text-muted' }, 'Su ficha ya no existe.')]
		});
	};

	const edit = (u) => {
		if (u.rol === 'socio') return editDueno(u);
		const f = userForm(agents, u);
		const m = modal({
			title: u.nombre || u.email,
			size: 'modal-lg',
			body: f.body,
			footer: [
				h('button', {
					class: 'btn btn-outline-secondary me-auto',
					onclick: async () => {
						try {
							await sendPasswordResetEmail(auth, u.email);
							toast(`Se envió un correo a ${u.email} para restablecer la contraseña.`);
						} catch (err) { showError(err); }
					}
				}, 'Enviar cambio de contraseña'),
				h('button', { class: 'btn btn-light', 'data-bs-dismiss': 'modal' }, 'Cancelar'),
				h('button', {
					class: 'btn btn-primary',
					onclick: async () => {
						const v = f.values();
						if (falta(v)) return toast(falta(v), 'warning');
						const patch = { nombre: v.nombre, agentId: v.agentId, updatedAt: serverTimestamp() };
						if (u.uid !== session.user.uid) Object.assign(patch, { rol: v.rol, activo: v.activo });
						try {
							await updateDoc(doc(db, 'users', u.uid), patch);
							toast('Usuario actualizado.');
							m.close();
							reload();
						} catch (err) { showError(err); }
					}
				}, 'Guardar')
			]
		});
	};

	mount(container, 
		pageHeader('Usuarios', h('button', { class: 'btn btn-primary', onclick: create }, '+ Nuevo usuario')),
		h('p', { class: 'text-muted' }, 'Los administradores gestionan todo el sitio. Los asesores solo ven y editan sus propiedades y sus leads. Propietarios y colaboradores ven solo lo suyo: su acceso se da y se quita en su ficha (Propietarios). Para quitar el acceso a alguien del equipo, desactívalo.'),
		cajaTabla(
			h('table', { class: 'table table-hover table-admin' },
				h('thead', {}, h('tr', {}, ['Nombre', 'Correo', 'Rol', 'Asesor o propietario', 'Estado', 'Alta'].map((t) => h('th', {}, t)))),
				h('tbody', {}, users.map((u) => h('tr', { class: 'clickable', onclick: () => edit(u) },
					h('td', { class: 'fw-semibold' }, u.nombre || '—', u.uid === session.user.uid ? h('span', { class: 'text-muted small' }, ' (tú)') : null),
					h('td', {}, u.email),
					h('td', {}, badge(...rolDe(u))),
					h('td', { class: 'small' }, u.rol === 'socio' && fichaDe(u) ? h('a', { href: `#/propietarios/${u.propietarioId}`, onclick: (e) => e.stopPropagation() }, fichaDe(u).nombre) : agentName[u.agentId] || '—'),
					h('td', {}, u.activo ? badge('Activo', 'success') : badge('Desactivado', 'secondary')),
					h('td', { class: 'small text-muted' }, formatDate(u.createdAt, false)))))), { tarjeta: true }));
}
