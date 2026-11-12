import {
	auth, db, doc, getDocs, setDoc, updateDoc, collection, serverTimestamp, createAccount, sendPasswordResetEmail
} from '../firebase.js';
import { h, toast, showError, pageHeader, badge, modal, formatDate , mount, cajaTabla } from '../ui.js';
import { session, loadAgents } from '../session.js';
import { loadPropietarios } from '../crm.js';

const ROLES = [['asesor', 'Asesor (sus propiedades y leads)'], ['admin', 'Administrador (acceso total)'],
	['socio', 'Socio de rentas (solo sus casas: precios y calendario)']];
const NOMBRE_ROL = { admin: ['Administrador', 'primary'], asesor: ['Asesor', 'info'], socio: ['Socio', 'warning'] };

function userForm(agents, propietarios, user = {}) {
	const nombre = h('input', { class: 'form-control', value: user.nombre || '' });
	const email = h('input', { class: 'form-control', type: 'email', value: user.email || '', disabled: Boolean(user.uid) });
	const pass = h('input', { class: 'form-control', type: 'text', placeholder: 'Mínimo 8 caracteres' });
	const rol = h('select', { class: 'form-select' }, ROLES.map(([v, l]) => h('option', { value: v }, l)));
	rol.value = user.rol || 'asesor';
	const agentId = h('select', { class: 'form-select' }, h('option', { value: '' }, 'Ninguno'), agents.map((a) => h('option', { value: a.id }, a.nombre)));
	agentId.value = user.agentId || '';
	const propietarioId = h('select', { class: 'form-select' }, h('option', { value: '' }, 'Elegí el propietario'), propietarios.map((p) => h('option', { value: p.id }, p.nombre)));
	propietarioId.value = user.propietarioId || '';
	const activo = h('input', { class: 'form-check-input', type: 'checkbox', id: 'u-activo' });
	activo.checked = user.activo !== false;
	const isSelf = user.uid === session.user.uid;
	if (isSelf) { rol.disabled = true; activo.disabled = true; }

	const cajaAsesor = h('div', { class: 'col-md-6' }, h('label', { class: 'form-label' }, 'Asesor vinculado'), agentId,
		h('div', { class: 'form-text' }, 'Necesario para que un asesor vea y edite sus propiedades y leads.'));
	const cajaSocio = h('div', { class: 'col-md-6' }, h('label', { class: 'form-label' }, 'Propietario (sus casas) *'), propietarioId,
		h('div', { class: 'form-text' }, 'El socio verá solo las casas de este propietario. Se crean y se le asignan en "Propietarios".'));
	const segunRol = () => { cajaSocio.hidden = rol.value !== 'socio'; cajaAsesor.hidden = rol.value === 'socio'; };
	rol.addEventListener('change', segunRol);
	segunRol();

	const body = h('div', { class: 'row g-3' },
		h('div', { class: 'col-md-6' }, h('label', { class: 'form-label' }, 'Nombre *'), nombre),
		h('div', { class: 'col-md-6' }, h('label', { class: 'form-label' }, 'Correo *'), email),
		user.uid ? null : h('div', { class: 'col-md-6' }, h('label', { class: 'form-label' }, 'Contraseña temporal *'), pass,
			h('div', { class: 'form-text' }, 'Compártela con la persona; podrá cambiarla con "¿Olvidaste tu contraseña?".')),
		h('div', { class: 'col-md-6' }, h('label', { class: 'form-label' }, 'Rol'), rol),
		cajaAsesor, cajaSocio,
		h('div', { class: 'col-12' }, h('div', { class: 'form-check form-switch' }, activo, h('label', { class: 'form-check-label', for: 'u-activo' }, 'Acceso activo'))));

	return {
		body,
		values: () => ({ nombre: nombre.value.trim(), email: email.value.trim(), password: pass.value, rol: rol.value, activo: activo.checked,
			agentId: rol.value === 'socio' ? '' : agentId.value, propietarioId: rol.value === 'socio' ? propietarioId.value : '' })
	};
}

export async function render(container) {
	const [snap, agents, propietarios] = await Promise.all([getDocs(collection(db, 'users')), loadAgents(), loadPropietarios()]);
	const users = snap.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
	const agentName = Object.fromEntries(agents.map((a) => [a.id, a.nombre]));
	const reload = () => { container.replaceChildren(); render(container); };

	const falta = (v) => (v.rol === 'asesor' && !v.agentId ? 'Vincula el usuario a un asesor (créalo antes en "Asesores").'
		: v.rol === 'socio' && !v.propietarioId ? 'Elegí el propietario del socio (créalo antes en "Propietarios").' : '');

	const create = () => {
		const f = userForm(agents, propietarios);
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
								nombre: v.nombre, email: v.email, rol: v.rol, agentId: v.agentId, propietarioId: v.propietarioId, activo: v.activo,
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

	const edit = (u) => {
		const f = userForm(agents, propietarios, u);
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
						const patch = { nombre: v.nombre, agentId: v.agentId, propietarioId: v.propietarioId, updatedAt: serverTimestamp() };
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
		h('p', { class: 'text-muted' }, 'Los administradores gestionan todo el sitio. Los asesores solo ven y editan sus propiedades y sus leads. Los socios de rentas solo ven sus casas: precios, días bloqueados y mínimos de noches. Para quitar el acceso a alguien, desactívalo.'),
		cajaTabla(
			h('table', { class: 'table table-hover table-admin' },
				h('thead', {}, h('tr', {}, ['Nombre', 'Correo', 'Rol', 'Asesor o propietario', 'Estado', 'Alta'].map((t) => h('th', {}, t)))),
				h('tbody', {}, users.map((u) => h('tr', { class: 'clickable', onclick: () => edit(u) },
					h('td', { class: 'fw-semibold' }, u.nombre || '—', u.uid === session.user.uid ? h('span', { class: 'text-muted small' }, ' (tú)') : null),
					h('td', {}, u.email),
					h('td', {}, badge(...(NOMBRE_ROL[u.rol] || NOMBRE_ROL.asesor))),
					h('td', { class: 'small' }, agentName[u.agentId] || propietarios.find((p) => p.id === u.propietarioId)?.nombre || '—'),
					h('td', {}, u.activo ? badge('Activo', 'success') : badge('Desactivado', 'secondary')),
					h('td', { class: 'small text-muted' }, formatDate(u.createdAt, false)))))), { tarjeta: true }));
}
