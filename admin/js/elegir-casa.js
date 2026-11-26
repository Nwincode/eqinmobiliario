// «Elegir propiedad»: la única ventana del panel para escoger inmuebles (Propietarios, Calculadora de renta…).
// Pestañas Venta / Renta / Por noche, buscador y una ficha con foto por inmueble (filaCasa).
//  - varias: se marcan con un toque y «Agregar (n)» las devuelve; si no, tocar una ficha la devuelve de una vez.
//  - categorias: las pestañas que se ofrecen; categoria: la que abre; excluir: ids que no se ofrecen;
//    marcadas: las ya elegidas; marcas(p): etiquetas extra de cada ficha; nueva(categoria): botón «Nueva propiedad».
// Devuelve una promesa con la lista de ids elegidos (vacía si se cerró sin elegir).
import { h, modal, badge } from './ui.js';
import { filaCasa } from './ficha-casa.js';
import { sinTildes } from './cotizacion.js';

const CATEGORIAS = [['venta', 'Venta', 'icon-home'], ['renta', 'Renta', 'icon-key'], ['vacacional', 'Por noche', 'icon-moon-o']];
const VACIO = { venta: 'propiedades en venta', renta: 'propiedades en renta', vacacional: 'casas por noche' };

export function elegirCasas(casas, { titulo = 'Elegir propiedad', varias = false, categorias = CATEGORIAS.map(([v]) => v), categoria, excluir = new Set(), marcadas: yaMarcadas = [], marcas = () => [], nueva = null } = {}) {
	return new Promise((resolve) => {
		let resultado = [];
		const marcadas = new Set(yaMarcadas);
		const pestanasDe = CATEGORIAS.filter(([v]) => categorias.includes(v));
		let actual = categoria && categorias.includes(categoria) ? categoria : pestanasDe[0][0];
		const buscar = h('input', { class: 'form-control', type: 'search', 'aria-label': 'Buscar propiedad', placeholder: 'Buscar título, código o zona…' });
		const lista = h('div', { class: 'lista-casas' });
		const agregar = varias ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { resultado = [...marcadas]; ventana.close(); } }) : null;
		const pintarAgregar = () => {
			if (!agregar) return;
			agregar.disabled = !marcadas.size;
			agregar.textContent = marcadas.size > 1 ? `Agregar ${marcadas.size}` : 'Agregar';
		};
		const tocar = (id) => {
			if (!varias) { resultado = [id]; ventana.close(); return; }
			if (!marcadas.delete(id)) marcadas.add(id);
			pintarAgregar();
			dibujar();
		};
		const pestanas = pestanasDe.map(([valor, texto, icono]) => h('button', { type: 'button', class: 'btn btn-outline-primary', dataset: { categoria: valor },
			onclick: () => { actual = valor; dibujar(); } }, h('span', { class: icono, 'aria-hidden': 'true' }), ` ${texto}`));
		const dibujar = () => {
			const q = sinTildes(buscar.value.trim());
			pestanas.forEach((b) => { const on = b.dataset.categoria === actual; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
			const visibles = casas.filter((p) => !excluir.has(p.id) && (p.operacion || 'venta') === actual)
				.filter((p) => !q || sinTildes(`${p.titulo} ${p.codigo || ''} ${p.zona || ''} ${p.ciudad || ''}`).includes(q));
			lista.replaceChildren(
				...visibles.map((p) => filaCasa(p, { elegida: marcadas.has(p.id), alTocar: () => tocar(p.id),
					marcas: [p.publicado ? null : badge('Sin publicar', 'light'), ...marcas(p)] })),
				visibles.length ? null : h('p', { class: 'text-muted small mb-0' }, `No hay ${VACIO[actual]} que coincidan.${nueva ? ' Puedes crearla con «Nueva propiedad».' : ''}`));
		};
		buscar.addEventListener('input', dibujar);
		dibujar();
		pintarAgregar();
		const ventana = modal({ title: titulo, footer: agregar, size: 'modal-lg', body: h('div', {},
			pestanas.length > 1 ? h('div', { class: 'btn-group w-100 mb-2', role: 'group', 'aria-label': 'Categoría' }, pestanas) : null,
			h('div', { class: 'd-flex gap-2 mb-2' }, buscar, nueva ? h('button', { type: 'button', class: 'btn btn-outline-primary text-nowrap', title: 'Nueva propiedad', 'aria-label': 'Nueva propiedad',
				onclick: () => { resultado = null; ventana.close(); nueva(actual); } },
				h('span', { class: 'icon-plus', 'aria-hidden': 'true' }), h('span', { class: 'd-none d-sm-inline' }, ' Nueva propiedad')) : null),
			lista),
			onClose: () => resolve(resultado) });
		setTimeout(() => buscar.focus(), 300);
	});
}
