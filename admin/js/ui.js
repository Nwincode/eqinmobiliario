// Utilidades de interfaz del panel.

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

export function formatPrice(precio, moneda = 'USD', operacion = 'venta') {
	if (!precio) return 'A consultar';
	const prefix = { USD: 'US$', GTQ: 'Q' }[moneda] || moneda;
	return `${prefix} ${Number(precio).toLocaleString('en-US')}${operacion === 'renta' ? ' /mes' : ''}`;
}

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
export function modal({ title, size = '', body, footer, onClose } = {}) {
	const bodyEl = h('div', { class: 'modal-body' }, body);
	const footerEl = h('div', { class: 'modal-footer' }, footer);
	const el = h('div', { class: 'modal fade', tabindex: '-1' },
		h('div', { class: `modal-dialog modal-dialog-scrollable ${size}` },
			h('div', { class: 'modal-content' },
				h('div', { class: 'modal-header' },
					h('h5', { class: 'modal-title' }, title),
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

export function emptyState(text, action) {
	return h('div', { class: 'text-center text-muted py-5 border rounded bg-white' }, h('p', {}, text), action || null);
}

export function downloadCsv(filename, rows) {
	const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
	const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
	const a = h('a', { href: URL.createObjectURL(blob), download: filename });
	document.body.append(a);
	a.click();
	a.remove();
}
