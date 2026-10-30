import {
	db, doc, getDoc, getDocs, setDoc, deleteDoc, collection, serverTimestamp
} from '../firebase.js';
import {
	h, toast, showError, confirmDialog, pageHeader, badge, emptyState, formatPrice, formatDate, slugify, spinner
} from '../ui.js';
import { renderForm, deleteImage } from '../form.js';
import { session, agentOptions, loadAgents, markPending } from '../session.js';

export const TIPOS = [['casa', 'Casa'], ['apartamento', 'Apartamento'], ['terreno', 'Terreno'], ['oficina', 'Oficina'], ['local', 'Local comercial'], ['bodega', 'Bodega'], ['finca', 'Finca']];
const OPERACIONES = [['venta', 'Venta'], ['renta', 'Renta']];
const ESTADOS = [['disponible', 'Disponible'], ['reservada', 'Reservada'], ['vendida', 'Vendida'], ['rentada', 'Rentada']];
const MONEDAS = [['USD', 'Dólares (US$)'], ['GTQ', 'Quetzales (Q)']];

export function publicUrl(p) {
	return `${p.vip ? '/vip/' : '/propiedad/'}${p.slug}/`;
}

async function loadAll() {
	const snap = await getDocs(collection(db, 'properties'));
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function canEdit(p) {
	return session.isAdmin || (p.agentId && p.agentId === session.agentId);
}

export async function render(container, [id]) {
	if (id) return renderEditor(container, id);

	const [props, agents] = await Promise.all([loadAll(), loadAgents()]);
	const agentName = Object.fromEntries(agents.map((a) => [a.id, a.nombre]));
	props.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));

	const search = h('input', { class: 'form-control', type: 'search', placeholder: 'Buscar por título, zona o residencial…' });
	const fOperacion = h('select', { class: 'form-select' }, h('option', { value: '' }, 'Venta y renta'), OPERACIONES.map(([v, l]) => h('option', { value: v }, l)));
	const fEstado = h('select', { class: 'form-select' }, h('option', { value: '' }, 'Todos los estados'), ESTADOS.map(([v, l]) => h('option', { value: v }, l)));
	const fExtra = h('select', { class: 'form-select' },
		h('option', { value: '' }, 'Todas'),
		h('option', { value: 'publicado' }, 'Publicadas'),
		h('option', { value: 'borrador' }, 'Borradores'),
		h('option', { value: 'vip' }, 'VIP'),
		h('option', { value: 'destacada' }, 'Destacadas'),
		session.isAdmin ? null : h('option', { value: 'mias' }, 'Solo las mías'));
	const tbody = h('tbody');
	const count = h('span', { class: 'text-muted small' });

	const draw = () => {
		const q = search.value.trim().toLowerCase();
		const rows = props.filter((p) =>
			(!q || `${p.titulo} ${p.zona} ${p.direccion} ${p.ciudad}`.toLowerCase().includes(q))
			&& (!fOperacion.value || p.operacion === fOperacion.value)
			&& (!fEstado.value || p.estado === fEstado.value)
			&& (fExtra.value !== 'publicado' || p.publicado)
			&& (fExtra.value !== 'borrador' || !p.publicado)
			&& (fExtra.value !== 'vip' || p.vip)
			&& (fExtra.value !== 'destacada' || p.destacada)
			&& (fExtra.value !== 'mias' || p.agentId === session.agentId));
		count.textContent = `${rows.length} de ${props.length}`;
		tbody.replaceChildren(...rows.map((p) => h('tr', { class: 'clickable', onclick: () => { location.hash = `#/propiedades/${p.id}`; } },
			h('td', {}, h('img', { class: 'thumb', src: p.fotos?.[0]?.url || '', alt: '' })),
			h('td', {},
				h('div', { class: 'fw-semibold' }, p.titulo || '(sin título)'),
				h('div', { class: 'small text-muted' }, [p.zona, p.ciudad].filter(Boolean).join(', '))),
			h('td', { class: 'text-nowrap' }, formatPrice(p.precio, p.moneda, p.operacion)),
			h('td', {}, p.operacion === 'renta' ? 'Renta' : 'Venta'),
			h('td', { class: 'text-nowrap' },
				p.publicado ? badge('Publicada', 'success') : badge('Borrador', 'secondary'), ' ',
				p.vip ? badge('VIP', 'warning') : null, ' ',
				p.destacada ? badge('Destacada', 'info') : null, ' ',
				p.estado && p.estado !== 'disponible' ? badge(ESTADOS.find(([v]) => v === p.estado)?.[1] || p.estado, 'danger') : null),
			h('td', { class: 'small' }, agentName[p.agentId] || '—'),
			h('td', { class: 'small text-muted text-nowrap' }, formatDate(p.updatedAt, false)))));
	};
	[search, fOperacion, fEstado, fExtra].forEach((el) => el.addEventListener('input', draw));
	draw();

	container.append(
		pageHeader('Propiedades', h('a', { href: '#/propiedades/nuevo', class: 'btn btn-primary' }, '+ Nueva propiedad')),
		props.length ? h('div', {},
			h('div', { class: 'row g-2 mb-3' },
				h('div', { class: 'col-md-5' }, search),
				h('div', { class: 'col-6 col-md-2' }, fOperacion),
				h('div', { class: 'col-6 col-md-3' }, fEstado),
				h('div', { class: 'col-md-2' }, fExtra)),
			h('div', { class: 'mb-2' }, count),
			h('div', { class: 'card overflow-hidden' }, h('div', { class: 'table-responsive' },
				h('table', { class: 'table table-hover table-admin' },
					h('thead', {}, h('tr', {}, ['', 'Propiedad', 'Precio', 'Operación', 'Estado', 'Asesor', 'Actualizada'].map((t) => h('th', {}, t)))),
					tbody))))
			: emptyState('Aún no hay propiedades.', h('a', { href: '#/propiedades/nuevo', class: 'btn btn-primary' }, 'Crear la primera')));
}

function schema(agentOpts, isNew) {
	const vip = (d) => Boolean(d.vip);
	return [
		{ type: 'section', label: 'Datos principales' },
		{ name: 'titulo', label: 'Título', required: true, cols: 8, placeholder: 'Ej. Casa con jardín en Residencial San Antonio' },
		{ name: 'slug', label: 'URL (slug)', cols: 4, help: 'Se genera solo a partir del título.', ref: (el) => { schema.slugInput = el; } },
		{ name: 'operacion', label: 'Operación', type: 'select', options: OPERACIONES, cols: 3 },
		{ name: 'tipo', label: 'Tipo', type: 'select', options: TIPOS, cols: 3 },
		{ name: 'estado', label: 'Estado', type: 'select', options: ESTADOS, cols: 3 },
		{ name: 'agentId', label: 'Asesor responsable', type: 'select', options: agentOpts, cols: 3, disabled: !session.isAdmin },
		{ name: 'precio', label: 'Precio', type: 'number', min: 0, step: 1, cols: 4, help: 'Déjalo vacío para mostrar "Precio a consultar".' },
		{ name: 'moneda', label: 'Moneda', type: 'select', options: MONEDAS, cols: 4 },
		{ name: 'orden', label: 'Orden', type: 'number', cols: 4, help: 'Número menor aparece primero.' },
		{ name: 'publicado', label: 'Publicada en el sitio', type: 'checkbox', cols: 4, default: isNew ? false : undefined },
		{ name: 'destacada', label: 'Destacada en la portada', type: 'checkbox', cols: 4 },
		{ name: 'vip', label: 'Propiedad VIP (landing page)', type: 'checkbox', cols: 4 },

		{ type: 'section', label: 'Ubicación' },
		{ name: 'zona', label: 'Zona', cols: 4, placeholder: 'Zona 16' },
		{ name: 'ciudad', label: 'Ciudad / municipio', cols: 4, placeholder: 'Guatemala' },
		{ name: 'direccion', label: 'Residencial / dirección', cols: 4 },
		{ name: 'mapa', label: 'Mapa (opcional)', type: 'textarea', rows: 2, help: 'Pega el código "Insertar mapa" de Google Maps, o escribe la dirección o coordenadas.' },

		{ type: 'section', label: 'Características' },
		{ name: 'habitaciones', label: 'Habitaciones', type: 'number', min: 0, cols: 2 },
		{ name: 'banos', label: 'Baños', type: 'number', min: 0, step: 0.5, cols: 2 },
		{ name: 'parqueos', label: 'Parqueos', type: 'number', min: 0, cols: 2 },
		{ name: 'm2Construccion', label: 'm² construcción', type: 'number', min: 0, cols: 3 },
		{ name: 'm2Terreno', label: 'm² terreno', type: 'number', min: 0, cols: 3 },
		{ name: 'amenidades', label: 'Amenidades', type: 'tags', placeholder: 'Piscina, garita, jardín… (Enter para agregar)' },
		{ name: 'descripcion', label: 'Descripción', type: 'markdown', rows: 8, required: true },
		{ name: 'video', label: 'Video (YouTube o Vimeo)', type: 'url', placeholder: 'https://www.youtube.com/watch?v=…' },

		{ type: 'section', label: 'Fotos', help: 'La primera foto es la portada. Se reducen y optimizan automáticamente al subirlas.' },
		{ name: 'fotos', label: 'Galería', type: 'images' },

		{ type: 'section', label: 'Landing page VIP', help: 'Solo para propiedades marcadas como VIP. Se publica en /vip/…', when: vip },
		{ name: 'vipLanding.titular', label: 'Titular', cols: 6, when: vip, placeholder: 'Ej. Vive frente al bosque, a 10 minutos de todo' },
		{ name: 'vipLanding.ctaTexto', label: 'Texto del botón', cols: 6, when: vip, placeholder: 'Agendar visita privada' },
		{ name: 'vipLanding.subtitular', label: 'Subtítulo', type: 'textarea', rows: 2, when: vip },
		{ name: 'vipLanding.portada', label: 'Imagen de portada (opcional)', type: 'image', when: vip, help: 'Si no eliges una, se usa la primera foto de la galería.' },
		{ name: 'vipLanding.puntosClave', label: 'Puntos clave', type: 'tags', when: vip, placeholder: 'Vista panorámica, acabados importados… (Enter para agregar)' },
		{ name: 'vipLanding.ocultarPrecio', label: 'Ocultar precio ("Precio a consultar")', type: 'checkbox', when: vip },

		{ type: 'section', label: 'SEO (opcional)', help: 'Si los dejas vacíos se generan automáticamente.' },
		{ name: 'seo.titulo', label: 'Título para Google', maxlength: 70, cols: 12 },
		{ name: 'seo.descripcion', label: 'Descripción para Google', type: 'textarea', rows: 2, maxlength: 160 }
	];
}

async function renderEditor(container, id) {
	const isNew = id === 'nuevo';
	const ref = isNew ? doc(collection(db, 'properties')) : doc(db, 'properties', id);
	const [snap, agentOpts, all] = await Promise.all([isNew ? null : getDoc(ref), agentOptions(), loadAll()]);
	if (!isNew && !snap.exists()) {
		container.append(emptyState('La propiedad no existe.', h('a', { href: '#/propiedades', class: 'btn btn-primary' }, 'Volver')));
		return;
	}
	const data = isNew
		? { operacion: 'venta', tipo: 'casa', estado: 'disponible', moneda: 'USD', ciudad: 'Guatemala', publicado: false, agentId: session.isAdmin ? '' : session.agentId, fotos: [], amenidades: [], vipLanding: {}, seo: {} }
		: snap.data();

	if (!isNew && !canEdit(data)) {
		container.append(pageHeader(data.titulo, h('a', { href: '#/propiedades', class: 'btn btn-light' }, 'Volver')),
			h('div', { class: 'alert alert-info' }, 'Esta propiedad pertenece a otro asesor; solo puedes verla.'),
			h('a', { href: publicUrl(data), target: '_blank', class: 'btn btn-outline-primary' }, 'Ver en el sitio'));
		return;
	}
	if (!session.isAdmin && !session.agentId) {
		container.append(h('div', { class: 'alert alert-warning' }, 'Tu usuario no está vinculado a un asesor. Pide a un administrador que lo vincule en "Usuarios".'));
		return;
	}

	let slugTouched = Boolean(data.slug);
	const form = renderForm(schema(agentOpts, isNew), data, { folder: `properties/${ref.id}` });
	const slugInput = schema.slugInput;
	slugInput.addEventListener('input', () => { slugTouched = true; });
	form.el.querySelector('input')?.addEventListener('input', (e) => {
		if (!slugTouched) {
			slugInput.value = slugify(e.target.value);
			form.state.slug = slugInput.value;
		}
	});

	const save = async (btn) => {
		if (!form.validate()) return;
		const d = form.getData();
		d.slug = slugify(d.slug || d.titulo);
		if (!d.slug) return toast('Escribe un título.', 'warning');
		const clash = all.find((p) => p.id !== ref.id && p.slug === d.slug);
		if (clash) return toast(`La URL "${d.slug}" ya la usa "${clash.titulo}". Cámbiala.`, 'warning');
		if (!session.isAdmin) d.agentId = session.agentId;
		d.updatedAt = serverTimestamp();
		d.updatedBy = session.user.uid;
		if (isNew) {
			d.createdAt = serverTimestamp();
			d.createdBy = session.user.uid;
		}
		btn.disabled = true;
		try {
			await setDoc(ref, d);
			await form.flushDeletes();
			await markPending(`Propiedad: ${d.titulo}`);
			toast('Propiedad guardada. Recuerda publicar para ver los cambios en el sitio.');
			if (isNew) location.hash = `#/propiedades/${ref.id}`;
		} catch (err) {
			showError(err);
		} finally {
			btn.disabled = false;
		}
	};

	const remove = async () => {
		if (!(await confirmDialog(`¿Eliminar "${data.titulo}"? Se borrarán también sus fotos. Esta acción no se puede deshacer.`, { okText: 'Eliminar' }))) return;
		try {
			await deleteDoc(ref);
			await Promise.all((data.fotos || []).map((f) => deleteImage(f.path)));
			await markPending(`Propiedad eliminada: ${data.titulo}`);
			toast('Propiedad eliminada.');
			location.hash = '#/propiedades';
		} catch (err) {
			showError(err);
		}
	};

	// La copia reutiliza las fotos sin su ruta de almacenamiento, para que borrar
	// fotos de la copia no elimine las de la original.
	const duplicate = async (btn) => {
		btn.disabled = true;
		try {
			const copy = collection(db, 'properties');
			const newRef = doc(copy);
			const titulo = `${data.titulo} (copia)`;
			await setDoc(newRef, {
				...data,
				titulo,
				slug: slugify(titulo),
				publicado: false,
				destacada: false,
				fotos: (data.fotos || []).map(({ url, alt }) => ({ url, alt: alt || '' })),
				agentId: session.isAdmin ? data.agentId || '' : session.agentId,
				createdAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
				createdBy: session.user.uid
			});
			toast('Copia creada como borrador. Ajusta los datos y guarda.');
			location.hash = `#/propiedades/${newRef.id}`;
		} catch (err) {
			showError(err);
			btn.disabled = false;
		}
	};

	const saveBtn = h('button', { class: 'btn btn-primary', onclick: (e) => save(e.currentTarget) }, 'Guardar');
	container.append(
		pageHeader(isNew ? 'Nueva propiedad' : data.titulo,
			!isNew && data.publicado ? h('a', { href: publicUrl(data), target: '_blank', class: 'btn btn-outline-primary' }, 'Ver en el sitio') : null,
			h('a', { href: '#/propiedades', class: 'btn btn-light' }, 'Volver')),
		!isNew ? h('p', { class: 'small text-muted' }, `Última actualización: ${formatDate(data.updatedAt)}`) : null,
		h('div', { class: 'card' }, h('div', { class: 'card-body' }, form.el)),
		h('div', { class: 'sticky-actions' },
			saveBtn,
			h('a', { href: '#/propiedades', class: 'btn btn-light' }, 'Cancelar'),
			!isNew ? h('button', { class: 'btn btn-outline-secondary', onclick: (e) => duplicate(e.currentTarget) }, 'Duplicar') : null,
			!isNew && session.isAdmin ? h('button', { class: 'btn btn-outline-danger ms-auto', onclick: remove }, 'Eliminar') : null));
}

export { spinner };
