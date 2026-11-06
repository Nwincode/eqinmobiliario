// Cada tabla del panel mide justo lo que queda de pantalla desde donde empieza,
// así la barra para moverse de lado siempre se ve sin bajar hasta el final.
const SELECTOR = '.table-responsive:not(.calc-largo)';
const MINIMO = 320;
const MARGEN = 16;

export function vigilarTablas(main) {
	let pendiente = false;
	const ajustar = () => {
		pendiente = false;
		for (const caja of main.querySelectorAll(SELECTOR)) {
			const arriba = caja.getBoundingClientRect().top + window.scrollY;
			caja.style.setProperty('--tabla-alto', `${Math.max(MINIMO, Math.round(window.innerHeight - arriba - MARGEN))}px`);
		}
	};
	const pedir = () => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(ajustar);
	};
	new MutationObserver(pedir).observe(main, { childList: true, subtree: true });
	window.addEventListener('resize', pedir);
	pedir();
}
