// Listado + editor genérico para colecciones simples (asesores, reseñas, páginas).
import { db, doc, getDoc, getDocs, setDoc, deleteDoc, collection, serverTimestamp, runTransaction } from './firebase.js';
import { h, toast, showError, confirmDialog, pageHeader, emptyState , mount, cajaTabla } from './ui.js';
import { renderForm } from './form.js';
import { markPending, porOrden, trasGuardar } from './session.js';
import { revisar, vigilarFormulario } from './pendientes.js';
import { guardarSobre } from './cambios-casa.js';

// cfg.pendientes: tipo de pendientes.js para marcar datos por completar.
// cfg: { collection, route, title, singular, schema(isNew), columns: [[label, fn(item)]], defaults (o una función que los da),
//   beforeSave(data, ref, all, antes), antesDeEliminar(data, id) (false = no se elimina), afterSave() }
export function crudView(cfg) {
	async function loadAll() {
		const snap = await getDocs(collection(db, cfg.collection));
		return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(porOrden);
	}

	async function list(container) {
		let items = await loadAll();
		const soloIncompletos = cfg.pendientes && /\/incompletos$/.test(location.hash);
		if (soloIncompletos) items = items.filter((it) => revisar(cfg.pendientes, it).length);
		mount(container, 
			pageHeader(cfg.title, h('a', { href: `#/${cfg.route}/nuevo`, class: 'btn btn-primary' }, `+ ${cfg.singular}`)),
			cfg.intro ? h('p', { class: 'text-muted' }, cfg.intro) : null,
			soloIncompletos ? h('p', { class: 'small' }, 'Mostrando solo los que tienen datos por completar. ', h('a', { href: `#/${cfg.route}` }, 'Ver todos')) : null,
			items.length
				? cajaTabla(
					h('table', { class: 'table table-hover table-admin' },
						h('thead', {}, h('tr', {}, cfg.columns.map(([label]) => h('th', {}, label)))),
						h('tbody', {}, items.map((it) => h('tr', { class: 'clickable', onclick: () => { location.hash = `#/${cfg.route}/${it.id}`; } },
							cfg.columns.map(([, fn]) => h('td', {}, fn(it))))))), { tarjeta: true })
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
		const data = isNew ? structuredClone((typeof cfg.defaults === 'function' ? cfg.defaults() : cfg.defaults) || {}) : snap.data();
		const form = renderForm(cfg.schema(isNew), data, { folder: `${cfg.collection}/${ref.id}` });
		// Lo que mostraba al abrir: al guardar se escribe solo lo que cambió aquí, sobre lo guardado ahora.
		const alAbrir = form.getData();

		const save = async (btn) => {
			if (!form.validate()) return;
			const d = form.getData();
			try {
				if (cfg.beforeSave && (await cfg.beforeSave(d, ref, all, isNew ? null : data)) === false) return;
				btn.disabled = true;
				if (isNew) await setDoc(ref, { ...d, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
				else await runTransaction(db, async (tx) => {
					const ahora = await tx.get(ref);
					if (!ahora.exists()) throw new Error('Ya no existe: alguien lo eliminó mientras lo editabas.');
					tx.set(ref, { ...guardarSobre(ahora.data(), alAbrir, d), updatedAt: serverTimestamp() });
				});
				await form.flushDeletes();
				await markPending(`${cfg.singular}: ${d.nombre || d.titulo || ''}`);
				if (cfg.afterSave) cfg.afterSave();
				toast(`Guardado. ${trasGuardar()}`);
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
				if (cfg.antesDeEliminar && (await cfg.antesDeEliminar(data, ref.id)) === false) return;
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
			cfg.pendientes ? vigilarFormulario(form, cfg.pendientes) : null,
			h('div', { class: 'card' }, h('div', { class: 'card-body' }, form.el)),
			h('div', { class: 'sticky-actions' },
				h('button', { class: 'btn btn-primary', onclick: (e) => save(e.currentTarget) }, 'Guardar'),
				h('a', { href: `#/${cfg.route}`, class: 'btn btn-light' }, 'Cancelar'),
				isNew ? null : h('button', { class: 'btn btn-outline-danger ms-auto', onclick: remove }, 'Eliminar')));
	}

	return async (container, [id]) => (id && id !== 'incompletos' ? editor(container, id) : list(container));
}
