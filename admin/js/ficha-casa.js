// La fila de una casa (maqueta aprobada): foto cuadrada; al lado nombre, ubicación, datos y precio; a la derecha,
// si se le pasa, el ⚠ (o ✓) arriba y el ⋮ abajo. Es la única del panel: Propiedades, «Mis propiedades» del dueño,
// las casas de un propietario y su selector, el listado en PDF y el importador. Cada fila es una tarjeta; la lista
// que las junta es `.lista-casas`. Sin dependencias pesadas: el panel del dueño la carga sin la ficha del inmueble.
import { h, badge, formatPrice } from './ui.js';
import { miles } from './formato.js';
import { diasExclusiva } from './acuerdo.js';

// Habitaciones, baños, parqueos, huéspedes y m², cada uno con su ícono: el mismo orden e íconos que la tarjeta del
// sitio (scripts/lib/templates.mjs `specs`). En la fila va un solo m²: el de construcción o, sin él, el de terreno.
export function datosDe(p) {
	const n = (v) => Number(v) > 0;
	return [
		n(p.habitaciones) && ['icon-bed', p.habitaciones, 'habitaciones'],
		n(p.banos) && ['icon-bath', p.banos, 'baños'],
		n(p.parqueos) && ['icon-car', p.parqueos, 'parqueos'],
		p.operacion === 'vacacional' && n(p.vacacional?.huespedesMax) && ['icon-users', p.vacacional.huespedesMax, 'huéspedes'],
		n(p.m2Construccion) ? ['icon-construccion', `${miles(p.m2Construccion)} m²`, 'de construcción']
			: n(p.m2Terreno) && ['icon-terreno', `${miles(p.m2Terreno)} m²`, 'de terreno']
	].filter(Boolean).map(([icono, valor, que]) => h('span', { class: 'prop-dato', title: `${valor} ${que}` },
		h('span', { class: icono, 'aria-hidden': 'true' }), ` ${valor}`, h('span', { class: 'visually-hidden' }, ` ${que}`)));
}

// p: la casa. Opciones:
//  alTocar  qué hace tocar la fila (abrir la ficha, elegirla); href la hace enlace (sin `der` adentro).
//  sel      la casilla de «elegir»: va sobre la foto y se ve cuando la lista tiene `.eligiendo`; tocar la fila la marca.
//  der      lo de la columna derecha (⚠ o ✓ y ⋮).
//  extra    la línea de computadora (código, asesor, fecha…).
//  marcas   etiquetas al lado del nombre (exclusiva, «Sin publicar»…).
//  foto     otra foto (el importador la abre del archivo); precio: otro texto de precio.
//  oculta   foto apagada (no sale en la página); elegida: la que ya está elegida en un selector.
export function filaCasa(p, { alTocar, href, sel, der, extra = [], marcas = [], foto, precio, oculta = !p.publicado, elegida = false } = {}) {
	const lugar = [p.zona, p.ciudad].filter(Boolean).join(', ');
	const nombre = p.titulo || 'la propiedad';
	const tocar = (e) => {
		if (e.target.closest('.casa-der, .casa-sel')) return;
		if (sel && e.currentTarget.closest('.lista-casas')?.classList.contains('eligiendo')) {
			if (!sel.disabled) { sel.checked = !sel.checked; sel.dispatchEvent(new Event('change')); }
			return;
		}
		alTocar?.(e);
	};
	const conTeclado = (e) => {
		if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); e.currentTarget.click(); }
	};
	const fotoCasa = foto || (p.fotos?.[0]?.url ? h('img', { src: p.fotos[0].url, alt: '', loading: 'lazy' })
		: h('span', { class: 'casa-sin-foto', title: 'Sin fotos' }, h('span', { class: 'icon-camera', 'aria-hidden': 'true' })));
	const extras = extra.filter(Boolean);
	return h(href ? 'a' : 'article', {
		class: `casa-fila${oculta ? ' casa-oculta' : ''}${elegida ? ' casa-elegida' : ''}`, href,
		tabindex: href ? null : '0', 'aria-label': nombre, 'aria-current': elegida ? 'true' : null,
		dataset: { operacion: p.operacion || '' },
		onclick: href ? null : tocar, onkeydown: href ? null : conTeclado
	},
		h('div', { class: 'casa-foto' }, fotoCasa, sel ? h('label', { class: 'casa-sel' }, sel) : null),
		h('div', { class: 'casa-txt' },
			h('div', { class: 'casa-titulo' }, p.titulo || '(sin título)', marcas.filter(Boolean).length ? [' ', marcas] : null),
			lugar ? h('div', { class: 'casa-dato' }, h('span', { class: 'icon-map-marker', 'aria-hidden': 'true' }), h('span', {}, lugar)) : null,
			h('div', { class: 'casa-datos prop-datos' }, datosDe(p)),
			extras.length ? h('div', { class: 'casa-dato casa-extra' }, extras) : null,
			h('div', { class: 'casa-precio' }, precio ?? formatPrice(p.precio, p.moneda, p.operacion))),
		der ? h('div', { class: 'casa-der' }, der) : null);
}

// Dirección de la casa en el sitio (la ficha VIP vive en /vip/). Una sola, para el panel y el panel del dueño.
export function publicUrl(p) {
	return `${p.vip ? '/vip/' : '/propiedad/'}${p.slug}/`;
}

// Estado de la exclusiva de un inmueble, a partir de su acuerdo (admin/js/acuerdo.js).
export function estadoExclusiva(acuerdo) {
	const d = diasExclusiva(acuerdo);
	if (d === null) return acuerdo?.exclusiva ? badge('Exclusiva sin fecha', 'secondary') : badge('Sin exclusiva', 'light');
	if (d < 0) return badge(`Vencida hace ${-d} días`, 'danger');
	if (d <= 30) return badge(`Vence en ${d} días`, 'warning');
	return badge(`Exclusiva · ${d} días`, 'success');
}
