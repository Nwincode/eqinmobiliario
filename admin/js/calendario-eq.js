// «Calendario de EQ»: el enlace iCal que se pega en Airbnb, Booking y VRBO para que bloqueen las noches que ya reservó
// un cliente de EQ (netlify/functions/calendario.mjs). Una sola pieza para la ficha de la casa (administrador) y «La casa»
// del dueño: un campo del formulario con el enlace y un botón para copiarlo. El enlace es privado (lleva su llave).
import { h, toast, iconoBtn, errorMessage } from './ui.js';
import { session } from './session.js';

export function campoCalendarioEq(casaId, { when } = {}) {
	let pedido = false;
	return {
		type: 'custom', label: 'Calendario de Equipo Inmobiliario (pégalo en Airbnb, Booking y VRBO)', cols: 12, when,
		update: (el) => {
			if (pedido) return;
			pedido = true;
			if (!casaId) { el.replaceChildren(h('p', { class: 'small text-muted mb-0' }, 'Guarda la casa primero: después aparece aquí su enlace.')); return; }
			const campo = h('input', { class: 'form-control form-control-sm', readonly: true, value: 'Cargando…', 'aria-label': 'Enlace del calendario de Equipo Inmobiliario' });
			const copiar = iconoBtn('icon-copy', 'Copiar el enlace', { onclick: async () => {
				try { await navigator.clipboard.writeText(campo.value); toast('Enlace copiado.'); } catch { campo.select(); }
			} });
			copiar.disabled = true;
			const ayuda = h('div', { class: 'form-text' }, 'Las plataformas leen de aquí las reservas confirmadas en nuestro sitio, sin datos del huésped. Es privado: no lo compartas.');
			el.replaceChildren(h('div', { class: 'd-flex gap-2 align-items-center' }, campo, copiar), ayuda);
			(async () => {
				const token = await session.user.getIdToken();
				const r = await fetch(`/api/calendario?casa=${encodeURIComponent(casaId)}`, { headers: { Authorization: `Bearer ${token}` } });
				const b = await r.json().catch(() => ({}));
				if (!r.ok || !b.url) throw new Error(b.error || 'No se pudo pedir el enlace. Inténtalo más tarde.');
				campo.value = b.url;
				copiar.disabled = false;
			})().catch((err) => {
				// El aviso va debajo del campo (el mismo de un campo con error), no dentro: en el celular se cortaba.
				campo.value = '';
				campo.placeholder = 'Sin enlace por ahora';
				ayuda.replaceWith(h('div', { class: 'invalid-feedback d-block', role: 'alert' }, errorMessage(err)));
			});
		}
	};
}
