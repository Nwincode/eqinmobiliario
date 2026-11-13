// Rentas vacacionales: reservas de cada casa y estado de cuenta de cada propietario.
// Una reserva confirmada bloquea sus fechas en el calendario público de la casa.
import '/js/calc-vacacional.js';
import { db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, orderBy, limit, serverTimestamp } from '../firebase.js';
import { h, statCard, toast, showError, confirmDialog, pageHeader, emptyState, mount, badge, modal, cajaTabla, iconoBtn, hoy, dia, formatDate, spinner } from '../ui.js';
import { session } from '../session.js';
import { whatsappUrl, nNoches } from '../formato.js';
import { loadPropietarios, loadPropiedades, loadReservas, money } from '../crm.js';

const V = window.EQVacacional;
const CANALES = [['directo', 'Directo'], ['web', 'Página web'], ['airbnb', 'Airbnb'], ['booking', 'Booking'], ['otro', 'Otro']];
const ESTADOS = [['confirmada', 'Confirmada', 'success'], ['pendiente', 'Pendiente', 'warning'], ['cancelada', 'Cancelada', 'light']];
const etiqueta = (lista, v) => (lista.find(([k]) => k === v) || lista[0])[1];
const estadoBadge = (r) => { const e = ESTADOS.find(([k]) => k === r.estado) || ESTADOS[1]; return badge(e[1], e[2]); };
const SIN_DUENO = 'Sin propietario asignado';

// El mes "2026-11" → "noviembre de 2026".
const nombreMes = (mes) => new Date(`${mes}-15T12:00:00`).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// En celular solo quedan las columnas que importan; el resto aparece desde tableta.
const ANCHO = ' d-none d-md-table-cell';
const moverMes = (mes, n) => { const d = new Date(`${mes}-15T12:00:00`); d.setMonth(d.getMonth() + n); return d.toLocaleDateString('en-CA').slice(0, 7); };
const diasDelMes = (mes) => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0).getDate();

// Suma de dinero por moneda en un solo texto: "$ 1,200 · Q 3,000".
const dinero = (porMoneda, campo) => Object.entries(porMoneda).filter(([, m]) => m[campo]).map(([mon, m]) => money(m[campo], mon)).join(' · ') || '—';

export async function render(container) {
	const [reservas, todas, propietarios] = await Promise.all([loadReservas(), loadPropiedades(), loadPropietarios()]);
	const casas = todas.filter((p) => p.operacion === 'vacacional').sort((a, b) => String(a.titulo).localeCompare(String(b.titulo)));
	const casaDe = Object.fromEntries(casas.map((p) => [p.id, p]));
	const duenoDe = (pid) => propietarios.find((o) => (o.propiedades || []).some((x) => x.propertyId === pid));
	const estado = { mes: hoy().slice(0, 7), dueno: null }; // dueno: null = todos
	const cuerpo = h('div');

	const volver = async () => { container.replaceChildren(); await render(container); };

	// ------------------------------------------------------------ Editor de una reserva
	function editar(r = {}) {
		const d = { canal: 'directo', estado: 'confirmada', ...r };
		const campo = (label, input, cols = 6) => h('div', { class: `col-${cols === 12 ? 12 : 6} col-md-${cols}` }, h('label', { class: 'form-label small mb-1 d-block' }, label, input));
		const input = (name, type = 'text', extra = {}) => h('input', { class: 'form-control', name, type, value: d[name] ?? '', ...extra });
		const select = (name, opciones) => h('select', { class: 'form-select', name },
			opciones.map(([v, t]) => h('option', { value: v, selected: String(d[name] ?? '') === v }, t)));
		const resumen = h('div', { class: 'col-12 small text-muted' });
		const form = h('form', { class: 'row g-2' },
			campo('Casa', select('propertyId', [['', 'Elegí la casa…'], ...casas.map((p) => [p.id, p.titulo])]), 12),
			campo('Llegada', input('llegada', 'date', { required: true })),
			campo('Salida', input('salida', 'date', { required: true })),
			campo('Huésped', input('huesped')),
			campo('Teléfono', input('telefono', 'tel')),
			campo('Canal', select('canal', CANALES)),
			campo('Estado', select('estado', ESTADOS)),
			campo('Pago al propietario', input('costoSocio', 'number', { min: 0, step: 'any' })),
			campo('Cobrado al huésped (sin impuestos)', input('alojamiento', 'number', { min: 0, step: 'any' })),
			resumen,
			h('div', { class: 'col-12' }, h('label', { class: 'form-check' },
				h('input', { class: 'form-check-input', type: 'checkbox', name: 'pagadoSocio', checked: Boolean(d.pagadoSocio) }),
				h('span', { class: 'form-check-label' }, 'Ya se le pagó al propietario'))),
			campo('Notas', h('textarea', { class: 'form-control', name: 'notas', rows: 2 }, d.notas || ''), 12));
		const f = form.elements;
		const leer = () => ({
			propertyId: f.propertyId.value, llegada: f.llegada.value, salida: f.salida.value,
			costoSocio: Number(f.costoSocio.value) || 0, alojamiento: Number(f.alojamiento.value) || 0
		});
		const pintar = () => {
			const v = leer();
			const casa = casaDe[v.propertyId];
			const noches = V.esFecha(v.llegada) && V.esFecha(v.salida) ? V.nochesEntre(v.llegada, v.salida) : 0;
			resumen.textContent = casa && noches > 0
				? `${nNoches(noches)} · Propietario: ${duenoDe(casa.id)?.nombre || SIN_DUENO} · Ganancia: ${money(v.alojamiento - v.costoSocio, casa.moneda)}`
				: '';
		};
		// Los montos salen de la tarifa privada de la casa; se pueden corregir a mano.
		const sugerir = async () => {
			const v = leer();
			if (!v.propertyId || !V.esFecha(v.llegada) || !V.esFecha(v.salida) || v.salida <= v.llegada) return pintar();
			const s = (await getDoc(doc(db, 'properties', v.propertyId, 'privado', 'socio')).catch(() => null))?.data();
			if (s?.precioBase) {
				const g = V.gananciaEstancia({ llegada: v.llegada, salida: v.salida, margen: s.margen, planSocio: { base: s.precioBase, finde: s.precioFinde, tarifas: s.tarifas || [] } });
				f.costoSocio.value = g.costoSocio;
				f.alojamiento.value = g.alojamiento;
			}
			pintar();
		};
		for (const n of ['propertyId', 'llegada', 'salida']) f[n].addEventListener('change', sugerir);
		form.addEventListener('input', pintar);
		if (d.id || d.costoSocio) pintar(); else sugerir();

		const guardar = async () => {
			const v = leer();
			const casa = casaDe[v.propertyId];
			if (!casa) return toast('Elegí la casa.', 'warning');
			if (!V.esFecha(v.llegada) || !V.esFecha(v.salida) || v.salida <= v.llegada) return toast('La salida debe ser después de la llegada.', 'warning');
			const nueva = {
				...v, id: d.id || doc(collection(db, 'reservas')).id,
				propertyTitulo: casa.titulo, agentId: casa.agentId || session.agentId || '', moneda: casa.moneda || 'USD',
				noches: V.nochesEntre(v.llegada, v.salida), ganancia: V.r2(v.alojamiento - v.costoSocio),
				huesped: f.huesped.value.trim(), telefono: f.telefono.value.trim(), canal: f.canal.value, estado: f.estado.value,
				pagadoSocio: f.pagadoSocio.checked, pagadoFecha: f.pagadoSocio.checked ? (d.pagadoFecha || hoy()) : '',
				notas: f.notas.value.trim(), leadId: d.leadId || '', codigo: d.codigo || ''
			};
			const choque = nueva.estado === 'confirmada' && V.choquesReserva(nueva, reservas)[0];
			if (choque) return toast(`Esas fechas chocan con otra reserva: ${dia(choque.llegada)} – ${dia(choque.salida)}${choque.huesped ? ` (${choque.huesped})` : ''}.`, 'danger');
			try {
				const { id, ...datos } = nueva;
				await setDoc(doc(db, 'reservas', id), { ...datos, updatedAt: serverTimestamp(), ...(d.id ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
				await bloquear([...reservas.filter((x) => x.id !== id), nueva], [nueva.propertyId, d.propertyId]);
				m.close();
				toast('Reserva guardada.');
				await volver();
			} catch (e) { showError(e); }
		};
		const borrar = async () => {
			if (!await confirmDialog('¿Borrar esta reserva? Sus fechas vuelven a quedar libres.', { okText: 'Borrar' })) return;
			try {
				await deleteDoc(doc(db, 'reservas', d.id));
				await bloquear(reservas.filter((x) => x.id !== d.id), [d.propertyId]);
				m.close();
				await volver();
			} catch (e) { showError(e); }
		};
		const m = modal({
			title: d.id ? 'Reserva' : 'Nueva reserva', body: form,
			footer: [
				d.id ? iconoBtn('icon-trash', 'Borrar reserva', { onclick: borrar, class: 'cot-btn cot-btn-icono btn btn-sm btn-outline-danger me-auto' }) : null,
				h('button', { type: 'button', class: 'btn btn-primary', onclick: guardar }, 'Guardar')
			]
		});
	}

	// Las fechas confirmadas de cada casa tocada se copian a la propiedad (calendario público).
	const bloquear = (lista, ids) => Promise.all([...new Set(ids.filter(Boolean))].map((pid) =>
		updateDoc(doc(db, 'properties', pid), { 'vacacional.reservadas': V.rangosReservados(lista, pid) })));

	const pagar = async (lista) => {
		await Promise.all(lista.map((r) => updateDoc(doc(db, 'reservas', r.id), { pagadoSocio: true, pagadoFecha: hoy(), updatedAt: serverTimestamp() })));
		toast(lista.length === 1 ? 'Pago registrado.' : `${lista.length} pagos registrados.`);
		await volver();
	};

	// Estado de cuenta listo para mandarlo por WhatsApp al propietario.
	const mensajeCuenta = (nombre, lista, res) => [
		`Hola ${nombre.split(' ')[0]}, este es el estado de cuenta de ${nombreMes(estado.mes)}:`, '',
		...lista.map((r) => `• ${r.propertyTitulo}: ${dia(r.llegada)} – ${dia(r.salida)} (${nNoches(r.noches)}) · ${money(r.costoSocio, r.moneda)}${r.pagadoSocio ? ' ✓ pagado' : ''}`), '',
		`Por pagar: ${dinero(res.porMoneda, 'porPagar')}`, `Pagado: ${dinero(res.porMoneda, 'pagado')}`
	].join('\n');

	// ------------------------------------------------------------ Pantalla del mes
	function pintar() {
		const delMes = reservas.filter((r) => String(r.llegada).startsWith(estado.mes)).sort((a, b) => a.llegada.localeCompare(b.llegada));
		const confirmadas = delMes.filter((r) => r.estado === 'confirmada');
		const total = V.resumenReservas(delMes);

		// Un renglón por propietario, aunque no tenga reservas este mes.
		const grupos = new Map();
		for (const c of casas) {
			const o = duenoDe(c.id);
			const g = grupos.get(o?.id || '') || { id: o?.id || '', nombre: o?.nombre || SIN_DUENO, telefono: o?.telefono, casas: 0, reservas: [] };
			g.casas++;
			grupos.set(g.id, g);
		}
		for (const r of confirmadas) grupos.get(duenoDe(r.propertyId)?.id || '')?.reservas.push(r);
		const filas = [...grupos.values()].sort((a, b) => b.reservas.length - a.reservas.length || a.nombre.localeCompare(b.nombre));

		const stat = (icono, label, value) => h('div', { class: 'col-6 col-lg-3' }, statCard(icono, label, value));

		const filtro = estado.dueno === null ? null : grupos.get(estado.dueno);
		const visibles = filtro ? delMes.filter((r) => (duenoDe(r.propertyId)?.id || '') === filtro.id) : delMes;

		cuerpo.replaceChildren(
			h('div', { class: 'd-flex align-items-center gap-2 mb-3' },
				h('button', { type: 'button', class: 'cot-btn cot-btn-icono btn btn-link text-body', 'aria-label': 'Mes anterior', onclick: () => { estado.mes = moverMes(estado.mes, -1); pintar(); } }, '‹'),
				h('strong', {}, mayuscula(nombreMes(estado.mes))),
				h('button', { type: 'button', class: 'cot-btn cot-btn-icono btn btn-link text-body', 'aria-label': 'Mes siguiente', onclick: () => { estado.mes = moverMes(estado.mes, 1); pintar(); } }, '›')),
			h('div', { class: 'row g-3 mb-4' },
				stat('icon-check', 'Reservas', total.reservas),
				stat('icon-moon-o', 'Noches', total.noches),
				stat('icon-handshake-o', 'Por pagar', dinero(total.porMoneda, 'porPagar')),
				stat('icon-money', 'Ganancia', dinero(total.porMoneda, 'ganancia'))),

			h('h2', { class: 'h6' }, 'Estado de cuenta por propietario'),
			h('div', { class: 'mb-4' }, cajaTabla(h('table', { class: 'table table-hover table-admin mb-0' },
				h('thead', {}, h('tr', {}, ['Propietario', 'Casas', 'Reservas', 'Noches', 'Ocupación', 'Por pagar', 'Pagado', ''].map((t, i) => h('th', { scope: 'col', class: (i ? 'text-end' : '') + (i && i !== 5 && i !== 7 ? ANCHO : '') }, t)))),
				h('tbody', {}, filas.map((g) => {
					const res = V.resumenReservas(g.reservas);
					const porPagar = g.reservas.filter((r) => !r.pagadoSocio);
					return h('tr', { class: filtro === g ? 'table-active' : '', role: 'button', onclick: () => { estado.dueno = filtro === g ? null : g.id; pintar(); } },
						h('td', {}, g.nombre),
						h('td', { class: 'text-end' + ANCHO }, String(g.casas)),
						h('td', { class: 'text-end' + ANCHO }, String(res.reservas)),
						h('td', { class: 'text-end' + ANCHO }, String(res.noches)),
						h('td', { class: 'text-end' + ANCHO }, `${Math.round(res.noches * 100 / (g.casas * diasDelMes(estado.mes)))} %`),
						h('td', { class: 'text-end fw-semibold' }, dinero(res.porMoneda, 'porPagar')),
						h('td', { class: 'text-end text-muted' + ANCHO }, dinero(res.porMoneda, 'pagado')),
						h('td', { class: 'text-end text-nowrap', onclick: (e) => e.stopPropagation() },
							g.telefono && g.reservas.length ? iconoBtn('icon-whatsapp', `Mandar estado de cuenta a ${g.nombre}`, { href: whatsappUrl(g.telefono, mensajeCuenta(g.nombre, g.reservas, res)), target: '_blank', rel: 'noopener' }) : null,
							porPagar.length ? iconoBtn('icon-check', `Marcar todo como pagado a ${g.nombre}`, {
								class: 'cot-btn cot-btn-icono btn btn-sm btn-outline-success ms-1',
								onclick: async () => {
									if (await confirmDialog(`¿Marcar como pagadas las ${porPagar.length} reservas de ${g.nombre} (${dinero(res.porMoneda, 'porPagar')})?`, { okText: 'Marcar pagado', danger: false })) pagar(porPagar).catch(showError);
								}
							}) : null));
				}))), { tarjeta: true })),

			h('h2', { class: 'h6' }, filtro ? `Reservas de ${filtro.nombre}` : 'Reservas del mes'),
			visibles.length ? cajaTabla(h('table', { class: 'table table-hover table-admin mb-0' },
				h('thead', {}, h('tr', {}, ['Fechas', 'Casa', 'Huésped', 'Canal', 'Estado', 'Al propietario', 'Ganancia'].map((t, i) => h('th', { scope: 'col', class: (i > 4 ? 'text-end' : '') + (i > 1 && i !== 5 ? ANCHO : '') }, t)))),
				h('tbody', {}, visibles.map((r) => h('tr', { role: 'button', onclick: () => editar(r) },
					h('td', { class: 'text-nowrap' }, `${dia(r.llegada)} – ${dia(r.salida)}`, h('div', { class: 'small text-muted' }, nNoches(r.noches))),
					h('td', { class: 'text-wrap' }, r.propertyTitulo, h('div', { class: 'small text-muted' }, duenoDe(r.propertyId)?.nombre || SIN_DUENO)),
					h('td', { class: ANCHO }, r.huesped || '—'),
					h('td', { class: ANCHO }, etiqueta(CANALES, r.canal)),
					h('td', { class: ANCHO }, estadoBadge(r)),
					h('td', { class: 'text-end' }, h('div', {}, money(r.costoSocio, r.moneda)),
						r.estado !== 'confirmada' ? h('span', { class: 'd-md-none' }, estadoBadge(r)) : r.pagadoSocio ? badge('Pagado', 'success') : badge('Por pagar', 'warning')),
					h('td', { class: 'text-end text-nowrap' + ANCHO }, money(r.ganancia, r.moneda)))))), { tarjeta: true })
				: emptyState(filtro ? 'Este propietario no tiene reservas este mes.' : 'Todavía no hay reservas este mes.'));
	}

	// Bitácora: los últimos cambios que los socios hicieron en sus casas (precios, días bloqueados, mínimos).
	async function verCambios() {
		const caja = h('div', {}, spinner());
		modal({ title: 'Cambios de los socios', body: caja });
		try {
			const porCasa = await Promise.all(casas.map(async (c) => (await getDocs(query(collection(db, 'properties', c.id, 'bitacora'), orderBy('cuando', 'desc'), limit(10))))
				.docs.map((d) => ({ casa: c.titulo, ...d.data() }))));
			const cambios = porCasa.flat().sort((a, b) => (b.cuando?.seconds || 0) - (a.cuando?.seconds || 0)).slice(0, 40);
			caja.replaceChildren(cambios.length ? h('ul', { class: 'list-group list-group-flush' }, cambios.map((b) => h('li', { class: 'list-group-item px-0' },
				h('div', {}, b.que),
				h('div', { class: 'small text-muted' }, [b.casa, b.nombre, formatDate(b.cuando)].filter(Boolean).join(' · ')))))
				: emptyState('Todavía ningún socio ha cambiado precios ni fechas.'));
		} catch (err) { caja.replaceChildren(); showError(err); }
	}

	mount(container,
		pageHeader('Rentas vacacionales', casas.length ? iconoBtn('icon-history', 'Cambios de los socios', { onclick: verCambios }) : null, h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => editar() }, '+ Reserva')),
		casas.length ? cuerpo : emptyState('Todavía no hay casas de renta vacacional. Creá una propiedad con operación "Renta vacacional" o importalas todas de un Excel.',
			h('a', { class: 'btn btn-outline-primary btn-sm', href: '#/propiedades/importar' }, 'Importar casas')));
	if (casas.length) pintar();
}
