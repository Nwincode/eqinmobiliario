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

// HEIC/HEIF (fotos de iPhone): el navegador casi nunca los abre; se convierten con heic2any (se carga solo si hace falta).
const HEIC2ANY = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
let heicCargando = null;
function cargarHeic2any() {
	if (window.heic2any) return Promise.resolve(window.heic2any);
	heicCargando ||= new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = HEIC2ANY;
		s.onload = () => (window.heic2any ? resolve(window.heic2any) : reject(new Error('heic2any no cargó')));
		s.onerror = () => { heicCargando = null; reject(new Error('No se pudo cargar el convertidor de HEIC')); };
		document.head.append(s);
	});
	return heicCargando;
}

async function abrirBitmap(blob) {
	try {
		return await createImageBitmap(blob, { imageOrientation: 'from-image' });
	} catch (err) {
		if (err && err.name === 'TypeError') return createImageBitmap(blob); // navegador sin la opción
		throw err;
	}
}

// Prepara una foto para subirla: gira según EXIF, reduce a máx. 1920 px (sin recortar) y la pasa a WebP 0.82.
// Acepta JPG, PNG, WebP, HEIC/HEIF, AVIF, GIF, BMP y TIFF (si el navegador lo abre).
// Devuelve { blob, ancho, alto, hash } (hash = SHA-256 del archivo original, para no subir repetidas).
export async function procesarImagen(file, maxSize = 1920, quality = 0.82) {
	const nombre = file.name || 'foto';
	const original = await file.arrayBuffer();
	const digest = await crypto.subtle.digest('SHA-256', original);
	const hash = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
	const heic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(nombre);
	let bitmap = null;
	try {
		bitmap = await abrirBitmap(file);
	} catch {
		if (!heic) throw new Error(`«${nombre}»: el navegador no puede abrir este formato de imagen. Conviértela a JPG o PNG.`);
	}
	if (!bitmap) {
		try {
			const heic2any = await cargarHeic2any();
			const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
			bitmap = await abrirBitmap(Array.isArray(out) ? out[0] : out);
		} catch {
			throw new Error(`«${nombre}»: no se pudo convertir la foto HEIC. Ábrela en el teléfono y compártela como JPG.`);
		}
	}
	const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close?.();
	let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
	if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
	if (!blob) throw new Error(`«${nombre}»: no se pudo procesar la imagen.`);
	return { blob, ancho: canvas.width, alto: canvas.height, hash };
}

// Sube una foto ya procesada (o la procesa). Devuelve { url, path, ancho, alto, hash }.
export async function uploadImage(file, folder, procesada) {
	if (!storage) throw new Error('Falta "storageBucket" en site.config.json: no se pueden subir imágenes.');
	const { blob, ancho, alto, hash } = procesada || await procesarImagen(file);
	const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
	const base = (file.name || 'foto').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w-]+/g, '-').slice(0, 40);
	const path = `${folder}/${Date.now()}-${base}.${ext}`;
	const r = ref(storage, path);
	await uploadBytes(r, blob, { contentType: blob.type, cacheControl: 'public, max-age=31536000' });
	return { url: await getDownloadURL(r), path, ancho, alto, hash };
}

// Orden natural de nombres de archivo ("foto2" antes que "foto10").
const ORDEN = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
export function ordenarArchivos(files) {
	return [...files].sort((a, b) => ORDEN.compare(a.name, b.name));
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

export function renderForm(schema, data, options = {}) {
	const state = clonar(data || {});
	const folder = options.folder || 'uploads';
	const conditionals = [];
	const required = [];
	const customs = [];

	const refresh = () => {
		conditionals.forEach(({ el, when }) => { el.hidden = !when(state); });
		customs.forEach(({ el, update }) => update(el, state));
		if (options.onChange) options.onChange(state);
	};

	function fieldWrapper(field, control) {
		const id = `f-${Math.random().toString(36).slice(2, 9)}`;
		if (control.matches && control.matches('input, select, textarea')) control.id = id;
		const label = field.type === 'checkbox' ? null : h('label', { class: 'form-label', for: id }, field.label, field.required ? ' *' : '');
		return h('div', { class: `col-12 col-md-${field.cols || 12}`, dataset: field.name ? { campo: field.name } : null },
			label, control,
			field.help ? h('div', { class: 'form-text' }, field.help) : null);
	}

	function renderField(field, target) {
		const get = () => getPath(target, field.name);
		const set = (v) => { setPath(target, field.name, v); refresh(); };
		let control;

		switch (field.type) {
			// Bloque informativo que se recalcula con cada cambio (p. ej. vista previa de Google).
			case 'custom': {
				const el = h('div');
				customs.push({ el, update: field.update });
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
		getData: () => clonar(state),
		// Borra del almacenamiento las fotos quitadas; llamar después de guardar.
		async flushDeletes() {
			await Promise.all(pendingDeletes.splice(0).map(deleteImage));
		}
	};
}
