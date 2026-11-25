import { db, doc, getDoc, getDocs, setDoc, collection, query, limit, runTransaction, serverTimestamp } from '../firebase.js';
import { h, toast, showError, pageHeader, formatDate, confirmDialog, mount, fallaDelServidor, errorMessage } from '../ui.js';
import { plural } from '../formato.js';
import { session, getPublishState, publicarAhora, olvidarConfigPublicacion, AUTO_SEGUNDOS, autoPublicacionEnEspera, TIEMPO_PUBLICACION } from '../session.js';
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
	if (!data) throw new Error(fallaDelServidor(res.status));
	if (!res.ok && !data.error) data.error = fallaDelServidor(res.status);
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
	const card = h('div', { class: 'card mb-3' }, h('div', { class: 'card-body' },
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
						inmediato ? `Activo${c.servicio === 'zeptomail' ? ' con Zoho' : c.servicio === 'resend' ? ' con Resend' : ''}: llega a ${n} ${n === 1 ? 'dirección' : 'direcciones'} del equipo.` : 'Falta en Netlify la clave del correo (ZEPTOMAIL_TOKEN de Zoho o RESEND_API_KEY) y AVISO_CORREO.'),
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

// ------------------------------------------------------------ Datos de antes al formato nuevo
// La migración de los chats de antes (netlify/lib/migrar-chats.mjs) por /api/migrar-chats, de tanda en tanda hasta que
// el servidor dice que terminó: primero lo que cambiaría, después «Aplicar». Un fallo deja seguir donde quedó.
const NOMBRES_MIGRACION = [['archivos', 'foto a su carpeta', 'fotos a su carpeta'], ['fotos', 'mensaje con foto', 'mensajes con foto'],
	['notas', 'nota del equipo', 'notas del equipo'], ['llaves', 'archivo con enlace abierto', 'archivos con enlace abierto'],
	['comprobantes', 'comprobante de comisión', 'comprobantes de comisión'], ['indices', 'chat sin índice', 'chats sin índice'],
	['revisiones', 'revisión oculta', 'revisiones ocultas']];
const cifrasMigracion = (c) => NOMBRES_MIGRACION.filter(([k]) => c[k] > 0).map(([k, uno, varios]) => plural(c[k], uno, varios)).join(', ');

function tarjetaMigracion(hecha) {
	const cuerpo = h('div', { 'aria-live': 'polite' });
	// La última línea de la tarjeta va sin margen (el de la tarjeta basta); antes de un botón, 8 px.
	const linea = (...hijos) => h('p', { class: 'small mb-2' }, ...hijos);
	const final = (...hijos) => h('p', { class: 'small mb-0' }, h('span', { class: 'icon-check-circle text-success me-1', 'aria-hidden': 'true' }), ...hijos);
	const tanda = { aplicar: false, cursor: null, total: {} };
	const correr = async (btn) => {
		btn.disabled = true;
		const avance = (fase, fases) => cuerpo.replaceChildren(h('div', { class: 'd-flex align-items-center gap-2 text-muted small py-2', role: 'status' },
			h('div', { class: 'spinner-border spinner-border-sm', 'aria-hidden': 'true' }), `${tanda.aplicar ? 'Pasando' : 'Revisando'}…${fases ? ` ${fase} de ${fases}` : ''}`));
		avance();
		try {
			do {
				const res = await fetch('/api/migrar-chats', { method: 'POST', headers: { Authorization: `Bearer ${await session.user.getIdToken()}`, 'Content-Type': 'application/json' },
					body: JSON.stringify({ aplicar: tanda.aplicar, cursor: tanda.cursor }) });
				const r = await res.json().catch(() => null);
				if (!res.ok || !r?.ok) throw new Error(r?.error || fallaDelServidor(res.status));
				for (const [k, v] of Object.entries(r.cuenta)) tanda.total[k] = (tanda.total[k] || 0) + v;
				tanda.cursor = r.cursor;
				avance(r.fase, r.fases);
			} while (tanda.cursor);
		} catch (err) {
			cuerpo.replaceChildren(linea(h('span', { class: 'icon-exclamation-circle text-danger me-1', 'aria-hidden': 'true' }), errorMessage(err)),
				boton(tanda.aplicar ? 'Seguir' : 'Volver a revisar', 'icon-refresh', correr));
			return;
		}
		const cifras = cifrasMigracion(tanda.total);
		if (tanda.aplicar) return cuerpo.replaceChildren(final(`Listo: ${cifras || 'no había nada que pasar'}.`));
		if (!cifras) return cuerpo.replaceChildren(final('Ya está todo en el formato nuevo.'));
		cuerpo.replaceChildren(linea(`Por pasar: ${cifras}.`), boton('Aplicar', 'icon-check', (b) => { Object.assign(tanda, { aplicar: true, cursor: null, total: {} }); return correr(b); }, 'btn-primary'));
	};
	const boton = (texto, icono, fn, cls = 'btn-outline-primary') => h('button', { type: 'button', class: `btn ${cls}`, onclick: (e) => fn(e.currentTarget) },
		h('span', { class: `${icono} me-2`, 'aria-hidden': 'true' }), texto);
	if (hecha) cuerpo.append(final(`Todo está en el formato nuevo desde el ${formatDate(hecha.hecha, false)}.`));
	else cuerpo.append(h('p', { class: 'small text-muted' }, 'Fotos, notas y comprobantes de los chats de antes. Primero dice qué cambiaría.'),
		boton('Pasar datos al formato nuevo', 'icon-exchange', correr));
	return h('div', { class: 'card mb-3', id: 'migrar-chats' }, h('div', { class: 'card-body' }, h('h2', { class: 'h6' }, 'Datos de antes'), cuerpo));
}

// La base está vacía de verdad: sin settings/site y sin ninguna propiedad. Con casas guardadas, importar el ejemplo
// las mezclaría con datos de muestra que la publicación automática pondría en línea.
const hayPropiedades = async () => !(await getDocs(query(collection(db, 'properties'), limit(1)))).empty;

async function importSeed(btn) {
	if (!(await confirmDialog('Se copiarán a la base de datos los textos, propiedades, asesores, reseñas y páginas actuales del sitio. Úsalo solo una vez, al empezar. ¿Continuar?', { okText: 'Importar', danger: false }))) return;
	btn.disabled = true;
	try {
		// Se vuelve a revisar al tocar: otra pestaña o persona pudo guardar casas desde que se abrió esta pantalla.
		if (await hayPropiedades()) throw new Error('La base ya tiene propiedades: no se importan los datos iniciales.');
		const seed = await (await fetch('/data/seed.json', { cache: 'no-store' })).json();
		const now = serverTimestamp();
		const nuevos = [[doc(db, 'settings', 'site'), { ...seed.settings, updatedAt: now }]];
		const add = (col, items) => items.forEach(({ id, ...rest }) => nuevos.push([doc(db, col, id), { ...rest, createdAt: now, updatedAt: now }]));
		add('properties', seed.properties);
		add('agents', seed.agents);
		add('testimonials', seed.testimonials);
		add('pages', seed.pages);
		add('posts', seed.posts || []);
		// Solo crea: lo que ya existe (aunque sea un asesor o una página) no se toca.
		const creados = await runTransaction(db, async (tx) => {
			const existe = await Promise.all(nuevos.map(([ref]) => tx.get(ref).then((s) => s.exists())));
			const faltan = nuevos.filter((_, i) => !existe[i]);
			faltan.forEach(([ref, datos]) => tx.set(ref, datos));
			if (faltan.length) tx.set(doc(db, 'meta', 'publish'), { pendiente: true, ultimoCambio: now, ultimoCambioDesc: 'Importación inicial' }, { merge: true });
			return faltan.length;
		});
		toast(creados ? 'Datos importados. Ya puedes editarlos y publicar.' : 'Ya estaba todo en la base: no se importó nada.');
		location.hash = '#/inicio';
	} catch (err) {
		showError(err);
		btn.disabled = false;
	}
}

export async function render(container) {
	const [state, priv, site, omitidas, migracion] = await Promise.all([
		getPublishState(),
		getDoc(doc(db, 'settings', 'private')).then((s) => (s.exists() ? s.data() : {})).catch(() => ({})),
		getDoc(doc(db, 'settings', 'site')),
		// Casas que el último build dejó fuera por un dato roto (scripts/build.mjs).
		fetch('/feeds/omitidas.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).then((d) => d.casas || []).catch(() => []),
		// La migración de los chats de antes ya se aplicó (lo anota /api/migrar-chats al terminar).
		session.isAdmin ? getDoc(doc(db, 'estado', 'migracion-chats')).then((s) => (s.exists() ? s.data() : null)).catch(() => null) : null
	]);
	const baseVacia = session.isAdmin && !site.exists() && !(await hayPropiedades().catch(() => true));
	const hook = priv.netlifyBuildHook || '';

	const publish = async (btn) => {
		if (!hook) return toast('Primero configura el enlace de publicación de Netlify (abajo).', 'warning');
		btn.disabled = true;
		try {
			await publicarAhora();
			toast(`Publicación iniciada. El sitio se actualiza en ${TIEMPO_PUBLICACION}.`);
			container.replaceChildren();
			render(container);
		} catch (err) {
			showError(err);
			btn.disabled = false;
		}
	};

	// El build se frenó porque el catálogo quedaba vacío o bajaba de golpe: un administrador puede publicarlo igual, una vez.
	const frenada = state.fallo && state.freno;
	const publicarAunque = async (btn) => {
		if (!(await confirmDialog('El sitio quedará con las casas que hay ahora en el panel, aunque sean muchas menos. Vale solo para esta publicación. ¿Publicar?', { okText: 'Publicar' }))) return;
		btn.disabled = true;
		try {
			await setDoc(doc(db, 'meta', 'publish'), { forzarCatalogo: true }, { merge: true });
			await publish(btn);
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
			? `Si está encendido, el sitio se publica solo ${Math.round(AUTO_SEGUNDOS / 60)} minutos después de tu último cambio: así varios cambios salen juntos y se gasta menos. Si cierras el panel antes, se publica al salir.`
			: 'Para usarlo, primero guarda abajo el enlace de publicación de Netlify.'))
		: (autoActivo ? h('p', { class: 'small text-muted mt-3 mb-0' },
			h('span', { class: 'icon-refresh me-1', 'aria-hidden': 'true' }),
			autoPublicacionEnEspera()
				? `La publicación es automática: tus cambios se publicarán en menos de ${Math.ceil(AUTO_SEGUNDOS / 60)} minutos.`
				: 'La publicación es automática: tus cambios se publican solos poco después de guardarlos.') : null);

	const hookInput = h('input', { class: 'form-control', type: 'url', value: hook, placeholder: 'https://api.netlify.com/build_hooks/…', 'aria-label': 'Enlace de publicación de Netlify' });
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
		h('div', { class: 'card mb-3' }, h('div', { class: 'card-body' },
			h('p', {}, 'Los cambios que haces en el panel se guardan al instante, pero el sitio público se regenera al publicar. Así las páginas cargan rápido y Google las indexa completas.'),
			h('dl', { class: 'row small mb-4' },
				h('dt', { class: 'col-sm-4' }, 'Cambios pendientes'), h('dd', { class: 'col-sm-8' }, state.pendiente ? (frenada ? `Sí (${formatDate(state.ultimoCambio)})` : `Sí — ${state.ultimoCambioDesc || ''} (${formatDate(state.ultimoCambio)})`) : 'No'),
				h('dt', { class: 'col-sm-4' }, 'Última publicación'), h('dd', { class: 'col-sm-8' }, state.ultimaPublicacion ? `${formatDate(state.ultimaPublicacion)} · ${state.ultimaPublicacionAuto ? 'automática' : `por ${state.ultimaPublicacionPor || '—'}`}` : 'Nunca desde el panel')),
			frenada ? h('p', { class: 'small text-danger d-flex flex-wrap align-items-center gap-2' },
				h('span', {}, h('span', { class: 'icon-exclamation-triangle me-1', 'aria-hidden': 'true' }), state.freno),
				session.isAdmin && hook ? h('button', { class: 'btn btn-sm btn-outline-danger', onclick: (e) => publicarAunque(e.currentTarget) }, 'Publicar aunque baje') : null) : null,
			omitidas.length ? h('p', { class: 'small' },
				h('span', { class: 'icon-exclamation-circle text-warning me-1', 'aria-hidden': 'true' }), 'No se ven en el sitio por un dato roto: ',
				omitidas.flatMap((c, i) => [i ? '; ' : '', h('a', { href: `#/propiedades/${encodeURIComponent(c.id)}` }, c.titulo), `: ${c.motivo}`])) : null,
			h('button', { class: `btn btn-lg ${state.pendiente ? 'btn-warning' : 'btn-primary'}`, disabled: !hook, onclick: (e) => publish(e.currentTarget) }, 'Publicar cambios'),
			hook ? null : h('p', { class: 'small text-muted mt-2 mb-0' }, session.isAdmin ? 'Configura el enlace de Netlify abajo para activar este botón.' : 'Un administrador debe configurar la publicación.'),
			autoControl)),
		session.isAdmin ? h('div', { class: 'card mb-3' }, h('div', { class: 'card-body' },
			h('h2', { class: 'h6' }, 'Enlace de publicación de Netlify (build hook)'),
			h('p', { class: 'small text-muted' }, 'En Netlify: Site configuration → Build & deploy → Build hooks → Add build hook (nombre "Panel", rama de producción). Copia el enlace y pégalo aquí.'),
			h('div', { class: 'input-group' }, hookInput, h('button', { class: 'btn btn-outline-primary', onclick: saveHook }, 'Guardar')))) : null,
		session.isAdmin ? tarjetaAvisos() : null,
		session.isAdmin ? tarjetaMigracion(migracion) : null,
		baseVacia ? h('div', { class: 'card border-info' }, h('div', { class: 'card-body' },
			h('h2', { class: 'h6' }, 'Importar los datos actuales del sitio'),
			h('p', { class: 'small text-muted' }, 'La base de datos está vacía. Importa los textos, propiedades, asesores y reseñas que ya tiene el sitio para empezar a editarlos desde aquí.'),
			h('button', { class: 'btn btn-info', onclick: (e) => importSeed(e.currentTarget) }, 'Importar datos iniciales'))) : null,
		session.isAdmin ? h('div', { class: 'card mb-3' }, h('div', { class: 'card-body' },
			h('h2', { class: 'h6' }, 'Propiedades de prueba'),
			h('p', { class: 'small text-muted' }, 'Crea 3 propiedades de ejemplo con fotos para probar el panel y la subida de imágenes. Quedan ocultas al público; para verlas en el sitio, márcalas como publicadas en Propiedades. Bórralas cuando termines.'),
			h('div', { class: 'd-flex gap-2 flex-wrap' },
				h('button', { class: 'btn btn-outline-primary', onclick: (e) => cargar(e.currentTarget) }, 'Cargar propiedades de prueba'),
				h('button', { class: 'btn btn-outline-danger', onclick: (e) => borrar(e.currentTarget) }, 'Borrar datos de prueba')),
			demoStatus)) : null);
}
