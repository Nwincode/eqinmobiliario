// «Cambios de un dueño» (administrador): lo que un dueño cambió él solo de su casa por noche, ya publicado
// (netlify/functions/mi-casa.mjs). Cada cambio con lo de antes y lo de ahora; se deshace uno o todos (vuelve lo de
// antes donde sigue lo del dueño), se abre la ficha para corregir o se marca «Listo». Llega desde la campana.
// También la casa nueva que subió un socio (netlify/functions/mi-casa-nueva.mjs, `nueva`): ya publicada; se abre la
// ficha para corregirla, se elimina o se marca «Listo» (no hay «lo de antes» que deshacer).
// Al marcar «Listo» (o deshacer) con textos cambiados, el inglés se rehace con el traductor del panel.
import { db, doc, getDoc } from '../firebase.js';
import { h, toast, showError, errorMessage, fallaDelServidor, pageHeader, emptyState, mount, iconoBtn, formatDate, spinner, confirmDialog } from '../ui.js';
import { session, markPending } from '../session.js';
import { operacionDe } from '../estados.js';
import { textoValor } from '../mi-casa.js';
import { avisarAvisos } from '../avisos.js';

const ic = (clase) => h('span', { class: `${clase} me-1`, 'aria-hidden': 'true' });

async function api(metodo, cuerpo) {
	const res = await fetch('/api/mi-casa', {
		method: metodo, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await session.user.getIdToken()}` },
		...(cuerpo ? { body: JSON.stringify(cuerpo) } : {})
	});
	const datos = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(datos.error || fallaDelServidor(res.status));
	return datos;
}

// El inglés de la casa al día (si un texto cambió y el inglés no se corrigió a mano).
async function inglesAlDia(propertyId) {
	const { faltaIngles, traducirEn, guardarCambios } = await import('./properties.js');
	const s = await getDoc(doc(db, 'properties', propertyId));
	if (!s.exists() || !faltaIngles(s.data())) return;
	await guardarCambios(propertyId, { en: await traducirEn(s.data()) });
}

// Fotos: las nuevas en miniatura y cuántas se quitaron.
function fotos(antes = [], ahora = []) {
	const tenia = new Set(antes.map((f) => f.path)), queda = new Set(ahora.map((f) => f.path));
	const nuevas = ahora.filter((f) => !tenia.has(f.path));
	const quitadas = antes.filter((f) => !queda.has(f.path)).length;
	const orden = !nuevas.length && !quitadas;
	return h('span', { class: 'd-flex align-items-center gap-1 flex-wrap' },
		nuevas.slice(0, 6).map((f) => h('img', { src: f.url, alt: '', width: 32, height: 32, class: 'rounded', style: 'object-fit: cover' })),
		[nuevas.length ? `${nuevas.length} ${nuevas.length === 1 ? 'nueva' : 'nuevas'}` : '', quitadas ? `${quitadas} ${quitadas === 1 ? 'quitada' : 'quitadas'}` : '', orden ? 'cambió el orden' : ''].filter(Boolean).join(' · '));
}

// Lo de antes tachado y lo de ahora: en una línea si los dos son cortos (4 → 6), si no, uno debajo del otro.
const antesAhora = (antes, ahora) => (antes.length + ahora.length <= 40
	? h('div', { class: 'small' }, h('span', { class: 'text-muted text-decoration-line-through' }, antes), ' → ', ahora)
	: [h('div', { class: 'small text-muted text-decoration-line-through text-truncate' }, antes), h('div', { class: 'small text-truncate' }, ahora)]);

// Lo que hace cada botón de la tarjeta: la acción, el aviso, la campana al día y la lista otra vez.
const accionDe = (alCambiar) => async (btn, trabajo, ok) => {
	btn.disabled = true;
	try {
		if ((await trabajo()) === false) { btn.disabled = false; return; }
		toast(ok);
		avisarAvisos();
		alCambiar();
	} catch (err) { showError(err); btn.disabled = false; }
};
const listo = (c) => async () => {
	if (c.ingles) await inglesAlDia(c.propertyId);
	await api('POST', { accion: 'listo', id: c.id });
};

// La casa nueva de un socio: ya publicada. Sus fotos, abrir la ficha, eliminarla o «Listo» (con el inglés hecho).
function tarjetaNueva(c, alCambiar) {
	const accion = accionDe(alCambiar);
	const eliminar = async () => {
		if (!(await confirmDialog(`¿Eliminar «${c.titulo || 'la casa'}»? Sale de la página y se borran sus fotos. No se puede deshacer.`, { okText: 'Eliminar' }))) return false;
		const { eliminarPropiedad } = await import('./properties.js');
		const s = await getDoc(doc(db, 'properties', c.propertyId));
		if (s.exists()) await eliminarPropiedad({ id: s.id, ...s.data() });
		await markPending(`Propiedad eliminada: ${c.titulo || c.propertyId}`);
		await api('POST', { accion: 'listo', id: c.id });
	};
	const fotos = c.fotos || [];
	return h('div', { class: 'card mb-2' },
		h('div', { class: 'card-header' },
			h('div', { class: 'fw-semibold' }, `${c.nombre || 'El dueño'} subió «${c.titulo || 'su casa'}»`),
			h('div', { class: 'small text-success' }, [operacionDe(c), c.cuando ? formatDate(new Date(c.cuando)) : '', 'ya está publicada'].filter(Boolean).join(' · '))),
		fotos.length ? h('div', { class: 'card-body d-flex gap-1 flex-wrap' }, fotos.map((f) => h('img', { src: f.url, alt: '', width: 56, height: 56, class: 'rounded', style: 'object-fit: cover' }))) : null,
		h('div', { class: 'card-footer d-flex align-items-center gap-2' },
			iconoBtn('icon-pencil', 'Abrir la ficha', { href: `#/propiedades/${encodeURIComponent(c.propertyId)}` }),
			iconoBtn('icon-trash-o', 'Eliminar la casa', { class: 'btn-toque btn-icono btn btn-sm btn-outline-danger', onclick: (e) => accion(e.currentTarget, eliminar, 'Casa eliminada; sale de la página al publicarse.') }),
			h('span', { class: 'flex-grow-1' }),
			// Con «Listo», el resumen del socio (su panel) la trae con su asesor.
			h('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => accion(e.currentTarget, async () => {
				await listo(c)();
				(await import('../portal.js')).refrescarPortalesDe([c.propertyId]);
			}, 'Listo: la casa se queda publicada.') }, 'Listo')));
}

function tarjeta(c, alCambiar) {
	if (c.nueva) return tarjetaNueva(c, alCambiar);
	const deshechos = new Set(c.deshechos || []);
	const accion = accionDe(alCambiar);
	const deshacer = (campos) => async () => {
		const r = await api('POST', { accion: 'deshacer', id: c.id, campos });
		if (r.saltados?.length) toast(`No se deshizo ${r.saltados.join(', ')}: alguien lo cambió después.`, 'warning');
		if (c.ingles) await inglesAlDia(c.propertyId).catch((err) => console.warn('Inglés', err));
	};
	const fila = (x) => h('li', { class: 'list-group-item d-flex align-items-center gap-2' },
		h('div', { class: 'flex-grow-1', style: 'min-width: 0' },
			h('div', { class: 'fw-semibold' }, x.etiqueta),
			x.campo === 'fotos' ? fotos(x.antes, x.ahora) : antesAhora(textoValor(x.campo, x.antes), textoValor(x.campo, x.ahora))),
		deshechos.has(x.campo) ? h('span', { class: 'small text-muted' }, 'Deshecho')
			: iconoBtn('icon-undo', `Deshacer: ${x.etiqueta}`, { onclick: (e) => accion(e.currentTarget, deshacer([x.campo]), 'Deshecho y publicado en unos minutos.') }));
	return h('div', { class: 'card mb-2' },
		h('div', { class: 'card-header' },
			h('div', { class: 'fw-semibold' }, `${c.nombre || 'El dueño'} cambió «${c.titulo || 'su casa'}»`),
			h('div', { class: 'small text-success' }, `${c.cuando ? formatDate(new Date(c.cuando)) : ''} · ya está publicado`)),
		h('ul', { class: 'list-group list-group-flush' }, (c.cambios || []).map(fila)),
		h('div', { class: 'card-footer d-flex align-items-center gap-2' },
			iconoBtn('icon-undo', 'Deshacer todo', { onclick: (e) => accion(e.currentTarget, deshacer(null), 'Todo deshecho; se publica en unos minutos.') }),
			iconoBtn('icon-pencil', 'Abrir la ficha', { href: `#/propiedades/${encodeURIComponent(c.propertyId)}` }),
			h('span', { class: 'flex-grow-1' }),
			h('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => accion(e.currentTarget, listo(c), 'Listo: el cambio se queda.') }, 'Listo')));
}

export async function render(container, [id] = []) {
	mount(container, spinner());
	const pintar = async () => {
		try {
			const { cambios } = await api('GET');
			const lista = (id ? cambios.filter((c) => c.id === id) : cambios).sort((a, b) => (b.cuando || 0) - (a.cuando || 0));
			container.replaceChildren();
			mount(container, pageHeader('Cambios de los dueños'),
				lista.length ? lista.map((c) => tarjeta(c, pintar))
					: emptyState(id ? 'Este cambio ya se atendió.' : 'No hay cambios de los dueños por revisar.', id ? h('a', { class: 'btn btn-primary', href: '#/cambios-dueno' }, ic('icon-list'), 'Ver los demás') : null));
		} catch (err) {
			container.replaceChildren();
			mount(container, pageHeader('Cambios de los dueños'), emptyState(`No se pudieron leer: ${errorMessage(err)}`));
		}
	};
	await pintar();
}
