// Lo que comparten Solicitudes (admin/js/views/solicitudes.js) y Mensajes (admin/js/views/mensajes.js): leer las
// solicitudes con su chat, lo que se calcula de cada una (estado, reserva, plazos, si se puede confirmar o cancelar) y
// las acciones que la responden (Confirmar, No se dio, Pago recibido, No me llegó, Cancelar) con sus confirmaciones.
// Una sola pieza: las dos pantallas llaman a estas mismas funciones (las que escriben pasan por admin/js/reservas.js).
// El socio no lee las solicitudes (traen el teléfono y el correo del cliente): las suyas salen de su chat.
import '/js/calc-vacacional.js';
import { db, doc, getDoc, getDocs, setDoc, collection, query, where, orderBy, limit } from './firebase.js';
import { toast, showError, confirmDialog, formatDate, elegirOpcion, ahoraServidor, ahoraYa } from './ui.js';
import { session, cargarMiResumen, misCasas, contactoDelEquipo } from './session.js';
import { confirmarSolicitud, cancelarReserva, noSeDio as noSeDioReserva, pagoRecibido as marcarPagoRecibido, noMeLlego as marcarNoMeLlego, ChoqueDeFechas } from './reservas.js';
import { cuentaDe, subtotalCotizado, montosCotizados, cambioElPrecio, montosDeConfirmacion, difierenMontos, motivoParaNoCancelar, motivoParaNoMeLlego, noLlegoReabre, llegadaPasada,
	motivoParaNoConfirmar, conDatosDelChat, motivoSocioNoConfirma, bajoElPlan, conPisoDeEq, seCruzan, MOTIVOS_CANCELAR, MOTIVOS_NO, conPlazo, venceRespuesta, plazoDePago, TEXTO_PRECIO_CAMBIO, SIN_GANANCIA_NEGATIVA } from './reservas-calculo.js';
import { fechasReserva } from './formato.js';
import { money, ms, loadPropietarios, loadPropiedades, loadReservas } from './crm.js';
import { avisarAvisos } from './avisos.js';

const V = window.EQVacacional;
export const ESTADOS = { pendiente: ['Sin responder', 'warning'], confirmada: ['Confirmada', 'success'], no: ['No se dio', 'secondary'], cancelada: ['Cancelada', 'danger'] };
export const estado = (l) => l.solicitud?.estado || 'pendiente';
export const fechas = fechasReserva;

// Respuestas de un toque según el momento de la reserva: llenan el campo y se pueden ajustar antes de enviar. Sin datos
// de la casa que cambian de una a otra, sin contacto y sin lo que se hace con un botón: disponibilidad, datos de pago y
// dirección salen solos al tocar «Confirmar» y «Pago recibido» (con un mensaje la reserva no cambia).
export const RAPIDAS = {
	siempre: ['¡Hola! Gracias por escribir. Lo reviso y te respondo en unos minutos.', 'Con gusto. ¿Algo más en lo que te pueda ayudar?'],
	pendiente: ['¿Viajan con mascotas?', '¿A qué hora piensan llegar?', '¿Cuántas personas vienen en total?', '¿Vienen niños pequeños? Así tenemos todo listo.',
		'¿Es para una ocasión especial? Cuéntame y lo preparamos.'],
	confirmada: ['Recibí tu comprobante: lo reviso y te confirmo.', 'Aún no veo el pago. ¿Me compartes la foto del comprobante aquí?',
		'Tus datos de pago ya están en tu reserva. Cuando pagues, sube aquí la foto del comprobante.', '¿A qué hora piensan llegar?'],
	pagada: ['¿Necesitas ayuda para llegar?', '¡Buen viaje!', 'La dirección y cómo llegar ya están en tu reserva. ¡Buen viaje!', '¿Cómo va todo en la casa? ¿Necesitas algo?',
		'¡Gracias por tu visita! Esperamos verte pronto.']
};
// El momento de la reserva para las respuestas rápidas (pagada, confirmada o pendiente).
export const momentoDe = (l, chat) => (chat?.estado === 'pagada' ? 'pagada' : estado(l) === 'confirmada' ? 'confirmada' : 'pendiente');
export const rapidasDe = (l, chat) => [...RAPIDAS[momentoDe(l, chat)], ...RAPIDAS.siempre];

// Lee todo lo de las solicitudes que ve quien está en el panel y devuelve sus datos y sus acciones.
// `mensajes`: 'todos' (Solicitudes: de cada chat, quién escribió al final y si ya tiene los datos de llegada) o
// 'ultimo' (Mensajes: solo el último de cada chat, cada uno por su lado). `recargar`: lo que se hace después de una acción.
export async function cargarSolicitudes({ mensajes = 'todos', recargar = async () => {} } = {}) {
	const admin = !session.esSocio;
	// La hora del servidor para lo que depende del día (llegada pasada): el reloj del dispositivo puede ir adelantado.
	await ahoraServidor();
	// El socio habla con el equipo por WhatsApp: su asesor o, si no tiene, la empresa.
	const equipo = admin ? null : await contactoDelEquipo();
	const mio = session.profile?.propietarioId || '-';
	const [snap, chatsSnap, propietarios, casas, reservas, mias, congeladosSnap, revisionesSnap] = await Promise.all([
		// El socio no lee las solicitudes (traen el teléfono y el correo del cliente): las suyas salen del chat.
		admin ? getDocs(query(collection(db, 'leads'), where('reserva.codigo', '>', ''))) : { docs: [] },
		// Chat de cada solicitud (por código): el cliente escribe desde su enlace; aquí responden el socio y el equipo.
		getDocs(admin ? collection(db, 'chats') : query(collection(db, 'chats'), where('propietarioId', '==', mio))),
		admin ? loadPropietarios() : [], admin ? loadPropiedades() : [],
		admin ? loadReservas() : getDocs(query(collection(db, 'reservas'), where('propietarioId', '==', mio))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
		// Sus casas por noche de hoy: un chat que terminó con una casa que ya no es suya (cambió de dueño, se borró o pasó a
		// venta) se queda con su nombre y se ve (y su comprobante a EQ se sube), pero las reglas ya no le dejan leerlo ni
		// responderlo: sin chat ni botones de respuesta.
		admin ? null : misCasas().then((l) => l.filter((c) => c.operacion === 'vacacional')),
		// Los montos de cada solicitud, congelados por el servidor al llegar (montosSolicitud): la tarjeta, el diálogo y la
		// reserva salen de ellos. Si todavía no están (o no se pueden leer), se calculan igual con la casa de hoy.
		getDocs(admin ? collection(db, 'montosSolicitud') : query(collection(db, 'montosSolicitud'), where('propietarioId', '==', mio))).catch((err) => { console.warn('Montos de las solicitudes', err); return { docs: [] }; }),
		// Lo que la IA leyó del comprobante del cliente y si cuadra con la reserva (netlify/lib/comprobantes.mjs).
		getDocs(admin ? collection(db, 'revisionesComprobante') : query(collection(db, 'revisionesComprobante'), where('propietarioId', '==', mio))).catch(() => ({ docs: [] }))]);
	const misIds = new Set((mias || []).map((c) => c.id));
	const deHoy = (propertyId) => admin || misIds.has(propertyId);
	const congelados = Object.fromEntries(congeladosSnap.docs.map((d) => [d.id, d.data()]));
	const revisiones = Object.fromEntries(revisionesSnap.docs.map((d) => [d.id, d.data()]));
	const casaDe = (id) => (admin ? casas : mias).find((p) => p.id === id);
	// Chats de antes de su índice: el administrador se lo pone al abrir esta pantalla (con las reglas de antes no se puede: se salta).
	const variosChats = admin ? await ponerIndices(snap.docs, chatsSnap.docs).catch((err) => { console.warn('Índice de chats', err); return []; }) : [];
	const chats = Object.fromEntries(chatsSnap.docs.filter((d) => deHoy(d.data().propertyId)).map((d) => [d.data().codigo, d.id]));
	const datosChat = Object.fromEntries(chatsSnap.docs.map((d) => [d.data().codigo, { ...d.data(), id: d.id }]));
	const refChat = (l) => chats[l.reserva.codigo] && doc(db, 'chats', chats[l.reserva.codigo]);
	// El chat de la solicitud con el estado que ve el cliente (lo que reservas.js necesita para escribir en él).
	const chatDe = (l) => (refChat(l) ? { ref: refChat(l), estado: datosChat[l.reserva.codigo]?.estado || '', idioma: datosChat[l.reserva.codigo]?.idioma || l.idioma || 'es' } : null);
	// Chats donde lo último lo escribió el cliente: falta responderle.
	const porResponder = new Set();
	// Chats que ya mandaron los datos de llegada (si el segundo paso de «Pago recibido» falló, el botón sigue ahí).
	const conLlegada = new Set();
	// El último mensaje de cada chat (Mensajes: la lista).
	const ultimos = {};
	// Cada chat por su lado: uno que no se pudo leer no deja sin pantalla a los demás.
	await Promise.all(Object.entries(chats).map(async ([cod, id]) => {
		try {
			const ref = collection(db, 'chats', id, 'mensajes');
			const todos = (await getDocs(mensajes === 'todos' ? query(ref, orderBy('createdAt')) : query(ref, orderBy('createdAt', 'desc'), limit(1)))).docs.map((d) => ({ id: d.id, ...d.data() }));
			const ultimo = todos.at(-1);
			ultimos[cod] = ultimo || null;
			if (ultimo?.de === 'cliente') porResponder.add(cod);
			// Con solo el último (Mensajes), «pagada» ya dice que salieron los datos de llegada; el hilo lo corrige al abrirse.
			if (mensajes === 'todos' ? todos.some((m) => m.tipo === 'llegada') : datosChat[cod]?.estado === 'pagada') conLlegada.add(cod);
		} catch (err) { console.warn(`No se pudieron leer los mensajes de ${cod}`, err); }
	}));
	const reservaDe = (l) => reservas.find((x) => x.id === l.solicitud?.reservaId || (x.codigo && x.codigo === l.reserva.codigo && x.estado !== 'cancelada'));
	// El socio cancela mientras el cliente no ha pagado (reserva y chat «confirmada») y antes del día de llegada.
	// Una reserva de antes, sin su chat guardado, muestra el botón pero la cancela el administrador (cancelar lo dice).
	// Lo mismo que revisa el servidor (motivoParaNoCancelar y motivoParaNoMeLlego en reservas-calculo.js).
	const puedeCancelar = (l) => deHoy(l.propertyId) && !motivoParaNoCancelar(reservaDe(l), datosChat[l.reserva.codigo], chats[l.reserva.codigo]);
	const puedeNoMeLlego = (l) => deHoy(l.propertyId) && !motivoParaNoMeLlego(reservaDe(l), datosChat[l.reserva.codigo], chats[l.reserva.codigo]);
	// La ganancia de EQ por cobrar (el filtro «cobrar», también por la dirección #/solicitudes/cobrar: el botón del aviso y
	// el correo del mes). Al socio, solo lo que ya debe: lo que cuenta como cobrado (V.cobrable, lo mismo que la pausa y el
	// corte); al equipo, toda la que falta pagar.
	const ahoraMora = Date.now();
	const conChat = (x) => conDatosDelChat(x, datosChat[x.codigo]);
	const debe = (x) => x?.estado === 'confirmada' && x.comision?.monto > 0 && !x.comision.pagada && (admin || V.cobrable(conChat(x), ahoraMora));
	const moraDe = (x) => (x ? V.nivelMora(conChat(x), ahoraMora) : 0);
	const porCobrar = (l) => estado(l) === 'confirmada' && debe(reservaDe(l));
	// Cotizada por debajo del precio de la casa (montos congelados por el servidor): la confirma el administrador, va arriba.
	const teToca = (l) => admin && estado(l) === 'pendiente' && bajoElPlan(congelados[l.id]) && !llegadaPasada(l.reserva.llegada, ahoraYa());
	const alerta = (l) => V.alertaSolicitud(estado(l), ms(l.createdAt), l.reserva, reservaDe(l), casaDe(l.propertyId)?.vacacional?.bloqueos, Date.now());
	// Una solicitud sin responder cuyas fechas ya tienen otra reserva confirmada: no se ofrece «Confirmar» (el servidor la
	// rechazaría igual, V.choquesReserva); se dice por qué y queda «No se dio» de un toque. Un bloqueo no cuenta: el socio
	// puede bloquear esos días para guardárselos a este cliente y confirmar después. Con las casas y reservas de quien
	// mira (el socio, las suyas: misCasas y sus reservas).
	const yaOcupada = (l) => (casaDe(l.propertyId)?.vacacional?.reservadas || []).some((b) => seCruzan(l.reserva, { llegada: b?.desde, salida: b?.hasta }))
		|| reservas.some((x) => x.propertyId === l.propertyId && x.estado === 'confirmada' && x.id !== l.id && x.codigo !== l.reserva.codigo && seCruzan(l.reserva, x));
	// Solicitud del socio armada desde su chat: mismo formato que la del administrador, sin datos de contacto.
	const delChat = (d) => { const c = d.data(); return {
		id: c.leadId, nombre: c.nombre, propertyId: c.propertyId, propertyTitulo: c.propertyTitulo, propietarioId: c.propietarioId, createdAt: c.createdAt,
		// El subtotal cotizado viaja en el chat; uno de antes no lo trae y se saca del total que vio el cliente.
		reserva: { codigo: c.codigo, llegada: c.llegada, salida: c.salida, noches: c.noches, huespedes: c.huespedes, total: c.total, moneda: c.moneda,
			subtotal: subtotalCotizado(c) },
		solicitud: c.estado ? { estado: c.estado === 'pagada' ? 'confirmada' : c.estado } : undefined }; };
	const leads = (admin ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : chatsSnap.docs.map(delChat)).filter((l) => l.reserva?.llegada);

	// Posible repetida: el mismo cliente (correo o teléfono; el socio, que no los ve, por el nombre completo) con otra
	// solicitud abierta de la misma casa en una semana. Se marca para no atenderla dos veces.
	const nombreCompleto = (l) => String(l.nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
	const clienteDe = (l) => String(l.email || '').trim().toLowerCase() || String(l.telefono || '').replace(/\D/g, '').slice(-8)
		|| (nombreCompleto(l).includes(' ') ? `n:${nombreCompleto(l)}` : '');
	// Fechas que se cruzan o están a 3 días o menos (dos fines de semana distintos no son la misma).
	const cerca = (a, b) => V.sumarDias(a.llegada, -3) <= b.salida && V.sumarDias(b.llegada, -3) <= a.salida;
	const abierta = (l) => ['pendiente', 'confirmada'].includes(estado(l));
	const repetidaDe = (l) => {
		if (estado(l) !== 'pendiente') return null;
		const k = clienteDe(l);
		if (k.length < 4) return null;
		// La anterior (la más nueva es la repetida; con la misma hora, por código).
		const antes = (o) => ms(o.createdAt) < ms(l.createdAt) || (ms(o.createdAt) === ms(l.createdAt) && o.reserva.codigo < l.reserva.codigo);
		return leads.find((o) => o !== l && o.propertyId === l.propertyId && abierta(o) && clienteDe(o) === k && antes(o)
			&& ms(l.createdAt) - ms(o.createdAt) < 7 * 86400000 && cerca(o.reserva, l.reserva))?.reserva?.codigo || null;
	};
	// Otra solicitud sin responder de la misma casa con alguna de estas noches (no la repetida del mismo cliente: esa
	// tiene su aviso). Devuelve su código.
	const seCruzaCon = (l) => leads.find((o) => o !== l && o.propertyId === l.propertyId && estado(o) === 'pendiente' && seCruzan(o.reserva, l.reserva)
		&& repetidaDe(l) !== o.reserva.codigo && repetidaDe(o) !== l.reserva.codigo)?.reserva?.codigo || '';

	// Precio neto del socio de cada casa: con eso se saca su parte y la comisión.
	const netos = Object.fromEntries(await Promise.all([...new Set(leads.map((l) => l.propertyId).filter(Boolean))].map(async (id) =>
		[id, (await getDoc(doc(db, 'properties', id, 'privado', 'socio')).catch(() => null))?.data() || null])));
	// Con los precios de hoy (para decir si el precio cambió) y los de la solicitud (congelados al llegar).
	const cuenta = (l) => cuentaDe(l.reserva, netos[l.propertyId]);
	// Con el piso de EQ (conPisoDeEq): lo que muestra la tarjeta es lo que se registra al confirmar.
	const montosDe = (l) => { const m = congelados[l.id] || montosCotizados(l.reserva, casaDe(l.propertyId), netos[l.propertyId]); return m && conPisoDeEq(m); };
	// Lo que se muestra de la plata de una solicitud: lo guardado en su reserva o en la solicitud, o la cuenta de hoy si
	// sale en la moneda que vio el cliente. { costoSocio, ganancia } o null.
	const plataDe = (l) => {
		const est = estado(l), sol = l.solicitud || {};
		const res = est === 'confirmada' ? reservaDe(l) : null;
		const cHoy = res || sol.comision != null ? null : montosDe(l);
		return res ? { costoSocio: res.costoSocio, ganancia: res.comision?.monto ?? res.ganancia }
			: sol.comision != null ? { costoSocio: sol.costoSocio, ganancia: sol.comision } : cHoy && (cHoy.moneda || 'USD') === (l.reserva.moneda || 'USD') ? cHoy : null;
	};
	// Con la llegada ya pasada no se confirma (el servidor la rechazaría igual): queda «No se dio».
	const pasada = (l) => estado(l) === 'pendiente' && llegadaPasada(l.reserva.llegada, ahoraYa());
	// La casa salió del sitio o cambió de moneda: el servidor no la confirmaría (motivoParaNoConfirmar); se dice por qué.
	// Lo cotizado quedó por debajo del precio de la casa: el socio no la confirma (motivoSocioNoConfirma; el servidor igual).
	const sinConfirmar = (l) => (estado(l) === 'pendiente' && !pasada(l) && casaDe(l.propertyId) ? motivoParaNoConfirmar(l, casaDe(l.propertyId), congelados[l.id] || null, ahoraYa())
		|| (!admin && motivoSocioNoConfirma(montosDe(l))) : '');
	// ¿Se ofrece «Confirmar»? (con «No se dio» al lado) y ¿«Pago recibido»?
	const ocupada = (l) => estado(l) === 'pendiente' && yaOcupada(l);
	const puedeConfirmar = (l) => estado(l) === 'pendiente' && deHoy(l.propertyId) && !ocupada(l) && !pasada(l) && !sinConfirmar(l);
	const puedeNoSeDio = (l) => estado(l) === 'pendiente' && deHoy(l.propertyId);
	const puedePagoRecibido = (l) => estado(l) === 'confirmada' && Boolean(chats[l.reserva.codigo]) && !(datosChat[l.reserva.codigo]?.estado === 'pagada' && conLlegada.has(l.reserva.codigo));
	// Lo que vence solo (netlify/functions/plazos-reservas.mjs): { vence, texto } o { sinPlazo: true } (confirmada a
	// última hora: no se cancela sola) o null.
	const plazoDe = (l) => {
		const est = estado(l), ch = datosChat[l.reserva.codigo];
		const res = est === 'confirmada' ? reservaDe(l) : null;
		if (est === 'pendiente' && conPlazo(ms(l.createdAt)) && ch && !ch.estado) return { vence: venceRespuesta(ms(l.createdAt)), texto: 'si no se responde, se cierra sola' };
		if (est === 'confirmada' && res && conPlazo(ms(res.createdAt)) && ch?.estado === 'confirmada' && !ch.comprobanteCliente) {
			const vence = plazoDePago(res, ms(res.createdAt)).vence;
			return Number.isFinite(vence) ? { vence, texto: 'si el cliente no paga, se cancela sola y las fechas quedan libres' } : { sinPlazo: true };
		}
		return null;
	};

	// Lo que el servidor ya tenía hecho (otra pestaña, o un intento cuya respuesta se perdió): se recarga, sin error.
	const hacer = async (tarea) => {
		try { await tarea(); avisarAvisos(); await recargar(); } catch (err) {
			if (err?.yaRespondida) return recargar();
			if (err?.servidor) return toast(err.message, 'warning');
			showError(err);
		}
	};

	async function confirmar(l) {
		const r = l.reserva;
		// El precio del dueño y el margen (lo pone el equipo) pudieron cambiar con la pantalla abierta: se vuelven a leer
		// (solo para decir si el precio cambió: se registra lo cotizado, congelado al llegar la solicitud).
		const vigente = (await getDoc(doc(db, 'properties', l.propertyId, 'privado', 'socio')).catch(() => null))?.data();
		if (vigente) netos[l.propertyId] = vigente;
		const casa = (await getDoc(doc(db, 'properties', l.propertyId))).data();
		const congelado = admin ? (await getDoc(doc(db, 'montosSolicitud', l.id)).catch(() => null))?.data() : congelados[l.id];
		const montos = congelado || montosCotizados(l.reserva, casa, netos[l.propertyId]);
		if (!montos) return toast('A esta casa le falta el precio del socio.', 'warning');
		// Los datos de pago: el equipo los toma de la ficha; el dueño, de su resumen (cargarMiResumen).
		const pago = !refChat(l) ? '' : admin ? (await getDoc(doc(db, 'propietarios', l.propietarioId || '-'))).data()?.datosPago : (await cargarMiResumen())?.datosPago;
		if (refChat(l) && !pago) return toast(admin ? 'Falta escribir los datos de pago del socio (Propietarios → su ficha).' : 'No encontramos tus datos de pago y sin ellos el cliente no sabe a dónde pagar. Pídele al administrador que los guarde en tu ficha.', 'warning');
		// Los montos se guardan en la moneda de la casa: se muestran en ella.
		const mon = casa?.moneda || 'USD';
		const hoyC = cuenta(l);
		let modo = 'cotizado';
		const base = montosDeConfirmacion(montos, hoyC);
		let nota = '';
		if (admin && hoyC && difierenMontos(base)) {
			// El administrador decide con qué se registra (nunca con una ganancia de EQ negativa).
			const cot = `Registrar lo cotizado (ganancia de EQ ${money(base.gananciaCotizada, mon)})`;
			const deHoyT = `Registrar con los precios de hoy (ganancia de EQ ${money(base.hoy, mon)})`;
			const opciones = [[cot, base.gananciaCotizada], [deHoyT, base.hoy]].filter(([, g]) => g >= 0).map(([t]) => t);
			if (opciones.length < 2) nota = ` ${SIN_GANANCIA_NEGATIVA}`;
			const elegida = opciones.length === 2
				? await elegirOpcion(`${r.codigo}: ${TEXTO_PRECIO_CAMBIO}. Se cotizaron ${money(base.cotizado, mon)} de alojamiento; con los precios de hoy serían ${money(base.deHoy, mon)}. ¿Con cuál se registra?`, opciones)
				: opciones[0];
			if (!elegida) return;
			modo = elegida === deHoyT ? 'hoy' : 'cotizado';
		}
		const m = montosDeConfirmacion(montos, hoyC, modo);
		const distinto = !admin && cambioElPrecio(montos, hoyC) ? ` ${TEXTO_PRECIO_CAMBIO}: se registra lo que se le cotizó.` : '';
		// Cotizado por debajo del precio de la casa: EQ conserva su margen completo y el socio recibe el resto (se dice).
		if (admin && modo === 'cotizado' && bajoElPlan(montos)) nota += ' Se le cotizó menos que el precio de la casa: EQ conserva su margen completo y el socio recibe el resto.';
		if (!(await confirmDialog(`${r.codigo}: las fechas ${fechas(r)} quedan ocupadas en la web. ${admin ? 'Socio' : 'Tu parte'} ${money(m.costoSocio, mon)} · ganancia de EQ ${money(m.ganancia, mon)}, que se paga el día de llegada.${distinto}${nota}`, { okText: 'Confirmar reserva', danger: false }))) return;
		await hacer(async () => {
			try {
				const confirmarYa = (revisado) => confirmarSolicitud(l, { ...m, moneda: montos.moneda }, { chat: chatDe(l), pago, revisado });
				let hecho;
				try { hecho = await confirmarYa(false); } catch (err) {
					// Un calendario de Airbnb, Booking o VRBO no se pudo leer: se confirma solo si quien confirma lo revisó allá.
					if (!err?.faltaRevisar) throw err;
					if (!(await confirmDialog(`${err.message} ¿Ya lo revisaste y están libres?`, { okText: `Revisé ${err.faltaRevisar.join(' y ')}`, danger: false }))) return;
					hecho = await confirmarYa(true);
				}
				// Un calendario que no respondió a tiempo se revisó con su última lectura: se dice de cuándo.
				const hace = (x) => (x < 60 ? `${x} min` : `${Math.round(x / 60)} h`);
				const viejos = (hecho?.calendarios || []).map((c) => `${c.nombre} no respondió: revisé con lo de hace ${hace(Number(c.minutos) || 1)}.`);
				toast(['Reserva confirmada.', ...viejos].join(' '));
			} catch (err) {
				if (err instanceof ChoqueDeFechas || (err?.servidor && !err.yaRespondida)) toast(err.message, 'warning');
				else throw err;
			}
		});
	}

	// Dinero recibido: el cliente ve «Pago recibido» y los datos de llegada guardados en la casa.
	async function pagoRecibido(l) {
		if (!(await confirmDialog(`${l.reserva.codigo}: ¿ya recibiste el pago? El cliente verá la dirección, el mapa y cómo llegar.`, { okText: 'Pago recibido' }))) return;
		await hacer(async () => {
			await marcarPagoRecibido(chatDe(l), l.propertyId, l.id);
			toast('Listo: el cliente ya ve los datos de llegada.');
		});
	}

	// «No me llegó»: el socio no recibió el pago (antes de la llegada se reabre con un plazo nuevo; desde el día de
	// llegada se cierra sin comisión). Lo hace el servidor.
	async function noMeLlego(l) {
		const reabre = noLlegoReabre(reservaDe(l));
		const texto = reabre ? `${l.reserva.codigo}: ¿no te llegó el pago? Se le pide al cliente que lo revise y vuelva a mandar su comprobante, con un plazo nuevo; si no paga, se cancela sola.`
			: `${l.reserva.codigo}: ¿no te llegó el pago? La reserva se cancela sin ganancia de EQ, las fechas quedan libres y el equipo recibe el aviso.`;
		if (!(await confirmDialog(texto, { okText: 'No me llegó', danger: !reabre }))) return;
		await hacer(async () => {
			try {
				const hecho = await marcarNoMeLlego(l.id);
				toast(hecho.reabierta ? 'Listo: el cliente tiene un plazo nuevo para pagar.' : 'Reserva cancelada sin ganancia de EQ.');
			} catch (err) { if (err?.servidor && !err.yaRespondida) toast(err.message, 'warning'); else throw err; }
		});
	}

	// Con las fechas ya ocupadas el motivo se sabe: un toque.
	async function noSeDio(l, motivoYa = '') {
		const motivo = motivoYa || await elegirOpcion(`¿Por qué no se dio ${l.reserva.codigo}?`, MOTIVOS_NO);
		if (motivo) await hacer(() => noSeDioReserva(l, motivo, chatDe(l)));
	}

	async function cancelar(l) {
		const r = l.reserva;
		// La reserva se busca por la solicitud o por su código: el socio no lee la solicitud, solo su chat.
		const reserva = reservaDe(l);
		if (!reserva) return toast('No encontramos la reserva de esta solicitud. Avísale al administrador.', 'danger');
		const motivo = await elegirOpcion(`¿Por qué se cancela ${r.codigo}?`, MOTIVOS_CANCELAR);
		if (!motivo) return;
		await hacer(async () => {
			try {
				await cancelarReserva({ ...reserva, leadId: reserva.leadId || l.id }, motivo, { chat: chatDe(l) });
				toast('Reserva cancelada. Las fechas quedaron libres.');
			} catch (err) {
				// El servidor (o las reglas) no dejan al dueño cancelar una reserva de antes (sin su chat guardado) ni una ya pagada o empezada.
				if (err?.servidor && !err.yaRespondida) toast(err.message, 'warning');
				else if (!admin && err?.code === 'permission-denied') toast('Esta reserva ya no la puedes cancelar tú (es de antes, ya se pagó o ya empezó): avísale al administrador.', 'warning');
				else throw err;
			}
		});
	}

	return {
		admin, equipo, leads, chats, datosChat, refChat, chatDe, porResponder, conLlegada, ultimos, congelados, revisiones, casaDe, deHoy, reservas, propietarios, netos,
		variosChats, reservaDe, puedeCancelar, puedeNoMeLlego, debe, moraDe, porCobrar, teToca, alerta, ocupada, yaOcupada, repetidaDe, seCruzaCon, cuenta, montosDe, plataDe,
		pasada, sinConfirmar, puedeConfirmar, puedeNoSeDio, puedePagoRecibido, plazoDe, hacer,
		confirmar, pagoRecibido, noMeLlego, noSeDio, cancelar,
		textoPlazo: (p) => (p?.sinPlazo ? 'Sin plazo automático (se confirmó a última hora): si no te paga, toca «No me llegó».' : p ? `Vence ${formatDate(new Date(p.vence))}: ${p.texto}.` : '')
	};
}

// Un chat por solicitud (chatsPorSolicitud/{solicitud} → su token): los chats de antes de este cambio no lo tienen y el
// administrador se lo pone, apuntando al chat cuya solicitud es esa. Si una solicitud tiene más de un chat no se adivina:
// devuelve sus códigos para el aviso.
async function ponerIndices(leads, chats) {
	const con = new Set((await getDocs(collection(db, 'chatsPorSolicitud'))).docs.map((d) => d.id));
	const porSolicitud = {};
	for (const c of chats) if (c.data().leadId) (porSolicitud[c.data().leadId] ||= []).push(c);
	const varios = [];
	for (const l of leads) {
		const lista = porSolicitud[l.id] || [];
		if (!lista.length || con.has(l.id)) continue;
		if (lista.length > 1) { varios.push(l.data().reserva?.codigo || l.id); continue; }
		await setDoc(doc(db, 'chatsPorSolicitud', l.id), { token: lista[0].id });
	}
	return varios;
}
