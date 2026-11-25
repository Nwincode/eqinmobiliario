// Estado compartido de la sesión y ayudas comunes a todas las vistas.
import {
	db, doc, getDoc, getDocs, setDoc, collection, query, where, serverTimestamp
} from './firebase.js';
import { datosDelDueno, etiquetaDueno } from './duenos.js';
import { toast, errorMessage, fallaDelServidor } from './ui.js';
import { telefonoWa } from './formato.js';

// El asesor de quien no tiene asesor vinculado: el mismo texto que usa firestore.rules (myAgentId) y storage.rules.
// Con él, el filtro «lo mío» de un asesor sin vincular coincide con la regla y devuelve vacío (no un error).
export const SIN_ASESOR = '(sin asesor)';

export const session = {
	user: null,     // usuario de Firebase Auth
	profile: null,  // documento users/{uid}: { nombre, rol, agentId, propietarioId, activo }
	get isAdmin() { return this.profile && this.profile.rol === 'admin'; },
	// Dueño (propietario o colaborador; rol «socio»): solo ve lo suyo. Sus casas por noche las cambia él.
	get esSocio() { return Boolean(this.profile && this.profile.rol === 'socio'); },
	get agentId() { return (this.profile && this.profile.agentId) || ''; },
	// Para filtrar consultas por «mi asesor» (where agentId ==): nunca vacío.
	get agentFiltro() { return this.agentId || SIN_ASESOR; },
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
// A quién le escribe el dueño por WhatsApp: su asesor (del resumen) o, si no tiene, el WhatsApp de la empresa.
export async function contactoDelEquipo() {
	const a = session.dueno?.asesor;
	if (a?.whatsapp) return { nombre: a.nombre || 'Equipo Inmobiliario', whatsapp: a.whatsapp };
	const site = await getDoc(doc(db, 'settings', 'site')).then((s) => s.data() || {}).catch(() => ({}));
	const wa = telefonoWa(site.contacto?.whatsapp);
	return wa ? { nombre: 'Equipo Inmobiliario', whatsapp: wa } : null;
}

export async function misCasas() {
	const s = await getDocs(query(collection(db, 'properties'), where('propietarioId', '==', session.profile?.propietarioId || '-')));
	return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

let agentsCache = null;

// Orden de una lista con «orden» opcional (asesores, reseñas, páginas): los que no lo tienen van al final, por nombre.
// Se ordena aquí y no con orderBy: la base deja fuera de un orderBy a los documentos sin ese campo.
export const porOrden = (a, b) => (a.orden ?? 999) - (b.orden ?? 999) || String(a.nombre || a.titulo || '').localeCompare(String(b.nombre || b.titulo || ''));

export async function loadAgents(force = false) {
	if (agentsCache && !force) return agentsCache;
	const snap = await getDocs(collection(db, 'agents'));
	agentsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(porOrden);
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
		await programarAutoPublicar();
	} catch (err) {
		console.warn('No se pudo marcar el cambio pendiente', err);
	}
}

// ------------------------------------------------------------ Publicación
// Se publica por el servidor (netlify/functions/publicar.mjs), que llama al enlace de Netlify y revisa su respuesta:
// si Netlify no la acepta (p. ej. el enlace se borró), lanza el error y no se marca publicado.
// `automatica`: la lanzó la publicación automática (se dice así en «Última publicación»).
// Lo que tarda Netlify en poner el sitio al día después de aceptar la publicación (el mismo texto en todo el panel).
export const TIEMPO_PUBLICACION = '2 a 4 minutos';
export async function publicarAhora({ automatica = false } = {}) {
	const res = await fetch('/api/publicar', { method: 'POST', headers: { Authorization: `Bearer ${await session.user.getIdToken()}` }, body: JSON.stringify({ automatica }) });
	const cuerpo = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(cuerpo.error || `No se pudo publicar. ${fallaDelServidor(res.status)}`);
	// El servidor ya lo marcó publicado (con la cuenta de escritura); si no tiene esa cuenta, lo marca el panel.
	if (!cuerpo.marcado) await setDoc(doc(db, 'meta', 'publish'), {
		pendiente: false,
		fallo: false,
		ultimaPublicacion: serverTimestamp(),
		ultimaPublicacionPor: session.profile?.nombre || session.user?.email || '',
		ultimaPublicacionAuto: automatica
	}, { merge: true });
	document.dispatchEvent(new CustomEvent('publish-state'));
}

// Publicación automática (Publicar → "Publicar automáticamente"): espera a que dejes de hacer
// cambios y publica sola. Si cierras el panel antes, publica al salir.
// 10 minutos: lo que se guarda en ese rato sale en una sola publicación (cada una gasta créditos de Netlify). Precios,
// fechas ocupadas y mínimos de las casas por noche se leen al momento y no esperan a publicar.
export const AUTO_SEGUNDOS = 600;
let autoConfig = null;
let autoTimer = null;
let autoHook = '';
// Token de la sesión, guardado al programar: al cerrar el panel no hay tiempo de pedirlo (sendBeacon va sin encabezados).
let autoToken = '';

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

// ¿Se publica solo? Lo dice el aviso de «Guardado» (trasGuardar): no se pide publicar si el sitio se publica solo.
let autoActiva = false;
export const trasGuardar = () => (autoActiva ? `Se publica solo en ${Math.round(AUTO_SEGUNDOS / 60)} minutos (o al cerrar el panel).` : 'Recuerda publicar para verlo en el sitio.');

export async function programarAutoPublicar() {
	const priv = await configPublicacion();
	autoActiva = Boolean(priv.autoPublicar && priv.netlifyBuildHook);
	if (!autoActiva) return;
	autoHook = priv.netlifyBuildHook;
	session.user?.getIdToken().then((t) => { autoToken = t; }, () => {});
	clearTimeout(autoTimer);
	autoTimer = setTimeout(async () => {
		autoTimer = null;
		try {
			await publicarAhora({ automatica: true });
			toast(`Publicado automáticamente: el sitio se pone al día en ${TIEMPO_PUBLICACION}.`);
		} catch (err) {
			console.warn('No se pudo publicar automáticamente', err);
			toast(`No se pudo publicar automáticamente: ${errorMessage(err)}`, 'danger');
		}
	}, AUTO_SEGUNDOS * 1000);
}

export const autoPublicacionEnEspera = () => Boolean(autoTimer);

// Al cerrar o salir del panel con una publicación en espera, se dispara de inmediato, por el mismo /api/publicar: el
// servidor revisa la respuesta de Netlify y la marca publicada, así publicar-pendiente.mjs no la vuelve a publicar.
// (Sin token o si no alcanza a salir, queda pendiente: la publica publicar-pendiente.mjs.)
window.addEventListener('pagehide', () => {
	if (!autoTimer || !autoHook || !autoToken) return;
	clearTimeout(autoTimer);
	autoTimer = null;
	try {
		navigator.sendBeacon('/api/publicar', new Blob([JSON.stringify({ token: autoToken, automatica: true })], { type: 'text/plain' }));
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
