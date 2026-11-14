// Estado compartido de la sesión y ayudas comunes a todas las vistas.
import {
	db, doc, getDoc, getDocs, setDoc, collection, query, where, orderBy, serverTimestamp
} from './firebase.js';
import { datosDelDueno, etiquetaDueno } from './duenos.js';

export const session = {
	user: null,     // usuario de Firebase Auth
	profile: null,  // documento users/{uid}: { nombre, rol, agentId, propietarioId, activo }
	get isAdmin() { return this.profile && this.profile.rol === 'admin'; },
	// Dueño (propietario o colaborador; rol «socio»): solo ve lo suyo. Sus casas por noche las cambia él.
	get esSocio() { return Boolean(this.profile && this.profile.rol === 'socio'); },
	get agentId() { return (this.profile && this.profile.agentId) || ''; },
	dueno: null,     // su resumen (cargarMiResumen), solo para el dueño
	porNoche: false, // tiene al menos una casa por noche (Solicitudes, datos de pago)
	get rolVisible() { return this.isAdmin ? 'Administrador' : this.esSocio ? etiquetaDueno(this.dueno?.tipo) : 'Asesor'; }
};

// ------------------------------------------------------------ Lo del dueño
// Lo que el dueño lee de sí mismo vive en su resumen (portalPropietarios, lo arma el equipo: admin/js/portal.js).
// Mientras las reglas nuevas no estén publicadas esa consulta se niega y vale su ficha (reglas de antes);
// con las nuevas, la ficha se niega y vale el resumen. Así nada se rompe entre publicar el código y las reglas.
export async function cargarMiResumen() {
	const id = session.profile?.propietarioId || '-';
	try {
		// Uno por persona (publicarPortal borra los demás); si alguna vez quedaran dos, vale el más nuevo.
		const s = await getDocs(query(collection(db, 'portalPropietarios'), where('propietarioId', '==', id)));
		const r = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (Number(b.v) || 0) - (Number(a.v) || 0) || (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))[0];
		if (r) return r;
	} catch { /* reglas de antes: sigue con la ficha */ }
	try {
		const s = await getDoc(doc(db, 'propietarios', id));
		if (s.exists()) return { ...datosDelDueno(s.data()), propietarioId: id, propiedades: [], deFicha: true };
	} catch { /* reglas nuevas sin resumen todavía */ }
	return null;
}

// Sus casas, de las tres categorías: las que dicen ser suyas.
export async function misCasas() {
	const s = await getDocs(query(collection(db, 'properties'), where('propietarioId', '==', session.profile?.propietarioId || '-')));
	return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

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
		document.dispatchEvent(new CustomEvent('pendientes'));
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
