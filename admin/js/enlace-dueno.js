// Dueño de una casa (propietario, socio o colaborador): UNA sola forma de enlazarlos, la usen la ficha de la casa
// (views/properties.js) o la de la persona (views/propietarios.js).
// La verdad es la casa (propietarioId). En este orden: 0) una casa por noche con huéspedes por venir no queda sin
// dueño (revisarSinDueno; quien suelta varias la llama antes de escribir nada); 1) la casa (si falla, se para y se ve
// el error); 2) sus reservas por venir pasan al dueño nuevo (las pasadas quedan con quien las ganó), y también sus
// solicitudes de reserva sin terminar y sus chats (así el cliente recibe los datos de pago del dueño nuevo y él las
// ve y las responde; el anterior deja de recibir sus avisos); 3) la lista `propiedades` de cada persona:
// la casa entra en la del nuevo y sale de la de cualquier otro, y `porNoche` se recalcula con sus casas
// (tieneCasasPorNoche); 4) el acuerdo del dueño anterior se borra (no pasa al nuevo) y su resumen se rehace.
// Una lista que las reglas no dejan tocar (la ficha de otro asesor) se avisa en pantalla y se sigue.
import '/js/calc-vacacional.js';
import { db, doc, getDoc, getDocs, updateDoc, deleteDoc, runTransaction, serverTimestamp, collection, query, where } from './firebase.js';
import { publicarPortal } from './portal.js';
import { session } from './session.js';
import { toast, errorMessage } from './ui.js';
import { tieneCasasPorNoche } from './duenos.js';
import { deLaCasa, porVenir, avisoPorVenir } from './reservas.js';

// Casas por noche que quedarían sin dueño: si alguna tiene huéspedes por venir, no se suelta ninguna (¿quién los
// atiende?). casas = [{ id, titulo, operacion }]. Lanza un Error con el aviso.
export async function revisarSinDueno(casas) {
	for (const c of casas.filter((x) => x.operacion === 'vacacional')) {
		const pendientes = await porVenir(c.id);
		if (pendientes.length) throw new Error(avisoPorVenir(pendientes, `«${c.titulo || 'La casa'}» no puede quedar sin dueño`));
	}
}

// Solicitudes de reserva (leads) y chats de una casa que todavía no terminan (ni «no se dio» ni cancelados): los
// atiende su dueño. Solo el administrador cambia el dueño de un chat (reglas).
async function pasarSolicitudes(casaId, nuevoId) {
	const hoy = window.EQVacacional.hoy();
	const deCasa = (col) => getDocs(query(collection(db, col), where('propertyId', '==', casaId)));
	const [leads, chats] = await Promise.all([deCasa('leads'), deCasa('chats')]);
	const abierta = (salida, estado) => (salida || '') >= hoy && !['no', 'cancelada'].includes(estado || '');
	for (const d of leads.docs) {
		const l = d.data();
		if (l.reserva?.codigo && abierta(l.reserva.salida, l.solicitud?.estado) && (l.propietarioId || '') !== nuevoId) await updateDoc(d.ref, { propietarioId: nuevoId, updatedAt: serverTimestamp() });
	}
	for (const d of chats.docs) {
		const c = d.data();
		if (abierta(c.salida, c.estado) && (c.propietarioId || '') !== nuevoId) await updateDoc(d.ref, { propietarioId: nuevoId });
	}
}

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
	if (cambiaDueno && !nuevoId) await revisarSinDueno([casa]);
	// 1) La casa. Sin «catch»: si no se pudo, no se toca nada más.
	if (escribirCasa && cambiaDueno) await updateDoc(doc(db, 'properties', casa.id), { propietarioId: nuevoId });
	// 2) Las reservas que todavía no terminan son del dueño nuevo (él las atiende y las ve en su panel).
	if (cambiaDueno && casa.operacion === 'vacacional') {
		const hoy = window.EQVacacional.hoy();
		for (const r of (await deLaCasa(casa.id)).filter((x) => x.salida >= hoy && (x.propietarioId || '') !== nuevoId)) {
			await updateDoc(doc(db, 'reservas', r.id), { propietarioId: nuevoId, updatedAt: serverTimestamp() });
		}
		// Sus solicitudes y chats abiertos: si no se pudo, la casa ya es del nuevo; se avisa en pantalla y se sigue.
		if (nuevoId) await pasarSolicitudes(casa.id, nuevoId).catch((err) => toast(`La casa quedó con su dueño nuevo, pero sus solicitudes y chats abiertos siguen con el anterior: ${errorMessage(err)}`, 'warning'));
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
