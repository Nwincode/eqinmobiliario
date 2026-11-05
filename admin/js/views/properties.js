import {
	db, doc, getDoc, getDocs, setDoc, deleteDoc, collection, serverTimestamp, arrayUnion, Timestamp
} from '../firebase.js';
import {
	h, toast, showError, confirmDialog, pageHeader, badge, emptyState, formatPrice, formatDate, slugify, spinner
, mount, downloadCsv } from '../ui.js';
import { renderForm, deleteImage } from '../form.js';
import { session, agentOptions, loadAgents, markPending } from '../session.js';
import { seoPreviewField, stripMd } from '../seo.js';
import { pedirIA } from '../ia.js';
import { updateDoc } from '../firebase.js';
import { ESTADOS_PROPIEDAD, estadoDe, visibilidadDe } from '../estados.js';
import { generarCodigo, normalizarCodigo, PLANTILLA } from '../importar.js';
import { revisar, chipFaltan, vigilarFormulario } from '../pendientes.js';
import { refrescarPortalesDe } from '../portal.js';
import '/js/calc-vacacional.js';

const V = window.EQVacacional;

const faltanDe = (p) => revisar('propiedades', p);

// Mismos valores por defecto que usa el generador del sitio (scripts/lib/templates.mjs).
function autoTitle(d) {
	const op = OPERACION_LABEL[d.operacion] || 'Venta';
	const titulo = d.titulo || '';
	const candidates = [
		`${titulo} | ${op} en ${[d.zona, d.ciudad].filter(Boolean).join(', ')}`,
		d.zona && `${titulo} | ${op} en ${d.zona}`,
		`${titulo} | ${op}`,
		titulo
	].filter(Boolean);
	return candidates.find((t) => t.length <= 65) || candidates[candidates.length - 1];
}
function autoDescription(d) {
	const specs = [d.habitaciones && `${d.habitaciones} habitaciones`, d.banos && `${d.banos} baños`, d.m2Construccion && `${d.m2Construccion} m²`].filter(Boolean).join(', ');
	return `${formatPrice(d.precio, d.moneda, d.operacion)}.${specs ? ` ${specs}.` : ''} ${stripMd(d.descripcion)}`.trim();
}

export const TIPOS = [['casa', 'Casa'], ['apartamento', 'Apartamento'], ['terreno', 'Terreno'], ['oficina', 'Oficina'], ['local', 'Local comercial'], ['bodega', 'Bodega'], ['finca', 'Finca']];
export const OPERACIONES = [['venta', 'Venta'], ['renta', 'Renta'], ['vacacional', 'Renta vacacional']];
const OPERACION_LABEL = Object.fromEntries(OPERACIONES);
const esVacacional = (d) => d.operacion === 'vacacional';
const HORAS = Array.from({ length: 24 }, (_, i) => { const hh = `${String(i).padStart(2, '0')}:00`; return [hh, hh]; });

// Renta vacacional. Lo privado (costo del socio, margen, contacto, enlace iCal) vive en
// properties/{id}/privado/socio, que solo lee el equipo. En el documento público solo quedan
// los precios por noche al público (base, fin de semana y tarifas por fechas) y las fechas ocupadas.
const hoyISO = () => new Date().toISOString().slice(0, 10);
const planSocioDe = (s = {}) => ({ base: s.precioBase, finde: s.precioFinde, tarifas: s.tarifas || [] });
export function vacacionalPublico(d) {
	const pub = V.planPublico(planSocioDe(d.socio), d.socio?.margen);
	const v = d.vacacional || {};
	const bloqueos = V.unirRangos(v.bloqueos || []);
	return {
		precio: V.precioDesde(pub, hoyISO()) || null,
		vacacional: {
			base: pub.base, finde: pub.finde, tarifas: pub.tarifas,
			nochesMin: Math.max(1, Math.floor(Number(v.nochesMin) || 1)),
			huespedesMax: Math.max(1, Math.floor(Number(v.huespedesMax) || 1)),
			limpieza: V.r2(Number(v.limpieza) || 0), deposito: V.r2(Number(v.deposito) || 0),
			checkIn: v.checkIn || '15:00', checkOut: v.checkOut || '11:00',
			bloqueos
		}
	};
}
function desgloseVacacional(el, d) {
	const s = d.socio || {};
	const moneda = d.moneda || 'USD';
	const m = (n) => `${{ USD: 'US$', GTQ: 'Q' }[moneda] || moneda} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	const filas = [['Precio base', s.precioBase], ['Fin de semana (viernes y sábado)', s.precioFinde]]
		.concat((s.tarifas || []).filter((t) => t.precio).map((t) => [`Tarifa ${t.desde || '…'} al ${t.hasta || '…'}`, t.precio]))
		.filter(([, p]) => Number(p) > 0);
	if (!filas.length) {
		el.replaceChildren(h('p', { class: 'small text-muted mb-0' }, 'Escribe el precio por noche del socio para ver la ganancia y el precio al público.'));
		return;
	}
	const pub = V.planPublico(planSocioDe(s), s.margen);
	const ejemplo = V.gananciaEstancia({ planSocio: planSocioDe(s), margen: s.margen, llegada: hoyISO(), salida: V.sumarDias(hoyISO(), 7) });
	el.replaceChildren(h('div', { class: 'table-responsive' }, h('table', { class: 'table table-sm align-middle mb-2 tabla-vacacional' },
		h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Noche'), h('th', { scope: 'col', class: 'text-end' }, 'Socio'),
			h('th', { scope: 'col', class: 'text-end' }, `Ganancia ${V.r2(s.margen ?? V.MARGEN)} %`), h('th', { scope: 'col', class: 'text-end' }, 'Al público'),
			h('th', { scope: 'col', class: 'text-end' }, 'Impuestos 22 %'))),
		h('tbody', {}, filas.map(([nombre, p]) => {
			const n = V.desgloseNoche(p, s.margen);
			return h('tr', {}, h('td', {}, nombre), h('td', { class: 'text-end' }, m(n.precioSocio)), h('td', { class: 'text-end' }, m(n.ganancia)),
				h('td', { class: 'text-end fw-semibold' }, m(n.nochePublica)), h('td', { class: 'text-end' }, m(n.impuestos)));
		})))),
	h('p', { class: 'small text-muted mb-0' },
		`En la página se publica "desde ${m(V.precioDesde(pub, hoyISO()))} por noche" + impuestos (IVA 12 % e INGUAT 10 %). `,
		`Ejemplo de 7 noches desde hoy: el socio recibe ${m(ejemplo.costoSocio)} y la ganancia es ${m(ejemplo.ganancia)}. `,
		'La limpieza se cobra aparte sin margen y el depósito no lleva impuestos. Solo el equipo ve esta tabla.'));
}
export const ESTADOS = ESTADOS_PROPIEDAD.map((e) => [e.valor, e.label]);
export const MONEDAS = [['USD', 'Dólares (US$)'], ['GTQ', 'Quetzales (Q)']];

// Valores de una propiedad nueva (editor e importación).
export function datosIniciales() {
	return { operacion: 'venta', tipo: 'casa', estado: 'disponible', moneda: 'USD', ciudad: 'Guatemala', publicado: false, agentId: session.isAdmin ? '' : session.agentId, fotos: [], amenidades: [], vipLanding: {}, seo: {} };
}

export function publicUrl(p) {
	return `${p.vip ? '/vip/' : '/propiedad/'}${p.slug}/`;
}

export async function loadAll() {
	const snap = await getDocs(collection(db, 'properties'));
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function canEdit(p) {
	return session.isAdmin || (p.agentId && p.agentId === session.agentId);
}

// Entrada del historial de estados (serverTimestamp no se permite dentro de arreglos).
export function entradaHistorial(estado) {
	return { estado, fecha: Timestamp.now(), por: session.profile?.nombre || session.user?.email || '', porUid: session.user?.uid || '' };
}

// Campos que registran un cambio de estado desde la lista: fecha y entrada en el historial.
function cambioDeEstado(estado) {
	return { estado, estadoFecha: serverTimestamp(), historialEstado: arrayUnion(entradaHistorial(estado)) };
}

// Nombre corto del estado para la etiqueta («retirada», no «retirada del mercado»).
const corto = (e) => e.label.split(/ [/d]/)[0].toLowerCase();

// Por qué se ve (o no) cada propiedad en la página.
function motivoVisibilidad(p) {
	const e = estadoDe(p);
	switch (visibilidadDe(p)) {
		case 'borrador': return { texto: 'Oculta: «Visible» apagado', color: 'secondary', icono: 'icon-eye-slash' };
		case 'cerrada': return { texto: `Solo con enlace: ${corto(e)}`, color: 'warning', icono: 'icon-link' };
		case 'oculta': return { texto: `Oculta: ${corto(e)}`, color: 'danger', icono: 'icon-eye-slash' };
		default: return { texto: 'Se ve en la página', color: 'success', icono: 'icon-eye' };
	}
}

// Exporta el listado con las mismas columnas de la plantilla de importación (se puede volver a importar),
// más los enlaces de fotos, la página pública y si está publicada. El costo del socio solo lo ve el administrador.
async function exportarCsv(props, agentName, btn) {
	btn.disabled = true;
	try {
		const cab = [...PLANTILLA[0], 'enlaces_fotos', 'enlace', 'publicado'];
		const filas = [cab];
		for (const p of props) {
			const v = p.vacacional || {};
			let s = {};
			if (session.isAdmin && p.operacion === 'vacacional') {
				s = (await getDoc(doc(db, 'properties', p.id, 'privado', 'socio')).catch(() => null))?.data() || {};
			}
			const val = {
				codigo: p.codigo, carpeta: '', titulo: p.titulo, operacion: p.operacion, tipo: p.tipo, estado: p.estado,
				asesor: agentName[p.agentId] || '', precio: p.precio, moneda: p.moneda, zona: p.zona, ciudad: p.ciudad,
				direccion: p.direccion, condominio_siglas: p.condominioSiglas, habitaciones: p.habitaciones, banos: p.banos,
				parqueos: p.parqueos, m2_construccion: p.m2Construccion, m2_terreno: p.m2Terreno,
				amenidades: (p.amenidades || []).join('; '), descripcion: p.descripcion, video: p.video,
				socio_noche: s.precioBase, socio_finde: s.precioFinde, margen: s.precioBase ? (s.margen ?? V.MARGEN) : '',
				limpieza: v.limpieza, deposito: v.deposito, noches_min: v.nochesMin, huespedes_max: v.huespedesMax,
				ical: s.icalUrl, socio_nombre: s.nombre, socio_telefono: s.telefono,
				enlaces_fotos: (p.fotos || []).map((f) => f.url).filter(Boolean).join(' '),
				enlace: p.slug ? `https://eqinmobiliario.gt/${p.vip ? 'vip' : 'propiedad'}/${p.slug}/` : '',
				publicado: p.publicado ? 'sí' : 'no'
			};
			filas.push(cab.map((c) => String(val[c] ?? '')));
		}
		downloadCsv(`propiedades-${new Date().toISOString().slice(0, 10)}.csv`, filas);
		toast(`Exportadas ${props.length} propiedades.`);
	} catch (err) {
		showError(err);
	} finally {
		btn.disabled = false;
	}
}

export async function render(container, [id]) {
	if (id === 'importar') return (await import('./importar.js')).render(container);
	if (id && id !== 'incompletos') return renderEditor(container, id);

	const [props, agents] = await Promise.all([loadAll(), loadAgents()]);
	const agentName = Object.fromEntries(agents.map((a) => [a.id, a.nombre]));
	props.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));

	const search = h('input', { class: 'form-control', type: 'search', 'aria-label': 'Buscar propiedades', placeholder: 'Buscar por título, código, zona o residencial…' });
	const fOperacion = h('select', { class: 'form-select', 'aria-label': 'Filtrar por operación' }, h('option', { value: '' }, 'Todas las operaciones'), OPERACIONES.map(([v, l]) => h('option', { value: v }, l)));
	const fEstado = h('select', { class: 'form-select', 'aria-label': 'Filtrar por estado' },
		h('option', { value: '' }, 'Todos los estados'),
		h('optgroup', { label: 'Estado' }, ESTADOS.map(([v, l]) => h('option', { value: v }, l))),
		h('optgroup', { label: 'En la página' },
			h('option', { value: '=visible' }, 'Se ven en la página'),
			h('option', { value: '=cerrada' }, 'Solo con enlace (vendidas y rentadas)'),
			h('option', { value: '=oculta' }, 'Ocultas (pausadas, retiradas y no visibles)')));
	const pasaEstado = (p) => {
		const f = fEstado.value;
		if (!f) return true;
		if (f === '=oculta') return ['oculta', 'borrador'].includes(visibilidadDe(p));
		if (f.startsWith('=')) return visibilidadDe(p) === f.slice(1);
		return estadoDe(p).valor === f;
	};
	const fExtra = h('select', { class: 'form-select', 'aria-label': 'Mostrar' },
		h('option', { value: '' }, 'Todas'),
		h('option', { value: 'publicado' }, 'Publicadas'),
		h('option', { value: 'borrador' }, 'Borradores'),
		h('option', { value: 'vip' }, 'VIP'),
		h('option', { value: 'destacada' }, 'Destacadas'),
		session.isAdmin ? null : h('option', { value: 'mias' }, 'Solo las mías'),
		h('option', { value: 'incompletas' }, 'Con datos por completar'));
	if (id === 'incompletos') fExtra.value = 'incompletas';
	const tbody = h('tbody');
	const count = h('span', { class: 'text-muted small' });

	// Guarda al instante un cambio rápido de la lista y vuelve a dibujar.
	const guardarRapido = async (p, cambios, local, desc, aviso) => {
		try {
			await updateDoc(doc(db, 'properties', p.id), { ...cambios, updatedAt: serverTimestamp(), updatedBy: session.user.uid });
			Object.assign(p, local, { updatedAt: { seconds: Date.now() / 1000 } });
			refrescarPortalesDe([p.id]);
			await markPending(desc);
			toast(aviso);
			if (p.publicado && visibilidadDe(p) === 'oculta') toast(`Sigue oculta porque está «${estadoDe(p).label}». Cámbiala a «Disponible» para mostrarla.`, 'warning');
		} catch (err) {
			showError(err);
		}
		draw();
	};

	const fila = (p) => {
		const editable = canEdit(p);
		const motivo = motivoVisibilidad(p);
		const idSwitch = `visible-${p.id}`;
		const selEstado = h('select', {
			class: 'form-select form-select-sm estado-rapido',
			'aria-label': `Estado de ${p.titulo || 'la propiedad'}`,
			disabled: !editable,
			title: editable ? estadoDe(p).ayuda : 'Solo el asesor responsable o un administrador puede cambiarla.',
			onchange: (e) => {
				const estado = e.target.value;
				const label = estadoDe({ estado }).label;
				e.target.disabled = true;
				guardarRapido(p, cambioDeEstado(estado), { estado }, `Estado de ${p.titulo}: ${label}`,
					`Estado cambiado a «${label}». Recuerda publicar para verlo en el sitio.`);
			}
		}, ESTADOS.map(([v, l]) => h('option', { value: v, selected: estadoDe(p).valor === v }, l)));
		const chk = h('input', {
			class: 'form-check-input', type: 'checkbox', role: 'switch', id: idSwitch,
			checked: Boolean(p.publicado), disabled: !editable,
			'aria-label': `Visible en la página: ${p.titulo || 'la propiedad'}`, 'aria-describedby': `motivo-${p.id}`,
			title: editable ? '' : 'Solo el asesor responsable o un administrador puede cambiarla.',
			onchange: (e) => {
				const publicado = e.target.checked;
				e.target.disabled = true;
				guardarRapido(p, { publicado }, { publicado }, `${publicado ? 'Visible' : 'Oculta'}: ${p.titulo}`,
					publicado ? 'Visible en la página. Recuerda publicar para verlo en el sitio.' : 'Oculta de la página. Recuerda publicar para que salga del sitio.');
			}
		});
		const detener = (e) => e.stopPropagation();
		return h('tr', { class: `clickable${motivo.color === 'success' ? '' : ' fila-oculta'}`, onclick: () => { location.hash = `#/propiedades/${p.id}`; } },
			h('td', {}, p.fotos?.[0]?.url ? h('img', { class: 'thumb', src: p.fotos[0].url, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb thumb-vacia', title: 'Sin fotos' }, h('span', { class: 'icon-camera', 'aria-hidden': 'true' }))),
			h('td', { class: 'celda-titulo' },
				h('div', { class: 'fw-semibold' }, p.titulo || '(sin título)'),
				h('div', { class: 'small text-muted' }, [p.codigo, [p.zona, p.ciudad].filter(Boolean).join(', ')].filter(Boolean).join(' · ')),
				p.vip || p.destacada || faltanDe(p).length ? h('div', { class: 'mt-1 d-flex flex-wrap gap-1' },
					p.vip ? badge('VIP', 'warning') : null,
					p.destacada ? badge('Destacada', 'info') : null,
					chipFaltan(faltanDe(p))) : null),
			h('td', { class: 'text-nowrap celda-precio' },
				h('div', {}, formatPrice(p.precio, p.moneda, p.operacion)),
				h('div', { class: 'small text-muted celda-operacion' }, OPERACION_LABEL[p.operacion] || 'Venta')),
			h('td', { class: 'celda-estado', onclick: detener }, selEstado),
			h('td', { class: 'celda-visible', onclick: detener },
				h('div', { class: 'form-check form-switch mb-1' }, chk,
					h('label', { class: 'form-check-label', for: idSwitch }, 'Visible', h('span', { class: 'd-md-none' }, ' en la página'))),
				h('span', { class: `badge text-bg-${motivo.color} motivo-visibilidad`, id: `motivo-${p.id}` },
					h('span', { class: motivo.icono, 'aria-hidden': 'true' }), ' ', motivo.texto)),
			h('td', { class: 'small celda-asesor' }, agentName[p.agentId] || '—'),
			h('td', { class: 'small text-muted text-nowrap celda-fecha' }, formatDate(p.updatedAt, false)));
	};

	const draw = () => {
		const q = search.value.trim().toLowerCase();
		const rows = props.filter((p) =>
			(!q || `${p.titulo} ${p.codigo || ''} ${p.zona} ${p.direccion} ${p.ciudad}`.toLowerCase().includes(q))
			&& (!fOperacion.value || p.operacion === fOperacion.value)
			&& pasaEstado(p)
			&& (fExtra.value !== 'publicado' || p.publicado)
			&& (fExtra.value !== 'borrador' || !p.publicado)
			&& (fExtra.value !== 'vip' || p.vip)
			&& (fExtra.value !== 'destacada' || p.destacada)
			&& (fExtra.value !== 'mias' || p.agentId === session.agentId)
			&& (fExtra.value !== 'incompletas' || faltanDe(p).length));
		count.textContent = `${rows.length} de ${props.length}`;
		tbody.replaceChildren(...rows.map(fila));
	};
	[search, fOperacion, fEstado, fExtra].forEach((el) => el.addEventListener('input', draw));
	draw();

	mount(container, 
		pageHeader('Propiedades',
			session.isAdmin ? h('a', { href: '#/propiedades/importar', class: 'btn btn-outline-primary' },
				h('span', { class: 'icon-upload', 'aria-hidden': 'true' }), ' Importar desde CSV') : null,
			props.length ? h('button', { type: 'button', class: 'btn btn-outline-primary', onclick: (e) => exportarCsv(props, agentName, e.currentTarget) },
				h('span', { class: 'icon-download', 'aria-hidden': 'true' }), ' Exportar (CSV)') : null,
			h('a', { href: '#/propiedades/nuevo', class: 'btn btn-primary' }, '+ Nueva propiedad')),
		props.length ? h('div', {},
			h('div', { class: 'row g-2 mb-3' },
				h('div', { class: 'col-md-5' }, search),
				h('div', { class: 'col-6 col-md-2' }, fOperacion),
				h('div', { class: 'col-6 col-md-2 order-md-1' }, fExtra),
				h('div', { class: 'col-md-3' }, fEstado)),
			h('div', { class: 'mb-2' }, count),
			h('div', { class: 'card overflow-hidden' }, h('div', { class: 'table-responsive' },
				h('table', { class: 'table table-hover table-admin tabla-propiedades' },
					h('thead', {}, h('tr', {}, ['', 'Propiedad', 'Precio', 'Estado', 'En la página', 'Asesor', 'Actualizada'].map((t) => h('th', {}, t)))),
					tbody))))
			: emptyState('Aún no hay propiedades.', h('a', { href: '#/propiedades/nuevo', class: 'btn btn-primary' }, 'Crear la primera')));
}

function schema(agentOpts, isNew) {
	const vip = (d) => Boolean(d.vip);
	return [
		{ type: 'section', label: 'Datos principales' },
		{ name: 'titulo', label: 'Título', required: true, cols: 8, placeholder: 'Ej. Casa con jardín en Residencial San Antonio' },
		{ name: 'slug', label: 'URL (slug)', cols: 4, help: 'Se genera solo a partir del título. Si la cambias, la URL anterior redirige a la nueva.', ref: (el) => { schema.slugInput = el; } },
		{ name: 'codigo', label: 'Código', cols: 6, placeholder: 'VLM-Z15-JA-001', help: 'Condominio, zona, asesor y número. Si lo dejas vacío, se crea solo al guardar.', ref: (el) => { schema.codigoInput = el; } },
		{ name: 'condominioSiglas', label: 'Siglas del condominio', cols: 6, maxlength: 6, placeholder: 'VLM', help: 'Ej. VLM para Vista de las Lomas. Si lo dejas vacío, se toman del residencial; si no está en condominio, se usa IND.' },
		{ name: 'operacion', label: 'Operación', type: 'select', options: OPERACIONES, cols: 3 },
		{ name: 'tipo', label: 'Tipo', type: 'select', options: TIPOS, cols: 3 },
		{ name: 'estado', label: 'Estado', type: 'select', options: ESTADOS, cols: 3, help: 'Vendida y rentada: solo se abren con su enlace. Pausada y retirada: no se ven en ningún lado.' },
		{ name: 'agentId', label: 'Asesor responsable', type: 'select', options: agentOpts, cols: 3, disabled: !session.isAdmin },
		{ name: 'precio', label: 'Precio', type: 'number', min: 0, step: 1, cols: 4, help: 'Déjalo vacío para mostrar "Precio a consultar".', when: (d) => !esVacacional(d) },
		{ name: 'moneda', label: 'Moneda', type: 'select', options: MONEDAS, cols: 4 },
		{ name: 'orden', label: 'Orden', type: 'number', cols: 4, help: 'Número menor aparece primero.' },
		{ name: 'publicado', label: 'Visible en la página', type: 'checkbox', cols: 4, default: isNew ? false : undefined },
		{ name: 'destacada', label: 'Destacada en la portada', type: 'checkbox', cols: 4 },
		{ name: 'vip', label: 'Propiedad VIP (landing page)', type: 'checkbox', cols: 4 },

		{ type: 'section', label: 'Renta vacacional por noches', when: esVacacional, help: 'El socio pone su precio por noche; la página suma el margen y lo muestra con impuestos aparte.' },
		{ name: 'socio.precioBase', label: 'Precio por noche del socio', type: 'number', min: 0, step: 0.01, cols: 4, when: esVacacional, help: 'Lo que recibe el socio por noche. Privado.' },
		{ name: 'socio.precioFinde', label: 'Precio del socio en fin de semana', type: 'number', min: 0, step: 0.01, cols: 4, when: esVacacional, help: 'Noches de viernes y sábado. Vacío = precio base.' },
		{ name: 'socio.margen', label: 'Margen de la empresa (%)', type: 'number', min: 0, step: 0.5, cols: 4, when: esVacacional, help: 'Por defecto 20 %, sobre todas las noches.' },
		{ name: 'socio.tarifas', label: 'Precios por fechas (temporada, feriados)', type: 'list', itemLabel: 'Tarifa', when: esVacacional, fields: [
			{ name: 'desde', label: 'Primera noche', type: 'date', cols: 4 },
			{ name: 'hasta', label: 'Última noche (incluida)', type: 'date', cols: 4 },
			{ name: 'precio', label: 'Precio del socio por noche', type: 'number', min: 0, step: 0.01, cols: 4 }
		] },
		{ type: 'custom', label: 'Ganancia y precio al público', when: esVacacional, update: desgloseVacacional },
		{ name: 'vacacional.limpieza', label: 'Cargo de limpieza (por estancia)', type: 'number', min: 0, step: 0.01, cols: 4, when: esVacacional, help: 'Se suma al cliente sin margen.' },
		{ name: 'vacacional.deposito', label: 'Depósito reembolsable', type: 'number', min: 0, step: 0.01, cols: 4, when: esVacacional, help: 'Se devuelve; no lleva impuestos.' },
		{ name: 'vacacional.nochesMin', label: 'Noches mínimas', type: 'number', min: 1, step: 1, cols: 2, when: esVacacional },
		{ name: 'vacacional.huespedesMax', label: 'Huéspedes máximos', type: 'number', min: 1, step: 1, cols: 2, when: esVacacional },
		{ name: 'vacacional.checkIn', label: 'Hora de entrada', type: 'select', options: HORAS, default: '15:00', cols: 3, when: esVacacional },
		{ name: 'vacacional.checkOut', label: 'Hora de salida', type: 'select', options: HORAS, default: '11:00', cols: 3, when: esVacacional },
		{ name: 'socio.nombre', label: 'Nombre del socio', cols: 6, when: esVacacional, help: 'Privado: no sale en la página.' },
		{ name: 'socio.telefono', label: 'Teléfono del socio', type: 'tel', cols: 6, when: esVacacional, help: 'Privado.' },
		{ name: 'socio.icalUrl', label: 'Enlace del calendario de Airbnb (iCal, opcional)', type: 'url', when: esVacacional, placeholder: 'https://www.airbnb.com/calendar/ical/….ics', help: 'En Airbnb: Calendario → Disponibilidad → Conectar calendarios → Exportar. Privado: la página solo muestra qué noches están ocupadas.' },
		{ name: 'vacacional.bloqueos', label: 'Fechas ocupadas (además de Airbnb)', type: 'list', itemLabel: 'Bloqueo', when: esVacacional, fields: [
			{ name: 'desde', label: 'Llegada (primera noche ocupada)', type: 'date', cols: 6 },
			{ name: 'hasta', label: 'Salida (ese día queda libre)', type: 'date', cols: 6 }
		] },

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

		{ type: 'section', label: 'Versión en inglés (mercado de EE. UU.)', help: 'Se llena sola al guardar y se actualiza cuando cambias el título o la descripción en español. Si corriges algo aquí a mano, se respeta y ya no se reemplaza (para volver a traducir, usa "EN · Traducir al inglés" arriba). La traducción es automática: revísala antes de publicar.' },
		{ name: 'en.titulo', label: 'Title (English)', cols: 12 },
		{ name: 'en.descripcion', label: 'Description (English)', type: 'markdown', rows: 6 },
		{ name: 'en.amenidades', label: 'Amenities (English)', type: 'tags' },
		{ name: 'en.vipLanding.titular', label: 'VIP headline (English)', cols: 6, when: vip },
		{ name: 'en.vipLanding.ctaTexto', label: 'VIP button (English)', cols: 6, when: vip },
		{ name: 'en.vipLanding.subtitular', label: 'VIP subtitle (English)', type: 'textarea', rows: 2, when: vip },
		{ name: 'en.vipLanding.puntosClave', label: 'VIP highlights (English)', type: 'tags', when: vip },
		{ name: 'en.seo.titulo', label: 'Google title (English)', maxlength: 70, cols: 6 },
		{ name: 'en.seo.descripcion', label: 'Google description (English)', maxlength: 160, cols: 6 },

		{ type: 'section', label: 'SEO (opcional)', help: 'Si los dejas vacíos se generan automáticamente.' },
		{ name: 'seo.titulo', label: 'Título para Google', maxlength: 70, cols: 12 },
		{ name: 'seo.descripcion', label: 'Descripción para Google', type: 'textarea', rows: 2, maxlength: 160 },
		seoPreviewField({
			title: (d) => (d.vip ? d.seo?.titulo || `${d.vipLanding?.titular || d.titulo || ''} | Propiedad exclusiva` : d.seo?.titulo || autoTitle(d)),
			description: (d) => d.seo?.descripcion || (d.vip && d.vipLanding?.subtitular) || autoDescription(d),
			path: (d) => `${d.vip ? '/vip/' : '/propiedad/'}${slugify(d.slug || d.titulo || '')}/`,
			checks: (d) => [
				[(d.fotos || []).length >= 5, `${(d.fotos || []).length} fotos (recomendado: 5 o más).`],
				[(d.fotos || []).length > 0 && d.fotos.every((f) => f.alt), 'Todas las fotos tienen descripción.'],
				[stripMd(d.descripcion).split(/\s+/).filter(Boolean).length >= 80, 'Descripción de al menos 80 palabras (Google premia el contenido original).'],
				[Boolean(d.zona), 'Tiene zona (aparece en las búsquedas por zona).']
			]
		})
	];
}

async function renderEditor(container, id) {
	const isNew = id === 'nuevo';
	const ref = isNew ? doc(collection(db, 'properties')) : doc(db, 'properties', id);
	const [snap, agentOpts, all] = await Promise.all([isNew ? null : getDoc(ref), agentOptions(), loadAll()]);
	if (!isNew && !snap.exists()) {
		mount(container, emptyState('La propiedad no existe.', h('a', { href: '#/propiedades', class: 'btn btn-primary' }, 'Volver')));
		return;
	}
	const data = isNew ? datosIniciales() : snap.data();
	// Datos privados del socio (renta vacacional). Si no hay permiso o no existe, queda vacío.
	const privRef = doc(db, 'properties', ref.id, 'privado', 'socio');
	let socioGuardado = null;
	if (!isNew && data.operacion === 'vacacional') {
		try { const ps = await getDoc(privRef); socioGuardado = ps.exists() ? ps.data() : null; } catch { socioGuardado = null; }
	}

	if (!isNew && !canEdit(data)) {
		mount(container, pageHeader(data.titulo, h('a', { href: '#/propiedades', class: 'btn btn-light' }, 'Volver')),
			h('div', { class: 'alert alert-info' }, 'Esta propiedad pertenece a otro asesor; solo puedes verla.'),
			h('a', { href: publicUrl(data), target: '_blank', class: 'btn btn-outline-primary' }, 'Ver en el sitio'));
		return;
	}
	if (!session.isAdmin && !session.agentId) {
		mount(container, h('div', { class: 'alert alert-warning' }, 'Tu usuario no está vinculado a un asesor. Pide a un administrador que lo vincule en "Usuarios".'));
		return;
	}

	let slugTouched = Boolean(data.slug);
	const datosForm = { ...data, socio: { margen: V.MARGEN, ...(socioGuardado || {}) }, vacacional: { nochesMin: 1, huespedesMax: 2, checkIn: '15:00', checkOut: '11:00', ...(data.vacacional || {}) } };
	const form = renderForm(schema(agentOpts, isNew), datosForm, { folder: `properties/${ref.id}` });
	const slugInput = schema.slugInput;
	slugInput.addEventListener('input', () => { slugTouched = true; });
	form.el.querySelector('input')?.addEventListener('input', (e) => {
		if (!slugTouched) {
			slugInput.value = slugify(e.target.value);
			form.state.slug = slugInput.value;
		}
	});

	// Código: botón «Sugerir» y aviso si ya lo usa otra propiedad.
	const agentes = await loadAgents();
	const codigosUsados = () => all.filter((p) => p.id !== ref.id && p.codigo).map((p) => p.codigo);
	const codigoInput = schema.codigoInput;
	const avisoCodigo = h('div', { class: 'invalid-feedback' });
	const revisarCodigo = () => {
		const c = normalizarCodigo(codigoInput.value);
		const otra = c && all.find((p) => p.id !== ref.id && normalizarCodigo(p.codigo) === c);
		codigoInput.classList.toggle('is-invalid', Boolean(otra));
		avisoCodigo.textContent = otra ? `Ya lo usa «${otra.titulo || 'otra propiedad'}».` : '';
		return !otra;
	};
	codigoInput.addEventListener('input', revisarCodigo);
	codigoInput.addEventListener('change', () => {
		codigoInput.value = normalizarCodigo(codigoInput.value);
		form.state.codigo = codigoInput.value;
		revisarCodigo();
	});
	const sugerir = h('button', {
		type: 'button', class: 'btn btn-outline-primary', title: 'Sugerir un código con el condominio, la zona y el asesor',
		onclick: () => {
			codigoInput.value = generarCodigo(form.getData(), { agentes, codigos: codigosUsados() });
			codigoInput.dispatchEvent(new Event('input'));
		}
	}, h('span', { class: 'icon-magic', 'aria-hidden': 'true' }), ' Sugerir');
	const grupoCodigo = h('div', { class: 'input-group has-validation' });
	codigoInput.replaceWith(grupoCodigo);
	grupoCodigo.append(codigoInput, sugerir, avisoCodigo);
	revisarCodigo();

	// Traduce (sin IA: diccionario, plantillas y traductor gratuito) los textos en español y devuelve la versión en inglés.
	// "fuente" guarda el texto en español traducido, para saber si cambió después.
	const fuenteEs = (d) => `${d.titulo || ''}\n${d.descripcion || ''}`;
	const traducirEn = async (d) => {
		const datos = { ...d };
		delete datos.fotos; delete datos.en; delete datos.createdAt; delete datos.updatedAt; delete datos.socio;
		delete datos.estadoFecha; delete datos.historialEstado; delete datos.historialPrecio;
		const r = await pedirIA('traducir', { propiedad: datos });
		return {
			titulo: r.titulo || '', descripcion: r.descripcion || '', amenidades: r.amenidades || [],
			seo: { titulo: r.seoTitulo || '', descripcion: r.seoDescripcion || '' },
			vipLanding: { titular: r.vipTitular || '', subtitular: r.vipSubtitular || '', puntosClave: r.puntosClave || [], ctaTexto: r.ctaTexto || '' },
			fuente: fuenteEs(d),
			manual: false
		};
	};
	const textoEn = (en) => JSON.stringify([en?.titulo || '', en?.descripcion || '', en?.amenidades || [], en?.seo || {}, en?.vipLanding || {}]);

	const recargar = async () => {
		const view = document.getElementById('view').firstElementChild;
		view.replaceChildren();
		await render(view, [ref.id]);
	};

	const save = async (btn) => {
		if (!form.validate()) return;
		const d = form.getData();
		// Lo del socio nunca va al documento público (ni a la traducción).
		const socio = d.socio || {};
		delete d.socio;
		if (esVacacional(d)) {
			if (!(Number(socio.precioBase) > 0)) return toast('Escribe el precio por noche del socio.', 'warning');
			Object.assign(d, vacacionalPublico({ ...d, socio }));
		} else {
			delete d.vacacional;
		}
		d.slug = slugify(d.slug || d.titulo);
		if (!d.slug) return toast('Escribe un título.', 'warning');
		const clash = all.find((p) => p.id !== ref.id && p.slug === d.slug);
		if (clash) return toast(`La URL "${d.slug}" ya la usa "${clash.titulo}". Cámbiala.`, 'warning');
		if (!session.isAdmin) d.agentId = session.agentId;
		// Código único: si está vacío en una propiedad nueva, se genera.
		d.codigo = normalizarCodigo(d.codigo);
		d.condominioSiglas = normalizarCodigo(d.condominioSiglas).replace(/-/g, '');
		if (!d.codigo && isNew) d.codigo = generarCodigo(d, { agentes, codigos: codigosUsados() });
		const otraCodigo = d.codigo && all.find((p) => p.id !== ref.id && normalizarCodigo(p.codigo) === d.codigo);
		if (otraCodigo) {
			codigoInput.value = d.codigo;
			revisarCodigo();
			codigoInput.focus();
			return toast(`El código ${d.codigo} ya lo usa «${otraCodigo.titulo}». Cámbialo o usa «Sugerir».`, 'warning');
		}
		// Si cambia la URL, se guarda la anterior para redirigirla (no se pierde el posicionamiento).
		if (!isNew && data.slug && data.slug !== d.slug) {
			d.slugsAnteriores = [...new Set([...(data.slugsAnteriores || []), data.slug])].filter((s) => s !== d.slug);
		}
		// Fecha e historial del estado (setDoc reemplaza el documento: el historial se arma completo).
		d.estado = estadoDe(d).valor;
		d.historialEstado = data.historialEstado || [];
		if (isNew || estadoDe(data).valor !== d.estado) {
			d.estadoFecha = serverTimestamp();
			d.historialEstado = [...d.historialEstado, entradaHistorial(d.estado)];
		} else if (data.estadoFecha) {
			d.estadoFecha = data.estadoFecha;
		}
		// Historial de precio (se muestra al propietario en su portal).
		d.historialPrecio = data.historialPrecio || [];
		const precioNuevo = Number(d.precio) || 0;
		const ultimo = d.historialPrecio[d.historialPrecio.length - 1];
		if (precioNuevo && (!ultimo || Number(ultimo.precio) !== precioNuevo || ultimo.moneda !== d.moneda)) {
			if (!ultimo && !isNew && Number(data.precio) && Number(data.precio) !== precioNuevo) {
				d.historialPrecio.push({ precio: Number(data.precio), moneda: data.moneda || 'USD', fecha: data.createdAt || Timestamp.now() });
			}
			const sinCambio = !ultimo && !isNew && Number(data.precio) === precioNuevo;
			d.historialPrecio = [...d.historialPrecio, { precio: precioNuevo, moneda: d.moneda || 'USD', fecha: (sinCambio && data.createdAt) || Timestamp.now() }];
		}
		d.updatedAt = serverTimestamp();
		d.updatedBy = session.user.uid;
		if (isNew) {
			d.createdAt = serverTimestamp();
			d.createdBy = session.user.uid;
		}
		// Versión en inglés automática: si alguien la corrigió a mano, se respeta.
		d.en = d.en || {};
		if (d.en.titulo && textoEn(d.en) !== textoEn(data.en)) d.en.manual = true;
		const traducirAhora = Boolean(d.titulo) && (!String(d.en.titulo || '').trim() || (!d.en.manual && d.en.fuente !== fuenteEs(d)));
		btn.disabled = true;
		try {
			await setDoc(ref, d);
			if (esVacacional(d)) {
				await setDoc(privRef, {
					precioBase: Number(socio.precioBase) || 0, precioFinde: Number(socio.precioFinde) || 0,
					margen: socio.margen === null || socio.margen === undefined || socio.margen === '' ? V.MARGEN : Number(socio.margen),
					tarifas: (socio.tarifas || []).filter((t) => t.desde && t.hasta && Number(t.precio) > 0).map((t) => ({ desde: t.desde, hasta: t.hasta, precio: Number(t.precio) })),
					nombre: socio.nombre || '', telefono: socio.telefono || '', icalUrl: String(socio.icalUrl || '').trim(),
					updatedAt: serverTimestamp(), updatedBy: session.user.uid
				});
			}
			if (!isNew) refrescarPortalesDe([ref.id]);
			await form.flushDeletes();
			await markPending(`Propiedad: ${d.titulo}`);
			if (!traducirAhora) {
				toast('Propiedad guardada. Recuerda publicar para ver los cambios en el sitio.');
				if (isNew) location.hash = `#/propiedades/${ref.id}`;
				return;
			}
			btn.textContent = 'Traduciendo al inglés…';
			try {
				await updateDoc(ref, { en: await traducirEn(d), updatedAt: serverTimestamp() });
				toast('Propiedad guardada y traducida al inglés. Recuerda publicar para ver los cambios en el sitio.');
			} catch (err) {
				toast('Propiedad guardada, pero no se pudo traducir al inglés. Vuelve a guardar o usa "EN · Traducir al inglés".', 'warning');
			}
			if (isNew) location.hash = `#/propiedades/${ref.id}`;
			else await recargar();
		} catch (err) {
			showError(err);
		} finally {
			btn.disabled = false;
			btn.textContent = 'Guardar';
		}
	};

	const remove = async () => {
		if (!(await confirmDialog(`¿Eliminar "${data.titulo}"? Se borrarán también sus fotos. Esta acción no se puede deshacer.`, { okText: 'Eliminar' }))) return;
		try {
			if (data.operacion === 'vacacional') await deleteDoc(privRef).catch(() => {});
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
				codigo: generarCodigo(data, { agentes, codigos: all.map((p) => p.codigo).filter(Boolean) }),
				publicado: false,
				destacada: false,
				estado: estadoDe(data).valor,
				estadoFecha: serverTimestamp(),
				historialEstado: [entradaHistorial(estadoDe(data).valor)],
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

	// Botón manual: vuelve a traducir todo (reemplaza correcciones hechas a mano).
	const traducir = async (btn) => {
		btn.disabled = true;
		btn.textContent = 'Traduciendo…';
		try {
			const datos = form.getData();
			await updateDoc(ref, { en: await traducirEn(datos), updatedAt: serverTimestamp() });
			await markPending(`Traducción al inglés: ${datos.titulo}`);
			toast('Versión en inglés lista. Revísala abajo y publica.');
			await recargar();
		} catch (err) {
			showError(err);
			btn.disabled = false;
			btn.textContent = 'EN · Traducir al inglés';
		}
	};

	const saveBtn = h('button', { class: 'btn btn-primary', onclick: (e) => save(e.currentTarget) }, 'Guardar');
	mount(container, 
		pageHeader(isNew ? 'Nueva propiedad' : data.titulo,
			!isNew ? h('a', { href: `#/difusion/${id}`, class: 'btn btn-outline-primary' }, '📣 Difundir en portales') : null,
			!isNew ? h('a', { href: `#/ia/redactar/${id}`, class: 'btn btn-outline-primary' }, 'Armar borrador de ficha') : null,
			!isNew ? h('button', { class: 'btn btn-outline-primary', type: 'button', onclick: (e) => traducir(e.currentTarget) }, 'EN · Traducir al inglés') : null,
			!isNew && data.publicado ? h('a', { href: publicUrl(data), target: '_blank', class: 'btn btn-outline-primary' }, 'Ver en el sitio') : null,
			h('a', { href: '#/propiedades', class: 'btn btn-light' }, 'Volver')),
		!isNew ? h('p', { class: 'small text-muted' }, `Última actualización: ${formatDate(data.updatedAt)}`) : null,
		vigilarFormulario(form, 'propiedades'),
		h('div', { class: 'card' }, h('div', { class: 'card-body' }, form.el)),
		h('div', { class: 'sticky-actions' },
			saveBtn,
			h('a', { href: '#/propiedades', class: 'btn btn-light' }, 'Cancelar'),
			!isNew ? h('button', { class: 'btn btn-outline-secondary', onclick: (e) => duplicate(e.currentTarget) }, 'Duplicar') : null,
			!isNew && session.isAdmin ? h('button', { class: 'btn btn-outline-danger ms-auto', onclick: remove }, 'Eliminar') : null));
}

export { spinner };
