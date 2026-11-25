// Versión nueva del panel: quien tiene el panel abierto sigue con el código con que lo abrió; si mientras tanto se publicó
// otro, un guardado puede fallar (las reglas ya esperan lo nuevo). El build escribe la huella del código del panel en
// /admin/version.json (scripts/lib/huella-panel.mjs; no cambia con una publicación de contenido). Al abrir se lee la de
// esta pestaña; se vuelve a leer al volver a la pestaña y al cambiar de pantalla (a lo más cada 5 minutos) y en seguida
// cuando algo falla por permisos (ui.js showError avisa con el evento «sin-permiso»). Si cambió, arriba de la pantalla:
// «Hay una versión nueva. Recarga la página.» con su botón. Nunca recarga sola: lo escrito no se pierde.
// Sin el archivo (entorno sin build) o sin red, no dice nada. Lo pinta app.js `route` (como el aviso de dos pasos).
import { h, iconoBtn } from './ui.js';

const RUTA = '/admin/version.json';
const CADA = 5 * 60_000;
let deEstaPestana = null, hayNueva = false, ultima = 0, leyendo = null;

async function leer() {
	try {
		const r = await fetch(RUTA, { cache: 'no-store' });
		if (!r.ok) return null;
		const { v } = await r.json();
		return typeof v === 'string' && v ? v : null;
	} catch { return null; }
}

// `ya`: sin esperar los 5 minutos (un guardado que falló por permisos).
export async function revisarVersion({ ya = false } = {}) {
	if (hayNueva) return true;
	if (!ya && ultima && Date.now() - ultima < CADA) return false;
	ultima = Date.now();
	const v = await (leyendo ||= leer().finally(() => { leyendo = null; }));
	if (!deEstaPestana) { deEstaPestana = v; return false; }
	if (v && v !== deEstaPestana) { hayNueva = true; pintar(); }
	return hayNueva;
}

export function avisoVersion() {
	if (!hayNueva) return null;
	return h('div', { id: 'aviso-version', class: 'alert alert-info small d-flex align-items-center gap-2 py-1 px-2', role: 'status' },
		h('span', { class: 'flex-grow-1', style: 'min-width:0' }, 'Hay una versión nueva. Recarga la página.'),
		iconoBtn('icon-refresh', 'Recargar la página', { class: 'btn-toque btn-icono btn btn-sm btn-primary flex-shrink-0', onclick: () => location.reload() }));
}

// En la pantalla abierta, sin volver a pintarla.
function pintar() {
	const view = document.getElementById('view');
	if (!view || document.getElementById('aviso-version')) return;
	const aviso = avisoVersion();
	if (aviso) view.prepend(aviso);
}

export function vigilarVersion() {
	revisarVersion();
	document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarVersion(); });
	document.addEventListener('sin-permiso', () => revisarVersion({ ya: true }));
}
