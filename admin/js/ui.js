// Utilidades de interfaz del panel.
import '/js/calc-vacacional.js';
import { textoCsv, fechaCorta, fechaHora } from './formato.js';

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

// Una sola: admin/js/formato.js (también la usa el generador del sitio).
export { slugify } from './formato.js';

// Fechas: una sola forma de leerlas y tres formatos, en formato.js (`aFecha`, `fechaCorta`, `fechaLarga`, `fechaHora`).
export { aFecha as toDate } from './formato.js';
export const formatDate = (v, withTime = true) => (withTime ? fechaHora(v) : fechaCorta(v));

// Fechas "AAAA-MM-DD": la de hoy y su texto corto ("14 nov").
// «Hoy» es el día de Guatemala, el mismo del sitio y de las funciones (una sola cuenta: js/calc-vacacional.js).
export const hoy = () => window.EQVacacional.hoy();
// La hora del servidor, no la del dispositivo: un teléfono con el reloj adelantado no da por pasado el día de llegada de
// una reserva (ni uno atrasado deja confirmar una que ya pasó). Sale del encabezado Date de una respuesta del propio sitio
// (una función: el CDN no la guarda) y se recuerda como diferencia 10 minutos; si no responde, la del dispositivo. La usan
// las revisiones de admin/js/reservas.js y de Solicitudes.
let desfase = null, desfaseDe = 0;
export async function ahoraServidor() {
	if (desfase === null || Date.now() - desfaseDe > 600000) {
		try {
			const antes = Date.now();
			const r = await fetch('/api/solicitud', { cache: 'no-store' });
			const servidor = Date.parse(r.headers.get('date') || '');
			if (servidor) { desfase = servidor + (Date.now() - antes) / 2 - Date.now(); desfaseDe = Date.now(); }
		} catch { /* sin red: la hora del dispositivo */ }
	}
	return ahoraYa();
}
// Lo mismo sin esperar: con la diferencia ya medida (ahoraServidor al abrir la pantalla); antes, la del dispositivo.
export const ahoraYa = () => Date.now() + (desfase || 0);
// El día corto («16 nov»): uno solo, en formato.js.
export { dia } from './formato.js';

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
	// Un «sin permiso» puede ser de una pestaña con el panel de antes: admin/js/version.js lo revisa en seguida.
	if (code === 'permission-denied') document.dispatchEvent(new CustomEvent('sin-permiso'));
	const map = {
		'permission-denied': 'No tienes permiso para esta acción.',
		'auth/invalid-credential': 'Correo o contraseña incorrectos.',
		'auth/wrong-password': 'Correo o contraseña incorrectos.',
		'auth/user-not-found': 'Correo o contraseña incorrectos.',
		'auth/user-disabled': 'No se pudo entrar con esa cuenta. Si crees que es un error, escríbele a tu asesor.',
		'auth/network-request-failed': 'Sin conexión. Revisa tu internet e inténtalo otra vez.',
		'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
		'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
		'auth/weak-password': 'Esa contraseña es muy débil: usa una frase de 2 o 3 palabras (10 caracteres o más).',
		'auth/invalid-email': 'El correo no es válido.',
		'auth/requires-recent-login': 'Por seguridad, cierra sesión y vuelve a entrar antes de hacer esto.',
		'auth/missing-password': 'Escribe tu contraseña.',
		'auth/missing-email': 'Escribe tu correo.',
		'auth/expired-action-code': 'Este enlace ya venció: pide uno nuevo.',
		'auth/invalid-action-code': 'Este enlace ya no sirve: pide uno nuevo.',
		'auth/popup-closed-by-user': 'Se cerró la ventana antes de terminar. Inténtalo otra vez.',
		'storage/unauthorized': 'No tienes permiso para subir archivos.',
		'storage/canceled': 'Se canceló la subida.',
		'storage/quota-exceeded': 'Se llenó el espacio para fotos. Avísale al administrador.',
		'storage/retry-limit-exceeded': 'La subida tardó demasiado. Revisa tu internet e inténtalo otra vez.',
		'storage/object-not-found': 'Ese archivo ya no existe.',
		'not-found': 'Ese registro ya no existe: recarga la página.',
		'already-exists': 'Eso ya estaba guardado.',
		'resource-exhausted': 'Demasiados cambios seguidos. Espera un momento e inténtalo otra vez.',
		'deadline-exceeded': 'La base de datos tardó demasiado en responder. Inténtalo otra vez.',
		aborted: 'Alguien cambió lo mismo al mismo tiempo. Inténtalo otra vez.',
		'failed-precondition': 'No se pudo guardar así. Recarga la página e inténtalo otra vez.',
		unauthenticated: 'Tu sesión venció: vuelve a entrar.',
		unavailable: 'Sin conexión con la base de datos. Revisa tu internet.'
	};
	if (map[code]) return map[code];
	const texto = String((err && err.message) || '');
	// Sin red, fetch dice «Failed to fetch» (Chrome), «Load failed» (Safari) o «NetworkError…» (Firefox).
	if (err instanceof TypeError && /fetch|load failed|network/i.test(texto)) return map['auth/network-request-failed'];
	// Lo que trae Firebase viene en inglés y con su código («FirebaseError: Missing or insufficient…»): nunca se muestra
	// tal cual (queda en la consola). Lo que el panel o las funciones escriben (en español) sí.
	if ((err && err.name === 'FirebaseError') || /^Firebase|Missing or insufficient|\(auth\/|\(storage\//.test(texto)) return 'No se pudo completar. Inténtalo otra vez; si sigue, avísale al administrador.';
	return texto || 'Ocurrió un error inesperado.';
}

// Lo que se dice cuando una función del sitio (/api/…) responde con error y no explica por qué: nunca el número solo.
export function fallaDelServidor(status) {
	if (status === 401) return 'Tu sesión venció: vuelve a entrar.';
	if (status === 403) return 'No tienes permiso para esta acción.';
	if (status === 404) return 'Esta función todavía no está publicada en el sitio: avísale al administrador.';
	if (status === 429) return 'Demasiados intentos seguidos. Espera unos minutos e inténtalo otra vez.';
	if (status === 503) return 'El servidor todavía no está listo: avísale al administrador.';
	return 'El servidor tuvo un problema. Inténtalo otra vez en un momento; si sigue, avísale al administrador.';
}

// Apaga el botón mientras corre lo que hace (dos toques no lo hacen dos veces) y muestra el error si falla.
export async function ocupado(btn, fn) {
	if (btn) btn.disabled = true;
	try { await fn(); } catch (err) { showError(err); } finally { if (btn) btn.disabled = false; }
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
	// Bootstrap ignora hide() mientras la ventana todavía está apareciendo: un toque rápido en «Eliminar» o «Confirmar»
	// hacía la acción pero dejaba la ventana abierta tapando todo. Si se cierra antes de terminar de aparecer, se cierra
	// en cuanto termina.
	let mostrada = false, cerrarAlMostrar = false;
	el.addEventListener('shown.bs.modal', () => { mostrada = true; if (cerrarAlMostrar) instance.hide(); });
	// Lo mismo con «Cancelar» y la ✕ (Bootstrap también las ignora mientras aparece).
	el.addEventListener('click', (e) => { if (!mostrada && e.target.closest('[data-bs-dismiss="modal"]')) cerrarAlMostrar = true; });
	instance.show();
	return { el, body: bodyEl, footer: footerEl, close: () => { if (mostrada) instance.hide(); else cerrarAlMostrar = true; } };
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
				type: 'button', class: 'btn-toque btn btn-outline-secondary', onclick: () => { elegida = t; m.close(); }
			}, t))),
			onClose: () => resolve(elegida)
		});
	});
}

export function spinner(text = 'Cargando…') {
	return h('div', { class: 'd-flex align-items-center gap-2 text-muted py-5 justify-content-center' },
		h('div', { class: 'spinner-border spinner-border-sm', role: 'status' }), text);
}

// Encabezado de una pantalla. title: el texto, o { texto, volver: '#/ruta', volverTexto } para poner la flecha ← a su lado.
export function pageHeader(title, ...actions) {
	const t = title && typeof title === 'object' && 'texto' in title ? title : { texto: title };
	return h('div', { class: 'd-flex flex-wrap align-items-center justify-content-between gap-2 mb-4' },
		h('div', { class: 'd-flex align-items-center gap-1', style: 'flex: 1 1 12rem; min-width: 0' },
			t.volver ? iconoBtn('icon-arrow-left', t.volverTexto || 'Volver', { href: t.volver, class: 'btn-toque btn-icono btn btn-link text-body' }) : null,
			h('h1', { class: 'h3 mb-0' }, t.texto)),
		h('div', { class: 'd-flex flex-wrap align-items-center gap-2' }, actions));
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
	type: attrs.href ? null : 'button', class: 'btn-toque btn-icono btn btn-sm btn-outline-secondary', title: titulo, 'aria-label': titulo, ...attrs
}, h('span', { class: icono, 'aria-hidden': 'true' }));

// «Nueva propiedad»: el botón de la casa con «+» (en el celular solo el ícono). Uno para todo el panel: Propiedades del
// equipo y «Agregar casa» del socio en «Mis propiedades». attrs: href u onclick.
export const botonNuevaCasa = (texto, attrs = {}) => h(attrs.href ? 'a' : 'button', { type: attrs.href ? null : 'button', class: 'btn btn-primary btn-encabezado', title: texto, 'aria-label': texto, ...attrs,
	html: `<svg class="ico-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 11.5 10 5l8 6.5"/><path d="M4 10v10h7"/><path d="M16 10v2"/><path d="M18 13.5v9M13.5 18h9"/></svg><span class="d-none d-md-inline">${texto}</span>` });

// Flecha fina ‹ › (la de los carruseles y calendarios, css/calendario.css): mes anterior o siguiente.
export const flecha = (lado, titulo, onclick, disabled) => h('button', {
	type: 'button', class: `eq-flecha vac-cal-${lado}`, 'aria-label': titulo, title: titulo, onclick, disabled,
	html: `<svg class="eq-flecha-ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="${lado === 'prev' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
});

// Menú ⋮ de una ficha o fila: junta las acciones de cada elemento sin ocupar una fila de botones.
// items: [{ icono, texto, onclick } | { icono, texto, href, target } | { …, peligro: true }]; los vacíos se saltan.
// Sin acciones no se dibuja nada. El menú flota (fixed) para que la tabla no lo recorte.
// Otro ícono (p. ej. el ⚠ de pendientes de una casa) con { icono, cls }.
export const menuMas = (titulo, items, { icono = 'icon-ellipsis-v', cls = '' } = {}) => {
	const acciones = items.filter(Boolean);
	if (!acciones.length) return null;
	const btn = h('button', {
		type: 'button', class: `btn-toque btn-icono btn btn-sm menu-mas-btn${cls ? ` ${cls}` : ''}`, title: titulo, 'aria-label': titulo,
		'aria-expanded': 'false', 'data-bs-toggle': 'dropdown'
	}, h('span', { class: icono, 'aria-hidden': 'true' }));
	const menu = h('ul', { class: 'dropdown-menu dropdown-menu-end menu-mas-lista' }, acciones.map((a) => h('li', {},
		h(a.href ? 'a' : 'button', {
			class: `dropdown-item${a.peligro ? ' menu-mas-peligro' : ''}`, type: a.href ? null : 'button',
			href: a.href, target: a.target, rel: a.target ? 'noopener' : null, onclick: a.onclick
		}, h('span', { class: a.icono, 'aria-hidden': 'true' }), a.texto))));
	const caja = h('div', { class: 'dropdown menu-mas' }, btn, menu);
	new window.bootstrap.Dropdown(btn, { popperConfig: { strategy: 'fixed' } });
	return caja;
};

// Tarjeta con encabezado (ícono opcional y título) y su cuerpo: la única del panel para un bloque con título.
// Si lo primero del cuerpo es { sinCuerpo: true }, el contenido va directo (una tabla o una lista que ya trae su borde).
export function tarjeta(icono, titulo, ...cuerpo) {
	const op = cuerpo[0] && cuerpo[0].constructor === Object ? cuerpo.shift() : {};
	return h('section', { class: `card mb-3${op.cls ? ` ${op.cls}` : ''}` },
		h('div', { class: 'card-header bg-white' }, h('h2', { class: 'h6 mb-0' }, icono ? h('span', { class: `${icono} me-1`, 'aria-hidden': 'true' }) : null, titulo)),
		op.sinCuerpo ? cuerpo : h('div', { class: 'card-body' }, cuerpo));
}

// Barras de un embudo o reparto: [[etiqueta, número]], cada barra a escala de la mayor.
export function barras(filas) {
	const max = Math.max(1, ...filas.map(([, n]) => n));
	return filas.map(([etiqueta, n]) => h('div', { class: 'mb-2' },
		h('div', { class: 'd-flex justify-content-between small' }, h('span', {}, etiqueta), h('strong', {}, n)),
		h('div', { class: 'bar' }, h('span', { style: `width:${(n / max) * 100}%` }))));
}

// Nombre y datos de un registro (una casa, un propietario, un lead…): el nombre solo en su línea (dos como máximo, con «…»)
// y abajo la línea de datos con las marcas (etiquetas) al final; si no caben, los datos se recortan con «…», la marca no.
// Así una etiqueta nunca corta el nombre en el celular. Devuelve las dos líneas (sin datos ni marcas, solo el nombre).
// `envuelve`: para un registro que puede traer varias marcas largas (una solicitud): si no caben junto a los datos, bajan
// a la línea siguiente y parten entre ellas (sin scroll de lado); los datos siguen en una línea con «…».
export function nombreYDatos(nombre, datos, marcas = [], { cls = '', datosCls = '', envuelve = false } = {}) {
	const conMarcas = [marcas].flat(Infinity).some((m) => m && typeof m !== 'string');
	const conDatos = [datos].flat(Infinity).some((d) => d !== null && d !== undefined && d !== false && d !== '');
	return [h('div', { class: `fila-nombre${cls ? ` ${cls}` : ''}` }, nombre),
		conDatos || conMarcas ? h('div', { class: `fila-datos${envuelve ? ' fila-envuelve' : ''}${datosCls ? ` ${datosCls}` : ''}` },
			conDatos ? h('span', { class: 'fila-datos-txt' }, datos) : null,
			conMarcas ? h('span', { class: 'fila-marcas' }, marcas) : null) : null];
}

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

// La tabla del panel: una sola pieza para toda lista en tabla (en celular y tableta, tablas.js la vuelve fichas).
//  columnas  [{ titulo, num, cls }]: `num` alinea a la derecha (montos, cuentas); un título vacío no se anuncia.
//  celdas    fila → [contenido de cada columna] (texto o nodos).
//  alTocar   fila → abre su ficha: la fila entera se toca y se abre con Enter.
//  acciones  fila → items de `menuMas` (borrar al final, con `peligro`): van en un ⋮ al final de la fila.
//  claseFila fila → clase extra de su renglón (p. ej. la elegida, `table-active`).
//  vacio     lo que se ve sin ningún registro (`emptyState`); sinCoincidencias: el renglón cuando un filtro no deja nada.
// Devuelve el contenedor; `contenedor.pintar(filas, { filtrado })` lo llena (filtrado: hay búsqueda o filtros puestos).
export function tablaAdmin({ columnas, celdas, alTocar, acciones, vacio = 'Aún no hay nada aquí.', sinCoincidencias = 'Ninguno coincide con la búsqueda o los filtros.', tarjeta = true, cls = '', titulo = () => '', claseFila = () => '' }) {
	const tbody = h('tbody');
	const tabla = h('table', { class: `table table-hover table-admin mb-0${cls ? ` ${cls}` : ''}` },
		h('thead', {}, h('tr', {}, columnas.map((c) => h('th', { scope: 'col', class: [c.num ? 'text-end' : '', c.cls || ''].join(' ').trim() || null }, c.titulo || '')),
			acciones ? h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Acciones')) : null)),
		tbody);
	const caja = cajaTabla(tabla, { tarjeta });
	const contenedor = h('div', { class: 'tabla-admin' });
	const fila = (f) => h('tr', {
		class: [alTocar ? 'clickable' : '', claseFila(f) || ''].join(' ').trim() || null, tabindex: alTocar ? '0' : null,
		onclick: alTocar ? (e) => { if (!e.target.closest('a, button, input, select, label, .menu-mas')) alTocar(f, e); } : null,
		onkeydown: alTocar ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) alTocar(f, e); } : null
	},
		celdas(f).map((c, i) => h('td', { class: [columnas[i]?.num ? 'text-end text-nowrap celda-num' : '', columnas[i]?.cls || ''].join(' ').trim() || null }, c)),
		acciones ? h('td', { class: 'text-end' }, menuMas(`Acciones${titulo(f) ? ` de ${titulo(f)}` : ''}`, acciones(f))) : null);
	contenedor.pintar = (filas, { filtrado = false } = {}) => {
		if (!filas.length && !filtrado) return contenedor.replaceChildren(typeof vacio === 'string' ? emptyState(vacio) : vacio);
		tbody.replaceChildren(...(filas.length ? filas.map(fila)
			: [h('tr', {}, h('td', { colspan: columnas.length + (acciones ? 1 : 0), class: 'text-center text-muted py-4' }, sinCoincidencias))]));
		if (contenedor.firstChild !== caja) contenedor.replaceChildren(caja);
	};
	return contenedor;
}

export function downloadCsv(filename, rows) {
	const blob = new Blob(['﻿' + textoCsv(rows)], { type: 'text/csv;charset=utf-8' });
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
