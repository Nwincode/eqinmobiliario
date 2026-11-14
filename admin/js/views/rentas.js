// Rentas vacacionales: reservas de cada casa y estado de cuenta de cada propietario.
// Una reserva confirmada bloquea sus fechas en el calendario público de la casa. Crear, editar, cancelar, borrar y
// marcar lo pagado pasan por admin/js/reservas.js (lo mismo que usa Solicitudes): la reserva la ve también su dueño.
import '/js/calc-vacacional.js';
import { db, doc, getDoc, getDocs, collection, query, orderBy, limit } from '../firebase.js';
import { h, statCard, toast, showError, confirmDialog, pageHeader, emptyState, mount, badge, modal, cajaTabla, iconoBtn, hoy, dia, formatDate, spinner, elegirOpcion } from '../ui.js';
import { campoTelefono } from '../form.js';
import { whatsappUrl, nNoches } from '../formato.js';
import { loadPropietarios, loadPropiedades, loadReservas, money } from '../crm.js';
import { duenoDe as duenoDeCasa } from '../duenos.js';
import { guardarReserva, borrarReserva, cancelarReserva, contactoDe, deSolicitud, pagadoAlPropietario, ponerAlDiaReservas, ChoqueDeFechas, MOTIVOS_CANCELAR } from '../reservas.js';

const V = window.EQVacacional;
const CANALES = [['directo', 'Directo'], ['web', 'Página web'], ['airbnb', 'Airbnb'], ['booking', 'Booking'], ['otro', 'Otro']];
const ESTADOS = [['confirmada', 'Confirmada', 'success'], ['pendiente', 'Pendiente', 'warning'], ['cancelada', 'Cancelada', 'light']];
const etiqueta = (lista, v) => (lista.find(([k]) => k === v) || lista[0])[1];
const estadoBadge = (r) => { const e = ESTADOS.find(([k]) => k === r.estado) || ESTADOS[1]; return badge(e[1], e[2]); };
// Un dato con su ícono delante; `titulo` lo nombra cuando el ícono solo no basta.
const dato = (icono, texto, cls = '', titulo) => h('span', { class: cls || null, title: titulo || null },
	h('span', { class: `${icono} text-muted me-1`, 'aria-hidden': 'true' }), titulo ? h('span', { class: 'visually-hidden' }, `${titulo}: `) : null, String(texto));
const SIN_DUENO = 'Sin propietario asignado';

// El mes "2026-11" → "noviembre de 2026".
const nombreMes = (mes) => new Date(`${mes}-15T12:00:00`).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const moverMes = (mes, n) => { const d = new Date(`${mes}-15T12:00:00`); d.setMonth(d.getMonth() + n); return d.toLocaleDateString('en-CA').slice(0, 7); };
const diasDelMes = (mes) => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0).getDate();

// Suma de dinero por moneda en un solo texto: "$ 1,200 · Q 3,000".
const dinero = (porMoneda, campo) => Object.entries(porMoneda).filter(([, m]) => m[campo]).map(([mon, m]) => money(m[campo], mon)).join(' · ') || '—';

export async function render(container) {
	let [reservas, todas, propietarios] = await Promise.all([loadReservas(), loadPropiedades(), loadPropietarios()]);
	const casas = todas.filter((p) => p.operacion === 'vacacional').sort((a, b) => String(a.titulo).localeCompare(String(b.titulo)));
	const casaDe = Object.fromEntries(casas.map((p) => [p.id, p]));
	// Reservas de antes (con teléfono o sin el dueño de su casa): se ponen al día una vez y se vuelven a leer.
	if (await ponerAlDiaReservas(reservas, casas).catch((err) => { console.warn('Reservas de antes sin poner al día', err); return 0; })) reservas = await loadReservas();
	// La misma regla en todo el sistema: el dueño es el que la casa dice tener (si no lo dice, el de la lista).
	const duenoDe = (pid) => duenoDeCasa(casaDe[pid] || { id: pid }, propietarios);
	// El dueño de una reserva es el que la ganó (su propietarioId; la casa pudo cambiar de dueño después). Una de antes
	// sin él, el de su casa. Si su ficha ya no existe, se muestra igual, aparte.
	const duenoDeReserva = (r) => (r.propietarioId ? propietarios.find((p) => p.id === r.propietarioId) || { id: r.propietarioId, nombre: 'Propietario que ya no está en Propietarios' } : duenoDe(r.propertyId));
	const estado = { mes: hoy().slice(0, 7), dueno: null }; // dueno: null = todos
	const cuerpo = h('div');

	const volver = async () => { container.replaceChildren(); await render(container); };

	// ------------------------------------------------------------ Editor de una reserva
	async function editar(r = {}) {
		// El teléfono y las notas no van en la reserva (la lee su dueño): se leen aparte.
		const contacto = r.id ? await contactoDe(r) : {};
		const d = { canal: 'directo', estado: 'confirmada', ...r, telefono: contacto.telefono || '', notas: contacto.notas || '' };
		const web = deSolicitud(d);
		const campo = (label, input, cols = 6) => h('div', { class: `col-${cols === 12 ? 12 : 6} col-md-${cols}` }, h('label', { class: 'form-label small mb-1 d-block' }, label, input));
		const input = (name, type = 'text', extra = {}) => h('input', { class: 'form-control', name, type, value: d[name] ?? '', ...extra });
		const select = (name, opciones) => h('select', { class: 'form-select', name },
			opciones.map(([v, t]) => h('option', { value: v, selected: String(d[name] ?? '') === v }, t)));
		const resumen = h('div', { class: 'col-12 small text-muted' });
		const telefono = campoTelefono(d.telefono);
		const form = h('form', { class: 'row g-2' },
			campo('Casa', select('propertyId', [['', 'Elegí la casa…'], ...casas.map((p) => [p.id, p.titulo])]), 12),
			campo('Llegada', input('llegada', 'date', { required: true })),
			campo('Salida', input('salida', 'date', { required: true })),
			campo('Huésped', input('huesped')),
			campo('Teléfono', telefono),
			campo('Canal', select('canal', CANALES)),
			// Una reserva de la web se cancela con su botón (avisa al cliente en su chat).
			campo('Estado', web ? h('select', { class: 'form-select', name: 'estado', disabled: true }, h('option', { value: d.estado }, etiqueta(ESTADOS, d.estado))) : select('estado', ESTADOS)),
			campo('Pago al propietario', input('costoSocio', 'number', { min: 0, step: 'any' })),
			campo('Cobrado al huésped (sin impuestos)', input('alojamiento', 'number', { min: 0, step: 'any' })),
			resumen,
			h('div', { class: 'col-12' }, h('label', { class: 'form-check' },
				h('input', { class: 'form-check-input', type: 'checkbox', name: 'pagadoSocio', checked: Boolean(d.pagadoSocio) }),
				h('span', { class: 'form-check-label' }, 'Ya se le pagó al propietario'))),
			campo('Notas', h('textarea', { class: 'form-control', name: 'notas', rows: 2 }, d.notas || ''), 12));
		const f = form.elements;
		// Una reserva de la web conserva la casa y las fechas de su solicitud (para cambiarlas: cancelar y hacer otra).
		if (web) for (const n of ['propertyId', 'llegada', 'salida']) f[n].disabled = true;
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

		// El botón queda apagado mientras guarda: dos toques no crean dos reservas.
		const guardar = async (btn) => {
			const v = leer();
			const casa = casaDe[v.propertyId];
			if (!casa) return toast('Elegí la casa.', 'warning');
			if (!V.esFecha(v.llegada) || !V.esFecha(v.salida) || v.salida <= v.llegada) return toast('La salida debe ser después de la llegada.', 'warning');
			btn.disabled = true;
			try {
				await guardarReserva(r.id ? r : null, casa, {
					...v, huesped: f.huesped.value.trim(), canal: f.canal.value, estado: f.estado.value, pagadoSocio: f.pagadoSocio.checked
				}, { telefono: telefono.valor(), notas: f.notas.value.trim() });
				m.close();
				toast('Reserva guardada.');
				await volver();
			} catch (e) { if (e instanceof ChoqueDeFechas) toast(e.message, 'danger'); else showError(e); }
			finally { btn.disabled = false; }
		};
		// Hecha a mano: se borra y sus fechas quedan libres. De la web: se cancela, con motivo, y el cliente lo ve en su chat.
		const borrar = async () => {
			if (!await confirmDialog('¿Borrar esta reserva? Sus fechas vuelven a quedar libres.', { okText: 'Borrar' })) return;
			try { await borrarReserva(r); m.close(); await volver(); } catch (e) { showError(e); }
		};
		const cancelar = async () => {
			const motivo = await elegirOpcion('¿Por qué se cancela?', MOTIVOS_CANCELAR);
			if (!motivo) return;
			try { const avisado = await cancelarReserva(r, motivo); m.close(); toast(`Reserva cancelada. Las fechas quedaron libres${avisado ? ' y el cliente lo ve en su chat' : ''}.`); await volver(); } catch (e) { showError(e); }
		};
		const m = modal({
			title: d.id ? 'Reserva' : 'Nueva reserva', body: form,
			footer: [
				!d.id ? null : !web ? iconoBtn('icon-trash', 'Borrar reserva', { onclick: borrar, class: 'cot-btn cot-btn-icono btn btn-sm btn-outline-danger me-auto' })
					: d.estado === 'confirmada' ? iconoBtn('icon-ban', 'Cancelar reserva', { onclick: cancelar, class: 'cot-btn cot-btn-icono btn btn-sm btn-outline-danger me-auto' }) : null,
				h('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => guardar(e.currentTarget) }, 'Guardar')
			]
		});
	}

	const pagar = async (lista) => {
		await pagadoAlPropietario(lista);
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

		// Un renglón por propietario, aunque no tenga reservas este mes: los dueños de hoy de cada casa y quien ganó
		// cada reserva (aunque la casa ya sea de otro).
		const grupos = new Map();
		const grupo = (o) => {
			const id = o?.id || '';
			if (!grupos.has(id)) grupos.set(id, { id, nombre: o?.nombre || SIN_DUENO, telefono: o?.telefono, casas: 0, reservas: [] });
			return grupos.get(id);
		};
		for (const c of casas) grupo(duenoDe(c.id)).casas++;
		for (const r of confirmadas) grupo(duenoDeReserva(r)).reservas.push(r);
		const filas = [...grupos.values()].sort((a, b) => b.reservas.length - a.reservas.length || a.nombre.localeCompare(b.nombre));

		const stat = (icono, label, value) => h('div', { class: 'col-6 col-lg-3' }, statCard(icono, label, value));

		const filtro = estado.dueno === null ? null : grupos.get(estado.dueno);
		const visibles = filtro ? delMes.filter((r) => (duenoDeReserva(r)?.id || '') === filtro.id) : delMes;

		cuerpo.replaceChildren(
			h('div', { class: 'd-flex align-items-center gap-2 mb-3' },
				h('button', { type: 'button', class: 'cot-btn cot-btn-icono btn btn-link text-body text-decoration-none fs-5', 'aria-label': 'Mes anterior', onclick: () => { estado.mes = moverMes(estado.mes, -1); pintar(); } }, '‹'),
				h('strong', {}, mayuscula(nombreMes(estado.mes))),
				h('button', { type: 'button', class: 'cot-btn cot-btn-icono btn btn-link text-body text-decoration-none fs-5', 'aria-label': 'Mes siguiente', onclick: () => { estado.mes = moverMes(estado.mes, 1); pintar(); } }, '›')),
			h('div', { class: 'row g-3 mb-4' },
				stat('icon-check', 'Reservas', total.reservas),
				stat('icon-moon-o', 'Noches', total.noches),
				stat('icon-handshake-o', 'Por pagar', dinero(total.porMoneda, 'porPagar')),
				stat('icon-money', 'Ganancia', dinero(total.porMoneda, 'ganancia'))),

			h('h2', { class: 'h6' }, 'Estado de cuenta por propietario'),
			h('div', { class: 'mb-4' }, cajaTabla(h('table', { class: 'table table-hover table-admin mb-0' },
				h('thead', {}, h('tr', {}, ['Propietario', 'Casas', 'Reservas', 'Noches', 'Ocupación', 'Por pagar', 'Pagado', ''].map((t, i) => h('th', { scope: 'col', class: i ? 'text-end' : '' }, t)))),
				h('tbody', {}, filas.map((g) => {
					const res = V.resumenReservas(g.reservas);
					const porPagar = g.reservas.filter((r) => !r.pagadoSocio);
					return h('tr', { class: filtro === g ? 'table-active' : '', role: 'button', onclick: () => { estado.dueno = filtro === g ? null : g.id; pintar(); } },
						h('td', {}, g.nombre),
						h('td', { class: 'text-end' }, String(g.casas)),
						h('td', { class: 'text-end' }, String(res.reservas)),
						h('td', { class: 'text-end' }, String(res.noches)),
						h('td', { class: 'text-end' }, g.casas ? `${Math.round(res.noches * 100 / (g.casas * diasDelMes(estado.mes)))} %` : '—'),
						h('td', { class: 'text-end fw-semibold' }, dinero(res.porMoneda, 'porPagar')),
						h('td', { class: 'text-end text-muted' }, dinero(res.porMoneda, 'pagado')),
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
			visibles.length ? cajaTabla(h('table', { class: 'table table-hover table-admin fichas-icono mb-0' },
				h('thead', {}, h('tr', {}, ['Casa', 'Fechas', 'Huésped', 'Estado', 'Al propietario', 'Ganancia'].map((t, i) => h('th', { scope: 'col', class: i > 3 ? 'text-end' : '' }, t)))),
				h('tbody', {}, visibles.map((r) => { const dueno = duenoDeReserva(r)?.nombre; return h('tr', { role: 'button', onclick: () => editar(r).catch(showError) },
					h('td', {}, r.propertyTitulo, dueno ? h('div', { class: 'small text-muted fw-normal' }, dueno) : null),
					h('td', { class: 'text-nowrap' }, dato('icon-calendar-o', `${dia(r.llegada)} – ${dia(r.salida)}`), ' ', dato('icon-moon-o', r.noches, 'text-muted ms-1', nNoches(r.noches))),
					h('td', {}, dato('icon-user', r.huesped || etiqueta(CANALES, r.canal)), r.huesped ? h('span', { class: 'small text-muted ms-1' }, etiqueta(CANALES, r.canal)) : null),
					h('td', {}, estadoBadge(r)),
					h('td', { class: 'text-end' }, dato('icon-handshake-o', money(r.costoSocio, r.moneda), 'me-1 text-nowrap', 'Al propietario'),
						r.estado !== 'confirmada' ? null : r.pagadoSocio ? badge('Pagado', 'success') : badge('Por pagar', 'warning')),
					h('td', { class: 'text-end text-nowrap' }, r.ganancia ? dato('icon-money', money(r.ganancia, r.moneda), '', 'Ganancia') : '—')); }))), { tarjeta: true })
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
		pageHeader('Rentas vacacionales', casas.length ? iconoBtn('icon-history', 'Cambios de los socios', { onclick: verCambios }) : null, h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => editar().catch(showError) }, '+ Reserva')),
		casas.length ? cuerpo : emptyState('Todavía no hay casas de renta vacacional. Creá una propiedad con operación "Renta vacacional" o importalas todas de un Excel.',
			h('a', { class: 'btn btn-outline-primary btn-sm', href: '#/propiedades/importar' }, 'Importar casas')));
	if (casas.length) pintar();
}
