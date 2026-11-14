// Reservas de las casas por noche: UNA sola pieza para crearlas, cancelarlas, borrarlas, marcar lo pagado y bloquear
// sus fechas en el calendario público. La usan Solicitudes (con el chat del cliente) y Rentas vacacionales (a mano).
//  - Las fechas de la casa (vacacional.reservadas) se recalculan dentro de una transacción con las reservas leídas
//    en ese momento (V.cambioDeReserva, en js/calc-vacacional.js): una pestaña abierta desde antes no revive ni
//    borra fechas, y el choque de fechas se revisa en el mismo lugar para todos.
//  - Lo que se escribe tiene la forma que aceptan las reglas (firestore.rules: reservas, leads, chats) para el
//    equipo y para el socio: toda reserva lleva el propietarioId de su casa (así la ve su dueño) y nunca el teléfono
//    ni las notas internas (esos viven en properties/{casa}/privado/reserva-{id}, que solo lee el equipo).
//  - Tres «pagos» distintos, cada uno con su función: el cliente le pagó al socio (pagoRecibido), el socio le pagó
//    la comisión a EQ (comisionPagada) y EQ le pagó al propietario (pagadoAlPropietario).
import '/js/calc-vacacional.js';
import {
	db, doc, getDoc, getDocs, setDoc, collection, query, where, runTransaction, updateDoc, addDoc,
	serverTimestamp, arrayUnion, deleteField
} from './firebase.js';
import { session, markPending } from './session.js';
import { dia } from './ui.js';

const V = window.EQVacacional;
export const MOTIVOS_CANCELAR = ['Cliente canceló', 'Fechas ya no disponibles', 'Otro'];
export const MOTIVOS_NO = ['Cliente no respondió', 'Fechas no disponibles', 'Precio', 'Otro'];

// Viene de una solicitud de la web (tiene chat con el cliente y su solicitud en leads).
export const deSolicitud = (r) => Boolean(r?.leadId || r?.codigo);
const quienEscribe = () => (session.esSocio ? 'socio' : 'equipo');
const refReserva = (id) => doc(db, 'reservas', id);
// Contacto del huésped y notas internas de una reserva hecha a mano: el socio lee la reserva, esto no.
export const refContacto = (propertyId, id) => doc(db, 'properties', propertyId, 'privado', `reserva-${id}`);

// Aviso por correo a quien le toca leer el chat (lo decide el servidor con lo guardado). Si falla, lo escrito ya quedó.
export const avisarChat = (id) => { fetch('/api/aviso-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat: id }) }).catch(() => {}); };

// Lo que cambia en la solicitud al responderla, con su renglón de historial (el socio solo toca `solicitud`).
export const respuesta = (nuevo, que, extra = {}) => ({
	'solicitud.estado': nuevo, ...extra, updatedAt: serverTimestamp(),
	'solicitud.historial': arrayUnion({ que, quien: session.user.uid, nombre: session.profile?.nombre || '', cuando: new Date().toISOString() })
});

// Reservas de una casa que quien está en el panel puede leer, leídas ahora (las reglas piden el filtro de su rol).
export async function deLaCasa(propertyId) {
	const filtros = [where('propertyId', '==', propertyId)];
	if (session.esSocio) filtros.push(where('propietarioId', '==', session.profile?.propietarioId || '-'));
	else if (!session.isAdmin) filtros.push(where('agentId', '==', session.agentId || '-'));
	return (await getDocs(query(collection(db, 'reservas'), ...filtros))).docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Reservas confirmadas de una casa que todavía no terminan (hoy, día de Guatemala). Con alguna, la casa no se borra
// ni deja de ser por noche: el huésped ya tiene esas fechas.
export async function porVenir(propertyId) {
	const hoy = window.EQVacacional.hoy();
	return (await deLaCasa(propertyId)).filter((r) => r.estado === 'confirmada' && r.salida >= hoy);
}
export const avisoPorVenir = (lista, que) => `${que}: tiene ${lista.length === 1 ? 'una reserva confirmada por venir' : `${lista.length} reservas confirmadas por venir`} (${lista.slice(0, 3).map((r) => `${dia(r.llegada)} – ${dia(r.salida)}`).join(', ')}). Cancélalas primero en Rentas o en Solicitudes.`;

export class ChoqueDeFechas extends Error {
	constructor(c) { super(`Esas fechas chocan con otra reserva confirmada: ${dia(c.llegada)} – ${dia(c.salida)}${c.huesped ? ` (${c.huesped})` : ''}.`); this.choque = c; }
}

// El corazón: un cambio de una reserva (antes → despues; null = no existe) en una transacción que lee las casas y la
// reserva, recalcula las fechas de cada casa tocada y escribe todo junto. `escribir(tx, ref)` pone la reserva;
// `ademas(tx)` lo que va con ella (solicitud, chat, mensajes); `revisar(tx)` lee antes de escribir lo que tiene que
// seguir igual (p. ej. que nadie respondió la solicitud mientras tanto) y lanza un error si no.
// Una reserva que alguien cambió desde que se leyó (estado o fecha de su último cambio) no se escribe encima.
const marca = (r) => `${r?.estado || ''}|${r?.updatedAt?.toMillis?.() ?? ''}`;
async function cambiar({ antes = null, despues = null, escribir, ademas, revisar }) {
	const ref = refReserva((despues || antes).id);
	const pids = [...new Set([antes?.propertyId, despues?.propertyId].filter(Boolean))];
	await runTransaction(db, async (tx) => {
		const casas = await Promise.all(pids.map((pid) => tx.get(doc(db, 'properties', pid))));
		// Si la reserva cambió de estado desde que se abrió (otra persona u otra pestaña la canceló), no se escribe encima.
		if (antes) {
			const ahora = await tx.get(ref);
			if (!ahora.exists() || marca(ahora.data()) !== marca(antes)) throw new Error('Esta reserva cambió mientras la tenías abierta (otra persona u otra pestaña). Vuelve a abrirla.');
		}
		if (revisar) await revisar(tx);
		const listas = await Promise.all(pids.map(deLaCasa));
		pids.forEach((pid, i) => {
			if (!casas[i].exists()) return;
			const guardadas = casas[i].data().vacacional?.reservadas || [];
			const c = V.cambioDeReserva({ guardadas, reservas: listas[i], antes, despues, propertyId: pid, completas: session.isAdmin });
			if (c.choque) throw new ChoqueDeFechas(c.choque);
			if (JSON.stringify(c.reservadas) !== JSON.stringify(guardadas)) tx.update(casas[i].ref, { 'vacacional.reservadas': c.reservadas, updatedAt: serverTimestamp() });
		});
		escribir(tx, ref);
		if (ademas) ademas(tx);
	});
}

// Lo que lleva toda reserva al nacer, venga de donde venga. `casa` = { id, titulo, agentId, propietarioId, moneda }.
// Los montos: costoSocio (lo del propietario), alojamiento (lo cobrado sin impuestos) y la ganancia de EQ.
export function nuevaReserva(casa, c) {
	const costoSocio = V.r2(Number(c.costoSocio) || 0), alojamiento = V.r2(Number(c.alojamiento) || 0);
	return {
		propertyId: casa.id, propertyTitulo: c.propertyTitulo || casa.titulo || '',
		agentId: casa.agentId || (session.esSocio ? '' : session.agentId) || '', propietarioId: casa.propietarioId || '',
		moneda: c.moneda || casa.moneda || 'USD', llegada: c.llegada, salida: c.salida, noches: V.nochesEntre(c.llegada, c.salida),
		huesped: String(c.huesped || '').trim(), canal: c.canal || 'directo', estado: c.estado || 'confirmada',
		leadId: c.leadId || '', codigo: c.codigo || '', costoSocio, alojamiento, ganancia: V.r2(alojamiento - costoSocio),
		pagadoSocio: Boolean(c.pagadoSocio), pagadoFecha: c.pagadoSocio ? (c.pagadoFecha || V.hoy()) : ''
	};
}

// ------------------------------------------------------------ A mano (Rentas vacacionales)
// Crea o edita una reserva sin solicitud de cliente. `antes` = la que se abrió (null si es nueva); `contacto` =
// { telefono, notas } del huésped, que van aparte. En una reserva de la web el estado se cambia con «Cancelar».
// La comisión de una reserva de la web: la ganancia de EQ, que se paga el día de llegada (con ella se mide la mora).
// Una sola cuenta: la usan la confirmación y el cambio de montos en Rentas.
export const comisionDeReserva = (r, previa = {}) => ({ ...previa, monto: r.ganancia, vence: r.llegada, pagada: Boolean(previa.pagada) });

export async function guardarReserva(antes, casa, campos, contacto) {
	const id = antes?.id || doc(collection(db, 'reservas')).id;
	const datos = { ...nuevaReserva(casa, { ...antes, ...campos, propertyTitulo: casa.titulo, moneda: casa.moneda || antes?.moneda }), leadId: antes?.leadId || '', codigo: antes?.codigo || '' };
	const web = antes && deSolicitud(antes);
	if (web && datos.estado !== antes.estado) throw new Error('El estado de una reserva de la web se cambia con «Cancelar reserva».');
	// Las fechas y la casa de una reserva de la web son las de la solicitud y el chat del cliente: para cambiarlas se
	// cancela y se hace otra. Aquí solo cambian montos, huésped y notas.
	if (web && (datos.propertyId !== antes.propertyId || datos.llegada !== antes.llegada || datos.salida !== antes.salida)) throw new Error('Las fechas y la casa de una reserva de la web no se cambian aquí: cancélala y haz otra.');
	// Si cambian los montos, cambia con ellos lo que sale de ellos: la comisión (si no está pagada) y lo que muestra la solicitud.
	const conComision = antes?.comision && !antes.comision.pagada;
	if (conComision) datos.comision = comisionDeReserva(datos, antes.comision);
	const montosNuevos = web && (datos.costoSocio !== antes.costoSocio || datos.ganancia !== antes.ganancia);
	const despues = { id, ...datos };
	await cambiar({
		antes, despues,
		escribir: (tx, ref) => {
			tx.set(ref, { ...datos, telefono: deleteField(), notas: deleteField(), updatedAt: serverTimestamp(), ...(antes ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
			if (contacto) tx.set(refContacto(casa.id, id), { telefono: contacto.telefono || '', notas: contacto.notas || '', updatedAt: serverTimestamp() });
			if (antes && antes.propertyId !== casa.id) tx.delete(refContacto(antes.propertyId, id));
		},
		ademas: (tx) => {
			if (montosNuevos && antes.leadId) tx.update(doc(db, 'leads', antes.leadId), { 'solicitud.costoSocio': datos.costoSocio, ...(conComision ? { 'solicitud.comision': datos.comision.monto } : {}), updatedAt: serverTimestamp() });
		}
	});
	await markPending(`${casa.titulo}: reserva ${dia(datos.llegada)} – ${dia(datos.salida)}`);
	return despues;
}

// Borra una reserva hecha a mano (las de la web no se borran: se cancelan, y quedan en el historial).
export async function borrarReserva(r) {
	if (deSolicitud(r)) throw new Error('Una reserva de la web no se borra: se cancela.');
	await cambiar({ antes: r, escribir: (tx, ref) => { tx.delete(ref); tx.delete(refContacto(r.propertyId, r.id)); } });
	await markPending(`${r.propertyTitulo}: reserva borrada`);
}

// Lo que el equipo sabe del huésped de una reserva (las de antes lo traían en la reserva misma).
// Si no se puede leer, no se sigue: guardar con el formulario vacío borraría lo que hay.
export async function contactoDe(r) {
	let s;
	try { s = await getDoc(refContacto(r.propertyId, r.id)); } catch (err) {
		throw new Error(`No se pudo leer el teléfono y las notas de esta reserva (${err.code || err.message}); no se abre para no borrarlos. Vuelve a intentarlo.`);
	}
	return s.exists() ? s.data() : { telefono: r.telefono || '', notas: r.notas || '' };
}

// Reservas guardadas antes de este cambio: el teléfono y las notas pasan a lo privado de la casa y, ya fuera,
// la reserva recibe el propietarioId de su casa (así la ve su dueño). Primero lo privado; después la reserva.
// Solo el administrador. Devuelve cuántas se pusieron al día.
export async function ponerAlDiaReservas(reservas, casas) {
	if (!session.isAdmin) return 0;
	let n = 0;
	for (const r of reservas) {
		const casa = casas.find((c) => c.id === r.propertyId);
		const conContacto = r.telefono !== undefined || r.notas !== undefined;
		const sinDueno = casa?.propietarioId && !r.propietarioId;
		if (!casa || (!conContacto && !sinDueno)) continue;
		if (conContacto) {
			// Sin «catch»: «no se pudo leer» no es «no existe».
			const previo = (await getDoc(refContacto(casa.id, r.id))).data() || {};
			await setDoc(refContacto(casa.id, r.id), { telefono: previo.telefono || r.telefono || '', notas: previo.notas || r.notas || '', updatedAt: serverTimestamp() });
		}
		await updateDoc(refReserva(r.id), { ...(sinDueno ? { propietarioId: casa.propietarioId } : {}), ...(conContacto ? { telefono: deleteField(), notas: deleteField() } : {}) });
		n++;
	}
	return n;
}

// ------------------------------------------------------------ Desde una solicitud (Solicitudes, con chat)
// Chat de una reserva de la web: { ref, estado }. Solicitudes ya lo tiene; Rentas lo busca por el código.
async function chatDe(r, chat) {
	if (chat !== undefined) return chat;
	if (!r.codigo || session.esSocio) return null;
	const s = (await getDocs(query(collection(db, 'chats'), where('codigo', '==', r.codigo)))).docs[0];
	return s ? { ref: s.ref, estado: s.data().estado || '' } : null;
}
// Mensaje al cliente y estado nuevo del chat. El mensaje va antes en el mismo lote: las reglas lo miran con el chat
// todavía abierto (para el socio, un chat cancelado ya no recibe mensajes suyos).
const cerrarChat = (tx, chat, estado, texto) => {
	tx.set(doc(collection(chat.ref, 'mensajes')), { de: quienEscribe(), texto, createdAt: serverTimestamp() });
	tx.update(chat.ref, { estado });
};

// La solicitud `l` (con l.reserva { codigo, llegada, salida, moneda }) queda confirmada: nace su reserva con la
// comisión (la ganancia, se paga el día de llegada), la solicitud y el chat dicen «confirmada» y el cliente recibe
// los datos de pago del socio. `cuenta` = V.gananciaEstancia de esas fechas; `pago` = datos de pago (con chat).
export async function confirmarSolicitud(l, cuenta, { chat = null, pago = '' } = {}) {
	const r = l.reserva;
	const p = (await getDoc(doc(db, 'properties', l.propertyId))).data();
	// Una reserva por solicitud: su id es el de la solicitud (las reglas lo exigen al socio).
	const id = l.id;
	const datos = {
		...nuevaReserva({ id: l.propertyId, ...p }, {
			propertyTitulo: l.propertyTitulo, moneda: r.moneda || 'USD', llegada: r.llegada, salida: r.salida, estado: 'confirmada', canal: 'web',
			// Solo el primer nombre: el socio lee sus reservas; el contacto del cliente queda en la solicitud (leadId).
			huesped: String(l.nombre || '').trim().split(/\s+/)[0], leadId: l.id, codigo: r.codigo, costoSocio: cuenta.costoSocio, alojamiento: cuenta.alojamiento
		}),
	};
	datos.comision = comisionDeReserva(datos);
	await cambiar({
		despues: { id, ...datos },
		// Nadie la respondió mientras tanto (otra pestaña, el socio o el equipo).
		revisar: async (tx) => sinResponder(tx, l, chat),
		escribir: (tx, ref) => tx.set(ref, { ...datos, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
		ademas: (tx) => {
			tx.update(doc(db, 'leads', l.id), respuesta('confirmada', 'Confirmó', { 'solicitud.reservaId': id, 'solicitud.costoSocio': cuenta.costoSocio, 'solicitud.comision': cuenta.ganancia }));
			if (chat) {
				tx.update(chat.ref, { estado: 'confirmada' });
				// Los datos de pago viajan con la confirmación: sin reserva registrada no hay a dónde pagar.
				tx.set(doc(collection(chat.ref, 'mensajes')), { de: quienEscribe(), tipo: 'pago', texto: pago, createdAt: serverTimestamp() });
			}
		}
	});
	if (chat) avisarChat(chat.ref.id);
	await markPending(`${p.titulo}: reserva ${r.codigo} confirmada`);
}

// Lee, dentro de la transacción, que la solicitud siga sin responder: el chat (lo lee cualquiera con el enlace) y, para
// el equipo, la solicitud misma (el socio no la lee).
async function sinResponder(tx, l, chat) {
	const [c, sol] = await Promise.all([chat ? tx.get(chat.ref) : null, session.esSocio ? null : tx.get(doc(db, 'leads', l.id))]);
	const yaChat = c?.data()?.estado, yaSol = sol?.data()?.solicitud?.estado;
	if (yaChat || (yaSol && yaSol !== 'pendiente')) throw new Error('Esta solicitud ya se respondió (otra persona u otra pestaña). Recarga la página.');
}

// La solicitud no se dio: la solicitud y el chat lo dicen, y el cliente recibe el mensaje. No hay reserva.
export async function noSeDio(l, motivo, chat = null) {
	await runTransaction(db, async (tx) => {
		await sinResponder(tx, l, chat);
		tx.update(doc(db, 'leads', l.id), respuesta('no', 'No se dio', { 'solicitud.motivo': motivo }));
		if (chat) cerrarChat(tx, chat, 'no', 'Lo sentimos: la casa no está disponible en esas fechas.');
	});
	if (chat) avisarChat(chat.ref.id);
}

// Cancela una reserva, venga de Rentas o de Solicitudes: sus fechas quedan libres y, si vino de la web, la
// solicitud y el chat dicen «cancelada» y el cliente recibe el mensaje. `chat`: el de Solicitudes (si no, se busca).
export async function cancelarReserva(r, motivo, { chat } = {}) {
	const delCliente = await chatDe(r, chat);
	const cierra = delCliente && !['cancelada', 'no'].includes(delCliente.estado);
	await cambiar({
		antes: r, despues: { ...r, estado: 'cancelada' },
		// Solo estado, motivo y fecha: es lo único que el socio puede cambiar de su reserva.
		escribir: (tx, ref) => tx.set(ref, { estado: 'cancelada', motivo, updatedAt: serverTimestamp() }, { merge: true }),
		ademas: (tx) => {
			if (r.leadId) tx.update(doc(db, 'leads', r.leadId), respuesta('cancelada', 'Canceló', { 'solicitud.motivo': motivo }));
			if (cierra) cerrarChat(tx, delCliente, 'cancelada', 'La reserva se canceló.');
		}
	});
	if (cierra) avisarChat(delCliente.ref.id);
	await markPending(`${r.propertyTitulo}: reserva ${r.codigo || dia(r.llegada)} cancelada`);
}

// El cliente le pagó al socio: ve «Pago recibido» y los datos de llegada guardados en la casa.
// En dos pasos y en este orden: las reglas solo dejan mandar la llegada cuando el pago YA está marcado
// (dentro de un mismo lote todavía ven el estado anterior y lo rechazan).
export async function pagoRecibido(chat, propertyId) {
	if (chat.estado !== 'pagada') await updateDoc(chat.ref, { estado: 'pagada' });
	// La dirección y el mapa viajan en el mensaje, copiados de lo privado de la casa (las reglas exigen que sean iguales).
	const ll = (await getDoc(doc(db, 'properties', propertyId, 'privado', 'llegada'))).data();
	await addDoc(collection(chat.ref, 'mensajes'), { de: quienEscribe(), tipo: 'llegada', texto: 'llegada', ...(ll ? { direccion: ll.direccion || '', mapa: ll.mapa || '' } : {}), createdAt: serverTimestamp() });
	avisarChat(chat.ref.id);
}

// El socio subió la foto de su transferencia de la comisión.
export const ponerComprobante = (res, url) => updateDoc(refReserva(res.id), { 'comision.comprobante': url, updatedAt: serverTimestamp() });

// El socio le pagó la comisión a EQ (solo el administrador lo marca). Si sus casas estaban fuera del sitio, vuelven al publicar.
export async function comisionPagada(res, nivel) {
	await updateDoc(refReserva(res.id), { 'comision.pagada': true, 'comision.pagadaEl': new Date().toISOString(), updatedAt: serverTimestamp() });
	if (nivel === 3) await markPending(`${res.propertyTitulo}: comisión pagada, las casas del socio vuelven al sitio`);
}

// EQ le pagó al propietario lo suyo de estas reservas.
export const pagadoAlPropietario = (lista) => Promise.all(lista.map((r) => updateDoc(refReserva(r.id), { pagadoSocio: true, pagadoFecha: V.hoy(), updatedAt: serverTimestamp() })));
