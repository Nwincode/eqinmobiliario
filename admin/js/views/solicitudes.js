// Solicitudes de reserva que llegan de la web. El socio ve las de sus casas y las responde;
// el administrador ve todas, con lo que falta responder y la comisión por cobrar.
// Comisión: el socio la paga a EQ el día de llegada y sube su comprobante; solo el administrador la marca pagada.
// Nada se borra: cada respuesta queda en el historial con quién y cuándo.
// Confirmar, cancelar, «No se dio», pago recibido y comisión pagada pasan por admin/js/reservas.js (lo mismo que usa
// Rentas vacacionales): allí se escriben la reserva, sus fechas en la casa, la solicitud y el chat; lo del socio, por el
// servidor (/api/reservas). Los montos salen de admin/js/reservas-calculo.js, lo mismo que usa el servidor.
import '/js/calc-vacacional.js';
import { db, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, collection, query, where, orderBy, serverTimestamp } from '../firebase.js';
import { h, statCard, mount, pageHeader, emptyState, toast, showError, errorMessage, modal, confirmDialog, badge, iconoBtn, formatDate, hoy, dia, elegirOpcion, ahoraServidor, ahoraYa } from '../ui.js';
import { session, cargarMiResumen, misCasas, contactoDelEquipo } from '../session.js';
import { confirmarSolicitud, cancelarReserva, noSeDio as noSeDioReserva, pagoRecibido as marcarPagoRecibido, noMeLlego as marcarNoMeLlego, comisionPagada, cobrarComision, ponerComprobante, avisarChat, estadoServidor, ChoqueDeFechas } from '../reservas.js';
import { cuentaDe, subtotalCotizado, montosCotizados, cambioElPrecio, montosDeConfirmacion, difierenMontos, motivoParaNoCancelar, motivoParaNoMeLlego, noLlegoReabre, llegadaPasada,
	motivoParaNoConfirmar, comprobanteVigente, conDatosDelChat, motivoSocioNoConfirma, bajoElPlan, TEXTO_CONFIRMA_EQUIPO, conPisoDeEq, seCruzan, MOTIVOS_CANCELAR, MOTIVOS_NO, conPlazo, venceRespuesta, plazoDePago, TEXTO_PRECIO_CAMBIO, SIN_GANANCIA_NEGATIVA, ultimoDelHistorial, diaQueConfirmo } from '../reservas-calculo.js';
import { traducirTexto } from '../ia.js';
import { DIAS_CORTE } from '../permisos-socio.js';
import { whatsappUrl, nNoches, sumarPorMoneda, dineroPorMoneda, correoValido } from '../formato.js';
import { uploadImage, renderForm } from '../form.js';
import { PARECE } from '../mi-casa.js';
import { money, ms, loadPropietarios, loadPropiedades, loadReservas, corregirCorreo, limpiarCorreo } from '../crm.js';
import { hace } from '../avisos-reglas.js';
import { avisarAvisos } from '../avisos.js';

const V = window.EQVacacional;
// Comprobantes del pago a EQ subiendo ahora (por reserva) y cuánto se espera cada uno. `vista`: la pantalla de
// Solicitudes abierta ahora (si se salió y se volvió mientras subía, al terminar se pone al día esa, no la de antes).
const SUBIENDO = new Set();
const LIMITE_SUBIDA = 90_000;
const vista = { pintar: () => {}, recargar: () => {} };
const ESTADOS = { pendiente: ['Sin responder', 'warning'], confirmada: ['Confirmada', 'success'], no: ['No se dio', 'secondary'], cancelada: ['Cancelada', 'danger'] };
// Atraso de la comisión, según V.nivelComision().
const ATRASO = [['Al día', 'secondary'], ['Vencida', 'warning'], ['+24 h', 'danger'], ['+72 h · fuera del sitio', 'danger']];

const estado = (l) => l.solicitud?.estado || 'pendiente';
const fechas = (r) => `${dia(r.llegada)} – ${dia(r.salida)}`;
const alertaDe = (l, reserva, casa) => V.alertaSolicitud(estado(l), ms(l.createdAt), l.reserva, reserva, casa?.vacacional?.bloqueos, Date.now());

export async function render(container, [codigo] = []) {
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
	const datosChat = Object.fromEntries(chatsSnap.docs.map((d) => [d.data().codigo, d.data()]));
	const refChat = (l) => chats[l.reserva.codigo] && doc(db, 'chats', chats[l.reserva.codigo]);
	// El chat de la solicitud con el estado que ve el cliente (lo que reservas.js necesita para escribir en él).
	const chatDe = (l) => (refChat(l) ? { ref: refChat(l), estado: datosChat[l.reserva.codigo]?.estado || '', idioma: datosChat[l.reserva.codigo]?.idioma || l.idioma || 'es' } : null);
	// Chats donde lo último lo escribió el cliente: falta responderle.
	const porResponder = new Set();
	// Chats que ya mandaron los datos de llegada (si el segundo paso de «Pago recibido» falló, el botón sigue ahí).
	const conLlegada = new Set();
	// Cada chat por su lado: uno que no se pudo leer no deja sin pantalla a los demás.
	await Promise.all(Object.entries(chats).map(async ([cod, id]) => {
		try {
			const todos = (await getDocs(query(collection(db, 'chats', id, 'mensajes'), orderBy('createdAt')))).docs.map((d) => d.data());
			if (todos.at(-1)?.de === 'cliente') porResponder.add(cod);
			if (todos.some((m) => m.tipo === 'llegada')) conLlegada.add(cod);
		} catch (err) { console.warn(`No se pudieron leer los mensajes de ${cod}`, err); }
	}));
	const QUIEN = { cliente: 'Cliente', socio: 'Socio', equipo: 'Equipo' };
	const TIPOS = { pago: 'Datos de pago', llegada: 'Datos de llegada', foto: 'Comprobante de pago', reabierto: 'No llegó el pago' };
	// Respuestas de un toque: llenan el campo y se pueden ajustar antes de enviar. «Está disponible», «no está» y «recibí tu
	// pago» no van aquí: con un mensaje la reserva no cambia; eso lo hacen los botones de la solicitud (ver la nota del chat).
	// Respuestas rápidas según el momento de la reserva (sin datos de la casa que cambian de una a otra, sin contacto
	// y sin lo que se hace con un botón: disponibilidad, datos de pago y dirección salen solos al tocar «Confirmar» y «Pago recibido»).
	const RAPIDAS = {
		siempre: ['¡Hola! Gracias por escribir. Lo reviso y te respondo en unos minutos.', 'Con gusto. ¿Algo más en lo que te pueda ayudar?'],
		pendiente: ['¿A qué hora piensan llegar?', '¿Cuántas personas vienen en total?', '¿Viajan con mascotas?', '¿Vienen niños pequeños? Así tenemos todo listo.',
			'¿Es para una ocasión especial? Cuéntame y lo preparamos.'],
		confirmada: ['Tus datos de pago ya están en tu reserva. Cuando pagues, sube aquí la foto del comprobante.', 'Recibí tu comprobante: lo reviso y te confirmo.',
			'Aún no veo el pago. ¿Me compartes la foto del comprobante aquí?', '¿A qué hora piensan llegar?'],
		pagada: ['La dirección y cómo llegar ya están en tu reserva. ¡Buen viaje!', '¿Necesitas ayuda para llegar?', '¿Cómo va todo en la casa? ¿Necesitas algo?',
			'¡Gracias por tu visita! Esperamos verte pronto.']
	};
	// Conversación de la solicitud. Nadie pasa teléfonos, correos ni enlaces: todo se coordina aquí.
	async function abrirChat(l) {
		const ref = refChat(l);
		const mensajes = collection(db, 'chats', ref.id, 'mensajes');
		const yo = admin ? 'equipo' : 'socio';
		const ingles = datosChat[l.reserva.codigo]?.idioma === 'en';
		const traducidos = new Map();
		let traducir = false;
		// Mismas burbujas del asistente de IA (admin.css): las mías a la derecha.
		const lista = h('div', { class: 'ia-chat-log mb-3' });
		const cuerpo = (m) => m.tipo === 'foto' ? h('a', { href: m.texto, target: '_blank', rel: 'noopener' }, h('img', { src: m.texto, alt: 'Comprobante de pago', class: 'img-fluid rounded', loading: 'lazy' }))
			: m.tipo === 'llegada' ? 'Se le mostraron al cliente la dirección, el mapa y cómo llegar.'
			: [m.texto, traducir && m.de === 'cliente' && traducidos.get(m.texto) ? h('div', { class: 'small opacity-75 mt-1' }, traducidos.get(m.texto)) : null];
		const cargar = async () => {
			const [s, c] = await Promise.all([getDocs(query(mensajes, orderBy('createdAt'))), getDoc(ref)]);
			const todos = s.docs.map((d) => d.data());
			// Cliente que escribe en inglés: sus mensajes se muestran también en español.
			if (traducir) await Promise.all(todos.filter((m) => m.de === 'cliente' && !m.tipo && !traducidos.has(m.texto)).map(async (m) => traducidos.set(m.texto, await traducirTexto(m.texto, 'en|es'))));
			const ultimoMio = todos.filter((m) => m.de === yo).at(-1);
			const visto = ultimoMio && ms(c.data()?.vistoCliente) >= ms(ultimoMio.createdAt) && ms(ultimoMio.createdAt) > 0;
			// Mensajes seguidos de la misma persona van juntos y con su nombre una sola vez (como en WhatsApp).
			lista.replaceChildren(...(todos.length ? todos.flatMap((m, i) => [h('div', { class: `ia-burbuja ${m.de === yo ? 'ia-user' : 'ia-assistant'}${todos[i - 1]?.de === m.de && !m.tipo ? ' is-seguida' : ''}` },
				todos[i - 1]?.de === m.de && !m.tipo ? null : h('div', { class: 'small opacity-75' }, `${TIPOS[m.tipo] ? `${TIPOS[m.tipo]} · ` : ''}${QUIEN[m.de] || 'Equipo'}${ms(m.createdAt) ? ` · ${hace(ms(m.createdAt))}` : ''}`), cuerpo(m)),
				visto && m === ultimoMio ? h('div', { class: 'small text-muted text-end' }, 'Visto') : null])
				: [h('p', { class: 'small text-muted mb-0' }, 'Todavía no hay mensajes.')]));
			// Lo que escribió el cliente queda visto por mí.
			if (todos.at(-1) && todos.at(-1).de !== yo) await updateDoc(ref, { [admin ? 'vistoEquipo' : 'vistoSocio']: serverTimestamp() });
		};
		const mostrar = async () => { try { await cargar(); } catch (err) { showError(err); } };
		// Una línea que crece al escribir (hasta 5); Enter envía y Mayús + Enter baja de línea, como en la página del cliente.
		const campo = h('textarea', { class: 'form-control chat-campo', rows: 1, maxlength: 1000, required: true, placeholder: 'Escribe un mensaje…', 'aria-label': 'Mensaje',
			oninput: (e) => { e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 132)}px`; },
			onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } } });
		// Uno a la vez: doble clic o Enter y clic no mandan el mismo mensaje dos veces.
		let enviando = false;
		const form = h('form', { class: 'd-flex align-items-end gap-2', onsubmit: async (e) => {
			e.preventDefault();
			let texto = campo.value.trim();
			if (!texto || enviando) return;
			// Qué parte parece contacto, con la misma pieza del huésped y de «Mi casa» (mi-casa.js PARECE).
			const tipo = V.tipoDeContacto(texto);
			if (tipo) return toast(`${(PARECE[tipo] || 'parece un contacto').replace(/^./, (l) => l.toUpperCase())}: por aquí no se comparten contactos.`, 'warning');
			enviando = true;
			const escrito = campo.value;
			campo.value = ''; campo.style.height = '';
			try {
				// Al cliente que escribe en inglés le llega en inglés, con el original debajo.
				if (traducir) texto = `${await traducirTexto(texto, 'es|en')}\n(${texto})`.slice(0, 1000);
				await addDoc(mensajes, { de: yo, texto, createdAt: serverTimestamp() });
			} catch (err) { if (!campo.value) campo.value = escrito; showError(err); return; } finally { enviando = false; }
			// Ya quedó guardado: si volver a leer falla, no se devuelve el texto (se mandaría dos veces).
			avisarChat(ref.id);
			avisarAvisos();
			await mostrar();
		} }, campo, iconoBtn('icon-paper-plane', 'Enviar', { type: 'submit' }));
		// Respuestas rápidas detrás del rayo: se abren al tocarlo y se cierran al elegir una.
		const momento = datosChat[l.reserva.codigo]?.estado === 'pagada' ? 'pagada' : estado(l) === 'confirmada' ? 'confirmada' : 'pendiente';
		// (d-none y no «hidden»: el d-flex de Bootstrap le gana a «hidden» y la lista quedaba siempre abierta).
		const abrirRapidas = (si) => { rapidas.classList.toggle('d-none', !si); rayo.setAttribute('aria-expanded', String(si)); };
		const rapidas = h('div', { class: 'd-flex flex-wrap gap-2 mb-2 d-none' }, [...RAPIDAS[momento], ...RAPIDAS.siempre].map((r) => h('button', { type: 'button', class: 'cot-btn btn btn-sm btn-outline-secondary text-start', onclick: () => {
			campo.value = r; abrirRapidas(false); campo.focus();
		} }, r)));
		const rayo = iconoBtn('icon-bolt', 'Respuestas rápidas', { 'aria-expanded': 'false', onclick: () => abrirRapidas(rapidas.classList.contains('d-none')) });
		form.prepend(rayo);
		if (ingles) form.prepend(iconoBtn('icon-globe', 'Traducir: el cliente escribe en inglés', { 'aria-pressed': 'false', onclick: (e) => { traducir = !traducir; e.currentTarget.setAttribute('aria-pressed', String(traducir)); e.currentTarget.classList.toggle('active', traducir); mostrar(); } }));
		// Mensajes nuevos cada 10 s mientras la conversación está abierta.
		const reloj = setInterval(mostrar, 10000);
		// Lo que cambia la reserva no se dice por mensaje: se toca el botón (así se apartan las fechas y el cliente recibe lo que sigue).
		const est = estado(l);
		const nota = est === 'pendiente' ? 'Disponibilidad: usa «Confirmar» o «No se dio» en la solicitud.'
			: est === 'confirmada' ? 'Al recibir el pago, toca «Pago recibido» en la solicitud.' : '';
		modal({ title: `Chat · ${l.reserva.codigo}`, body: h('div', {}, lista, nota ? h('p', { class: 'small text-muted mb-2' }, h('span', { class: 'icon-info-circle me-1', 'aria-hidden': 'true' }), nota) : null, rapidas, form), onClose: () => { clearInterval(reloj); recargar(); } });
		await mostrar();
	}
	// Dinero recibido: el cliente ve «Pago recibido» y los datos de llegada guardados en la casa.
	async function pagoRecibido(l) {
		if (!(await confirmDialog(`${l.reserva.codigo}: ¿ya recibiste el pago? El cliente verá la dirección, el mapa y cómo llegar.`, { okText: 'Pago recibido' }))) return;
		await hacer(async () => {
			await marcarPagoRecibido(chatDe(l), l.propertyId, l.id);
			toast('Listo: el cliente ya ve los datos de llegada.');
		});
	}
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
	// Primero la que se abrió por enlace, luego las que tienen un mensaje del cliente sin responder y las pendientes.
	// Cotizada por debajo del precio de la casa (montos congelados por el servidor): la confirma el administrador, va arriba.
	const teToca = (l) => admin && estado(l) === 'pendiente' && bajoElPlan(congelados[l.id]) && !llegadaPasada(l.reserva.llegada, ahoraYa());
	const orden = (l) => (l.reserva.codigo === codigo ? 0 : teToca(l) ? 0.5 : porResponder.has(l.reserva.codigo) ? 1 : estado(l) === 'pendiente' ? 2 : 3);
	const alerta = (l) => alertaDe(l, reservaDe(l), casaDe(l.propertyId));
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
	const leads = (admin ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : chatsSnap.docs.map(delChat)).filter((l) => l.reserva?.llegada)
		.sort((a, b) => orden(a) - orden(b) || ms(b.createdAt) - ms(a.createdAt));

	// Posible repetida: el mismo cliente (correo o teléfono; el socio, que no los ve, por el nombre completo) con otra
	// solicitud abierta de la misma casa en una semana. Se marca para no atenderla dos veces.
	const nombreCompleto = (l) => String(l.nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
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
	const recargar = () => { container.replaceChildren(); return render(container, [codigo]); };
	vista.recargar = () => (container.isConnected ? recargar() : undefined);
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
			const deHoy = `Registrar con los precios de hoy (ganancia de EQ ${money(base.hoy, mon)})`;
			const opciones = [[cot, base.gananciaCotizada], [deHoy, base.hoy]].filter(([, g]) => g >= 0).map(([t]) => t);
			if (opciones.length < 2) nota = ` ${SIN_GANANCIA_NEGATIVA}`;
			const elegida = opciones.length === 2
				? await elegirOpcion(`${r.codigo}: ${TEXTO_PRECIO_CAMBIO}. Se cotizaron ${money(base.cotizado, mon)} de alojamiento; con los precios de hoy serían ${money(base.deHoy, mon)}. ¿Con cuál se registra?`, opciones)
				: opciones[0];
			if (!elegida) return;
			modo = elegida === deHoy ? 'hoy' : 'cotizado';
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
				const hace = (m) => (m < 60 ? `${m} min` : `${Math.round(m / 60)} h`);
				const viejos = (hecho?.calendarios || []).map((c) => `${c.nombre} no respondió: revisé con lo de hace ${hace(Number(c.minutos) || 1)}.`);
				toast(['Reserva confirmada.', ...viejos].join(' '));
			} catch (err) {
				if (err instanceof ChoqueDeFechas || (err?.servidor && !err.yaRespondida)) toast(err.message, 'warning');
				else throw err;
			}
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

	// El socio sube la foto de su transferencia o depósito. Mientras sube, su botón se apaga y dice «Subiendo…» (otro toque
	// o una pestaña que se repinta no suben otra: SUBIENDO, por reserva); si no termina en LIMITE_SUBIDA, se dice y se
	// puede volver a intentar. El archivo que llegara tarde queda sin usar: la reserva guarda solo el que sí se registró.
	function subirComprobante(res) {
		if (SUBIENDO.has(res.id)) return;
		const archivo = h('input', { type: 'file', accept: 'image/*', onchange: async () => {
			const foto = archivo.files[0];
			if (!foto || SUBIENDO.has(res.id)) return;
			SUBIENDO.add(res.id);
			vista.pintar();
			let url;
			try {
				let vence;
				const tarde = new Promise((_, mal) => { vence = setTimeout(() => mal(Object.assign(new Error('lenta'), { code: 'subida/lenta' })), LIMITE_SUBIDA); });
				({ url } = await Promise.race([uploadImage(foto, `comprobantes/${res.id}`), tarde]).finally(() => clearTimeout(vence)));
			} catch (err) {
				const red = err?.code === 'subida/lenta' || /^storage\/(retry-limit-exceeded|canceled|unknown)$/.test(err?.code || '') || err?.code === 'auth/network-request-failed';
				toast(red ? 'No se pudo subir el comprobante: la conexión está lenta o se cortó. Vuelve a intentarlo.' : `No se pudo subir el comprobante: ${errorMessage(err)}`, 'warning');
				SUBIENDO.delete(res.id);
				return vista.pintar();
			}
			// Apagado hasta que la reserva lo registra; después la pantalla abierta se repinta con lo guardado.
			try { await ponerComprobante(res, url); toast('Comprobante enviado.'); avisarAvisos(); } catch (err) { showError(err); }
			SUBIENDO.delete(res.id);
			vista.pintar();
			await vista.recargar();
		} });
		archivo.click();
	}
	// El botón del comprobante: mientras sube, apagado y con «Subiendo…».
	const botonComprobante = (com, res) => (SUBIENDO.has(res.id)
		? h('button', { type: 'button', class: 'cot-btn btn btn-sm btn-outline-secondary', disabled: true, 'aria-live': 'polite' },
			h('span', { class: 'spinner-border spinner-border-sm me-1', 'aria-hidden': 'true' }), 'Subiendo…')
		: iconoBtn('icon-upload', com.comprobante ? 'Cambiar comprobante' : 'Subir comprobante del pago a EQ', { onclick: () => subirComprobante(res) }));

	// La alerta de cada mañana: confirmada, llegada pasada y sin «Pago recibido». Si el equipo supo que el cliente pagó,
	// «Cobrar comisión»: desde ahí su atraso cuenta para apagarle los permisos al socio (permisos-socio.js cuentaParaCorte).
	async function cobrar(l, res) {
		if (!(await confirmDialog(`${l.reserva.codigo}: ¿el cliente sí pagó? Se cobra la ganancia de EQ (${money(res.comision.monto, res.moneda)}) y, si el socio se atrasa ${DIAS_CORTE} días, se le apagan los permisos.`, { okText: 'Cobrar comisión', danger: false }))) return;
		await hacer(async () => { await cobrarComision(res); toast('Comisión por cobrar.'); });
	}

	async function pagada(l, res, nivel) {
		if (!(await confirmDialog(`${l.reserva.codigo}: ¿ya recibiste la ganancia de EQ (${money(res.comision.monto, res.moneda)})?`, { okText: 'Marcar pagada', danger: false }))) return;
		await hacer(async () => {
			await comisionPagada({ ...res, propertyTitulo: res.propertyTitulo || l.propertyTitulo }, nivel);
			toast('Ganancia de EQ pagada.');
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

	// Lo que vence solo (netlify/functions/plazos-reservas.mjs): se dice en la tarjeta para que nadie se sorprenda.
	function plazo(l, est, res) {
		const ch = datosChat[l.reserva.codigo];
		let vence = 0, texto = '';
		if (est === 'pendiente' && conPlazo(ms(l.createdAt)) && ch && !ch.estado) { vence = venceRespuesta(ms(l.createdAt)); texto = 'si no se responde, se cierra sola'; }
		else if (est === 'confirmada' && res && conPlazo(ms(res.createdAt)) && ch?.estado === 'confirmada' && !ch.comprobanteCliente) {
			vence = plazoDePago(res, ms(res.createdAt)).vence; texto = 'si el cliente no paga, se cancela sola y las fechas quedan libres';
			// Confirmada a última hora: no se cancela sola (se explica aquí para que no parezca un error).
			if (!Number.isFinite(vence)) return h('div', { class: 'small text-muted' }, h('span', { class: 'icon-clock-o me-1', 'aria-hidden': 'true' }), 'Sin plazo automático (se confirmó a última hora): si no te paga, toca «No me llegó».');
		}
		if (!vence) return null;
		return h('div', { class: `small ${vence - Date.now() < 6 * 3600000 ? 'text-danger' : 'text-muted'}` }, h('span', { class: 'icon-clock-o me-1', 'aria-hidden': 'true' }),
			`Vence ${formatDate(new Date(vence))}: ${texto}.`);
	}
	// Quién hizo qué y cuándo con esta solicitud: lo último que pasó a la vista (un correo corregido o reenviado no lo
	// tapa: ultimoDelHistorial); todo, al abrirlo.
	function historial(sol) {
		const renglones = (sol.historial || []).filter((x) => x?.que);
		if (!renglones.length) return null;
		const linea = (x) => `${x.que} · ${x.nombre || ''}${x.nombre ? ' · ' : ''}${formatDate(x.cuando)}`;
		const ultimo = ultimoDelHistorial(renglones);
		// El motivo va con el renglón que lo puso (el que la cerró: lo último que pasó), no con una nota de después.
		const conMotivo = (x) => linea(x) + (sol.motivo && x === ultimo ? ` · ${sol.motivo}` : '');
		if (renglones.length === 1) return h('div', { class: 'small text-muted' }, conMotivo(ultimo));
		return h('details', { class: 'small text-muted' }, h('summary', {}, conMotivo(ultimo)),
			h('ol', { class: 'mb-0 ps-3' }, renglones.map((x) => h('li', {}, conMotivo(x)))));
	}

	// Corregir el correo del cliente (crm.js corregirCorreo: el mismo que usa su ficha de cliente). Con el formulario del panel:
	// revisa el formato y sugiere «¿Quisiste decir …?». Al guardar se le reenvía el enlace de su reserva: el botón dice a qué
	// correo, tal como se guarda (un error de dedo mandaría su reserva a otra persona); con el mismo correo, no se guarda.
	function corregirElCorreo(l) {
		const form = renderForm([{ name: 'email', label: 'Correo del cliente', type: 'email', required: true }], { email: l.email || '' });
		const campo = form.el.querySelector('input[type=email]');
		const texto = h('span', { class: 'text-break' });
		const avion = h('span', { class: 'icon-paper-plane me-1', 'aria-hidden': 'true' });
		// Lo mismo que revisa el servidor: abierta (sin responder o confirmada) y su salida no ha pasado.
		const reenvia = ['pendiente', 'confirmada'].includes(estado(l)) && l.reserva.salida >= hoy();
		const guardar = h('button', { class: 'btn btn-primary text-start', onclick: async (e) => {
			const boton = e.currentTarget;
			if (!form.validate()) return;
			boton.disabled = true;
			try {
				const r = await corregirCorreo(l, form.getData().email);
				m.close();
				if (!r.cambio) toast('Ya tenía ese correo.');
				else if (r.enviado) toast(`Correo corregido: le reenviamos el enlace de su reserva a ${r.enviado}.`);
				else if (r.enviado === '' && reenvia) toast(`Correo corregido, pero el enlace no se reenvió${r.motivo ? ` (${r.motivo.replace(/\.$/, '')})` : ''}: los próximos avisos sí le llegan ahí.`, 'warning');
				else toast('Correo corregido: los próximos avisos le llegan ahí.');
				await recargar();
			} catch (err) { showError(err); boton.disabled = false; }
		} }, avion, texto);
		const pintarBoton = () => {
			const nuevo = limpiarCorreo(campo?.value);
			const igual = nuevo === limpiarCorreo(l.email);
			texto.textContent = igual || !correoValido(nuevo) ? 'Guardar' : reenvia ? `Guardar y reenviar a ${nuevo}` : `Guardar ${nuevo}`;
			guardar.disabled = igual;
			avion.hidden = !(reenvia && !igual && correoValido(nuevo));
		};
		campo?.addEventListener('input', pintarBoton);
		pintarBoton();
		const m = modal({ title: `Correo · ${l.reserva.codigo}`, body: form.el, footer: [h('button', { class: 'btn btn-light', 'data-bs-dismiss': 'modal' }, 'Cancelar'), guardar] });
	}

	function tarjeta(l) {
		const r = l.reserva;
		const sol = l.solicitud || {};
		const est = estado(l);
		// Una reserva ya confirmada muestra lo que quedó guardado (su comisión), no la cuenta con los precios de hoy.
		const res = est === 'confirmada' ? reservaDe(l) : null;
		// Todo en la moneda de la solicitud (la que vio el cliente): si la casa cambió de moneda después, la cuenta con la
		// casa de hoy saldría en otra y no se muestra (esa solicitud no se confirma: sinConfirmar lo dice).
		const cHoy = res || sol.comision != null ? null : montosDe(l);
		const c = res ? { costoSocio: res.costoSocio, ganancia: res.comision?.monto ?? res.ganancia }
			: sol.comision != null ? { costoSocio: sol.costoSocio, ganancia: sol.comision } : cHoy && (cHoy.moneda || 'USD') === (r.moneda || 'USD') ? cHoy : null;
		// El precio de hoy ya no es el que se le cotizó (solo mientras se puede confirmar).
		const cambio = est === 'pendiente' && cambioElPrecio(montosDe(l), cuenta(l));
		const ch = datosChat[r.codigo];
		const aviso = alerta(l);
		const tarde = aviso === 'tarde';
		const evasion = aviso === 'bloqueada';
		const ocupada = est === 'pendiente' && yaOcupada(l);
		// Otra solicitud sin responder con alguna de estas noches (llegó mientras la otra ya no las apartaba, o a la vez).
		const cruce = est === 'pendiente' && !ocupada && seCruzaCon(l);
		// Con la llegada ya pasada no se confirma (el servidor la rechazaría igual): queda «No se dio».
		const pasada = est === 'pendiente' && llegadaPasada(r.llegada, ahoraYa());
		// La casa salió del sitio o cambió de moneda: el servidor no la confirmaría (motivoParaNoConfirmar); se dice por qué.
		// Lo cotizado quedó por debajo del precio de la casa: el socio no la confirma (motivoSocioNoConfirma; el servidor igual).
		const sinConfirmar = est === 'pendiente' && !pasada && casaDe(l.propertyId) ? motivoParaNoConfirmar(l, casaDe(l.propertyId), congelados[l.id] || null, ahoraYa())
			|| (!admin && motivoSocioNoConfirma(montosDe(l))) : '';
		const mon = res?.moneda || r.moneda || 'USD';
		const wa = (mensaje) => iconoBtn('icon-whatsapp', `WhatsApp a ${l.nombre}`, { href: whatsappUrl(l.telefono, mensaje), target: '_blank', rel: 'noopener' });
		const com = res?.comision?.monto > 0 ? res.comision : null;
		// El atraso que castiga (V.nivelMora): solo si se sabe que el cliente pagó (pago marcado o «Cobrar comisión»).
		const nivel = com ? V.nivelMora(conDatosDelChat(res, ch), Date.now()) : 0;
		const icono = (i) => h('span', { class: `icon-${i} me-1`, 'aria-hidden': 'true' });
		const boton = (texto, clase, onclick, i) => h('button', { type: 'button', class: `cot-btn btn btn-sm ${clase}`, onclick }, icono(i), texto);
		return h('div', { class: `card mb-2${r.codigo === codigo ? ' border-primary' : tarde ? ' border-warning' : ''}` }, h('div', { class: 'card-body' },
			h('div', { class: 'd-flex flex-wrap align-items-center gap-2' },
				h('strong', {}, r.codigo), h('span', {}, admin ? l.nombre : String(l.nombre || '').trim().split(/\s+/)[0]), badge(...ESTADOS[est]),
				evasion ? badge('Revisar: fechas bloqueadas', 'danger') : null,
				ocupada ? badge('Esas fechas ya tienen otra reserva', 'warning') : null,
				cruce ? badge(`Se cruza con otra solicitud: ${cruce}`, 'warning') : null,
				teToca(l) ? badge('Te toca confirmar', 'danger') : null,
				pasada ? badge('La fecha de llegada ya pasó', 'warning') : null,
				((x) => (x ? badge(`Posible repetida de ${x}`, 'warning') : null))(repetidaDe(l)),
				porResponder.has(r.codigo) ? badge('Mensaje sin responder', 'info') : null,
				datosChat[r.codigo]?.estado === 'pagada' ? badge('Pago recibido', 'success') : null,
				est === 'confirmada' && ch?.estado === 'confirmada' && comprobanteVigente(ch) ? badge('Cliente subió comprobante', 'info') : null,
				est === 'confirmada' && ch?.estado === 'confirmada' && ch.pagoReabierto && !comprobanteVigente(ch) ? badge('Se le pidió otro comprobante', 'warning') : null,
				cambio ? badge(TEXTO_PRECIO_CAMBIO, 'warning') : null,
				h('span', { class: `ms-auto small ${tarde ? 'text-danger' : 'text-muted'}` }, hace(ms(l.createdAt)))),
			h('div', { class: 'small text-muted' }, [l.propertyTitulo, netos[l.propertyId]?.codigoSocio && `Código del socio: ${netos[l.propertyId].codigoSocio}`, admin && propietarios.find((p) => p.id === l.propietarioId)?.nombre].filter(Boolean).join(' · ')),
			h('div', {}, `${fechas(r)} · ${nNoches(r.noches)} · ${r.huespedes} ${r.huespedes === 1 ? 'persona' : 'personas'}`),
			h('div', { class: 'small' }, `Cliente paga ${money(r.total, r.moneda)}`,
				c ? ` · ${admin ? 'Socio' : 'Tu parte'} ${money(c.costoSocio, mon)} · ${admin ? 'Ganancia de EQ' : 'Ganancia de EQ (se la pagas)'} ${money(c.ganancia, mon)}` : ''),
			com ? h('div', { class: 'small d-flex flex-wrap align-items-center gap-2' }, h('span', {}, icono('money'), `Ganancia de EQ: se paga el ${dia(com.vence)}`),
				com.pagada ? badge('Pagada', 'success') : [badge(...ATRASO[nivel]), com.comprobante ? badge('Comprobante enviado', 'info') : null]) : null,
			sinConfirmar ? h('div', { class: 'small text-danger' }, h('span', { class: 'icon-exclamation-triangle me-1', 'aria-hidden': 'true' }), sinConfirmar) : null,
			// La revisión del comprobante con la IA: solo un aviso (nunca decide); la de la foto que está vigente.
			((rv) => (rv?.texto && est === 'confirmada' && ch && comprobanteVigente(ch) && rv.mensaje === ch.comprobanteMensaje
				? h('div', { class: `small ${rv.cuadra ? 'text-success' : 'text-danger'}` }, h('span', { class: `icon-${rv.cuadra ? 'check-circle' : 'exclamation-triangle'} me-1`, 'aria-hidden': 'true' }),
					rv.texto, h('span', { class: 'text-muted' }, [rv.leido?.banco, rv.leido?.referencia && `ref. ${rv.leido.referencia}`].filter(Boolean).map((x) => ` · ${x}`).join('')))
				: null))(revisiones[l.id]),
			// El correo del cliente rebotó (/api/rebote-correo): no recibe los avisos de su reserva; se le escribe por WhatsApp.
			admin && l.reboteCorreo ? h('div', { class: 'small text-danger' }, h('span', { class: 'icon-envelope-o me-1', 'aria-hidden': 'true' }),
				'El correo no llegó: escríbele por WhatsApp o corrígelo.') : null,
			plazo(l, est, res),
			// Hasta cuándo vale «No me llegó»: después, sin pago marcado, la ganancia de EQ cuenta como cobrada (V.cobrable).
			!admin && est === 'confirmada' && res && puedeNoMeLlego(l) ? h('div', { class: 'small text-muted' }, icono('clock-o'),
				`Si no te pagó, toca «No me llegó» antes del ${dia(V.sumarDias(V.ultimoDiaNoLlego(res), 1))}; después la ganancia de EQ cuenta como cobrada.`) : null,
			historial(sol),
			h('div', { class: 'd-flex flex-wrap align-items-center gap-2 mt-2' },
				// Con el cliente solo habla el equipo por WhatsApp; el socio le escribe por el chat y al equipo, por WhatsApp.
				!admin ? (equipo ? iconoBtn('icon-whatsapp', `WhatsApp a ${equipo.nombre}`, { href: whatsappUrl(equipo.whatsapp,
					`Hola, soy ${session.dueno?.nombre || session.profile?.nombre || 'el socio'}. Te escribo por la solicitud ${r.codigo} de ${l.propertyTitulo} (${fechas(r)}).`), target: '_blank', rel: 'noopener' }) : null)
					: est === 'no'
					? wa(`Hola ${l.nombre}, te escribimos de EQ Inmobiliario. ¿Pudiste reservar ${l.propertyTitulo} para ${fechas(r)}?`)
					: wa(`Hola ${l.nombre}, te escribo por tu solicitud ${r.codigo} de ${l.propertyTitulo} (${fechas(r)}).`),
				chats[r.codigo] ? iconoBtn('icon-comments', 'Chat con el cliente', { onclick: () => abrirChat(l) }) : null,
				est === 'pendiente' && deHoy(l.propertyId) ? [ocupada || pasada || sinConfirmar ? null : boton('Confirmar', 'btn-primary', () => confirmar(l), 'check'), boton('No se dio', ocupada || pasada || sinConfirmar ? 'btn-primary' : 'btn-outline-secondary', () => noSeDio(l, ocupada ? 'Fechas no disponibles' : ''), 'close')] : null,
				est === 'confirmada' && chats[r.codigo] && !(datosChat[r.codigo].estado === 'pagada' && conLlegada.has(r.codigo)) ? boton('Pago recibido', 'btn-primary', () => pagoRecibido(l), 'money') : null,
				com?.comprobante ? iconoBtn('icon-file-image-o', 'Ver comprobante del pago a EQ', { href: com.comprobante, target: '_blank', rel: 'noopener' }) : null,
				com && !com.pagada && !admin ? botonComprobante(com, res) : null,
				com && !com.pagada && session.isAdmin ? boton('Pagada', 'btn-success', () => pagada(l, res, nivel), 'money') : null,
				com && !com.pagada && !com.cobrar && !res.pagoRecibido && session.isAdmin && llegadaPasada(r.llegada, ahoraYa()) && ch?.estado === 'confirmada' ? boton('Cobrar comisión', 'btn-outline-primary', () => cobrar(l, res), 'check') : null,
				// Con el pago recibido o el día de llegada ya empezado, cancelar anularía la comisión: solo el administrador
				// (el servidor lo exige: motivoParaNoCancelar en admin/js/reservas-calculo.js).
				est === 'confirmada' && (session.isAdmin ? r.salida > hoy() : puedeCancelar(l)) ? boton('Cancelar', 'btn-outline-danger', () => cancelar(l), 'ban') : null,
				// Con el comprobante del cliente, o desde el día de llegada sin el pago: en vez de «Cancelar».
				!admin && est === 'confirmada' && puedeNoMeLlego(l) ? boton('No me llegó', 'btn-outline-danger', () => noMeLlego(l), 'ban') : null,
				// El correo al que le llegan los avisos de su reserva y su lápiz (lo lee el servidor de la solicitud), juntos y al
				// final: las respuestas van primero; en el celular no se separan de fila.
				admin ? h('span', { class: 'd-inline-flex align-items-center gap-2 mw-100 ms-auto' },
					h('span', { class: `small text-break ${l.reboteCorreo ? 'text-danger' : 'text-muted'}`, style: 'min-width:0' }, h('span', { class: 'icon-envelope-o me-1', 'aria-hidden': 'true' }), l.email || 'Sin correo'),
					iconoBtn('icon-pencil', 'Corregir el correo', { onclick: () => corregirElCorreo(l) })) : null)));
	}

	const lista = h('div', {});
	const filtro = { socio: '', estado: codigo === 'cobrar' ? 'cobrar' : '' };
	const pintar = vista.pintar = () => {
		const ver = leads.filter((l) => (!filtro.socio || l.propietarioId === filtro.socio) && (!filtro.estado || (filtro.estado === 'cobrar' ? porCobrar(l) : filtro.estado === 'alerta' ? alerta(l) : estado(l) === filtro.estado)));
		// Por cobrar: primero la más atrasada; luego la que vence antes.
		if (filtro.estado === 'cobrar') ver.sort((a, b) => moraDe(reservaDe(b)) - moraDe(reservaDe(a)) || String(reservaDe(a).comision.vence).localeCompare(String(reservaDe(b).comision.vence)));
		lista.replaceChildren(ver.length ? ver.map(tarjeta) : emptyState('No hay solicitudes.'));
	};
	pintar();

	const numero = (icono, valor, texto) => h('div', { class: 'col-4' }, statCard(icono, texto, valor, { cls: 'stat-envuelve' }));
	const elegir = (campo, titulo, opciones) => h('select', {
		class: 'form-select form-select-sm w-auto', 'aria-label': titulo, onchange: (e) => { filtro[campo] = e.target.value; pintar(); }
	}, h('option', { value: '' }, titulo), opciones.map(([v, t]) => h('option', { value: v, selected: filtro[campo] === v }, t)));
	const total = {};
	reservas.filter((r) => r.estado === 'confirmada' && r.comision && !r.comision.pagada)
		.forEach((r) => { total[r.moneda] = (total[r.moneda] || 0) + r.comision.monto; });
	// Aviso al socio: cuánto debe a EQ (por moneda: nunca se suman Q y US$), cuánto con atraso y lo que ya le pasa por eso,
	// con el botón que deja solo esas reservas (y el que vuelve a todas). Sin atraso, una línea sin rojo.
	const avisoDeuda = (() => {
		if (admin) return null;
		const debidas = reservas.filter(debe);
		if (!debidas.length) return null;
		const peor = Math.max(...debidas.map(moraDe));
		const suma = (l) => dineroPorMoneda(sumarPorMoneda(l, (r) => r.comision.monto, (r) => r.moneda || r.comision.moneda));
		const todo = suma(debidas), atrasado = suma(debidas.filter((r) => moraDe(r) >= 1));
		const deuda = `Debes a EQ ${todo}${!peor ? '' : atrasado === todo ? ', con atraso' : ` (con atraso: ${atrasado})`}`;
		const texto = peor === 3 ? `${deuda}. Con más de 72 horas de atraso, tus casas salieron del sitio hasta que EQ lo marque pagado.`
			: peor === 2 ? `${deuda}. Con más de 24 horas de atraso, los clientes de tus casas le escriben a EQ hasta que lo marque pagado.`
			: peor === 1 ? `${deuda}. A las 24 horas de atraso, los clientes de tus casas le escriben a EQ.`
			: `${deuda}: se paga el ${dia(debidas.map((r) => r.comision.vence).sort()[0])}.`;
		const ver = filtro.estado === 'cobrar'
			? h('a', { class: 'cot-btn btn btn-sm btn-outline-secondary', href: '#/solicitudes' }, h('span', { class: 'icon-list me-1', 'aria-hidden': 'true' }), 'Ver todas')
			: h('a', { class: 'cot-btn btn btn-sm btn-outline-primary', href: '#/solicitudes/cobrar' }, h('span', { class: 'icon-money me-1', 'aria-hidden': 'true' }), 'Ver lo que debo');
		const icono = h('span', { class: `${peor ? 'icon-exclamation-triangle' : 'icon-money'}`, 'aria-hidden': 'true' });
		return h('div', { class: `d-flex flex-wrap align-items-center gap-2 ${peor >= 2 ? 'alert alert-danger' : peor ? 'alert alert-warning' : 'small text-muted mb-3'}`, role: peor ? 'alert' : null },
			icono, h('span', { class: 'flex-grow-1', style: 'min-width:0' }, texto), ver);
	})();
	const conSolicitud = propietarios.filter((p) => leads.some((l) => l.propietarioId === p.id));

	// ¿El servidor ya escribe lo del socio? (con su cuenta de escritura en Netlify: ver docs/portal-propietarios.md).
	// Se pinta cuando llega, sin hacer esperar a la pantalla.
	const indicador = h('div', {});
	if (session.isAdmin) estadoServidor().catch(() => 'error').then((servidor) => {
		indicador.className = 'small text-muted mb-2 d-flex align-items-center gap-1';
		indicador.replaceChildren(h('span', { class: servidor === 'activo' ? 'icon-check text-success' : 'icon-exclamation-triangle text-warning', 'aria-hidden': 'true' }),
			`Reservas por servidor: ${servidor === 'activo' ? 'activo' : servidor === 'sin configurar' ? 'sin configurar' : 'con error (revisa la cuenta de escritura en Netlify)'}`);
	});
	// Sin datos de pago no se puede confirmar (el cliente no sabría a dónde pagar): se avisa aquí, antes de que llegue
	// el momento de confirmar. Al equipo, por cada socio con solicitudes abiertas; al socio, de sí mismo.
	const sinDatosPago = (x) => !String(x?.datosPago || '').trim();
	const abiertas = (id) => leads.some((l) => l.propietarioId === id && ['pendiente', 'confirmada'].includes(estado(l)));
	const faltaPago = admin ? propietarios.filter((p) => sinDatosPago(p) && abiertas(p.id)) : [];
	const avisoPago = admin
		? (faltaPago.length ? h('div', { class: 'alert alert-warning d-flex flex-wrap align-items-center gap-2', role: 'alert' }, h('span', { class: 'icon-exclamation-triangle', 'aria-hidden': 'true' }),
			h('span', { class: 'flex-grow-1' }, `Faltan los datos de pago de ${faltaPago.map((p) => p.nombre || 'un socio').join(', ')}: sin ellos no se puede confirmar su reserva.`),
			faltaPago.map((p) => h('a', { class: 'btn btn-sm btn-outline-primary', href: `#/propietarios/${p.id}` }, faltaPago.length > 1 ? `Completar (${String(p.nombre || '').split(' ')[0]})` : 'Completar'))) : null)
		: (session.dueno && sinDatosPago(session.dueno) ? h('div', { class: 'alert alert-warning d-flex flex-wrap align-items-center gap-2', role: 'alert' }, h('span', { class: 'icon-exclamation-triangle', 'aria-hidden': 'true' }),
			h('span', { class: 'flex-grow-1' }, 'Faltan tus datos de pago: sin ellos no puedes confirmar una reserva, porque el cliente no sabría a dónde pagar.'),
			equipo ? h('a', { class: 'btn btn-sm btn-outline-primary', target: '_blank', rel: 'noopener', href: whatsappUrl(equipo.whatsapp, 'Hola, te envío mis datos de pago para las reservas (banco, tipo y número de cuenta, a nombre de quién): ') },
				h('span', { class: 'icon-whatsapp me-1', 'aria-hidden': 'true' }), 'Enviar mis datos') : null) : null);
	// Por hacer del administrador: las que le tocan a él, con su plazo de 24 h (después se cierran solas).
	const suyas = leads.filter(teToca);
	const porHacer = suyas.length ? h('div', { class: 'alert alert-danger d-flex align-items-baseline gap-2', role: 'alert' }, h('span', { class: 'icon-exclamation-triangle', 'aria-hidden': 'true' }),
		h('span', { class: 'flex-grow-1' }, `Te toca confirmar (${TEXTO_CONFIRMA_EQUIPO.toLowerCase()}): `,
			suyas.map((l, i) => [i ? ', ' : '', h('a', { href: `#/solicitudes/${encodeURIComponent(l.reserva.codigo)}` }, l.reserva.codigo),
				conPlazo(ms(l.createdAt)) ? ` (vence ${formatDate(new Date(venceRespuesta(ms(l.createdAt))))})` : '']))) : null;
	mount(container,
		pageHeader('Solicitudes'),
		porHacer,
		avisoPago,
		indicador,
		variosChats.length ? h('div', { class: 'alert alert-warning d-flex gap-2', role: 'alert' }, h('span', { class: 'icon-exclamation-triangle mt-1', 'aria-hidden': 'true' }),
			`${variosChats.join(', ')}: ${variosChats.length === 1 ? 'esta solicitud tiene' : 'estas solicitudes tienen'} más de un chat. Revisa cuál es el del cliente; hasta entonces el socio no puede confirmarla ni cancelarla.`) : null,
		admin ? [
			h('div', { class: 'row g-2 mb-3' },
				numero('icon-clock-o', leads.filter((l) => estado(l) === 'pendiente').length, 'Sin responder'),
				numero('icon-check', leads.filter((l) => estado(l) === 'confirmada' && diaQueConfirmo(l.solicitud.historial).startsWith(hoy().slice(0, 7))).length, 'Confirmadas'),
				numero('icon-money', Object.entries(total).map(([m, n]) => money(V.r2(n), m)).join(' · ') || '—', 'Por cobrar')),
			h('div', { class: 'd-flex flex-wrap gap-2 mb-3' },
				elegir('socio', 'Todos los socios', conSolicitud.map((p) => [p.id, p.nombre])),
				elegir('estado', 'Todos los estados', [...Object.entries(ESTADOS).map(([v, [t]]) => [v, t]), ['cobrar', 'Ganancia de EQ por cobrar'], ['alerta', 'Con alerta']]))
		] : avisoDeuda,
		lista);
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
