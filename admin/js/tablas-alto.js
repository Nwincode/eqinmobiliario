// Cada tabla del panel cabe en la pantalla, así la barra para moverse de lado siempre se ve
// sin bajar hasta el final de la página:
// - si la caja empieza en la primera pantalla, mide lo que queda de pantalla desde ahí;
// - si empieza más abajo (o lo que queda es muy poco), mide la pantalla entera menos la barra
//   de arriba, así al llegar a ella se ve completa con su barra de lado.
// Se vuelve a medir cuando cambia el contenido, se abre un <details>, una pestaña o una
// sección escondida, cargan imágenes o letras, o cambia el tamaño de la ventana.
const SELECTOR = '.table-responsive';
const MINIMO = 240;
const MARGEN = 16;

// Alto de la barra de arriba si se queda fija al bajar (position: sticky / fixed).
function altoBarra() {
	const barra = document.querySelector('.admin-topbar');
	if (!barra) return 0;
	const pos = getComputedStyle(barra).position;
	return pos === 'sticky' || pos === 'fixed' ? barra.getBoundingClientRect().height : 0;
}

export function vigilarTablas(main) {
	let pendiente = false;
	const ajustar = () => {
		pendiente = false;
		const pantalla = window.innerHeight;
		const completa = Math.max(MINIMO, Math.round(pantalla - altoBarra() - 2 * MARGEN));
		for (const caja of main.querySelectorAll(SELECTOR)) {
			// Escondida (details cerrado, pestaña o sección oculta): se mide cuando se vea.
			if (!caja.getClientRects().length) continue;
			const arriba = caja.getBoundingClientRect().top + window.scrollY;
			const resto = Math.round(pantalla - arriba - MARGEN);
			const alto = `${resto >= MINIMO ? Math.min(resto, completa) : completa}px`;
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
