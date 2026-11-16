// Arranque del panel: inicio de sesión, permisos y navegación entre secciones.
import {
	configured, firebaseConfig, auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut,
	verifyPasswordResetCode, confirmPasswordReset, checkActionCode, applyActionCode, doc, getDoc
} from './firebase.js';
import { h, toast, showError, errorMessage, spinner } from './ui.js';
import { correoContrasena, pedirContrasena } from './contrasena.js';
import { MIN_CLAVE, conOjo, debilidad, filtrada, revisionEnVivo } from './clave.js';
import { session, getPublishState, revisarAutoPublicar, cargarMiResumen, misCasas } from './session.js';
import { aplicarTema } from './tema.js';
import { actualizarInsignias } from './pendientes.js';
import { vigilarTablas } from './tablas.js';

const ROUTES = [
	{ path: 'mis-casas', label: 'Mis propiedades', icon: 'icon-home2', group: 'Principal', socio: true, load: () => import('./views/mis-casas.js') },
	{ path: 'solicitudes', label: 'Solicitudes', icon: 'icon-clock-o', group: 'Principal', socio: true, porNoche: true, admin: true, load: () => import('./views/solicitudes.js') },
	{ path: 'inicio', label: 'Inicio', icon: 'icon-tachometer', group: 'Principal', load: () => import('./views/dashboard.js') },
	{ path: 'propiedades', label: 'Propiedades', icon: 'icon-home2', group: 'Inventario', load: () => import('./views/properties.js') },
	{ path: 'listado', label: 'Listado en PDF', icon: 'icon-file-pdf-o', group: 'Inventario', load: () => import('./views/listado.js') },
	{ path: 'difusion', label: 'Difusión', icon: 'icon-bullhorn', group: 'Inventario', load: () => import('./views/difusion.js') },
	{ path: 'leads', label: 'Leads', icon: 'icon-address-card', group: 'Clientes', load: () => import('./views/leads.js') },
	{ path: 'clientes', label: 'Clientes', icon: 'icon-users', group: 'Clientes', load: () => import('./views/clientes.js') },
	{ path: 'agenda', label: 'Agenda', icon: 'icon-calendar', group: 'Clientes', load: () => import('./views/agenda.js') },
	{ path: 'propietarios', label: 'Propietarios', icon: 'icon-key', group: 'Clientes', load: () => import('./views/propietarios.js') },
	{ path: 'rentas', label: 'Rentas vacacionales', icon: 'icon-calendar-check-o', group: 'Clientes', admin: true, load: () => import('./views/rentas.js') },
	{ path: 'calculadora', label: 'Calculadora de renta', icon: 'icon-calculator', group: 'Herramientas', load: () => import('./views/calculadora.js') },
	{ path: 'cotizaciones', label: 'Cotización de servicios', icon: 'icon-receipt', group: 'Herramientas', load: () => import('./views/cotizacion.js') },
	{ path: 'ia', label: 'Asistente', icon: 'icon-star2', group: 'Herramientas', load: () => import('./views/ia.js') },
	{ path: 'google', label: 'Google', icon: 'icon-search', group: 'Herramientas', load: () => import('./views/google.js') },
	{ path: 'reportes', label: 'Reportes', icon: 'icon-bar-chart', group: 'Herramientas', load: () => import('./views/reportes.js'), admin: true },
	{ path: 'contenido', label: 'Contenido del sitio', icon: 'icon-sitemap', group: 'Sitio web', load: () => import('./views/content.js'), admin: true },
	{ path: 'asesores', label: 'Asesores', icon: 'icon-id-card', group: 'Sitio web', load: () => import('./views/agents.js'), admin: true },
	{ path: 'resenas', label: 'Reseñas', icon: 'icon-star', group: 'Sitio web', load: () => import('./views/testimonials.js'), admin: true },
	{ path: 'paginas', label: 'Páginas', icon: 'icon-pencil-square-o', group: 'Sitio web', load: () => import('./views/pages.js'), admin: true },
	{ path: 'blog', label: 'Blog', icon: 'icon-rss-square', group: 'Sitio web', load: () => import('./views/blog.js'), admin: true },
	{ path: 'usuarios', label: 'Usuarios', icon: 'icon-vcard', group: 'Administración', load: () => import('./views/users.js'), admin: true },
	{ path: 'publicar', label: 'Publicar', icon: 'icon-external-link-square', group: 'Administración', load: () => import('./views/publish.js') }
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

// «Mándame el correo para cambiar mi contraseña»: una sola pieza para el botón del panel y para «Tu correo volvió a
// ser el de antes». Se apaga mientras envía y vuelve a servir si falla.
async function mandarmeCorreo(boton, correo) {
	boton.disabled = true;
	try { await correoContrasena(correo); toast(`Te enviamos a ${correo} un botón para cambiar tu contraseña.`); }
	catch (err) { showError(err); }
	finally { boton.disabled = false; }
}

// (El arranque «crear el primer administrador» desde aquí se quitó: ver firestore.rules, meta/bootstrap.)
function loginScreen() {
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
	h('div', { class: 'mb-3' }, h('label', { class: 'form-label', for: 'login-pass' }, 'Contraseña'), conOjo(pass)),
	btn, msg,
	h('button', { type: 'button', class: 'btn btn-link btn-sm w-100 mt-2', onclick: () => pantallaPedirCorreo({
		titulo: 'Crea o cambia tu contraseña', email: email.value.trim(),
		texto: 'Escribe el correo con el que entras al panel y te mandamos un botón para crear una contraseña nueva.'
	}) }, '¿Olvidaste tu contraseña?'));
	// Un aviso viejo («Correo o contraseña incorrectos») se quita en cuanto se vuelve a escribir.
	form.addEventListener('input', () => { msg.textContent = ''; });

	root.replaceChildren(authCard(
		h('h1', { class: 'h5 mb-4' }, 'Panel de administración'),
		form));
}

function noAccess(reason) {
	root.replaceChildren(authCard(
		h('h1', { class: 'h5 mb-3' }, 'Sin acceso'),
		h('p', { class: 'text-muted' }, reason),
		h('button', { class: 'btn btn-outline-secondary w-100', onclick: () => signOut(auth) }, 'Cerrar sesión')));
}

// Lo que cada quien puede abrir: el dueño solo lo suyo (Solicitudes, si tiene casas por noche); el equipo todo lo
// demás (y el admin, además, lo de admin). Una ruta marcada para dueño y admin la ven los dos.
const rutas = () => ROUTES.filter((r) => (session.esSocio ? r.socio && (!r.porNoche || session.porNoche) : (!r.socio || r.admin) && (!r.admin || session.isAdmin)));

function shell() {
	// Menú agrupado por tema (Inventario, Clientes, Sitio web…) para que no sea una lista larga.
	const visibles = rutas();
	const grupos = [...new Set(visibles.map((r) => r.group))];
	const nav = h('nav', { class: 'admin-nav', 'aria-label': 'Secciones' },
		grupos.map((g) => h('div', { class: 'admin-nav-group' },
			g === 'Principal' ? null : h('div', { class: 'admin-nav-title' }, g),
			visibles.filter((r) => r.group === g).map((r) =>
				h('a', { href: `#/${r.path}`, dataset: { route: r.path } }, h('span', { class: r.icon, 'aria-hidden': 'true' }), r.label)))));
	const publishBadge = h('a', { href: '#/publicar', class: 'publish-pill d-none', id: 'publish-pending' }, h('span', { class: 'publish-dot' }), 'Cambios sin publicar');
	const main = h('main', { class: 'admin-main', id: 'view' });
	const nombre = session.profile.nombre || session.user.email;
	const iniciales = nombre.split(/[\s@]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
	const sidebar = h('aside', { class: 'admin-sidebar', id: 'sidebar' },
		h('a', { href: '#/', class: 'admin-brand', 'aria-label': 'Panel de administración' },
			h('img', { src: '/docs/marca/logo/imagotipo-blanco.svg', alt: '' }),
			h('span', {}, h('strong', {}, 'Equipo Inmobiliario'), h('small', {}, 'Panel de administración'))),
		nav,
		h('div', { class: 'admin-user' },
			h('span', { class: 'admin-avatar', 'aria-hidden': 'true' }, iniciales),
			h('div', { class: 'admin-user-info' },
				h('div', { class: 'admin-user-name' }, nombre),
				h('div', { class: 'admin-user-role' }, session.rolVisible)),
			// Cambiar la contraseña estando adentro: el mismo correo con el botón (así se comprueba que es la dueña del correo).
			h('button', { class: 'admin-logout', title: 'Cambiar mi contraseña', 'aria-label': 'Cambiar mi contraseña', onclick: (e) => mandarmeCorreo(e.currentTarget, session.user.email) },
				h('span', { class: 'icon-lock', 'aria-hidden': 'true' })),
			h('button', { class: 'admin-logout', title: 'Cerrar sesión', 'aria-label': 'Cerrar sesión', onclick: () => signOut(auth) }, h('span', { class: 'icon-sign-out', 'aria-hidden': 'true' }))));
	const backdrop = h('div', { class: 'admin-backdrop', onclick: () => sidebar.classList.remove('open') });
	const topbar = h('header', { class: 'admin-topbar' },
		h('button', { class: 'admin-menu-btn d-lg-none', 'aria-label': 'Menú', onclick: () => sidebar.classList.toggle('open') }, h('span', { class: 'icon-bars', 'aria-hidden': 'true' })),
		h('div', { class: 'admin-crumbs', id: 'crumbs' }),
		h('div', { class: 'ms-auto d-flex align-items-center gap-2' },
			session.esSocio ? null : publishBadge,
			h('a', { href: '/', target: '_blank', class: 'btn btn-sm btn-light' }, h('span', { class: 'icon-external-link me-1', 'aria-hidden': 'true' }), 'Ver sitio')));
	root.replaceChildren(h('div', { class: 'admin-layout' }, sidebar, backdrop, h('div', { class: 'admin-content' }, topbar, main)));
	nav.addEventListener('click', () => sidebar.classList.remove('open'));
	vigilarTablas(main);
	if (session.esSocio) return;
	refreshPublishBadge();
	actualizarInsignias(true);
	// Portales de propietarios que quedaron sin actualizar al cerrar la pestaña.
	import('./portal.js').then((m) => m.reanudarRefrescos()).catch(() => {});
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
document.addEventListener('pendientes', () => actualizarInsignias(true));

let renderToken = 0;
async function route() {
	if (!session.profile) return;
	const [, section = 'inicio', ...rest] = location.hash.replace(/^#/, '').split('/');
	const def = rutas().find((r) => r.path === section) || rutas()[0];
	document.querySelectorAll('.admin-nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === def.path));
	const crumbs = document.getElementById('crumbs');
	if (crumbs) crumbs.replaceChildren(
		...(def.group !== 'Principal' && def.group !== def.label ? [h('span', { class: 'admin-crumb-group' }, def.group)] : []),
		h('span', { class: 'admin-crumb-page' }, def.label));
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
		if (!session.esSocio) actualizarInsignias();
	} catch (err) {
		showError(err);
		view.replaceChildren(h('div', { class: 'alert alert-danger' }, errorMessage(err)));
	}
}
window.addEventListener('hashchange', route);

// Crear o cambiar la contraseña con el enlace del correo (/admin/?mode=resetPassword&oobCode=…): la página de la
// empresa, no la de Google. El enlace sirve una vez y vence en 1 hora; lo valida Google. Al guardar, entra directo.
function quitarEnlace() { history.replaceState(null, '', location.pathname); }
// Después de cambiarla, aviso por correo a la misma cuenta (si no fue la persona, se entera). No detiene la entrada.
async function avisarCambio() {
	try {
		const token = await auth.currentUser.getIdToken();
		await fetch('/api/contrasena', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ aviso: 'cambiada' }) });
	} catch { /* sin aviso: la contraseña ya quedó */ }
}
// Otras acciones que Firebase manda a esta misma página (con la URL de acción del panel): confirmar un correo y,
// si alguien cambió el correo de la cuenta, devolverlo al de antes.
async function pantallaAccion(modo, codigo) {
	root.replaceChildren(spinner('Revisando el enlace…'));
	const salir = h('button', { type: 'button', class: 'btn btn-primary w-100', onclick: () => iniciar() }, 'Ir a entrar');
	try {
		if (modo === 'recoverEmail') {
			const info = await checkActionCode(auth, codigo);
			await applyActionCode(auth, codigo);
			const correo = info?.data?.email || '';
			return root.replaceChildren(authCard(h('h1', { class: 'h5 mb-2' }, 'Tu correo volvió a ser el de antes'),
				h('p', { class: 'text-muted small' }, 'La cuenta vuelve a entrar con ', h('strong', { class: 'text-body' }, correo), '. Si tú no pediste el cambio, por seguridad crea una contraseña nueva ahora.'),
				h('button', { type: 'button', class: 'btn btn-primary w-100 mb-2', onclick: (e) => mandarmeCorreo(e.currentTarget, correo) }, 'Mandarme el correo para cambiar la contraseña'),
				h('button', { type: 'button', class: 'btn btn-link btn-sm w-100', onclick: () => iniciar() }, 'Ir a entrar')));
		}
		if (modo === 'verifyEmail') {
			await applyActionCode(auth, codigo);
			return root.replaceChildren(authCard(h('h1', { class: 'h5 mb-2' }, 'Correo confirmado'), h('p', { class: 'text-muted small' }, 'Ya puedes entrar al panel.'), salir));
		}
		throw new Error('acción desconocida');
	} catch {
		root.replaceChildren(authCard(h('h1', { class: 'h5 mb-2' }, 'Este enlace ya no sirve'),
			h('p', { class: 'text-muted small' }, 'Sirve una sola vez y vence pronto. Si necesitas ayuda, escríbele a tu asesor.'), salir));
	}
}
// Pedir el correo para crear o cambiar la contraseña: una sola pantalla para «¿Olvidaste tu contraseña?» y para «Este
// enlace ya no sirve». Su propio formulario (Enter envía), el botón se apaga mientras envía y la respuesta es la misma
// exista o no la cuenta (pedirContrasena).
function pantallaPedirCorreo({ titulo, texto, email = '', boton = 'Enviarme el correo' }) {
	const correo = h('input', { class: 'form-control', type: 'email', id: 'pedir-email', autocomplete: 'username', inputmode: 'email', required: true, value: email });
	const msg = h('div', { class: 'small mt-2', role: 'status' });
	const enviar = h('button', { class: 'btn btn-primary w-100', type: 'submit' }, boton);
	const form = h('form', { onsubmit: async (e) => {
		e.preventDefault();
		enviar.disabled = true; enviar.textContent = 'Enviando…'; msg.textContent = '';
		const r = await pedirContrasena(correo.value.trim());
		msg.className = `small mt-2 ${r.error ? 'text-danger' : 'text-success'}`; msg.textContent = r.error || r.texto;
		enviar.textContent = boton; enviar.disabled = !r.error;
	} }, h('div', { class: 'mb-3' }, h('label', { class: 'form-label', for: 'pedir-email' }, 'Correo'), correo), enviar, msg,
	h('button', { type: 'button', class: 'btn btn-link btn-sm w-100 mt-2', onclick: () => { quitarEnlace(); if (iniciado) loginScreen(); else iniciar(); } }, 'Volver a entrar'));
	form.addEventListener('input', () => { enviar.disabled = false; msg.textContent = ''; });
	root.replaceChildren(authCard(h('h1', { class: 'h5 mb-2' }, titulo), h('p', { class: 'text-muted small' }, texto), form));
	(email ? enviar : correo).focus();
}
async function pantallaContrasena(codigo) {
	root.replaceChildren(spinner('Revisando el enlace…'));
	let email;
	try {
		email = await verifyPasswordResetCode(auth, codigo);
	} catch (err) {
		// Sin internet no es que el enlace venció: se dice eso y se reintenta con el mismo enlace (no gasta otro correo).
		if (err?.code === 'auth/network-request-failed') {
			return root.replaceChildren(authCard(h('h1', { class: 'h5 mb-2' }, 'Sin conexión'),
				h('p', { class: 'text-muted small' }, errorMessage(err)),
				h('button', { type: 'button', class: 'btn btn-primary w-100', onclick: () => pantallaContrasena(codigo) }, 'Intentar otra vez')));
		}
		return pantallaPedirCorreo({ titulo: 'Este enlace ya no sirve', boton: 'Enviarme otro correo',
			texto: 'El botón del correo sirve una sola vez y vence en 1 hora. Escribe tu correo y te mandamos uno nuevo; usa siempre el último que te llegue.' });
	}
	const clave = h('input', { class: 'form-control', type: 'password', id: 'clave-nueva', autocomplete: 'new-password', minlength: MIN_CLAVE, required: true });
	const repite = h('input', { class: 'form-control', type: 'password', id: 'clave-repite', autocomplete: 'new-password', minlength: MIN_CLAVE, required: true });
	const msg = h('div', { class: 'small text-danger mt-2', role: 'alert' });
	const btn = h('button', { class: 'btn btn-primary w-100', type: 'submit' }, 'Guardar y entrar');
	const vivo = revisionEnVivo(clave, repite, email);
	root.replaceChildren(authCard(
		h('h1', { class: 'h5 mb-1' }, 'Crea tu contraseña'),
		h('p', { class: 'text-muted small mb-3' }, 'Para entrar al panel de Equipo Inmobiliario con ', h('strong', { class: 'text-body' }, email), '.'),
		h('form', { novalidate: true, onsubmit: async (e) => {
			e.preventDefault();
			msg.textContent = '';
			const problema = debilidad(clave.value, email);
			if (problema) { msg.textContent = problema; return clave.focus(); }
			if (clave.value !== repite.value) { msg.textContent = 'Las dos contraseñas no son iguales.'; return repite.focus(); }
			btn.disabled = true;
			if (await filtrada(clave.value)) {
				btn.disabled = false;
				msg.textContent = 'Esa contraseña aparece en filtraciones de otros sitios: los ladrones la prueban primero. Usa otra.';
				return clave.focus();
			}
			try {
				if (auth.currentUser) await signOut(auth);
				await confirmPasswordReset(auth, codigo, clave.value);
				quitarEnlace();
				await signInWithEmailAndPassword(auth, email, clave.value);
				avisarCambio();
				iniciar();
			} catch (err) {
				msg.textContent = err?.code === 'auth/expired-action-code' || err?.code === 'auth/invalid-action-code'
					? 'Este enlace ya no sirve: vuelve a abrir esta página desde el último correo, o pide uno nuevo.' : errorMessage(err);
				btn.disabled = false;
			}
		} },
		// Para que el administrador de contraseñas (Chrome, iPhone) la guarde con el correo de esta cuenta.
		h('input', { type: 'email', class: 'visually-hidden', autocomplete: 'username', value: email, readonly: true, tabindex: '-1', 'aria-hidden': 'true' }),
		h('div', { class: 'mb-3' }, h('label', { class: 'form-label', for: 'clave-nueva' }, 'Contraseña nueva'), conOjo(clave), vivo.reglas),
		h('div', { class: 'mb-3' }, h('label', { class: 'form-label', for: 'clave-repite' }, 'Escríbela otra vez'), conOjo(repite), vivo.iguales),
		btn, msg),
		h('p', { class: 'small text-muted mt-3 mb-0' }, h('span', { class: 'icon-lock me-1', 'aria-hidden': 'true' }), 'Entra siempre en eqinmobiliario.gt/admin. Nunca te pediremos tu contraseña por teléfono, WhatsApp ni correo.')));
	clave.focus();
}

let iniciado = false;
function iniciar() {
	if (iniciado) return;
	iniciado = true;
	onAuthStateChanged(auth, async (user) => {
		session.user = user;
		session.profile = null;
		if (!user) return loginScreen();
		root.replaceChildren(spinner('Verificando acceso…'));
		try {
			const snap = await getDoc(doc(db, 'users', user.uid));
			if (!snap.exists()) return noAccess('Tu cuenta existe pero no tiene acceso al panel. Si eres propietario o colaborador, pídeselo a tu asesor.');
			const profile = snap.data();
			if (!profile.activo) return noAccess('Tu acceso al panel está desactivado. Si crees que es un error, escríbele a tu asesor.');
			session.profile = profile;
			if (session.esSocio) {
				// Su nombre de rol (propietario o colaborador) y si tiene casas por noche (Solicitudes).
				const [dueno, casas] = await Promise.all([cargarMiResumen(), misCasas().catch(() => [])]);
				session.dueno = dueno;
				session.porNoche = casas.some((c) => c.operacion === 'vacacional');
			}
			shell();
			route();
			aplicarTema();
			if (!session.esSocio) revisarAutoPublicar();
		} catch (err) {
			noAccess(errorMessage(err));
		}
	});
}

if (!configured) {
	notConfigured();
} else {
	// El código del enlace ya lo leyó y lo borró de la barra /admin/js/enlace.js, antes de cargar nada más.
	const { modo, codigo } = window.__enlace || {};
	if (codigo && modo === 'resetPassword') pantallaContrasena(codigo);
	else if (codigo && (modo === 'verifyEmail' || modo === 'recoverEmail')) pantallaAccion(modo, codigo);
	else iniciar();
}
