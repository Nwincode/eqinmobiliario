// Reportes del equipo: actividad, respuesta, visitas y cierres por asesor.
import { db, doc, setDoc, serverTimestamp } from '../firebase.js';
import { h, pageHeader, mount, downloadCsv, toast, showError } from '../ui.js';
import { loadAgents } from '../session.js';
import { loadLeads } from './leads.js';
import { loadClientes, loadActividades, vencimiento, money, ms, ETAPAS, loadReglas, comisionDe } from '../crm.js';

function horas(msx) {
	if (!Number.isFinite(msx)) return '—';
	const hh = msx / 3600000;
	return hh < 1 ? `${Math.round(hh * 60)} min` : hh < 48 ? `${hh.toFixed(1)} h` : `${(hh / 24).toFixed(1)} días`;
}

export async function render(container) {
	const [agentes, leads, clientes, actividades, reglas] = await Promise.all([loadAgents(), loadLeads(), loadClientes(), loadActividades(), loadReglas()]);
	let dias = 30;
	const cuerpo = h('div');
	const selector = h('select', { class: 'form-select form-select-sm w-auto', 'aria-label': 'Periodo' },
		[[7, 'Últimos 7 días'], [30, 'Últimos 30 días'], [90, 'Últimos 3 meses'], [365, 'Último año']].map(([v, l]) => h('option', { value: v, selected: v === dias }, l)));

	const calcular = () => {
		const desde = Date.now() - dias * 86400000;
		const filas = [...agentes.map((a) => ({ id: a.id, nombre: a.nombre })), { id: '', nombre: 'Sin asignar' }].map((a) => {
			const misLeads = leads.filter((l) => (l.agentId || '') === a.id && ms(l.createdAt) >= desde);
			const misClientes = clientes.filter((c) => (c.agentId || '') === a.id);
			const misActs = actividades.filter((x) => (x.agentId || '') === a.id);
			const hechas = misActs.filter((x) => x.hecha && ms(x.hechaEn || x.createdAt) >= desde && x.tipo !== 'nota');
			// Tiempo de primera respuesta: del lead a la primera actividad realizada con ese cliente.
			const tiempos = misLeads.filter((l) => l.clienteId).map((l) => {
				const primera = misActs.filter((x) => x.clienteId === l.clienteId && x.hecha && x.tipo !== 'nota' && ms(x.hechaEn || x.createdAt) >= ms(l.createdAt))
					.map((x) => ms(x.hechaEn || x.createdAt)).sort((p, q) => p - q)[0];
				return primera ? primera - ms(l.createdAt) : null;
			}).filter((t) => t !== null);
			const cierres = misClientes.filter((c) => c.etapa === 'cierre' && ms(c.updatedAt) >= desde);
			const montoCerrado = cierres.reduce((s, c) => s + (Number(c.montoEstimado) || 0), 0);
			const comision = cierres.reduce((s, c) => s + comisionDe(c, reglas), 0);
			const enProceso = misClientes.filter((c) => ['visita', 'oferta'].includes(c.etapa));
			return {
				...a,
				leads: misLeads.length,
				sinRespuesta: misLeads.filter((l) => (l.estado || 'nuevo') === 'nuevo').length,
				respuesta: tiempos.length ? tiempos.sort((p, q) => p - q)[Math.floor(tiempos.length / 2)] : NaN,
				actividades: hechas.length,
				visitas: hechas.filter((x) => x.tipo === 'visita').length,
				vencidas: misActs.filter((x) => vencimiento(x) === 'vencida').length,
				enProceso: enProceso.length,
				pipeline: enProceso.reduce((s, c) => s + (Number(c.montoEstimado) || 0), 0),
				cierres: cierres.length,
				montoCerrado,
				comision,
				parteAsesor: comision * reglas.parteAsesorPct / 100
			};
		}).filter((f) => f.id || f.leads || f.actividades);

		const tot = (k) => filas.reduce((s, f) => s + (f[k] || 0), 0);
		const embudo = ETAPAS.map(([v, l]) => [l, clientes.filter((c) => (c.etapa || 'nuevo') === v).length]);
		const maxE = Math.max(1, ...embudo.map(([, n]) => n));

		cuerpo.replaceChildren(
			h('div', { class: 'row g-3 mb-4' }, [
				['Leads recibidos', tot('leads')], ['Actividades realizadas', tot('actividades')], ['Visitas', tot('visitas')], ['Cierres', tot('cierres')]
			].map(([l, v]) => h('div', { class: 'col-6 col-lg-3' }, h('div', { class: 'card stat-card h-100' }, h('div', { class: 'card-body' }, h('div', { class: 'stat-value' }, v), h('div', { class: 'stat-label' }, l)))))),
			h('div', { class: 'card mb-4 overflow-hidden' },
				h('div', { class: 'card-header bg-white fw-semibold' }, 'Por asesor'),
				h('div', { class: 'table-responsive' }, h('table', { class: 'table table-admin mb-0' },
					h('thead', {}, h('tr', {}, ['Asesor', 'Leads', 'Sin atender', 'Respuesta (mediana)', 'Actividades', 'Visitas', 'Vencidas', 'En proceso', 'Cierres', 'Monto cerrado', 'Comisión', 'Parte asesor'].map((t, i) => h('th', { class: i ? 'text-end' : '' }, t)))),
					h('tbody', {}, filas.map((f) => h('tr', {},
						h('td', { class: 'fw-semibold' }, f.nombre),
						h('td', { class: 'text-end' }, f.leads),
						h('td', { class: `text-end ${f.sinRespuesta ? 'text-danger fw-semibold' : ''}` }, f.sinRespuesta),
						h('td', { class: 'text-end' }, horas(f.respuesta)),
						h('td', { class: 'text-end' }, f.actividades),
						h('td', { class: 'text-end' }, f.visitas),
						h('td', { class: `text-end ${f.vencidas ? 'text-danger fw-semibold' : ''}` }, f.vencidas),
						h('td', { class: 'text-end' }, `${f.enProceso}${f.pipeline ? ` · ${money(f.pipeline)}` : ''}`),
						h('td', { class: 'text-end' }, f.cierres),
						h('td', { class: 'text-end' }, money(f.montoCerrado)),
						h('td', { class: 'text-end' }, money(Math.round(f.comision))),
							h('td', { class: 'text-end' }, money(Math.round(f.parteAsesor))))))))),
			h('div', { class: 'card' },
				h('div', { class: 'card-header bg-white fw-semibold' }, 'Embudo actual de clientes'),
				h('div', { class: 'card-body' }, embudo.map(([l, n]) => h('div', { class: 'mb-2' },
					h('div', { class: 'd-flex justify-content-between small' }, h('span', {}, l), h('strong', {}, n)),
					h('div', { class: 'bar' }, h('span', { style: `width:${(n / maxE) * 100}%` })))))),
			h('p', { class: 'small text-muted mt-3' }, 'Respuesta: tiempo entre que llega el lead y la primera llamada, mensaje o visita registrada con ese cliente. Monto y comisión salen de los clientes en etapa "Cierre"; si el cliente no tiene comisión propia se aplica la regla general.'));
		cuerpo._filas = filas;
	};
	selector.addEventListener('change', () => { dias = Number(selector.value); calcular(); });
	calcular();

	const exportar = h('button', { class: 'btn btn-sm btn-outline-primary', onclick: () => downloadCsv(`reporte-equipo-${dias}d.csv`, [
		['Asesor', 'Leads', 'Sin atender', 'Respuesta (h)', 'Actividades', 'Visitas', 'Vencidas', 'En proceso', 'Cierres', 'Monto cerrado', 'Comisión', 'Parte asesor'],
		...cuerpo._filas.map((f) => [f.nombre, f.leads, f.sinRespuesta, Number.isFinite(f.respuesta) ? (f.respuesta / 3600000).toFixed(1) : '', f.actividades, f.visitas, f.vencidas, f.enProceso, f.cierres, f.montoCerrado, Math.round(f.comision), Math.round(f.parteAsesor)])
	]) }, 'Exportar (CSV)');

	// Regla general de comisión: aplica a todo cliente o propietario sin comisión propia.
	const campos = [['comisionVentaPct', 'Venta', '%'], ['comisionRentaMeses', 'Renta', 'meses de renta'], ['parteAsesorPct', 'Parte del asesor', '% de la comisión']]
		.map(([k, label, sufijo]) => {
			const input = h('input', { class: 'form-control', type: 'number', min: 0, step: 'any', value: reglas[k], id: `regla-${k}` });
			return { k, input, col: h('div', { class: 'col-sm-4' }, h('label', { class: 'form-label small', for: input.id }, label),
				h('div', { class: 'input-group' }, input, h('span', { class: 'input-group-text' }, sufijo))) };
		});
	const guardarReglas = async (btn) => {
		const nuevas = Object.fromEntries(campos.map(({ k, input }) => [k, input.value === '' ? NaN : Number(input.value)]));
		if (Object.values(nuevas).some((v) => !Number.isFinite(v) || v < 0)) { toast('Revisa los valores.', 'danger'); return; }
		btn.disabled = true;
		try {
			await setDoc(doc(db, 'settings', 'crm'), { ...nuevas, updatedAt: serverTimestamp() }, { merge: true });
			Object.assign(reglas, nuevas);
			toast('Regla de comisión guardada.');
			calcular();
		} catch (err) { showError(err); } finally { btn.disabled = false; }
	};
	const tarjetaReglas = h('div', { class: 'card mb-4' },
		h('div', { class: 'card-header bg-white fw-semibold' }, 'Regla general de comisión'),
		h('div', { class: 'card-body' },
			h('div', { class: 'row g-3 align-items-end' }, campos.map((c) => c.col)),
			h('div', { class: 'd-flex flex-wrap align-items-center gap-2 mt-3' },
				h('span', { class: 'small text-muted me-auto' }, 'Se aplica a los clientes y propietarios sin comisión propia. Recomendado: 5 % en venta, 1 mes de renta y 50 % para el asesor.'),
				h('button', { class: 'btn btn-primary btn-sm', onclick: (e) => guardarReglas(e.currentTarget) }, 'Guardar regla'))));

	mount(container, pageHeader('Reportes del equipo', h('div', { class: 'd-flex gap-2' }, selector, exportar)), tarjetaReglas, cuerpo);
}
