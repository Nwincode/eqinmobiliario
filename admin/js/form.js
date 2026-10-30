// Generador de formularios a partir de un esquema. Se usa en todas las secciones del panel.
//
// Tipos de campo: text, email, url, tel, number, textarea, markdown, select, checkbox,
// tags (lista de textos), image (una imagen), images (galería), list (lista de objetos), section (título).
// Opciones comunes: name ('a.b' para anidar), label, help, required, cols (1-12), placeholder,
// when(data) para mostrar el campo solo en ciertos casos.
import { h, toast, showError } from './ui.js';
import { storage, ref, uploadBytes, getDownloadURL, deleteObject } from './firebase.js';

export function getPath(obj, path) {
	return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
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

// Reduce la imagen (máx. 1920 px) y la convierte a WebP antes de subirla.
async function compressImage(file, maxSize = 1920, quality = 0.82) {
	if (!/^image\/(jpe?g|png|webp)$/.test(file.type)) return file;
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
	if (!blob || blob.type !== 'image/webp') {
		return new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
	}
	return blob;
}

export async function uploadImage(file, folder) {
	if (!storage) throw new Error('Falta "storageBucket" en site.config.json: no se pueden subir imágenes.');
	const blob = await compressImage(file);
	const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
	const base = file.name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w-]+/g, '-').slice(0, 40);
	const path = `${folder}/${Date.now()}-${base}.${ext}`;
	const r = ref(storage, path);
	await uploadBytes(r, blob, { contentType: blob.type, cacheControl: 'public, max-age=31536000' });
	return { url: await getDownloadURL(r), path };
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
	const input = h('input', { type: 'file', accept: 'image/*', multiple, class: 'd-none' });
	input.addEventListener('change', () => {
		const files = [...input.files];
		input.value = '';
		if (files.length) onFiles(files);
	});
	return input;
}

export function renderForm(schema, data, options = {}) {
	const state = structuredClone(data || {});
	const folder = options.folder || 'uploads';
	const conditionals = [];
	const required = [];

	const refresh = () => {
		conditionals.forEach(({ el, when }) => { el.hidden = !when(state); });
		if (options.onChange) options.onChange(state);
	};

	function fieldWrapper(field, control) {
		const id = `f-${Math.random().toString(36).slice(2, 9)}`;
		if (control.matches && control.matches('input, select, textarea')) control.id = id;
		const label = field.type === 'checkbox' ? null : h('label', { class: 'form-label', for: id }, field.label, field.required ? ' *' : '');
		return h('div', { class: `col-12 col-md-${field.cols || 12}` },
			label, control,
			field.help ? h('div', { class: 'form-text' }, field.help) : null);
	}

	function renderField(field, target) {
		const get = () => getPath(target, field.name);
		const set = (v) => { setPath(target, field.name, v); refresh(); };
		let control;

		switch (field.type) {
			case 'section':
				return h('div', { class: 'col-12 form-section' },
					h('h2', { class: 'h6 text-uppercase text-muted mb-0 mt-3' }, field.label),
					field.help ? h('p', { class: 'small text-muted mb-0' }, field.help) : null);

			case 'textarea':
			case 'markdown':
				control = h('textarea', { class: 'form-control', rows: field.rows || (field.type === 'markdown' ? 10 : 3), placeholder: field.placeholder, maxlength: field.maxlength });
				control.value = get() ?? '';
				control.addEventListener('input', () => set(control.value));
				if (field.type === 'markdown' && !field.help) {
					field = { ...field, help: 'Formato: ## Título, **negrita**, *cursiva*, - lista, [texto](https://enlace).' };
				}
				break;

			case 'select':
				control = h('select', { class: 'form-select' },
					(typeof field.options === 'function' ? field.options() : field.options).map(([v, l]) => h('option', { value: v }, l)));
				control.value = get() ?? field.default ?? control.options[0]?.value ?? '';
				if (get() === undefined) setPath(target, field.name, control.value);
				if (field.disabled) control.disabled = true;
				control.addEventListener('change', () => set(control.value));
				break;

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
				control = h('input', { class: 'form-control', type: 'number', step: field.step || 'any', min: field.min, placeholder: field.placeholder });
				control.value = get() ?? '';
				control.addEventListener('input', () => set(control.value === '' ? null : Number(control.value)));
				break;

			case 'tags': {
				const list = h('div', { class: 'd-flex flex-wrap gap-2 mb-2' });
				const input = h('input', { class: 'form-control', placeholder: field.placeholder || 'Escribe y presiona Enter' });
				const draw = () => {
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
				control = h('div', {}, list, input);
				break;
			}

			case 'image': {
				const preview = h('img', { class: 'img-preview', alt: '' });
				const urlInput = h('input', { class: 'form-control form-control-sm', placeholder: 'o pega la URL de una imagen' });
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
						const up = await uploadImage(file, field.folder || folder);
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
						return h('div', { class: 'images-grid-item' },
							h('img', { src: img.url, alt: img.alt || '' }),
							i === 0 ? h('span', { class: 'badge text-bg-primary images-cover' }, 'Portada') : null,
							h('div', { class: 'd-flex gap-1 my-1' },
								h('button', { type: 'button', class: 'btn btn-sm btn-light', title: 'Mover antes', disabled: i === 0, onclick: () => move(-1) }, '←'),
								h('button', { type: 'button', class: 'btn btn-sm btn-light', title: 'Mover después', disabled: i === arr.length - 1, onclick: () => move(1) }, '→'),
								h('button', {
									type: 'button', class: 'btn btn-sm btn-outline-danger ms-auto', title: 'Eliminar',
									onclick: () => {
										arr.splice(i, 1);
										// Se borra del almacenamiento al guardar (ver pendingDeletes).
										if (img.path) pendingDeletes.push(img.path);
										set(arr);
										draw();
									}
								}, 'Eliminar')),
							alt);
					}));
				};
				const fi = fileInput(true, async (files) => {
					const arr = get() || [];
					for (let n = 0; n < files.length; n++) {
						status.textContent = `Subiendo ${n + 1} de ${files.length}…`;
						try {
							arr.push({ ...(await uploadImage(files[n], field.folder || folder)), alt: '' });
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
					h('div', { class: 'd-flex align-items-center gap-2 mt-2' },
						h('button', { type: 'button', class: 'btn btn-outline-primary', onclick: () => fi.click() }, '+ Agregar fotos'),
						status, fi));
				break;
			}

			case 'list': {
				const box = h('div', { class: 'list-field' });
				const draw = () => {
					const arr = get() || [];
					box.replaceChildren(
						...arr.map((item, i) => h('div', { class: 'list-field-item' },
							h('div', { class: 'd-flex align-items-center mb-2 gap-1' },
								h('strong', { class: 'small text-muted me-auto' }, `${field.itemLabel || 'Elemento'} ${i + 1}`),
								h('button', { type: 'button', class: 'btn btn-sm btn-light', disabled: i === 0, title: 'Subir', onclick: () => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; set(arr); draw(); } }, '↑'),
								h('button', { type: 'button', class: 'btn btn-sm btn-light', disabled: i === arr.length - 1, title: 'Bajar', onclick: () => { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; set(arr); draw(); } }, '↓'),
								h('button', { type: 'button', class: 'btn btn-sm btn-outline-danger', onclick: () => { arr.splice(i, 1); set(arr); draw(); } }, 'Quitar')),
							h('div', { class: 'row g-2' }, field.fields.map((f) => renderField(f, item))))),
						field.max && arr.length >= field.max ? null : h('button', {
							type: 'button', class: 'btn btn-sm btn-outline-primary',
							onclick: () => { arr.push({}); set(arr); draw(); }
						}, `+ Agregar ${(field.itemLabel || 'elemento').toLowerCase()}`));
				};
				if (!Array.isArray(get())) setPath(target, field.name, []);
				draw();
				control = box;
				break;
			}

			default:
				control = h('input', { class: 'form-control', type: field.type || 'text', placeholder: field.placeholder, maxlength: field.maxlength, required: field.required });
				control.value = get() ?? '';
				if (field.disabled) control.disabled = true;
				control.addEventListener('input', () => set(control.value));
				if (field.onInput) control.addEventListener('input', () => field.onInput(control.value, state));
		}

		if (field.required) required.push({ field, target, control });
		const wrapper = fieldWrapper(field, control);
		if (field.when) conditionals.push({ el: wrapper, when: field.when });
		if (field.ref) field.ref(control);
		return wrapper;
	}

	const pendingDeletes = [];
	const el = h('div', { class: 'row g-3' }, schema.map((f) => renderField(f, state)));
	refresh();

	return {
		el,
		state,
		validate() {
			for (const { field, target, control } of required) {
				const v = getPath(target, field.name);
				if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) {
					toast(`Completa el campo "${field.label}".`, 'warning');
					if (control.focus) control.focus();
					return false;
				}
			}
			return true;
		},
		getData: () => structuredClone(state),
		// Borra del almacenamiento las fotos quitadas; llamar después de guardar.
		async flushDeletes() {
			await Promise.all(pendingDeletes.splice(0).map(deleteImage));
		}
	};
}
