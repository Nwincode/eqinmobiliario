// Clientes: lista, tablero por etapas y ficha con historial, agenda y propiedades de interés.
import { db, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, serverTimestamp } from '../firebase.js';
import { h, toast, showError, confirmDialog, pageHeader, emptyState, mount, formatDate, downloadCsv } from '../ui.js';
import { renderForm } from '../form.js';
import { session, loadAgents, agentOptions } from '../session.js';
import { loadLeads } from './leads.js';
import { whatsappUrl } from '../ia.js';
import {
	ETAPAS, TIPOS_CLIENTE, TIPOS_ACTIVIDAD, etapaBadge, etapaLabel, tipoActividad, telNorm, money,
	loadClientes, loadActividades, loadPropiedades, sincronizarLeads, crearActividad, proximaActividad,
	fechaCorta, chipVencimiento, ms
} from '../crm.js';

const VISTA_KEY = 'eq-clientes-vista';

function esquema(agentes) {
	return [
		{ name: 'nombre', label: 'Nombre', required: true, cols: 6 },
		{ name: 'tipo', label: 'Tipo de cliente', type: 'select', options: TIPOS_CLIENTE, cols: 3 },
		{ name: 'etapa', label: 'Etapa', type: 'select', options: ETAPAS.map(([v, l]) => [v, l]), cols: 3 },
		{ name: 'telefono', label: 'Teléfono / WhatsApp', cols: 4 },
		{ name: 'email', label: 'Correo', type: 'email', cols: 4 },
		{ name: 'idioma', label: 'Idioma', type: 'select', options: [['es', 'Español'], ['en', 'Inglés']], cols: 4 },
		session.isAdmin ? { name: 'agentId', label: 'Asesor', type: 'select', options: agentes, cols: 4 } : null,
		{ name: 'fuente', label: 'Fuente', cols: session.isAdmin ? 4 : 6, placeholder: 'Google, Encuentra24, referido…' },
		{ name: 'operacion', label: 'Busca', type: 'select', options: [['venta', 'Comprar'], ['renta', 'Rentar'], ['vender', 'Vender su propiedad'], ['invertir', 'Invertir']], cols: session.isAdmin ? 4 : 6 },
		{ type: 'section', label: 'Lo que busca' },
		{ name: 'presupuesto', label: 'Presupuesto', type: 'number', cols: 4 },
		{ name: 'moneda', label: 'Moneda', type: 'select', options: [['USD', 'US$'], ['GTQ', 'Q']], cols: 2 },
		{ name: 'zonas', label: 'Zonas de interés', cols: 6, placeholder: 'Zona 16, Carretera a El Salvador…' },
		{ name: 'requerimiento', label: 'Requerimiento', type: 'textarea', rows: 3, placeholder: 'Casa de 3 habitaciones, jardín, cerca de colegios…' },
		{ type: 'section', label: 'Negocio' },
		{ name: 'montoEstimado', label: 'Monto del negocio', type: 'number', cols: 4, help: 'Precio de la operación esperada.' },
		{ name: 'comisionPct', label: 'Comisión %', type: 'number', cols: 4 },
		{ name: 'motivoPerdida', label: 'Motivo si se perdió', cols: 4 }
	].filter(Boolean);
}

function contactoBotones(c) {
	return [
		c.telefono ? h('a', { href: whatsappUrl(c.telefono, `Hola ${String(c.nombre || '').split(' ')[0]}, te escribo de Equipo Inmobiliario.`), target: '_blank', rel: 'noopener', class: 'btn btn-sm btn-success' }, 'WhatsApp') : null,
		c.telefono ? h('a', { href: `tel:${c.telefono}`, class: 'btn btn-sm btn-outline-primary' }, 'Llamar') : null,
		c.email ? h('a', { href: `mailto:${c.email}`, class: 'btn btn-sm btn-outline-primary' }, 'Correo') : null
	];
}

// ---------------------------------------------------------------- Lista y tablero

async function renderLista(container) {
	const [clientes, actividades, agentes, leads] = await Promise.all([
		loadClientes(), loadActividades(), loadAgents(),
		(session.isAdmin || session.agentId) ? loadLeads() : []
	]);
	// Los leads nuevos se convierten en clientes (una ficha por persona).
	let aviso = null;
	if (leads.some((l) => !l.clienteId)) {
		try {
			const r = await sincronizarLeads(leads, clientes);
			if (r.vinculados) aviso = h('div', { class: 'alert alert-info py-2' }, `${r.vinculados} leads nuevos se unieron a sus fichas de cliente (${r.nuevos} clientes nuevos).`);
		} catch (err) {
			showError(err);
		}
	}
	const nombreAsesor = Object.fromEntries(agentes.map((a) => [a.id, a.nombre]));
	let vista = 'tablero';
	try { vista = localStorage.getItem(VISTA_KEY) || 'tablero'; } catch { /* sin almacenamiento */ }

	const buscar = h('input', { class: 'form-control', type: 'search', placeholder: 'Buscar por nombre, teléfono, correo o zona…' });
	const fTipo = h('select', { class: 'form-select' }, h('option', { value: '' }, 'Todos los tipos'), TIPOS_CLIENTE.map(([v, l]) => h('option', { value: v }, l)));
	const fAsesor = h('select', { class: 'form-select', hidden: !session.isAdmin }, h('option', { value: '' }, 'Todos los asesores'), h('option', { value: '-' }, 'Sin asignar'), agentes.map((a) => h('option', { value: a.id }, a.nombre)));
	const cuerpo = h('div');

	const filtrados = () => {
		const q = buscar.value.trim().toLowerCase();
		return clientes.filter((c) => (!q || `${c.nombre} ${c.telefono} ${c.email} ${c.zonas || ''}`.toLowerCase().includes(q))
			&& (!fTipo.value || c.tipo === fTipo.value)
			&& (!fAsesor.value || (fAsesor.value === '-' ? !c.agentId : c.agentId === fAsesor.value)));
	};

	const moverEtapa = async (c, etapa) => {
		try {
			await updateDoc(doc(db, 'clientes', c.id), { etapa, updatedAt: serverTimestamp() });
			await crearActividad({ tipo: 'nota', titulo: `Etapa: ${etapaLabel(c.etapa)} → ${etapaLabel(etapa)}`, clienteId: c.id, clienteNombre: c.nombre, agentId: c.agentId, hecha: true });
			c.etapa = etapa;
			dibujar();
		} catch (err) { showError(err); }
	};

	const tarjeta = (c) => {
		const prox = proximaActividad(actividades, c.id);
		const card = h('div', { class: 'crm-card', draggable: 'true', dataset: { id: c.id } },
			h('a', { href: `#/clientes/${c.id}`, class: 'crm-card-nombre' }, c.nombre),
			h('div', { class: 'small text-muted' }, [TIPOS_CLIENTE.find(([v]) => v === c.tipo)?.[1], c.zonas].filter(Boolean).join(' · ')),
			c.montoEstimado ? h('div', { class: 'small fw-semibold mt-1' }, money(c.montoEstimado, c.moneda)) : null,
			prox ? h('div', { class: 'small mt-2 d-flex gap-1 align-items-center' }, chipVencimiento(prox), h('span', {}, `${tipoActividad(prox.tipo)[2]} ${prox.titulo || tipoActividad(prox.tipo)[1]} · ${fechaCorta(prox.fecha)}`))
				: h('div', { class: 'small text-danger mt-2' }, 'Sin seguimiento agendado'),
			session.isAdmin && c.agentId ? h('div', { class: 'small text-muted mt-1' }, nombreAsesor[c.agentId] || '') : null);
		card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.id); card.classList.add('arrastrando'); });
		card.addEventListener('dragend', () => card.classList.remove('arrastrando'));
		return card;
	};

	const dibujar = () => {
		const lista = filtrados();
		if (!clientes.length) {
			cuerpo.replaceChildren(emptyState('Aún no hay clientes. Llegan solos desde los formularios del sitio, o créalos con "+ Cliente".'));
			return;
		}
		if (vista === 'tablero') {
			cuerpo.replaceChildren(h('div', { class: 'crm-tablero' }, ETAPAS.map(([etapa, label]) => {
				const items = lista.filter((c) => (c.etapa || 'nuevo') === etapa);
				const total = items.reduce((s, c) => s + (Number(c.montoEstimado) || 0), 0);
				const col = h('div', { class: 'crm-columna', dataset: { etapa } },
					h('div', { class: 'crm-columna-cabecera' }, h('strong', {}, label), h('span', { class: 'text-muted small' }, `${items.length}${total ? ` · ${money(total)}` : ''}`)),
					items.map(tarjeta));
				col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('sobre'); });
				col.addEventListener('dragleave', () => col.classList.remove('sobre'));
				col.addEventListener('drop', (e) => {
					e.preventDefault();
					col.classList.remove('sobre');
					const c = clientes.find((x) => x.id === e.dataTransfer.getData('text/plain'));
					if (c && c.etapa !== etapa) moverEtapa(c, etapa);
				});
				return col;
			})), h('p', { class: 'small text-muted mt-2' }, 'Arrastra una tarjeta a otra columna para cambiar la etapa, o cámbiala dentro de la ficha.'));
		} else {
			cuerpo.replaceChildren(h('div', { class: 'card overflow-hidden' }, h('div', { class: 'table-responsive' }, h('table', { class: 'table table-hover table-admin mb-0' },
				h('thead', {}, h('tr', {}, ['Cliente', 'Tipo', 'Etapa', 'Próximo seguimiento', 'Último contacto', session.isAdmin ? 'Asesor' : null].filter(Boolean).map((t) => h('th', {}, t)))),
				h('tbody', {}, lista.sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt)).map((c) => {
					const prox = proximaActividad(actividades, c.id);
					return h('tr', { class: 'clickable', onclick: () => { location.hash = `#/clientes/${c.id}`; } },
						h('td', {}, h('div', { class: 'fw-semibold' }, c.nombre), h('div', { class: 'small text-muted' }, c.telefono || c.email || '')),
						h('td', { class: 'small' }, TIPOS_CLIENTE.find(([v]) => v === c.tipo)?.[1] || ''),
						h('td', {}, etapaBadge(c.etapa)),
						h('td', { class: 'small' }, prox ? [chipVencimiento(prox), ' ', fechaCorta(prox.fecha)] : h('span', { class: 'text-danger' }, 'Sin agendar')),
						h('td', { class: 'small text-muted' }, c.ultimoContacto ? formatDate(c.ultimoContacto) : '—'),
						session.isAdmin ? h('td', { class: 'small' }, nombreAsesor[c.agentId] || 'Sin asignar') : null);
				}))))));
		}
	};
	[buscar, fTipo, fAsesor].forEach((el) => el.addEventListener('input', dibujar));

	const botonVista = (v, label) => h('button', { type: 'button', class: `btn btn-sm ${vista === v ? 'btn-primary' : 'btn-outline-primary'}`, onclick: () => {
		vista = v;
		try { localStorage.setItem(VISTA_KEY, v); } catch { /* sin almacenamiento */ }
		container.replaceChildren();
		renderLista(container);
	} }, label);

	const exportar = () => downloadCsv(`clientes-${new Date().toISOString().slice(0, 10)}.csv`, [
		['Nombre', 'Teléfono', 'Correo', 'Tipo', 'Etapa', 'Presupuesto', 'Zonas', 'Monto', 'Asesor', 'Fuente'],
		...filtrados().map((c) => [c.nombre, c.telefono, c.email, c.tipo, etapaLabel(c.etapa), c.presupuesto || '', c.zonas || '', c.montoEstimado || '', nombreAsesor[c.agentId] || '', c.fuente || ''])
	]);

	mount(container,
		pageHeader('Clientes',
			h('div', { class: 'btn-group' }, botonVista('tablero', 'Tablero'), botonVista('lista', 'Lista')),
			h('button', { class: 'btn btn-outline-primary', onclick: exportar }, 'Exportar'),
			h('a', { href: '#/clientes/nuevo', class: 'btn btn-primary' }, '+ Cliente')),
		aviso,
		h('div', { class: 'row g-2 mb-3' },
			h('div', { class: 'col-md-6' }, buscar),
			h('div', { class: 'col-6 col-md-3' }, fTipo),
			h('div', { class: 'col-6 col-md-3' }, fAsesor)),
		cuerpo);
	dibujar();
}

// ---------------------------------------------------------------- Ficha

function formularioActividad(c, alGuardar) {
	const tipo = h('select', { class: 'form-select' }, TIPOS_ACTIVIDAD.map(([v, l, i]) => h('option', { value: v }, `${i} ${l}`)));
	const titulo = h('input', { class: 'form-control', placeholder: 'Ej. Llamar para confirmar visita', maxlength: 200 });
	const fecha = h('input', { class: 'form-control', type: 'datetime-local' });
	const hecha = h('input', { class: 'form-check-input', type: 'checkbox', id: 'act-hecha' });
	const detalle = h('textarea', { class: 'form-control', rows: 2, placeholder: 'Detalle o resultado (opcional)' });
	const boton = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Guardar');
	return h('form', { class: 'crm-actividad-form', onsubmit: async (e) => {
		e.preventDefault();
		if (!titulo.value.trim() && !detalle.value.trim()) { titulo.focus(); return; }
		boton.disabled = true;
		try {
			await crearActividad({
				tipo: tipo.value, titulo: titulo.value.trim(), detalle: detalle.value.trim(),
				fecha: fecha.value ? new Date(fecha.value) : null,
				hecha: hecha.checked || tipo.value === 'nota' || !fecha.value,
				clienteId: c.id, clienteNombre: c.nombre, agentId: c.agentId
			});
			toast(fecha.value && !hecha.checked ? 'Agendado.' : 'Registrado en el historial.');
			alGuardar();
		} catch (err) { showError(err); } finally { boton.disabled = false; }
	} },
	h('div', { class: 'row g-2' },
		h('div', { class: 'col-md-3' }, tipo),
		h('div', { class: 'col-md-5' }, titulo),
		h('div', { class: 'col-md-4' }, fecha),
		h('div', { class: 'col-12' }, detalle),
		h('div', { class: 'col-12 d-flex align-items-center gap-3' },
			h('div', { class: 'form-check mb-0' }, hecha, h('label', { class: 'form-check-label small', for: 'act-hecha' }, 'Ya se realizó')),
			h('span', { class: 'small text-muted me-auto' }, 'Con fecha y sin marcar: queda en la agenda. Sin fecha: se guarda en el historial.'),
			boton)));
}

async function renderFicha(container, id) {
	const nuevo = id === 'nuevo';
	const ref = nuevo ? doc(collection(db, 'clientes')) : doc(db, 'clientes', id);
	const [snap, agentes, actividades, propiedades, leads] = await Promise.all([
		nuevo ? null : getDoc(ref), agentOptions(), nuevo ? [] : loadActividades(), loadPropiedades(),
		nuevo ? [] : loadLeads().catch(() => [])
	]);
	if (!nuevo && !snap.exists()) {
		mount(container, emptyState('No se encontró el cliente.', h('a', { href: '#/clientes', class: 'btn btn-primary' }, 'Volver')));
		return;
	}
	const c = nuevo ? { etapa: 'nuevo', tipo: 'comprador', idioma: 'es', moneda: 'USD', agentId: session.isAdmin ? '' : session.agentId } : { id, ...snap.data() };
	const form = renderForm(esquema(agentes), c, { folder: `clientes/${ref.id}` });
	const recargar = () => { container.replaceChildren(); renderFicha(container, id); };

	const guardar = async (btn) => {
		if (!form.validate()) return;
		const datos = form.getData();
		const d = Object.fromEntries(esquema(agentes).filter((f) => f.name).map((f) => [f.name, datos[f.name] ?? (f.type === 'number' ? null : '')]));
		d.telefonoNorm = telNorm(d.telefono);
		d.updatedAt = serverTimestamp();
		if (nuevo) {
			d.createdAt = serverTimestamp();
			d.interes = d.interes || [];
			if (!session.isAdmin) d.agentId = session.agentId;
		}
		btn.disabled = true;
		try {
			await setDoc(ref, d, { merge: true });
			toast('Cliente guardado.');
			if (nuevo) location.hash = `#/clientes/${ref.id}`;
		} catch (err) { showError(err); } finally { btn.disabled = false; }
	};

	if (nuevo) {
		mount(container,
			pageHeader('Nuevo cliente', h('a', { href: '#/clientes', class: 'btn btn-light' }, 'Volver')),
			h('div', { class: 'card' }, h('div', { class: 'card-body' }, form.el)),
			h('div', { class: 'sticky-actions' }, h('button', { class: 'btn btn-primary', onclick: (e) => guardar(e.currentTarget) }, 'Guardar cliente')));
		return;
	}

	// Historial: actividades del cliente + mensajes que dejó en los formularios.
	const propias = actividades.filter((a) => a.clienteId === id);
	const pendientes = propias.filter((a) => !a.hecha).sort((a, b) => ms(a.fecha) - ms(b.fecha));
	const historial = [
		...propias.filter((a) => a.hecha).map((a) => ({ t: ms(a.hechaEn) || ms(a.createdAt), el: h('li', { class: 'crm-evento' },
			h('span', { class: 'crm-evento-icono' }, tipoActividad(a.tipo)[2]),
			h('div', {}, h('div', { class: 'fw-semibold small' }, a.titulo || tipoActividad(a.tipo)[1]),
				a.detalle ? h('div', { class: 'small', style: 'white-space:pre-wrap' }, a.detalle) : null,
				h('div', { class: 'small text-muted' }, `${a.autor || ''} · ${formatDate(a.hechaEn || a.createdAt)}`))) })),
		...leads.filter((l) => l.clienteId === id).map((l) => ({ t: ms(l.createdAt), el: h('li', { class: 'crm-evento' },
			h('span', { class: 'crm-evento-icono' }, '🌐'),
			h('div', {}, h('div', { class: 'fw-semibold small' }, `Formulario del sitio${l.propertyTitulo ? `: ${l.propertyTitulo}` : ''}`),
				l.mensaje ? h('div', { class: 'small', style: 'white-space:pre-wrap' }, l.mensaje) : null,
				h('div', { class: 'small text-muted' }, `${formatDate(l.createdAt)}${l.campana?.utm_source ? ` · ${l.campana.utm_source}` : ''}`))) }))
	].sort((a, b) => b.t - a.t).map((x) => x.el);

	const completar = async (a) => {
		try {
			await updateDoc(doc(db, 'actividades', a.id), { hecha: true, hechaEn: serverTimestamp() });
			await updateDoc(ref, { ultimoContacto: serverTimestamp(), updatedAt: serverTimestamp() });
			toast('Marcada como realizada.');
			recargar();
		} catch (err) { showError(err); }
	};

	// Propiedades de interés
	const interes = c.interes || [];
	const selProp = h('select', { class: 'form-select form-select-sm' }, h('option', { value: '' }, 'Agregar propiedad de interés…'),
		propiedades.filter((p) => !interes.includes(p.id)).map((p) => h('option', { value: p.id }, `${p.titulo} · ${money(p.precio, p.moneda)}`)));
	selProp.addEventListener('change', async () => {
		if (!selProp.value) return;
		try {
			await updateDoc(ref, { interes: [...interes, selProp.value], updatedAt: serverTimestamp() });
			recargar();
		} catch (err) { showError(err); }
	});
	const quitarInteres = async (pid) => {
		try { await updateDoc(ref, { interes: interes.filter((x) => x !== pid), updatedAt: serverTimestamp() }); recargar(); } catch (err) { showError(err); }
	};

	const etapa = h('select', { class: 'form-select form-select-sm w-auto' }, ETAPAS.map(([v, l]) => h('option', { value: v, selected: (c.etapa || 'nuevo') === v }, l)));
	etapa.addEventListener('change', async () => {
		try {
			await updateDoc(ref, { etapa: etapa.value, updatedAt: serverTimestamp() });
			await crearActividad({ tipo: 'nota', titulo: `Etapa: ${etapaLabel(c.etapa)} → ${etapaLabel(etapa.value)}`, clienteId: id, clienteNombre: c.nombre, agentId: c.agentId, hecha: true });
			recargar();
		} catch (err) { showError(err); }
	});

	const eliminar = async () => {
		if (!(await confirmDialog(`¿Eliminar a ${c.nombre}? Sus actividades quedan en la agenda.`, { okText: 'Eliminar' }))) return;
		try { await deleteDoc(ref); toast('Cliente eliminado.'); location.hash = '#/clientes'; } catch (err) { showError(err); }
	};

	mount(container,
		pageHeader(c.nombre, h('div', { class: 'd-flex align-items-center gap-2' }, h('span', { class: 'small text-muted' }, 'Etapa'), etapa), h('a', { href: '#/clientes', class: 'btn btn-light' }, 'Volver')),
		h('div', { class: 'd-flex flex-wrap gap-2 mb-3' }, contactoBotones(c),
			h('a', { href: `#/ia/buscar`, class: 'btn btn-sm btn-outline-primary ms-auto' }, '✨ Buscarle propiedades (IA)')),
		h('div', { class: 'row g-4' },
			h('div', { class: 'col-xl-7' },
				h('div', { class: 'card mb-4' }, h('div', { class: 'card-header bg-white fw-semibold' }, 'Registrar o agendar'),
					h('div', { class: 'card-body' }, formularioActividad(c, recargar))),
				pendientes.length ? h('div', { class: 'card mb-4' }, h('div', { class: 'card-header bg-white fw-semibold' }, `Pendientes (${pendientes.length})`),
					h('ul', { class: 'list-group list-group-flush' }, pendientes.map((a) => h('li', { class: 'list-group-item d-flex align-items-center gap-2' },
						h('span', {}, tipoActividad(a.tipo)[2]),
						h('div', { class: 'me-auto' }, h('div', { class: 'small fw-semibold' }, a.titulo || tipoActividad(a.tipo)[1]), h('div', { class: 'small text-muted' }, a.fecha ? fechaCorta(a.fecha) : 'Sin fecha')),
						chipVencimiento(a),
						h('button', { class: 'btn btn-sm btn-outline-success', onclick: () => completar(a) }, 'Hecho'))))) : null,
				h('div', { class: 'card' }, h('div', { class: 'card-header bg-white fw-semibold' }, 'Historial'),
					h('div', { class: 'card-body' }, historial.length ? h('ul', { class: 'crm-historial' }, historial) : h('p', { class: 'text-muted small mb-0' }, 'Sin actividad todavía.')))),
			h('div', { class: 'col-xl-5' },
				h('div', { class: 'card mb-4' }, h('div', { class: 'card-header bg-white fw-semibold' }, 'Propiedades de interés'),
					h('div', { class: 'card-body' },
						interes.length ? h('ul', { class: 'list-unstyled mb-3' }, interes.map((pid) => {
							const p = propiedades.find((x) => x.id === pid);
							return h('li', { class: 'd-flex align-items-center gap-2 mb-2' },
								h('a', { href: `#/propiedades/${pid}`, class: 'small me-auto' }, p ? p.titulo : 'Propiedad no disponible'),
								p ? h('span', { class: 'small text-muted' }, money(p.precio, p.moneda)) : null,
								h('button', { class: 'btn btn-sm btn-light', title: 'Quitar', onclick: () => quitarInteres(pid) }, '×'));
						})) : h('p', { class: 'small text-muted' }, 'Ninguna todavía.'),
						selProp)),
				h('div', { class: 'card' }, h('div', { class: 'card-header bg-white fw-semibold' }, 'Datos del cliente'),
					h('div', { class: 'card-body' }, form.el,
						h('div', { class: 'd-flex gap-2 mt-3' },
							h('button', { class: 'btn btn-primary', onclick: (e) => guardar(e.currentTarget) }, 'Guardar datos'),
							session.isAdmin ? h('button', { class: 'btn btn-outline-danger ms-auto', onclick: eliminar }, 'Eliminar') : null))))));
}

export async function render(container, [id]) {
	if (id) return renderFicha(container, id);
	return renderLista(container);
}
