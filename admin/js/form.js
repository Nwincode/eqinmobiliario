// Generador de formularios a partir de un esquema. Se usa en todas las secciones del panel.
//
// Tipos de campo: text, email, url, tel, number, textarea, markdown, select, checkbox,
// tags (lista de textos), image (una imagen), images (galería), list (lista de objetos), section (título).
// Opciones comunes: name ('a.b' para anidar), label, help, required, cols (1-12), placeholder, ordenar (list: false sin ↑↓), encabezado (list: false, sin su fila; ✕ en la esquina), colsCelular (12: a lo ancho en el celular),
// when(data) para mostrar el campo solo en ciertos casos.
import { h, toast, showError, iconoBtn } from './ui.js';
import { CODIGOS_PAIS, partirTelefono, unirTelefono, correoValido, telefonoValido, sugerenciaCorreo } from './formato.js';
import { storage, db, ref, uploadBytes, getDownloadURL, deleteObject, collection, getDocs } from './firebase.js';
import { procesarImagen as procesar } from './imagen.js';

export function getPath(obj, path) {
	return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Copia profunda que conserva tal cual las fechas de Firestore (Timestamp) y los valores especiales
// (serverTimestamp). structuredClone las convertía en objetos sueltos {seconds, nanoseconds} y,
// al guardar, Firestore las almacenaba como mapas en lugar de fechas.
export function clonar(v) {
	if (Array.isArray(v)) return v.map(clonar);
	if (v && typeof v === 'object') {
		if (typeof v.toDate === 'function' || Object.getPrototypeOf(v) !== Object.prototype) return v;
		return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clonar(x)]));
	}
	return v;
}

export function setPath(obj, path, value) {
	const keys = path.split('.');
	let o = obj;
	keys.slice(0, -1).forEach((k) => {
		if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
		o = o[k];
	});
	o[keys[keys.length - 1]] = value;
}

// Preparar una foto (girar, reducir, WebP) es una sola pieza para el panel y para el comprobante del huésped en el
// chat (js/reserva-chat.js): admin/js/imagen.js. Aquí solo se le suma la marca de agua de las fotos de las casas.
export function procesarImagen(file, maxSize, quality, { marca = false } = {}) {
	return procesar(file, maxSize, quality, marca ? { marcar: async (canvas) => (await import('./marca.js')).ponerMarca(canvas) } : {});
}

// Sube una foto ya procesada (o la procesa). Devuelve { url, path, ancho, alto, hash }.
export async function uploadImage(file, folder, procesada, opciones) {
	if (!storage) throw new Error('No se pueden subir imágenes: al sitio le falta la configuración de las fotos de Firebase. Avísale a quien lo programa.');
	const { blob, ancho, alto, hash, marca } = procesada || await procesarImagen(file, undefined, undefined, opciones);
	const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
	const base = (file.name || 'foto').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w-]+/g, '-').slice(0, 40);
	const path = `${folder}/${Date.now()}-${base}.${ext}`;
	const r = ref(storage, path);
	await uploadBytes(r, blob, { contentType: blob.type, cacheControl: 'public, max-age=31536000' });
	return { url: await getDownloadURL(r), path, ancho, alto, hash, ...(marca ? { marca: true } : {}) };
}

// Orden natural de nombres de archivo ("foto2" antes que "foto10").
const ORDEN = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
export function ordenarArchivos(files) {
	return [...files].sort((a, b) => ORDEN.compare(a.name, b.name));
}

// Borra fotos solo si ninguna otra casa las usa («Duplicar» comparte los archivos de la original: borrarlas dejaría
// la copia con fotos rotas). Si no se puede revisar, no se borra nada: un archivo de más no daña; uno de menos, sí.
export async function borrarFotosSinUso(paths, excluirId = '') {
	const lista = [...new Set(paths.filter(Boolean))];
	if (!lista.length || !db) return;
	let snap;
	try { snap = await getDocs(collection(db, 'properties')); } catch (err) { console.warn('Fotos sin borrar: no se pudo revisar si otra casa las usa', err); return; }
	const usadas = new Set();
	const ruta = (url) => { const m = String(url || '').match(/\/o\/([^?]+)/); return m ? decodeURIComponent(m[1]) : ''; };
	for (const d of snap.docs) {
		if (d.id === excluirId) continue;
		const x = d.data();
		for (const f of x.fotos || []) for (const r of [f.path, f.sinMarca, ruta(f.url)]) if (r) usadas.add(r);
		const vip = ruta(x.vipLanding?.portada);
		if (vip) usadas.add(vip);
	}
	await Promise.all(lista.filter((r) => !usadas.has(r)).map(deleteImage));
}

export async function deleteImage(path) {
	if (!storage || !path) return;
	try {
		await deleteObject(ref(storage, path));
	} catch (err) {
		if (err.code !== 'storage/object-not-found') console.warn('No se pudo borrar la imagen', path, err);
	}
}

function fileInput(multiple, onFiles) {
	const input = h('input', { type: 'file', accept: 'image/*,.heic,.heif', multiple, class: 'd-none' });
	input.addEventListener('change', () => {
		const files = [...input.files];
		input.value = '';
		if (files.length) onFiles(files);
	});
	return input;
}

// Teléfono con su código de país, para cualquier formulario del panel. Se guarda como «+código número» (formato.js).
// Devuelve el grupo (código + número); `.valor()` da el teléfono listo para guardar.
// En el panel casi siempre es el teléfono de otra persona (cliente, dueño, huésped): sin autollenado, para que el navegador
// no ponga el del asesor. `etiqueta`: el nombre del número cuando no hay <label> que lo apunte; `id`: el del número, para
// un <label for>. `revisar`: en un formulario armado a mano (sin renderForm), la misma revisión al salir del campo;
// `revisarCampos` la repite al guardar.
export function campoTelefono(valor, { onChange, required = false, placeholder, disabled = false, etiqueta, autocomplete = 'off', id, revisar = false } = {}) {
	const { codigo, numero } = partirTelefono(valor);
	const sel = h('select', { class: 'form-select campo-codigo', 'aria-label': 'Código de país' },
		CODIGOS_PAIS.map(([c, pais]) => h('option', { value: c }, `+${c} ${pais}`)), codigo ? null : h('option', { value: '' }, 'Otro'));
	sel.value = codigo;
	const num = h('input', { class: 'form-control', type: 'tel', inputmode: 'tel', maxlength: 24, required, placeholder, autocomplete, id, 'aria-label': etiqueta });
	num.value = numero;
	const grupo = h('div', { class: 'input-group' }, sel, num);
	grupo.valor = () => unirTelefono(sel.value, num.value);
	if (onChange) { sel.addEventListener('change', () => onChange(grupo.valor())); num.addEventListener('input', () => onChange(grupo.valor())); }
	if (disabled) { sel.disabled = true; num.disabled = true; }
	if (revisar) conRevision(grupo, telefonoValido, MSG_TELEFONO);
	return grupo;
}

// Correo para un formulario armado a mano: la misma pieza que el correo de renderForm (tipo, teclado, revisión al salir
// del campo y «¿Quisiste decir …?»). Devuelve la caja; `.valor()` da el correo y `revisarCampos` lo repite al guardar.
// Sin autollenado por defecto (casi siempre es el correo de otra persona); lo propio pasa `autocomplete: 'email'`.
export function campoCorreo(valor, { onChange, id, autocomplete = 'off', required = false } = {}) {
	const input = h('input', { class: 'form-control', type: 'email', inputmode: 'email', autocomplete, id, required });
	input.value = valor ?? '';
	if (onChange) input.addEventListener('input', () => onChange(input.value));
	const caja = conPistaCorreo(input);
	caja.valor = () => input.value.trim();
	conRevision(caja, correoValido, MSG_CORREO);
	return caja;
}

const MSG_TELEFONO = 'Revisa el teléfono: no tiene los dígitos de un número de ese país (en Guatemala, 8).';
const MSG_CORREO = 'Revisa el correo (p. ej. nombre@correo.com).';
// «¿Quisiste decir …@gmail.com?» al salir del campo, con un toque para ponerlo. No impide guardar.
function conPistaCorreo(input) {
	const pista = h('div', { class: 'form-text', hidden: true });
	input.addEventListener('blur', () => {
		const otro = sugerenciaCorreo(input.value);
		pista.hidden = !otro;
		pista.replaceChildren(...(otro ? [h('span', { class: 'icon-exclamation-circle me-1', 'aria-hidden': 'true' }), `¿Quisiste decir ${otro}? `, h('button', { type: 'button', class: 'btn btn-link btn-sm p-0 align-baseline', onclick: () => { input.value = otro; pista.hidden = true; input.dispatchEvent(new Event('input')); } }, 'Usar ese')] : []));
	});
	input.addEventListener('input', () => { pista.hidden = true; });
	return h('div', {}, input, pista);
}
// Lo que tiene mal un campo armado a mano: solo lo que se escribió ahora (lo guardado que nadie tocó no se marca).
function conRevision(control, ok, msg) {
	const inicial = control.valor();
	control.problema = () => { const v = control.valor(); return !v || v === inicial || ok(v) ? '' : msg; };
	alSalir(control, control.problema);
}
// Al guardar un formulario armado a mano: marca en rojo cada campo con problema (campoTelefono con `revisar`,
// campoCorreo), va al primero y lo dice. Devuelve true si todo está bien.
export function revisarCampos(controles) {
	return avisarErrores(controles.filter(Boolean).map((control) => ({ control, msg: control.problema?.() || '' })).filter((e) => e.msg));
}
// Todos los errores juntos: cada campo en rojo con su mensaje debajo, la página va al primero y un solo aviso.
function avisarErrores(errores) {
	if (!errores.length) return true;
	errores.forEach((e) => { const input = entrada(e.control); if (input?.classList) quitarMarca(input); marcar(e); });
	const primero = entrada(errores[0].control);
	primero?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
	primero?.focus?.({ preventScroll: true });
	toast(errores.length === 1 ? errores[0].msg : `Revisa los ${errores.length} campos marcados en rojo.`, 'warning');
	return false;
}

// Lo que se marca en rojo de un control (en el teléfono, el número; en un campo con pista, su input).
const entrada = (control) => (control?.matches?.('input, select, textarea') ? control : control?.querySelector?.('input:not([type=file])') || control?.querySelector?.('select, textarea')) || control;
function quitarMarca(input) {
	delete input.dataset.alSalir;
	input.classList.remove('is-invalid');
	input.removeAttribute('aria-invalid');
	const id = input.getAttribute('data-error');
	if (id) { document.getElementById(id)?.remove(); input.removeAttribute('data-error'); input.removeAttribute('aria-describedby'); }
}
function marcar({ control, msg }) {
	const input = entrada(control);
	if (!input?.classList) return;
	const id = `err-${Math.random().toString(36).slice(2, 9)}`;
	input.classList.add('is-invalid');
	input.setAttribute('aria-invalid', 'true');
	input.setAttribute('aria-describedby', id);
	input.setAttribute('data-error', id);
	// Si el campo ya dice «Falta completar este dato» (pendientes.js), basta el rojo: el mismo aviso no va dos veces.
	const yaDice = /^Completa/.test(msg) && control.closest?.('[data-campo]')?.querySelector('.campo-falta-nota');
	if (yaDice) input.setAttribute('aria-describedby', yaDice.id);
	else (input.closest('.input-group') || control).insertAdjacentElement('afterend', h('div', { class: 'invalid-feedback d-block', id }, msg));
	// Se quita al corregirlo: al escribir (en un campo de texto, «change» llega al salir del campo y borraría la marca
	// recién puesta) o al elegir otra opción en un selector.
	input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => quitarMarca(input), { once: true });
}

const vacio = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
function fueraDeLimites(field, v) {
	if (!((field.min != null && Number(v) < field.min) || (field.max != null && Number(v) > field.max))) return '';
	const rango = field.min != null && field.max != null ? `va de ${field.min} a ${field.max}` : field.min != null ? `debe ser ${field.min} o más` : `llega hasta ${field.max}`;
	return `«${field.label}» ${rango}.`;
}
// Lo que tiene mal un correo o un teléfono recién escrito (lo guardado que nadie tocó no se marca).
const formatoMal = ({ field, target, inicial, ok, msg }) => () => {
	const v = getPath(target, field.name);
	return vacio(v) || v === inicial || ok(v) ? '' : msg;
};
// Se revisa al salir del campo (no solo al guardar): el aviso queda debajo, en rojo, y se va al corregirlo. En el teléfono
// cuenta también cambiar el código de país.
function alSalir(control, problema) {
	const input = entrada(control);
	const revisar = () => {
		const msg = problema();
		// Solo quita la marca que puso él (la de «Completa …» de validate() se queda hasta que se escriba).
		if (!msg) { if (input.dataset.alSalir) { quitarMarca(input); delete input.dataset.alSalir; } return; }
		if (!input.classList.contains('is-invalid')) { marcar({ control, msg }); input.dataset.alSalir = '1'; }
	};
	input.addEventListener('blur', revisar);
	if (input !== control) control.querySelector?.('select')?.addEventListener('change', revisar);
}

export function renderForm(schema, data, options = {}) {
	const state = clonar(data || {});
	const folder = options.folder || 'uploads';
	const conditionals = [];
	const required = [];
	const conLimites = [];
	// Correos y teléfonos: se revisa su formato al guardar (si se escribieron).
	const conFormato = [];
	const customs = [];
	// Cómo repintar cada campo de texto o de etiquetas cuando su valor se pone desde fuera (ver «poner»).
	const pintores = new Map();

	// Selectores cuyas opciones dependen del estado: van primero, porque pueden cambiar un valor del que depende un «when».
	const vivos = [];
	const anchos = [];
	const anchoDe = (field) => (typeof field.cols === 'function' ? field.cols(state) : field.cols) || 12;
	const refresh = () => {
		vivos.forEach((pintar) => pintar());
		anchos.forEach(({ el, field }) => { el.className = el.className.replace(/\bcol-md-\d+/, `col-md-${anchoDe(field)}`); });
		conditionals.forEach(({ el, when }) => { el.hidden = !when(state); });
		customs.forEach(({ el, update }) => update(el, state));
		if (options.onChange) options.onChange(state);
	};

	function fieldWrapper(field, control) {
		const id = `f-${Math.random().toString(36).slice(2, 9)}`;
		if (control.matches && control.matches('input, select, textarea')) control.id = id;
		// Teléfono: la etiqueta apunta al número (el código lleva su propio nombre); correo: al campo, no a su pista.
		if (field.type === 'telefono' || field.type === 'email') control.querySelector('input').id = id;
		const label = field.type === 'checkbox' ? null : h('label', { class: 'form-label', for: id }, field.label, field.required ? ' *' : '');
		// En el celular, un campo corto sin ayuda va de dos en dos (números, horas, listas cortas); lo demás, a lo ancho.
		// (colsCelular: 12 lo deja a lo ancho, p. ej. una dirección).
		const corto = !field.help && field.colsCelular !== 12 && anchoDe(field) <= 4 && !['textarea', 'markdown', 'list', 'tags', 'checkbox', 'telefono', 'email', 'url', 'image', 'images', 'color'].includes(field.type);
		const caja = h('div', { class: `${corto ? 'col-6' : 'col-12'} col-md-${anchoDe(field)}`, dataset: field.name ? { campo: field.name } : null },
			label, control,
			field.help ? h('div', { class: 'form-text' }, field.help) : null);
		// Ancho que depende de otro campo (p. ej. una fila que pierde un campo en cierta operación): se recalcula.
		if (typeof field.cols === 'function') anchos.push({ el: caja, field });
		return caja;
	}

	function renderField(field, target) {
		const get = () => getPath(target, field.name);
		const set = (v) => { setPath(target, field.name, v); refresh(); };
		let control;

		switch (field.type) {
			// Bloque informativo que se recalcula con cada cambio (p. ej. vista previa de Google).
			case 'custom': {
				const el = h('div');
				// Dentro de un elemento de una lista, el bloque recibe también ese elemento y se pinta de una vez.
				customs.push({ el, update: (e, s) => field.update(e, s, target) });
				if (target !== state) field.update(el, state, target);
				const wrap = h('div', { class: `col-12 col-md-${field.cols || 12}` },
					field.label ? h('div', { class: 'form-label' }, field.label) : null, el);
				if (field.when) conditionals.push({ el: wrap, when: field.when });
				return wrap;
			}

			case 'section': {
				const sec = h('div', { class: 'col-12 form-section' },
					h('h2', { class: 'h6 text-uppercase text-muted mb-0 mt-3' }, field.label),
					field.help ? h('p', { class: 'small text-muted mb-0' }, field.help) : null);
				if (field.when) conditionals.push({ el: sec, when: field.when });
				return sec;
			}

			case 'textarea':
			case 'markdown':
				control = h('textarea', { class: 'form-control', rows: field.rows || (field.type === 'markdown' ? 10 : 3), placeholder: field.placeholder, maxlength: field.maxlength });
				control.value = get() ?? '';
				control.addEventListener('input', () => set(control.value));
				if (target === state) pintores.set(field.name, () => { control.value = get() ?? ''; });
				if (field.type === 'markdown' && !field.help) {
					field = { ...field, help: 'Formato: ## Título, **negrita**, *cursiva*, - lista, [texto](https://enlace).' };
				}
				break;

			case 'select': {
				// «options» puede ser una función del estado (p. ej. los estados que aplican a la operación elegida):
				// se vuelve a pintar con cada cambio y, si lo elegido ya no aplica, pasa a la primera opción.
				const vivas = typeof field.options === 'function';
				let pintadas = '';
				const pintar = () => {
					const ops = vivas ? field.options(state) : field.options, firma = JSON.stringify(ops);
					if (firma === pintadas) return;
					const primera = !pintadas;
					pintadas = firma;
					control.replaceChildren(...ops.map(([v, l]) => h('option', { value: v }, l)));
					const cabe = (v) => ops.some(([x]) => x === v);
					control.value = primera && !vivas ? get() ?? field.default ?? ops[0]?.[0] ?? '' : cabe(get()) ? get() : cabe(field.default) ? field.default : ops[0]?.[0] ?? '';
					if (get() === undefined || (vivas && get() !== control.value)) setPath(target, field.name, control.value);
				};
				control = h('select', { class: 'form-select' });
				pintar();
				if (vivas) vivos.push(pintar);
				if (field.disabled) control.disabled = true;
				control.addEventListener('change', () => set(control.value));
				break;
			}

			case 'checkbox': {
				const id = `f-${Math.random().toString(36).slice(2, 9)}`;
				const input = h('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', id });
				input.checked = Boolean(get() ?? field.default);
				if (get() === undefined && field.default !== undefined) setPath(target, field.name, Boolean(field.default));
				input.addEventListener('change', () => set(input.checked));
				control = h('div', { class: 'form-check form-switch mt-md-4' }, input, h('label', { class: 'form-check-label', for: id }, field.label));
				break;
			}

			case 'number':
				control = h('input', { class: 'form-control', type: 'number', inputmode: 'decimal', step: field.step || 'any', min: field.min, max: field.max, placeholder: field.placeholder });
				// Con mínimo o máximo, se revisa al salir del campo y al guardar (validate): un número fuera de lo normal no pasa sin aviso.
				if (field.min != null || field.max != null) { conLimites.push({ field, target, control }); alSalir(control, () => { const v = get(); return vacio(v) ? '' : fueraDeLimites(field, v); }); }
				control.value = get() ?? '';
				control.addEventListener('input', () => set(control.value === '' ? null : Number(control.value)));
				break;

			// Selector de color con su código hex y botón para volver al original (field.default).
			case 'color': {
				const valido = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '');
				const actual = () => (valido(get()) ? get() : field.default);
				const picker = h('input', { type: 'color', class: 'form-control form-control-color', 'aria-label': field.label });
				const texto = h('input', { class: 'form-control font-monospace', maxlength: 7, placeholder: field.default, 'aria-label': `${field.label} (código)` });
				const pintar = () => { picker.value = actual(); texto.value = valido(get()) ? get() : ''; };
				picker.addEventListener('input', () => { set(picker.value); texto.value = picker.value; });
				texto.addEventListener('input', () => {
					const v = texto.value.trim();
					if (valido(v)) { set(v.toLowerCase()); picker.value = v; } else if (!v) { set(''); picker.value = field.default; }
				});
				const restaurar = h('button', { type: 'button', class: 'btn btn-light btn-sm', title: 'Volver al color original', onclick: () => { set(''); pintar(); } }, 'Original');
				pintar();
				control = h('div', { class: 'input-group input-color' }, picker, texto, restaurar);
				break;
			}

			case 'tags': {
				const list = h('div', { class: 'd-flex flex-wrap gap-2 mb-2' });
				const input = h('input', { class: 'form-control', placeholder: field.placeholder || 'Escribe y presiona Enter', 'aria-label': `${field.label}: agregar` });
				const sugeridas = h('div', { class: 'd-flex flex-wrap gap-1 mt-2' });
				const draw = () => {
					const puestas = (get() || []).map((t) => t.toLowerCase());
					sugeridas.replaceChildren(...((typeof field.sugerencias === 'function' ? field.sugerencias(state) : field.sugerencias) || []).filter((s) => !puestas.includes(s.toLowerCase())).map((s) => h('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', onclick: () => { set([...(get() || []), s]); draw(); } }, `+ ${s}`)));
					list.replaceChildren(...(get() || []).map((t, i) => h('span', { class: 'badge text-bg-light border d-inline-flex align-items-center gap-1 fw-normal fs-6' }, t,
						h('button', { type: 'button', class: 'btn-close btn-close-sm', style: 'font-size:.6rem', 'aria-label': `Quitar ${t}`, onclick: () => { const arr = [...(get() || [])]; arr.splice(i, 1); set(arr); draw(); } }))));
				};
				const add = () => {
					const vals = input.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
					if (!vals.length) return;
					set([...(get() || []), ...vals]);
					input.value = '';
					draw();
				};
				input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
				input.addEventListener('blur', add);
				draw();
				if (target === state) pintores.set(field.name, draw);
				// Sugerencias que dependen de otro campo: se vuelven a pintar con cada cambio.
				if (typeof field.sugerencias === 'function') customs.push({ el: sugeridas, update: draw });
				control = h('div', {}, list, input, sugeridas);
				break;
			}

			case 'image': {
				const preview = h('img', { class: 'img-preview', alt: '' });
				const urlInput = h('input', { class: 'form-control form-control-sm', inputmode: 'url', placeholder: 'o pega la URL de una imagen', 'aria-label': `${field.label || 'Imagen'}: enlace de la imagen` });
				const status = h('span', { class: 'small text-muted' });
				const draw = () => {
					const v = get();
					preview.src = v || '';
					preview.hidden = !v;
					urlInput.value = v || '';
				};
				urlInput.addEventListener('change', () => { set(urlInput.value.trim()); draw(); });
				const fi = fileInput(false, async ([file]) => {
					status.textContent = 'Subiendo…';
					try {
						const up = await uploadImage(file, field.folder || folder, null, { marca: !!field.marca });
						set(up.url);
						draw();
						status.textContent = '';
					} catch (err) {
						status.textContent = '';
						showError(err);
					}
				});
				draw();
				control = h('div', { class: 'image-field' }, preview,
					h('div', { class: 'd-flex gap-2 align-items-center mt-2' },
						h('button', { type: 'button', class: 'btn btn-sm btn-outline-primary', onclick: () => fi.click() }, 'Subir imagen'),
						h('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', onclick: () => { set(''); draw(); } }, 'Quitar'),
						status, fi),
					h('div', { class: 'mt-2' }, urlInput));
				break;
			}

			case 'images': {
				const grid = h('div', { class: 'images-grid' });
				const status = h('span', { class: 'small text-muted' });
				const draw = () => {
					const arr = get() || [];
					grid.replaceChildren(...arr.map((img, i) => {
						const alt = h('input', { class: 'form-control form-control-sm', placeholder: 'Descripción (SEO)', value: img.alt || '' });
						alt.addEventListener('input', () => { img.alt = alt.value; });
						const move = (d) => {
							const j = i + d;
							if (j < 0 || j >= arr.length) return;
							[arr[i], arr[j]] = [arr[j], arr[i]];
							set(arr);
							draw();
						};
						// Arrastrar y soltar para ordenar (computadora); en celular quedan las flechas.
						return h('div', {
							class: 'images-grid-item', draggable: 'true',
							ondragstart: (e) => {
								if (e.target.closest && e.target.closest('input, button')) { e.preventDefault(); return; }
								e.dataTransfer.effectAllowed = 'move';
								e.dataTransfer.setData('text/plain', String(i));
								e.currentTarget.classList.add('arrastrando');
							},
							ondragend: (e) => e.currentTarget.classList.remove('arrastrando'),
							ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('destino'); },
							ondragleave: (e) => e.currentTarget.classList.remove('destino'),
							ondrop: (e) => {
								e.preventDefault();
								e.currentTarget.classList.remove('destino');
								const de = Number(e.dataTransfer.getData('text/plain'));
								if (!Number.isInteger(de) || de === i || !arr[de]) return;
								arr.splice(i, 0, ...arr.splice(de, 1));
								set(arr);
								draw();
							}
						},
							h('img', { src: img.url, alt: img.alt || '', draggable: 'false' }),
							i === 0 ? h('span', { class: 'badge text-bg-primary images-cover' }, 'Portada') : null,
							h('button', {
								type: 'button', class: `images-star${i === 0 ? ' activa' : ''}`,
								'aria-label': i === 0 ? 'Es la foto de portada' : 'Usar como portada',
								'aria-pressed': String(i === 0), title: i === 0 ? 'Foto de portada' : 'Usar como portada',
								onclick: () => {
									if (i === 0) return;
									arr.unshift(...arr.splice(i, 1));
									set(arr);
									draw();
								}
							}, h('span', { class: i === 0 ? 'icon-star' : 'icon-star-o', 'aria-hidden': 'true' })),
							h('div', { class: 'd-flex gap-1 my-1' },
								h('button', { type: 'button', class: 'btn btn-sm btn-light', title: 'Mover antes', disabled: i === 0, onclick: () => move(-1) }, '←'),
								h('button', { type: 'button', class: 'btn btn-sm btn-light', title: 'Mover después', disabled: i === arr.length - 1, onclick: () => move(1) }, '→'),
								h('button', {
									type: 'button', class: 'btn btn-sm btn-outline-danger ms-auto', title: 'Eliminar',
									onclick: () => {
										arr.splice(i, 1);
										// Se borra del almacenamiento al guardar (ver pendingDeletes).
										if (img.path) pendingDeletes.push(img.path);
										if (img.sinMarca) pendingDeletes.push(img.sinMarca);
										set(arr);
										draw();
									}
								}, 'Eliminar')),
							alt);
					}));
				};
				// marcaFija: siempre con marca de agua, sin la casilla (las fotos que sube el dueño).
				const marcaChk = field.marca && !field.marcaFija ? h('input', { type: 'checkbox', class: 'form-check-input', id: `marca-${field.name}`, checked: true }) : null;
				const fi = fileInput(true, async (files) => {
					const arr = get() || [];
					for (let n = 0; n < files.length; n++) {
						status.textContent = `Subiendo ${n + 1} de ${files.length}…`;
						try {
							arr.push({ ...(await uploadImage(files[n], field.folder || folder, null, { marca: Boolean(field.marcaFija) || !!marcaChk?.checked })), alt: '' });
							set(arr);
							draw();
						} catch (err) {
							showError(err);
							break;
						}
					}
					status.textContent = '';
				});
				draw();
				control = h('div', {}, grid,
					h('div', { class: 'd-flex align-items-center flex-wrap gap-2 mt-2' },
						h('button', { type: 'button', class: 'btn btn-outline-primary', onclick: () => fi.click() }, '+ Agregar fotos'),
						marcaChk ? h('div', { class: 'form-check mb-0 ms-1' }, marcaChk,
							h('label', { class: 'form-check-label', for: `marca-${field.name}` }, 'Poner marca de agua')) : null,
						status, fi));
				break;
			}

			case 'list': {
				const box = h('div', { class: 'list-field' });
				const draw = () => {
					const arr = get() || [];
					box.replaceChildren(
						...arr.map((item, i) => field.encabezado === false
							// Sin la fila «Elemento N ↑ ↓ Quitar»: la ficha usa todo el ancho y «Quitar» es una ✕ en su esquina.
							? h('div', { class: 'list-field-item list-sin-encabezado' },
								iconoBtn('icon-close', `Quitar ${String(field.itemLabel || 'elemento').toLowerCase()} ${i + 1}`, { class: 'btn-toque btn-icono btn btn-sm btn-light list-quitar', onclick: () => { arr.splice(i, 1); set(arr); draw(); } }),
								h('div', { class: 'row g-2' }, field.fields.map((f) => renderField(f, item))))
							: h('div', { class: 'list-field-item' },
							h('div', { class: 'd-flex align-items-center mb-2 gap-1' },
								h('strong', { class: 'small text-muted me-auto' }, `${field.itemLabel || 'Elemento'} ${i + 1}`),
								// Una lista de fechas no se ordena a mano (ordenar: false): el orden lo dan las fechas.
								field.ordenar === false ? null : h('button', { type: 'button', class: 'btn btn-sm btn-light', disabled: i === 0, title: 'Subir', 'aria-label': `Subir ${String(field.itemLabel || 'elemento').toLowerCase()} ${i + 1}`, onclick: () => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; set(arr); draw(); } }, '↑'),
								field.ordenar === false ? null : h('button', { type: 'button', class: 'btn btn-sm btn-light', disabled: i === arr.length - 1, title: 'Bajar', 'aria-label': `Bajar ${String(field.itemLabel || 'elemento').toLowerCase()} ${i + 1}`, onclick: () => { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; set(arr); draw(); } }, '↓'),
								h('button', { type: 'button', class: 'btn btn-sm btn-outline-danger', onclick: () => { arr.splice(i, 1); set(arr); draw(); } }, 'Quitar')),
							h('div', { class: 'row g-2' }, field.fields.map((f) => renderField(f, item))))),
						field.max && arr.length >= field.max ? null : h('button', {
							type: 'button', class: 'btn btn-sm btn-outline-primary',
							// «onAdd»: para abrir de una vez cómo se llena el renglón nuevo; recibe cómo quitarlo si se cancela.
							onclick: () => {
								const item = {};
								arr.push(item); set(arr); draw();
								if (field.onAdd) field.onAdd(item, () => { const a = get() || [], k = a.indexOf(item); if (k > -1) { a.splice(k, 1); set(a); draw(); } });
							}
						}, `+ Agregar ${(field.itemLabel || 'elemento').toLowerCase()}`));
				};
				if (!Array.isArray(get())) setPath(target, field.name, []);
				draw();
				control = box;
				break;
			}

			case 'telefono':
				control = campoTelefono(get(), { onChange: set, required: field.required, placeholder: field.placeholder, disabled: field.disabled });
				conFormato.push({ field, target, control, inicial: get(), ok: telefonoValido, msg: MSG_TELEFONO });
				alSalir(control, formatoMal(conFormato.at(-1)));
				// Uno guardado antes que no cumple el formato no frena el guardado (no lo cambió quien edita): se avisa aquí.
				if (get() && !telefonoValido(get())) control = h('div', {}, control, h('div', { class: 'form-text text-warning' }, h('span', { class: 'icon-exclamation-triangle me-1', 'aria-hidden': 'true' }), 'Este teléfono guardado no parece completo para ese país: revísalo cuando puedas.'));
				break;

			default: {
				// `input` (const): los manejadores leen siempre el campo, aunque `control` pase a ser la caja con la pista.
				const input = h('input', { class: 'form-control', type: field.type || 'text', placeholder: field.placeholder, maxlength: field.maxlength, required: field.required,
					// El correo de un cliente o un dueño: sin autollenado (el navegador pondría el del asesor).
					...(field.type === 'email' ? { autocomplete: 'off', inputmode: 'email' } : {}) });
				input.value = get() ?? '';
				if (field.disabled) input.disabled = true;
				input.addEventListener('input', () => set(input.value));
				if (target === state) pintores.set(field.name, () => { input.value = get() ?? ''; });
				if (field.onInput) input.addEventListener('input', () => field.onInput(input.value, state));
				control = input;
				if (field.type === 'email') {
					conFormato.push({ field, target, control: input, inicial: get(), ok: correoValido, msg: MSG_CORREO });
					alSalir(input, formatoMal(conFormato.at(-1)));
					control = conPistaCorreo(input);
				}
			}
		}

		if (field.required) required.push({ field, target, control: field.type === 'email' ? control.querySelector('input') : control });
		const wrapper = fieldWrapper(field, control);
		if (field.when) conditionals.push({ el: wrapper, when: field.when });
		if (field.ref) field.ref(field.type === 'email' ? control.querySelector('input') : control);
		return wrapper;
	}

	const pendingDeletes = [];
	const el = h('div', { class: 'row g-3' }, schema.map((f) => renderField(f, state)));
	refresh();

	return {
		el,
		state,
		// Para quien cambia el estado por fuera de un campo (p. ej. un selector propio): vuelve a evaluar «when» y bloques.
		refresh,
		// Escribe un valor en un campo de texto o de etiquetas desde fuera (p. ej. la traducción automática) y lo muestra.
		poner(nombre, valor) {
			setPath(state, nombre, valor);
			pintores.get(nombre)?.();
			refresh();
		},
		// Revisa todo a la vez: cada campo con problema queda en rojo con su mensaje debajo (se quita al corregirlo), la
		// página va al primero y un solo aviso dice cuántos son.
		validate() {
			el.querySelectorAll('.is-invalid').forEach(quitarMarca);
			const errores = [];
			for (const { field, target, control } of required) {
				if (vacio(getPath(target, field.name))) errores.push({ control, msg: `Completa «${field.label}».` });
			}
			for (const { field, target, control } of conLimites) {
				const v = getPath(target, field.name);
				const msg = vacio(v) ? '' : fueraDeLimites(field, v);
				if (msg) errores.push({ control, msg });
			}
			for (const { field, target, control, ok, msg, inicial } of conFormato) {
				const v = getPath(target, field.name);
				// Un campo escondido (por `when`) no se puede corregir a la vista, y uno guardado que nadie tocó (un dato de
				// antes, con otra regla) tampoco frena el guardado: solo se revisa lo que se escribe ahora.
				if (v === inicial) continue;
				if (!vacio(v) && !ok(v) && !control.closest?.('[hidden]') && !errores.some((e) => e.control === control)) errores.push({ control, msg });
			}
			return avisarErrores(errores);
		},
		getData: () => clonar(state),
		// Borra del almacenamiento las fotos quitadas; llamar después de guardar.
		async flushDeletes() {
			await borrarFotosSinUso(pendingDeletes.splice(0));
		}
	};
}
