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
	} catch (err) {
		console.warn('No se pudo marcar el cambio pendiente', err);
	}
}

export async function getPublishState() {
	const snap = await getDoc(doc(db, 'meta', 'publish'));
	return snap.exists() ? snap.data() : {};
}
