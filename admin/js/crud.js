// Listado + editor genérico para colecciones simples (asesores, reseñas, páginas).
import { db, doc, getDoc, getDocs, setDoc, deleteDoc, collection, serverTimestamp } from './firebase.js';
import { h, toast, showError, confirmDialog, pageHeader, emptyState , mount } from './ui.js';
import { renderForm } from './form.js';
import { markPending } from './session.js';

// cfg: { collection, route, title, singular, schema(isNew), columns: [[label, fn(item)]], defaults, beforeSave(data, ref, all), afterSave() }
export function crudView(cfg) {
	async function loadAll() {
		const snap = await getDocs(collection(db, cfg.collection));
		return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
			.sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || String(a.nombre || a.titulo || '').localeCompare(String(b.nombre || b.titulo || '')));
	}

	async function list(container) {
		const items = await loadAll();
		mount(container, 
			pageHeader(cfg.title, h('a', { href: `#/${cfg.route}/nuevo`, class: 'btn btn-primary' }, `+ ${cfg.singular}`)),
			cfg.intro ? h('p', { class: 'text-muted' }, cfg.intro) : null,
			items.length
				? h('div', { class: 'card overflow-hidden' }, h('div', { class: 'table-responsive' },
					h('table', { class: 'table table-hover table-admin' },
						h('thead', {}, h('tr', {}, cfg.columns.map(([label]) => h('th', {}, label)))),
						h('tbody', {}, items.map((it) => h('tr', { class: 'clickable', onclick: () => { location.hash = `#/${cfg.route}/${it.id}`; } },
							cfg.columns.map(([, fn]) => h('td', {}, fn(it)))))))))
				: emptyState(`Aún no hay ${cfg.title.toLowerCase()}.`, h('a', { href: `#/${cfg.route}/nuevo`, class: 'btn btn-primary' }, `Crear ${cfg.singular.toLowerCase()}`)));
	}

	async function editor(container, id) {
		const isNew = id === 'nuevo';
		const ref = isNew ? doc(collection(db, cfg.collection)) : doc(db, cfg.collection, id);
		const [snap, all] = await Promise.all([isNew ? null : getDoc(ref), loadAll()]);
		if (!isNew && !snap.exists()) {
			mount(container, emptyState('No existe.', h('a', { href: `#/${cfg.route}`, class: 'btn btn-primary' }, 'Volver')));
			return;
		}
		const data = isNew ? structuredClone(cfg.defaults || {}) : snap.data();
		const form = renderForm(cfg.schema(isNew), data, { folder: `${cfg.collection}/${ref.id}` });

		const save = async (btn) => {
			if (!form.validate()) return;
			const d = form.getData();
			try {
				if (cfg.beforeSave && (await cfg.beforeSave(d, ref, all)) === false) return;
				d.updatedAt = serverTimestamp();
				if (isNew) d.createdAt = serverTimestamp();
				btn.disabled = true;
				await setDoc(ref, d);
				await form.flushDeletes();
				await markPending(`${cfg.singular}: ${d.nombre || d.titulo || ''}`);
				if (cfg.afterSave) cfg.afterSave();
				toast('Guardado. Recuerda publicar para ver los cambios en el sitio.');
				location.hash = `#/${cfg.route}`;
			} catch (err) {
				showError(err);
			} finally {
				btn.disabled = false;
			}
		};
		const remove = async () => {
			if (!(await confirmDialog(`¿Eliminar "${data.nombre || data.titulo}"?`, { okText: 'Eliminar' }))) return;
			try {
				await deleteDoc(ref);
				await markPending(`${cfg.singular} eliminado`);
				if (cfg.afterSave) cfg.afterSave();
				toast('Eliminado.');
				location.hash = `#/${cfg.route}`;
			} catch (err) {
				showError(err);
			}
		};

		mount(container, 
			pageHeader(isNew ? `Nuevo: ${cfg.singular.toLowerCase()}` : (data.nombre || data.titulo),
				h('a', { href: `#/${cfg.route}`, class: 'btn btn-light' }, 'Volver')),
			h('div', { class: 'card' }, h('div', { class: 'card-body' }, form.el)),
			h('div', { class: 'sticky-actions' },
				h('button', { class: 'btn btn-primary', onclick: (e) => save(e.currentTarget) }, 'Guardar'),
				h('a', { href: `#/${cfg.route}`, class: 'btn btn-light' }, 'Cancelar'),
				isNew ? null : h('button', { class: 'btn btn-outline-danger ms-auto', onclick: remove }, 'Eliminar')));
	}

	return async (container, [id]) => (id ? editor(container, id) : list(container));
}
