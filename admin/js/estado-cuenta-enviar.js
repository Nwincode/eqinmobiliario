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

// Los últimos 12 meses, del anterior hacia atrás, y el que va: [['2026-10', 'octubre de 2026'], …].
function meses() {
	const nombre = (m) => new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));
	const lista = [hoy().slice(0, 7)];
	for (let i = 0; i < 12; i++) lista.push(mesAnterior(`${lista.at(-1)}-01`));
	return lista.map((m) => [m, nombre(m)]);
}

export function enviarEstadoDeCuenta(socio) {
	const opciones = meses();
	const elegir = h('select', { class: 'form-select mb-3', 'aria-label': 'Mes' }, opciones.map(([m, t]) => h('option', { value: m }, t)));
	elegir.value = opciones[1][0];
	// Sin scripts (sandbox); mide lo que ocupa el correo para que la ventana tenga un solo scroll.
	const vista = h('iframe', { class: 'w-100 border rounded', title: 'Vista previa del correo', sandbox: 'allow-same-origin', height: '480' });
	vista.addEventListener('load', () => { const alto = vista.contentDocument?.documentElement?.scrollHeight; if (alto) vista.height = String(alto); });
	const aviso = h('p', { class: 'small text-muted mb-2' }, 'Preparando…');
	const enviar = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, 'Enviar');
	const m = modal({
		title: 'Enviar estado de cuenta',
		size: 'modal-lg',
		body: [elegir, aviso, vista],
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
