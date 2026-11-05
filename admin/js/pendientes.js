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
	for (const [tipo, lista] of Object.entries(pend)) {
		const a = document.querySelector(`.admin-nav a[data-route="${REGLAS[tipo].ruta}"]`);
		if (!a) continue;
		a.querySelector('.nav-aviso')?.remove();
		if (!lista.length) continue;
		const n = lista.length;
		a.append(h('span', { class: 'nav-aviso', title: `${n} con datos por completar` },
			h('span', { 'aria-hidden': 'true' }, String(n)),
			h('span', { class: 'visually-hidden' }, ` (${n} con datos por completar)`)));
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
			h('div', { class: 'aviso-faltan-titulo' },
				h('span', { class: 'icon-exclamation-triangle', 'aria-hidden': 'true' }),
				` Datos por completar (${lista.length})`),
			h('ul', {}, lista.map((f) => h('li', {}, h('a', { href: '#', onclick: (e) => { e.preventDefault(); irA(formEl, f.campo); } }, f.etiqueta)))));
		for (const f of lista) {
			const cont = formEl.querySelector(`[data-campo="${f.campo}"]`);
			if (!cont) continue;
			cont.classList.add('campo-falta');
			const nota = h('div', { class: 'campo-falta-nota', id: `falta-${f.campo}` }, `Falta: ${f.etiqueta}`);
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

// Tarjeta de Inicio: lista agrupada con enlace a cada registro.
export function tarjetaPendientes(pend) {
	const grupos = Object.entries(pend).filter(([, l]) => l.length);
	const total = grupos.reduce((n, [, l]) => n + l.length, 0);
	if (!total) return null;
	return h('div', { class: 'card mb-4 tarjeta-pendientes' },
		h('div', { class: 'card-header bg-white fw-semibold d-flex align-items-center gap-2' },
			h('span', { class: 'icon-exclamation-triangle texto-aviso', 'aria-hidden': 'true' }),
			h('span', { class: 'me-auto' }, 'Datos por completar'),
			h('span', { class: 'nav-aviso' }, String(total))),
		h('div', { class: 'list-group list-group-flush' }, grupos.map(([tipo, lista]) => [
			h('div', { class: 'list-group-item pendientes-grupo' },
				h('span', { class: `${REGLAS[tipo].icono} me-2`, 'aria-hidden': 'true' }),
				REGLAS[tipo].etiqueta, h('span', { class: 'text-muted fw-normal ms-1' }, `· ${lista.length}`),
				h('a', { href: `#/${REGLAS[tipo].ruta}/incompletos`, class: 'small ms-auto' }, 'Ver todos →')),
			lista.slice(0, 5).map((x) => h('a', { href: enlaceRevisar(tipo, x.id), class: 'list-group-item list-group-item-action' },
				h('div', { class: 'fw-semibold' }, x.nombre),
				h('div', { class: 'small text-muted' }, `Falta: ${x.faltan.map((f) => f.etiqueta).join(', ')}`)))
		])));
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
