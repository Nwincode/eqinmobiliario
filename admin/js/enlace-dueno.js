// Dueño de una casa (propietario, socio o colaborador): UNA sola forma de enlazarlos, la usen la ficha de la casa
// (views/properties.js) o la de la persona (views/propietarios.js).
// La verdad es la casa (propietarioId); la lista `propiedades` de cada persona se mantiene igual a eso aquí:
// la casa entra en la del dueño nuevo y sale de la de cualquier otro, y `porNoche` (si tiene casas por noche) se
// vuelve a calcular con sus casas (tieneCasasPorNoche). El acuerdo del dueño anterior no pasa al nuevo.
// Lo que las reglas no dejan tocar (la casa o la ficha de otro asesor) se salta y se sigue con lo demás.
import { db, doc, getDoc, updateDoc, deleteDoc, runTransaction } from './firebase.js';
import { publicarPortal } from './portal.js';
import { session } from './session.js';
import { tieneCasasPorNoche } from './duenos.js';

// Pone la lista de una persona como debe quedar con esta casa (con ella o sin ella) y su `porNoche`, leyendo la ficha
// en la transacción (lo que otra pantalla haya agregado mientras tanto no se pierde).
async function ponerEnLista(personaId, casaId, conEsta, casas) {
	await runTransaction(db, async (tx) => {
		const ref = doc(db, 'propietarios', personaId);
		const s = await tx.get(ref);
		if (!s.exists()) return;
		const p = { id: personaId, ...s.data() };
		const lista = (p.propiedades || []).filter((x) => x.propertyId !== casaId).map((x) => ({ propertyId: x.propertyId }));
		if (conEsta) lista.push({ propertyId: casaId });
		// Con todas las casas a la vista (el administrador) se puede apagar; si no, solo se enciende.
		const porNoche = tieneCasasPorNoche({ ...p, propiedades: lista }, casas) || (!session.isAdmin && Boolean(p.porNoche));
		const cambia = JSON.stringify(lista) !== JSON.stringify(p.propiedades || []) || porNoche !== Boolean(p.porNoche);
		if (cambia) tx.update(ref, { propiedades: lista, porNoche });
	}).catch((err) => console.warn(`Ficha ${personaId}: no se pudo poner al día su lista de casas.`, err));
}

// casa = { id, propietarioId (el de ANTES), operacion }; nuevoId = el dueño que queda ('' = sin dueño).
// duenos = las fichas que veo; casas = las propiedades que veo (para saber qué casas tiene cada quien).
//  - escribirCasa: false cuando la ficha de la casa ya guardó su propietarioId.
//  - conservarAcuerdo: true cuando quien llama ya decidió el acuerdo (la ficha de la casa, acuerdoPorGuardar).
export async function asignarDueno(casa, nuevoId, { duenos = [], casas = [], escribirCasa = true, conservarAcuerdo = false } = {}) {
	const anterior = casa.propietarioId || '';
	if (escribirCasa && anterior !== nuevoId) await updateDoc(doc(db, 'properties', casa.id), { propietarioId: nuevoId }).catch((err) => console.warn(`Casa ${casa.id}: no se pudo cambiar su dueño.`, err));
	// El acuerdo era con el dueño anterior: no pasa al siguiente.
	if (anterior && anterior !== nuevoId && !conservarAcuerdo) await deleteDoc(doc(db, 'properties', casa.id, 'privado', 'acuerdo')).catch(() => {});
	const despues = [...casas.filter((c) => c.id !== casa.id), { ...casa, propietarioId: nuevoId }];
	const otros = duenos.filter((d) => d.id !== nuevoId && (d.id === anterior || (d.propiedades || []).some((x) => x.propertyId === casa.id)));
	await Promise.all([
		...otros.map((d) => ponerEnLista(d.id, casa.id, false, despues)),
		nuevoId ? ponerEnLista(nuevoId, casa.id, true, despues) : null
	]);
	// Lo que ve en su panel quien la tenía (su resumen) ya no la trae. (Al nuevo lo pone al día quien guarda.)
	for (const d of otros.filter((x) => x.portalToken)) {
		await getDoc(doc(db, 'propietarios', d.id)).then((s) => s.exists() && publicarPortal({ id: d.id, ...s.data() }))
			.catch((err) => console.warn(`Resumen de ${d.id}: no se pudo poner al día.`, err));
	}
}
