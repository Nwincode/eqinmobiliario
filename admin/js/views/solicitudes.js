// Solicitudes de reserva que llegan de la web. El socio ve las de sus casas y las responde;
// el administrador ve todas, con lo que falta responder y la comisión por cobrar.
// Comisión: el socio la paga a EQ el día de llegada y sube su comprobante; solo el administrador la marca pagada.
// Nada se borra: cada respuesta queda en el historial con quién y cuándo.
import '/js/calc-vacacional.js';
import { db, doc, getDoc, getDocs, addDoc, updateDoc, collection, query, where, orderBy, serverTimestamp, writeBatch, arrayUnion } from '../firebase.js';
import { h, statCard, mount, pageHeader, emptyState, toast, showError, modal, confirmDialog, badge, iconoBtn, formatDate, hoy, dia } from '../ui.js';
import { session, markPending } from '../session.js';
import { whatsappUrl, nNoches } from '../formato.js';
import { uploadImage } from '../form.js';
import { money, ms, loadPropietarios, loadPropiedades, loadReservas } from '../crm.js';

const V = window.EQVacacional;
const ESTADOS = { pendiente: ['Sin responder', 'warning'], confirmada: ['Confirmada', 'success'], no: ['No se dio', 'secondary'], cancelada: ['Cancelada', 'danger'] };
const MOTIVOS_NO = ['Cliente no respondió', 'Fechas no disponibles', 'Precio', 'Otro'];
const MOTIVOS_CANCELAR = ['Cliente canceló', 'Fechas ya no disponibles', 'Otro'];
// Atraso de la comisión, según V.nivelComision().
const ATRASO = [['Al día', 'secondary'], ['Vencida', 'warning'], ['+24 h · clientes a EQ', 'danger'], ['+72 h · fuera del sitio', 'danger']];

const estado = (l) => l.solicitud?.estado || 'pendiente';
const fechas = (r) => `${dia(r.llegada)} – ${dia(r.salida)}`;
const choca = (rangos, r) => (rangos || []).some((x) => x.desde < r.salida && x.hasta > r.llegada);
// Lo que el administrador debe atender; el texto sale en la tarjeta de Inicio.
const ALERTAS = { tarde: 'Sin responder', mora: 'Comisión con más de 72 h de atraso', bloqueada: 'No se dio, pero el socio bloqueó esas fechas' };
const alertaDe = (l, reserva, casa) => V.alertaSolicitud(estado(l), ms(l.createdAt), l.reserva, reserva, casa?.vacacional?.bloqueos, Date.now());
function hace(desde) {
	const min = Math.max(1, Math.round((Date.now() - desde) / 60000));
	return min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} d`;
}

// Un toque para decir por qué: devuelve el motivo elegido, o null si se cerró.
function pedirMotivo(titulo, motivos) {
	return new Promise((resolve) => {
		let elegido = null;
		const m = modal({
			title: titulo,
			body: h('div', { class: 'd-grid gap-2' }, motivos.map((t) => h('button', {
				type: 'button', class: 'cot-btn btn btn-outline-secondary', onclick: () => { elegido = t; m.close(); }
			}, t))),
			onClose: () => resolve(elegido)
		});
	});
}

// Lo que cambia en la solicitud al responderla, con su renglón de historial.
const respuesta = (nuevo, que, extra = {}) => ({
	'solicitud.estado': nuevo, ...extra, updatedAt: serverTimestamp(),
	'solicitud.historial': arrayUnion({ que, quien: session.user.uid, nombre: session.profile?.nombre || '', cuando: new Date().toISOString() })
});

export async function render(container, [codigo] = []) {
	const admin = !session.esSocio;
	const mio = session.profile?.propietarioId || '-';
	const [snap, chatsSnap, propietarios, casas, reservas] = await Promise.all([
		getDocs(query(collection(db, 'leads'), admin ? where('reserva.codigo', '>', '') : where('propietarioId', '==', mio))),
		// Chat de cada solicitud (por código): el cliente escribe desde su enlace; aquí responden el socio y el equipo.
		getDocs(admin ? collection(db, 'chats') : query(collection(db, 'chats'), where('propietarioId', '==', mio))),
		admin ? loadPropietarios() : [], admin ? loadPropiedades() : [],
		admin ? loadReservas() : getDocs(query(collection(db, 'reservas'), where('propietarioId', '==', mio))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))]);
	const chats = Object.fromEntries(chatsSnap.docs.map((d) => [d.data().codigo, d.id]));
	const refChat = (l) => chats[l.reserva.codigo] && doc(db, 'chats', chats[l.reserva.codigo]);
	// Chats donde lo último lo escribió el cliente: falta responderle.
	const porResponder = new Set((await Promise.all(Object.entries(chats).map(async ([cod, id]) => {
		const ultimo = (await getDocs(query(collection(db, 'chats', id, 'mensajes'), orderBy('createdAt')))).docs.at(-1)?.data();
		return ultimo?.de === 'cliente' ? cod : null;
	}))).filter(Boolean));
	const QUIEN = { cliente: 'Cliente', socio: 'Socio', equipo: 'Equipo' };
	// Conversación de la solicitud. Nadie pasa teléfonos, correos ni enlaces: el contacto se entrega al confirmar.
	async function abrirChat(l) {
		const mensajes = collection(db, 'chats', chats[l.reserva.codigo], 'mensajes');
		const yo = admin ? 'equipo' : 'socio';
		// Mismas burbujas del asistente de IA (admin.css): las mías a la derecha.
		const lista = h('div', { class: 'ia-chat-log mb-3' });
		const cargar = async () => {
			const s = await getDocs(query(mensajes, orderBy('createdAt')));
			lista.replaceChildren(...(s.docs.length ? s.docs.map((d) => d.data()).map((m) => h('div', { class: `ia-burbuja ${m.de === yo ? 'ia-user' : 'ia-assistant'}` },
				h('div', { class: 'small opacity-75' }, `${QUIEN[m.de] || 'Equipo'}${ms(m.createdAt) ? ` · ${hace(ms(m.createdAt))}` : ''}`), m.texto))
				: [h('p', { class: 'small text-muted mb-0' }, 'Todavía no hay mensajes.')]));
		};
		const campo = h('textarea', { class: 'form-control', rows: 2, maxlength: 1000, required: true, placeholder: 'Escribe un mensaje…', 'aria-label': 'Mensaje' });
		const form = h('form', { class: 'd-flex align-items-end gap-2', onsubmit: async (e) => {
			e.preventDefault();
			const texto = campo.value.trim();
			if (!texto) return;
			if (V.tieneContacto(texto)) return toast('Aquí no se comparten teléfonos, correos ni enlaces. El contacto se entrega al confirmar la reserva.', 'warning');
			try {
				await addDoc(mensajes, { de: yo, texto, createdAt: serverTimestamp() });
				campo.value = '';
				await cargar();
			} catch (err) { showError(err); }
		} }, campo, iconoBtn('icon-paper-plane', 'Enviar', { type: 'submit' }));
		modal({ title: `Chat · ${l.reserva.codigo}`, body: h('div', {}, lista, form) });
		await cargar();
	}
	const reservaDe = (l) => reservas.find((x) => x.id === l.solicitud?.reservaId);
	const porCobrar = (l) => { const x = reservaDe(l); return estado(l) === 'confirmada' && x?.comision?.monto > 0 && !x.comision.pagada; };
	const orden = (l) => (l.reserva.codigo === codigo ? 0 : estado(l) === 'pendiente' ? 1 : 2);
	const alerta = (l) => alertaDe(l, reservaDe(l), casas.find((p) => p.id === l.propertyId));
	const leads = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l) => l.reserva?.llegada)
		.sort((a, b) => orden(a) - orden(b) || ms(b.createdAt) - ms(a.createdAt));

	// Precio neto del socio de cada casa: con eso se saca su parte y la comisión.
	const netos = Object.fromEntries(await Promise.all([...new Set(leads.map((l) => l.propertyId))].map(async (id) =>
		[id, (await getDoc(doc(db, 'properties', id, 'privado', 'socio')).catch(() => null))?.data() || null])));
	const cuenta = (l) => {
		const s = netos[l.propertyId];
		return s && V.gananciaEstancia({ llegada: l.reserva.llegada, salida: l.reserva.salida, margen: s.margen, planSocio: { base: s.precioBase, finde: s.precioFinde, tarifas: s.tarifas || [] } });
	};
	const recargar = () => { container.replaceChildren(); return render(container, [codigo]); };
	const hacer = async (tarea) => { try { await tarea(); await recargar(); } catch (err) { showError(err); } };

	async function confirmar(l) {
		const r = l.reserva;
		const c = cuenta(l);
		if (!c) return toast('A esta casa le falta el precio del socio.', 'warning');
		if (!(await confirmDialog(`${r.codigo}: las fechas ${fechas(r)} quedan ocupadas en la web y la comisión de ${money(c.ganancia, r.moneda)} se paga el día de llegada.`, { okText: 'Confirmar reserva', danger: false }))) return;
		await hacer(async () => {
			const refCasa = doc(db, 'properties', l.propertyId);
			const p = (await getDoc(refCasa)).data();
			const ocupadas = p.vacacional?.reservadas || [];
			if (choca(ocupadas, r)) return toast('Esas fechas ya tienen otra reserva confirmada.', 'warning');
			const refReserva = doc(collection(db, 'reservas'));
			const lote = writeBatch(db);
			lote.set(refReserva, {
				propertyId: l.propertyId, propertyTitulo: l.propertyTitulo || p.titulo || '', agentId: p.agentId || '', propietarioId: p.propietarioId || '',
				moneda: r.moneda || 'USD', llegada: r.llegada, salida: r.salida, noches: c.noches, huesped: l.nombre, telefono: l.telefono,
				canal: 'web', estado: 'confirmada', leadId: l.id, codigo: r.codigo, costoSocio: c.costoSocio, alojamiento: c.alojamiento, ganancia: c.ganancia,
				comision: { monto: c.ganancia, vence: r.llegada, pagada: false }, pagadoSocio: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
			});
			lote.update(refCasa, { 'vacacional.reservadas': V.unirRangos([...ocupadas, { desde: r.llegada, hasta: r.salida }]), updatedAt: serverTimestamp() });
			lote.update(doc(db, 'leads', l.id), respuesta('confirmada', 'Confirmó', { 'solicitud.reservaId': refReserva.id, 'solicitud.costoSocio': c.costoSocio, 'solicitud.comision': c.ganancia }));
			if (refChat(l)) lote.update(refChat(l), { estado: 'confirmada' });
			await lote.commit();
			await markPending(`${p.titulo}: reserva ${r.codigo} confirmada`);
			toast('Reserva confirmada.');
		});
	}

	// El socio sube la foto de su transferencia o depósito.
	function subirComprobante(res) {
		const archivo = h('input', { type: 'file', accept: 'image/*', onchange: () => archivo.files[0] && hacer(async () => {
			const { url } = await uploadImage(archivo.files[0], `comprobantes/${res.id}`);
			await updateDoc(doc(db, 'reservas', res.id), { 'comision.comprobante': url, updatedAt: serverTimestamp() });
			toast('Comprobante enviado.');
		}) });
		archivo.click();
	}

	async function pagada(l, res, nivel) {
		if (!(await confirmDialog(`${l.reserva.codigo}: ¿ya recibiste la comisión de ${money(res.comision.monto, res.moneda)}?`, { okText: 'Marcar pagada', danger: false }))) return;
		await hacer(async () => {
			await updateDoc(doc(db, 'reservas', res.id), { 'comision.pagada': true, 'comision.pagadaEl': new Date().toISOString(), updatedAt: serverTimestamp() });
			// Sus casas estaban fuera del sitio: vuelven al publicar.
			if (nivel === 3) await markPending(`${l.propertyTitulo}: comisión pagada, las casas del socio vuelven al sitio`);
			toast('Comisión pagada.');
		});
	}

	async function noSeDio(l) {
		const motivo = await pedirMotivo(`¿Por qué no se dio ${l.reserva.codigo}?`, MOTIVOS_NO);
		if (motivo) await hacer(async () => {
			const lote = writeBatch(db);
			lote.update(doc(db, 'leads', l.id), respuesta('no', 'No se dio', { 'solicitud.motivo': motivo }));
			if (refChat(l)) lote.update(refChat(l), { estado: 'no' });
			await lote.commit();
		});
	}

	async function cancelar(l) {
		const r = l.reserva;
		const motivo = await pedirMotivo(`¿Por qué se cancela ${r.codigo}?`, MOTIVOS_CANCELAR);
		if (!motivo) return;
		await hacer(async () => {
			const refCasa = doc(db, 'properties', l.propertyId);
			const p = (await getDoc(refCasa)).data();
			const lote = writeBatch(db);
			lote.update(doc(db, 'reservas', l.solicitud.reservaId), { estado: 'cancelada', motivo, updatedAt: serverTimestamp() });
			lote.update(refCasa, { 'vacacional.reservadas': V.liberarNoches(p.vacacional?.reservadas, r.llegada, r.salida), updatedAt: serverTimestamp() });
			lote.update(doc(db, 'leads', l.id), respuesta('cancelada', 'Canceló', { 'solicitud.motivo': motivo }));
			if (refChat(l)) lote.update(refChat(l), { estado: 'cancelada' });
			await lote.commit();
			await markPending(`${p.titulo}: reserva ${r.codigo} cancelada`);
			toast('Reserva cancelada. Las fechas quedaron libres.');
		});
	}

	function tarjeta(l) {
		const r = l.reserva;
		const sol = l.solicitud || {};
		const est = estado(l);
		const c = sol.comision != null ? { costoSocio: sol.costoSocio, ganancia: sol.comision } : cuenta(l);
		const aviso = alerta(l);
		const tarde = aviso === 'tarde';
		const ultimo = sol.historial?.at(-1);
		const evasion = aviso === 'bloqueada';
		const wa = (mensaje) => iconoBtn('icon-whatsapp', `WhatsApp a ${l.nombre}`, { href: whatsappUrl(l.telefono, mensaje), target: '_blank', rel: 'noopener' });
		const res = est === 'confirmada' ? reservaDe(l) : null;
		const com = res?.comision?.monto > 0 ? res.comision : null;
		const nivel = com ? V.nivelComision(res, Date.now()) : 0;
		const icono = (i) => h('span', { class: `icon-${i} me-1`, 'aria-hidden': 'true' });
		const boton = (texto, clase, onclick, i) => h('button', { type: 'button', class: `cot-btn btn btn-sm ${clase}`, onclick }, icono(i), texto);
		return h('div', { class: `card mb-2${r.codigo === codigo ? ' border-primary' : tarde ? ' border-warning' : ''}` }, h('div', { class: 'card-body' },
			h('div', { class: 'd-flex flex-wrap align-items-center gap-2' },
				h('strong', {}, r.codigo), h('span', {}, admin ? l.nombre : String(l.nombre || '').trim().split(/\s+/)[0]), badge(...ESTADOS[est]),
				evasion ? badge('Revisar: fechas bloqueadas', 'danger') : null,
				porResponder.has(r.codigo) ? badge('Mensaje sin responder', 'info') : null,
				h('span', { class: `ms-auto small ${tarde ? 'text-danger' : 'text-muted'}` }, hace(ms(l.createdAt)))),
			h('div', { class: 'small text-muted' }, [l.propertyTitulo, admin && propietarios.find((p) => p.id === l.propietarioId)?.nombre].filter(Boolean).join(' · ')),
			h('div', {}, `${fechas(r)} · ${nNoches(r.noches)} · ${r.huespedes} ${r.huespedes === 1 ? 'persona' : 'personas'}`),
			h('div', { class: 'small' }, `Cliente paga ${money(r.total, r.moneda)}`,
				c ? ` · ${admin ? 'Socio' : 'Tu parte'} ${money(c.costoSocio, r.moneda)} · ${admin ? 'Comisión' : 'Comisión a pagar a EQ'} ${money(c.ganancia, r.moneda)}` : ''),
			com ? h('div', { class: 'small d-flex flex-wrap align-items-center gap-2' }, h('span', {}, icono('money'), `Comisión: se paga el ${dia(com.vence)}`),
				com.pagada ? badge('Pagada', 'success') : [badge(...ATRASO[nivel]), com.comprobante ? badge('Comprobante enviado', 'info') : null]) : null,
			ultimo ? h('div', { class: 'small text-muted' }, `${ultimo.que} ${ultimo.nombre} · ${formatDate(ultimo.cuando)}${sol.motivo ? ` · ${sol.motivo}` : ''}`) : null,
			h('div', { class: 'd-flex flex-wrap align-items-center gap-2 mt-2' },
				// Con el cliente solo habla el equipo por WhatsApp; el socio le escribe por el chat.
				!admin ? null : est === 'no'
					? wa(`Hola ${l.nombre}, te escribimos de EQ Inmobiliario. ¿Pudiste reservar ${l.propertyTitulo} para ${fechas(r)}?`)
					: wa(`Hola ${l.nombre}, te escribo por tu solicitud ${r.codigo} de ${l.propertyTitulo} (${fechas(r)}).`),
				chats[r.codigo] ? iconoBtn('icon-comments', 'Chat con el cliente', { onclick: () => abrirChat(l) }) : null,
				est === 'pendiente' ? [boton('Confirmada', 'btn-primary', () => confirmar(l), 'check'), boton('No se dio', 'btn-outline-secondary', () => noSeDio(l), 'close')] : null,
				com?.comprobante ? iconoBtn('icon-file-image-o', 'Ver comprobante de la comisión', { href: com.comprobante, target: '_blank', rel: 'noopener' }) : null,
				com && !com.pagada && !admin ? iconoBtn('icon-upload', com.comprobante ? 'Cambiar comprobante' : 'Subir comprobante de la comisión', { onclick: () => subirComprobante(res) }) : null,
				com && !com.pagada && session.isAdmin ? boton('Pagada', 'btn-success', () => pagada(l, res, nivel), 'money') : null,
				est === 'confirmada' && r.salida > hoy() ? boton('Cancelar', 'btn-outline-danger', () => cancelar(l), 'ban') : null)));
	}

	const lista = h('div', {});
	const filtro = { socio: '', estado: '' };
	const pintar = () => {
		const ver = leads.filter((l) => (!filtro.socio || l.propietarioId === filtro.socio) && (!filtro.estado || (filtro.estado === 'cobrar' ? porCobrar(l) : filtro.estado === 'alerta' ? alerta(l) : estado(l) === filtro.estado)));
		lista.replaceChildren(ver.length ? ver.map(tarjeta) : emptyState('No hay solicitudes.'));
	};
	pintar();

	const numero = (icono, valor, texto) => h('div', { class: 'col-4' }, statCard(icono, texto, valor));
	const elegir = (campo, titulo, opciones) => h('select', {
		class: 'form-select form-select-sm w-auto', 'aria-label': titulo, onchange: (e) => { filtro[campo] = e.target.value; pintar(); }
	}, h('option', { value: '' }, titulo), opciones.map(([v, t]) => h('option', { value: v }, t)));
	const total = {};
	reservas.filter((r) => r.estado === 'confirmada' && r.comision && !r.comision.pagada)
		.forEach((r) => { total[r.moneda] = (total[r.moneda] || 0) + r.comision.monto; });
	// Aviso al socio: lo que ya le pasa por tener una comisión atrasada.
	const peor = admin ? 0 : Math.max(0, ...reservas.map((r) => V.nivelComision(r, Date.now())));
	const conSolicitud = propietarios.filter((p) => leads.some((l) => l.propietarioId === p.id));

	mount(container,
		pageHeader('Solicitudes'),
		admin ? [
			h('div', { class: 'row g-2 mb-3' },
				numero('icon-clock-o', leads.filter((l) => estado(l) === 'pendiente').length, 'Sin responder'),
				numero('icon-check', leads.filter((l) => estado(l) === 'confirmada' && l.solicitud.historial?.at(-1)?.cuando.startsWith(hoy().slice(0, 7))).length, 'Confirmadas'),
				numero('icon-money', Object.entries(total).map(([m, n]) => money(V.r2(n), m)).join(' · ') || '—', 'Por cobrar')),
			h('div', { class: 'd-flex flex-wrap gap-2 mb-3' },
				elegir('socio', 'Todos los socios', conSolicitud.map((p) => [p.id, p.nombre])),
				elegir('estado', 'Todos los estados', [...Object.entries(ESTADOS).map(([v, [t]]) => [v, t]), ['cobrar', 'Comisión por cobrar'], ['alerta', 'Con alerta']]))
		] : peor >= 2 ? h('div', { class: 'alert alert-danger d-flex gap-2', role: 'alert' }, h('span', { class: 'icon-exclamation-triangle mt-1', 'aria-hidden': 'true' }), peor === 3
			? 'Tienes una comisión con más de 72 horas de atraso: tus casas salieron del sitio. Vuelven cuando EQ la marque pagada.'
			: 'Tienes una comisión con más de 24 horas de atraso: los clientes de tus casas le escriben a EQ hasta que se marque pagada.') : null,
		lista);
}

// Tarjeta de Inicio (solo el administrador): solicitudes con alerta, cada una con enlace directo.
export async function tarjetaAlertas(leads, casas) {
	const reservas = await loadReservas();
	const lista = leads.filter((l) => l.reserva?.llegada).map((l) => [l, alertaDe(l, reservas.find((x) => x.id === l.solicitud?.reservaId), casas.find((p) => p.id === l.propertyId))]).filter(([, a]) => a);
	if (!lista.length) return null;
	return h('section', { class: 'card mb-4 tarjeta-pendientes', 'aria-labelledby': 'alertas-titulo' },
		h('div', { class: 'card-header tarjeta-pendientes-cab' },
			h('span', { class: 'tarjeta-pendientes-icono icon-bell', 'aria-hidden': 'true' }),
			h('div', { class: 'me-auto' },
				h('h2', { class: 'tarjeta-pendientes-titulo', id: 'alertas-titulo' }, 'Alertas de reservas'),
				h('div', { class: 'tarjeta-pendientes-ayuda' }, 'Solicitudes que necesitan que las revises.')),
			h('span', { class: 'nav-aviso' }, String(lista.length))),
		h('ul', { class: 'pendientes-filas' }, lista.slice(0, 5).map(([l, a]) => h('li', {},
			h('a', { href: `#/solicitudes/${encodeURIComponent(l.reserva.codigo)}`, class: 'pendientes-fila' },
				h('span', { class: 'pendientes-fila-texto' },
					h('span', { class: 'pendientes-fila-nombre' }, `${l.reserva.codigo} · ${l.propertyTitulo || l.nombre}`),
					h('span', { class: 'pendientes-fila-falta' }, a === 'tarde' ? `${ALERTAS[a]} · ${hace(ms(l.createdAt))}` : ALERTAS[a])),
				h('span', { class: 'pendientes-fila-flecha icon-angle-right', 'aria-hidden': 'true' }))))),
		lista.length > 5 ? h('a', { href: '#/solicitudes', class: 'pendientes-mas' }, `Ver ${lista.length - 5} más`, h('span', { class: 'icon-angle-right', 'aria-hidden': 'true' })) : null);
}
