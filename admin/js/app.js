// Arranque del panel: inicio de sesión, permisos y navegación entre secciones.
import {
	configured, firebaseConfig, auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut,
	sendPasswordResetEmail, createUserWithEmailAndPassword, doc, getDoc, writeBatch, serverTimestamp
} from './firebase.js';
import { h, toast, showError, errorMessage, spinner } from './ui.js';
import { session, getPublishState } from './session.js';

const ROUTES = [
	{ path: 'inicio', label: 'Inicio', icon: 'icon-tachometer', load: () => import('./views/dashboard.js') },
	{ path: 'propiedades', label: 'Propiedades', icon: 'icon-home2', load: () => import('./views/properties.js') },
	{ path: 'leads', label: 'Leads', icon: 'icon-address-card', load: () => import('./views/leads.js') },
	{ path: 'ia', label: 'Asistente IA', icon: 'icon-star2', load: () => import('./views/ia.js') },
	{ path: 'google', label: 'Google', icon: 'icon-search', load: () => import('./views/google.js') },
	{ path: 'asesores', label: 'Asesores', icon: 'icon-id-card', load: () => import('./views/agents.js'), admin: true },
	{ path: 'resenas', label: 'Reseñas', icon: 'icon-star', load: () => import('./views/testimonials.js'), admin: true },
	{ path: 'paginas', label: 'Páginas', icon: 'icon-pencil-square-o', load: () => import('./views/pages.js'), admin: true },
	{ path: 'blog', label: 'Blog', icon: 'icon-rss-square', load: () => import('./views/blog.js'), admin: true },
	{ path: 'contenido', label: 'Contenido del sitio', icon: 'icon-sitemap', load: () => import('./views/content.js'), admin: true },
	{ path: 'usuarios', label: 'Usuarios', icon: 'icon-vcard', load: () => import('./views/users.js'), admin: true },
	{ path: 'publicar', label: 'Publicar', icon: 'icon-external-link-square', load: () => import('./views/publish.js') }
];

const root = document.getElementById('app');

function authCard(...children) {
	return h('div', { class: 'auth-wrap' },
		h('div', { class: 'auth-card' },
			h('img', { src: '/Icono_Equipoinmobiliario@0.75x.png', alt: 'Equipo Inmobiliario', class: 'auth-logo' }),
			...children));
}

function notConfigured() {
	root.replaceChildren(authCard(
		h('h1', { class: 'h5 mb-3' }, 'Falta conectar Firebase'),
		h('p', { class: 'text-muted' }, 'Copia la configuración web de tu proyecto de Firebase en el archivo site.config.json del repositorio (apiKey, authDomain, projectId, storageBucket, messagingSenderId y appId) y vuelve a publicar.'),
		h('p', { class: 'small text-muted mb-0' }, `Proyecto actual: ${firebaseConfig.projectId || '(sin definir)'}`)));
}

async function loginScreen() {
	let bootstrapOpen = false;
	try {
		bootstrapOpen = !(await getDoc(doc(db, 'meta', 'bootstrap'))).exists();
	} catch { /* sin conexión: se muestra solo el login */ }

	const email = h('input', { class: 'form-control', type: 'email', id: 'login-email', autocomplete: 'username', required: true });
	const pass = h('input', { class: 'form-control', type: 'password', id: 'login-pass', autocomplete: 'current-password', required: true });
	const msg = h('div', { class: 'small text-danger mt-2', role: 'alert' });
	const btn = h('button', { class: 'btn btn-primary w-100', type: 'submit' }, 'Entrar');

	const form = h('form', {
		onsubmit: async (e) => {
			e.preventDefault();
			btn.disabled = true;
			msg.textContent = '';
			try {
				await signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
			} catch (err) {
				msg.textContent = errorMessage(err);
				btn.disabled = false;
			}
		}
	},
	h('div', { class: 'mb-3' }, h('label', { class: 'form-label', for: 'login-email' }, 'Correo'), email),
	h('div', { class: 'mb-3' }, h('label', { class: 'form-label', for: 'login-pass' }, 'Contraseña'), pass),
	btn, msg,
	h('button', {
		type: 'button', class: 'btn btn-link btn-sm w-100 mt-2',
		onclick: async () => {
			if (!email.value) { msg.textContent = 'Escribe tu correo primero.'; return; }
			try {
				await sendPasswordResetEmail(auth, email.value.trim());
				toast('Te enviamos un correo para restablecer la contraseña.');
			} catch (err) { msg.textContent = errorMessage(err); }
		}
	}, '¿Olvidaste tu contraseña?'));

	root.replaceChildren(authCard(
		h('h1', { class: 'h5 mb-4' }, 'Panel de administración'),
		form,
		bootstrapOpen ? h('div', { class: 'border-top mt-4 pt-3' },
			h('p', { class: 'small text-muted' }, 'Aún no hay administradores. Crea la primera cuenta de administrador:'),
			h('button', { class: 'btn btn-outline-primary w-100', onclick: bootstrapScreen }, 'Crear primer administrador')) : null));
}

function bootstrapScreen() {
	const nombre = h('input', { class: 'form-control', id: 'bs-nombre', required: true });
	const email = h('input', { class: 'form-control', type: 'email', id: 'bs-email', required: true, autocomplete: 'username' });
	const pass = h('input', { class: 'form-control', type: 'password', id: 'bs-pass', required: true, minlength: 8, autocomplete: 'new-password' });
	const msg = h('div', { class: 'small text-danger mt-2', role: 'alert' });
	root.replaceChildren(authCard(
		h('h1', { class: 'h5 mb-3' }, 'Primer administrador'),
		h('p', { class: 'small text-muted' }, 'Esta cuenta tendrá acceso total. Después podrás crear las cuentas de los asesores desde "Usuarios".'),
		h('form', {
			onsubmit: async (e) => {
				e.preventDefault();
				if (pass.value.length < 8) { msg.textContent = 'Usa una contraseña de al menos 8 caracteres.'; return; }
				try {
					const cred = await createUserWithEmailAndPassword(auth, email.value.trim(), pass.value);
					const batch = writeBatch(db);
					batch.set(doc(db, 'users', cred.user.uid), {
						nombre: nombre.value.trim(), email: email.value.trim(), rol: 'admin', agentId: '', activo: true, createdAt: serverTimestamp()
					});
					batch.set(doc(db, 'meta', 'bootstrap'), { uid: cred.user.uid, createdAt: serverTimestamp() });
					await batch.commit();
					location.reload();
				} catch (err) {
					msg.textContent = errorMessage(err);
				}
			}
		},
		h('div', { class: 'mb-3' }, h('label', { class: 'form-label', for: 'bs-nombre' }, 'Nombre'), nombre),
		h('div', { class: 'mb-3' }, h('label', { class: 'form-label', for: 'bs-email' }, 'Correo'), email),
		h('div', { class: 'mb-3' }, h('label', { class: 'form-label', for: 'bs-pass' }, 'Contraseña (mín. 8)'), pass),
		h('button', { class: 'btn btn-primary w-100', type: 'submit' }, 'Crear cuenta'), msg,
		h('button', { type: 'button', class: 'btn btn-link btn-sm w-100 mt-2', onclick: loginScreen }, 'Volver'))));
}

function noAccess(reason) {
	root.replaceChildren(authCard(
		h('h1', { class: 'h5 mb-3' }, 'Sin acceso'),
		h('p', { class: 'text-muted' }, reason),
		h('button', { class: 'btn btn-outline-secondary w-100', onclick: () => signOut(auth) }, 'Cerrar sesión')));
}

function shell() {
	const nav = h('nav', { class: 'admin-nav', 'aria-label': 'Secciones' },
		ROUTES.filter((r) => !r.admin || session.isAdmin).map((r) =>
			h('a', { href: `#/${r.path}`, dataset: { route: r.path } }, h('span', { class: r.icon }), r.label)));
	const publishBadge = h('a', { href: '#/publicar', class: 'btn btn-sm btn-warning d-none', id: 'publish-pending' }, 'Cambios sin publicar');
	const main = h('main', { class: 'admin-main', id: 'view' });
	const sidebar = h('aside', { class: 'admin-sidebar', id: 'sidebar' },
		h('a', { href: '#/inicio', class: 'admin-brand', 'aria-label': 'Panel de administración' }, h('img', { src: '/Icono_Equipoinmobiliario@0.75x.png', alt: 'Equipo Inmobiliario' })),
		nav,
		h('div', { class: 'admin-user' },
			h('div', { class: 'small fw-semibold text-truncate' }, session.profile.nombre || session.user.email),
			h('div', { class: 'small text-muted mb-2' }, session.isAdmin ? 'Administrador' : 'Asesor'),
			h('div', { class: 'd-flex gap-2' },
				h('a', { href: '/', target: '_blank', class: 'btn btn-sm btn-outline-secondary' }, 'Ver sitio'),
				h('button', { class: 'btn btn-sm btn-outline-danger', onclick: () => signOut(auth) }, 'Salir'))));
	const topbar = h('header', { class: 'admin-topbar' },
		h('button', { class: 'btn btn-sm btn-outline-secondary d-lg-none', 'aria-label': 'Menú', onclick: () => sidebar.classList.toggle('open') }, '☰'),
		h('div', { class: 'ms-auto d-flex gap-2' }, publishBadge));
	root.replaceChildren(h('div', { class: 'admin-layout' }, sidebar, h('div', { class: 'admin-content' }, topbar, main)));
	nav.addEventListener('click', () => sidebar.classList.remove('open'));
	refreshPublishBadge();
}

async function refreshPublishBadge() {
	const badge = document.getElementById('publish-pending');
	if (!badge) return;
	try {
		const st = await getPublishState();
		badge.classList.toggle('d-none', !st.pendiente);
	} catch { /* sin permisos o sin conexión */ }
}
document.addEventListener('publish-state', refreshPublishBadge);

let renderToken = 0;
async function route() {
	if (!session.profile) return;
	const [, section = 'inicio', ...rest] = location.hash.replace(/^#/, '').split('/');
	const def = ROUTES.find((r) => r.path === section && (!r.admin || session.isAdmin)) || ROUTES[0];
	document.querySelectorAll('.admin-nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === def.path));
	const view = document.getElementById('view');
	const token = ++renderToken;
	view.replaceChildren(spinner());
	try {
		const mod = await def.load();
		if (token !== renderToken) return;
		const container = h('div');
		await mod.render(container, rest.map(decodeURIComponent));
		if (token !== renderToken) return;
		view.replaceChildren(container);
		document.title = `${def.label} · Panel Equipo Inmobiliario`;
		window.scrollTo(0, 0);
	} catch (err) {
		showError(err);
		view.replaceChildren(h('div', { class: 'alert alert-danger' }, errorMessage(err)));
	}
}
window.addEventListener('hashchange', route);

if (!configured) {
	notConfigured();
} else {
	onAuthStateChanged(auth, async (user) => {
		session.user = user;
		session.profile = null;
		if (!user) return loginScreen();
		root.replaceChildren(spinner('Verificando acceso…'));
		try {
			const snap = await getDoc(doc(db, 'users', user.uid));
			if (!snap.exists()) return noAccess('Tu cuenta existe pero no tiene permisos en el panel. Pide a un administrador que te dé acceso desde "Usuarios".');
			const profile = snap.data();
			if (!profile.activo) return noAccess('Tu cuenta está desactivada. Contacta a un administrador.');
			session.profile = profile;
			shell();
			route();
		} catch (err) {
			noAccess(errorMessage(err));
		}
	});
}
