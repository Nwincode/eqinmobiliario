// Cotización de servicios: el asesor arma una cotización (compraventa, arrendamiento, administración u otro),
// la ve como quedará impresa, la guarda, la descarga en PDF y copia un resumen para WhatsApp.
// Los cálculos están en ../cotizacion.js (probados con `npm run test:cotizacion`).
//
// Firestore:
//  - cotizaciones/{id}            cada cotización (con copia del emisor y, si factura la empresa, la liquidación interna)
//  - settings/cotizacion          datos de la empresa, ISR %, % para el asesor, vigencia y condiciones (los edita el administrador)
//  - emisoresAsesor/{agentId}     datos del asesor para facturar (los edita el asesor y el administrador)
import {
	db, doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where, serverTimestamp
} from '../firebase.js';
import { h, mount, toast, showError, confirmDialog, emptyState, spinner, pageHeader } from '../ui.js';
import { session } from '../session.js';
import {
	REGIMENES, MODOS, SERVICIOS, MONEDAS, CONDICIONES_DEF, NOTA_PEQUENO, VIGENCIA_DEF,
	EMISORES, TIPOS_ADMIN, ISR_DEF, FUENTE_ISR, PCT_ASESOR_DEF,
	calcularCotizacion, lineaVacia, dinero, porcentaje, pctTodoIncluido, rentas, numero,
	numeroCotizacion, fechaISO, fechaLarga, venceEl, textoWhatsApp,
	pendientes, adminActiva, emisorDesde, faltanEmisor, liquidacion, etqRegimen, regimenValido
} from '../cotizacion.js';

const COL = 'cotizaciones';
const COL_ASESOR = 'emisoresAsesor';
const ICONOS = { compraventa: 'icon-handshake-o', arrendamiento: 'icon-key', administracion: 'icon-building', otro: 'icon-pencil' };
const LOGO = '/logo-equipo-inmobiliario.png';
// Espacio duro entre el símbolo y la cifra («US$ 1,500» no se parte en dos líneas). Solo para mostrar.
const nb = (t) => String(t ?? '').replace(/\b(US\$|Q) /g, '$1\u00a0').replace(/ %/g, '\u00a0%');

export async function render(container, rest = []) {
	const [accion, id] = rest;
	if (!accion) return lista(container);
	if (accion === 'empresa') return vistaEmpresa(container);
	if (accion === 'mis-datos') return vistaMisDatos(container);
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
	const misDatos = h('a', { class: 'btn btn-outline-secondary cot-btn', href: '#/cotizaciones/mis-datos' }, h('span', { class: 'icon-id-card-o me-2', 'aria-hidden': 'true' }), 'Mis datos para facturar');
	const empresa = session.isAdmin ? h('a', { class: 'btn btn-outline-secondary cot-btn', href: '#/cotizaciones/empresa' }, h('span', { class: 'icon-building-o me-2', 'aria-hidden': 'true' }), 'Datos de la empresa') : null;
	const cuerpo = h('div', {}, spinner());
	mount(container,
		pageHeader('Cotización de servicios', empresa, misDatos, nueva),
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

// ── Datos de la empresa y valores predeterminados (settings/cotizacion, con respaldo en settings/site) ──
// Antes se guardaba `emisor` + `regimen`; ahora `empresa`. Se leen los dos para no perder lo guardado.
async function predeterminados() {
	const def = {
		empresa: { razonSocial: '', nombreComercial: 'Equipo Inmobiliario', nit: '', regimen: 'general', direccion: '', telefono: '', email: '', usarLogo: true },
		isrPct: ISR_DEF, pctAsesor: PCT_ASESOR_DEF, condiciones: CONDICIONES_DEF, vigenciaDias: VIGENCIA_DEF
	};
	const lleno = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined));
	try {
		const s = await getDoc(doc(db, 'settings', 'site'));
		if (s.exists()) {
			const d = s.data();
			Object.assign(def.empresa, lleno({ nombreComercial: d.general?.nombre, telefono: d.contacto?.telefono, email: d.contacto?.email, direccion: d.contacto?.direccion }));
		}
	} catch (err) { console.warn('Cotización: no se pudo leer settings/site', err); }
	try {
		const s = await getDoc(doc(db, 'settings', 'cotizacion'));
		if (s.exists()) {
			const d = s.data();
			if (d.emisor) Object.assign(def.empresa, lleno({ nombreComercial: d.emisor.nombre, nit: d.emisor.nit, direccion: d.emisor.direccion, telefono: d.emisor.telefono, email: d.emisor.email }));
			if (d.regimen) def.empresa.regimen = regimenValido(d.regimen);
			if (d.empresa) Object.assign(def.empresa, lleno(d.empresa));
			def.empresa.regimen = regimenValido(def.empresa.regimen);
			if (Number.isFinite(d.isrPct)) def.isrPct = d.isrPct;
			if (Number.isFinite(d.pctAsesor)) def.pctAsesor = d.pctAsesor;
			if (d.condiciones) def.condiciones = d.condiciones;
			if (d.vigenciaDias) def.vigenciaDias = d.vigenciaDias;
		}
	} catch (err) { console.warn('Cotización: no se pudo leer settings/cotizacion', err); }
	return def;
}

// ── Datos del asesor para facturar (emisoresAsesor/{agentId}) ──
// El documento se llama como el asesor (agentId); un administrador sin asesor asignado usa «u-<uid>».
const claveAsesor = (agentId) => agentId || session.agentId || (session.user?.uid ? `u-${session.user.uid}` : '');
async function cargarAsesor(clave) {
	const datos = { nombre: session.profile?.nombre || '', nit: '', regimen: 'general', telefono: '', email: session.user?.email || '' };
	if (!clave) return datos;
	try {
		const s = await getDoc(doc(db, COL_ASESOR, clave));
		if (s.exists()) return { ...datos, ...s.data() };
	} catch (err) { console.warn('Cotización: no se pudieron leer los datos del asesor', err); }
	// Primera vez: se llenan con la ficha del asesor (agents/{id}) si existe.
	try {
		const s = await getDoc(doc(db, 'agents', clave));
		if (s.exists()) {
			const a = s.data();
			if (a.nombre) datos.nombre = a.nombre;
			if (a.email) datos.email = a.email;
			if (a.whatsapp) datos.telefono = a.whatsapp;
		}
	} catch { /* sin ficha */ }
	return datos;
}
async function guardarAsesor(clave, datos) {
	const limpio = Object.fromEntries(['nombre', 'nit', 'regimen', 'telefono', 'email'].map((k) => [k, String(datos[k] ?? '').trim()]));
	limpio.regimen = regimenValido(limpio.regimen);
	await setDoc(doc(db, COL_ASESOR, clave), { ...limpio, updatedAt: serverTimestamp() }, { merge: true });
}

// Campos del asesor (editor y «Mis datos para facturar»). onCambio(campo) avisa cada cambio.
function camposAsesor(datos, onCambio, pre = 'cot-asesor') {
	const fila = (k, label, { tipo = 'text', col = 'col-sm-6', attrs = {}, ayuda } = {}) => {
		const idc = `${pre}-${k}`;
		return h('div', { class: col }, h('label', { class: 'form-label', for: idc }, label),
			h('input', { class: 'form-control', id: idc, type: tipo, value: datos[k] ?? '', 'aria-describedby': ayuda ? `${idc}-ayuda` : undefined,
				oninput: (e) => { datos[k] = e.target.value; onCambio(k); }, ...attrs }),
			ayuda ? h('div', { class: 'form-text', id: `${idc}-ayuda` }, ayuda) : null);
	};
	const idr = `${pre}-regimen`;
	return [
		fila('nombre', 'Nombre como aparece en tu factura', { col: 'col-12', attrs: { autocomplete: 'name' } }),
		fila('nit', 'NIT', { attrs: { autocomplete: 'off' } }),
		h('div', { class: 'col-sm-6' }, h('label', { class: 'form-label', for: idr }, 'Régimen de IVA'),
			h('select', { class: 'form-select', id: idr, onchange: (e) => { datos.regimen = e.target.value; onCambio('regimen'); } },
				REGIMENES.map(([v, t]) => h('option', { value: v, selected: regimenValido(datos.regimen) === v }, t)))),
		fila('telefono', 'Teléfono', { tipo: 'tel', attrs: { autocomplete: 'tel' } }),
		fila('email', 'Correo', { tipo: 'email', attrs: { autocomplete: 'email' } })
	];
}

const grupoCard = (icono, titulo, ...hijos) => h('section', { class: 'card cot-grupo mb-3' },
	h('div', { class: 'card-header' }, h('h2', { class: 'h6 mb-0' }, h('span', { class: `${icono} me-2`, 'aria-hidden': 'true' }), titulo)),
	h('div', { class: 'card-body' }, h('div', { class: 'row g-3' }, hijos)));

// ── Mis datos para facturar ─────────────────────────────────────────────
async function vistaMisDatos(container) {
	container.replaceChildren(spinner());
	const clave = claveAsesor();
	const volver = h('a', { class: 'btn btn-outline-secondary cot-btn', href: '#/cotizaciones' }, h('span', { class: 'icon-list-alt me-2', 'aria-hidden': 'true' }), 'Mis cotizaciones');
	if (!clave) { container.replaceChildren(); mount(container, pageHeader('Mis datos para facturar', volver), emptyState('Tu usuario no tiene un asesor asignado. Pide al administrador que te asigne uno.')); return; }
	const datos = await cargarAsesor(clave);
	let sucio = false;
	const estado = h('span', { class: 'small text-muted', 'aria-live': 'polite' });
	const btn = h('button', { type: 'button', class: 'btn btn-primary cot-btn', onclick: async () => {
		btn.disabled = true;
		try { await guardarAsesor(clave, datos); sucio = false; estado.textContent = ''; toast('Tus datos para facturar se guardaron.'); } catch (err) { showError(err); } finally { btn.disabled = false; }
	} }, h('span', { class: 'icon-floppy-o me-2', 'aria-hidden': 'true' }), 'Guardar mis datos');
	container.replaceChildren();
	mount(container,
		pageHeader('Mis datos para facturar', volver),
		h('div', { class: 'cot-ajustes' },
			h('p', { class: 'text-muted cot-intro' }, 'Se usan cuando eliges «El asesor» en «¿Quién factura?». Se llenan solos en cada cotización nueva.'),
			grupoCard('icon-id-card-o', 'Tus datos como emisor', camposAsesor(datos, () => { sucio = true; estado.textContent = 'Cambios sin guardar'; }, 'mis')),
			h('div', { class: 'sticky-actions cot-barra' }, btn, estado)));
	window.addEventListener('hashchange', function aviso() { window.removeEventListener('hashchange', aviso); if (sucio) toast('Saliste sin guardar tus datos para facturar.', 'warning'); });
}

// ── Datos de la empresa (solo administrador) ───────────────────────────
async function vistaEmpresa(container) {
	const volver = h('a', { class: 'btn btn-outline-secondary cot-btn', href: '#/cotizaciones' }, h('span', { class: 'icon-list-alt me-2', 'aria-hidden': 'true' }), 'Cotizaciones');
	if (!session.isAdmin) { container.replaceChildren(); mount(container, pageHeader('Datos de la empresa', volver), emptyState('Solo el administrador puede cambiar los datos de la empresa.')); return; }
	container.replaceChildren(spinner());
	const def = await predeterminados();
	const emp = { ...def.empresa };
	const v = { isrPct: def.isrPct, pctAsesor: def.pctAsesor, vigenciaDias: def.vigenciaDias, condiciones: def.condiciones };
	let sucio = false;
	const estado = h('span', { class: 'small text-muted', 'aria-live': 'polite' });
	const marca = () => { sucio = true; estado.textContent = 'Cambios sin guardar'; };
	const fila = (obj, k, label, { tipo = 'text', col = 'col-sm-6', attrs = {}, ayuda, sufijo, area = false } = {}) => {
		const idc = `emp-${k}`;
		const props = { class: 'form-control', id: idc, 'aria-describedby': ayuda ? `${idc}-ayuda` : undefined, oninput: (e) => { obj[k] = e.target.value; marca(); }, ...attrs };
		const input = area ? h('textarea', { ...props, rows: 3 }, obj[k] ?? '') : h('input', { ...props, type: tipo, value: obj[k] ?? '' });
		return h('div', { class: col }, h('label', { class: 'form-label', for: idc }, label),
			sufijo ? h('div', { class: 'input-group' }, input, h('span', { class: 'input-group-text' }, sufijo)) : input,
			ayuda ? h('div', { class: 'form-text', id: `${idc}-ayuda` }, ayuda) : null);
	};
	const logo = h('div', { class: 'col-12' },
		h('div', { class: 'form-check cot-check' },
			h('input', { class: 'form-check-input', type: 'checkbox', id: 'emp-logo', checked: emp.usarLogo !== false, onchange: (e) => { emp.usarLogo = e.target.checked; marca(); } }),
			h('label', { class: 'form-check-label', for: 'emp-logo' }, 'Mostrar el logotipo en la cotización')),
		h('img', { src: LOGO, alt: '', class: 'cot-logo-muestra' }));
	const datos = grupoCard('icon-building-o', 'Datos de la empresa',
		fila(emp, 'razonSocial', 'Razón social', { col: 'col-12', attrs: { placeholder: 'Por ejemplo: Equipo Inmobiliario, Sociedad Anónima' } }),
		fila(emp, 'nombreComercial', 'Nombre comercial', { col: 'col-12', ayuda: 'Es el nombre grande de la hoja; la razón social va debajo.' }),
		fila(emp, 'nit', 'NIT', { attrs: { autocomplete: 'off' } }),
		h('div', { class: 'col-sm-6' }, h('label', { class: 'form-label', for: 'emp-regimen' }, 'Régimen de IVA'),
			h('select', { class: 'form-select', id: 'emp-regimen', onchange: (e) => { emp.regimen = e.target.value; marca(); } },
				REGIMENES.map(([r, t]) => h('option', { value: r, selected: emp.regimen === r }, t)))),
		fila(emp, 'direccion', 'Dirección', { col: 'col-12' }),
		fila(emp, 'telefono', 'Teléfono', { tipo: 'tel' }),
		fila(emp, 'email', 'Correo', { tipo: 'email' }),
		logo);
	const liq = grupoCard('icon-calculator', 'Liquidación para el asesor',
		h('p', { class: 'col-12 small text-muted mb-0' }, 'Cuando factura la empresa, cada cotización muestra (solo dentro del panel) cuánto le queda al asesor después de impuestos.'),
		fila(v, 'isrPct', 'ISR', { tipo: 'number', sufijo: '% del honorario', attrs: { min: '0', max: '100', step: 'any', inputmode: 'decimal' },
			ayuda: `${FUENTE_ISR}: 5 % sobre los primeros Q 30,000 del mes y 7 % sobre el excedente. Solo aplica en el régimen general.` }),
		fila(v, 'pctAsesor', 'Para el asesor', { tipo: 'number', sufijo: '% del neto', attrs: { min: '0', max: '100', step: 'any', inputmode: 'decimal' },
			ayuda: 'Se aplica después de impuestos. 100 % si todo el neto es del asesor. Se puede cambiar en cada cotización.' }));
	const nuevas = grupoCard('icon-file-text-o', 'Cotizaciones nuevas',
		fila(v, 'vigenciaDias', 'Vigencia', { tipo: 'number', sufijo: 'días', attrs: { min: '1', step: '1', inputmode: 'numeric' } }),
		fila(v, 'condiciones', 'Condiciones de pago', { col: 'col-12', area: true }));
	const btn = h('button', { type: 'button', class: 'btn btn-primary cot-btn', onclick: async () => {
		const n = (x) => (x === '' || x === null || x === undefined ? NaN : Number(x));
		const isr = n(v.isrPct), pa = n(v.pctAsesor), vig = n(v.vigenciaDias);
		if (!(isr >= 0 && isr <= 100) || !(pa >= 0 && pa <= 100)) { toast('El ISR y el porcentaje para el asesor van de 0 a 100.', 'danger'); return; }
		if (!(vig >= 1)) { toast('La vigencia debe ser de al menos 1 día.', 'danger'); return; }
		const empresa = Object.fromEntries(['razonSocial', 'nombreComercial', 'nit', 'direccion', 'telefono', 'email'].map((k) => [k, String(emp[k] ?? '').trim()]));
		empresa.regimen = regimenValido(emp.regimen);
		empresa.usarLogo = emp.usarLogo !== false;
		btn.disabled = true;
		try {
			await setDoc(doc(db, 'settings', 'cotizacion'), { empresa, isrPct: isr, pctAsesor: pa, vigenciaDias: Math.round(vig), condiciones: String(v.condiciones || ''), updatedAt: serverTimestamp() }, { merge: true });
			sucio = false; estado.textContent = '';
			toast('Datos de la empresa guardados.');
		} catch (err) { showError(err); } finally { btn.disabled = false; }
	} }, h('span', { class: 'icon-floppy-o me-2', 'aria-hidden': 'true' }), 'Guardar');
	container.replaceChildren();
	mount(container,
		pageHeader('Datos de la empresa', volver),
		h('div', { class: 'cot-ajustes' },
			h('p', { class: 'text-muted cot-intro' }, 'Se usan cuando en una cotización eliges «La empresa» en «¿Quién factura?». Solo el administrador los cambia.'),
			datos, liq, nuevas,
			h('div', { class: 'sticky-actions cot-barra' }, btn, estado)));
	window.addEventListener('hashchange', function aviso() { window.removeEventListener('hashchange', aviso); if (sucio) toast('Saliste sin guardar los datos de la empresa.', 'warning'); });
}

// ── Editor ──────────────────────────────────────────────────────────────
async function editor(container, id, { duplicar = false } = {}) {
	container.replaceChildren(spinner());
	const def = await predeterminados();
	const empresaActual = emisorDesde('empresa', { empresa: def.empresa });
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
			asesor: session.profile?.nombre || '', emisorTipo: 'empresa', emisor: { ...empresaActual }, regimen: empresaActual.regimen, modo: 'todo',
			cliente: { nombre: '', nit: 'CF', telefono: '', email: '' }, propiedad: { id: '', texto: '' },
			condiciones: def.condiciones, notas: '', lineas: [lineaVacia('compraventa')]
		};
	}
	// Cotizaciones de antes: sin «¿Quién factura?» se toman como de la empresa, con el régimen que tenían.
	c.emisorTipo = c.emisorTipo === 'asesor' ? 'asesor' : 'empresa';
	c.emisor ||= { ...empresaActual };
	c.emisor.tipo = c.emisorTipo;
	if (!c.emisor.regimen) c.emisor.regimen = regimenValido(c.regimen);
	if (duplicar && c.emisorTipo === 'empresa') c.emisor = { ...empresaActual };
	c.regimen = regimenValido(c.emisor.regimen);
	c.cliente ||= {}; c.propiedad ||= { id: '', texto: '' }; c.lineas ||= [];
	c.liquidacion = { pctAsesor: Number.isFinite(Number(c.liquidacion?.pctAsesor)) && c.liquidacion?.pctAsesor !== '' ? c.liquidacion.pctAsesor : def.pctAsesor };
	delete c.totales;

	// Datos del asesor que factura (los de la cotización si ya era suya; si no, los guardados en Firestore).
	const claveEmisor = claveAsesor(docId || duplicar ? c.agentId : null);
	const asesorDatos = await cargarAsesor(claveEmisor);
	if (c.emisorTipo === 'asesor' && !duplicar) Object.assign(asesorDatos, { nombre: c.emisor.nombre, nit: c.emisor.nit, regimen: c.emisor.regimen, telefono: c.emisor.telefono, email: c.emisor.email });
	let asesorSucio = false;

	const uid = (k) => `cot-${k}`;
	let sucio = false;
	const cambio = () => { sucio = true; pintarDoc(); pintarLiquidacion(); };

	// Campo de texto ligado a una ruta del estado (p. ej. 'cliente.nombre').
	const leer = (ruta) => ruta.split('.').reduce((o, k) => (o ? o[k] : undefined), c);
	const escribir = (ruta, v) => { const ks = ruta.split('.'); const ult = ks.pop(); ks.reduce((o, k) => (o[k] ||= {}), c)[ult] = v; };
	function campo(ruta, label, { tipo = 'text', col = 'col-sm-6', ayuda, attrs = {}, area = false } = {}) {
		const idc = uid(ruta.replace('.', '-'));
		const props = { class: 'form-control', id: idc, 'aria-describedby': ayuda ? `${idc}-ayuda` : undefined, oninput: (e) => { escribir(ruta, e.target.value); cambio(); }, ...attrs };
		const input = area ? h('textarea', { ...props, rows: 3 }, leer(ruta) ?? '') : h('input', { ...props, type: tipo, value: leer(ruta) ?? '' });
		return h('div', { class: col }, h('label', { class: 'form-label', for: idc }, label), input,
			ayuda ? h('div', { class: 'form-text', id: `${idc}-ayuda` }, ayuda) : null);
	}
	const grupo = (icono, titulo, ...hijos) => h('section', { class: 'card cot-grupo mb-3' },
		h('div', { class: 'card-header' }, h('h2', { class: 'h6 mb-0' }, h('span', { class: `${icono} me-2`, 'aria-hidden': 'true' }), titulo)),
		h('div', { class: 'card-body' }, h('div', { class: 'row g-3' }, hijos)));
	// Botones segmentados (radio) con el estilo de «Precio».
	const segmentado = (nombre, opciones, actual, alElegir, etiquetaId) => h('div', { class: 'btn-group cot-modo w-100', role: 'radiogroup', 'aria-labelledby': etiquetaId },
		opciones.map(([v, t]) => [
			h('input', { type: 'radio', class: 'btn-check', name: nombre, id: `${nombre}-${v}`, value: v, checked: actual === v, onchange: () => alElegir(v) }),
			h('label', { class: 'btn btn-outline-primary', for: `${nombre}-${v}` }, t)]));

	// ¿Quién factura? (asesor o empresa) y forma de presentar el precio.
	function aplicarEmisor() {
		if (c.emisorTipo === 'asesor') c.emisor = emisorDesde('asesor', { asesor: asesorDatos });
		c.regimen = regimenValido(c.emisor.regimen);
	}
	const panelEmisor = h('div', { class: 'col-12' });
	const avisoEmisor = h('div', { class: 'col-12', 'aria-live': 'polite' });
	function pintarAvisoEmisor() {
		const faltan = faltanEmisor(c.emisor);
		avisoEmisor.replaceChildren(...(faltan.length ? [h('div', { class: 'cot-aviso', role: 'status' },
			h('span', { class: 'icon-exclamation-circle cot-aviso-icono', 'aria-hidden': 'true' }),
			h('span', {}, `Falta ${faltan.join(' y ')} de quien factura. `,
				c.emisorTipo === 'asesor' ? 'Escríbelo arriba para que salga en la hoja.' : (session.isAdmin ? 'Complétalo en «Datos de la empresa».' : 'Pide al administrador que lo complete.')))] : []));
	}
	const btnAsesor = h('button', { type: 'button', class: 'btn btn-outline-primary cot-btn', onclick: async () => {
		if (!claveEmisor) { toast('Tu usuario no tiene un asesor asignado.', 'danger'); return; }
		btnAsesor.disabled = true;
		try { await guardarAsesor(claveEmisor, asesorDatos); asesorSucio = false; toast(session.isAdmin && claveEmisor !== session.agentId ? 'Datos del asesor guardados.' : 'Tus datos para facturar se guardaron.'); }
		catch (err) { showError(err); } finally { btnAsesor.disabled = false; }
	} }, h('span', { class: 'icon-floppy-o me-2', 'aria-hidden': 'true' }), session.isAdmin && claveEmisor && claveEmisor !== session.agentId ? 'Guardar datos del asesor' : 'Guardar mis datos');
	const camposDelAsesor = h('div', { class: 'row g-3' },
		camposAsesor(asesorDatos, () => { asesorSucio = true; const antes = c.regimen; aplicarEmisor(); pintarAvisoEmisor(); if (antes !== c.regimen) pintarLineas(); cambio(); }),
		h('div', { class: 'col-12 cot-acciones-campo' }, btnAsesor,
			h('span', { class: 'form-text m-0' }, 'Se guardan para tus próximas cotizaciones (también al guardar esta).')));
	function pintarPanelEmisor() {
		if (c.emisorTipo === 'asesor') { panelEmisor.replaceChildren(camposDelAsesor); return; }
		const e = c.emisor;
		const distinto = ['nombre', 'razonSocial', 'nit', 'regimen', 'direccion', 'telefono', 'email', 'logo'].some((k) => (e[k] ?? '') !== (empresaActual[k] ?? ''));
		panelEmisor.replaceChildren(h('div', { class: 'cot-emisor-resumen' },
			h('div', { class: 'cot-emisor-nombre' }, e.nombre || h('span', { class: 'text-muted' }, 'Sin nombre')),
			e.razonSocial ? h('div', { class: 'small' }, e.razonSocial) : null,
			h('div', { class: 'small' }, e.nit ? `NIT ${e.nit}` : h('span', { class: 'text-muted' }, 'Sin NIT'), ' · ', etqRegimen(e.regimen)),
			h('div', { class: 'cot-emisor-pie' },
				distinto ? h('button', { type: 'button', class: 'btn btn-outline-primary btn-sm cot-btn', onclick: () => { c.emisor = { ...empresaActual }; aplicarEmisor(); pintarPanelEmisor(); pintarAvisoEmisor(); pintarLineas(); cambio(); } },
					h('span', { class: 'icon-refresh me-2', 'aria-hidden': 'true' }), 'Usar los datos actuales') : null,
				session.isAdmin
					? h('a', { class: 'btn btn-link btn-sm cot-btn px-0', href: '#/cotizaciones/empresa', onclick: (ev) => salir(ev, '#/cotizaciones/empresa') }, h('span', { class: 'icon-pencil me-2', 'aria-hidden': 'true' }), 'Editar datos de la empresa')
					: h('span', { class: 'small text-muted cot-solo-admin' }, h('span', { class: 'icon-lock me-2', 'aria-hidden': 'true' }), 'Solo el administrador puede cambiar estos datos.'))));
	}
	const tipoEmisor = segmentado('cot-emisor', EMISORES, c.emisorTipo, (v) => {
		c.emisorTipo = v;
		c.emisor = v === 'asesor' ? emisorDesde('asesor', { asesor: asesorDatos }) : { ...empresaActual };
		aplicarEmisor(); pintarPanelEmisor(); pintarAvisoEmisor(); pintarLineas(); cambio();
		liqCard.hidden = v !== 'empresa';
	}, uid('emisor-label'));

	const modoRadios = segmentado('cot-modo', MODOS, c.modo, (v) => { c.modo = v; pintarLineas(); cambio(); }, uid('modo-label'));
	const ayudaModo = h('div', { class: 'form-text', id: uid('modo-ayuda') });
	const pintarAyudaModo = () => {
		ayudaModo.textContent = c.modo === 'todo'
			? (c.regimen === 'pequeno' ? 'Un solo precio que ya cubre el 5 % del pequeño contribuyente (honorario ÷ 0.95).' : 'Un solo precio con el IVA incluido (honorario × 1.12).')
			: (c.regimen === 'pequeno' ? 'El honorario es el precio final; el 5 % sale de ahí.' : 'Se muestran el honorario y el IVA por separado.');
	};
	const emisor = grupo('icon-id-card-o', 'Quién factura y precio',
		h('div', { class: 'col-12' }, h('span', { class: 'form-label d-block', id: uid('emisor-label') }, '¿Quién factura?'), tipoEmisor),
		panelEmisor, avisoEmisor,
		h('div', { class: 'col-12 cot-sep' }, h('span', { class: 'form-label d-block', id: uid('modo-label') }, 'Precio'), modoRadios, ayudaModo));

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
	function inputNum(l, k, label, { sufijo, min = '0', max, step = 'any', ayuda, col = 'col-sm-6' } = {}) {
		const i = c.lineas.indexOf(l);
		const idc = uid(`l${i}-${k}`);
		const describe = [ayuda ? `${idc}-ayuda` : '', l.tipo === 'administracion' ? uid(`l${i}-resumen`) : ''].filter(Boolean).join(' ');
		return h('div', { class: col },
			h('label', { class: 'form-label', for: idc }, label, sufijo ? h('span', { class: 'text-muted' }, ` (${sufijo})`) : null),
			h('input', { class: 'form-control', id: idc, type: 'number', inputmode: 'decimal', min, max, step, value: l[k] ?? '', 'aria-describedby': describe || undefined,
				oninput: (e) => { l[k] = e.target.value; e.target.classList.remove('is-invalid'); e.target.removeAttribute('aria-invalid'); actualizarResumenes(); cambio(); } }),
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
			else if (l.tipo === 'administracion') {
				// Las cotizaciones de antes no tenían tipo: eran un porcentaje.
				l.adminTipo = l.adminTipo === 'fijo' ? 'fijo' : 'pct';
				const idEtq = uid(`l${i}-admintipo`);
				const tipo = h('div', { class: 'col-12' }, h('span', { class: 'form-label d-block', id: idEtq }, 'Cómo se cobra'),
					segmentado(uid(`l${i}-admin`), TIPOS_ADMIN, l.adminTipo, (v) => { l.adminTipo = v; pintarLineas(); cambio(); contLineas.children[i]?.querySelector(`#${uid(`l${i}-${v === 'fijo' ? 'monto' : 'renta'}`)}`)?.focus(); }, idEtq));
				// Interruptor: la administración no siempre se cobra (empieza apagada).
				const idSw = uid(`l${i}-activa`);
				const interruptor = h('div', { class: 'col-12' }, h('div', { class: 'form-check form-switch cot-switch' },
					h('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', id: idSw, checked: adminActiva(l), 'aria-describedby': uid(`l${i}-resumen`),
						onchange: (e) => { l.activa = e.target.checked; pintarLineas(); cambio(); if (l.activa) document.getElementById(uid(`l${i}-${l.adminTipo === 'fijo' ? 'monto' : 'renta'}`))?.focus(); } }),
					h('label', { class: 'form-check-label', for: idSw }, 'Cobrar administración en esta cotización')));
				campos = !adminActiva(l) ? [interruptor] : l.adminTipo === 'fijo'
					? [interruptor, tipo, inputNum(l, 'monto', 'Monto mensual', { sufijo: sim }), moneda, inputNum(l, 'renta', 'Renta mensual', { sufijo: `${sim}, opcional`, ayuda: 'Solo como referencia en la hoja.' })]
					: [interruptor, tipo, inputNum(l, 'renta', 'Renta mensual', { sufijo: sim }), moneda, inputNum(l, 'pct', 'Honorario mensual', { sufijo: '% de la renta', max: '100' })];
			} else {
				const idd = uid(`l${i}-descripcion`);
				campos = [h('div', { class: 'col-12' }, h('label', { class: 'form-label', for: idd }, 'Descripción del servicio'),
					h('input', { class: 'form-control', id: idd, value: l.descripcion || '', placeholder: 'Por ejemplo: avalúo o trámite de escritura', oninput: (e) => { l.descripcion = e.target.value; actualizarResumenes(); cambio(); } })),
				inputNum(l, 'monto', 'Honorario', { sufijo: sim }), moneda];
			}
			const resumen = h('div', { class: 'cot-linea-resumen', id: uid(`l${i}-resumen`), 'aria-live': 'polite' });
			resumenes.push([l, resumen]);
			const quitar = c.lineas.length > 1 ? h('button', { type: 'button', class: 'btn cot-quitar', 'aria-label': `Quitar ${SERVICIOS.find(([v]) => v === l.tipo)?.[1] || 'servicio'}`, title: 'Quitar servicio',
				onclick: () => { c.lineas.splice(i, 1); pintarLineas(); cambio(); } }, h('span', { class: 'icon-trash-o', 'aria-hidden': 'true' })) : null;
			return h('div', { class: 'cot-linea' },
				h('div', { class: 'cot-linea-head' },
					h('span', { class: `${ICONOS[l.tipo] || 'icon-pencil'} cot-linea-icono`, 'aria-hidden': 'true' }),
					h('label', { class: 'visually-hidden', for: idTipo }, `Servicio ${i + 1}`),
					h('select', { class: 'form-select cot-linea-tipo', id: idTipo, onchange: (e) => { const nuevo = lineaVacia(e.target.value, l.moneda); nuevo.precio = l.precio; nuevo.renta = l.renta; c.lineas[i] = nuevo; pintarLineas(); cambio(); } },
						SERVICIOS.map(([v, t]) => h('option', { value: v, selected: l.tipo === v }, t))),
					quitar),
				h('div', { class: 'row g-3' }, campos),
				resumen);
		}));
		actualizarResumenes();
		pintarAyudaModo();
	}
	function actualizarResumenes() {
		const r = calcularCotizacion(c);
		const pend = pendientes(c);
		resumenes.forEach(([l, el], i) => {
			const idx = c.lineas.indexOf(l);
			const x = r.lineas[idx] || r.lineas[i];
			const p = pend.find((y) => y.linea === idx);
			el.classList.toggle('is-falta', Boolean(p));
			if (p) { el.replaceChildren(h('span', { class: 'icon-exclamation-circle me-2', 'aria-hidden': 'true' }), h('span', {}, `${p.mensaje} Sin este dato no se guarda ni se imprime.`)); return; }
			if (x?.apagada) { el.replaceChildren(h('span', { class: 'text-muted' }, 'Apagada: no sale en la cotización, ni en el PDF, ni en WhatsApp, y no suma al total.')); return; }
			if (!x || !x.listo) { el.replaceChildren(h('span', { class: 'text-muted' }, l.tipo === 'otro' ? 'Ingresa el honorario.' : (l.tipo === 'compraventa' ? 'Ingresa el precio del inmueble.' : 'Ingresa la renta mensual.'))); return; }
			const partes = [];
			if (l.tipo === 'arrendamiento') partes.push(h('div', {}, `Contrato de ${l.anios} año${Number(l.anios) === 1 ? '' : 's'} = ${rentas(x.meses)} = `, h('strong', {}, dinero(x.honorario, x.moneda))));
			const pct = l.tipo === 'compraventa' || (l.tipo === 'administracion' && l.adminTipo !== 'fijo') ? Number(l.pct) || 0 : null;
			const mes = x.mensual ? ' al mes' : '';
			if (c.regimen === 'pequeno') {
				partes.push(h('div', {}, 'Precio final: ', h('strong', {}, dinero(x.total, x.moneda) + mes),
					pct !== null && c.modo === 'todo' ? ` (${porcentaje(pctTodoIncluido(pct, 'pequeno'))})` : null));
				partes.push(h('div', { class: 'small text-muted' }, nb(`Se pagan a la SAT ${dinero(x.impuesto, x.moneda)} (5 %); quedan ${dinero(x.neto, x.moneda)}.`)));
			} else if (c.modo === 'todo') {
				partes.push(h('div', {}, 'Todo incluido: ', h('strong', {}, dinero(x.total, x.moneda) + mes), pct !== null ? ` (${porcentaje(pctTodoIncluido(pct, 'general'))})` : null));
				partes.push(h('div', { class: 'small text-muted' }, nb(`Honorario ${dinero(x.honorario, x.moneda)} + IVA 12 % ${dinero(x.impuesto, x.moneda)}`)));
			} else {
				partes.push(h('div', {}, `Honorario ${dinero(x.honorario, x.moneda)} + IVA ${dinero(x.impuesto, x.moneda)} = `, h('strong', {}, dinero(x.total, x.moneda) + mes)));
			}
			el.replaceChildren(...partes);
		});
	}
	// Antes de guardar, imprimir o copiar: la administración necesita su porcentaje o su monto.
	function revisarPendientes(accion) {
		const pend = pendientes(c);
		if (!pend.length) return true;
		pend.forEach(({ linea, campo: k }) => {
			const el = document.getElementById(uid(`l${linea}-${k}`));
			if (el) { el.classList.add('is-invalid'); el.setAttribute('aria-invalid', 'true'); }
		});
		toast(`${pend[0].mensaje} Sin ese dato no se puede ${accion}.`, 'warning');
		document.getElementById(uid(`l${pend[0].linea}-${pend[0].campo}`))?.focus();
		return false;
	}
	const agregar = h('div', { class: 'cot-agregar' },
		h('span', { class: 'cot-agregar-label', id: uid('agregar') }, 'Agregar servicio'),
		h('div', { class: 'cot-agregar-botones', role: 'group', 'aria-labelledby': uid('agregar') },
			SERVICIOS.map(([v, t]) => h('button', { type: 'button', class: 'btn btn-outline-primary btn-sm cot-btn', onclick: () => {
				const ult = c.lineas[c.lineas.length - 1];
				c.lineas.push(lineaVacia(v, ult?.moneda || 'USD')); pintarLineas(); cambio();
				contLineas.lastElementChild?.querySelector('input[type="number"], input:not([type])')?.focus();
			} }, h('span', { class: `${ICONOS[v]} me-2`, 'aria-hidden': 'true' }), v === 'administracion' ? 'Administración' : t))));
	const servicios = h('section', { class: 'card cot-grupo mb-3' },
		h('div', { class: 'card-header' }, h('h2', { class: 'h6 mb-0' }, h('span', { class: 'icon-list-alt me-2', 'aria-hidden': 'true' }), 'Servicios')),
		h('div', { class: 'card-body' }, contLineas, agregar));

	const condiciones = grupo('icon-info-circle', 'Condiciones y notas',
		campo('condiciones', 'Condiciones de pago', { col: 'col-12', area: true }),
		campo('notas', 'Notas', { col: 'col-12', area: true, attrs: { placeholder: 'Opcional: algo más que el cliente deba saber' } }));

	// Liquidación para el asesor: solo dentro del panel y solo cuando factura la empresa.
	const opcionesLiq = () => ({ isrPct: def.isrPct, pctAsesor: c.liquidacion.pctAsesor });
	const liqCuerpo = h('div', { class: 'cot-liq-cuerpo', 'aria-live': 'polite' });
	const idPctA = uid('pct-asesor');
	const pctAsesorInput = h('div', { class: 'cot-liq-pct' },
		h('label', { class: 'form-label', for: idPctA }, 'Para el asesor'),
		h('div', { class: 'input-group' },
			h('input', { class: 'form-control', id: idPctA, type: 'number', inputmode: 'decimal', min: '0', max: '100', step: 'any', value: c.liquidacion.pctAsesor ?? '', 'aria-describedby': `${idPctA}-ayuda`,
				oninput: (e) => { c.liquidacion.pctAsesor = e.target.value; sucio = true; pintarLiquidacion(); } }),
			h('span', { class: 'input-group-text' }, '% del neto')),
		h('div', { class: 'form-text', id: `${idPctA}-ayuda` }, `Después de impuestos. Predeterminado: ${numero(def.pctAsesor)} %.`));
	function pintarLiquidacion() {
		if (c.emisorTipo !== 'empresa') return;
		const ls = liquidacion(c, opcionesLiq());
		if (!ls.length) { liqCuerpo.replaceChildren(h('p', { class: 'text-muted small mb-0' }, 'Agrega un servicio con su precio para ver cuánto le queda al asesor.')); return; }
		const fila = (etq, v, { clase = '', signo = '', nota } = {}) => h('div', { class: `cot-liq-fila ${clase}` },
			h('dt', {}, etq, nota ? h('span', { class: 'cot-liq-nota' }, nota) : null),
			h('dd', {}, nb(`${signo}${v}`)));
		liqCuerpo.replaceChildren(...ls.map((t) => {
			const m = (v) => dinero(v, t.moneda);
			const mes = t.mensual ? ' al mes' : '';
			const filas = [fila(`Total cobrado${mes}`, m(t.cobrado))];
			if (t.regimen === 'general') {
				filas.push(fila('IVA a pagar (12 %)', m(t.iva), { signo: '− ' }));
				filas.push(fila(`ISR (${numero(t.isrPct)} % del honorario)`, m(t.isr), { signo: '− ', nota: FUENTE_ISR }));
			} else {
				filas.push(fila('Pequeño contribuyente (5 % del total)', m(t.impuestoPequeno), { signo: '− ' }));
			}
			filas.push(fila('Neto después de impuestos', m(t.neto), { clase: 'cot-liq-neto', signo: '= ' }));
			if (t.pctAsesor < 100) {
				filas.push(fila(`Para el asesor (${numero(t.pctAsesor)} %)`, m(t.asesor), { clase: 'cot-liq-asesor' }));
				filas.push(fila('Queda para la empresa', m(t.empresa), { clase: 'cot-liq-empresa' }));
			} else {
				filas.push(fila('Para el asesor (100 %)', m(t.asesor), { clase: 'cot-liq-asesor' }));
			}
			return h('div', { class: 'cot-liq-bloque' },
				ls.length > 1 ? h('div', { class: 'cot-liq-sub' }, `${t.mensual ? 'Cada mes' : 'Pago único'} · ${t.moneda === 'GTQ' ? 'quetzales' : 'dólares'}`) : null,
				h('dl', { class: 'cot-liq-tabla' }, filas));
		}));
	}
	const liqCard = h('section', { class: 'card cot-grupo cot-liq mb-3 no-print', hidden: c.emisorTipo !== 'empresa', 'aria-labelledby': uid('liq-titulo') },
		h('div', { class: 'card-header cot-liq-head' },
			h('h2', { class: 'h6 mb-0', id: uid('liq-titulo') }, h('span', { class: 'icon-calculator me-2', 'aria-hidden': 'true' }), 'Liquidación para el asesor'),
			h('span', { class: 'cot-interno' }, h('span', { class: 'icon-eye-slash me-1', 'aria-hidden': 'true' }), 'Interno')),
		h('div', { class: 'card-body' },
			h('p', { class: 'small text-muted cot-liq-intro' }, 'Solo la ves tú en el panel: no sale en el PDF ni en WhatsApp.'),
			liqCuerpo, pctAsesorInput,
			session.isAdmin ? h('a', { class: 'btn btn-link btn-sm cot-btn px-0', href: '#/cotizaciones/empresa', onclick: (ev) => salir(ev, '#/cotizaciones/empresa') },
				h('span', { class: 'icon-cog me-2', 'aria-hidden': 'true' }), 'Cambiar el ISR o el porcentaje predeterminado') : null));

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
		const conLogo = e.tipo !== 'asesor' && e.logo !== false;
		const dato = (etq, v) => (v ? h('div', {}, h('span', { class: 'cot-doc-etq' }, `${etq} `), v) : null);
		const listas = r.lineas.map((x, i) => ({ x, l: c.lineas[i] })).filter(({ x }) => x.listo);
		const celdaMonto = (x) => {
			const mes = x.mensual ? h('span', { class: 'cot-doc-mes' }, ' al mes') : null;
			if (separado) return [h('td', { class: 'text-end', 'data-label': 'Honorario' }, dinero(x.honorario, x.moneda)), h('td', { class: 'text-end', 'data-label': 'IVA 12 %' }, dinero(x.impuesto, x.moneda)), h('td', { class: 'text-end fw-semibold', 'data-label': 'Total' }, dinero(x.total, x.moneda), mes)];
			return [h('td', { class: 'text-end' }, h('div', { class: 'fw-semibold' }, dinero(x.total, x.moneda), mes),
				general ? h('div', { class: 'cot-doc-desglose' }, nb(`Honorario ${dinero(x.honorario, x.moneda)} + IVA ${dinero(x.impuesto, x.moneda)}`)) : null)];
		};
		const filas = listas.map(({ x }) => h('tr', {},
			h('td', {}, h('div', { class: 'fw-semibold' }, x.concepto),
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
				h('div', { class: `cot-doc-emisor${conLogo ? '' : ' sin-logo'}` },
					conLogo ? h('img', { src: LOGO, alt: e.nombre || 'Equipo Inmobiliario', class: 'cot-doc-logo' }) : null,
					h('div', { class: 'cot-doc-emisor-datos' },
						h('div', { class: 'cot-doc-emisor-nombre' }, e.nombre || h('span', { class: 'cot-doc-falta' }, 'Nombre de quien factura')),
						e.razonSocial ? h('div', {}, e.razonSocial) : null,
						dato('NIT', e.nit),
						h('div', { class: 'cot-doc-etq' }, etqRegimen(e.regimen)),
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
		if (!revisarPendientes('guardar')) return;
		aplicarEmisor();
		const r = calcularCotizacion(c);
		const pctA = Number(c.liquidacion.pctAsesor);
		const liq = c.emisorTipo === 'empresa'
			? { isrPct: def.isrPct, pctAsesor: c.liquidacion.pctAsesor === '' || !Number.isFinite(pctA) ? def.pctAsesor : pctA, totales: liquidacion(c, opcionesLiq()) }
			: null;
		const datos = {
			...c, vigenciaDias: Number(c.vigenciaDias) || VIGENCIA_DEF,
			agentId: c.agentId ?? session.agentId ?? '',
			liquidacion: liq, totales: r.totales, updatedAt: serverTimestamp()
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
			// Los datos del asesor que cambiaste aquí quedan para la próxima cotización.
			if (c.emisorTipo === 'asesor' && asesorSucio && claveEmisor) {
				try { await guardarAsesor(claveEmisor, asesorDatos); asesorSucio = false; } catch (err) { console.warn('Cotización: no se guardaron los datos del asesor', err); toast('La cotización se guardó, pero no tus datos para facturar.', 'warning'); return; }
			}
			toast('Cotización guardada.');
		} catch (err) { showError(err); } finally { btnGuardar.disabled = false; }
	}
	async function copiarWhatsApp() {
		if (!revisarPendientes('copiar')) return;
		const texto = textoWhatsApp(c);
		try { await navigator.clipboard.writeText(texto); } catch {
			const ta = h('textarea', { class: 'visually-hidden' }, texto);
			document.body.append(ta); ta.select();
			try { document.execCommand('copy'); } catch { /* sin portapapeles */ }
			ta.remove();
		}
		toast('Resumen copiado. Pégalo en WhatsApp.');
	}
	function imprimir() { if (revisarPendientes('descargar el PDF')) window.print(); }
	async function salir(ev, destino = '#/cotizaciones') {
		if (sucio || asesorSucio) { ev.preventDefault(); if (await confirmDialog('Tienes cambios sin guardar. ¿Salir de todos modos?', { okText: 'Salir sin guardar' })) location.hash = destino; }
	}
	const btnGuardar = h('button', { type: 'button', class: 'btn btn-primary cot-btn', onclick: guardar }, h('span', { class: 'icon-floppy-o me-2', 'aria-hidden': 'true' }), 'Guardar');
	const barra = h('div', { class: 'sticky-actions cot-barra no-print' },
		btnGuardar,
		h('button', { type: 'button', class: 'btn btn-outline-primary cot-btn', onclick: imprimir }, h('span', { class: 'icon-file-pdf-o me-2', 'aria-hidden': 'true' }), 'Descargar PDF'),
		h('button', { type: 'button', class: 'btn btn-outline-primary cot-btn', onclick: copiarWhatsApp }, h('span', { class: 'icon-whatsapp me-2', 'aria-hidden': 'true' }), 'Copiar para WhatsApp'),
		h('a', { class: 'btn btn-link cot-btn ms-auto', href: '#/cotizaciones', onclick: salir }, 'Volver a la lista'));

	const titulo = id && !duplicar ? 'Cotización' : 'Nueva cotización';
	container.replaceChildren();
	mount(container,
		h('div', { class: 'no-print' }, pageHeader(titulo,
			h('a', { class: 'btn btn-outline-secondary cot-btn', href: '#/cotizaciones', onclick: salir }, h('span', { class: 'icon-list-alt me-2', 'aria-hidden': 'true' }), 'Mis cotizaciones'))),
		h('div', { class: 'row g-4 cot-layout' },
			h('div', { class: 'col-xl-5 cot-entradas no-print' }, emisor, cliente, servicios, liqCard, condiciones),
			h('div', { class: 'col-xl-7 cot-salida' },
				h('h2', { class: 'h6 text-muted cot-salida-titulo no-print' }, h('span', { class: 'icon-receipt me-2', 'aria-hidden': 'true' }), 'Así la verá tu cliente'),
				hoja)),
		barra);
	pintarPanelEmisor();
	pintarAvisoEmisor();
	pintarLineas();
	pintarDoc();
	pintarLiquidacion();

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
