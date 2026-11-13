// Lo que comparten todas las tablas del panel.
// Fichas en celular y tableta: cada celda lleva el título de su columna (data-label) para que admin.css
// lo muestre cuando la fila se vuelve ficha; la columna sin título (los botones) va al final.
// Un solo scroll por pantalla:
// - si la vista es una sola tabla y le queda al menos media pantalla (computadora), la tabla mide
//   lo que queda de pantalla: la página no baja, baja la tabla con sus títulos fijos y la barra
//   para moverse de lado siempre a la vista;
// - en cualquier otro caso (celular, varias tablas, o contenido que ya obliga a bajar) la tabla
//   va completa y baja la página.
// Se vuelve a medir cuando cambia el contenido, se abre un <details>, una pestaña o una
// sección escondida, cargan imágenes o letras, o cambia el tamaño de la ventana.
const SELECTOR = '.table-responsive';
const MINIMO = 0.5; // parte de la pantalla que debe quedarle a la tabla; con menos, baja la página
const ANCHO_MOVIL = 1200; // el mismo corte de admin.css: debajo, las filas son fichas

const TABLAS = 'table.table-admin:not(.tabla-propiedades)';

function etiquetar(main) {
	for (const tabla of main.querySelectorAll(TABLAS)) {
		const titulos = [...tabla.querySelectorAll(':scope > thead th')].map((th) => (th.querySelector('.visually-hidden') ? '' : th.textContent.trim()));
		if (!titulos.length) continue;
		for (const fila of tabla.querySelectorAll(':scope > tbody > tr')) {
			[...fila.children].forEach((celda, i) => {
				if (!i || celda.colSpan > 1) return;
				const vacia = celda.textContent.trim() === '—';
				if (celda.classList.contains('ficha-vacia') !== vacia) celda.classList.toggle('ficha-vacia', vacia);
				if (titulos[i]) {
					if (celda.dataset.label !== titulos[i]) celda.dataset.label = titulos[i];
				} else if (!celda.classList.contains('ficha-acciones')) celda.classList.add('ficha-acciones');
			});
		}
	}
}

export function vigilarTablas(main) {
	let pendiente = false;
	const ajustar = () => {
		pendiente = false;
		etiquetar(main);
		// Escondidas (details cerrado, pestaña o sección oculta) no cuentan: se miden al verse.
		const cajas = [...main.querySelectorAll(SELECTOR)].filter((c) => c.getClientRects().length);
		const sola = cajas.length === 1 && window.innerWidth >= ANCHO_MOVIL;
		for (const caja of cajas) {
			let alto = 'none';
			if (sola) {
				// Lo de arriba y lo de abajo de la caja no dependen de su propio alto: la medida no se persigue a sí misma.
				const r = caja.getBoundingClientRect();
				const arriba = r.top + window.scrollY;
				const abajo = document.documentElement.scrollHeight - (r.bottom + window.scrollY);
				const resto = Math.floor(window.innerHeight - arriba - abajo);
				if (resto >= window.innerHeight * MINIMO) alto = `${resto}px`;
			}
			if (caja.style.getPropertyValue('--tabla-alto') !== alto) caja.style.setProperty('--tabla-alto', alto);
		}
	};
	const pedir = () => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(ajustar);
	};
	// Sin 'style' en el filtro: el alto que se pone aquí no vuelve a disparar la medida.
	new MutationObserver(pedir).observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'open', 'hidden'] });
	if ('ResizeObserver' in window) new ResizeObserver(pedir).observe(main);
	main.addEventListener('toggle', pedir, true); // <details> (no sube por el árbol)
	main.addEventListener('load', pedir, true); // imágenes
	for (const ev of ['shown.bs.tab', 'shown.bs.collapse']) main.addEventListener(ev, pedir);
	window.addEventListener('resize', pedir);
	document.fonts?.ready.then(pedir);
	pedir();
}
