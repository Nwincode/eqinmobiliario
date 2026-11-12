// Solicitudes de reserva que llegan de la web. El socio ve las de sus casas y las responde;
// el administrador ve todas, con lo que falta responder y la comisión por cobrar.
// Nada se borra: cada respuesta queda en el historial con quién y cuándo.
import '/js/calc-vacacional.js';
import { db, doc, getDoc, getDocs, updateDoc, collection, query, where, serverTimestamp, writeBatch, arrayUnion } from '../firebase.js';
import { h, mount, pageHeader, emptyState, toast, showError, modal, confirmDialog, badge, iconoBtn, formatDate, hoy, dia } from '../ui.js';
import { session, markPending } from '../session.js';
import { whatsappUrl } from '../formato.js';
import { money, ms, loadPropietarios, loadPropiedades, loadReservas } from '../crm.js';

const V = window.EQVacacional;
const PLAZO = 2 * 60 * 60 * 1000; // lo mismo que avisa el correo al administrador
const ESTADOS = { pendiente: ['Sin responder', 'warning'], confirmada: ['Confirmada', 'success'], no: ['No se dio', 'secondary'], cancelada: ['Cancelada', 'danger'] };
const MOTIVOS_NO = ['Cliente no respondió', 'Fechas no disponibles', 'Precio', 'Otro'];
const MOTIVOS_CANCELAR = ['Cliente canceló', 'Fechas ya no disponibles', 'Otro'];

const estado = (l) => l.solicitud?.estado || 'pendiente';
const fechas = (r) => `${dia(r.llegada)} – ${dia(r.salida)}`;
const choca = (rangos, r) => (rangos || []).some((x) => x.desde < r.salida && x.hasta > r.llegada);
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
	const [snap, propietarios, casas, reservas] = await Promise.all([
		getDocs(query(collection(db, 'leads'), admin ? where('reserva.codigo', '>', '') : where('propietarioId', '==', mio))),
		admin ? loadPropietarios() : [], admin ? loadPropiedades() : [], admin ? loadReservas() : []]);
	const orden = (l) => (l.reserva.codigo === codigo ? 0 : estado(l) === 'pendiente' ? 1 : 2);
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
			await lote.commit();
			await markPending(`${p.titulo}: reserva ${r.codigo} confirmada`);
			toast('Reserva confirmada.');
		});
	}

	async function noSeDio(l) {
		const motivo = await pedirMotivo(`¿Por qué no se dio ${l.reserva.codigo}?`, MOTIVOS_NO);
		if (motivo) await hacer(() => updateDoc(doc(db, 'leads', l.id), respuesta('no', 'No se dio', { 'solicitud.motivo': motivo })));
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
		const tarde = est === 'pendiente' && Date.now() - ms(l.createdAt) > PLAZO;
		const ultimo = sol.historial?.at(-1);
		const casa = casas.find((p) => p.id === l.propertyId);
		// Alerta: dijo que no se dio, pero esas fechas están bloqueadas en su calendario.
		const evasion = admin && est === 'no' && choca(casa?.vacacional?.bloqueos, r);
		const wa = (mensaje) => iconoBtn('icon-whatsapp', `WhatsApp a ${l.nombre}`, { href: whatsappUrl(l.telefono, mensaje), target: '_blank', rel: 'noopener' });
		const boton = (texto, clase, onclick) => h('button', { type: 'button', class: `cot-btn btn btn-sm ${clase}`, onclick }, texto);
		return h('div', { class: `card mb-2${r.codigo === codigo ? ' border-primary' : tarde ? ' border-warning' : ''}` }, h('div', { class: 'card-body' },
			h('div', { class: 'd-flex flex-wrap align-items-center gap-2' },
				h('strong', {}, r.codigo), h('span', {}, l.nombre), badge(...ESTADOS[est]),
				evasion ? badge('Revisar: fechas bloqueadas', 'danger') : null,
				h('span', { class: `ms-auto small ${tarde ? 'text-danger' : 'text-muted'}` }, hace(ms(l.createdAt)))),
			h('div', { class: 'small text-muted' }, [l.propertyTitulo, admin && propietarios.find((p) => p.id === l.propietarioId)?.nombre].filter(Boolean).join(' · ')),
			h('div', {}, `${fechas(r)} · ${r.noches} ${r.noches === 1 ? 'noche' : 'noches'} · ${r.huespedes} ${r.huespedes === 1 ? 'persona' : 'personas'}`),
			h('div', { class: 'small' }, `Cliente paga ${money(r.total, r.moneda)}`,
				c ? ` · ${admin ? 'Socio' : 'Tu parte'} ${money(c.costoSocio, r.moneda)} · Comisión ${money(c.ganancia, r.moneda)}` : ''),
			ultimo ? h('div', { class: 'small text-muted' }, `${ultimo.que} ${ultimo.nombre} · ${formatDate(ultimo.cuando)}${sol.motivo ? ` · ${sol.motivo}` : ''}`) : null,
			h('div', { class: 'd-flex flex-wrap align-items-center gap-2 mt-2' },
				est === 'no' && admin
					? wa(`Hola ${l.nombre}, te escribimos de EQ Inmobiliario. ¿Pudiste reservar ${l.propertyTitulo} para ${fechas(r)}?`)
					: wa(`Hola ${l.nombre}, te escribo por tu solicitud ${r.codigo} de ${l.propertyTitulo} (${fechas(r)}).`),
				est === 'pendiente' ? [boton('Confirmada', 'btn-primary', () => confirmar(l)), boton('No se dio', 'btn-outline-secondary', () => noSeDio(l))] : null,
				est === 'confirmada' && r.salida > hoy() ? boton('Cancelar', 'btn-outline-danger', () => cancelar(l)) : null)));
	}

	const lista = h('div', {});
	const filtro = { socio: '', estado: '' };
	const pintar = () => {
		const ver = leads.filter((l) => (!filtro.socio || l.propietarioId === filtro.socio) && (!filtro.estado || estado(l) === filtro.estado));
		lista.replaceChildren(ver.length ? ver.map(tarjeta) : emptyState('No hay solicitudes.'));
	};
	pintar();

	const numero = (valor, texto) => h('div', { class: 'col-4' }, h('div', { class: 'card stat-card h-100' }, h('div', { class: 'card-body' },
		h('div', { class: 'stat-value' }, valor), h('div', { class: 'stat-label' }, texto))));
	const elegir = (campo, titulo, opciones) => h('select', {
		class: 'form-select form-select-sm w-auto', 'aria-label': titulo, onchange: (e) => { filtro[campo] = e.target.value; pintar(); }
	}, h('option', { value: '' }, titulo), opciones.map(([v, t]) => h('option', { value: v }, t)));
	const porCobrar = {};
	reservas.filter((r) => r.estado === 'confirmada' && r.comision && !r.comision.pagada)
		.forEach((r) => { porCobrar[r.moneda] = (porCobrar[r.moneda] || 0) + r.comision.monto; });
	const conSolicitud = propietarios.filter((p) => leads.some((l) => l.propietarioId === p.id));

	mount(container,
		pageHeader('Solicitudes'),
		admin ? [
			h('div', { class: 'row g-2 mb-3' },
				numero(leads.filter((l) => estado(l) === 'pendiente').length, 'Sin responder'),
				numero(leads.filter((l) => estado(l) === 'confirmada' && l.solicitud.historial?.at(-1)?.cuando.startsWith(hoy().slice(0, 7))).length, 'Confirmadas del mes'),
				numero(Object.entries(porCobrar).map(([m, n]) => money(V.r2(n), m)).join(' · ') || '—', 'Comisión por cobrar')),
			h('div', { class: 'd-flex flex-wrap gap-2 mb-3' },
				elegir('socio', 'Todos los socios', conSolicitud.map((p) => [p.id, p.nombre])),
				elegir('estado', 'Todos los estados', Object.entries(ESTADOS).map(([v, [t]]) => [v, t])))
		] : null,
		lista);
}
