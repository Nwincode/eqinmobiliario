// Utilidades de interfaz del panel.
import '/js/calc-vacacional.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(v) {
	if (v === undefined || v === null) return '';
	return String(v).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// Crea elementos: h('button', { class: 'btn', onclick: fn }, 'Texto')
export function h(tag, attrs = {}, ...children) {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs || {})) {
		if (v === undefined || v === null || v === false) continue;
		if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
		else if (k === 'html') el.innerHTML = v;
		else if (k === 'dataset') Object.assign(el.dataset, v);
		else if (v === true) el.setAttribute(k, '');
		else el.setAttribute(k, v);
	}
	for (const c of children.flat(Infinity)) {
		if (c === undefined || c === null || c === false) continue;
		el.append(c instanceof Node ? c : document.createTextNode(String(c)));
	}
	return el;
}

// En todo el panel, replaceChildren ignora los vacíos (null, false, undefined) igual que h() y mount():
// sin esto el navegador escribe el texto «null» en pantalla.
const vacio = (c) => c === null || c === undefined || c === false;
const nativo = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function (...hijos) { return nativo.apply(this, hijos.flat(Infinity).filter((c) => !vacio(c))); };

// Agrega hijos a un elemento ignorando los vacíos (null, false, undefined).
export function mount(el, ...children) {
	el.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
}

export function slugify(text) {
	return String(text || '')
		.normalize('NFD').replace(/[̀-ͯ]/g, '')
		.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function toDate(v) {
	if (!v) return null;
	if (typeof v.toDate === 'function') return v.toDate();
	if (v.seconds) return new Date(v.seconds * 1000);
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(v, withTime = true) {
	const d = toDate(v);
	if (!d) return '—';
	return d.toLocaleString('es-GT', withTime
		? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
		: { day: '2-digit', month: 'short', year: 'numeric' });
}

// Fechas "AAAA-MM-DD": la de hoy y su texto corto ("14 nov").
// «Hoy» es el día de Guatemala, el mismo del sitio y de las funciones (una sola cuenta: js/calc-vacacional.js).
export const hoy = () => window.EQVacacional.hoy();
export const dia = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' });

// El precio según la operación sale de formato.js (uno solo para el panel, la difusión y las reglas).
export { precioTexto as formatPrice } from './formato.js';

export function toast(message, type = 'success') {
	let box = document.getElementById('toasts');
	if (!box) {
		box = h('div', { id: 'toasts', class: 'toast-container position-fixed bottom-0 end-0 p-3' });
		document.body.append(box);
	}
	const t = h('div', { class: `toast align-items-center text-bg-${type} border-0 show`, role: 'status' },
		h('div', { class: 'd-flex' },
			h('div', { class: 'toast-body' }, message),
			h('button', { type: 'button', class: 'btn-close btn-close-white me-2 m-auto', 'aria-label': 'Cerrar', onclick: () => t.remove() })));
	box.append(t);
	setTimeout(() => t.remove(), type === 'danger' ? 8000 : 4000);
}

export function errorMessage(err) {
	const code = (err && err.code) || '';
	const map = {
		'permission-denied': 'No tienes permiso para esta acción.',
		'auth/invalid-credential': 'Correo o contraseña incorrectos.',
		'auth/wrong-password': 'Correo o contraseña incorrectos.',
		'auth/user-not-found': 'Correo o contraseña incorrectos.',
		'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
		'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
		'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
		'auth/invalid-email': 'El correo no es válido.',
		'auth/requires-recent-login': 'Por seguridad, cierra sesión y vuelve a entrar antes de hacer esto.',
		'storage/unauthorized': 'No tienes permiso para subir archivos.',
		unavailable: 'Sin conexión con la base de datos. Revisa tu internet.'
	};
	return map[code] || (err && err.message) || 'Ocurrió un error inesperado.';
}

export function showError(err) {
	console.error(err);
	toast(errorMessage(err), 'danger');
}

// Modal genérico de Bootstrap. Devuelve { el, body, footer, close }.
let modalN = 0;
export function modal({ title, size = '', body, footer, onClose } = {}) {
	const bodyEl = h('div', { class: 'modal-body' }, body);
	const footerEl = h('div', { class: 'modal-footer' }, footer);
	const tituloId = `modal-titulo-${++modalN}`;
	const el = h('div', { class: 'modal fade', tabindex: '-1', 'aria-labelledby': tituloId },
		h('div', { class: `modal-dialog modal-dialog-scrollable ${size}` },
			h('div', { class: 'modal-content' },
				h('div', { class: 'modal-header' },
					h('h5', { class: 'modal-title', id: tituloId }, title),
					h('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal', 'aria-label': 'Cerrar' })),
				bodyEl,
				footer ? footerEl : null)));
	document.body.append(el);
	const instance = new window.bootstrap.Modal(el);
	el.addEventListener('hidden.bs.modal', () => {
		el.remove();
		if (onClose) onClose();
	});
	instance.show();
	return { el, body: bodyEl, footer: footerEl, close: () => instance.hide() };
}

export function confirmDialog(message, { okText = 'Confirmar', danger = true } = {}) {
	return new Promise((resolve) => {
		let answered = false;
		const ok = h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}` }, okText);
		const m = modal({
			title: 'Confirmar',
			body: h('p', { class: 'mb-0' }, message),
			footer: [h('button', { class: 'btn btn-light', 'data-bs-dismiss': 'modal' }, 'Cancelar'), ok],
			onClose: () => { if (!answered) resolve(false); }
		});
		ok.addEventListener('click', () => { answered = true; resolve(true); m.close(); });
	});
}

// Un toque para elegir una opción (p. ej. por qué se cancela): devuelve la elegida, o null si se cerró.
export function elegirOpcion(titulo, opciones) {
	return new Promise((resolve) => {
		let elegida = null;
		const m = modal({
			title: titulo,
			body: h('div', { class: 'd-grid gap-2' }, opciones.map((t) => h('button', {
				type: 'button', class: 'cot-btn btn btn-outline-secondary', onclick: () => { elegida = t; m.close(); }
			}, t))),
			onClose: () => resolve(elegida)
		});
	});
}

export function spinner(text = 'Cargando…') {
	return h('div', { class: 'd-flex align-items-center gap-2 text-muted py-5 justify-content-center' },
		h('div', { class: 'spinner-border spinner-border-sm', role: 'status' }), text);
}

export function pageHeader(title, ...actions) {
	return h('div', { class: 'd-flex flex-wrap align-items-center justify-content-between gap-2 mb-4' },
		h('h1', { class: 'h3 mb-0' }, title),
		h('div', { class: 'd-flex flex-wrap gap-2' }, actions));
}

export function badge(text, color = 'secondary') {
	return h('span', { class: `badge text-bg-${color}` }, text);
}

// Tarjeta de un indicador: ícono + nombre arriba, el número abajo y una nota opcional. Es la única del panel.
// Varias monedas en `valor` (separadas por « · ») van una por renglón. Con `href` la tarjeta es un enlace.
export function statCard(icono, label, valor, { nota, href, cls = '' } = {}) {
	const partes = String(valor).split(' · ');
	return h(href ? 'a' : 'div', { href, class: `card stat-card h-100 ${cls}` },
		h('div', { class: 'stat-label' }, h('span', { class: `${icono} me-1`, 'aria-hidden': 'true' }), label),
		h('div', { class: 'stat-value' }, partes.length > 1 ? partes.map((v) => h('div', {}, v)) : partes),
		nota ? h('div', { class: 'stat-nota' }, nota) : null);
}

// Botón solo de ícono (44 px de toque); con `href` es un enlace.
export const iconoBtn = (icono, titulo, attrs = {}) => h(attrs.href ? 'a' : 'button', {
	type: attrs.href ? null : 'button', class: 'cot-btn cot-btn-icono btn btn-sm btn-outline-secondary', title: titulo, 'aria-label': titulo, ...attrs
}, h('span', { class: icono, 'aria-hidden': 'true' }));

// Menú ⋮ de una ficha o fila: junta las acciones de cada elemento sin ocupar una fila de botones.
// items: [{ icono, texto, onclick } | { icono, texto, href, target } | { …, peligro: true }]; los vacíos se saltan.
// Sin acciones no se dibuja nada. El menú flota (fixed) para que la tabla no lo recorte.
export const menuMas = (titulo, items) => {
	const acciones = items.filter(Boolean);
	if (!acciones.length) return null;
	const btn = h('button', {
		type: 'button', class: 'cot-btn cot-btn-icono btn btn-sm menu-mas-btn', title: titulo, 'aria-label': titulo,
		'aria-expanded': 'false', 'data-bs-toggle': 'dropdown'
	}, h('span', { class: 'icon-ellipsis-v', 'aria-hidden': 'true' }));
	const menu = h('ul', { class: 'dropdown-menu dropdown-menu-end menu-mas-lista' }, acciones.map((a) => h('li', {},
		h(a.href ? 'a' : 'button', {
			class: `dropdown-item${a.peligro ? ' menu-mas-peligro' : ''}`, type: a.href ? null : 'button',
			href: a.href, target: a.target, rel: a.target ? 'noopener' : null, onclick: a.onclick
		}, h('span', { class: a.icono, 'aria-hidden': 'true' }), a.texto))));
	const caja = h('div', { class: 'dropdown menu-mas' }, btn, menu);
	new window.bootstrap.Dropdown(btn, { popperConfig: { strategy: 'fixed' } });
	return caja;
};

export function emptyState(text, action) {
	return h('div', { class: 'text-center text-muted py-5 border rounded bg-white' }, h('p', {}, text), action || null);
}

// Caja de cualquier tabla del panel: se mueve de lado; el alto lo pone tablas.js (un solo
// scroll por pantalla). Con { tarjeta: true } va dentro de una tarjeta.
// Sin tabla devuelve la caja vacía para llenarla después.
export function cajaTabla(tabla, { tarjeta = false, cls = '' } = {}) {
	const caja = h('div', { class: cls ? `table-responsive ${cls}` : 'table-responsive' }, tabla);
	return tarjeta ? h('div', { class: 'card overflow-hidden' }, caja) : caja;
}

export function downloadCsv(filename, rows) {
	const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
	const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
	const a = h('a', { href: URL.createObjectURL(blob), download: filename });
	document.body.append(a);
	a.click();
	a.remove();
}

// La barra fija de acciones (Guardar…): al presionar, el navegador desplaza la página para
// enfocar el botón y el clic cae fuera de él. Sin mover el foco con el mouse el clic llega siempre.
document.addEventListener('mousedown', (e) => {
	if (e.button === 0 && e.target.closest('.sticky-actions button')) e.preventDefault();
});
