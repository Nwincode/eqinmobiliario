// Estado compartido de la sesión y ayudas comunes a todas las vistas.
import {
	db, doc, getDoc, getDocs, setDoc, collection, query, orderBy, serverTimestamp
} from './firebase.js';

export const session = {
	user: null,     // usuario de Firebase Auth
	profile: null,  // documento users/{uid}: { nombre, rol, agentId, activo }
	get isAdmin() { return this.profile && this.profile.rol === 'admin'; },
	get agentId() { return (this.profile && this.profile.agentId) || ''; }
};

let agentsCache = null;

export async function loadAgents(force = false) {
	if (agentsCache && !force) return agentsCache;
	const snap = await getDocs(query(collection(db, 'agents'), orderBy('orden')));
	agentsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
	return agentsCache;
}

export function invalidateAgents() {
	agentsCache = null;
}

export async function agentOptions(withEmpty = 'Sin asignar') {
	const agents = await loadAgents();
	return [...(withEmpty ? [['', withEmpty]] : []), ...agents.map((a) => [a.id, a.nombre])];
}

// Marca que hay cambios sin publicar en el sitio.
export async function markPending(descripcion) {
	try {
		await setDoc(doc(db, 'meta', 'publish'), {
			pendiente: true,
			ultimoCambio: serverTimestamp(),
			ultimoCambioDesc: descripcion || '',
			ultimoCambioPor: session.profile?.nombre || session.user?.email || ''
		}, { merge: true });
		document.dispatchEvent(new CustomEvent('publish-state'));
		programarAutoPublicar();
	} catch (err) {
		console.warn('No se pudo marcar el cambio pendiente', err);
	}
}

// ------------------------------------------------------------ Publicación
// Netlify no devuelve CORS en los build hooks: se envía en modo "no-cors".
export async function publicarAhora(hook) {
	await fetch(hook, { method: 'POST', mode: 'no-cors', body: '{}' });
	await setDoc(doc(db, 'meta', 'publish'), {
		pendiente: false,
		ultimaPublicacion: serverTimestamp(),
		ultimaPublicacionPor: session.profile?.nombre || session.user?.email || ''
	}, { merge: true });
	document.dispatchEvent(new CustomEvent('publish-state'));
}

// Publicación automática (Publicar → "Publicar automáticamente"): espera a que dejes de hacer
// cambios unos segundos y publica sola. Si cierras el panel antes, publica al salir.
export const AUTO_SEGUNDOS = 90;
let autoConfig = null;
let autoTimer = null;
let autoHook = '';

export function olvidarConfigPublicacion() {
	autoConfig = null;
}

async function configPublicacion() {
	if (!autoConfig) {
		autoConfig = getDoc(doc(db, 'settings', 'private'))
			.then((s) => (s.exists() ? s.data() : {}))
			.catch(() => ({}));
	}
	return autoConfig;
}

export async function programarAutoPublicar() {
	const priv = await configPublicacion();
	if (!priv.autoPublicar || !priv.netlifyBuildHook) return;
	autoHook = priv.netlifyBuildHook;
	clearTimeout(autoTimer);
	autoTimer = setTimeout(async () => {
		autoTimer = null;
		try {
			await publicarAhora(autoHook);
		} catch (err) {
			console.warn('No se pudo publicar automáticamente', err);
		}
	}, AUTO_SEGUNDOS * 1000);
}

export const autoPublicacionEnEspera = () => Boolean(autoTimer);

// Al cerrar o salir del panel con una publicación en espera, se dispara de inmediato.
// (Si no alcanza a marcarse como publicada, se revisa la próxima vez que abras el panel.)
window.addEventListener('pagehide', () => {
	if (!autoTimer || !autoHook) return;
	clearTimeout(autoTimer);
	autoTimer = null;
	try {
		navigator.sendBeacon(autoHook, '{}');
	} catch { /* sin sendBeacon */ }
});

// Al entrar al panel: si quedaron cambios sin publicar y la publicación automática está activa.
export async function revisarAutoPublicar() {
	try {
		if ((await getPublishState()).pendiente) await programarAutoPublicar();
	} catch { /* sin permisos o sin conexión */ }
}

export async function getPublishState() {
	const snap = await getDoc(doc(db, 'meta', 'publish'));
	return snap.exists() ? snap.data() : {};
}
