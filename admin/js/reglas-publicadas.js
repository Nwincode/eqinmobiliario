// Lo que se le dice al equipo cuando el panel nuevo ya está publicado y las reglas de la base todavía son las de antes
// (docs/portal-propietarios.md: el sitio se publica primero y las reglas en seguida). Solo lo usan los guardados que las
// reglas de antes no conocen (número seguido de cotizaciones): no se guardan a la manera de
// antes, se explica qué falta.
import { db, doc, getDoc } from './firebase.js';

export const SIN_REGLAS_NUEVAS = 'No se guardó: falta publicar las reglas nuevas de la base (Firebase → Firestore → Reglas). Avísale al administrador y vuelve a guardar después.';

// ¿Un «sin permiso» es por las reglas de antes? Solo si se comprueba: se lee lo que solo las reglas nuevas dejan leer
// (`ruta`, p. ej. 'contadores/cotizaciones'); si eso también se niega, faltan las reglas. Si se lee, el error es otro.
export async function faltanReglas(err, ruta) {
	if (err?.code !== 'permission-denied') return false;
	try { await getDoc(doc(db, ...ruta.split('/'))); return false; } catch (e) { return e?.code === 'permission-denied'; }
}
