// Permisos de los socios desde el panel (solo el administrador): guardar los interruptores y recalcular lo que puede cada
// socio (permisosSocios/{propietarioId}). La cuenta es la de admin/js/permisos-socio.js, la misma del servidor
// (netlify/lib/permisos.mjs, cada hora): aquí se recalcula al momento para no esperar esa hora.
import { db, doc, getDoc, getDocs, collection, query, where, serverTimestamp, runTransaction } from './firebase.js';
import { anotar, bitacoraActiva } from './bitacora-panel.js';
import { fotoPropietario, fotoPermisos } from './bitacora.js';
import { conDatosDelChat } from './reservas-calculo.js';
import { deudaDe, faltaSaberSiPago, permisosDe, documentoPermisos, mismosPermisos, limpiarDevolver } from './permisos-socio.js';

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
	const lista = reservas.docs.map((d) => ({ id: d.id, ...d.data() }));
	// Las de antes sin la marca: su chat dice si el socio marcó «Pago recibido».
	await Promise.all(lista.map(async (r, i) => {
		if (faltaSaberSiPago(r, propietarioId, Date.now())) lista[i] = conDatosDelChat(r, (await getDoc(doc(db, 'chats', r.chat)).catch(() => null))?.data());
	}));
	const deuda = deudaDe(lista, propietarioId, Date.now());
	const permisos = permisosDe({ global: g, propio, deuda });
	const nuevo = documentoPermisos(permisos, deuda);
	if (limpiarDevolver(propio, deuda)) await cambiarPropios(propietarioId, { devolver: false });
	if (!mismosPermisos(guardado.exists() ? guardado.data() : null, nuevo)) await guardarResultado(propietarioId, nuevo);
	return { permisos, deuda, propio, global: g };
}

// Lo que resulta para un socio (permisosSocios/{id}): si cambia un interruptor, con su renglón en la bitácora (tipo
// permisosSocio), en la misma transacción. Lo mismo hace el servidor cada hora (netlify/lib/permisos.mjs).
async function guardarResultado(propietarioId, nuevo) {
	const conBitacora = await bitacoraActiva();
	await runTransaction(db, async (tx) => {
		const s = await tx.get(refPermisos(propietarioId));
		const bitacoraId = anotar(tx, { tipo: 'permisosSocio', objeto: propietarioId, antes: fotoPermisos(s.exists() ? s.data() : {}), despues: fotoPermisos(nuevo) }, conBitacora);
		tx.set(refPermisos(propietarioId), { ...nuevo, actualizado: serverTimestamp(), ...(bitacoraId ? { bitacoraId } : {}) });
	});
}

// Interruptores para todos: se guardan y se recalcula a cada socio (dueños de casas por noche o con permisos guardados).
// Lo de todos ya quedó guardado aunque falle el recálculo de alguno: devuelve cuántos quedaron para la revisión de cada hora.
export async function guardarGlobal(cambios) {
	// Con su renglón en la bitácora de cambios sensibles (antes y después), en la misma transacción.
	const conBitacora = await bitacoraActiva();
	await runTransaction(db, async (tx) => {
		const s = await tx.get(refGlobal());
		const antes = s.exists() ? s.data() : {};
		const bitacoraId = anotar(tx, { tipo: 'permisos', objeto: 'permisosSocios', antes: fotoPermisos(antes), despues: fotoPermisos({ ...antes, ...cambios }) }, conBitacora);
		tx.set(refGlobal(), { ...cambios, updatedAt: serverTimestamp(), ...(bitacoraId ? { bitacoraId } : {}) }, { merge: true });
	});
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
	await cambiarPropios(propietarioId, cambios);
	return recalcularPermisosDe(propietarioId);
}
// Los permisos de un socio (propietarios/{id}.permisos), con su renglón en la bitácora, en la misma transacción.
async function cambiarPropios(propietarioId, cambios) {
	const conBitacora = await bitacoraActiva();
	const ref = doc(db, 'propietarios', propietarioId);
	await runTransaction(db, async (tx) => {
		const s = await tx.get(ref);
		if (!s.exists()) throw new Error('La ficha ya no existe.');
		const antes = s.data();
		const despues = { ...antes, permisos: { ...(antes.permisos || {}), ...cambios } };
		const bitacoraId = anotar(tx, { tipo: 'propietario', objeto: propietarioId, antes: fotoPropietario(antes), despues: fotoPropietario(despues) }, conBitacora);
		tx.update(ref, { ...Object.fromEntries(Object.entries(cambios).map(([k, v]) => [`permisos.${k}`, v])), ...(bitacoraId ? { bitacoraId } : {}) });
	});
}
