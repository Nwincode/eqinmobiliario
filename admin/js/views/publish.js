import { db, doc, getDoc, setDoc, writeBatch, serverTimestamp } from '../firebase.js';
import { h, toast, showError, pageHeader, formatDate, confirmDialog } from '../ui.js';
import { session, getPublishState } from '../session.js';

// Netlify no devuelve CORS en los build hooks: se envía en modo "no-cors".
async function triggerBuild(hook) {
	await fetch(hook, { method: 'POST', mode: 'no-cors', body: '{}' });
}

async function importSeed(btn) {
	if (!(await confirmDialog('Se copiarán a la base de datos los textos, propiedades, asesores, reseñas y páginas actuales del sitio. Úsalo solo una vez, al empezar. ¿Continuar?', { okText: 'Importar', danger: false }))) return;
	btn.disabled = true;
	try {
		const seed = await (await fetch('/data/seed.json', { cache: 'no-store' })).json();
		const batch = writeBatch(db);
		batch.set(doc(db, 'settings', 'site'), { ...seed.settings, updatedAt: serverTimestamp() });
		const now = serverTimestamp();
		const add = (col, items) => items.forEach(({ id, ...rest }) => batch.set(doc(db, col, id), { ...rest, createdAt: now, updatedAt: now }));
		add('properties', seed.properties);
		add('agents', seed.agents);
		add('testimonials', seed.testimonials);
		add('pages', seed.pages);
		batch.set(doc(db, 'meta', 'publish'), { pendiente: true, ultimoCambio: now, ultimoCambioDesc: 'Importación inicial' }, { merge: true });
		await batch.commit();
		toast('Datos importados. Ya puedes editarlos y publicar.');
		location.hash = '#/inicio';
	} catch (err) {
		showError(err);
		btn.disabled = false;
	}
}

export async function render(container) {
	const [state, priv, site] = await Promise.all([
		getPublishState(),
		getDoc(doc(db, 'settings', 'private')).then((s) => (s.exists() ? s.data() : {})).catch(() => ({})),
		getDoc(doc(db, 'settings', 'site'))
	]);
	const hook = priv.netlifyBuildHook || '';

	const publish = async (btn) => {
		if (!hook) return toast('Primero configura el enlace de publicación de Netlify (abajo).', 'warning');
		btn.disabled = true;
		try {
			await triggerBuild(hook);
			await setDoc(doc(db, 'meta', 'publish'), {
				pendiente: false,
				ultimaPublicacion: serverTimestamp(),
				ultimaPublicacionPor: session.profile.nombre || session.user.email
			}, { merge: true });
			document.dispatchEvent(new CustomEvent('publish-state'));
			toast('Publicación iniciada. El sitio se actualiza en 1–2 minutos.');
			container.replaceChildren();
			render(container);
		} catch (err) {
			showError(err);
			btn.disabled = false;
		}
	};

	const hookInput = h('input', { class: 'form-control', type: 'url', value: hook, placeholder: 'https://api.netlify.com/build_hooks/…' });
	const saveHook = async () => {
		const v = hookInput.value.trim();
		if (v && !/^https:\/\/api\.netlify\.com\/build_hooks\/[\w-]+$/.test(v)) return toast('El enlace debe tener la forma https://api.netlify.com/build_hooks/…', 'warning');
		try {
			await setDoc(doc(db, 'settings', 'private'), { netlifyBuildHook: v }, { merge: true });
			toast('Enlace guardado.');
			container.replaceChildren();
			render(container);
		} catch (err) { showError(err); }
	};

	container.append(
		pageHeader('Publicar el sitio'),
		h('div', { class: 'card mb-4' }, h('div', { class: 'card-body' },
			h('p', {}, 'Los cambios que haces en el panel se guardan al instante, pero el sitio público se regenera al publicar. Así las páginas cargan rápido y Google las indexa completas.'),
			h('dl', { class: 'row small mb-4' },
				h('dt', { class: 'col-sm-4' }, 'Cambios pendientes'), h('dd', { class: 'col-sm-8' }, state.pendiente ? `Sí — ${state.ultimoCambioDesc || ''} (${formatDate(state.ultimoCambio)})` : 'No'),
				h('dt', { class: 'col-sm-4' }, 'Última publicación'), h('dd', { class: 'col-sm-8' }, state.ultimaPublicacion ? `${formatDate(state.ultimaPublicacion)} por ${state.ultimaPublicacionPor || '—'}` : 'Nunca desde el panel')),
			h('button', { class: `btn btn-lg ${state.pendiente ? 'btn-warning' : 'btn-primary'}`, disabled: !hook, onclick: (e) => publish(e.currentTarget) }, 'Publicar cambios'),
			hook ? null : h('p', { class: 'small text-muted mt-2 mb-0' }, session.isAdmin ? 'Configura el enlace de Netlify abajo para activar este botón.' : 'Un administrador debe configurar la publicación.'))),
		session.isAdmin ? h('div', { class: 'card mb-4' }, h('div', { class: 'card-body' },
			h('h2', { class: 'h6' }, 'Enlace de publicación de Netlify (build hook)'),
			h('p', { class: 'small text-muted' }, 'En Netlify: Site configuration → Build & deploy → Build hooks → Add build hook (nombre "Panel", rama de producción). Copia el enlace y pégalo aquí.'),
			h('div', { class: 'input-group' }, hookInput, h('button', { class: 'btn btn-outline-primary', onclick: saveHook }, 'Guardar')))) : null,
		session.isAdmin && !site.exists() ? h('div', { class: 'card border-info' }, h('div', { class: 'card-body' },
			h('h2', { class: 'h6' }, 'Importar los datos actuales del sitio'),
			h('p', { class: 'small text-muted' }, 'La base de datos está vacía. Importa los textos, propiedades, asesores y reseñas que ya tiene el sitio para empezar a editarlos desde aquí.'),
			h('button', { class: 'btn btn-info', onclick: (e) => importSeed(e.currentTarget) }, 'Importar datos iniciales'))) : null);
}
