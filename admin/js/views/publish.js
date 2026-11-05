import { db, doc, getDoc, setDoc, writeBatch, serverTimestamp } from '../firebase.js';
import { h, toast, showError, pageHeader, formatDate, confirmDialog, mount } from '../ui.js';
import { session, getPublishState, publicarAhora, olvidarConfigPublicacion, AUTO_SEGUNDOS, autoPublicacionEnEspera } from '../session.js';
import { cargarDemos, borrarDemos } from '../demo.js';

async function demoAction(btn, status, accion) {
	btn.disabled = true;
	try {
		await accion();
	} catch (err) {
		status.textContent = '';
		showError(err);
	} finally {
		btn.disabled = false;
	}
}

// ------------------------------------------------------------ Avisos por correo
// Consulta a la función /api/automatizaciones qué está configurado en Netlify.
async function llamarAutomatizaciones(body) {
	const token = await session.user.getIdToken();
	const res = await fetch('/api/automatizaciones', {
		method: body ? 'POST' : 'GET',
		headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
		body: body ? JSON.stringify(body) : undefined
	});
	let data = null;
	try { data = await res.json(); } catch { data = null; }
	if (!data) throw new Error(`Respuesta no válida (${res.status})`);
	if (!res.ok && !data.error) data.error = `Error ${res.status}`;
	return data;
}

// Fila del checklist: estado 'ok' (listo), 'falta' (necesita configurarse) u 'opcional' (apagado a propósito).
const ESTADOS = {
	ok: { icon: 'icon-check-circle', color: 'text-success', sr: 'Listo: ' },
	falta: { icon: 'icon-exclamation-circle', color: 'text-danger', sr: 'Falta configurar: ' },
	opcional: { icon: 'icon-minus-circle', color: 'text-muted', sr: 'Apagado: ' }
};

function filaEstado(estado, titulo, detalle, ultima = false) {
	const e = ESTADOS[estado];
	return h('li', { class: `d-flex gap-2 py-2${ultima ? '' : ' border-bottom'}` },
		h('span', { class: `${e.icon} ${e.color} mt-1`, 'aria-hidden': 'true' }),
		h('div', {},
			h('div', { class: 'fw-semibold' }, h('span', { class: 'visually-hidden' }, e.sr), titulo),
			detalle ? h('div', { class: 'small text-muted' }, detalle) : null));
}

function tarjetaAvisos() {
	const cuerpo = h('div', { 'aria-live': 'polite' });
	const card = h('div', { class: 'card mb-4' }, h('div', { class: 'card-body' },
		h('h2', { class: 'h6' }, 'Avisos por correo'),
		h('p', { class: 'small text-muted' }, 'Los correos llegan solo a las direcciones del equipo y al asesor asignado. Nunca se envían a quien escribe desde el sitio.'),
		cuerpo));

	const accion = async (btn, payload) => {
		btn.disabled = true;
		try {
			const r = await llamarAutomatizaciones(payload);
			if (r.error) toast(r.error, 'warning');
			else toast(r.mensaje || 'Listo.');
		} catch (err) {
			showError(err);
		} finally {
			btn.disabled = false;
		}
	};

	const revisar = () => {
		cuerpo.replaceChildren(h('div', { class: 'd-flex align-items-center gap-2 text-muted small py-2', role: 'status' },
			h('div', { class: 'spinner-border spinner-border-sm', 'aria-hidden': 'true' }), 'Revisando la configuración…'));
		llamarAutomatizaciones().then((c) => {
			if (c.error) throw new Error(c.error);
			const inmediato = Boolean(c.correo && c.destinatarios > 0);
			const resumen = Boolean(inmediato && c.datos);
			const n = c.destinatarios;
			cuerpo.replaceChildren(
				h('ul', { class: 'list-unstyled mb-3' },
					filaEstado(inmediato ? 'ok' : 'falta', 'Aviso inmediato de nuevos interesados',
						inmediato ? `Activo${c.servicio === 'zeptomail' ? ' con Zoho ZeptoMail' : c.servicio === 'resend' ? ' con Resend' : ''}: llega a ${n} ${n === 1 ? 'dirección' : 'direcciones'} del equipo.` : 'Falta en Netlify la clave del correo (ZEPTOMAIL_TOKEN de Zoho o RESEND_API_KEY) y AVISO_CORREO.'),
					filaEstado(c.remitente ? 'ok' : 'falta', 'Remitente con el dominio del sitio',
						c.remitente ? 'Los correos salen desde su propio dominio.' : (c.servicio === 'zeptomail' ? 'Falta CORREO_REMITENTE en Netlify: con Zoho es obligatorio para enviar.' : 'Falta CORREO_REMITENTE en Netlify. Mientras tanto, los correos solo llegan al dueño de la cuenta de Resend.')),
					filaEstado(resumen ? 'ok' : 'falta', 'Resumen de cada mañana',
						resumen ? 'Llega todos los días hacia las 6:10\u00a0a.\u00a0m.' : (inmediato ? 'Falta la cuenta de servicio de Google (rol Cloud Datastore Viewer) en Netlify.' : 'Primero activa el aviso inmediato.')),
					filaEstado(c.ia ? 'ok' : 'opcional', 'Asistente con IA (opcional)',
						c.ia ? 'Activo.' : 'Apagado: las herramientas funcionan con reglas. Para activarlo, agrega ANTHROPIC_API_KEY en Netlify.', true)),
				h('div', { class: 'd-flex gap-2 flex-wrap' },
					h('button', { type: 'button', class: 'btn btn-outline-primary', disabled: !inmediato, onclick: (e) => accion(e.currentTarget, { accion: 'correo' }) },
						h('span', { class: 'icon-paper-plane-o me-2', 'aria-hidden': 'true' }), 'Enviar correo de prueba'),
					h('button', { type: 'button', class: 'btn btn-outline-primary', disabled: !resumen, onclick: (e) => accion(e.currentTarget, { accion: 'resumen' }) },
						h('span', { class: 'icon-newspaper-o me-2', 'aria-hidden': 'true' }), 'Enviarme el resumen de hoy')));
		}).catch((err) => {
			console.warn('No se pudo revisar /api/automatizaciones', err);
			cuerpo.replaceChildren(
				h('p', { class: 'small text-muted' }, 'No se pudo revisar la configuración de los correos. Esta revisión solo funciona en el sitio publicado; si ya estás en él, vuelve a intentarlo en unos minutos.'),
				h('button', { type: 'button', class: 'btn btn-outline-primary', onclick: revisar },
					h('span', { class: 'icon-refresh me-2', 'aria-hidden': 'true' }), 'Volver a revisar'));
		});
	};
	revisar();

	return card;
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
		add('posts', seed.posts || []);
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
			await publicarAhora(hook);
			toast('Publicación iniciada. El sitio se actualiza en 1–2 minutos.');
			container.replaceChildren();
			render(container);
		} catch (err) {
			showError(err);
			btn.disabled = false;
		}
	};

	const autoActivo = Boolean(priv.autoPublicar && hook);
	const autoSwitch = h('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', id: 'pub-auto', checked: autoActivo, disabled: !hook, 'aria-describedby': 'pub-auto-ayuda' });
	autoSwitch.addEventListener('change', async () => {
		const v = autoSwitch.checked;
		autoSwitch.disabled = true;
		try {
			await setDoc(doc(db, 'settings', 'private'), { autoPublicar: v }, { merge: true });
			olvidarConfigPublicacion();
			toast(v ? 'Publicación automática activada.' : 'Publicación automática desactivada. Publica con el botón.');
		} catch (err) {
			autoSwitch.checked = !v;
			showError(err);
		} finally {
			autoSwitch.disabled = false;
		}
	});
	const autoControl = session.isAdmin ? h('div', { class: 'border-top pt-3 mt-4' },
		h('div', { class: 'form-check form-switch switch-fila mb-0' }, autoSwitch,
			h('label', { class: 'form-check-label fw-semibold', for: 'pub-auto' }, 'Publicar automáticamente')),
		h('p', { class: 'small text-muted mb-0', id: 'pub-auto-ayuda' }, hook
			? `Si está encendido, el sitio se publica solo unos ${AUTO_SEGUNDOS} segundos después de que dejes de hacer cambios. Si cierras el panel antes, se publica al salir.`
			: 'Para usarlo, primero guarda abajo el enlace de publicación de Netlify.'))
		: (autoActivo ? h('p', { class: 'small text-muted mt-3 mb-0' },
			h('span', { class: 'icon-refresh me-1', 'aria-hidden': 'true' }),
			autoPublicacionEnEspera()
				? `La publicación es automática: tus cambios se publicarán en menos de ${Math.ceil(AUTO_SEGUNDOS / 60)} minutos.`
				: 'La publicación es automática: tus cambios se publican solos poco después de guardarlos.') : null);

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

	const demoStatus = h('p', { class: 'small text-muted mt-2 mb-0' });
	const cargar = (btn) => demoAction(btn, demoStatus, async () => {
		if (!(await confirmDialog('Se crearán 3 propiedades de prueba con fotos, ocultas al público. ¿Continuar?', { okText: 'Cargar', danger: false }))) return;
		const n = await cargarDemos({ onProgress: (t) => { demoStatus.textContent = t; } });
		demoStatus.textContent = '';
		toast(`Listo: ${n} propiedades de prueba creadas. Las verás en Propiedades.`);
		document.dispatchEvent(new CustomEvent('publish-state'));
	});
	const borrar = (btn) => demoAction(btn, demoStatus, async () => {
		if (!(await confirmDialog('Se borrarán todas las propiedades de prueba y sus fotos. ¿Continuar?', { okText: 'Borrar' }))) return;
		demoStatus.textContent = 'Borrando…';
		const n = await borrarDemos();
		demoStatus.textContent = '';
		toast(n ? `Se borraron ${n} propiedades de prueba.` : 'No había propiedades de prueba.');
		document.dispatchEvent(new CustomEvent('publish-state'));
	});

	mount(container,
		pageHeader('Publicar el sitio'),
		h('div', { class: 'card mb-4' }, h('div', { class: 'card-body' },
			h('p', {}, 'Los cambios que haces en el panel se guardan al instante, pero el sitio público se regenera al publicar. Así las páginas cargan rápido y Google las indexa completas.'),
			h('dl', { class: 'row small mb-4' },
				h('dt', { class: 'col-sm-4' }, 'Cambios pendientes'), h('dd', { class: 'col-sm-8' }, state.pendiente ? `Sí — ${state.ultimoCambioDesc || ''} (${formatDate(state.ultimoCambio)})` : 'No'),
				h('dt', { class: 'col-sm-4' }, 'Última publicación'), h('dd', { class: 'col-sm-8' }, state.ultimaPublicacion ? `${formatDate(state.ultimaPublicacion)} por ${state.ultimaPublicacionPor || '—'}` : 'Nunca desde el panel')),
			h('button', { class: `btn btn-lg ${state.pendiente ? 'btn-warning' : 'btn-primary'}`, disabled: !hook, onclick: (e) => publish(e.currentTarget) }, 'Publicar cambios'),
			hook ? null : h('p', { class: 'small text-muted mt-2 mb-0' }, session.isAdmin ? 'Configura el enlace de Netlify abajo para activar este botón.' : 'Un administrador debe configurar la publicación.'),
			autoControl)),
		session.isAdmin ? h('div', { class: 'card mb-4' }, h('div', { class: 'card-body' },
			h('h2', { class: 'h6' }, 'Enlace de publicación de Netlify (build hook)'),
			h('p', { class: 'small text-muted' }, 'En Netlify: Site configuration → Build & deploy → Build hooks → Add build hook (nombre "Panel", rama de producción). Copia el enlace y pégalo aquí.'),
			h('div', { class: 'input-group' }, hookInput, h('button', { class: 'btn btn-outline-primary', onclick: saveHook }, 'Guardar')))) : null,
		session.isAdmin ? tarjetaAvisos() : null,
		session.isAdmin && !site.exists() ? h('div', { class: 'card border-info' }, h('div', { class: 'card-body' },
			h('h2', { class: 'h6' }, 'Importar los datos actuales del sitio'),
			h('p', { class: 'small text-muted' }, 'La base de datos está vacía. Importa los textos, propiedades, asesores y reseñas que ya tiene el sitio para empezar a editarlos desde aquí.'),
			h('button', { class: 'btn btn-info', onclick: (e) => importSeed(e.currentTarget) }, 'Importar datos iniciales'))) : null,
		session.isAdmin ? h('div', { class: 'card mb-4' }, h('div', { class: 'card-body' },
			h('h2', { class: 'h6' }, 'Propiedades de prueba'),
			h('p', { class: 'small text-muted' }, 'Crea 3 propiedades de ejemplo con fotos para probar el panel y la subida de imágenes. Quedan ocultas al público; para verlas en el sitio, márcalas como publicadas en Propiedades. Bórralas cuando termines.'),
			h('div', { class: 'd-flex gap-2 flex-wrap' },
				h('button', { class: 'btn btn-outline-primary', onclick: (e) => cargar(e.currentTarget) }, 'Cargar propiedades de prueba'),
				h('button', { class: 'btn btn-outline-danger', onclick: (e) => borrar(e.currentTarget) }, 'Borrar datos de prueba')),
			demoStatus)) : null);
}
