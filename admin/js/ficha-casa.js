// Ficha corta de una casa (foto, título, zona, datos con ícono y precio): la misma en el listado de Propiedades,
// en la ficha del dueño, en su selector y en «Mis propiedades» del panel del dueño. Sin dependencias pesadas,
// para que el panel del dueño no cargue la ficha completa del inmueble.
import { h, badge, formatPrice } from './ui.js';
import { miles } from './formato.js';
import { OPERACIONES } from './estados.js';
import { diasExclusiva } from './acuerdo.js';

// Habitaciones, baños, parqueos, huéspedes y m², cada uno con su ícono.
export function datosDe(p) {
	const n = (v) => Number(v) > 0;
	return [
		n(p.habitaciones) && ['icon-bed', p.habitaciones, 'habitaciones'],
		n(p.banos) && ['icon-bath', p.banos, 'baños'],
		n(p.parqueos) && ['icon-car', p.parqueos, 'parqueos'],
		p.operacion === 'vacacional' && n(p.vacacional?.huespedesMax) && ['icon-users', p.vacacional.huespedesMax, 'huéspedes'],
		n(p.m2Construccion) ? ['icon-home', `${miles(p.m2Construccion)} m²`, 'de construcción']
			: n(p.m2Terreno) && ['icon-arrows-alt', `${miles(p.m2Terreno)} m²`, 'de terreno']
	].filter(Boolean).map(([icono, valor, que]) => h('span', { class: 'prop-dato', title: `${valor} ${que}` },
		h('span', { class: icono, 'aria-hidden': 'true' }), ` ${valor}`, h('span', { class: 'visually-hidden' }, ` ${que}`)));
}

// Devuelve las piezas; quien la usa pone el contenedor (el botón que la elige, el enlace que la abre…).
export function fichaCasa(p, avisos = []) {
	const chips = datosDe(p);
	const operacion = OPERACIONES.find(([v]) => v === p.operacion)?.[1] || '';
	return [
		p.fotos?.[0]?.url ? h('img', { class: 'thumb flex-shrink-0', src: p.fotos[0].url, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb thumb-vacia flex-shrink-0', title: 'Sin fotos' }, h('span', { class: 'icon-camera', 'aria-hidden': 'true' })),
		// En celular el precio baja a su propia línea; el título no se aprieta.
		h('span', { class: 'flex-grow-1', style: 'flex-basis: 12rem; min-width: 0' },
			h('span', { class: 'd-block fw-semibold prop-titulo' }, p.titulo || '(sin título)', ' ', p.publicado ? null : badge('Sin publicar', 'light'), avisos),
			h('span', { class: 'd-block small text-muted prop-zona' }, h('span', { class: 'icon-map-marker', 'aria-hidden': 'true' }), ` ${[operacion, p.zona, p.ciudad].filter(Boolean).join(' · ')}`),
			chips.length ? h('span', { class: 'prop-datos' }, chips) : null),
		h('span', { class: 'text-nowrap fw-semibold ms-auto' }, formatPrice(p.precio, p.moneda, p.operacion))];
}
export const FILA_CASA = 'd-flex flex-wrap align-items-center gap-2 text-start';

// Estado de la exclusiva de un inmueble, a partir de su acuerdo (admin/js/acuerdo.js).
export function estadoExclusiva(acuerdo) {
	const d = diasExclusiva(acuerdo);
	if (d === null) return acuerdo?.exclusiva ? badge('Exclusiva sin fecha', 'secondary') : badge('Sin exclusiva', 'light');
	if (d < 0) return badge(`Vencida hace ${-d} días`, 'danger');
	if (d <= 30) return badge(`Vence en ${d} días`, 'warning');
	return badge(`Exclusiva · ${d} días`, 'success');
}
