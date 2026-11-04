// Difusión: dónde está publicada cada propiedad y kit con textos y fotos para cada plataforma.
import { db, doc, getDoc, getDocs, updateDoc, collection } from '../firebase.js';
import { h, toast, showError, pageHeader, badge, mount, emptyState, formatPrice } from '../ui.js';
import { session, loadAgents } from '../session.js';
import { copiar } from '../ia.js';
import { portalesDe, textoPara, descargarFotos, estadoDifusion, FORMATOS, codigo } from '../difusion.js';

const COLOR = { ok: 'success', actualizar: 'warning', baja: 'danger', pendiente: 'light', na: 'light' };

async function cargar() {
	const [settingsSnap, propSnap, agentes] = await Promise.all([
		getDoc(doc(db, 'settings', 'site')),
		getDocs(collection(db, 'properties')),
		loadAgents()
	]);
	const site = settingsSnap.exists() ? settingsSnap.data() : {};
	let props = propSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
	if (!session.isAdmin) props = props.filter((p) => p.agentId === session.agentId);
	return { site, props, agentes, portales: portalesDe(site) };
}

function botonCopiar(texto, etiqueta = 'Copiar') {
	return h('button', { type: 'button', class: 'btn btn-sm btn-outline-primary', onclick: async (e) => {
		const b = e.currentTarget;
		await copiar(texto);
		b.textContent = '✓ Copiado';
		setTimeout(() => { b.textContent = etiqueta; }, 1500);
	} }, etiqueta);
}

async function guardarRegistro(p, portalId, registro) {
	const difusion = { ...(p.difusion || {}), [portalId]: registro };
	await updateDoc(doc(db, 'properties', p.id), { difusion });
	p.difusion = difusion;
}

// ---------------------------------------------------------------- Kit de una propiedad

function tarjetaPortal(p, portal, opciones, redibujar) {
	const { titulo, texto, enlace } = textoPara(p, portal, opciones);
	const est = estadoDifusion(p, portal.id);
	const reg = (p.difusion || {})[portal.id] || {};
	const urlAnuncio = h('input', { class: 'form-control form-control-sm', type: 'url', placeholder: 'Pega aquí el enlace del anuncio publicado (opcional)', value: reg.url || '' });
	const area = h('textarea', { class: 'form-control font-monospace small', rows: Math.min(16, texto.split('\n').length + 2), readonly: true }, texto);

	const marcar = async (estado) => {
		try {
			await guardarRegistro(p, portal.id, { estado, fecha: new Date().toISOString(), url: urlAnuncio.value.trim(), por: session.profile.nombre || session.user.email });
			toast(estado === 'baja' ? `Marcada como dada de baja en ${portal.nombre}.` : `Marcada como publicada en ${portal.nombre}.`);
			redibujar();
		} catch (err) { showError(err); }
	};

	return h('div', { class: 'card mb-3' },
		h('div', { class: 'card-header bg-white d-flex flex-wrap align-items-center gap-2' },
			h('strong', { class: 'me-auto' }, portal.nombre, ' ', h('span', { class: 'badge text-bg-light' }, portal.idioma.toUpperCase())),
			badge(est.texto, COLOR[est.id]),
			reg.fecha ? h('span', { class: 'small text-muted' }, `desde ${new Date(reg.fecha).toLocaleDateString('es-GT')}`) : null,
			portal.url ? h('a', { href: portal.url, target: '_blank', rel: 'noopener', class: 'btn btn-sm btn-light' }, 'Abrir plataforma') : null),
		h('div', { class: 'card-body' },
			titulo ? h('div', { class: 'mb-3' },
				h('div', { class: 'd-flex align-items-center gap-2 mb-1' }, h('span', { class: 'small text-muted me-auto' }, `Título (${titulo.length}/${portal.tituloMax})`), botonCopiar(titulo, 'Copiar título')),
				h('input', { class: 'form-control', readonly: true, value: titulo })) : null,
			h('div', { class: 'd-flex align-items-center gap-2 mb-1' },
				h('span', { class: 'small text-muted me-auto' }, `Texto (${texto.length}/${portal.textoMax} caracteres)${portal.enlaces ? '' : ' · sin enlaces: esta plataforma suele bloquearlos'}`),
				botonCopiar(texto, 'Copiar texto'),
				titulo ? botonCopiar(`${titulo}\n\n${texto}`, 'Copiar todo') : null),
			area,
			h('div', { class: 'small text-muted mt-2 text-break' }, 'Enlace con seguimiento (los leads que lleguen por aquí quedan marcados con esta plataforma): ', h('a', { href: enlace, target: '_blank', rel: 'noopener' }, enlace)),
			h('div', { class: 'row g-2 align-items-center mt-3' },
				h('div', { class: 'col-md' }, urlAnuncio),
				h('div', { class: 'col-md-auto d-flex gap-2' },
					h('button', { type: 'button', class: 'btn btn-sm btn-success', onclick: () => marcar('publicado') }, est.id === 'actualizar' ? 'Ya la actualicé' : 'Marcar publicada'),
					reg.estado === 'publicado' ? h('button', { type: 'button', class: 'btn btn-sm btn-outline-danger', onclick: () => marcar('baja') }, 'Marcar dada de baja') : null))));
}

function seccionFotos(p) {
	const estado = h('div', { class: 'small text-muted mt-2', 'aria-live': 'polite' });
	const n = (p.fotos || []).length;
	return h('div', { class: 'card mb-4' },
		h('div', { class: 'card-header bg-white fw-semibold' }, `Fotos (${n})`),
		h('div', { class: 'card-body' },
			n ? null : h('p', { class: 'text-muted mb-2' }, 'Esta propiedad no tiene fotos.'),
			h('div', { class: 'row g-2' }, FORMATOS.map((f) => h('div', { class: 'col-sm-6 col-xl-3' },
				h('button', { type: 'button', class: 'btn btn-outline-primary w-100 h-100 text-start', disabled: !n, onclick: async (e) => {
					const b = e.currentTarget;
					b.disabled = true;
					try {
						const r = await descargarFotos(p, f.id, (i, total) => { estado.textContent = `Preparando foto ${i} de ${total}…`; });
						estado.textContent = `Listo: ${r.total} fotos descargadas${r.fallidas.length ? `; no se pudieron descargar las fotos ${r.fallidas.join(', ')}` : ''}.`;
					} catch (err) {
						estado.textContent = err.message;
					} finally {
						b.disabled = false;
					}
				} }, h('div', { class: 'fw-semibold' }, `⬇ ${f.nombre}`), h('div', { class: 'small text-muted' }, f.ayuda))))),
			estado));
}

async function renderKit(container, id) {
	const { site, props, agentes, portales } = await cargar();
	const p = props.find((x) => x.id === id);
	if (!p) {
		mount(container, h('div', { class: 'alert alert-warning' }, 'No se encontró la propiedad.'));
		return;
	}
	const agente = agentes.find((a) => a.id === p.agentId);
	const opciones = { agente, contacto: (site.contacto || {}).telefono || '' };
	const lista = h('div');
	const dibujar = () => lista.replaceChildren(...portales.map((portal) => tarjetaPortal(p, portal, opciones, dibujar)));
	dibujar();
	const sinIngles = !(p.en && p.en.titulo && p.en.descripcion);

	mount(container,
		pageHeader(`Difundir: ${p.titulo}`,
			h('a', { href: `#/propiedades/${p.id}`, class: 'btn btn-light' }, 'Editar propiedad'),
			h('a', { href: '#/difusion', class: 'btn btn-light' }, 'Volver')),
		h('p', { class: 'text-muted' }, `${codigo(p)} · ${formatPrice(p.precio, p.moneda, p.operacion)} · ${[p.zona, p.ciudad].filter(Boolean).join(', ')}. Copia el texto de cada plataforma, sube las fotos y marca dónde quedó publicada. Si cambias el precio o los datos, este panel te avisará qué anuncios actualizar.`),
		!p.publicado ? h('div', { class: 'alert alert-warning' }, 'Esta propiedad no está publicada en el sitio: los enlaces de los anuncios no funcionarán hasta que la publiques.') : null,
		sinIngles && portales.some((x) => x.idioma === 'en') ? h('div', { class: 'alert alert-info' }, 'La propiedad no tiene versión en inglés: los textos para portales en inglés usan el español. Usa "EN · Traducir al inglés (IA)" en la propiedad.') : null,
		seccionFotos(p),
		lista);
}

// ---------------------------------------------------------------- Tablero

async function renderTablero(container) {
	const { props, portales } = await cargar();
	const visibles = props.filter((p) => p.publicado || Object.keys(p.difusion || {}).length)
		.sort((a, b) => (a.titulo || '').localeCompare(b.titulo || ''));
	const pendientes = { actualizar: 0, baja: 0, pendiente: 0 };
	visibles.forEach((p) => portales.forEach((x) => { const e = estadoDifusion(p, x.id).id; if (e in pendientes) pendientes[e]++; }));

	mount(container,
		pageHeader('Difusión en portales y redes'),
		h('p', { class: 'text-muted' }, 'Dónde está publicada cada propiedad. Entra a una propiedad para copiar los textos ya adaptados a cada plataforma y descargar sus fotos.'),
		h('div', { class: 'row g-3 mb-4' },
			[['actualizar', 'Anuncios por actualizar', 'warning', 'Cambiaron datos o precio después de publicarlos.'],
				['baja', 'Anuncios por dar de baja', 'danger', 'La propiedad se vendió, rentó o se despublicó.'],
				['pendiente', 'Publicaciones pendientes', 'secondary', 'Plataformas donde aún no está la propiedad.']]
				.map(([k, label, color, ayuda]) => h('div', { class: 'col-md-4' }, h('div', { class: `card stat-card h-100 border-${color}` }, h('div', { class: 'card-body' },
					h('div', { class: 'stat-value' }, pendientes[k]), h('div', { class: 'stat-label' }, label), h('div', { class: 'small text-muted' }, ayuda)))))),
		visibles.length ? h('div', { class: 'card overflow-hidden' }, h('div', { class: 'table-responsive' },
			h('table', { class: 'table table-hover table-admin mb-0 align-middle' },
				h('thead', {}, h('tr', {}, h('th', {}, 'Propiedad'), portales.map((x) => h('th', { class: 'text-center small' }, x.nombre)))),
				h('tbody', {}, visibles.map((p) => h('tr', { class: 'clickable', onclick: () => { location.hash = `#/difusion/${p.id}`; } },
					h('td', {}, h('div', { class: 'fw-semibold' }, p.titulo), h('div', { class: 'small text-muted' }, `${codigo(p)} · ${p.estado || 'disponible'}`)),
					portales.map((x) => {
						const e = estadoDifusion(p, x.id);
						return h('td', { class: 'text-center' }, e.id === 'na' ? h('span', { class: 'text-muted' }, '—') : badge(e.texto, COLOR[e.id]));
					}))))))) : emptyState('Todavía no hay propiedades publicadas.'),
		h('div', { class: 'card mt-4' }, h('div', { class: 'card-body small' },
			h('strong', {}, 'Catálogos automáticos. '),
			'Algunas plataformas leen las propiedades solas desde un enlace y se actualizan sin copiar nada: ',
			h('ul', { class: 'mb-0 mt-2' },
				h('li', {}, h('strong', {}, 'Facebook e Instagram (catálogo de inmuebles): '), h('code', {}, '/feeds/meta-inmuebles.xml'), ' — en Meta Commerce Manager → Catálogo → Fuentes de datos → Feed programado. Sirve para anuncios dinámicos de propiedades.'),
				h('li', {}, h('strong', {}, 'Portales internacionales (formato Kyero v3): '), h('code', {}, '/feeds/kyero.xml'), ' — para portales y agregadores en inglés que aceptan importación XML.'),
				h('li', {}, h('strong', {}, 'Integraciones a la medida: '), h('code', {}, '/feeds/propiedades.json'), ' — todas las propiedades disponibles en JSON.')))));
}

export async function render(container, [id]) {
	if (id) return renderKit(container, id);
	return renderTablero(container);
}
