// Pieza «sugerido»: un campo de texto con su lista de opciones agrupadas que se filtra al escribir (municipio, zona,
// siglas del condominio, zonas de interés). La lista es la del menú ⋮ (.menu-mas-lista) puesta debajo del campo; sin
// scroll propio: muestra hasta `max` y «Escribe para ver las otras N». La usan form.js (tipo «sugerido» y «tags» con
// `lista`). Teclado: ↑ ↓ para moverse, Enter elige, Esc cierra.
import { h } from './ui.js';
import { sinTildes } from './lugares.js';

let n = 0;
// grupos(alEntrar): [[título | '', [{ texto, nota? , valor? }]]] (alEntrar: lo que tenía el campo al entrar; con alTeclear,
// el valor ya es lo que se escribe y no debe salir como opción). mostrado(): el texto del campo cuando no se escribe.
// alElegir(opcion | null): eligió una (null = borró el campo). libre: lo escrito que no es una opción también vale
// (alEscribir(texto)); si no, al salir vuelve a lo que estaba. alTeclear(texto): lo escrito, en cada tecla (un campo libre
// queda guardado aunque se toque «Guardar» sin salir de él).
export function campoSugerido({ grupos, mostrado = () => '', alElegir, libre = false, alEscribir = null, alTeclear = null, placeholder = '', max = 8, input = null, vacio = 'Sin coincidencias' }) {
	const id = `sug-${++n}`;
	input = input || h('input', { class: 'form-control', type: 'search' });
	Object.assign(input, { autocomplete: 'off', placeholder: input.placeholder || placeholder });
	input.setAttribute('role', 'combobox');
	input.setAttribute('aria-autocomplete', 'list');
	input.setAttribute('aria-controls', id);
	input.setAttribute('aria-expanded', 'false');
	const lista = h('ul', { class: 'dropdown-menu menu-mas-lista', id, role: 'listbox' });
	const el = h('div', { class: 'sugerido' }, lista);
	// escrito: se tecleó desde que se entró (la lista se filtra con eso); alEntrar: lo que había, para Esc.
	let visibles = [], activa = -1, abierta = false, escrito = false, alEntrar = '';

	const filtrar = (q) => {
		const palabras = sinTildes(q).split(' ').filter(Boolean);
		return grupos(alEntrar).map(([titulo, ops]) => [titulo, ops.filter((o) => palabras.every((p) => sinTildes(`${o.texto} ${titulo}`).includes(p)))]).filter(([, ops]) => ops.length);
	};
	const cerrar = () => { abierta = false; lista.classList.remove('show'); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
	const marcar = (i) => {
		activa = i;
		lista.querySelectorAll('.dropdown-item').forEach((b, j) => b.classList.toggle('active', j === i));
		if (i >= 0) input.setAttribute('aria-activedescendant', `${id}-${i}`); else input.removeAttribute('aria-activedescendant');
	};
	const elegir = (o) => {
		escrito = false;
		cerrar();
		alElegir(o);
		input.value = mostrado();
		// «change» (no «input»): quien escucha el formulario (p. ej. el código automático) se entera sin reabrir la lista.
		input.dispatchEvent(new Event('change', { bubbles: true }));
	};
	const abrir = () => {
		const q = escrito ? input.value : '';
		const gs = filtrar(q);
		const total = gs.reduce((s, [, ops]) => s + ops.length, 0);
		visibles = [];
		const filas = [];
		for (const [titulo, ops] of gs) {
			const caben = ops.slice(0, Math.max(0, max - visibles.length));
			if (!caben.length) break;
			if (titulo) filas.push(h('li', { role: 'presentation' }, h('h6', { class: 'dropdown-header' }, titulo)));
			for (const o of caben) {
				const i = visibles.push(o) - 1;
				filas.push(h('li', { role: 'presentation' }, h('button', { type: 'button', class: 'dropdown-item', id: `${id}-${i}`, role: 'option', tabindex: '-1',
					onmousedown: (e) => e.preventDefault(), onclick: () => elegir(o) }, o.texto, o.nota ? h('small', {}, o.nota) : null)));
			}
		}
		const faltan = total - visibles.length;
		if (faltan > 0) filas.push(h('li', { class: 'dropdown-mas' }, `Escribe para ver ${faltan === 1 ? 'la otra' : `las otras ${faltan}`}`));
		if (!visibles.length && (libre || !q)) return cerrar();
		if (!visibles.length) filas.push(h('li', { class: 'dropdown-mas' }, vacio));
		lista.replaceChildren(...filas);
		abierta = true;
		lista.classList.add('show');
		input.setAttribute('aria-expanded', 'true');
		// Marcada: la que se llama exactamente como lo escrito («Zona 1», no «Zona 16») o, si no, la primera.
		const exacta = visibles.findIndex((o) => sinTildes(o.texto) === sinTildes(q));
		marcar(exacta >= 0 ? exacta : q && visibles.length ? 0 : -1);
	};
	const salir = () => {
		cerrar();
		if (!escrito) { input.value = mostrado(); return; }
		escrito = false;
		const t = input.value.trim();
		if (!t) { alElegir(null); input.value = mostrado(); input.dispatchEvent(new Event('change', { bubbles: true })); return; }
		// Escrito completo sin elegirlo de la lista: vale la opción que se llama así («Taxisco» → «Taxisco, Santa Rosa»).
		const todas = grupos(alEntrar).flatMap(([, ops]) => ops);
		const igual = todas.find((o) => sinTildes(o.texto) === sinTildes(t)) || todas.find((o) => sinTildes(o.texto).split(',')[0] === sinTildes(t));
		if (igual) return elegir(igual);
		if (libre) { (alEscribir || alElegir)(t); input.value = mostrado(); input.dispatchEvent(new Event('change', { bubbles: true })); return; }
		input.value = mostrado();
	};
	// Al entrar, lo escrito queda seleccionado: lo que se teclea lo reemplaza (y se busca desde cero).
	input.addEventListener('focus', () => { escrito = false; alEntrar = mostrado(); input.select(); abrir(); });
	input.addEventListener('click', () => { if (!abierta) abrir(); });
	input.addEventListener('input', () => { escrito = true; if (alTeclear) alTeclear(input.value.trim()); abrir(); });
	input.addEventListener('blur', salir);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!abierta) return abrir();
			if (visibles.length) marcar((activa + (e.key === 'ArrowDown' ? 1 : -1) + visibles.length) % visibles.length);
		} else if (e.key === 'Enter') {
			if (abierta && activa >= 0) { e.preventDefault(); elegir(visibles[activa]); } else if (libre) { e.preventDefault(); salir(); }
		} else if (e.key === 'Escape' && abierta) { e.preventDefault(); cerrar(); escrito = false; if (alTeclear) alTeclear(alEntrar); input.value = mostrado(); }
	});
	input.value = mostrado();
	el.prepend(input);
	return { el, input, pintar: () => { if (document.activeElement !== input) input.value = mostrado(); }, abrir };
}
