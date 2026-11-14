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
import { acuerdoDe, comisionDe, REGLAS_POR_DEFECTO } from '../acuerdo.js';
import { duenoDe as duenoDeCasa } from '../duenos.js';
import { h, mount, toast, showError, confirmDialog, emptyState, spinner, pageHeader, modal, cajaTabla, iconoBtn } from '../ui.js';
import { session, loadAgents } from '../session.js';
import {
	REGIMENES, MODOS, SERVICIOS, MONEDAS, CONDICIONES_DEF, NOTA_PEQUENO, VIGENCIA_DEF,
	EMISORES, TIPOS_ADMIN, ISR_DEF, ISR_ALTO_DEF, ISR_LIMITE_DEF, TC_DEF, FUENTE_ISR, PCT_ASESOR_DEF,
	calcularCotizacion, lineaVacia, dinero, porcentaje, pctTodoIncluido, rentas, numero,
	numeroCotizacion, fechaISO, fechaLarga, venceEl, textoWhatsApp,
	pendientes, adminActiva, emisorDesde, faltanEmisor, liquidacion, etqRegimen, regimenValido,
	snapshotPropiedad, snapshotCliente, datosPropiedad, buscar
} from '../cotizacion.js';

const COL = 'cotizaciones';
const COL_ASESOR = 'emisoresAsesor';
const ICONOS = { compraventa: 'icon-handshake-o', arrendamiento: 'icon-key', administracion: 'icon-building', otro: 'icon-pencil' };
const LOGO = '/logo-equipo-inmobiliario.png';
const SITIO = 'eqinmobiliario.gt';
// ¿Es la misma persona? Sin mayúsculas ni tildes, y todas las palabras del nombre corto están en el largo
// («Joaquín Pérez» y «Joaquín Pérez Ramírez»). El contacto del asesor solo sale en la hoja si coincide.
const palabras = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
function mismoNombre(a, b) {
	const [x, y] = [palabras(a), palabras(b)].sort((p, q) => p.length - q.length);
	return x.length > 0 && x.every((w) => y.includes(w));
}
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
	const misDatos = iconoBtn('icon-id-card-o', 'Mis datos para facturar', { href: '#/cotizaciones/mis-datos' });
	const empresa = session.isAdmin ? iconoBtn('icon-building-o', 'Datos de la empresa', { href: '#/cotizaciones/empresa' }) : null;
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
			iconoBtn('icon-pencil', `Abrir ${c.numero || 'cotización'}`, { href: `#/cotizaciones/${encodeURIComponent(c.id)}` }),
			h('a', { class: 'btn btn-outline-secondary btn-sm cot-btn cot-btn-icono', href: `#/cotizaciones/duplicar/${encodeURIComponent(c.id)}`, title: 'Duplicar', 'aria-label': `Duplicar ${c.numero || 'cotización'}` }, h('span', { class: 'icon-clone', 'aria-hidden': 'true' })),
			h('button', { type: 'button', class: 'btn btn-outline-danger btn-sm cot-btn cot-btn-icono', title: 'Eliminar', 'aria-label': `Eliminar ${c.numero || 'cotización'}`, onclick: () => borrar(c) }, h('span', { class: 'icon-trash-o', 'aria-hidden': 'true' })));
		cuerpo.replaceChildren(cajaTabla(
			h('table', { class: 'table table-hover table-admin' },
				h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Número'), h('th', { scope: 'col' }, 'Fecha'), h('th', { scope: 'col' }, 'Cliente'), h('th', { scope: 'col', class: 'text-end' }, 'Total'), h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Acciones')))),
				h('tbody', {}, items.map((c) => h('tr', {},
					h('td', {}, h('a', { href: `#/cotizaciones/${encodeURIComponent(c.id)}`, class: 'fw-semibold' }, c.numero || 'Sin número')),
					h('td', {}, fechaLarga(c.fecha)),
					h('td', {}, c.cliente?.nombre || h('span', { class: 'text-muted' }, 'Sin nombre'),
						c.propiedad?.texto ? h('div', { class: 'small text-muted' }, c.propiedad.texto) : null),
					h('td', { class: 'text-end text-nowrap' }, total(c)),
					h('td', { class: 'text-end' }, acciones(c)))))), { tarjeta: true }));
	};
	pintar();
}

// ── Datos de la empresa y valores predeterminados (settings/cotizacion, con respaldo en settings/site) ──
// Antes se guardaba `emisor` + `regimen`; ahora `empresa`. Se leen los dos para no perder lo guardado.
async function predeterminados() {
	const def = {
		empresa: { razonSocial: '', nombreComercial: 'Equipo Inmobiliario', nit: '', regimen: 'general', direccion: '', telefono: '', email: '', usarLogo: true },
		isrPct: ISR_DEF, isrPctAlto: ISR_ALTO_DEF, isrLimite: ISR_LIMITE_DEF, tipoCambio: TC_DEF, pctAsesor: PCT_ASESOR_DEF, condiciones: CONDICIONES_DEF, vigenciaDias: VIGENCIA_DEF
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
			for (const k of ['isrPct', 'isrPctAlto', 'isrLimite', 'tipoCambio']) if (Number.isFinite(d[k])) def[k] = d[k];
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
	const v = { isrPct: def.isrPct, isrPctAlto: def.isrPctAlto, isrLimite: def.isrLimite, tipoCambio: def.tipoCambio, pctAsesor: def.pctAsesor, vigenciaDias: def.vigenciaDias, condiciones: def.condiciones };
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
		h('p', { class: 'col-12 small mb-0' }, `ISR en el régimen general (${FUENTE_ISR}): un porcentaje hasta el límite y otro sobre lo que pase de él. Ejemplo con Q 50,000: 5 % de 30,000 (Q 1,500) + 7 % de 20,000 (Q 1,400) = Q 2,900.`),
		fila(v, 'isrPct', 'ISR hasta el límite', { tipo: 'number', sufijo: '%', attrs: { min: '0', max: '100', step: 'any', inputmode: 'decimal' } }),
		fila(v, 'isrPctAlto', 'ISR sobre el excedente', { tipo: 'number', sufijo: '%', attrs: { min: '0', max: '100', step: 'any', inputmode: 'decimal' } }),
		fila(v, 'isrLimite', 'Límite', { tipo: 'number', sufijo: 'quetzales', attrs: { min: '0', step: 'any', inputmode: 'decimal' } }),
		fila(v, 'tipoCambio', 'Tipo de cambio', { tipo: 'number', sufijo: 'Q por US$', attrs: { min: '0', step: 'any', inputmode: 'decimal' },
			ayuda: 'Para pasar el límite a dólares cuando el honorario está en US$.' }),
		fila(v, 'pctAsesor', 'Porcentaje para el asesor', { tipo: 'number', sufijo: '% del neto', attrs: { min: '0', max: '100', step: 'any', inputmode: 'decimal' },
			ayuda: 'Se aplica después de impuestos. 100 % si todo el neto es del asesor. Se puede cambiar en cada cotización.' }));
	const nuevas = grupoCard('icon-file-text-o', 'Cotizaciones nuevas',
		fila(v, 'vigenciaDias', 'Vigencia', { tipo: 'number', sufijo: 'días', attrs: { min: '1', step: '1', inputmode: 'numeric' } }),
		fila(v, 'condiciones', 'Condiciones de pago', { col: 'col-12', area: true }));
	const btn = h('button', { type: 'button', class: 'btn btn-primary cot-btn', onclick: async () => {
		const n = (x) => (x === '' || x === null || x === undefined ? NaN : Number(x));
		const isr = n(v.isrPct), isrAlto = n(v.isrPctAlto), lim = n(v.isrLimite), tc = n(v.tipoCambio), pa = n(v.pctAsesor), vig = n(v.vigenciaDias);
		if (!(isr >= 0 && isr <= 100) || !(isrAlto >= 0 && isrAlto <= 100) || !(pa >= 0 && pa <= 100)) { toast('Los porcentajes de ISR y para el asesor van de 0 a 100.', 'danger'); return; }
		if (!(lim >= 0) || !(tc > 0)) { toast('Revisa el límite y el tipo de cambio.', 'danger'); return; }
		if (!(vig >= 1)) { toast('La vigencia debe ser de al menos 1 día.', 'danger'); return; }
		const empresa = Object.fromEntries(['razonSocial', 'nombreComercial', 'nit', 'direccion', 'telefono', 'email'].map((k) => [k, String(emp[k] ?? '').trim()]));
		empresa.regimen = regimenValido(emp.regimen);
		empresa.usarLogo = emp.usarLogo !== false;
		btn.disabled = true;
		try {
			await setDoc(doc(db, 'settings', 'cotizacion'), { empresa, isrPct: isr, isrPctAlto: isrAlto, isrLimite: lim, tipoCambio: tc, pctAsesor: pa, vigenciaDias: Math.round(vig), condiciones: String(v.condiciones || ''), updatedAt: serverTimestamp() }, { merge: true });
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
		if (duplicar) { c.numero = numeroCotizacion(); c.fecha = fechaISO(); c.cliente = snapshotCliente(null); delete c.createdAt; }
	} else {
		c = {
			numero: numeroCotizacion(), fecha: fechaISO(), vigenciaDias: def.vigenciaDias,
			asesor: session.profile?.nombre || '', emisorTipo: 'empresa', emisor: { ...empresaActual }, regimen: empresaActual.regimen, modo: 'todo',
			cliente: snapshotCliente(null), propiedad: snapshotPropiedad(null),
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
		pintarAyudaEmisor();
	}, uid('emisor-label'));
	const ayudaEmisor = h('div', { class: 'form-text', id: uid('emisor-ayuda') });
	tipoEmisor.setAttribute('aria-describedby', uid('emisor-ayuda'));
	function pintarAyudaEmisor() {
		ayudaEmisor.textContent = c.emisorTipo === 'empresa'
			? 'La factura sale a nombre de la empresa. Abajo ves cuánto le toca al asesor después de impuestos (eso no lo ve el cliente).'
			: 'La factura sale a nombre del asesor, con su NIT y su régimen de IVA.';
	}
	pintarAyudaEmisor();

	const modoRadios = segmentado('cot-modo', MODOS, c.modo, (v) => { c.modo = v; pintarLineas(); cambio(); }, uid('modo-label'));
	const ayudaModo = h('div', { class: 'form-text', id: uid('modo-ayuda') });
	const pintarAyudaModo = () => {
		ayudaModo.textContent = c.modo === 'todo'
			? (c.regimen === 'pequeno' ? 'Un solo precio que ya cubre el 5 % del pequeño contribuyente (honorario ÷ 0.95).' : 'Un solo precio con el IVA incluido (honorario × 1.12).')
			: (c.regimen === 'pequeno' ? 'El honorario es el precio final; el 5 % sale de ahí.' : 'Se muestran el honorario y el IVA por separado.');
	};
	const emisor = grupo('icon-id-card-o', 'Quién factura y precio',
		h('div', { class: 'col-12' }, h('span', { class: 'form-label d-block', id: uid('emisor-label') }, '¿Quién factura?'), tipoEmisor, ayudaEmisor),
		panelEmisor, avisoEmisor,
		h('div', { class: 'col-12 cot-sep' }, h('span', { class: 'form-label d-block', id: uid('modo-label') }, 'Precio'), modoRadios, ayudaModo));

	// Cliente y propiedad: se eligen de los registros (Clientes y Propiedades), nunca se escriben a mano.
	// Se guarda el id y una copia de los datos, para que la hoja no cambie si después se edita el registro.
	function selector({ clave, etiqueta, placeholder, ayuda, enlace, campos, opcion, tarjeta, alQuitar, alElegir }) {
		const idc = uid(`${clave}-buscar`);
		const listaId = `${idc}-lista`;
		let items = null; let fallo = false; let vistos = []; let actual = -1; let buscando = false;
		const input = h('input', { class: 'form-control cot-sel-input', id: idc, type: 'search', role: 'combobox', autocomplete: 'off', spellcheck: 'false',
			'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listaId, 'aria-describedby': `${idc}-ayuda`, placeholder });
		const lista = h('ul', { class: 'cot-sel-lista', id: listaId, role: 'listbox', 'aria-label': etiqueta });
		const nada = h('div', { class: 'cot-sel-nada' });
		const panel = h('div', { class: 'cot-sel-panel', hidden: true }, lista, nada);
		const anuncio = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
		const cancelar = h('button', { type: 'button', class: 'btn btn-link btn-sm cot-btn px-0 cot-sel-cancelar', hidden: true, onclick: () => { buscando = false; pintar(); vista.querySelector('button')?.focus(); } }, 'Cancelar');
		const buscador = h('div', { class: 'cot-sel-buscador' },
			h('div', { class: 'cot-sel-caja' }, h('span', { class: 'icon-search cot-sel-lupa', 'aria-hidden': 'true' }), input, panel),
			h('div', { class: 'form-text cot-sel-ayuda', id: `${idc}-ayuda` }, h('span', {}, ayuda), ' ', enlace, cancelar));
		const vista = h('div', { class: 'cot-sel-vista' });
		const raiz = h('div', { class: 'col-12 cot-sel' }, h('label', { class: 'form-label', for: idc }, etiqueta), vista, buscador, anuncio);

		const abierto = () => !panel.hidden;
		function cerrar() { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); actual = -1; }
		function marcar(i) {
			actual = i;
			[...lista.children].forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
			const li = lista.children[i];
			if (li) { input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
		}
		function abrir() {
			if (items === null) { lista.replaceChildren(); nada.textContent = fallo ? 'No se pudo leer la lista. Recarga la página.' : 'Cargando…'; }
			else {
				vistos = buscar(items, input.value, campos, 8);
				lista.replaceChildren(...vistos.map((x, i) => h('li', { id: `${idc}-op-${i}`, role: 'option', class: 'cot-sel-op', 'aria-selected': 'false',
					onmousedown: (ev) => ev.preventDefault(), onclick: () => elegir(x) }, opcion(x))));
				nada.textContent = vistos.length ? '' : (items.length ? 'No hay coincidencias.' : 'Todavía no hay registros.');
				anuncio.textContent = vistos.length ? `${vistos.length} ${vistos.length === 1 ? 'resultado' : 'resultados'}` : nada.textContent;
			}
			nada.hidden = !nada.textContent;
			panel.hidden = false; input.setAttribute('aria-expanded', 'true'); marcar(-1);
		}
		function elegir(x) { alElegir(x); buscando = false; input.value = ''; cerrar(); pintar(); cambio(); vista.querySelector('button')?.focus(); anuncio.textContent = `Elegido: ${opcion(x).textContent ?? ''}`; }
		input.addEventListener('input', abrir);
		input.addEventListener('focus', abrir);
		input.addEventListener('blur', () => setTimeout(cerrar, 120));
		input.addEventListener('keydown', (ev) => {
			if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
				ev.preventDefault(); if (!abierto()) abrir();
				const n = vistos.length; if (!n) return;
				marcar(ev.key === 'ArrowDown' ? (actual + 1) % n : (actual - 1 + n) % n);
			} else if (ev.key === 'Enter') {
				if (abierto() && vistos[actual]) { ev.preventDefault(); elegir(vistos[actual]); }
				else if (abierto() && vistos.length === 1) { ev.preventDefault(); elegir(vistos[0]); }
			} else if (ev.key === 'Escape') {
				if (abierto()) { ev.preventDefault(); ev.stopPropagation(); cerrar(); }
				else if (buscando && !cancelar.hidden) { ev.preventDefault(); cancelar.click(); }
			}
		});
		const accion = (icono, texto, alClic, etq) => h('button', { type: 'button', class: 'btn btn-sm cot-sel-accion', 'aria-label': etq, onclick: alClic },
			h('span', { class: `${icono} me-1`, 'aria-hidden': 'true' }), texto);
		function pintar() {
			const t = tarjeta();
			const mostrarBuscador = !t || buscando;
			if (t) {
				vista.replaceChildren(h('div', { class: `cot-sel-tarjeta${t.anterior ? ' is-anterior' : ''}` }, t.foto,
					h('div', { class: 'cot-sel-txt' }, t.titulo, t.sub),
					h('div', { class: 'cot-sel-acciones' },
						accion('icon-exchange', t.anterior ? 'Elegir de la lista' : 'Cambiar', () => { buscando = true; pintar(); input.focus(); }, `${t.anterior ? 'Elegir de la lista' : 'Cambiar'}: ${etiqueta.toLowerCase()}`),
						accion('icon-times', 'Quitar', () => { alQuitar(); buscando = false; pintar(); cambio(); input.focus(); }, `Quitar ${etiqueta.toLowerCase()}`))));
			} else vista.replaceChildren();
			vista.hidden = !t || buscando;
			buscador.hidden = !mostrarBuscador;
			cancelar.hidden = !(t && buscando);
		}
		pintar();
		return { el: raiz, cargar(lista) { items = lista; if (abierto()) abrir(); }, fallar() { fallo = true; if (abierto()) abrir(); }, pintar };
	}
	const enlaceA = (icono, texto, destino) => h('a', { class: 'cot-sel-enlace', href: destino, onclick: (ev) => salir(ev, destino) },
		h('span', { class: `${icono} me-1`, 'aria-hidden': 'true' }), texto);
	const miniatura = (foto, alt, clase = 'cot-sel-foto') => (foto?.url
		? h('img', { class: clase, src: foto.url, alt, width: 56, height: 56, decoding: 'async' })
		: h('span', { class: `${clase} is-vacia`, role: 'img', 'aria-label': 'Sin foto' }, h('span', { class: 'icon-camera', 'aria-hidden': 'true' })));

	const selCliente = selector({
		clave: 'cliente', etiqueta: 'Cliente',
		placeholder: 'Busca por nombre, teléfono o correo',
		ayuda: '¿No está?', enlace: enlaceA('icon-user-plus', 'Agrégalo en Clientes', '#/clientes/nuevo'),
		campos: ['nombre', 'telefono', 'email', 'nit'],
		opcion: (x) => h('span', { class: 'cot-sel-op-txt' }, h('span', { class: 'cot-sel-op-nombre' }, x.nombre || 'Sin nombre'),
			h('span', { class: 'cot-sel-op-sub' }, [x.telefono, x.email].filter(Boolean).join(' · ') || 'Sin teléfono ni correo')),
		tarjeta: () => {
			const cl = c.cliente;
			if (!cl.id && !cl.nombre) return null;
			const datos = [`NIT ${cl.nit || 'CF'}`, cl.telefono, cl.email].filter(Boolean).join(' · ');
			return { anterior: !cl.id,
				titulo: h('div', { class: 'cot-sel-nombre' }, cl.nombre || 'Sin nombre'),
				sub: [h('div', { class: 'cot-sel-sub' }, datos),
					!cl.id ? h('div', { class: 'cot-sel-nota' }, 'Escrito en una cotización anterior. Elígelo de la lista para tomar sus datos de Clientes.') : null] };
		},
		alQuitar: () => { c.cliente = snapshotCliente(null); },
		alElegir: (x) => { c.cliente = snapshotCliente(x); }
	});
	let tiposProp = [];
	const selPropiedad = selector({
		clave: 'propiedad', etiqueta: 'Propiedad (opcional)',
		placeholder: 'Busca por código, título o zona',
		ayuda: 'Al elegirla se llenan el cliente (su propietario), el asesor y el precio. ¿No está?', enlace: enlaceA('icon-plus', 'Agrégala en Propiedades', '#/propiedades/nuevo'),
		campos: ['codigo', 'titulo', 'zona', 'ciudad', 'direccion'],
		opcion: (x) => { const s = snapshotPropiedad(x, tiposProp); const d = datosPropiedad(s); return h('span', { class: 'cot-sel-op-txt cot-sel-op-prop' }, miniatura(s.foto, '', 'cot-sel-op-foto'),
			h('span', {}, h('span', { class: 'cot-sel-op-nombre' }, d.titulo), h('span', { class: 'cot-sel-op-sub' }, [s.codigo, d.rasgos[0], s.zona].filter(Boolean).join(' · ')))); },
		tarjeta: () => {
			const p = c.propiedad;
			if (!p.id && !p.texto) return null;
			const d = datosPropiedad(p);
			const anterior = !p.titulo && !p.codigo;
			return { anterior: anterior && !p.id,
				foto: miniatura(p.foto, p.foto?.alt || d.titulo),
				titulo: h('div', { class: 'cot-sel-nombre' }, d.titulo),
				sub: [h('div', { class: 'cot-sel-sub' }, [d.codigo, ...d.rasgos.slice(0, 1), d.lugar].filter(Boolean).join(' · ')),
					anterior ? h('div', { class: 'cot-sel-nota' }, 'Guardada en una cotización anterior, sin foto ni datos. Elígela de la lista para completarlos.') : null] };
		},
		alQuitar: () => elegirPropiedad(null),
		alElegir: (p) => elegirPropiedad(p)
	});
	// Inventario, propietarios y asesores: de ahí sale todo lo que se llena solo al elegir un inmueble.
	let inventario = [];
	let duenos = [];
	let agentes = [];
	// Regla general de comisión (settings/crm); hasta que se lea vale la de siempre.
	let reglas = null;
	const duenoDe = (pid) => (pid ? duenoDeCasa(inventario.find((p) => p.id === pid) || { id: pid }, duenos) : null);
	const agenteDe = (pid) => agentes.find((a) => a.id === inventario.find((p) => p.id === pid)?.agentId);
	const nombreSesion = session.profile?.nombre || '';
	function ponerAsesor(a) {
		c.asesor = a ? a.nombre : nombreSesion;
		if (a) c.asesorContacto = { telefono: a.telefono || a.whatsapp || '', email: a.email || '' }; else delete c.asesorContacto;
	}
	// Al elegir, cambiar o quitar el inmueble se reemplaza lo que venía del anterior (cliente, asesor, precio y moneda).
	// Lo que el usuario escribió a mano se respeta: solo se toca lo que está vacío o coincide con el inmueble anterior.
	function elegirPropiedad(p) {
		const antes = c.propiedad;
		c.propiedad = snapshotPropiedad(p, tiposProp);
		const duenoAntes = duenoDe(antes.id);
		if (!c.cliente.nombre || (duenoAntes && c.cliente.id === duenoAntes.id)) c.cliente = snapshotCliente(p ? duenoDe(p.id) : null);
		const agenteAntes = agenteDe(antes.id);
		if (!c.asesor || mismoNombre(c.asesor, nombreSesion) || (agenteAntes && c.asesor === agenteAntes.nombre)) ponerAsesor(p ? agenteDe(p.id) : null);
		const base = (l) => (l.tipo === 'compraventa' ? 'precio' : l.tipo === 'arrendamiento' || l.tipo === 'administracion' ? 'renta' : '');
		const i = c.lineas.findIndex((l) => base(l) && (!l[base(l)] || Number(l[base(l)]) === antes.precio));
		if (i >= 0) {
			const op = c.propiedad.operacion;
			const tipo = op === 'venta' ? 'compraventa' : op === 'renta' && base(c.lineas[i]) !== 'renta' ? 'arrendamiento' : c.lineas[i].tipo;
			const l = tipo === c.lineas[i].tipo ? c.lineas[i] : (c.lineas[i] = lineaVacia(tipo, 'USD', reglas));
			// La tarifa por noche de una renta vacacional no es base de ningún servicio: se deja para escribirla.
			l[base(l)] = p && op !== 'vacacional' ? c.propiedad.precio ?? '' : '';
			if (p) l.moneda = c.propiedad.moneda;
			// Comisión de este inmueble (comisionDe: su acuerdo en privado/acuerdo, o lo que quedó en su dueño; si no, la
			// regla general): el % de la compraventa o los meses por año del arrendamiento, y cómo se cobra.
			if (p && ['compraventa', 'arrendamiento'].includes(l.tipo) && ['venta', 'renta'].includes(op)) {
				const pid = p.id;
				getDoc(doc(db, 'properties', pid, 'privado', 'acuerdo')).then((s) => (s.exists() ? s.data() : null), () => null).then((propio) => {
					if (c.propiedad.id !== pid || !c.lineas.includes(l)) return;
					const com = comisionDe(op, acuerdoDe(propio, duenoDe(pid), op), reglas);
					// Lo acordado manda; la regla general solo llena lo que nadie cambió a mano.
					const intacto = (v, campo) => v === '' || v == null || [REGLAS_POR_DEFECTO[campo], reglas?.[campo]].some((b) => b != null && Number(v) === Number(b));
					if (l.tipo === 'compraventa' && com.tipo === 'pct' && (com.fuente === 'acuerdo' || intacto(l.pct, 'comisionVentaPct'))) l.pct = com.valor;
					if (l.tipo === 'arrendamiento' && com.tipo === 'meses' && (com.fuente === 'acuerdo' || intacto(l.mesesPorAnio, 'comisionRentaMeses'))) l.mesesPorAnio = com.valor;
					if (com.modo && com.modo !== c.modo) { c.modo = com.modo; const r = modoRadios.querySelector(`input[value="${com.modo}"]`); if (r) r.checked = true; pintarAyudaModo(); }
					pintarLineas(); cambio();
				});
			}
		}
		selCliente.pintar(); pintarAsesor(); pintarLineas();
	}
	// Asesor: lista de todos los asesores; un nombre guardado que ya no está en la lista se conserva.
	const selAsesor = h('select', { class: 'form-select', id: uid('asesor'), onchange: (e) => { ponerAsesor(agentes.find((a) => a.nombre === e.target.value)); if (!c.asesorContacto) c.asesor = e.target.value; cambio(); } });
	function pintarAsesor() {
		const nombres = [...new Set([c.asesor, ...agentes.map((a) => a.nombre)].filter(Boolean))];
		selAsesor.replaceChildren(...(c.asesor ? [] : [h('option', { value: '' }, 'Elige el asesor')]), ...nombres.map((n) => h('option', { value: n, selected: n === c.asesor }, n)));
	}
	pintarAsesor();
	const cliente = grupo('icon-user', 'Cliente y cotización',
		selCliente.el,
		selPropiedad.el,
		h('div', { class: 'col-12 cot-sep p-0' }),
		campo('numero', 'Número', { attrs: { autocomplete: 'off' } }),
		campo('fecha', 'Fecha', { tipo: 'date' }),
		campo('vigenciaDias', 'Vigencia (días)', { tipo: 'number', attrs: { min: '1', step: '1', inputmode: 'numeric' } }),
		h('div', { class: 'col-sm-6' }, h('label', { class: 'form-label', for: selAsesor.id }, 'Asesor'), selAsesor));

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
					h('select', { class: 'form-select cot-linea-tipo', id: idTipo, onchange: (e) => { const nuevo = lineaVacia(e.target.value, l.moneda, reglas); nuevo.precio = l.precio; nuevo.renta = l.renta; c.lineas[i] = nuevo; pintarLineas(); cambio(); } },
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
				c.lineas.push(lineaVacia(v, ult?.moneda || 'USD', reglas)); pintarLineas(); cambio();
				contLineas.lastElementChild?.querySelector('input[type="number"], input:not([type])')?.focus();
			} }, h('span', { class: `${ICONOS[v]} me-2`, 'aria-hidden': 'true' }), v === 'administracion' ? 'Administración' : t))));
	const servicios = h('section', { class: 'card cot-grupo mb-3' },
		h('div', { class: 'card-header' }, h('h2', { class: 'h6 mb-0' }, h('span', { class: 'icon-list-alt me-2', 'aria-hidden': 'true' }), 'Servicios')),
		h('div', { class: 'card-body' }, contLineas, agregar));

	const condiciones = grupo('icon-info-circle', 'Condiciones y notas',
		campo('condiciones', 'Condiciones de pago', { col: 'col-12', area: true }),
		campo('notas', 'Notas', { col: 'col-12', area: true, attrs: { placeholder: 'Opcional: algo más que el cliente deba saber' } }));

	// Liquidación para el asesor: solo dentro del panel y solo cuando factura la empresa.
	const opcionesLiq = () => ({ isrPct: def.isrPct, isrPctAlto: def.isrPctAlto, isrLimite: def.isrLimite, tipoCambio: def.tipoCambio, pctAsesor: c.liquidacion.pctAsesor });
	const liqCuerpo = h('div', { class: 'cot-liq-cuerpo', 'aria-live': 'polite' });
	const idPctA = uid('pct-asesor');
	const pctAsesorInput = h('div', { class: 'cot-liq-pct' },
		h('label', { class: 'form-label', for: idPctA }, 'Porcentaje para el asesor'),
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
			const filas = [fila(`Total que paga el cliente${mes}`, m(t.cobrado))];
			if (t.regimen === 'general') {
				filas.push(fila('IVA a pagar (12 %)', m(t.iva), { signo: '− ' }));
				const tramos = t.isrBaseAlta > 0
					? `${numero(t.isrPct)} % de ${m(t.isrBaseBaja)} + ${numero(t.isrPctAlto)} % de ${m(t.isrBaseAlta)}`
					: `${numero(t.isrPct)} % del honorario; ${numero(t.isrPctAlto)} % sobre lo que pase de ${m(t.isrLimite)}`;
				filas.push(fila('ISR', m(t.isr), { signo: '− ', nota: `${tramos}${t.moneda === 'USD' ? ` (límite Q ${numero(t.isrLimiteQ)} a ${numero(def.tipoCambio)})` : ''}` }));
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
		const listas = r.lineas.map((x, i) => ({ x, l: c.lineas[i] })).filter(({ x }) => x.listo);
		const m = (v, mon) => nb(dinero(v, mon));
		const mes = (x) => (x.mensual ? h('span', { class: 'cot-doc-mes' }, ' al mes') : null);
		const ico = (clase) => h('span', { class: `${clase} cot-doc-ico`, 'aria-hidden': 'true' });

		// Encabezado: marca a la izquierda; datos fiscales y de contacto debajo, en letra pequeña.
		const fiscal = [e.razonSocial, e.nit ? `NIT ${e.nit}` : null, etqRegimen(e.regimen)].filter(Boolean).join(' · ');
		const contacto = [e.direccion, e.telefono, e.email].filter(Boolean);
		const vence = venceEl(c.fecha, c.vigenciaDias);
		const meta = (etq, v, clase = '') => h('div', { class: `cot-doc-meta-item ${clase}` }, h('dt', {}, etq), h('dd', {}, v));
		const cabecera = h('header', { class: 'cot-doc-head' },
			h('div', { class: `cot-doc-marca${conLogo ? '' : ' sin-logo'}` },
				conLogo ? h('img', { src: LOGO, alt: '', class: 'cot-doc-logo' }) : null,
				h('div', { class: 'cot-doc-marca-txt' },
					h('div', { class: 'cot-doc-emisor-nombre' }, e.nombre || h('span', { class: 'cot-doc-falta' }, 'Nombre de quien factura')),
					h('div', { class: 'cot-doc-fiscal' }, fiscal))),
			contacto.length ? h('div', { class: 'cot-doc-contacto' }, contacto.map((t) => h('div', {}, nb(t)))) : null);
		const titulo = h('div', { class: 'cot-doc-tit' },
			h('h2', { class: 'cot-doc-h' }, 'Cotización de servicios'),
			h('dl', { class: 'cot-doc-meta' },
				meta('Número', c.numero || '—', 'is-num'),
				meta('Fecha', fechaLarga(c.fecha) || '—'),
				meta('Vigente hasta', fechaLarga(vence) || '—')));

		// Cliente e inmueble lado a lado (con la foto del inmueble), tomados de la copia guardada.
		const datoCl = [`NIT ${cl.nit || 'CF'}`, cl.telefono, cl.email].filter(Boolean);
		const pr = c.propiedad || {};
		const dp = pr.id || pr.texto ? datosPropiedad(pr) : null;
		const fotoDoc = pr.foto?.url
			? h('img', { class: 'cot-doc-foto', src: pr.foto.url, alt: pr.foto.alt || dp?.titulo || 'Foto del inmueble', width: 84, height: 84, decoding: 'async' })
			: h('span', { class: 'cot-doc-foto is-vacia', role: 'img', 'aria-label': 'Sin foto' }, h('span', { class: 'icon-camera', 'aria-hidden': 'true' }));
		const preparada = h('section', { class: `cot-doc-para${dp ? '' : ' sin-prop'}`, 'aria-label': 'Cliente e inmueble' },
			h('div', { class: 'cot-doc-para-col' },
				h('h3', { class: 'cot-doc-etq-sec' }, ico('icon-user'), 'Cliente'),
				h('div', { class: 'cot-doc-cliente-nombre' }, cl.nombre || h('span', { class: 'cot-doc-falta' }, 'Elige el cliente')),
				h('div', { class: 'cot-doc-cliente-datos' }, datoCl.map((t) => h('span', {}, nb(t))))),
			dp ? h('div', { class: 'cot-doc-para-col cot-doc-inmueble' },
				h('h3', { class: 'cot-doc-etq-sec' }, ico('icon-home2'), 'Inmueble'),
				h('div', { class: 'cot-doc-inmueble-fila' }, fotoDoc,
					h('div', { class: 'cot-doc-inmueble-txt' },
						h('div', { class: 'cot-doc-prop-nombre' }, dp.titulo),
						dp.codigo || dp.lugar ? h('div', { class: 'cot-doc-cliente-datos' }, dp.codigo ? h('span', {}, `Código ${dp.codigo}`) : null, dp.lugar ? h('span', {}, dp.lugar) : null) : null,
						dp.rasgos.length ? h('ul', { class: 'cot-doc-rasgos' }, dp.rasgos.map((t) => h('li', {}, nb(t)))) : null))) : null);

		// Servicios: descripción, base y cálculo, montos.
		const colMonto = general ? 'Total (IVA incluido)' : 'Monto';
		const cabeza = h('thead', {}, h('tr', {},
			h('th', { scope: 'col' }, 'Servicio'),
			h('th', { scope: 'col', class: 'cot-doc-col-base' }, 'Base y cálculo'),
			separado ? [h('th', { scope: 'col', class: 'text-end' }, 'Honorario'), h('th', { scope: 'col', class: 'text-end' }, 'IVA 12 %'), h('th', { scope: 'col', class: 'text-end' }, 'Total')]
				: h('th', { scope: 'col', class: 'text-end' }, colMonto)));
		const filas = listas.map(({ x, l }) => h('tr', {},
			h('td', { class: 'cot-doc-serv' }, h('span', { class: `${ICONOS[l?.tipo] || 'icon-pencil'} cot-doc-serv-ico`, 'aria-hidden': 'true' }),
				h('span', { class: 'cot-doc-serv-nombre' }, x.concepto)),
			h('td', { class: 'cot-doc-col-base', 'data-label': 'Base y cálculo' }, x.detalle ? nb(x.detalle) : h('span', { class: 'cot-doc-falta' }, 'Monto fijo')),
			separado
				? [h('td', { class: 'text-end cot-doc-num', 'data-label': 'Honorario' }, m(x.honorario, x.moneda)),
					h('td', { class: 'text-end cot-doc-num', 'data-label': 'IVA 12 %' }, m(x.impuesto, x.moneda)),
					h('td', { class: 'text-end cot-doc-num cot-doc-monto', 'data-label': 'Total' }, m(x.total, x.moneda), mes(x))]
				: h('td', { class: 'text-end cot-doc-num cot-doc-monto', 'data-label': colMonto },
					h('div', {}, m(x.total, x.moneda), mes(x)),
					general ? h('div', { class: 'cot-doc-desglose' }, nb(`Honorario ${dinero(x.honorario, x.moneda)} + IVA ${dinero(x.impuesto, x.moneda)}`)) : null)));

		// Totales: una caja por cada total (pago único y mensual, por moneda).
		const varios = r.totales.length > 1;
		const cajas = r.totales.map((t) => {
			const sfx = t.mensual ? ' al mes' : '';
			const fila = (etq, v, clase = '') => h('div', { class: `cot-doc-tot-fila ${clase}` }, h('dt', {}, etq), h('dd', {}, v));
			const filasT = [];
			if (general) {
				filasT.push(fila(`Honorarios${sfx}`, m(t.honorario, t.moneda)));
				filasT.push(fila('IVA 12 %', m(t.impuesto, t.moneda)));
			}
			const etqTotal = t.mensual ? 'Total mensual' : 'Total a pagar';
			filasT.push(fila(general && !separado ? `${etqTotal} (IVA incluido)` : etqTotal, m(t.total, t.moneda), 'is-total'));
			return h('div', { class: `cot-doc-tot${t.mensual ? ' is-mensual' : ''}` },
				varios || t.mensual ? h('div', { class: 'cot-doc-tot-sub' }, ico(t.mensual ? 'icon-calendar' : 'icon-check'), `${t.mensual ? 'Cada mes' : 'Pago único'} · ${t.moneda === 'GTQ' ? 'quetzales' : 'dólares'}`) : null,
				h('dl', {}, filasT));
		});

		const notaRegimen = r.regimen === 'pequeno'
			? h('p', { class: 'cot-doc-nota' }, ico('icon-info-circle'), h('span', {}, `${filas.length > 1 ? 'Los montos son el precio final' : 'El monto es el precio final'}, sin IVA aparte. `, NOTA_PEQUENO))
			: null;
		const condiciones = [
			c.condiciones ? h('section', { class: 'cot-doc-bloque' }, h('h3', { class: 'cot-doc-etq-sec' }, 'Condiciones de pago'), h('p', {}, c.condiciones)) : null,
			c.notas ? h('section', { class: 'cot-doc-bloque' }, h('h3', { class: 'cot-doc-etq-sec' }, 'Notas'), h('p', {}, c.notas)) : null,
			notaRegimen
		].filter(Boolean);

		// Cierre: asesor con su contacto y línea de aceptación del cliente.
		const ca = c.asesorContacto || (c.asesor && (mismoNombre(c.asesor, asesorDatos.nombre) || mismoNombre(c.asesor, nombreSesion)) ? asesorDatos : null);
		const contactoAsesor = ca
			? [ca.telefono ? h('div', {}, ico('icon-phone'), nb(ca.telefono)) : null,
				ca.email ? h('div', {}, ico('icon-envelope-o'), ca.email) : null]
			: [];
		const cierre = h('section', { class: 'cot-doc-cierre' },
			h('div', { class: 'cot-doc-asesor' },
				h('h3', { class: 'cot-doc-etq-sec' }, 'Su asesor'),
				h('div', { class: 'cot-doc-asesor-nombre' }, c.asesor || h('span', { class: 'cot-doc-falta' }, 'Nombre del asesor')),
				h('div', { class: 'cot-doc-asesor-datos' }, contactoAsesor)),
			h('div', { class: 'cot-doc-firma' },
				h('h3', { class: 'cot-doc-etq-sec' }, 'Aceptado por'),
				h('div', { class: 'cot-doc-firma-linea' }),
				h('div', { class: 'cot-doc-firma-pie' }, h('span', {}, 'Nombre y firma del cliente'), h('span', {}, 'Fecha'))));

		const monedas = [...new Set(r.totales.map((t) => t.moneda))];
		const textoMoneda = monedas.length > 1 ? 'Montos en dólares (US$) y quetzales (Q).' : monedas[0] === 'GTQ' ? 'Montos en quetzales (Q).' : 'Montos en dólares (US$).';
		const pie = h('footer', { class: 'cot-doc-pie' },
			h('span', {}, `Cotización válida por ${Number(c.vigenciaDias) || VIGENCIA_DEF} días, hasta el ${fechaLarga(vence)}. ${textoMoneda}`),
			h('span', { class: 'cot-doc-web' }, SITIO));

		montar(hoja,
			cabecera, titulo, preparada,
			listas.length
				? [h('table', { class: `cot-doc-tabla${separado ? ' is-separado' : ''}` }, cabeza, h('tbody', {}, filas)),
					h('div', { class: 'cot-doc-resumen' },
						h('div', { class: 'cot-doc-totales' }, cajas),
						condiciones.length ? h('div', { class: 'cot-doc-condiciones' }, condiciones) : null)]
				: [h('p', { class: 'cot-doc-falta cot-doc-vacio' }, 'Agrega un servicio con su precio para ver los montos.'),
					condiciones.length ? h('div', { class: 'cot-doc-condiciones' }, condiciones) : null],
			cierre, pie);
	}

	// Acciones.
	async function guardar() {
		if (!session.isAdmin && !session.agentId) { toast('Tu usuario no tiene un asesor asignado; no se puede guardar.', 'danger'); return; }
		if (!revisarPendientes('guardar')) return;
		aplicarEmisor();
		const r = calcularCotizacion(c);
		const pctA = Number(c.liquidacion.pctAsesor);
		const liq = c.emisorTipo === 'empresa'
			? { isrPct: def.isrPct, isrPctAlto: def.isrPctAlto, isrLimite: def.isrLimite, tipoCambio: def.tipoCambio, pctAsesor: c.liquidacion.pctAsesor === '' || !Number.isFinite(pctA) ? def.pctAsesor : pctA, totales: liquidacion(c, opcionesLiq()) }
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
	// Hoja completa en una ventana: la misma hoja, a tamaño de lectura, con su propio desplazamiento.
	function verHoja(ev) {
		const origen = ev.currentTarget;
		const copia = hoja.cloneNode(true);
		copia.setAttribute('aria-label', 'Cotización completa');
		let pdf = false;
		const m = modal({
			title: 'Hoja completa',
			size: 'modal-lg modal-fullscreen-md-down cot-hoja-modal',
			body: copia,
			footer: [
				h('button', { type: 'button', class: 'btn btn-light cot-btn', 'data-bs-dismiss': 'modal' }, 'Cerrar'),
				h('button', { type: 'button', class: 'btn btn-outline-primary cot-btn', onclick: () => { pdf = true; m.close(); } },
					h('span', { class: 'icon-file-pdf-o me-2', 'aria-hidden': 'true' }), 'Descargar PDF')],
			onClose: () => { origen.focus(); if (pdf) imprimir(); }
		});
		m.el.classList.add('cot-hoja-ventana', 'no-print');
	}
	async function salir(ev, destino = '#/cotizaciones') {
		if (sucio || asesorSucio) { ev.preventDefault(); if (await confirmDialog('Tienes cambios sin guardar. ¿Salir de todos modos?', { okText: 'Salir sin guardar' })) location.hash = destino; }
	}
	const btnGuardar = h('button', { type: 'button', class: 'btn btn-primary cot-btn', onclick: guardar }, h('span', { class: 'icon-floppy-o me-2', 'aria-hidden': 'true' }), 'Guardar');
	const barra = h('div', { class: 'sticky-actions cot-barra no-print' },
		btnGuardar,
		h('button', { type: 'button', class: 'btn btn-outline-primary cot-btn', 'aria-label': 'Descargar PDF', title: 'Descargar PDF', onclick: imprimir }, h('span', { class: 'icon-file-pdf-o me-2', 'aria-hidden': 'true' }), h('span', { class: 'cot-barra-txt' }, 'Descargar PDF')),
		h('button', { type: 'button', class: 'btn btn-outline-primary cot-btn', 'aria-label': 'Copiar para WhatsApp', title: 'Copiar para WhatsApp', onclick: copiarWhatsApp }, h('span', { class: 'icon-whatsapp me-2', 'aria-hidden': 'true' }), h('span', { class: 'cot-barra-txt' }, 'Copiar para WhatsApp')),
		// En celular: ver la hoja completa sin tener que bajar hasta ella.
		h('button', { type: 'button', class: 'btn btn-outline-primary cot-btn cot-barra-hoja d-sm-none', 'aria-haspopup': 'dialog', 'aria-label': 'Ver hoja completa', title: 'Ver hoja completa', onclick: verHoja },
			h('span', { class: 'icon-expand me-2', 'aria-hidden': 'true' }), h('span', { class: 'cot-barra-txt' }, 'Ver hoja completa')),
		h('a', { class: 'btn btn-link cot-btn ms-auto', href: '#/cotizaciones', onclick: salir }, 'Volver a la lista'));

	const titulo = id && !duplicar ? 'Cotización' : 'Nueva cotización';
	container.replaceChildren();
	mount(container,
		h('div', { class: 'no-print' }, pageHeader(titulo,
			h('a', { class: 'btn btn-outline-secondary cot-btn', href: '#/cotizaciones', onclick: salir }, h('span', { class: 'icon-list-alt me-2', 'aria-hidden': 'true' }), 'Mis cotizaciones'))),
		h('div', { class: 'row g-4 cot-layout' },
			h('div', { class: 'col-xl-5 cot-entradas no-print' }, emisor, cliente, servicios, liqCard, condiciones),
			h('div', { class: 'col-xl-7 cot-salida' },
				h('div', { class: 'cot-salida-cabeza no-print' },
					h('h2', { class: 'h6 text-muted cot-salida-titulo' }, h('span', { class: 'icon-receipt me-2', 'aria-hidden': 'true' }), 'Así la verá tu cliente'),
					h('button', { type: 'button', class: 'btn btn-outline-primary btn-sm cot-btn cot-ver-hoja', 'aria-haspopup': 'dialog', onclick: verHoja },
						h('span', { class: 'icon-expand me-2', 'aria-hidden': 'true' }), 'Ver hoja completa')),
				// En computadora la hoja tiene su propio desplazamiento: siempre se llega al total.
				h('div', { class: 'cot-hoja-marco', tabindex: '0', role: 'region', 'aria-label': 'Hoja de la cotización' }, hoja))),
		barra);
	pintarPanelEmisor();
	pintarAvisoEmisor();
	pintarLineas();
	pintarDoc();
	pintarLiquidacion();

	// Clientes y propiedades: aparte, para que la cotización funcione aunque falle la lectura.
	// El asesor solo ve sus clientes (reglas de Firestore); las propiedades son todas las del inventario.
	const porNombre = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
	const { loadClientes, loadPropietarios, loadReglas } = await import('../crm.js');
	// Cotización nueva sin inmueble: la compraventa empieza con el % de la regla general.
	loadReglas().then((r) => {
		reglas = r;
		const l = c.lineas[0];
		if (!id && !c.propiedad.id && l?.tipo === 'compraventa' && !l.precio) { c.lineas[0] = lineaVacia('compraventa', l.moneda, r); pintarLineas(); }
	});
	loadPropietarios().then((l) => { duenos = l; }).catch((err) => console.warn('Cotización: no se pudieron leer los propietarios', err));
	loadAgents().then((l) => { agentes = l; pintarAsesor(); }).catch((err) => console.warn('Cotización: no se pudieron leer los asesores', err));
	loadClientes().then((l) => selCliente.cargar(l.filter((x) => x.nombre).sort(porNombre)))
		.catch((err) => { console.warn('Cotización: no se pudieron leer los clientes', err); selCliente.fallar(); });
	try {
		const { loadAll, TIPOS } = await import('./properties.js');
		tiposProp = TIPOS;
		const props = (await loadAll()).filter((p) => p.titulo || p.codigo)
			.sort((a, b) => String(a.codigo || a.titulo).localeCompare(String(b.codigo || b.titulo), 'es', { numeric: true }));
		inventario = props;
		selPropiedad.cargar(props);
	} catch (err) {
		console.warn('Cotización: no se pudo leer el inventario', err);
		selPropiedad.fallar();
	}
}
