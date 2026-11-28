// Lo que el dueño le pide al equipo de su casa en venta o renta («Mis propiedades» → la casa): la única puerta para
//  - «Pedir un cambio»: qué quiere cambiar (texto) y, si quiere, fotos;
//  - «Ya se vendió» / «Ya se rentó»: la fecha y, si quiere, el precio final (en la moneda de la casa).
// Se guarda como su respuesta al anuncio (comentariosPropietarios, tipo «cambios» o «cierre»): la lee y la atiende el
// administrador o el asesor del dueño en «Cambios de los dueños» (admin/js/views/cambios-dueno.js), con aviso en la
// campana. Nada cambia en la casa hasta que el equipo lo aplica. Las fotos suben a pedidosDueno/{casa}/{pedido}/1…6
// (storage.rules: solo el dueño de la casa, sin reemplazar, mientras el pedido no se haya enviado).
import { db, doc, collection, setDoc, serverTimestamp } from './firebase.js';
import { h, modal, toast, showError, menuMas, hoy } from './ui.js';
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

// Una ventana con su formulario y «Enviar» (el ícono de enviar, como en la maqueta aprobada).
function ventana(titulo, cuerpo, enviar) {
	const btn = h('button', { type: 'button', class: 'btn btn-primary' }, ic('icon-paper-plane-o'), 'Enviar');
	const m = modal({ title: titulo, body: cuerpo, footer: [h('button', { type: 'button', class: 'btn btn-light', 'data-bs-dismiss': 'modal' }, 'Cancelar'), btn] });
	btn.addEventListener('click', async () => {
		btn.disabled = true;
		try { if (await enviar()) m.close(); } catch (err) { showError(err); }
		btn.disabled = false;
	});
	return m;
}

export function pedirCambio(resumen, p) {
	const ref = doc(collection(db, 'comentariosPropietarios'));
	const datos = { texto: '', fotos: [] };
	const form = renderForm([
		{ name: 'texto', label: '¿Qué quieres cambiar?', type: 'textarea', rows: 3, maxlength: 2000, placeholder: 'El precio, una foto, un dato…' },
		{ name: 'fotos', label: 'Fotos (opcional)', type: 'images', simple: true, max: MAX_FOTOS_PEDIDO, numeradas: true, maxSubidas: MAX_FOTOS_PEDIDO,
			folder: `pedidosDueno/${p.id}/${ref.id}` }
	], datos);
	return ventana('Pedir un cambio', form.el, async () => {
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

export function yaSeCerro(resumen, p) {
	const renta = p.operacion === 'renta';
	const ref = doc(collection(db, 'comentariosPropietarios'));
	const hoyIso = hoy();
	const fecha = h('input', { class: 'form-control', type: 'date', id: `cierre-f-${p.id}`, value: hoyIso, max: hoyIso, required: true });
	const precio = h('input', { class: 'form-control', type: 'number', inputmode: 'decimal', min: 0, step: '0.01', id: `cierre-p-${p.id}` });
	const cuerpo = h('div', {},
		h('div', { class: 'row g-3' },
			h('div', { class: 'col-6' }, h('label', { class: 'form-label', for: fecha.id }, renta ? 'Fecha de renta' : 'Fecha de venta'), fecha),
			h('div', { class: 'col-6' }, h('label', { class: 'form-label', for: precio.id }, renta ? 'Renta final (opcional)' : 'Precio final (opcional)'),
				h('div', { class: 'input-group' }, h('span', { class: 'input-group-text' }, prefijoMoneda(p.moneda || 'USD')), precio))),
		h('p', { class: 'form-text mb-0 mt-2' }, 'Tu asesor lo confirma y la casa deja de ofrecerse en la página.'));
	return ventana(textoCierre(p.operacion), cuerpo, async () => {
		const falta = faltaFechaCierre(fecha.value, hoyIso);
		if (falta) { fecha.focus(); toast(falta, 'warning'); return false; }
		const monto = precioFinalDe(precio.value);
		if (monto === null) { precio.focus(); toast('Revisa el precio final: solo el número, mayor que cero.', 'warning'); return false; }
		await setDoc(ref, { ...base(resumen, p, 'cierre', ''), fechaCierre: fecha.value, ...(monto ? { precioFinal: monto } : {}) });
		toast('Listo: tu asesor lo confirma y la casa deja de ofrecerse en la página.');
		return true;
	});
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
