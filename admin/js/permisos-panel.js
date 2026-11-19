// Permisos de los socios desde el panel (solo el administrador): guardar los interruptores y recalcular lo que puede cada
// socio (permisosSocios/{propietarioId}). La cuenta es la de admin/js/permisos-socio.js, la misma del servidor
// (netlify/lib/permisos.mjs, cada hora): aquí se recalcula al momento para no esperar esa hora.
import { db, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, serverTimestamp } from './firebase.js';
import { deudaDe, permisosDe, documentoPermisos, mismosPermisos, limpiarDevolver } from './permisos-socio.js';

const refGlobal = () => doc(db, 'settings', 'permisosSocios');
export const refPermisos = (id) => doc(db, 'permisosSocios', id);

export async function leerGlobal() {
	const s = await getDoc(refGlobal());
	return s.exists() ? s.data() : {};
}

// Lo que resulta para un socio, leído todo ahora. Devuelve { permisos, deuda } para la pantalla.
export async function recalcularPermisosDe(propietarioId, global = null) {
	const [prop, reservas, guardado, g] = await Promise.all([
		getDoc(doc(db, 'propietarios', propietarioId)),
		getDocs(query(collection(db, 'reservas'), where('propietarioId', '==', propietarioId))),
		getDoc(refPermisos(propietarioId)),
		global ? Promise.resolve(global) : leerGlobal()
	]);
	if (!prop.exists()) return null;
	const propio = prop.data().permisos || {};
	const deuda = deudaDe(reservas.docs.map((d) => ({ id: d.id, ...d.data() })), propietarioId, Date.now());
	const permisos = permisosDe({ global: g, propio, deuda });
	const nuevo = documentoPermisos(permisos, deuda);
	if (limpiarDevolver(propio, deuda)) await updateDoc(prop.ref, { 'permisos.devolver': false });
	if (!mismosPermisos(guardado.exists() ? guardado.data() : null, nuevo)) await setDoc(refPermisos(propietarioId), { ...nuevo, actualizado: serverTimestamp() });
	return { permisos, deuda, propio, global: g };
}

// Interruptores para todos: se guardan y se recalcula a cada socio (dueños de casas por noche o con permisos guardados).
// Lo de todos ya quedó guardado aunque falle el recálculo de alguno: devuelve cuántos quedaron para la revisión de cada hora.
export async function guardarGlobal(cambios) {
	await setDoc(refGlobal(), { ...cambios, updatedAt: serverTimestamp() }, { merge: true });
	let global, socios, guardados;
	try { [global, socios, guardados] = await Promise.all([leerGlobal(), getDocs(collection(db, 'propietarios')), getDocs(collection(db, 'permisosSocios'))]); }
	catch (err) { console.warn('Permisos sin recalcular (se recalculan en la próxima hora)', err); return 1; }
	const conDoc = new Set(guardados.docs.map((d) => d.id));
	const ids = socios.docs.filter((d) => d.data().porNoche || d.data().tipo === 'socio' || conDoc.has(d.id)).map((d) => d.id);
	const r = await Promise.allSettled(ids.map((id) => recalcularPermisosDe(id, global)));
	return r.filter((x) => x.status === 'rejected').length;
}

// Interruptores de un socio (y «Devolver hasta que pague»).
export async function guardarPropios(propietarioId, cambios) {
	const campos = Object.fromEntries(Object.entries(cambios).map(([k, v]) => [`permisos.${k}`, v]));
	await updateDoc(doc(db, 'propietarios', propietarioId), campos);
	return recalcularPermisosDe(propietarioId);
}
