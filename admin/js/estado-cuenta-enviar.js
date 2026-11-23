// «Enviar estado de cuenta» (solo el administrador, desde la ficha del socio): elige el mes, ve el correo tal cual le
// llegará y lo manda. El correo y los números los arma el servidor (netlify/functions/estado-cuenta-panel.mjs, el mismo
// correo del día 1); aquí solo se pide y se muestra.
import { session } from './session.js';
import { h, modal, toast, showError, hoy } from './ui.js';
import { mesAnterior } from './estado-cuenta.js';

async function pedir(accion, propietarioId, mes) {
	const token = await session.user.getIdToken();
	const res = await fetch('/api/estado-cuenta', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ accion, propietarioId, mes }) });
	const cuerpo = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(cuerpo.error || `El servidor respondió ${res.status}.`);
	return cuerpo;
}

// Los últimos 12 meses, del anterior hacia atrás: [['2026-10', 'octubre de 2026'], …].
function meses() {
	const nombre = (m) => new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));
	const lista = [mesAnterior(hoy())];
	while (lista.length < 12) lista.push(mesAnterior(`${lista.at(-1)}-01`));
	return lista.map((m) => [m, nombre(m)]);
}

export function enviarEstadoDeCuenta(socio) {
	const opciones = meses();
	const elegir = h('select', { class: 'form-select mb-3', 'aria-label': 'Mes' }, opciones.map(([m, t]) => h('option', { value: m }, t)));
	// La vista previa, sin scripts (sandbox). El correo se dibuja como en un celular (390 px) y, si la ventana es más
	// angosta, se escala para que quepa entero; con más espacio, a su ancho (el correo no pasa de 600 px). El alto se
	// mide ya escalado: la ventana tiene un solo scroll y no queda hueco debajo.
	const vista = h('iframe', { class: 'd-block border-0', title: 'Vista previa del correo', sandbox: 'allow-same-origin', height: '480' });
	const marco = h('div', { class: 'border rounded overflow-hidden' }, vista);
	const CELULAR = 390;
	const ajustar = () => {
		const cuerpo = vista.contentDocument?.body;
		const ancho = marco.clientWidth;
		if (!cuerpo || !ancho) return;
		const dibujo = Math.max(ancho, CELULAR);
		const escala = ancho / dibujo;
		vista.width = String(dibujo);
		vista.style.transform = escala < 1 ? `scale(${escala})` : '';
		vista.style.transformOrigin = 'top left';
		const alto = cuerpo.scrollHeight;
		vista.height = String(alto);
		marco.style.height = `${Math.ceil(alto * escala) + marco.offsetHeight - marco.clientHeight}px`;
	};
	vista.addEventListener('load', () => {
		ajustar();
		// La foto de arriba llega después: vuelve a medir cuando cambia.
		if (vista.contentDocument?.body) new ResizeObserver(ajustar).observe(vista.contentDocument.body);
	});
	const aviso = h('p', { class: 'small text-muted mb-2' }, 'Preparando…');
	const enviar = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, 'Enviar');
	const m = modal({
		title: 'Enviar estado de cuenta',
		size: 'modal-lg',
		body: [elegir, aviso, marco],
		footer: [h('button', { type: 'button', class: 'btn btn-light', 'data-bs-dismiss': 'modal' }, 'Cancelar'), enviar]
	});
	let pedido = 0;
	const cargar = async () => {
		const n = ++pedido;
		enviar.disabled = true;
		aviso.textContent = 'Preparando…';
		try {
			const r = await pedir('vista', socio.id, elegir.value);
			if (n !== pedido) return;
			aviso.textContent = `Para ${r.para} · ${r.asunto}`;
			vista.srcdoc = r.html;
			enviar.disabled = false;
		} catch (err) {
			if (n === pedido) { aviso.textContent = err.message; vista.srcdoc = ''; }
		}
	};
	elegir.addEventListener('change', cargar);
	enviar.addEventListener('click', async () => {
		enviar.disabled = true;
		elegir.disabled = true;
		enviar.textContent = 'Enviando…';
		try {
			const r = await pedir('enviar', socio.id, elegir.value);
			toast(`Estado de cuenta enviado a ${r.para}`);
			m.close();
		} catch (err) {
			showError(err);
			enviar.disabled = false;
			elegir.disabled = false;
			enviar.textContent = 'Enviar';
		}
	});
	cargar();
}
