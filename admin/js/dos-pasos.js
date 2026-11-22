// Verificación en dos pasos (Firebase Auth, segundo factor TOTP: un código de 6 cifras de una app como Google
// Authenticator). Una sola pieza para entrar con contraseña (y, si la cuenta tiene el segundo paso, pedir el código) y
// para inscribir el teléfono de un administrador.
//  - Quien ya tiene el segundo paso: Firebase no da la sesión sin el código, desde el panel o desde cualquier otro lado.
//  - Un administrador sin él: al entrar con la contraseña, el panel no lo deja pasar hasta inscribirlo (exigirlo). Con
//    la sesión ya abierta (recargó la pantalla del QR, otra pestaña) no se le cierra ni se le traba: en cada entrada se
//    vuelve a revisar y, hasta inscribirlo, cada pantalla lleva el aviso (avisoDosPasos) con «Activar». Si el proyecto
//    todavía no tiene activada la verificación en dos pasos (Identity Platform con TOTP, docs/pasos-del-dueno.md),
//    entra igual y en Inicio ve una línea con el enlace a Firebase.
import { auth, firebaseConfig, signInWithEmailAndPassword, signOut, multiFactor, getMultiFactorResolver, TotpMultiFactorGenerator, sendEmailVerification } from './firebase.js';
import { h, errorMessage } from './ui.js';

const ESPERA_QR = '/admin/vendor/qrcode-generator-1.4.4.js';
const EMISOR = 'Equipo Inmobiliario';

const soloCifras = (v) => String(v || '').replace(/\D/g, '').slice(0, 6);
// Sin maxlength: un código pegado como «123 456» (así lo copian varias apps) se cortaría en «123 45»; al escribir o
// pegar quedan solo sus 6 cifras.
const campoCodigo = (id) => h('input', { class: 'form-control form-control-lg text-center dos-pasos-codigo', id, type: 'text', inputmode: 'numeric',
	autocomplete: 'one-time-code', pattern: '[0-9]{6}', required: true, 'aria-describedby': `${id}-ayuda`,
	oninput: (e) => { const v = soloCifras(e.currentTarget.value); if (v !== e.currentTarget.value) e.currentTarget.value = v; } });
const mensajeDe = (err) => (['auth/invalid-verification-code', 'auth/totp-challenge-timeout', 'auth/missing-code'].includes(err?.code)
	? 'Ese código no sirve o ya cambió: escribe el que muestra la app ahora.' : errorMessage(err));

// Entrar con correo y contraseña. Si la cuenta tiene el segundo paso, muestra (con `mostrar`, la tarjeta de entrada del
// panel) la pantalla del código y resuelve al entrar. Lanza el error de la contraseña como siempre.
export async function entrar(email, clave, mostrar) {
	try {
		return await signInWithEmailAndPassword(auth, email, clave);
	} catch (err) {
		if (err?.code !== 'auth/multi-factor-auth-required') throw err;
		const resolver = getMultiFactorResolver(auth, err);
		const pista = resolver.hints.find((x) => x.factorId === TotpMultiFactorGenerator.FACTOR_ID);
		if (!pista) throw err;
		return pedirCodigo(resolver, pista, mostrar);
	}
}

function pedirCodigo(resolver, pista, mostrar) {
	return new Promise((listo) => {
		const codigo = campoCodigo('codigo-entrar');
		const msg = h('div', { class: 'small text-danger mt-2', role: 'alert' });
		const btn = h('button', { class: 'btn btn-primary w-100 mt-3', type: 'submit' }, 'Entrar');
		mostrar(
			h('h1', { class: 'h5 mb-2' }, 'Código de verificación'),
			h('p', { class: 'small text-muted', id: 'codigo-entrar-ayuda' }, 'Escribe el código de 6 cifras de tu app de códigos.'),
			h('form', { onsubmit: async (e) => {
				e.preventDefault();
				btn.disabled = true;
				msg.textContent = '';
				try {
					listo(await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(pista.uid, soloCifras(codigo.value))));
				} catch (err) { msg.textContent = mensajeDe(err); btn.disabled = false; codigo.select(); }
			} }, codigo, btn, msg),
			h('button', { type: 'button', class: 'btn btn-link btn-sm w-100 mt-2', onclick: () => location.reload() }, 'Volver'),
			h('p', { class: 'small text-muted mt-3 mb-0' }, '¿Perdiste el teléfono? Pídele a otro administrador que te lo quite en Firebase.'));
		codigo.focus();
	});
}

// ¿Qué le falta a este administrador? 'listo' (tiene el segundo paso), { secreto } (a inscribir), 'verificar' (su
// correo aún no está confirmado: Firebase lo exige), 'reentrar' (Firebase pide haber entrado hace poco para inscribirlo)
// o { sinActivar } (el proyecto no tiene el segundo paso activado, o el emulador no lo ofrece: se sigue sin él).
export async function revisarDosPasos(user) {
	if (multiFactor(user).enrolledFactors.some((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID)) return 'listo';
	try {
		return { secreto: await TotpMultiFactorGenerator.generateSecret(await multiFactor(user).getSession()) };
	} catch (err) {
		if (err?.code === 'auth/unverified-email') return 'verificar';
		if (err?.code === 'auth/requires-recent-login') return 'reentrar';
		console.warn('Verificación en dos pasos sin activar', err?.code || err);
		return { sinActivar: err?.code || 'sin código' };
	}
}

async function cargarQr() {
	if (window.qrcode) return window.qrcode;
	await new Promise((ok, mal) => { const s = document.createElement('script'); s.src = ESPERA_QR; s.onload = ok; s.onerror = mal; document.head.append(s); });
	return window.qrcode;
}

// El QR del secreto, hecho aquí mismo (el enlace con el secreto no sale a ningún servicio de afuera).
async function qrDe(url) {
	const qr = (await cargarQr())(0, 'M');
	qr.addData(url);
	qr.make();
	const caja = h('div', { class: 'dos-pasos-qr', role: 'img', 'aria-label': 'Código QR para tu app de códigos' });
	caja.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
	return caja;
}

// Pantalla para inscribir el teléfono: QR (en computadora), botón que abre la app (en el teléfono) y la clave para
// escribirla a mano; después, el código. Resuelve al quedar inscrito.
export async function pantallaInscribir(user, secreto, mostrar) {
	const url = secreto.generateQrCodeUrl(user.email || 'administrador', EMISOR);
	const qr = await qrDe(url).catch(() => null);
	return new Promise((listo) => {
		const codigo = campoCodigo('codigo-inscribir');
		const msg = h('div', { class: 'small text-danger mt-2', role: 'alert' });
		const btn = h('button', { class: 'btn btn-primary w-100 mt-3', type: 'submit' }, 'Activar');
		mostrar(
			h('h1', { class: 'h5 mb-2' }, 'Verificación en dos pasos'),
			h('p', { class: 'small text-muted' }, 'Tu cuenta maneja el dinero de todos: al entrar te pediremos también un código de tu teléfono.'),
			h('ol', { class: 'small ps-3 mb-3' },
				h('li', {}, 'Instala Google Authenticator (o la app de códigos que uses).'),
				h('li', {}, 'Escanea este código, o en el teléfono toca «Abrir en la app».'),
				h('li', {}, 'Escribe aquí el código de 6 cifras que te muestra.')),
			qr,
			h('a', { class: 'btn btn-outline-primary btn-sm w-100 mb-2', href: url }, h('span', { class: 'icon-mobile me-1', 'aria-hidden': 'true' }), 'Abrir en la app'),
			h('p', { class: 'small text-muted mb-1' }, 'O escribe esta clave en la app:'),
			h('p', { class: 'dos-pasos-clave' }, secreto.secretKey.replace(/(.{4})/g, '$1 ').trim()),
			h('form', { onsubmit: async (e) => {
				e.preventDefault();
				btn.disabled = true;
				msg.textContent = '';
				try {
					await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secreto, soloCifras(codigo.value)), 'App de códigos');
					listo(true);
				} catch (err) { msg.textContent = mensajeDe(err); btn.disabled = false; codigo.select(); }
			} }, h('label', { class: 'form-label small', for: 'codigo-inscribir' }, 'Código de la app'), codigo, h('div', { id: 'codigo-inscribir-ayuda', class: 'visually-hidden' }, '6 cifras'), btn, msg),
			h('button', { type: 'button', class: 'btn btn-link btn-sm w-100 mt-2', onclick: () => signOut(auth) }, 'Cerrar sesión'));
	});
}

// Lo que dice el panel mientras falta: `pendiente`, lo que resulta de revisarDosPasos (pendienteDe). Lo del
// administrador mismo va en cada pantalla; que el proyecto no lo tenga activado, solo en Inicio.
// Sin red no se sabe: no se dice nada (en la próxima entrada se vuelve a revisar).
export const pendienteDe = (r) => (r === 'listo' || r?.sinActivar === 'auth/network-request-failed' ? '' : r === 'verificar' || r === 'reentrar' ? r : r?.secreto ? 'inscribir' : 'activar');
export function avisoDosPasos(pendiente, ruta, { user, activar }) {
	if (!pendiente || (pendiente === 'activar' && ruta !== 'inicio')) return null;
	const caja = (...hijos) => h('div', { id: 'aviso-dos-pasos', class: 'alert alert-warning small d-flex flex-wrap align-items-center gap-2', role: 'status' }, h('span', { class: 'icon-lock', 'aria-hidden': 'true' }), ...hijos);
	if (pendiente === 'verificar') return caja(h('span', {}, `Confirma tu correo (${user.email}) para activar la verificación en dos pasos.`), botonVerificar(user));
	if (pendiente === 'inscribir') return caja(h('span', {}, 'Activa la verificación en dos pasos: tu cuenta maneja el dinero de todos.'),
		h('button', { type: 'button', class: 'btn btn-sm btn-warning ms-auto', onclick: (e) => { e.currentTarget.disabled = true; activar(); } }, 'Activar'));
	if (pendiente === 'reentrar') return caja(h('span', {}, 'Para activar la verificación en dos pasos, Firebase pide que hayas entrado hace poco: cierra sesión y vuelve a entrar.'));
	return caja(h('span', {}, 'Falta encender la verificación en dos pasos en Firebase (Identity Platform).'),
		h('a', { class: 'btn btn-sm btn-warning ms-auto', href: `https://console.firebase.google.com/project/${encodeURIComponent(firebaseConfig.projectId || '')}/authentication/settings`, target: '_blank', rel: 'noopener' }, 'Abrir Firebase'));
}

// Firebase pide el correo confirmado antes del segundo paso: el botón del aviso que manda el correo para confirmarlo.
export const botonVerificar = (user) => h('button', { type: 'button', class: 'btn btn-sm btn-warning ms-auto', onclick: async (e) => {
	const b = e.currentTarget;
	b.disabled = true;
	try { await sendEmailVerification(user); b.textContent = 'Te lo mandamos'; } catch (err) { b.disabled = false; b.textContent = errorMessage(err); }
} }, 'Mandarme el correo');
