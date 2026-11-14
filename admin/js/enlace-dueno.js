// Dueño de una casa (propietario, socio o colaborador): UNA sola forma de enlazarlos, la usen la ficha de la casa
// (views/properties.js) o la de la persona (views/propietarios.js).
// La verdad es la casa (propietarioId). En este orden: 1) la casa (si falla, se para y se ve el error); 2) sus reservas
// por venir pasan al dueño nuevo (las pasadas quedan con quien las ganó); 3) la lista `propiedades` de cada persona:
// la casa entra en la del nuevo y sale de la de cualquier otro, y `porNoche` se recalcula con sus casas
// (tieneCasasPorNoche); 4) el acuerdo del dueño anterior se borra (no pasa al nuevo) y su resumen se rehace.
// Una lista que las reglas no dejan tocar (la ficha de otro asesor) se avisa en pantalla y se sigue.
import '/js/calc-vacacional.js';
import { db, doc, getDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp } from './firebase.js';
import { publicarPortal } from './portal.js';
import { session } from './session.js';
import { toast, errorMessage } from './ui.js';
import { tieneCasasPorNoche } from './duenos.js';
import { deLaCasa } from './reservas.js';

// Pone la lista de una persona como debe quedar con esta casa (con ella o sin ella) y su `porNoche`, leyendo la ficha
// en la transacción (lo que otra pantalla haya agregado mientras tanto no se pierde).
function ponerEnLista(personaId, casaId, conEsta, casas) {
	return runTransaction(db, async (tx) => {
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
	});
}

// casa = { id, propietarioId (el de ANTES), operacion }; nuevoId = el dueño que queda ('' = sin dueño).
// duenos = las fichas que veo; casas = las propiedades que veo (para saber qué casas tiene cada quien).
//  - escribirCasa: false cuando la ficha de la casa ya guardó su propietarioId.
//  - conservarAcuerdo: true cuando quien llama ya decidió el acuerdo (la ficha de la casa, acuerdoPorGuardar).
export async function asignarDueno(casa, nuevoId, { duenos = [], casas = [], escribirCasa = true, conservarAcuerdo = false } = {}) {
	const anterior = casa.propietarioId || '';
	const cambiaDueno = anterior !== nuevoId;
	// 1) La casa. Sin «catch»: si no se pudo, no se toca nada más.
	if (escribirCasa && cambiaDueno) await updateDoc(doc(db, 'properties', casa.id), { propietarioId: nuevoId });
	// 2) Las reservas que todavía no terminan son del dueño nuevo (él las atiende y las ve en su panel).
	if (cambiaDueno && casa.operacion === 'vacacional') {
		const hoy = window.EQVacacional.hoy();
		for (const r of (await deLaCasa(casa.id)).filter((x) => x.salida >= hoy && (x.propietarioId || '') !== nuevoId)) {
			await updateDoc(doc(db, 'reservas', r.id), { propietarioId: nuevoId, updatedAt: serverTimestamp() });
		}
	}
	// 3) Las listas.
	const despues = [...casas.filter((c) => c.id !== casa.id), { ...casa, propietarioId: nuevoId }];
	const otros = duenos.filter((d) => d.id !== nuevoId && (d.id === anterior || (d.propiedades || []).some((x) => x.propertyId === casa.id)));
	const fallas = [];
	for (const [id, conEsta] of [...otros.map((d) => [d.id, false]), ...(nuevoId ? [[nuevoId, true]] : [])]) {
		await ponerEnLista(id, casa.id, conEsta, despues).catch((err) => fallas.push(`${duenos.find((d) => d.id === id)?.nombre || id}: ${errorMessage(err)}`));
	}
	if (fallas.length) toast(`La casa quedó con su dueño, pero no se pudo poner al día la lista de ${fallas.join(' · ')}`, 'warning');
	// 4) El acuerdo era con el dueño anterior: no pasa al siguiente (solo si de verdad cambió y la casa ya lo dice).
	if (anterior && cambiaDueno && !conservarAcuerdo) await deleteDoc(doc(db, 'properties', casa.id, 'privado', 'acuerdo'));
	// Lo que ve en su panel quien la tenía (su resumen) ya no la trae. (Al nuevo lo pone al día quien guarda.)
	for (const d of otros.filter((x) => x.portalToken)) {
		await getDoc(doc(db, 'propietarios', d.id)).then((s) => s.exists() && publicarPortal({ id: d.id, ...s.data() }))
			.catch((err) => toast(`No se pudo poner al día el resumen de ${d.nombre || d.id}: ${errorMessage(err)}`, 'warning'));
	}
}
