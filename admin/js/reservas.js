// Reservas de las casas por noche: UNA sola pieza para crearlas, cancelarlas, borrarlas, marcar lo pagado y bloquear
// sus fechas en el calendario público. La usan Solicitudes (con el chat del cliente) y Rentas vacacionales (a mano).
//  - Las fechas de la casa (vacacional.reservadas) se recalculan dentro de una transacción con las reservas leídas
//    en ese momento (V.cambioDeReserva, en js/calc-vacacional.js): una pestaña abierta desde antes no revive ni
//    borra fechas, y el choque de fechas se revisa en el mismo lugar para todos.
//  - Lo que se escribe tiene la forma que aceptan las reglas (firestore.rules: reservas, leads, chats): toda reserva
//    lleva el propietarioId de su casa (así la ve su dueño) y nunca el teléfono ni las notas internas (esos viven en properties/{casa}/privado/reserva-{id}, que solo lee el equipo).
//  - Tres «pagos» distintos, cada uno con su función: el cliente le pagó al socio (pagoRecibido), el socio le pagó
//    la comisión a EQ (comisionPagada) y EQ le pagó al propietario (pagadoAlPropietario).
//  - Los montos y las revisiones salen de admin/js/reservas-calculo.js, lo mismo que usa el servidor.
//  - Lo que hace el SOCIO (confirmar, «No se dio», cancelar, pago recibido) lo hace el servidor (/api/reservas,
//    netlify/functions/reservas.mjs): el panel solo le dice qué solicitud y qué acción. Si el servidor todavía no tiene
//    su cuenta de escritura (503), sigue por el camino de antes, que las reglas publicadas aceptan o niegan.
import '/js/calc-vacacional.js';
import {
	db, doc, getDoc, getDocs, setDoc, collection, query, where, runTransaction, updateDoc, writeBatch,
	serverTimestamp, arrayUnion, deleteField
} from './firebase.js';
import { session, markPending } from './session.js';
import { dia } from './ui.js';

import { choqueExterno, deSolicitud, nuevaReserva, comisionDeReserva, reservaDeSolicitud, yaRespondida, motivoParaNoConfirmar, faltaDireccion, textoNo, TEXTO_CANCELADA, TEXTO_SIN_DIRECCION } from './reservas-calculo.js';

const V = window.EQVacacional;
const quienEscribe = () => (session.esSocio ? 'socio' : 'equipo');
const refReserva = (id) => doc(db, 'reservas', id);
// Contacto del huésped y notas internas de una reserva hecha a mano: el socio lee la reserva, esto no.
export const refContacto = (propertyId, id) => doc(db, 'properties', propertyId, 'privado', `reserva-${id}`);

// Aviso por correo a quien le toca leer el chat (lo decide el servidor con lo guardado). Si falla, lo escrito ya quedó.
export const avisarChat = (id) => { fetch('/api/aviso-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat: id }) }).catch(() => {}); };

// Lo que el panel cambió en las fechas de una casa (reserva, bloqueo, solicitud respondida, la ficha): la página lo
// muestra en seguida (/api/disponibilidad borra su copia del CDN; sin esto, en 30 s). Si falla, lo escrito ya quedó.
export async function alDiaEnLaWeb(...ids) {
	const casas = [...new Set(ids.filter(Boolean))];
	if (!casas.length || !session.user) return;
	try {
		const token = await session.user.getIdToken();
		await fetch('/api/disponibilidad', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: casas }) });
	} catch { /* sin red: el CDN la olvida solo */ }
}
// Lo que ocupa una casa ahora, como lo ve la página (sin la copia del CDN): { ocupadas, externas (Airbnb, Booking, VRBO),
// apartadas (solicitudes que apartan sus fechas) }. null si no responde (la casa sin publicar da 404).
export async function ocupacionDe(propertyId) {
	try {
		const r = await fetch(`/api/disponibilidad/al-dia?id=${encodeURIComponent(propertyId)}`, { headers: { Accept: 'application/json' } });
		return r.ok ? await r.json() : null;
	} catch { return null; }
}

// Lo que cambia en la solicitud al responderla, con su renglón de historial (el socio solo toca `solicitud`).
export const respuesta = (nuevo, que, extra = {}) => ({
	'solicitud.estado': nuevo, ...extra, updatedAt: serverTimestamp(),
	'solicitud.historial': arrayUnion({ que, quien: session.user.uid, nombre: session.profile?.nombre || '', cuando: new Date().toISOString() })
});

// Reservas de una casa que quien está en el panel puede leer, leídas ahora (las reglas piden el filtro de su rol).
export async function deLaCasa(propertyId) {
	const filtros = [where('propertyId', '==', propertyId)];
	if (session.esSocio) filtros.push(where('propietarioId', '==', session.profile?.propietarioId || '-'));
	else if (!session.isAdmin) filtros.push(where('agentId', '==', session.agentFiltro));
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
	await alDiaEnLaWeb(...pids);
}

// ------------------------------------------------------------ A mano (Rentas vacacionales)
// Crea o edita una reserva sin solicitud de cliente. `antes` = la que se abrió (null si es nueva); `contacto` =
// { telefono, notas } del huésped, que van aparte. En una reserva de la web el estado se cambia con «Cancelar».
// Una reserva que ya terminó (salida antes de hoy) en la misma casa sigue con el dueño que la ganó, aunque la casa
// haya cambiado de dueño después (asignarDueno solo pasa al nuevo las que no han terminado).
export async function guardarReserva(antes, casa, campos, contacto) {
	const id = antes?.id || doc(collection(db, 'reservas')).id;
	const datos = { ...nuevaReserva(casa, { ...antes, ...campos, propertyTitulo: casa.titulo }), leadId: antes?.leadId || '', codigo: antes?.codigo || '' };
	if (antes?.propietarioId && antes.propertyId === casa.id && datos.salida < V.hoy()) datos.propietarioId = antes.propietarioId;
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
// Lo que hace el socio pasa por el servidor: le manda la acción y la solicitud, y el servidor lee, calcula y escribe todo
// (y manda los correos). null = el servidor todavía no tiene su cuenta de escritura (503) o el chat es de antes, sin su
// índice: se sigue por el camino de antes.
// Un error del servidor se muestra con su texto (`err.servidor` = el código: 403, 409, 422…).
let sinServidor = false;
export async function porServidor(accion, leadId, extra = {}) {
	sinServidor = false;
	const token = await session.user.getIdToken();
	const res = await fetch('/api/reservas', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ accion, leadId, ...extra }) });
	const cuerpo = await res.json().catch(() => ({}));
	// Sin cuenta de escritura (503) o un chat de antes sin su índice: lo deciden las reglas publicadas.
	sinServidor = res.status === 503;
	if (res.status === 503 || cuerpo.caminoDeAntes) return null;
	// `yaRespondida`: otra pestaña (o un intento cuya respuesta se perdió) ya lo hizo: la pantalla se recarga.
	if (!res.ok) throw Object.assign(new Error(cuerpo.error || `El servidor respondió ${res.status}.`), { servidor: res.status, yaRespondida: Boolean(cuerpo.yaRespondida) });
	return cuerpo;
}
// Lo del socio que siguió por el camino de antes porque el servidor respondió 503: si las reglas ya son las nuevas, lo
// niegan; eso no es culpa de la solicitud (no se dice «no cuadra»): el servidor no está disponible.
function conCaminoDeAntes(fn) {
	return async (...args) => {
		try {
			return await fn(...args);
		} catch (err) {
			if (session.esSocio && sinServidor && err?.code === 'permission-denied') throw Object.assign(new Error('El servidor de reservas no está disponible: avísale al administrador.'), { servidor: 503 });
			throw err;
		}
	};
}
// ¿El servidor ya escribe las reservas del socio? 'activo', 'sin configurar' o 'error' (el aviso de Solicitudes).
export async function estadoServidor() {
	const token = await session.user.getIdToken();
	const res = await fetch('/api/reservas', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
	return res?.ok ? (await res.json()).estado : 'error';
}

// Chat de una reserva de la web: { ref, estado }. Solicitudes ya lo tiene; Rentas lo busca por el código.
async function chatDe(r, chat) {
	if (chat !== undefined) return chat;
	if (r.chat && !session.esSocio) {
		const s = await getDoc(doc(db, 'chats', r.chat));
		if (s.exists()) return { ref: s.ref, estado: s.data().estado || '' };
	}
	if (!r.codigo || session.esSocio) return null;
	const s = (await getDocs(query(collection(db, 'chats'), where('codigo', '==', r.codigo)))).docs[0];
	return s ? { ref: s.ref, estado: s.data().estado || '' } : null;
}
// Mensaje al cliente y estado nuevo del chat. El mensaje va antes en el mismo lote: las reglas lo miran con el chat
// todavía abierto.
// El aviso por correo queda pendiente en el mismo cambio (avisoPendiente): si /api/aviso-chat no llega, el control de
// cada hora lo manda (el socio por el camino de antes no: las reglas de antes no lo aceptan).
const cerrarChat = (tx, chat, estado, texto) => {
	const msj = doc(collection(chat.ref, 'mensajes'));
	tx.set(msj, { de: quienEscribe(), texto, createdAt: serverTimestamp() });
	tx.update(chat.ref, { estado, ...avisoPendienteDe(msj) });
};
const avisoPendienteDe = (msj) => (session.esSocio ? {} : { avisoPendiente: msj.id });

// La solicitud `l` (con l.reserva { codigo, llegada, salida, moneda }) queda confirmada: nace su reserva con la
// comisión (la ganancia, se paga el día de llegada) y su plazo de pago, la solicitud y el chat dicen «confirmada» y el
// cliente recibe los datos de pago del socio. `montos` = montosDeConfirmacion(...) (lo que se mostró en el diálogo:
// los congelados de la solicitud o, si el administrador lo eligió, los precios de hoy); `pago` = datos de pago (con chat).
// El socio, por el servidor (los montos los pone él, no el panel). Las repetidas de esta solicitud las cierra el cron de
// plazos (las del socio, el servidor al confirmar).
// Devuelve lo que quedó registrado: { ganancia, moneda }.
export const confirmarSolicitud = conCaminoDeAntes(async function confirmarSolicitud(l, montos, { chat = null, pago = '' } = {}) {
	if (session.esSocio) {
		const hecho = await porServidor('confirmar', l.id);
		if (hecho) { await markPending(`${l.propertyTitulo}: reserva ${l.reserva.codigo} confirmada`); return hecho; }
	}
	const r = l.reserva;
	const p = (await getDoc(doc(db, 'properties', l.propertyId))).data();
	// Lo mismo que revisa el servidor por el socio: llegada pasada, casa fuera del sitio o con otra moneda.
	const no = motivoParaNoConfirmar(l, p, montos?.moneda ? montos : null);
	if (no) throw Object.assign(new Error(no), { servidor: 409 });
	// Sin la dirección exacta no se confirma (lo mismo que revisa el servidor por el socio).
	if (faltaDireccion((await getDoc(doc(db, 'properties', l.propertyId, 'privado', 'llegada')).catch(() => null))?.data())) throw Object.assign(new Error(TEXTO_SIN_DIRECCION), { servidor: 409 });
	// Noches ya tomadas en Airbnb, Booking o VRBO (lo mismo que revisa el servidor por el socio).
	const enOtra = choqueExterno(r, (await ocupacionDe(l.propertyId))?.externas?.map((x) => ({ ...x, fuente: 'Airbnb, Booking o VRBO' })));
	if (enOtra) throw Object.assign(new Error(enOtra), { servidor: 409 });
	// Una reserva por solicitud: su id es el de la solicitud. Guarda su chat: con él se sabe si el cliente ya pagó.
	const id = l.id;
	const datos = reservaDeSolicitud(l, { id: l.propertyId, ...p }, montos, { chat: chat?.ref.id || '' });
	// El socio llega aquí solo sin el servidor (503), con las reglas de antes: no aceptan el plazo guardado ni el aviso
	// pendiente (el plazo sale de createdAt, como antes: plazoDePago).
	const deAntes = session.esSocio;
	if (deAntes) { delete datos.pagoDesde; delete datos.vencePago; }
	const escribirTodo = () => cambiar({
		despues: { id, ...datos },
		// Nadie la respondió mientras tanto (otra pestaña, el socio o el equipo).
		revisar: async (tx) => sinResponder(tx, l, chat),
		escribir: (tx, ref) => tx.set(ref, { ...datos, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
		ademas: (tx) => {
			tx.update(doc(db, 'leads', l.id), respuesta('confirmada', 'Confirmó', { 'solicitud.reservaId': id, 'solicitud.costoSocio': datos.costoSocio, 'solicitud.comision': datos.ganancia }));
			if (chat) {
				// Los datos de pago viajan con la confirmación: sin reserva registrada no hay a dónde pagar.
				const msj = doc(collection(chat.ref, 'mensajes'));
				tx.set(msj, { de: quienEscribe(), tipo: 'pago', texto: pago, createdAt: serverTimestamp() });
				tx.update(chat.ref, deAntes ? { estado: 'confirmada' } : { estado: 'confirmada', vencePago: datos.vencePago, avisoPendiente: msj.id });
			}
		}
	});
	try {
		await escribirTodo();
	} catch (err) {
		// Reglas de antes (todavía sin «chat» en la reserva del socio): se guarda sin él; esa reserva la cancela el administrador.
		if (!(deAntes && datos.chat && err?.code === 'permission-denied')) throw err;
		delete datos.chat;
		await escribirTodo();
	}
	if (chat) avisarChat(chat.ref.id);
	await markPending(`${p.titulo}: reserva ${r.codigo} confirmada`);
	return { ganancia: datos.ganancia, moneda: datos.moneda };
});

// Lee, dentro de la transacción, que la solicitud siga sin responder: el chat (lo lee cualquiera con el enlace) y, para
// el equipo, la solicitud misma (el socio no la lee).
async function sinResponder(tx, l, chat) {
	const [c, sol] = await Promise.all([chat ? tx.get(chat.ref) : null, session.esSocio ? null : tx.get(doc(db, 'leads', l.id))]);
	if (yaRespondida(c?.data()?.estado, sol?.data()?.solicitud?.estado)) throw new Error('Esta solicitud ya se respondió (otra persona u otra pestaña). Recarga la página.');
}

// La solicitud no se dio: la solicitud y el chat lo dicen, y el cliente recibe el mensaje. No hay reserva.
export const noSeDio = conCaminoDeAntes(async function noSeDio(l, motivo, chat = null) {
	if (session.esSocio && await porServidor('no', l.id, { motivo })) return;
	await runTransaction(db, async (tx) => {
		await sinResponder(tx, l, chat);
		tx.update(doc(db, 'leads', l.id), respuesta('no', 'No se dio', { 'solicitud.motivo': motivo }));
		if (chat) cerrarChat(tx, chat, 'no', textoNo(motivo));
	});
	if (chat) avisarChat(chat.ref.id);
	await alDiaEnLaWeb(l.propertyId);
});

// Cancela una reserva, venga de Rentas o de Solicitudes: sus fechas quedan libres y, si vino de la web, la
// solicitud y el chat dicen «cancelada» y el cliente recibe el mensaje. `chat`: el de Solicitudes (si no, se busca).
// El socio, por el servidor (la reserva de una solicitud lleva el id de la solicitud).
export const cancelarReserva = conCaminoDeAntes(async function cancelarReserva(r, motivo, { chat } = {}) {
	if (session.esSocio && await porServidor('cancelar', r.leadId, { motivo })) {
		await markPending(`${r.propertyTitulo}: reserva ${r.codigo || dia(r.llegada)} cancelada`);
		return true;
	}
	const delCliente = await chatDe(r, chat);
	const cierra = delCliente && !['cancelada', 'no'].includes(delCliente.estado);
	await cambiar({
		antes: r, despues: { ...r, estado: 'cancelada' },
		// Solo estado, motivo y fecha: lo único que el socio podía cambiar de su reserva con las reglas de antes.
		escribir: (tx, ref) => tx.set(ref, { estado: 'cancelada', motivo, updatedAt: serverTimestamp() }, { merge: true }),
		ademas: (tx) => {
			if (r.leadId) tx.update(doc(db, 'leads', r.leadId), respuesta('cancelada', 'Canceló', { 'solicitud.motivo': motivo }));
			if (cierra) cerrarChat(tx, delCliente, 'cancelada', TEXTO_CANCELADA);
		}
	});
	if (cierra) avisarChat(delCliente.ref.id);
	await markPending(`${r.propertyTitulo}: reserva ${r.codigo || dia(r.llegada)} cancelada`);
	// Si el cliente se enteró por su chat (una reserva sin chat, no).
	return Boolean(cierra);
});

// El cliente le pagó al socio: ve «Pago recibido» y los datos de llegada guardados en la casa.
// El socio, por el servidor (todo junto). El administrador (y el socio con el servidor sin configurar), en dos pasos y
// en este orden: las reglas solo dejan mandar la llegada cuando el pago YA está marcado (dentro de un mismo lote todavía
// ven el estado anterior y lo rechazan).
// Se puede repetir sin recargar si el segundo paso falló: el estado se vuelve a leer (no el que había al abrir) y,
// si ya dice «pagada», no se vuelve a escribir.
export const pagoRecibido = conCaminoDeAntes(async function pagoRecibido(chat, propertyId, leadId) {
	if (session.esSocio && await porServidor('pago', leadId)) { chat.estado = 'pagada'; return; }
	// Solo una reserva confirmada pasa a pagada (una que se canceló sola mientras la pantalla estaba abierta, no: se
	// mandaría la dirección de una reserva cancelada, con las fechas ya libres).
	const ahora = (await getDoc(chat.ref)).data()?.estado;
	if (!['confirmada', 'pagada'].includes(ahora)) throw new Error('Esta reserva ya no está confirmada (se canceló o no se dio). Recarga la página.');
	// Sin dirección guardada no se marca: el cliente no sabría a dónde llegar (lo mismo revisa el servidor).
	const ll = (await getDoc(doc(db, 'properties', propertyId, 'privado', 'llegada'))).data();
	if (faltaDireccion(ll)) throw Object.assign(new Error(TEXTO_SIN_DIRECCION), { servidor: 422 });
	if (ahora !== 'pagada') await runTransaction(db, async (tx) => {
		const s = await tx.get(chat.ref);
		if (s.data()?.estado !== 'confirmada') throw new Error('Esta reserva cambió mientras tanto. Recarga la página.');
		tx.update(chat.ref, { estado: 'pagada' });
	});
	chat.estado = 'pagada';
	// La dirección y el mapa viajan en el mensaje, copiados de lo privado de la casa (las reglas exigen que sean iguales).
	// Con su aviso pendiente en el mismo lote (el correo «pago recibido» se reintenta si no sale).
	const msj = doc(collection(chat.ref, 'mensajes'));
	const lote = writeBatch(db);
	lote.set(msj, { de: quienEscribe(), tipo: 'llegada', texto: 'llegada', ...(ll ? { direccion: ll.direccion || '', mapa: ll.mapa || '' } : {}), createdAt: serverTimestamp() });
	if (!session.esSocio) lote.update(chat.ref, avisoPendienteDe(msj));
	await lote.commit();
	// En la reserva (la de la web lleva el id de su solicitud): con el pago marcado, su comisión vencida cuenta para el
	// corte de permisos. Si las reglas no lo dejan (el socio por el camino de antes), el pago ya quedó.
	if (leadId) await updateDoc(refReserva(leadId), { pagoRecibido: true, updatedAt: serverTimestamp() }).catch((err) => console.warn('Pago recibido en la reserva', err));
	// En el historial de la solicitud (quién marcó el pago y cuándo); si no se puede (reglas de antes), el pago ya quedó.
	if (session.isAdmin && leadId) await updateDoc(doc(db, 'leads', leadId), { updatedAt: serverTimestamp(),
		'solicitud.historial': arrayUnion({ que: 'Pago recibido', quien: session.user.uid, nombre: session.profile?.nombre || '', cuando: new Date().toISOString() }) }).catch((err) => console.warn('Historial', err));
	avisarChat(chat.ref.id);
});

// «No me llegó» (solo el socio, por el servidor): antes de la llegada reabre el pago con un plazo nuevo; desde el día
// de llegada cierra la reserva sin comisión. Devuelve { reabierta }.
export async function noMeLlego(leadId) {
	const hecho = await porServidor('nollego', leadId);
	if (!hecho) throw Object.assign(new Error('El servidor de reservas no está disponible: avísale al administrador.'), { servidor: 503 });
	return hecho;
}

// El socio subió la foto de su transferencia de la comisión.
export const ponerComprobante = (res, url) => updateDoc(refReserva(res.id), { 'comision.comprobante': url, updatedAt: serverTimestamp() });

// El socio le pagó la comisión a EQ (solo el administrador lo marca). Si sus casas estaban fuera del sitio, vuelven al publicar.
export async function comisionPagada(res, nivel) {
	await updateDoc(refReserva(res.id), { 'comision.pagada': true, 'comision.pagadaEl': new Date().toISOString(), updatedAt: serverTimestamp() });
	if (nivel === 3) await markPending(`${res.propertyTitulo}: comisión pagada, las casas del socio vuelven al sitio`);
	// Si se le apagaron los permisos por el atraso, vuelven ahora (sin esperar la revisión de cada hora).
	if (session.isAdmin && res.propietarioId) {
		try { const { recalcularPermisosDe } = await import('./permisos-panel.js'); await recalcularPermisosDe(res.propietarioId); } catch (err) { console.warn('Permisos del socio sin recalcular (se recalculan en la próxima hora)', err); }
	}
}

// «Cobrar comisión» (el administrador, desde la alerta de cada mañana: confirmada, llegada pasada, sin «Pago recibido»):
// el equipo supo que el cliente sí pagó. Desde ahí su comisión vencida cuenta para el corte de permisos (cuentaParaCorte).
export async function cobrarComision(res) {
	await updateDoc(refReserva(res.id), { 'comision.cobrar': true, updatedAt: serverTimestamp() });
	if (res.propietarioId) {
		try { const { recalcularPermisosDe } = await import('./permisos-panel.js'); await recalcularPermisosDe(res.propietarioId); } catch (err) { console.warn('Permisos del socio sin recalcular (se recalculan en la próxima hora)', err); }
	}
}

// EQ le pagó al propietario lo suyo de estas reservas.
export const pagadoAlPropietario = (lista) => Promise.all(lista.map((r) => updateDoc(refReserva(r.id), { pagadoSocio: true, pagadoFecha: V.hoy(), updatedAt: serverTimestamp() })));
