// Lo que el dueño le pide al equipo de su casa en venta o renta («Mis propiedades» → la casa): la única puerta para
//  - «Pedir un cambio»: qué quiere cambiar (texto) y, si quiere, fotos;
//  - «Ya se vendió» / «Ya se rentó»: la fecha y, si quiere, el precio final (en la moneda de la casa).
// Se guarda como su respuesta al anuncio (comentariosPropietarios, tipo «cambios» o «cierre»): la lee y la atiende el
// administrador o el asesor del dueño en «Cambios de los dueños» (admin/js/views/cambios-dueno.js), con aviso en la
// campana. Nada cambia en la casa hasta que el equipo lo aplica. Las fotos suben a pedidosDueno/{casa}/{pedido}/1…6, la
// carpeta que el servidor le aparta (storage.rules: sin reemplazar, la ✕ la borra; solo vigente y antes de enviar).
import { db, doc, collection, setDoc, serverTimestamp } from './firebase.js';
import { h, modal, toast, showError, errorMessage, fallaDelServidor, menuMas, hoy } from './ui.js';
import { renderForm } from './form.js';
import { prefijoMoneda } from './formato.js';
import { precioFinalDe, faltaFechaCierre } from './cierre-casa.js';

export const MAX_FOTOS_PEDIDO = 6;
const ic = (clase) => h('span', { class: `${clase} me-1`, 'aria-hidden': 'true' });
const cerrada = (p) => ['vendida', 'rentada'].includes(p.estado);
export const textoCierre = (operacion) => (operacion === 'renta' ? 'Ya se rentó' : 'Ya se vendió');

// Lo que llevan todos sus pedidos (el resumen dice de quién es y quién es su asesor: las reglas lo comparan).
const base = (resumen, p, tipo, texto) => ({
	token: resumen.id, propietarioId: resumen.propietarioId, agentId: resumen.agentId || '', propiedadId: p.id,
	tipo, texto, fecha: serverTimestamp(), origen: 'propietario', idioma: 'es'
});

// Una ventana con su formulario y su botón (por omisión «Enviar», con el ícono de enviar de la maqueta aprobada).
function ventana(titulo, cuerpo, enviar, [icono, texto] = ['icon-paper-plane-o', 'Enviar']) {
	const btn = h('button', { type: 'button', class: 'btn btn-primary' }, ic(icono), texto);
	const m = modal({ title: titulo, body: cuerpo, footer: [h('button', { type: 'button', class: 'btn btn-light', 'data-bs-dismiss': 'modal' }, 'Cancelar'), btn] });
	btn.addEventListener('click', async () => {
		btn.disabled = true;
		try { if (await enviar()) m.close(); } catch (err) { showError(err); }
		btn.disabled = false;
	});
	return m;
}

// La carpeta de fotos del pedido la aparta el servidor (/api/pedido-dueno: vigente un día, con tope; storage.rules solo
// deja subir ahí). Devuelve el id del pedido.
async function apartarPedido(casaId) {
	const { session } = await import('./session.js');
	const res = await fetch('/api/pedido-dueno', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await session.user.getIdToken()}` }, body: JSON.stringify({ casa: casaId }) });
	const r = await res.json().catch(() => ({}));
	if (!res.ok || !r.id) throw new Error(r.error || fallaDelServidor(res.status));
	return r.id;
}

export async function pedirCambio(resumen, p) {
	// Sin carpeta (el servidor no respondió), el pedido sale igual, solo con el texto: se dice en la misma ventana.
	let id = '', sinFotos = '';
	try { id = await apartarPedido(p.id); } catch (err) { sinFotos = `Las fotos no se pueden subir ahora (${errorMessage(err)}): envía el texto y mándalas después.`; }
	const ref = id ? doc(db, 'comentariosPropietarios', id) : doc(collection(db, 'comentariosPropietarios'));
	const datos = { texto: '', fotos: [] };
	const form = renderForm([
		{ name: 'texto', label: '¿Qué quieres cambiar?', type: 'textarea', rows: 3, maxlength: 2000, placeholder: 'El precio, una foto, un dato…' },
		id ? { name: 'fotos', label: 'Fotos (opcional)', type: 'images', simple: true, max: MAX_FOTOS_PEDIDO, numeradas: true, maxSubidas: MAX_FOTOS_PEDIDO, borrarAlQuitar: true,
			folder: `pedidosDueno/${p.id}/${id}` } : null
	].filter(Boolean), datos);
	return ventana('Pedir un cambio', [form.el, sinFotos ? h('p', { class: 'form-text mb-0 mt-2' }, sinFotos) : null], async () => {
		const d = form.getData();
		const texto = String(d.texto || '').trim();
		if (!texto) { toast('Escribe qué quieres cambiar.', 'warning'); return false; }
		const fotos = (d.fotos || []).map((f) => f.path).filter(Boolean).slice(0, MAX_FOTOS_PEDIDO);
		// Sin fotos, sin la llave (así también lo aceptan las reglas de antes).
		await setDoc(ref, { ...base(resumen, p, 'cambios', texto), ...(fotos.length ? { fotos } : {}) });
		toast('Listo: tu asesor recibió lo que quieres cambiar.');
		return true;
	});
}

// La fecha y el precio final de un cierre, en la moneda de la casa: la misma ventana para el dueño («Ya se vendió») y para
// el equipo («Aplicar» en Cambios de los dueños, que revisa y corrige lo que dio el dueño). alEnviar({ fechaCierre,
// precioFinal }) → true para cerrar. nota: una línea debajo (qué pasa al enviar, o el cierre que ya tenía la casa).
export function ventanaCierre({ titulo, casa, fecha: f = '', precio = '', nota = '', boton, alEnviar }) {
	const renta = casa?.operacion === 'renta';
	const hoyIso = hoy();
	const fecha = h('input', { class: 'form-control', type: 'date', id: `cierre-f-${casa?.id || 'x'}`, value: f || hoyIso, max: hoyIso, required: true });
	const monto = h('input', { class: 'form-control', type: 'number', inputmode: 'decimal', min: 0, step: '0.01', id: `cierre-p-${casa?.id || 'x'}`, value: precio === '' || precio == null ? '' : String(precio) });
	const cuerpo = h('div', {},
		h('div', { class: 'row g-3' },
			h('div', { class: 'col-6' }, h('label', { class: 'form-label', for: fecha.id }, renta ? 'Fecha de renta' : 'Fecha de venta'), fecha),
			h('div', { class: 'col-6' }, h('label', { class: 'form-label', for: monto.id }, renta ? 'Renta final (opcional)' : 'Precio final (opcional)'),
				h('div', { class: 'input-group' }, h('span', { class: 'input-group-text' }, prefijoMoneda(casa?.moneda || 'USD')), monto))),
		nota ? h('p', { class: 'form-text mb-0 mt-2' }, nota) : null);
	return ventana(titulo, cuerpo, async () => {
		const falta = faltaFechaCierre(fecha.value, hoyIso);
		if (falta) { fecha.focus(); toast(falta, 'warning'); return false; }
		const precioFinal = precioFinalDe(monto.value);
		if (precioFinal === null) { monto.focus(); toast('Revisa el precio final: solo el número, mayor que cero.', 'warning'); return false; }
		return alEnviar({ fechaCierre: fecha.value, precioFinal });
	}, boton);
}

export function yaSeCerro(resumen, p) {
	const ref = doc(collection(db, 'comentariosPropietarios'));
	return ventanaCierre({ titulo: textoCierre(p.operacion), casa: p, nota: 'Tu asesor lo confirma y la casa deja de ofrecerse en la página.', alEnviar: async ({ fechaCierre, precioFinal }) => {
		await setDoc(ref, { ...base(resumen, p, 'cierre', ''), fechaCierre, ...(precioFinal ? { precioFinal } : {}) });
		toast('Listo: tu asesor lo confirma y la casa deja de ofrecerse en la página.');
		return true;
	} });
}

// Los dos botones en la fila del título: en computadora con su texto; en el celular, en el ⋮ (menuMas).
// Una casa ya vendida o rentada solo ofrece «Pedir un cambio».
export function accionesPedido(resumen, p) {
	const acciones = [{ icono: 'icon-pencil', texto: 'Pedir un cambio', onclick: () => pedirCambio(resumen, p) },
		cerrada(p) ? null : { icono: 'icon-flag-checkered', texto: textoCierre(p.operacion), onclick: () => yaSeCerro(resumen, p) }].filter(Boolean);
	return [
		...acciones.map((a) => h('button', { type: 'button', class: 'btn btn-outline-secondary btn-toque d-none d-md-inline-flex text-nowrap', onclick: a.onclick }, ic(a.icono), a.texto)),
		h('div', { class: 'd-md-none' }, menuMas('Más acciones', acciones))
	];
}
