// Cotización de servicios: el asesor arma una cotización (compraventa, arrendamiento, administración u otro),
// la ve como quedará impresa, la guarda, la descarga en PDF y copia un resumen para WhatsApp.
// Los cálculos están en ../cotizacion.js (probados con `npm run test:cotizacion`).
import {
	db, doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where, serverTimestamp
} from '../firebase.js';
import { h, mount, toast, showError, confirmDialog, emptyState, spinner, pageHeader } from '../ui.js';
import { session } from '../session.js';
import {
	REGIMENES, MODOS, SERVICIOS, MONEDAS, CONDICIONES_DEF, NOTA_PEQUENO, VIGENCIA_DEF,
	calcularCotizacion, lineaVacia, dinero, porcentaje, pctTodoIncluido, rentas,
	numeroCotizacion, fechaISO, fechaLarga, venceEl, textoWhatsApp
} from '../cotizacion.js';

const COL = 'cotizaciones';
const ICONOS = { compraventa: 'icon-handshake-o', arrendamiento: 'icon-key', administracion: 'icon-building', otro: 'icon-pencil' };
const LOGO = '/logo-equipo-inmobiliario.png';
// Espacio duro entre el símbolo y la cifra («US$ 1,500» no se parte en dos líneas). Solo para mostrar.
const nb = (t) => String(t ?? '').replace(/\b(US\$|Q) /g, '$1\u00a0').replace(/ %/g, '\u00a0%');

export async function render(container, rest = []) {
	const [accion, id] = rest;
	if (!accion) return lista(container);
	if (accion === 'nueva') return editor(container, null);
	if (accion === 'duplicar') return editor(container, id, { duplicar: true });
	return editor(container, accion);
}

// ── Lista de cotizaciones guardadas ─────────────────────────────────────
async function cargarLista() {
	const col = collection(db, COL);
	// El asesor solo puede leer las suyas (reglas de Firestore); el administrador, todas.
	const snap = await getDocs(session.isAdmin ? col : query(col, where('agentId', '==', session.agentId)));
	const ms = (v) => (v && typeof v.toDate === 'function' ? v.toDate().getTime() : 0);
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
		.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || ms(b.createdAt) - ms(a.createdAt));
}

async function lista(container) {
	const nueva = h('a', { class: 'btn btn-primary cot-btn', href: '#/cotizaciones/nueva' }, h('span', { class: 'icon-plus me-2', 'aria-hidden': 'true' }), 'Nueva cotización');
	const cuerpo = h('div', {}, spinner());
	mount(container,
		pageHeader('Cotización de servicios', nueva),
		h('p', { class: 'text-muted cot-intro' }, 'Arma la cotización de tus honorarios con IVA o como pequeño contribuyente, descárgala en PDF y compártela por WhatsApp.'),
		cuerpo);
	if (!session.isAdmin && !session.agentId) {
		cuerpo.replaceChildren(emptyState('Tu usuario no tiene un asesor asignado. Pide al administrador que te asigne uno para guardar cotizaciones.'));
		return;
	}
	let items = [];
	try { items = await cargarLista(); } catch (err) { showError(err); cuerpo.replaceChildren(emptyState('No se pudieron leer las cotizaciones.')); return; }
	const pintar = () => {
		if (!items.length) {
			cuerpo.replaceChildren(emptyState('Aún no tienes cotizaciones guardadas.', h('a', { class: 'btn btn-primary cot-btn', href: '#/cotizaciones/nueva' }, h('span', { class: 'icon-plus me-2', 'aria-hidden': 'true' }), 'Crear la primera')));
			return;
		}
		const total = (c) => {
			const t = calcularCotizacion(c).totales.filter((x) => !x.mensual);
			return t.length ? t.map((x) => dinero(x.total, x.moneda)).join(' · ') : '—';
		};
		const borrar = async (c) => {
			if (!await confirmDialog(`¿Eliminar la cotización ${c.numero || ''}${c.cliente?.nombre ? ` de ${c.cliente.nombre}` : ''}? No se puede deshacer.`, { okText: 'Eliminar' })) return;
			try { await deleteDoc(doc(db, COL, c.id)); items = items.filter((x) => x.id !== c.id); pintar(); toast('Cotización eliminada.'); } catch (err) { showError(err); }
		};
		const acciones = (c) => h('div', { class: 'cot-acciones' },
			h('a', { class: 'btn btn-outline-primary btn-sm cot-btn', href: `#/cotizaciones/${encodeURIComponent(c.id)}` }, h('span', { class: 'icon-pencil me-1', 'aria-hidden': 'true' }), 'Abrir'),
			h('a', { class: 'btn btn-outline-secondary btn-sm cot-btn cot-btn-icono', href: `#/cotizaciones/duplicar/${encodeURIComponent(c.id)}`, title: 'Duplicar', 'aria-label': `Duplicar ${c.numero || 'cotización'}` }, h('span', { class: 'icon-clone', 'aria-hidden': 'true' })),
			h('button', { type: 'button', class: 'btn btn-outline-danger btn-sm cot-btn cot-btn-icono', title: 'Eliminar', 'aria-label': `Eliminar ${c.numero || 'cotización'}`, onclick: () => borrar(c) }, h('span', { class: 'icon-trash-o', 'aria-hidden': 'true' })));
		cuerpo.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'table-responsive' },
			h('table', { class: 'table table-hover align-middle mb-0 cot-lista' },
				h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Número'), h('th', { scope: 'col' }, 'Fecha'), h('th', { scope: 'col' }, 'Cliente'), h('th', { scope: 'col', class: 'text-end' }, 'Total'), h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Acciones')))),
				h('tbody', {}, items.map((c) => h('tr', {},
					h('td', { 'data-label': 'Número' }, h('a', { href: `#/cotizaciones/${encodeURIComponent(c.id)}`, class: 'fw-semibold' }, c.numero || 'Sin número')),
					h('td', { 'data-label': 'Fecha' }, fechaLarga(c.fecha)),
					h('td', { 'data-label': 'Cliente' }, c.cliente?.nombre || h('span', { class: 'text-muted' }, 'Sin nombre'),
						c.propiedad?.texto ? h('div', { class: 'small text-muted' }, c.propiedad.texto) : null),
					h('td', { 'data-label': 'Total', class: 'text-end text-nowrap' }, total(c)),
					h('td', { class: 'text-end' }, acciones(c)))))))));
	};
	pintar();
}

// ── Valores predeterminados del emisor (settings/cotizacion, con respaldo en settings/site) ──
async function predeterminados() {
	const def = { emisor: { nombre: 'Equipo Inmobiliario', nit: '', direccion: '', telefono: '', email: '' }, regimen: 'general', condiciones: CONDICIONES_DEF, vigenciaDias: VIGENCIA_DEF };
	try {
		const s = await getDoc(doc(db, 'settings', 'site'));
		if (s.exists()) {
			const d = s.data();
			def.emisor.nombre = d.general?.nombre || def.emisor.nombre;
			def.emisor.telefono = d.contacto?.telefono || '';
			def.emisor.email = d.contacto?.email || '';
			def.emisor.direccion = d.contacto?.direccion || '';
		}
	} catch (err) { console.warn('Cotización: no se pudo leer settings/site', err); }
	try {
		const s = await getDoc(doc(db, 'settings', 'cotizacion'));
		if (s.exists()) {
			const d = s.data();
			Object.assign(def.emisor, Object.fromEntries(Object.entries(d.emisor || {}).filter(([, v]) => v)));
			if (d.regimen) def.regimen = d.regimen;
			if (d.condiciones) def.condiciones = d.condiciones;
			if (d.vigenciaDias) def.vigenciaDias = d.vigenciaDias;
		}
	} catch (err) { console.warn('Cotización: no se pudo leer settings/cotizacion', err); }
	return def;
}

// ── Editor ──────────────────────────────────────────────────────────────
async function editor(container, id, { duplicar = false } = {}) {
	container.replaceChildren(spinner());
	const def = await predeterminados();
	let c;
	let docId = duplicar ? null : id;
	if (id) {
		try {
			const s = await getDoc(doc(db, COL, id));
			if (!s.exists()) { container.replaceChildren(emptyState('No encontramos esta cotización.', h('a', { class: 'btn btn-primary cot-btn', href: '#/cotizaciones' }, 'Ver cotizaciones'))); return; }
			c = structuredClone(s.data());
		} catch (err) { showError(err); container.replaceChildren(emptyState('No se pudo abrir la cotización.')); return; }
		if (duplicar) { c.numero = numeroCotizacion(); c.fecha = fechaISO(); c.cliente = { nombre: '', nit: '', telefono: '', email: '' }; delete c.createdAt; }
	} else {
		c = {
			numero: numeroCotizacion(), fecha: fechaISO(), vigenciaDias: def.vigenciaDias,
			asesor: session.profile?.nombre || '', emisor: { ...def.emisor }, regimen: def.regimen, modo: 'todo',
			cliente: { nombre: '', nit: 'CF', telefono: '', email: '' }, propiedad: { id: '', texto: '' },
			condiciones: def.condiciones, notas: '', lineas: [lineaVacia('compraventa')]
		};
	}
	c.emisor ||= { ...def.emisor }; c.cliente ||= {}; c.propiedad ||= { id: '', texto: '' }; c.lineas ||= [];
	delete c.totales;

	const uid = (k) => `cot-${k}`;
	let sucio = false;
	const cambio = () => { sucio = true; pintarDoc(); };

	// Campo de texto ligado a una ruta del estado (p. ej. 'cliente.nombre').
	const leer = (ruta) => ruta.split('.').reduce((o, k) => (o ? o[k] : undefined), c);
	const escribir = (ruta, v) => { const ks = ruta.split('.'); const ult = ks.pop(); ks.reduce((o, k) => (o[k] ||= {}), c)[ult] = v; };
	function campo(ruta, label, { tipo = 'text', col = 'col-sm-6', ayuda, attrs = {}, area = false } = {}) {
		const idc = uid(ruta.replace('.', '-'));
		const props = { class: 'form-control', id: idc, 'aria-describedby': ayuda ? `${idc}-ayuda` : undefined, oninput: (e) => { escribir(ruta, tipo === 'number' ? e.target.value : e.target.value); cambio(); }, ...attrs };
		const input = area ? h('textarea', { ...props, rows: 3 }, leer(ruta) ?? '') : h('input', { ...props, type: tipo, value: leer(ruta) ?? '' });
		return h('div', { class: col }, h('label', { class: 'form-label', for: idc }, label), input,
			ayuda ? h('div', { class: 'form-text', id: `${idc}-ayuda` }, ayuda) : null);
	}
	const grupo = (icono, titulo, ...hijos) => h('section', { class: 'card cot-grupo mb-3' },
		h('div', { class: 'card-header' }, h('h2', { class: 'h6 mb-0' }, h('span', { class: `${icono} me-2`, 'aria-hidden': 'true' }), titulo)),
		h('div', { class: 'card-body' }, h('div', { class: 'row g-3' }, hijos)));

	// Régimen y forma de presentar el precio.
	const selRegimen = h('select', { class: 'form-select', id: uid('regimen'), onchange: (e) => { c.regimen = e.target.value; pintarLineas(); cambio(); } },
		REGIMENES.map(([v, t]) => h('option', { value: v, selected: c.regimen === v }, t)));
	const modoRadios = h('div', { class: 'btn-group cot-modo w-100', role: 'group', 'aria-labelledby': uid('modo-label') },
		MODOS.map(([v, t]) => [
			h('input', { type: 'radio', class: 'btn-check', name: 'cot-modo', id: uid(`modo-${v}`), value: v, checked: c.modo === v, onchange: () => { c.modo = v; pintarLineas(); cambio(); } }),
			h('label', { class: 'btn btn-outline-primary', for: uid(`modo-${v}`) }, t)]));
	const ayudaModo = h('div', { class: 'form-text', id: uid('modo-ayuda') });
	const pintarAyudaModo = () => {
		ayudaModo.textContent = c.modo === 'todo'
			? (c.regimen === 'pequeno' ? 'Un solo precio que ya cubre el 5 % que pagas a la SAT (honorario ÷ 0.95).' : 'Un solo precio con el IVA incluido (honorario × 1.12).')
			: (c.regimen === 'pequeno' ? 'El honorario es el precio final; el 5 % sale de ahí.' : 'Se muestran el honorario y el IVA por separado.');
	};

	const emisorAbierto = !c.emisor.nombre || !c.emisor.nit;
	const guardarPred = session.isAdmin ? h('div', { class: 'col-12' },
		h('button', { type: 'button', class: 'btn btn-outline-secondary btn-sm cot-btn', onclick: guardarPredeterminados },
			h('span', { class: 'icon-floppy-o me-2', 'aria-hidden': 'true' }), 'Guardar como predeterminados'),
		h('div', { class: 'form-text' }, 'Los usarán todas las cotizaciones nuevas (emisor, régimen, vigencia y condiciones).')) : null;
	const emisor = grupo('icon-bank', 'Emisor y régimen',
		h('div', { class: 'col-sm-6' }, h('label', { class: 'form-label', for: uid('regimen') }, 'Régimen del emisor'), selRegimen),
		h('div', { class: 'col-sm-6' }, h('span', { class: 'form-label d-block', id: uid('modo-label') }, 'Precio'), modoRadios, ayudaModo),
		h('details', { class: 'col-12 cot-detalles', open: emisorAbierto },
			h('summary', {}, h('span', { class: 'icon-chevron-down me-2 cot-chev', 'aria-hidden': 'true' }), 'Datos del emisor (nombre, NIT y contacto)'),
			h('div', { class: 'row g-3 pt-2' },
				campo('emisor.nombre', 'Nombre o razón social', { col: 'col-12' }),
				campo('emisor.nit', 'NIT', { attrs: { autocomplete: 'off' } }),
				campo('emisor.telefono', 'Teléfono', { tipo: 'tel' }),
				campo('emisor.email', 'Correo', { tipo: 'email', col: 'col-12' }),
				campo('emisor.direccion', 'Dirección', { col: 'col-12' }),
				guardarPred)));

	// Cliente, fecha y propiedad.
	const selProp = h('select', { class: 'form-select', id: uid('propiedad'), onchange: (e) => elegirPropiedad(e.target.value) },
		h('option', { value: '' }, c.propiedad.texto && !c.propiedad.id ? c.propiedad.texto : 'Sin propiedad'));
	let props = [];
	function elegirPropiedad(pid) {
		const p = props.find((x) => x.id === pid);
		c.propiedad = p ? { id: p.id, texto: [p.codigo, p.titulo, p.zona].filter(Boolean).join(' · ') } : { id: '', texto: '' };
		if (p && Number(p.precio) > 0) {
			// Llena el precio o la renta del primer servicio que aún no lo tenga.
			const venta = p.operacion !== 'renta';
			const l = c.lineas.find((x) => (venta ? x.tipo === 'compraventa' && !x.precio : (x.tipo === 'arrendamiento' || x.tipo === 'administracion') && !x.renta));
			if (l) { if (venta) l.precio = Number(p.precio); else l.renta = Number(p.precio); l.moneda = p.moneda === 'GTQ' ? 'GTQ' : 'USD'; pintarLineas(); }
		}
		cambio();
	}
	const cliente = grupo('icon-user', 'Cliente y cotización',
		campo('cliente.nombre', 'Nombre del cliente', { col: 'col-12', attrs: { autocomplete: 'off', placeholder: 'Escribe el nombre completo' } }),
		campo('cliente.nit', 'NIT', { ayuda: 'Escribe CF si no tiene NIT.', attrs: { autocomplete: 'off' } }),
		campo('cliente.telefono', 'Teléfono', { tipo: 'tel' }),
		campo('cliente.email', 'Correo', { tipo: 'email', col: 'col-12' }),
		h('div', { class: 'col-12' }, h('label', { class: 'form-label', for: uid('propiedad') }, 'Propiedad (opcional)'), selProp,
			h('div', { class: 'form-text' }, 'Si eliges una, se llena el precio o la renta del servicio.')),
		campo('numero', 'Número', { attrs: { autocomplete: 'off' } }),
		campo('fecha', 'Fecha', { tipo: 'date' }),
		campo('vigenciaDias', 'Vigencia (días)', { tipo: 'number', attrs: { min: '1', step: '1', inputmode: 'numeric' } }),
		campo('asesor', 'Asesor'));

	// Servicios.
	const contLineas = h('div', { class: 'cot-lineas' });
	function inputNum(l, k, label, { sufijo, min = '0', max, step = 'any', ayuda } = {}) {
		const idc = uid(`l${c.lineas.indexOf(l)}-${k}`);
		return h('div', { class: 'col-sm-6' },
			h('label', { class: 'form-label', for: idc }, label, sufijo ? h('span', { class: 'text-muted' }, ` (${sufijo})`) : null),
			h('input', { class: 'form-control', id: idc, type: 'number', inputmode: 'decimal', min, max, step, value: l[k] ?? '', 'aria-describedby': ayuda ? `${idc}-ayuda` : undefined,
				oninput: (e) => { l[k] = e.target.value; actualizarResumenes(); cambio(); } }),
			ayuda ? h('div', { class: 'form-text', id: `${idc}-ayuda` }, ayuda) : null);
	}
	const resumenes = [];
	function pintarLineas() {
		resumenes.length = 0;
		contLineas.replaceChildren(...c.lineas.map((l, i) => {
			const sim = l.moneda === 'GTQ' ? 'Q' : 'US$';
			const idTipo = uid(`l${i}-tipo`);
			const idMon = uid(`l${i}-moneda`);
			const moneda = h('div', { class: 'col-sm-6' }, h('label', { class: 'form-label', for: idMon }, 'Moneda'),
				h('select', { class: 'form-select', id: idMon, onchange: (e) => { l.moneda = e.target.value; pintarLineas(); cambio(); } },
					MONEDAS.map(([v]) => h('option', { value: v, selected: l.moneda === v }, v === 'GTQ' ? 'Quetzales (Q)' : 'Dólares (US$)'))));
			let campos;
			if (l.tipo === 'compraventa') campos = [inputNum(l, 'precio', 'Precio del inmueble', { sufijo: sim }), moneda, inputNum(l, 'pct', 'Honorario', { sufijo: '%', max: '100' })];
			else if (l.tipo === 'arrendamiento') campos = [inputNum(l, 'renta', 'Renta mensual sin IVA', { sufijo: sim }), moneda, inputNum(l, 'anios', 'Plazo del contrato', { sufijo: 'años', min: '1', max: '30', step: '0.5', ayuda: 'De 1 a 30 años.' })];
			else if (l.tipo === 'administracion') campos = [inputNum(l, 'renta', 'Renta mensual', { sufijo: sim }), moneda, inputNum(l, 'pct', 'Honorario mensual', { sufijo: '% de la renta', max: '100' })];
			else {
				const idd = uid(`l${i}-descripcion`);
				campos = [h('div', { class: 'col-12' }, h('label', { class: 'form-label', for: idd }, 'Descripción del servicio'),
					h('input', { class: 'form-control', id: idd, value: l.descripcion || '', placeholder: 'Por ejemplo: avalúo o trámite de escritura', oninput: (e) => { l.descripcion = e.target.value; actualizarResumenes(); cambio(); } })),
				inputNum(l, 'monto', 'Honorario', { sufijo: sim }), moneda];
			}
			const resumen = h('div', { class: 'cot-linea-resumen', 'aria-live': 'polite' });
			resumenes.push([l, resumen]);
			const quitar = c.lineas.length > 1 ? h('button', { type: 'button', class: 'btn cot-quitar', 'aria-label': `Quitar ${SERVICIOS.find(([v]) => v === l.tipo)?.[1] || 'servicio'}`, title: 'Quitar servicio',
				onclick: () => { c.lineas.splice(i, 1); pintarLineas(); cambio(); } }, h('span', { class: 'icon-trash-o', 'aria-hidden': 'true' })) : null;
			return h('div', { class: 'cot-linea' },
				h('div', { class: 'cot-linea-head' },
					h('span', { class: `${ICONOS[l.tipo] || 'icon-pencil'} cot-linea-icono`, 'aria-hidden': 'true' }),
					h('label', { class: 'visually-hidden', for: idTipo }, `Servicio ${i + 1}`),
					h('select', { class: 'form-select cot-linea-tipo', id: idTipo, onchange: (e) => { const nuevo = lineaVacia(e.target.value, l.moneda); nuevo.precio = l.precio; nuevo.renta = l.renta; c.lineas[i] = nuevo; pintarLineas(); cambio(); } },
						SERVICIOS.map(([v, t]) => h('option', { value: v, selected: l.tipo === v }, t))),
					l.tipo === 'administracion' ? h('span', { class: 'cot-pendiente', title: 'El porcentaje de administración está por confirmar' }, h('span', { class: 'icon-question-circle me-1', 'aria-hidden': 'true' }), 'Por confirmar') : null,
					quitar),
				h('div', { class: 'row g-3' }, campos),
				resumen);
		}));
		actualizarResumenes();
		pintarAyudaModo();
	}
	function actualizarResumenes() {
		const r = calcularCotizacion(c);
		resumenes.forEach(([l, el], i) => {
			const x = r.lineas[c.lineas.indexOf(l)] || r.lineas[i];
			if (!x || !x.listo) { el.replaceChildren(h('span', { class: 'text-muted' }, l.tipo === 'otro' ? 'Ingresa el honorario.' : (l.tipo === 'compraventa' ? 'Ingresa el precio del inmueble.' : 'Ingresa la renta mensual.'))); return; }
			const partes = [];
			if (l.tipo === 'arrendamiento') partes.push(h('div', {}, `Contrato de ${l.anios} año${Number(l.anios) === 1 ? '' : 's'} = ${rentas(x.meses)} = `, h('strong', {}, dinero(x.honorario, x.moneda))));
			const pct = l.tipo === 'compraventa' || l.tipo === 'administracion' ? Number(l.pct) || 0 : null;
			const mes = x.mensual ? ' al mes' : '';
			if (c.regimen === 'pequeno') {
				partes.push(h('div', {}, 'Precio final: ', h('strong', {}, dinero(x.total, x.moneda) + mes),
					pct !== null && c.modo === 'todo' ? ` (${porcentaje(pctTodoIncluido(pct, 'pequeno'))})` : null));
				partes.push(h('div', { class: 'small text-muted' }, nb(`Pagas a la SAT ${dinero(x.impuesto, x.moneda)} (5 %); te quedan ${dinero(x.neto, x.moneda)}.`)));
			} else if (c.modo === 'todo') {
				partes.push(h('div', {}, 'Todo incluido: ', h('strong', {}, dinero(x.total, x.moneda) + mes), pct !== null ? ` (${porcentaje(pctTodoIncluido(pct, 'general'))})` : null));
				partes.push(h('div', { class: 'small text-muted' }, nb(`Honorario ${dinero(x.honorario, x.moneda)} + IVA 12 % ${dinero(x.impuesto, x.moneda)}`)));
			} else {
				partes.push(h('div', {}, `Honorario ${dinero(x.honorario, x.moneda)} + IVA ${dinero(x.impuesto, x.moneda)} = `, h('strong', {}, dinero(x.total, x.moneda) + mes)));
			}
			el.replaceChildren(...partes);
		});
	}
	const agregar = h('div', { class: 'cot-agregar' },
		h('span', { class: 'cot-agregar-label', id: uid('agregar') }, 'Agregar servicio'),
		h('div', { class: 'cot-agregar-botones', role: 'group', 'aria-labelledby': uid('agregar') },
			SERVICIOS.map(([v, t]) => h('button', { type: 'button', class: 'btn btn-outline-primary btn-sm cot-btn', onclick: () => {
				const ult = c.lineas[c.lineas.length - 1];
				c.lineas.push(lineaVacia(v, ult?.moneda || 'USD')); pintarLineas(); cambio();
				contLineas.lastElementChild?.querySelector('input')?.focus();
			} }, h('span', { class: `${ICONOS[v]} me-2`, 'aria-hidden': 'true' }), v === 'administracion' ? 'Administración' : t))));
	const servicios = h('section', { class: 'card cot-grupo mb-3' },
		h('div', { class: 'card-header' }, h('h2', { class: 'h6 mb-0' }, h('span', { class: 'icon-list-alt me-2', 'aria-hidden': 'true' }), 'Servicios')),
		h('div', { class: 'card-body' }, contLineas, agregar));

	const condiciones = grupo('icon-info-circle', 'Condiciones y notas',
		campo('condiciones', 'Condiciones de pago', { col: 'col-12', area: true }),
		campo('notas', 'Notas', { col: 'col-12', area: true, attrs: { placeholder: 'Opcional: algo más que el cliente deba saber' } }));

	// Documento (vista previa en pantalla y hoja impresa).
	const hoja = h('article', { class: 'cot-doc', 'aria-label': 'Vista previa de la cotización' });
	// replaceChildren escribiría «null» como texto: se quitan los vacíos antes.
	const montar = (el, ...hijos) => el.replaceChildren(...hijos.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
	function pintarDoc() {
		const r = calcularCotizacion(c);
		const general = r.regimen === 'general';
		const separado = general && r.modo === 'separado';
		const e = c.emisor || {};
		const cl = c.cliente || {};
		const dato = (etq, v) => (v ? h('div', {}, h('span', { class: 'cot-doc-etq' }, `${etq} `), v) : null);
		const listas = r.lineas.map((x, i) => ({ x, l: c.lineas[i] })).filter(({ x }) => x.listo);
		const celdaMonto = (x) => {
			const mes = x.mensual ? h('span', { class: 'cot-doc-mes' }, ' al mes') : null;
			if (separado) return [h('td', { class: 'text-end', 'data-label': 'Honorario' }, dinero(x.honorario, x.moneda)), h('td', { class: 'text-end', 'data-label': 'IVA 12 %' }, dinero(x.impuesto, x.moneda)), h('td', { class: 'text-end fw-semibold', 'data-label': 'Total' }, dinero(x.total, x.moneda), mes)];
			return [h('td', { class: 'text-end' }, h('div', { class: 'fw-semibold' }, dinero(x.total, x.moneda), mes),
				general ? h('div', { class: 'cot-doc-desglose' }, nb(`Honorario ${dinero(x.honorario, x.moneda)} + IVA ${dinero(x.impuesto, x.moneda)}`)) : null)];
		};
		const filas = listas.map(({ x, l }) => h('tr', {},
			h('td', {}, h('div', { class: 'fw-semibold' }, x.concepto,
				l.tipo === 'administracion' ? h('span', { class: 'cot-pendiente no-print ms-2' }, 'Por confirmar') : null),
			x.detalle ? h('div', { class: 'cot-doc-detalle' }, nb(x.detalle)) : null),
			celdaMonto(x)));
		const columnas = separado ? 3 : 1;
		const totales = r.totales.map((t, i) => {
			const etq = t.mensual ? 'Total mensual' : 'Total';
			const filasT = [];
			if (general) {
				filasT.push(h('tr', { class: 'cot-doc-sub' }, h('th', { scope: 'row' }, `Honorarios${t.mensual ? ' al mes' : ''}`), h('td', { class: 'text-end' }, dinero(t.honorario, t.moneda))));
				filasT.push(h('tr', { class: 'cot-doc-sub' }, h('th', { scope: 'row' }, 'IVA 12 %'), h('td', { class: 'text-end' }, dinero(t.impuesto, t.moneda))));
			}
			filasT.push(h('tr', { class: 'cot-doc-total' }, h('th', { scope: 'row' }, `${etq} (${t.moneda === 'GTQ' ? 'quetzales' : 'dólares'})`), h('td', { class: 'text-end' }, dinero(t.total, t.moneda))));
			// Cada total (único, mensual, otra moneda) empieza con aire para que no se lea pegado al anterior.
			if (i > 0) filasT[0].classList.add('cot-doc-grupo');
			return filasT;
		});
		const vence = venceEl(c.fecha, c.vigenciaDias);
		montar(hoja,
			h('header', { class: 'cot-doc-head' },
				h('div', { class: 'cot-doc-emisor' },
					h('img', { src: LOGO, alt: e.nombre || 'Equipo Inmobiliario', class: 'cot-doc-logo' }),
					h('div', { class: 'cot-doc-emisor-datos' },
						h('div', { class: 'cot-doc-emisor-nombre' }, e.nombre || 'Equipo Inmobiliario'),
						dato('NIT', e.nit),
						e.direccion ? h('div', {}, e.direccion) : null,
						[e.telefono, e.email].filter(Boolean).length ? h('div', {}, [e.telefono, e.email].filter(Boolean).join(' · ')) : null)),
				h('div', { class: 'cot-doc-titulo' },
					h('h2', { class: 'cot-doc-h' }, 'Cotización de servicios'),
					h('div', { class: 'cot-doc-num' }, c.numero || ''),
					h('div', {}, fechaLarga(c.fecha)),
					h('div', { class: 'cot-doc-etq' }, `Vigente hasta el ${fechaLarga(vence)}`))),
			h('section', { class: 'cot-doc-cliente' },
				h('div', { class: 'cot-doc-etq-sec' }, 'Para'),
				h('div', { class: 'cot-doc-cliente-nombre' }, cl.nombre || h('span', { class: 'cot-doc-falta' }, 'Nombre del cliente')),
				h('div', { class: 'cot-doc-cliente-datos' }, dato('NIT', cl.nit || 'CF'), dato('Tel.', cl.telefono), dato('Correo', cl.email)),
				c.propiedad?.texto ? h('div', { class: 'cot-doc-prop' }, h('span', { class: 'icon-home2 me-1', 'aria-hidden': 'true' }), c.propiedad.texto) : null),
			listas.length
				? h('table', { class: 'cot-doc-tabla' },
					h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Servicio'),
						separado ? [h('th', { scope: 'col', class: 'text-end' }, 'Honorario'), h('th', { scope: 'col', class: 'text-end' }, 'IVA 12 %'), h('th', { scope: 'col', class: 'text-end' }, 'Total')]
							: h('th', { scope: 'col', class: 'text-end' }, general ? 'Total (IVA incluido)' : 'Precio'))),
					h('tbody', {}, filas),
					h('tfoot', {}, totales.map((fs) => fs.map((tr) => { tr.firstChild.setAttribute('colspan', String(columnas)); return tr; }))))
				: h('p', { class: 'cot-doc-falta cot-doc-vacio' }, 'Agrega un servicio con su precio para ver los montos.'),
			r.regimen === 'pequeno' ? h('p', { class: 'cot-doc-nota' }, NOTA_PEQUENO) : null,
			c.condiciones ? h('section', { class: 'cot-doc-bloque' }, h('div', { class: 'cot-doc-etq-sec' }, 'Condiciones de pago'), h('p', {}, c.condiciones)) : null,
			c.notas ? h('section', { class: 'cot-doc-bloque' }, h('div', { class: 'cot-doc-etq-sec' }, 'Notas'), h('p', {}, c.notas)) : null,
			h('footer', { class: 'cot-doc-pie' },
				c.asesor ? h('div', {}, h('div', { class: 'cot-doc-etq-sec' }, 'Asesor'), h('div', { class: 'fw-semibold' }, c.asesor)) : h('div'),
				h('div', { class: 'cot-doc-etq' }, `Cotización válida por ${Number(c.vigenciaDias) || VIGENCIA_DEF} días.`)));
	}

	// Acciones.
	async function guardar() {
		if (!session.isAdmin && !session.agentId) { toast('Tu usuario no tiene un asesor asignado; no se puede guardar.', 'danger'); return; }
		const r = calcularCotizacion(c);
		const datos = {
			...c, vigenciaDias: Number(c.vigenciaDias) || VIGENCIA_DEF,
			agentId: c.agentId ?? session.agentId ?? '',
			totales: r.totales, updatedAt: serverTimestamp()
		};
		if (!docId) datos.agentId = session.agentId || '';
		try {
			btnGuardar.disabled = true;
			if (!docId) {
				const ref = doc(collection(db, COL));
				datos.createdAt = serverTimestamp();
				await setDoc(ref, datos);
				docId = ref.id; c.agentId = datos.agentId;
				history.replaceState(null, '', `#/cotizaciones/${encodeURIComponent(docId)}`);
			} else {
				await setDoc(doc(db, COL, docId), datos, { merge: true });
			}
			sucio = false;
			toast('Cotización guardada.');
		} catch (err) { showError(err); } finally { btnGuardar.disabled = false; }
	}
	async function guardarPredeterminados() {
		try {
			await setDoc(doc(db, 'settings', 'cotizacion'), { emisor: { ...c.emisor }, regimen: c.regimen, condiciones: c.condiciones, vigenciaDias: Number(c.vigenciaDias) || VIGENCIA_DEF }, { merge: true });
			toast('Datos predeterminados guardados.');
		} catch (err) { showError(err); }
	}
	async function copiarWhatsApp() {
		const texto = textoWhatsApp(c);
		try { await navigator.clipboard.writeText(texto); } catch {
			const ta = h('textarea', { class: 'visually-hidden' }, texto);
			document.body.append(ta); ta.select();
			try { document.execCommand('copy'); } catch { /* sin portapapeles */ }
			ta.remove();
		}
		toast('Resumen copiado. Pégalo en WhatsApp.');
	}
	async function salir(ev) {
		if (sucio) { ev.preventDefault(); if (await confirmDialog('Tienes cambios sin guardar. ¿Salir de todos modos?', { okText: 'Salir sin guardar' })) location.hash = '#/cotizaciones'; }
	}
	const btnGuardar = h('button', { type: 'button', class: 'btn btn-primary cot-btn', onclick: guardar }, h('span', { class: 'icon-floppy-o me-2', 'aria-hidden': 'true' }), 'Guardar');
	const barra = h('div', { class: 'sticky-actions cot-barra no-print' },
		btnGuardar,
		h('button', { type: 'button', class: 'btn btn-outline-primary cot-btn', onclick: () => window.print() }, h('span', { class: 'icon-file-pdf-o me-2', 'aria-hidden': 'true' }), 'Descargar PDF'),
		h('button', { type: 'button', class: 'btn btn-outline-primary cot-btn', onclick: copiarWhatsApp }, h('span', { class: 'icon-whatsapp me-2', 'aria-hidden': 'true' }), 'Copiar para WhatsApp'),
		h('a', { class: 'btn btn-link cot-btn ms-auto', href: '#/cotizaciones', onclick: salir }, 'Volver a la lista'));

	const titulo = id && !duplicar ? 'Cotización' : 'Nueva cotización';
	container.replaceChildren();
	mount(container,
		h('div', { class: 'no-print' }, pageHeader(titulo,
			h('a', { class: 'btn btn-outline-secondary cot-btn', href: '#/cotizaciones', onclick: salir }, h('span', { class: 'icon-list-alt me-2', 'aria-hidden': 'true' }), 'Mis cotizaciones'))),
		h('div', { class: 'row g-4 cot-layout' },
			h('div', { class: 'col-xl-5 cot-entradas no-print' }, emisor, cliente, servicios, condiciones),
			h('div', { class: 'col-xl-7 cot-salida' },
				h('h2', { class: 'h6 text-muted cot-salida-titulo no-print' }, h('span', { class: 'icon-receipt me-2', 'aria-hidden': 'true' }), 'Así la verá tu cliente'),
				hoja)),
		barra);
	pintarLineas();
	pintarDoc();

	// Propiedades del inventario: aparte, para que la cotización funcione aunque falle la lectura.
	try {
		const { loadAll } = await import('./properties.js');
		props = (await loadAll()).filter((p) => p.titulo || p.codigo);
		const op = (p) => h('option', { value: p.id, selected: c.propiedad.id === p.id }, [p.codigo, p.titulo, p.zona].filter(Boolean).join(' · '));
		selProp.append(
			h('optgroup', { label: 'En venta' }, props.filter((p) => p.operacion !== 'renta').map(op)),
			h('optgroup', { label: 'En renta' }, props.filter((p) => p.operacion === 'renta').map(op)));
	} catch (err) {
		console.warn('Cotización: no se pudo leer el inventario', err);
	}
}
