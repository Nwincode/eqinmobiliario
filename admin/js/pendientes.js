// Avisos de «Datos por completar»: reglas por tipo de registro, conteo para el menú,
// tarjeta de Inicio y marcas en los formularios. Las reglas están en pendientes-reglas.js.
import { h } from './ui.js';

import { REGLAS, revisar, incompletos } from './pendientes-reglas.js';

export { REGLAS, revisar, incompletos };

export const enlaceRevisar = (tipo, id) => `#/${REGLAS[tipo].ruta}/${encodeURIComponent(id)}/revisar`;

// Carga todo lo que el usuario puede ver y devuelve { tipo: [incompletos] }.
export async function cargarPendientes() {
	const { session } = await import('./session.js');
	const { loadClientes, loadPropietarios } = await import('./crm.js');
	const { db, getDocs, collection } = await import('./firebase.js');
	const todos = async (col) => (await getDocs(collection(db, col))).docs.map((d) => ({ id: d.id, ...d.data() }));
	const conAsesor = session.isAdmin || session.agentId;
	const [props, clientes, propietarios, asesores] = await Promise.all([
		todos('properties').catch(() => []),
		conAsesor ? loadClientes().catch(() => []) : [],
		conAsesor ? loadPropietarios().catch(() => []) : [],
		session.isAdmin ? todos('agents').catch(() => []) : []
	]);
	const misProps = session.isAdmin ? props : props.filter((p) => p.agentId && p.agentId === session.agentId);
	return {
		propiedades: incompletos('propiedades', misProps),
		clientes: incompletos('clientes', clientes),
		propietarios: incompletos('propietarios', propietarios),
		asesores: incompletos('asesores', asesores)
	};
}

// Insignias del menú: un número junto a cada sección con registros incompletos.
let ultimo = 0;
export async function actualizarInsignias(forzar = false) {
	if (!forzar && Date.now() - ultimo < 30000) return;
	ultimo = Date.now();
	let pend;
	try { pend = await cargarPendientes(); } catch { return; }
	let total = 0;
	for (const [tipo, lista] of Object.entries(pend)) {
		const a = document.querySelector(`.admin-nav a[data-route="${REGLAS[tipo].ruta}"]`);
		if (!a) continue;
		a.querySelector('.nav-aviso')?.remove();
		if (!lista.length) continue;
		const n = lista.length;
		total += n;
		a.append(h('span', { class: 'nav-aviso', title: `${n} con datos por completar` },
			h('span', { 'aria-hidden': 'true' }, String(n)),
			h('span', { class: 'visually-hidden' }, ` (${n} con datos por completar)`)));
	}
	// En celular el menú está cerrado: un punto en el botón avisa que adentro hay algo por completar.
	const btn = document.querySelector('.admin-menu-btn');
	if (btn) {
		btn.classList.toggle('tiene-aviso', total > 0);
		btn.setAttribute('aria-label', total ? `Menú (${total} con datos por completar)` : 'Menú');
	}
}

// Chip para las filas de las listas.
export function chipFaltan(faltan) {
	if (!faltan.length) return null;
	return h('span', { class: 'chip-falta', title: `Falta: ${faltan.map((f) => f.etiqueta).join(', ')}` },
		h('span', { class: 'icon-exclamation-triangle', 'aria-hidden': 'true' }),
		` Falta${faltan.length > 1 ? 'n' : ''} ${faltan.length} dato${faltan.length > 1 ? 's' : ''}`);
}

// En un formulario: recuadro arriba con enlaces a cada campo y marca en cada campo que falta.
// Si se llegó desde un aviso (…/revisar), baja hasta el primer campo.
export function marcarFormulario(formEl, faltan) {
	const caja = h('div', { class: 'aviso-faltan', role: 'region', 'aria-label': 'Datos por completar' });
	const pintar = (lista) => {
		formEl.querySelectorAll('.campo-falta').forEach((el) => el.classList.remove('campo-falta'));
		formEl.querySelectorAll('.campo-falta-nota').forEach((el) => el.remove());
		caja.hidden = !lista.length;
		if (!lista.length) { caja.replaceChildren(); return; }
		caja.replaceChildren(
			h('div', { class: 'aviso-faltan-cab' },
				h('span', { class: 'aviso-faltan-icono icon-exclamation-triangle', 'aria-hidden': 'true' }),
				h('div', {},
					h('div', { class: 'aviso-faltan-titulo' }, lista.length === 1 ? 'Falta 1 dato por completar' : `Faltan ${lista.length} datos por completar`),
					h('div', { class: 'aviso-faltan-ayuda' }, 'Toca un dato para ir directo a su campo.'))),
			h('ul', { class: 'aviso-faltan-lista' }, lista.map((f) => h('li', {},
				h('button', { type: 'button', class: 'aviso-faltan-chip', onclick: () => irA(formEl, f.campo) },
					f.etiqueta, h('span', { class: 'icon-angle-down', 'aria-hidden': 'true' }))))));
		for (const f of lista) {
			const cont = formEl.querySelector(`[data-campo="${f.campo}"]`);
			if (!cont) continue;
			cont.classList.add('campo-falta');
			const nota = h('div', { class: 'campo-falta-nota', id: `falta-${f.campo}` },
				h('span', { class: 'icon-exclamation-circle', 'aria-hidden': 'true' }),
				h('span', {}, 'Falta completar este dato'));
			cont.append(nota);
			cont.querySelector('input, select, textarea')?.setAttribute('aria-describedby', nota.id);
		}
	};
	pintar(faltan);
	// El panel sube al inicio al mostrar la página; se espera a que el formulario esté en pantalla.
	if (faltan.length && /\/revisar$/.test(location.hash)) {
		let intentos = 0;
		const esperar = () => formEl.isConnected ? setTimeout(() => irA(formEl, faltan[0].campo), 0)
			: (++intentos < 100 && requestAnimationFrame(esperar));
		esperar();
	}
	return { el: caja, actualizar: pintar };
}

function irA(formEl, campo) {
	const cont = formEl.querySelector(`[data-campo="${campo}"]`);
	if (!cont) return;
	// Si el campo está en una pestaña o sección cerrada, se abre antes de bajar.
	const panel = cont.closest('.tab-pane:not(.active), details:not([open])');
	if (panel?.tagName === 'DETAILS') panel.open = true;
	else if (panel?.id) document.querySelector(`[data-bs-target="#${panel.id}"], [href="#${panel.id}"]`)?.click();
	cont.scrollIntoView({ behavior: 'smooth', block: 'center' });
	const control = cont.querySelector('input:not([type=hidden]), select, textarea, button');
	control?.focus({ preventScroll: true });
}

// Tarjeta de Inicio: lista agrupada con enlace a cada registro (hasta 3 por grupo).
const POR_GRUPO = 3;
export function tarjetaPendientes(pend) {
	const grupos = Object.entries(pend).filter(([, l]) => l.length);
	const total = grupos.reduce((n, [, l]) => n + l.length, 0);
	if (!total) return null;
	const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
	return h('section', { class: 'card mb-4 tarjeta-pendientes', 'aria-labelledby': 'pend-titulo' },
		h('div', { class: 'card-header tarjeta-pendientes-cab' },
			h('span', { class: 'tarjeta-pendientes-icono icon-exclamation-triangle', 'aria-hidden': 'true' }),
			h('div', { class: 'me-auto' },
				h('h2', { class: 'tarjeta-pendientes-titulo', id: 'pend-titulo' }, 'Datos por completar'),
				h('div', { class: 'tarjeta-pendientes-ayuda' }, 'Complétalos para que las fichas y los reportes salgan bien.')),
			h('span', { class: 'nav-aviso', title: plural(total, 'registro', 'registros') },
				h('span', { 'aria-hidden': 'true' }, String(total)),
				h('span', { class: 'visually-hidden' }, plural(total, 'registro', 'registros')))),
		h('div', { class: 'pendientes-grupos' }, grupos.map(([tipo, lista]) => {
			const r = REGLAS[tipo];
			const resto = lista.length - POR_GRUPO;
			return h('div', { class: 'pendientes-bloque' },
				h('div', { class: 'pendientes-grupo' },
					h('span', { class: `pendientes-grupo-icono ${r.icono}`, 'aria-hidden': 'true' }),
					h('h3', { class: 'pendientes-grupo-titulo' }, r.etiqueta),
					h('span', { class: 'pendientes-grupo-n' }, String(lista.length)),
					h('a', { href: `#/${r.ruta}/incompletos`, class: 'pendientes-ver ms-auto' },
						'Ver todos', h('span', { class: 'visually-hidden' }, ` (${r.etiqueta.toLowerCase()})`),
						h('span', { class: 'icon-angle-right', 'aria-hidden': 'true' }))),
				h('ul', { class: 'pendientes-filas' }, lista.slice(0, POR_GRUPO).map((x) => h('li', {},
					h('a', { href: enlaceRevisar(tipo, x.id), class: 'pendientes-fila' },
						h('span', { class: 'pendientes-fila-texto' },
							h('span', { class: 'pendientes-fila-nombre' }, x.nombre),
							h('span', { class: 'pendientes-fila-falta' }, `Falta: ${x.faltan.map((f) => f.etiqueta).join(', ')}`)),
						h('span', { class: 'pendientes-fila-flecha icon-angle-right', 'aria-hidden': 'true' }))))),
				resto > 0 ? h('a', { href: `#/${r.ruta}/incompletos`, class: 'pendientes-mas' },
					`Ver ${resto} más`, h('span', { class: 'icon-angle-right', 'aria-hidden': 'true' })) : null);
		})));
}

// Atajo para los editores: marca lo que falta y lo vuelve a revisar mientras se escribe.
export function vigilarFormulario(form, tipo) {
	const marca = marcarFormulario(form.el, revisar(tipo, form.state));
	let t;
	const volver = () => { clearTimeout(t); t = setTimeout(() => marca.actualizar(revisar(tipo, form.state)), 250); };
	form.el.addEventListener('input', volver);
	form.el.addEventListener('change', volver);
	return marca.el;
}

// Avisa al menú que hay que recontar (después de guardar).
export const avisarCambio = () => document.dispatchEvent(new CustomEvent('pendientes'));
