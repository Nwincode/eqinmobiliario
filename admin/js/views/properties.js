import {
	db, doc, getDoc, getDocs, setDoc, deleteDoc, collection, serverTimestamp, arrayUnion, Timestamp
} from '../firebase.js';
import {
	h, toast, showError, confirmDialog, pageHeader, badge, emptyState, formatPrice, formatDate, slugify, spinner
, mount, downloadCsv, cajaTabla, iconoBtn, menuMas, modal } from '../ui.js';
import { renderForm, deleteImage, uploadImage, procesarImagen, getPath, clonar } from '../form.js';
import { session, agentOptions, loadAgents, markPending } from '../session.js';
import { seoPreviewField, stripMd } from '../seo.js';
import { autoSeoTitle, autoSeoDescripcion, huespedesDe, recortar, resumenSeo } from '../seo-auto.js';
import { pedirIA } from '../ia.js';
import { tituloEn, tituloEnViejo } from '../reglas.js';
import { updateDoc } from '../firebase.js';
import { ESTADOS_PROPIEDAD, amenidadesPara, mascotasUnaVez, estadosPara, tipoAplica, OPERACIONES, operacionDe, estadoDe, visibilidadDe } from '../estados.js';
import { generarCodigo, normalizarCodigo, siglasCondominio, PLANTILLA } from '../importar.js';
import { revisar, chipFaltan, vigilarFormulario } from '../pendientes.js';
import { refrescarPortalesDe } from '../portal.js';
import { generarDescripcion } from '../descripcion.js';
import { miles, dinero, whatsappUrl } from '../formato.js';
import { datosDe } from '../ficha-casa.js';
import { sinTildes, REGIMENES, MODOS } from '../cotizacion.js';
import { acuerdoDe, acuerdoHeredado, camposDelAcuerdo, CAMPOS_ACUERDO } from '../acuerdo.js';
import { loadPropietarios } from '../crm.js';
import { asignarDueno } from '../enlace-dueno.js';
import { tieneCasasPorNoche } from '../duenos.js';
import '/js/calc-vacacional.js';

const V = window.EQVacacional;

const faltanDe = (p) => revisar('propiedades', p);

// Mismo SEO automático que usa el generador del sitio (admin/js/seo-auto.js).
const autoTitle = (d) => autoSeoTitle(d);
const autoDescription = (d) => autoSeoDescripcion(d, formatPrice(d.precio, d.moneda, d.operacion), [
	d.habitaciones && `${d.habitaciones} ${Number(d.habitaciones) === 1 ? 'habitación' : 'habitaciones'}`,
	d.banos && `${d.banos} ${Number(d.banos) === 1 ? 'baño' : 'baños'}`,
	huespedesDe(d) ? `${huespedesDe(d)} ${huespedesDe(d) === 1 ? 'huésped' : 'huéspedes'}` : d.m2Construccion && `${miles(d.m2Construccion)} m²`
]);
// Llena el SEO en español si está vacío o si todavía es el que se puso solo (así se actualiza al cambiar la ficha).
function llenarSeo(d) {
	const seo = { ...(d.seo || {}) };
	const auto = seo.auto || {};
	if (!String(seo.titulo || '').trim() || seo.titulo === auto.titulo) seo.titulo = auto.titulo = autoTitle(d);
	if (!String(seo.descripcion || '').trim() || seo.descripcion === auto.descripcion) seo.descripcion = auto.descripcion = autoDescription(d);
	seo.auto = auto;
	d.seo = seo;
}
// Descripción de cada foto para Google: si está vacía se pone «Título – foto N». Lo escrito a mano se respeta.
// Devuelve true si cambió alguna.
function llenarAltFotos(d) {
	const titulo = String(d.titulo || '').trim();
	if (!titulo || !(d.fotos || []).some((f) => !String(f.alt || '').trim())) return false;
	d.fotos = d.fotos.map((f, i) => (String(f.alt || '').trim() ? f : { ...f, alt: `${titulo} – foto ${i + 1}` }));
	return true;
}


// Borra del almacenamiento las fotos de una propiedad eliminada (también la versión sin marca
// de agua y la portada VIP si se subió a su carpeta).
async function borrarFotos(p) {
	const paths = [];
	for (const f of p.fotos || []) paths.push(f.path, f.sinMarca);
	const vip = p.vipLanding?.portada || '';
	const m = vip.match(/\/o\/([^?]+)/);
	if (m && decodeURIComponent(m[1]).startsWith(`properties/${p.id}/`)) paths.push(decodeURIComponent(m[1]));
	await Promise.all(paths.filter(Boolean).map((x) => deleteImage(x).catch(() => {})));
}

// Pone la marca de agua a las fotos ya subidas que no la tienen. Sube una copia nueva con marca
// y guarda la ruta de la original en «sinMarca». Devuelve la galería nueva, o null si no cambió nada.
// Traduce (sin IA: diccionario, plantillas y traductor gratuito) los textos en español y devuelve la versión en inglés.
// "fuente" guarda el texto en español traducido, para saber si cambió después.
// Las casas vacacionales suman cómo llegar, reglas y cancelación (solo si los tienen).
const TEXTOS_VAC = ['comoLlegar', 'reglas', 'cancelacion'];
export const fuenteEs = (d) => [d.titulo || '', d.descripcion || '', ...TEXTOS_VAC.map((k) => d.vacacional?.[k]).filter(Boolean)].join('\n');
// ¿Hay que traducir? Falta el inglés, o el español cambió y el inglés no se corrigió a mano.
export const faltaIngles = (d) => {
	const en = d.en || {};
	return Boolean(d.titulo) && (!String(en.titulo || '').trim() || (!en.manual && (!String(en.descripcion || '').trim() || en.fuente !== fuenteEs(d))));
};
// La dirección en inglés sale del título: al cambiarlo se guarda el anterior para redirigir.
const titulosEnAnteriores = (en, titulo) => [...new Set([...(en?.slugsAnteriores || []), en?.slug ? '' : en?.titulo])].filter((t) => t && t !== titulo);
export async function traducirEn(d) {
	const datos = { ...d };
	delete datos.fotos; delete datos.en; delete datos.createdAt; delete datos.updatedAt; delete datos.socio; delete datos.acuerdo;
	delete datos.estadoFecha; delete datos.historialEstado; delete datos.historialPrecio;
	const r = await pedirIA('traducir', { propiedad: datos });
	return {
		titulo: r.titulo || '', descripcion: r.descripcion || '', amenidades: r.amenidades || [],
		seo: {
			titulo: r.seoTitulo || (r.titulo ? autoSeoTitle({ ...d, titulo: r.titulo }, true) : ''),
			descripcion: r.seoDescripcion || recortar(resumenSeo(r.descripcion), 155)
		},
		vipLanding: { titular: r.vipTitular || '', subtitular: r.vipSubtitular || '', puntosClave: r.puntosClave || [], ctaTexto: r.ctaTexto || '' },
		vacacional: Object.fromEntries(TEXTOS_VAC.map((k) => [k, r[k] || ''])),
		slugsAnteriores: titulosEnAnteriores(d.en, r.titulo),
		fuente: fuenteEs(d),
		manual: false
	};
}

async function marcarFotos(p, progreso) {
	const fotos = p.fotos || [];
	const faltan = fotos.filter((f) => !f.marca && f.url);
	if (!faltan.length) return null;
	const nuevas = [];
	let i = 0;
	for (const f of fotos) {
		if (f.marca || !f.url) { nuevas.push(f); continue; }
		progreso(++i, faltan.length);
		const res = await fetch(f.url, { mode: 'cors' });
		if (!res.ok) throw new Error(`No se pudo descargar una foto de ${p.titulo || p.id}`);
		const blob = await res.blob();
		const nombre = (f.path || 'foto').split('/').pop().replace(/^\d+-/, '');
		const file = new File([blob], nombre, { type: blob.type || 'image/webp' });
		const proc = await procesarImagen(file, undefined, undefined, { marca: true });
		if (!proc.marca) throw new Error('No se pudo poner la marca de agua.');
		const up = await uploadImage(file, `properties/${p.id}`, proc);
		nuevas.push({ ...f, url: up.url, path: up.path, ancho: up.ancho, alto: up.alto, marca: true, sinMarca: f.path || '' });
	}
	return nuevas;
}

export const TIPOS = [['casa', 'Casa'], ['apartamento', 'Apartamento'], ['terreno', 'Terreno'], ['oficina', 'Oficina'], ['local', 'Local comercial'], ['bodega', 'Bodega'], ['finca', 'Finca']];
// La lista de operaciones vive en estados.js; se reexporta para quien ya la importa de aquí.
export { OPERACIONES };
const esVacacional = (d) => d.operacion === 'vacacional';
const HORAS = Array.from({ length: 24 }, (_, i) => { const hh = `${String(i).padStart(2, '0')}:00`; return [hh, hh]; });

// Renta vacacional. Lo privado (costo del socio, margen, contacto, enlace iCal) vive en
// properties/{id}/privado/socio, que solo lee el equipo. En el documento público solo quedan
// los precios por noche al público (base, fin de semana y tarifas por fechas) y las fechas ocupadas.
const hoyISO = () => V.hoy();
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
			camas: Math.max(0, Math.floor(Number(v.camas) || 0)), mascotas: v.mascotas || '',
			comoLlegar: v.comoLlegar || '', reglas: v.reglas || '', cancelacion: v.cancelacion || '',
			bloqueos,
			// Mínimos de noches por fechas: los pone el dueño en «Mis propiedades»; aquí solo se conservan.
			minimos: v.minimos || [],
			// Reservas confirmadas: las escribe Rentas vacacionales; aquí solo se conservan.
			reservadas: V.unirRangos(v.reservadas || [])
		}
	};
}
function desgloseVacacional(el, d) {
	const s = d.socio || {};
	const moneda = d.moneda || 'USD';
	const m = (n) => dinero(n, moneda);
	const filas = [['Precio base', s.precioBase], ['Fin de semana (viernes y sábado)', s.precioFinde]]
		.concat((s.tarifas || []).filter((t) => t.precio).map((t) => [`Tarifa ${t.desde || '…'} al ${t.hasta || '…'}`, t.precio]))
		.filter(([, p]) => Number(p) > 0);
	if (!filas.length) {
		el.replaceChildren(h('p', { class: 'small text-muted mb-0' }, 'Escribe el precio por noche del socio para ver la ganancia y el precio al público.'));
		return;
	}
	const pub = V.planPublico(planSocioDe(s), s.margen);
	const ejemplo = V.gananciaEstancia({ planSocio: planSocioDe(s), margen: s.margen, llegada: hoyISO(), salida: V.sumarDias(hoyISO(), 7) });
	el.replaceChildren(cajaTabla(h('table', { class: 'table table-sm align-middle mb-2 tabla-vacacional' },
		// En el orden en que se arma el precio: lo del socio, la ganancia, el precio, cada impuesto y lo que paga el cliente.
		h('thead', {}, h('tr', {}, ['Noche', 'Socio', `Ganancia ${V.r2(s.margen ?? V.MARGEN)} %`, 'Precio sin impuestos', `IVA ${V.IVA} %`, `INGUAT ${V.INGUAT} %`, 'El cliente paga']
			.map((t, i) => h('th', { scope: 'col', class: i ? 'text-end' : null }, t)))),
		h('tbody', {}, filas.map(([nombre, p]) => {
			const n = V.desgloseNoche(p, s.margen);
			return h('tr', {}, h('td', {}, nombre), [n.precioSocio, n.ganancia, n.nochePublica, n.iva, n.inguat].map((x) => h('td', { class: 'text-end' }, m(x))),
				h('td', { class: 'text-end fw-semibold' }, m(n.nocheConImpuestos)));
		})))),
	h('p', { class: 'small text-muted mb-0' },
		`En la página se publica "desde ${m(V.precioDesde(pub, hoyISO()))} por noche" + impuestos (IVA ${V.IVA} % e INGUAT ${V.INGUAT} %). `,
		`Ejemplo de 7 noches desde hoy: el socio recibe ${m(ejemplo.costoSocio)} y la ganancia es ${m(ejemplo.ganancia)}. `,
		'La limpieza se cobra aparte sin margen y el depósito no lleva impuestos. Solo el equipo ve esta tabla.'));
}
export const ESTADOS = ESTADOS_PROPIEDAD.map((e) => [e.valor, e.label]);
// Amenidades de un toque en el editor; la ficha les pone su ícono.
export const MONEDAS = [['USD', 'Dólares (US$)'], ['GTQ', 'Quetzales (Q)']];

// Valores de una propiedad nueva (editor e importación).
export function datosIniciales() {
	return { operacion: 'venta', tipo: 'casa', estado: 'disponible', moneda: 'USD', ciudad: 'Guatemala', publicado: false, agentId: session.isAdmin ? '' : session.agentId, fotos: [], amenidades: [], vipLanding: {}, seo: {} };
}

// Lo que lleva toda propiedad al nacer: su historial de estado y de precio empezado y quién la creó.
// Una sola para todo el panel: la usan la ficha (al guardar una nueva) y el importador.
export function propiedadNueva(datos) {
	const d = { ...datosIniciales(), descripcion: '', ...datos };
	d.estado = estadoDe(d).valor;
	d.estadoFecha = serverTimestamp();
	d.historialEstado = [entradaHistorial(d.estado)];
	d.historialPrecio = Number(d.precio) ? [{ precio: Number(d.precio), moneda: d.moneda || 'USD', fecha: Timestamp.now() }] : [];
	d.createdAt = d.updatedAt = serverTimestamp();
	d.createdBy = d.updatedBy = session.user.uid;
	return d;
}
// Borra una propiedad con todo lo suyo: lo privado (socio, llegada, acuerdo), el documento y sus fotos.
// Una sola para todo el panel: la usan la ficha y el listado.
export async function eliminarPropiedad(p) {
	for (const privado of ['socio', 'llegada', 'acuerdo']) await deleteDoc(doc(db, 'properties', p.id, 'privado', privado)).catch(() => {});
	await deleteDoc(doc(db, 'properties', p.id));
	await borrarFotos(p);
}
// URL libre a partir del título («usados» es un Set que se va llenando).
export function slugLibre(titulo, usados) {
	const base = slugify(titulo) || 'propiedad';
	let s = base, n = 2;
	while (usados.has(s)) s = `${base}-${n++}`;
	usados.add(s);
	return s;
}
// Lo privado de una casa por noche: el costo del socio y los datos de llegada (dirección y mapa).
// Va después de crear la casa: su regla la lee.
export async function guardarPrivadoVacacional(id, socio, llegada) {
	const sello = { updatedAt: serverTimestamp(), updatedBy: session.user.uid };
	await setDoc(doc(db, 'properties', id, 'privado', 'socio'), { ...socio, ...sello });
	await setDoc(doc(db, 'properties', id, 'privado', 'llegada'), { ...llegada, ...sello });
}

export function publicUrl(p) {
	return `${p.vip ? '/vip/' : '/propiedad/'}${p.slug}/`;
}

export async function loadAll() {
	const snap = await getDocs(collection(db, 'properties'));
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Casa por noche que todavía trae la dirección o el mapa en su documento público (guardada antes de que fueran
// privados): pasan a privado/llegada. Primero se guarda lo privado; después se vacía lo público.
async function privatizarLlegada(p) {
	const llegadaRef = doc(db, 'properties', p.id, 'privado', 'llegada');
	const antes = (await getDoc(llegadaRef)).data() || {};
	await setDoc(llegadaRef, { direccion: antes.direccion || p.direccion || '', mapa: antes.mapa || p.mapa || '', updatedAt: serverTimestamp(), updatedBy: session.user.uid });
	const cambios = { direccion: '', mapa: '' };
	// Un título en inglés armado con la dirección se descarta: se vuelve a traducir solo.
	if (p.direccion && JSON.stringify(p.en || {}).includes(p.direccion)) cambios.en = {};
	await updateDoc(doc(db, 'properties', p.id), cambios);
	Object.assign(p, cambios);
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
		case 'borrador': return { texto: 'Oculta', color: 'secondary', icono: 'icon-eye-slash', obvio: true };
		case 'cerrada': return { texto: `Solo con enlace: ${corto(e)}`, color: 'warning', icono: 'icon-link' };
		case 'oculta': return { texto: `Oculta: ${corto(e)}`, color: 'danger', icono: 'icon-eye-slash' };
		default: return { texto: 'Publicada', color: 'success', icono: 'icon-eye', obvio: true };
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
				niveles: p.niveles, anio_construccion: p.anioConstruccion, mantenimiento: p.mantenimiento,
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
	const porPrivatizar = props.filter((p) => esVacacional(p) && (p.direccion || p.mapa) && canEdit(p));
	if (porPrivatizar.length) {
		try {
			for (const p of porPrivatizar) await privatizarLlegada(p);
			await markPending('Dirección de casas por noche: pasó a privada');
		} catch (err) { console.warn(err); }
	}
	const agentName = Object.fromEntries(agents.map((a) => [a.id, a.nombre]));
	props.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));

	const search = h('input', { class: 'form-control', type: 'search', 'aria-label': 'Buscar propiedades', placeholder: 'Buscar título, código o zona…' });
	const fOperacion = h('select', { class: 'form-select', 'aria-label': 'Filtrar por operación' }, h('option', { value: '' }, 'Venta y renta'), OPERACIONES.map(([v, l]) => h('option', { value: v }, l)));
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
		h('option', { value: '' }, 'Mostrar todas'),
		h('option', { value: 'publicado' }, 'Publicadas'),
		h('option', { value: 'borrador' }, 'Borradores'),
		h('option', { value: 'vip' }, 'VIP'),
		h('option', { value: 'destacada' }, 'Destacadas'),
		session.isAdmin ? null : h('option', { value: 'mias' }, 'Solo las mías'),
		h('option', { value: 'incompletas' }, 'Con datos por completar'));
	if (id === 'incompletos') fExtra.value = 'incompletas';
	const tbody = h('tbody');
	const count = h('span', { class: 'text-muted small' });
	const vacio = h('p', { class: 'text-center text-muted py-4 mb-0 prop-vacio', hidden: true }, 'Ninguna propiedad coincide con la búsqueda o los filtros.');

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

	const fila = (p, i) => {
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
		const lugar = [p.zona, p.ciudad].filter(Boolean).join(', ');
		const datos = datosDe(p);
		const sel = h('input', {
			class: 'form-check-input', type: 'checkbox', checked: seleccion.has(p.id), disabled: !editable,
			'aria-label': `Seleccionar ${p.titulo || 'la propiedad'}`,
			onchange: (e) => { e.target.checked ? seleccion.add(p.id) : seleccion.delete(p.id); pintarBarra(); }
		});
		const nombre = p.titulo || 'la propiedad';
		const enSitio = p.publicado && p.slug;
		const menu = menuMas(`Acciones de ${nombre}`, [
			editable && { icono: 'icon-pencil', texto: 'Editar', href: `#/propiedades/${p.id}` },
			enSitio && { icono: 'icon-whatsapp', texto: 'Compartir por WhatsApp', target: '_blank',
				href: whatsappUrl('', `${p.titulo || 'Propiedad'} — ${formatPrice(p.precio, p.moneda, p.operacion)}\nhttps://eqinmobiliario.gt${publicUrl(p)}`) },
			enSitio && { icono: 'icon-external-link', texto: 'Ver en la página', target: '_blank', href: publicUrl(p) },
			editable && { icono: 'icon-list-ul', texto: 'Mejorar descripción', onclick: () => mejorar([p]) },
			editable && { icono: 'icon-search', texto: 'Completar SEO', onclick: () => completarSeo([p]) },
			editable && { icono: 'icon-globe', texto: 'Traducir al inglés', onclick: () => traducir([p]) },
			session.isAdmin && { icono: 'icon-trash-o', texto: 'Eliminar', peligro: true, onclick: () => eliminar([p]) }
		]);
		// Tocar la fila abre la ficha, salvo en el menú ⋮ (que abre sus acciones).
		return h('tr', { class: `clickable${motivo.color === 'success' ? '' : ' fila-oculta'}`, onclick: (e) => { if (!e.target.closest('.menu-mas')) location.hash = `#/propiedades/${p.id}`; } },
			h('td', { class: 'celda-sel', onclick: detener }, h('label', { class: 'sel-toque' }, sel)),
			h('td', { class: 'celda-num' }, i + 1),
			h('td', { class: 'celda-foto' }, p.fotos?.[0]?.url ? h('img', { class: 'thumb', src: p.fotos[0].url, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb thumb-vacia', title: 'Sin fotos' }, h('span', { class: 'icon-camera', 'aria-hidden': 'true' }))),
			h('td', { class: 'celda-titulo' },
				p.codigo ? h('div', { class: 'prop-codigo' }, p.codigo) : null,
				p.vip || p.destacada || faltanDe(p).length ? h('div', { class: 'prop-chips' },
					p.vip ? badge('VIP', 'warning') : null,
					p.destacada ? badge('Destacada', 'info') : null,
					chipFaltan(faltanDe(p))) : null,
				h('div', { class: 'fw-semibold prop-titulo' }, p.titulo || '(sin título)'),
				lugar ? h('div', { class: 'small text-muted prop-zona' }, h('span', { class: 'icon-map-marker', 'aria-hidden': 'true' }), ` ${lugar}`) : null,
				datos.length ? h('div', { class: 'prop-datos' }, datos) : null),
			h('td', { class: 'text-nowrap celda-precio' },
				h('div', {}, formatPrice(p.precio, p.moneda, p.operacion)),
				h('div', { class: 'small text-muted celda-operacion' }, operacionDe(p))),
			h('td', { class: 'celda-estado', onclick: detener }, selEstado),
			h('td', { class: 'celda-visible', onclick: detener },
				h('div', { class: 'form-check form-switch mb-1' }, chk,
					h('label', { class: 'form-check-label', for: idSwitch }, 'Visible')),
				h('span', { class: `badge text-bg-${motivo.color} motivo-visibilidad${motivo.obvio ? ' motivo-obvio' : ''}`, id: `motivo-${p.id}` },
					h('span', { class: motivo.icono, 'aria-hidden': 'true' }), ' ', motivo.texto)),
			h('td', { class: `small celda-asesor${agentName[p.agentId] ? '' : ' sin-asesor'}` }, h('span', { class: 'icon-user d-md-none', 'aria-hidden': 'true' }), ' ', agentName[p.agentId] || '—'),
			p.updatedAt ? h('td', { class: 'small text-muted text-nowrap celda-fecha' }, formatDate(p.updatedAt, false)) : h('td', { class: 'small text-muted celda-fecha sin-fecha' }, '—'),
			h('td', { class: 'celda-menu' }, menu));
	};

	const draw = () => {
		const q = sinTildes(search.value.trim());
		const rows = props.filter((p) =>
			(!q || sinTildes(`${p.titulo} ${p.codigo || ''} ${p.zona} ${p.direccion} ${p.ciudad}`).includes(q))
			&& (!fOperacion.value || p.operacion === fOperacion.value)
			&& pasaEstado(p)
			&& (fExtra.value !== 'publicado' || p.publicado)
			&& (fExtra.value !== 'borrador' || !p.publicado)
			&& (fExtra.value !== 'vip' || p.vip)
			&& (fExtra.value !== 'destacada' || p.destacada)
			&& (fExtra.value !== 'mias' || p.agentId === session.agentId)
			&& (fExtra.value !== 'incompletas' || faltanDe(p).length));
		count.textContent = `${rows.length} de ${props.length}`;
		dibujarYRecordar();
		visibles = rows;
		// Solo quedan seleccionadas las que se ven con el filtro actual.
		const ids = new Set(rows.map((p) => p.id));
		[...seleccion].forEach((pid) => { if (!ids.has(pid)) seleccion.delete(pid); });
		tbody.replaceChildren(...rows.map(fila));
		vacio.hidden = rows.length > 0;
		pintarBarra();
	};

	// ---- Acciones en masa ----
	const seleccion = new Set();
	let visibles = [];
	const elegidas = () => props.filter((p) => seleccion.has(p.id));
	const btnTodas = h('button', { type: 'button', class: 'btn btn-sm btn-link d-md-none p-0',
		onclick: () => { selTodas.checked = !selTodas.checked; selTodas.dispatchEvent(new Event('change')); } }, 'Seleccionar todas');
	const selTodas = h('input', {
		class: 'form-check-input', type: 'checkbox', 'aria-label': 'Seleccionar todas las que se ven',
		onchange: (e) => {
			visibles.filter(canEdit).forEach((p) => (e.target.checked ? seleccion.add(p.id) : seleccion.delete(p.id)));
			draw();
		}
	});
	const nSel = h('strong', {});
	const selMasaEstado = h('select', { class: 'form-select form-select-sm', 'aria-label': 'Cambiar estado de las seleccionadas' },
		h('option', { value: '' }, 'Cambiar estado a…'), ESTADOS.map(([v, l]) => h('option', { value: v }, l)));
	const barra = h('div', { class: 'barra-masa', role: 'region', 'aria-label': 'Acciones con las seleccionadas', hidden: true });

	const nombreDe = (l) => (l.length === 1 ? `«${l[0].titulo || 'la propiedad'}»` : `${l.length} propiedades`);
	// Aplica una acción a una lista: la de la selección (barra) o una sola propiedad (menú ⋮).
	const enMasa = async (accion, desc, aviso, lista) => {
		const deBarra = !lista;
		lista = lista || elegidas();
		if (!lista.length) return;
		barra.querySelectorAll('button, select').forEach((el) => { el.disabled = true; });
		let ok = 0;
		const fallos = [];
		for (const p of lista) {
			try { await accion(p); ok++; } catch (err) { fallos.push(p.titulo || p.id); console.error(err); }
		}
		refrescarPortalesDe(lista.map((p) => p.id));
		if (ok) await markPending(`${desc} (${ok})`).catch(() => {});
		if (ok) toast(aviso(ok));
		if (fallos.length) toast(`No se pudieron cambiar ${fallos.length}: ${fallos.slice(0, 3).join(', ')}${fallos.length > 3 ? '…' : ''}`, 'danger');
		if (deBarra) seleccion.clear();
		barra.querySelectorAll('button, select').forEach((el) => { el.disabled = false; });
		selMasaEstado.value = '';
		draw();
	};
	const guardarMasa = (cambios, local) => async (p) => {
		await updateDoc(doc(db, 'properties', p.id), { ...cambios, updatedAt: serverTimestamp(), updatedBy: session.user.uid });
		Object.assign(p, local, { updatedAt: { seconds: Date.now() / 1000 } });
	};
	selMasaEstado.addEventListener('change', () => {
		const estado = selMasaEstado.value;
		if (!estado) return;
		const label = estadoDe({ estado }).label;
		enMasa(guardarMasa(cambioDeEstado(estado), { estado }), `Estado cambiado a ${label}`,
			(n) => `${n} cambiada${n === 1 ? '' : 's'} a «${label}». Recuerda publicar para verlo en el sitio.`);
	});
	const selMasaAsesor = h('select', { class: 'form-select form-select-sm', 'aria-label': 'Asignar asesor a las seleccionadas' },
		h('option', { value: '' }, 'Asignar asesor…'),
		h('option', { value: '=ninguno' }, 'Sin asesor'),
		agents.map((a) => h('option', { value: a.id }, a.nombre)));
	selMasaAsesor.addEventListener('change', async () => {
		const v = selMasaAsesor.value;
		if (!v) return;
		const agentId = v === '=ninguno' ? '' : v;
		const nombre = agentName[agentId] || 'sin asesor';
		await enMasa(guardarMasa({ agentId }, { agentId }), `Asesor asignado: ${nombre}`,
			(n) => `${n} asignada${n === 1 ? '' : 's'} a ${nombre}.`);
		selMasaAsesor.value = '';
	});
	const btnMostrar = h('button', { type: 'button', class: 'btn btn-sm btn-outline-primary',
		onclick: () => enMasa(guardarMasa({ publicado: true }, { publicado: true }), 'Visibles en la página',
			(n) => `${n} visible${n === 1 ? '' : 's'} en la página. Recuerda publicar.`) },
		h('span', { class: 'icon-eye', 'aria-hidden': 'true' }), ' Mostrar');
	const btnOcultar = h('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary',
		onclick: () => enMasa(guardarMasa({ publicado: false }, { publicado: false }), 'Ocultas de la página',
			(n) => `${n} oculta${n === 1 ? '' : 's'}. Recuerda publicar.`) },
		h('span', { class: 'icon-eye-slash', 'aria-hidden': 'true' }), ' Ocultar');
	const mejorar = async (lista) => {
		const l = lista || elegidas();
		if (!(await confirmDialog(`¿Mejorar la descripción de ${nombreDe(l)}? Se ordena con la plantilla (Características, Amenidades, Detalles técnicos y lo que no incluye el precio). El texto anterior queda guardado como respaldo.`, { okText: 'Mejorar', danger: false }))) return;
		await enMasa(async (p) => {
			const descripcion = generarDescripcion(p);
			if (descripcion === p.descripcion) return;
			await guardarMasa({ descripcion, descripcionAnterior: p.descripcion || '' }, { descripcion, descripcionAnterior: p.descripcion || '' })(p);
		}, 'Descripciones mejoradas', (k) => `${k} descripción${k === 1 ? '' : 'es'} lista${k === 1 ? '' : 's'}. Revisalas y publicá.`, lista);
	};
	const btnMejorar = h('button', { type: 'button', class: 'btn btn-sm btn-outline-primary', onclick: () => mejorar() },
		h('span', { class: 'icon-list-ul', 'aria-hidden': 'true' }), ' Mejorar descripción');
	const btnDeshacer = h('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary',
		onclick: async () => {
			const con = props.filter((p) => seleccion.has(p.id) && p.descripcionAnterior);
			if (!con.length) return toast('Las seleccionadas no tienen una descripción anterior guardada.', 'warning');
			if (!(await confirmDialog(`¿Volver a la descripción anterior en ${con.length} propiedad${con.length === 1 ? '' : 'es'}?`, { okText: 'Volver', danger: false }))) return;
			await enMasa(async (p) => {
				if (!p.descripcionAnterior) return;
				const descripcion = p.descripcionAnterior;
				await guardarMasa({ descripcion, descripcionAnterior: p.descripcion || '' }, { descripcion, descripcionAnterior: p.descripcion || '' })(p);
			}, 'Descripción anterior', (k) => `${k} descripción${k === 1 ? '' : 'es'} restaurada${k === 1 ? '' : 's'}. Recuerda publicar.`);
		} },
		h('span', { class: 'icon-undo', 'aria-hidden': 'true' }), ' Volver a la anterior');
	const traducir = async (lista) => {
		const l = lista || elegidas();
		if (!(await confirmDialog(`¿Traducir al inglés ${nombreDe(l)}? Las que corregiste a mano en inglés se respetan. Revisá la traducción antes de publicar.`, { okText: 'Traducir', danger: false }))) return;
		await enMasa(async (p) => {
			if (!p.titulo || (p.en?.manual && String(p.en?.titulo || '').trim())) return;
			const en = await traducirEn(p);
			await guardarMasa({ en }, { en })(p);
		}, 'Traducción al inglés', (k) => `${k} propiedad${k === 1 ? '' : 'es'} traducida${k === 1 ? '' : 's'} al inglés. Recuerda publicar.`, lista);
	};
	const btnTraducir = h('button', { type: 'button', class: 'btn btn-sm btn-outline-primary', onclick: () => traducir() },
		h('span', { class: 'icon-globe', 'aria-hidden': 'true' }), ' Traducir al inglés');
	// Completa de una vez lo que sube la calificación SEO y se puede sacar de los datos: título y
	// descripción para Google, ciudad (si la zona es "Zona 10"…) y la versión en inglés.
	const completarSeo = async (lista) => {
		const l = lista || elegidas();
		if (!(await confirmDialog(`¿Completar el SEO de ${nombreDe(l)}? Se llena lo que falta para Google, la ciudad cuando la zona es de la capital y la traducción al inglés. Lo que escribiste a mano se respeta.`, { okText: 'Completar', danger: false }))) return;
		await enMasa(async (p) => {
			if (!p.titulo) return;
			const d = { ...p };
			const cambios = {};
			if (!String(d.ciudad || '').trim() && /^zona\s*\d+/i.test(String(d.zona || '').trim())) cambios.ciudad = d.ciudad = 'Guatemala';
			if (!d.vip) {
				const antes = JSON.stringify(d.seo || {});
				llenarSeo(d);
				if (JSON.stringify(d.seo) !== antes) cambios.seo = d.seo;
			}
			if (llenarAltFotos(d)) cambios.fotos = d.fotos;
			const en = d.en || {};
			if (faltaIngles(d)) cambios.en = await traducirEn(d);
			if (Object.keys(cambios).length) await guardarMasa(cambios, cambios)(p);
		}, 'SEO completado', (k) => `SEO de ${k} propiedad${k === 1 ? '' : 'es'} revisado y completado. Recuerda publicar.`, lista);
	};
	const btnCompletar = h('button', { type: 'button', class: 'btn btn-sm btn-outline-primary', onclick: () => completarSeo() },
		h('span', { class: 'icon-search', 'aria-hidden': 'true' }), ' Completar SEO');
	// Textos (descripción e inglés) que escribió Claude en admin/textos-claude.json, por id de propiedad.
	// Guarda la descripción anterior como respaldo («Volver a la anterior») y llena el SEO que falte.
	const btnClaude = h('button', { type: 'button', class: 'btn btn-sm btn-outline-primary',
		onclick: async () => {
			const textos = await fetch('/admin/textos-claude.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
			const con = props.filter((p) => seleccion.has(p.id) && textos[p.id]);
			if (!con.length) return toast('Las seleccionadas todavía no tienen textos preparados.', 'warning');
			if (!(await confirmDialog(`¿Poner los textos preparados en ${con.length} propiedad${con.length === 1 ? '' : 'es'}? Se cambia la descripción y el inglés, y se llena el SEO que falte. La descripción anterior queda como respaldo.`, { okText: 'Poner textos', danger: false }))) return;
			await enMasa(async (p) => {
				const t = textos[p.id];
				if (!t) return;
				const d = { ...p, descripcion: t.descripcion };
				const cambios = { descripcion: t.descripcion, descripcionAnterior: p.descripcion || '' };
				if (!String(d.ciudad || '').trim() && /^zona\s*\d+/i.test(String(d.zona || '').trim())) cambios.ciudad = d.ciudad = 'Guatemala';
				if (!d.vip) { llenarSeo(d); cambios.seo = d.seo; }
				if (llenarAltFotos(d)) cambios.fotos = d.fotos;
				cambios.en = {
					titulo: t.en.titulo, descripcion: t.en.descripcion, amenidades: t.en.amenidades || [],
					seo: { titulo: autoSeoTitle({ ...d, titulo: t.en.titulo }, true), descripcion: recortar(resumenSeo(t.en.descripcion), 155) },
					vipLanding: p.en?.vipLanding || { titular: '', subtitular: '', puntosClave: [], ctaTexto: '' },
					vacacional: p.en?.vacacional || {},
					slugsAnteriores: titulosEnAnteriores(p.en, t.en.titulo),
					fuente: fuenteEs(d), manual: false
				};
				await guardarMasa(cambios, cambios)(p);
			}, 'Textos preparados', (k) => `Textos puestos en ${k} propiedad${k === 1 ? '' : 'es'}. Revisalos y publicá.`);
		} },
		h('span', { class: 'icon-pencil', 'aria-hidden': 'true' }), ' Poner textos preparados');
	const btnMarca = h('button', { type: 'button', class: 'btn btn-sm btn-outline-primary',
		onclick: async (e) => {
			const n = seleccion.size;
			if (!(await confirmDialog(`¿Poner la marca de agua a las fotos de ${n} propiedad${n === 1 ? '' : 'es'}? Las que ya la tienen se saltan. Puede tardar unos minutos; no cierres esta página.`, { okText: 'Poner marca', danger: false }))) return;
			const boton = e.currentTarget;
			const txt = boton.lastChild.textContent;
			let hecha = 0;
			await enMasa(async (p) => {
				const fotos = await marcarFotos(p, (i, t) => { boton.lastChild.textContent = ` Propiedad ${hecha + 1} de ${n}: foto ${i} de ${t}…`; });
				hecha++;
				if (fotos) await guardarMasa({ fotos }, { fotos })(p);
			}, 'Marca de agua en fotos', (k) => `Fotos de ${k} propiedad${k === 1 ? '' : 'es'} con marca de agua. Recuerda publicar.`);
			boton.lastChild.textContent = txt;
		} },
		h('span', { class: 'icon-image', 'aria-hidden': 'true' }), ' Poner marca de agua');
	const eliminar = async (lista) => {
		const l = lista || elegidas();
		if (!(await confirmDialog(`¿Eliminar ${nombreDe(l)}? Se borrarán también sus fotos. Esta acción no se puede deshacer.`, { okText: 'Eliminar' }))) return;
		const borradas = new Set();
		await enMasa(async (p) => {
			await eliminarPropiedad(p);
			borradas.add(p.id);
		}, 'Propiedades eliminadas', (k) => `${k} eliminada${k === 1 ? '' : 's'}.`, lista);
		for (let i = props.length - 1; i >= 0; i--) if (borradas.has(props[i].id)) props.splice(i, 1);
		draw();
	};
	const btnEliminar = h('button', { type: 'button', class: 'btn btn-sm btn-outline-danger', onclick: () => eliminar() },
		h('span', { class: 'icon-trash-o', 'aria-hidden': 'true' }), ' Eliminar');
	// Lo de todos los días queda a la vista; el resto se abre con «Más».
	const masAcciones = h('div', { class: 'barra-masa-mas', id: 'barra-masa-mas', hidden: true },
		session.isAdmin ? h('div', { class: 'barra-masa-estado' }, selMasaAsesor) : null,
		btnMejorar, btnDeshacer, btnCompletar, btnClaude, btnTraducir, btnMarca);
	const btnMas = h('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', 'aria-expanded': 'false', 'aria-controls': 'barra-masa-mas',
		onclick: () => { masAcciones.hidden = !masAcciones.hidden; btnMas.setAttribute('aria-expanded', String(!masAcciones.hidden)); } },
		h('span', { class: 'icon-ellipsis-h', 'aria-hidden': 'true' }), ' Más');
	barra.append(
		h('span', { class: 'barra-masa-n' },
			iconoBtn('icon-close', 'Quitar selección', { onclick: () => { seleccion.clear(); draw(); } }), nSel, h('span', { class: 'd-none d-md-inline' }, ' seleccionada(s)')),
		btnMostrar, btnOcultar,
		h('div', { class: 'barra-masa-estado' }, selMasaEstado),
		session.isAdmin ? btnEliminar : null,
		iconoBtn('icon-download', 'Exportar seleccionadas (CSV)', { onclick: (e) => exportarCsv(elegidas(), agentName, e.currentTarget) }),
		btnMas, masAcciones);
	const pintarBarra = () => {
		const editables = visibles.filter(canEdit);
		nSel.textContent = String(seleccion.size);
		barra.hidden = seleccion.size === 0;
		selTodas.checked = editables.length > 0 && editables.every((p) => seleccion.has(p.id));
		selTodas.indeterminate = seleccion.size > 0 && !selTodas.checked;
		selTodas.disabled = btnTodas.hidden = editables.length === 0;
	};
	// Los filtros se recuerdan mientras la pestaña siga abierta: al volver de una ficha siguen igual.
	const filtros = [search, fOperacion, fEstado, fExtra];
	const CLAVE_FILTROS = 'eq-filtros-propiedades';
	const limpiar = h('button', { type: 'button', class: 'btn btn-link btn-sm p-0', hidden: true,
		onclick: () => { filtros.forEach((el) => { el.value = ''; }); draw(); search.focus(); } }, 'Quitar filtros');
	try {
		const g = JSON.parse(sessionStorage.getItem(CLAVE_FILTROS) || 'null');
		if (Array.isArray(g)) filtros.forEach((el, i) => {
			if (el.tagName !== 'SELECT' || [...el.options].some((o) => o.value === g[i])) el.value = g[i] || '';
		});
	} catch { /* sin memoria del navegador: se empieza sin filtros */ }
	const cajaFiltros = h('div', { class: 'row g-2 filtros-extra', id: 'filtros-propiedades' },
		h('div', { class: 'col-6 col-md-4' }, fOperacion),
		h('div', { class: 'col-6 col-md-3 order-md-1' }, fExtra),
		h('div', { class: 'col-12 col-md-5' }, fEstado));
	const btnFiltros = iconoBtn('icon-sliders', 'Filtros', {
		'aria-controls': 'filtros-propiedades', 'aria-expanded': 'false',
		onclick: () => btnFiltros.setAttribute('aria-expanded', String(cajaFiltros.classList.toggle('abierto')))
	});
	btnFiltros.classList.add('d-md-none', 'btn-filtros');
	const dibujarYRecordar = () => {
		const valores = filtros.map((el) => el.value);
		limpiar.hidden = valores.every((v) => !v);
		const activos = valores.slice(1).filter(Boolean).length;
		btnFiltros.classList.toggle('con-filtros', activos > 0);
		btnFiltros.setAttribute('aria-label', activos ? `Filtros (${activos} puesto${activos === 1 ? '' : 's'})` : 'Filtros');
		try { sessionStorage.setItem(CLAVE_FILTROS, JSON.stringify(valores)); } catch { /* sin memoria */ }
	};
	filtros.forEach((el) => el.addEventListener('input', draw));
	draw();
	// Las que quedaron sin inglés (anteriores a la traducción automática al guardar) se traducen solas.
	// No se repite sobre el mismo texto (en.fuente) ni toca el inglés corregido a mano.
	// Igual las casas vacacionales con cómo llegar, reglas o cancelación todavía sin traducir.
	const faltaVac = (p) => TEXTOS_VAC.some((k) => p.vacacional?.[k] && !p.en?.vacacional?.[k]);
	const sinIngles = props.filter((p) => canEdit(p) && p.titulo && (!(p.en?.titulo && p.en?.descripcion) || faltaVac(p)) && !p.en?.manual && p.en?.fuente !== fuenteEs(p));
	const traducidas = enMasa(async (p) => { const en = await traducirEn(p); await guardarMasa({ en }, { en })(p); }, 'Traducción al inglés',
		(k) => `${k === 1 ? '1 propiedad sin inglés se tradujo sola' : `${k} propiedades sin inglés se tradujeron solas`}. Recuerda publicar.`, sinIngles);
	// Títulos en inglés que la regla anterior dejó repetidos o cortados: se corrigen solos, una vez.
	const tituloMalo = props.filter((p) => canEdit(p) && p.en?.titulo && p.en?.descripcion && !p.en.manual && !sinIngles.includes(p)
		&& p.en.titulo === tituloEnViejo(p) && p.en.titulo !== tituloEn(p));
	traducidas.then(() => enMasa(async (p) => {
		const titulo = tituloEn(p);
		const vip = p.en.vipLanding;
		const en = { ...p.en, titulo, slugsAnteriores: titulosEnAnteriores(p.en, titulo),
			...(vip?.titular === p.en.titulo ? { vipLanding: { ...vip, titular: titulo } } : {}) };
		await guardarMasa({ en }, { en })(p);
	}, 'Títulos en inglés corregidos',
		(k) => `${k === 1 ? '1 título en inglés se corrigió solo' : `${k} títulos en inglés se corrigieron solos`}. Recuerda publicar.`, tituloMalo));
	// Si se vuelve con filtros puestos, en celular se muestran abiertos.
	if (btnFiltros.classList.contains('con-filtros')) btnFiltros.click();

	mount(container, 
		pageHeader('Propiedades',
			session.isAdmin ? h('a', { href: '#/propiedades/importar', class: 'btn btn-outline-primary btn-encabezado', 'aria-label': 'Importar desde CSV', title: 'Importar desde CSV' },
				h('span', { class: 'icon-upload', 'aria-hidden': 'true' }), ' Importar', h('span', { class: 'd-none d-md-inline' }, ' desde CSV')) : null,
			props.length ? h('button', { type: 'button', class: 'btn btn-outline-primary btn-encabezado', 'aria-label': 'Exportar (CSV)', title: 'Exportar (CSV)', onclick: (e) => exportarCsv(props, agentName, e.currentTarget) },
				h('span', { class: 'icon-download', 'aria-hidden': 'true' }), h('span', { class: 'd-none d-md-inline' }, ' Exportar (CSV)')) : null,
			h('a', { href: '#/propiedades/nuevo', class: 'btn btn-primary btn-encabezado' },
				h('span', { class: 'icon-plus', 'aria-hidden': 'true' }), ' Nueva', h('span', { class: 'd-none d-md-inline' }, ' propiedad'))),
		props.length ? h('div', {},
			h('div', { class: 'row g-2 mb-3' },
				h('div', { class: 'col-md-4 d-flex gap-2' }, search, btnFiltros),
				h('div', { class: 'col-md-8' }, cajaFiltros)),
			h('div', { class: 'mb-2 d-flex align-items-center gap-3' },
				count, limpiar,
				btnTodas),
			barra, vacio,
			cajaTabla(
				h('table', { class: 'table table-hover table-admin tabla-propiedades' },
					h('thead', {}, h('tr', {},
						h('th', { class: 'celda-sel' }, h('label', { class: 'sel-toque' }, selTodas)),
						[['#', 'celda-num'], ['', 'celda-foto'], ['Propiedad', 'celda-titulo'], ['Precio', 'celda-precio'], ['Estado', 'celda-estado'],
							['En la página', 'celda-visible'], ['Asesor', 'celda-asesor'], ['Actualizada', 'celda-fecha'], ['', 'celda-menu']].map(([t, c]) => h('th', { scope: 'col', class: c }, t)))),
					tbody), { tarjeta: true }))
			: emptyState('Aún no hay propiedades.', h('a', { href: '#/propiedades/nuevo', class: 'btn btn-primary' }, 'Crear la primera')));
}

function schema(agentOpts, isNew, socioOpts, ajeno = false) {
	// La landing VIP no tiene caja de reserva: una casa por noche siempre usa su ficha normal.
	const vip = (d) => Boolean(d.vip) && !esVacacional(d);
	const conDueno = (d) => Boolean(d.propietarioId);
	// Un terreno no tiene cuartos, baños, parqueos, construcción, niveles ni año: no se le preguntan.
	const construido = (d) => d.tipo !== 'terreno';
	// La vista previa de Google usa el precio que verá el cliente (el de una casa por noche sale del precio del socio).
	const conPrecio = (d) => (esVacacional(d) ? { ...d, ...vacacionalPublico(d) } : d);
	return [
		{ type: 'section', label: 'Datos principales' },
		{ name: 'titulo', label: 'Título', required: true, cols: 8, placeholder: 'Ej. Casa con jardín en Residencial San Antonio' },
		{ name: 'slug', label: 'URL (slug)', cols: 4, help: 'Se genera solo a partir del título. Si la cambias, la URL anterior redirige a la nueva.', ref: (el) => { schema.slugInput = el; } },
		{ name: 'codigo', label: 'Código', cols: 6, placeholder: 'VLM-Z15-JA-001', help: 'Condominio, zona, asesor y número. Si lo dejas vacío, se crea solo al guardar.', ref: (el) => { schema.codigoInput = el; } },
		{ name: 'condominioSiglas', label: 'Siglas del condominio', cols: 6, maxlength: 6, placeholder: 'VLM', help: 'Ej. VLM para Vista de las Lomas. Si lo dejas vacío, se toman del residencial; si no está en condominio, se usa IND.' },
		{ name: 'operacion', label: 'Operación', type: 'select', options: OPERACIONES, cols: 3 },
		{ name: 'tipo', label: 'Tipo', type: 'select', options: (d) => TIPOS.filter(([v]) => tipoAplica(v, d.operacion)), cols: 3 },
		{ name: 'estado', label: 'Estado', type: 'select', options: (d) => estadosPara(d.operacion).map((e) => [e.valor, e.label]), cols: 3, help: 'Las cerradas (vendida, rentada) solo se abren con su enlace. Pausada y retirada: no se ven en ningún lado.' },
		// Renta vacacional: la atiende su socio; el asesor sale solo de la ficha del socio y no se pregunta.
		{ name: 'agentId', label: 'Asesor responsable', type: 'select', options: agentOpts, cols: 3, disabled: !session.isAdmin, when: (d) => !esVacacional(d) },
		// De quién es el inmueble o quién nos lo pasó. En renta vacacional es el socio que la atiende.
		// Si lo lleva otro asesor no se cambia aquí: su lista de casas (Propietarios) volvería a reclamarla.
		{ name: 'propietarioId', label: 'Propietario, socio o colaborador', type: 'select', options: socioOpts, cols: 3, disabled: ajeno,
			help: 'El dueño, el socio de una casa por noche o un asesor colaborador. Se crea una vez en Propietarios.' },
		{ name: 'precio', label: 'Precio', type: 'number', min: 0, step: 1, cols: 4, help: 'Déjalo vacío para mostrar "Precio a consultar".', when: (d) => !esVacacional(d) },
		{ name: 'moneda', label: 'Moneda', type: 'select', options: MONEDAS, cols: 4 },
		{ name: 'orden', label: 'Orden', type: 'number', cols: 4, help: 'Número menor aparece primero.' },
		{ name: 'publicado', label: 'Visible en la página', type: 'checkbox', cols: 4, default: isNew ? false : undefined },
		{ name: 'destacada', label: 'Destacada en la portada', type: 'checkbox', cols: 4 },
		{ name: 'vip', label: 'Propiedad VIP (landing page)', type: 'checkbox', cols: 4, when: (d) => !esVacacional(d) },

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
		{ name: 'vacacional.camas', label: 'Camas', type: 'number', min: 0, step: 1, cols: 2, when: esVacacional },
		{ name: 'vacacional.mascotas', label: 'Mascotas', type: 'select', options: [['', 'Sin indicar'], ['si', 'Se aceptan'], ['no', 'No se aceptan']], cols: 4, when: esVacacional },
		{ name: 'vacacional.comoLlegar', label: 'Cómo llegar (opcional)', type: 'textarea', rows: 2, when: esVacacional, placeholder: 'A 45 min de la capital; los últimos 2 km son de terracería.' },
		{ name: 'vacacional.reglas', label: 'Reglas de la casa (una por línea)', type: 'textarea', rows: 3, when: esVacacional, help: 'Vacío = las reglas generales de Contenido → Textos → Renta vacacional.' },
		{ name: 'vacacional.cancelacion', label: 'Cancelación', type: 'textarea', rows: 2, when: esVacacional, help: 'Vacío = la política general de Contenido → Textos → Renta vacacional.' },
		{ name: 'socio.icalUrl', label: 'Enlace del calendario de Airbnb (iCal, opcional)', type: 'url', when: esVacacional, placeholder: 'https://www.airbnb.com/calendar/ical/….ics', help: 'En Airbnb: Calendario → Disponibilidad → Conectar calendarios → Exportar. Privado: la página solo muestra qué noches están ocupadas.' },
		{ name: 'vacacional.bloqueos', label: 'Fechas ocupadas (además de Airbnb)', type: 'list', itemLabel: 'Bloqueo', when: esVacacional, fields: [
			{ name: 'desde', label: 'Llegada (primera noche ocupada)', type: 'date', cols: 6 },
			{ name: 'hasta', label: 'Salida (ese día queda libre)', type: 'date', cols: 6 }
		] },

		// Acuerdo con el dueño de ESTE inmueble (exclusiva, comisión, impuestos): privado, en privado/acuerdo.
		// Cada operación con lo suyo (admin/js/acuerdo.js): la exclusiva, siempre; comisión en venta (%) y renta
		// (meses); impuestos del traspaso solo en venta. En la renta por noche la empresa gana el margen.
		{ type: 'section', label: 'Acuerdo con el dueño', when: conDueno, help: 'Privado: no sale en la página. Es de este inmueble; otro inmueble del mismo dueño puede tener otro acuerdo.' },
		{ name: 'acuerdo.exclusiva', label: 'Tenemos exclusiva', type: 'checkbox', cols: 4, when: conDueno },
		{ name: 'acuerdo.exclusivaInicio', label: 'Exclusiva desde', type: 'date', cols: 4, when: (d) => conDueno(d) && Boolean(d.acuerdo?.exclusiva) },
		{ name: 'acuerdo.exclusivaFin', label: 'Exclusiva hasta', type: 'date', cols: 4, when: (d) => conDueno(d) && Boolean(d.acuerdo?.exclusiva), help: 'Avisamos 30 días antes de que venza.' },
		{ name: 'acuerdo.comisionPct', label: 'Comisión de venta %', type: 'number', min: 0, step: 0.5, cols: 4, when: (d) => conDueno(d) && d.operacion === 'venta', help: 'Vacío = regla general (Reportes).' },
		{ name: 'acuerdo.comisionRentaMeses', label: 'Comisión de renta (meses de renta)', type: 'number', min: 0, step: 0.5, cols: 4, when: (d) => conDueno(d) && d.operacion === 'renta', help: 'Vacío = regla general (Reportes).' },
		{ name: 'acuerdo.comisionRegimen', label: 'Impuesto de la comisión', type: 'select', cols: 4, options: REGIMENES, default: 'pequeno', when: (d) => conDueno(d) && !esVacacional(d) },
		{ name: 'acuerdo.comisionModo', label: 'Cómo se cobra la comisión', type: 'select', cols: 4, options: MODOS, when: (d) => conDueno(d) && !esVacacional(d) },
		{ name: 'acuerdo.impuestoVenta', label: 'Impuesto del traspaso', type: 'select', cols: 4, when: (d) => conDueno(d) && d.operacion === 'venta', options: [['', 'Por definir'], ['iva', 'IVA 12 % (primera venta de inmueble nuevo)'], ['timbres', 'Timbres fiscales 3 % (reventa)']] },
		{ name: 'acuerdo.impuestoPaga', label: 'Quién paga el impuesto', type: 'select', cols: 4, when: (d) => conDueno(d) && d.operacion === 'venta', options: [['', 'Por definir'], ['comprador', 'Comprador'], ['vendedor', 'Vendedor'], ['mitad', 'Mitad y mitad']] },
		{ name: 'acuerdo.notasImpuestos', label: 'Notas de impuestos', cols: 4, when: (d) => conDueno(d) && d.operacion === 'venta', placeholder: 'IUSI al día, ISR, gastos de escritura…' },
		{ name: 'acuerdo.contrato', label: 'Enlace al contrato (Drive, Dropbox…)', type: 'url', cols: 12, when: conDueno, placeholder: 'https://…' },

		{ type: 'section', label: 'Ubicación', when: (d) => !esVacacional(d) },
		{ type: 'section', label: 'Ubicación', when: esVacacional, help: 'En la página solo salen la zona y la ciudad. La dirección y el mapa son privados: el cliente los recibe cuando se marca el pago.' },
		{ name: 'zona', label: 'Zona', cols: 4, placeholder: 'Zona 16' },
		{ name: 'ciudad', label: 'Ciudad / municipio', cols: 4, placeholder: 'Guatemala' },
		{ name: 'direccion', label: 'Residencial / dirección', cols: 4 },
		{ name: 'mapa', label: 'Mapa (opcional)', type: 'textarea', rows: 2, help: 'Pega el código "Insertar mapa" de Google Maps, o escribe la dirección o coordenadas.' },

		{ type: 'section', label: 'Características' },
		{ name: 'habitaciones', label: 'Habitaciones', type: 'number', min: 0, cols: 2, when: construido },
		{ name: 'banos', label: 'Baños', type: 'number', min: 0, step: 0.5, cols: 2, when: construido },
		{ name: 'parqueos', label: 'Parqueos', type: 'number', min: 0, cols: 2, when: construido },
		{ name: 'm2Construccion', label: 'm² construcción', type: 'number', min: 0, cols: 3, when: construido },
		{ name: 'm2Terreno', label: 'm² terreno', type: 'number', min: 0, cols: 3 },
		{ name: 'niveles', label: 'Niveles', type: 'number', min: 0, cols: 2, when: construido },
		{ name: 'anioConstruccion', label: 'Año de construcción', type: 'number', min: 0, cols: 3, when: construido },
		{ name: 'mantenimiento', label: 'Mantenimiento al mes', type: 'number', min: 0, cols: 3, when: (d) => !esVacacional(d) && construido(d), help: 'En la misma moneda del precio.' },
		{ name: 'amenidades', label: 'Amenidades', type: 'tags', placeholder: 'Escribe otra y presiona Enter', sugerencias: (d) => amenidadesPara(d.operacion) },
		{ name: 'descripcion', label: 'Descripción', type: 'markdown', rows: 8, required: true, ref: (el) => { schema.descInput = el; } },
		{ type: 'custom', update: (el, d) => {
			if (el.firstChild) return;
			let anterior = null;
			const deshacer = h('button', { type: 'button', class: 'btn btn-sm btn-link', hidden: true,
				onclick: () => { poner(anterior); deshacer.hidden = true; } }, 'Deshacer');
			const poner = (txt) => { schema.descInput.value = txt; schema.descInput.dispatchEvent(new Event('input')); };
			el.append(h('div', { class: 'd-flex flex-wrap align-items-center gap-2' },
				h('button', { type: 'button', class: 'btn btn-sm btn-outline-primary', onclick: async () => {
					if (!(await confirmDialog('Se ordenará la descripción con la plantilla: tu párrafo de presentación queda arriba y debajo se arman Características, Amenidades, Detalles técnicos y lo que no incluye el precio, con los datos de esta ficha. Podés deshacerlo.', { okText: 'Mejorar', danger: false }))) return;
					anterior = schema.descInput.value;
					poner(generarDescripcion({ ...d, ...(esVacacional(d) ? { direccion: '' } : {}), descripcion: anterior }));
					deshacer.hidden = false;
				} }, h('span', { class: 'icon-list-ul', 'aria-hidden': 'true' }), ' Mejorar descripción'),
				deshacer,
				h('span', { class: 'small text-muted' }, 'Revisá el primer párrafo: ubicación y lo que hace especial a la propiedad.')));
		} },
		{ name: 'video', label: 'Video (YouTube o Vimeo)', type: 'url', placeholder: 'https://www.youtube.com/watch?v=…' },

		{ type: 'section', label: 'Fotos', help: 'La primera foto es la portada. Se reducen y optimizan automáticamente al subirlas.' },
		{ name: 'fotos', label: 'Galería', type: 'images', marca: true },

		{ type: 'section', label: 'Landing page VIP', help: 'Solo para propiedades marcadas como VIP. Se publica en /vip/…', when: vip },
		{ name: 'vipLanding.titular', label: 'Titular', cols: 6, when: vip, placeholder: 'Ej. Vive frente al bosque, a 10 minutos de todo' },
		{ name: 'vipLanding.ctaTexto', label: 'Texto del botón', cols: 6, when: vip, placeholder: 'Agendar visita privada' },
		{ name: 'vipLanding.subtitular', label: 'Subtítulo', type: 'textarea', rows: 2, when: vip },
		{ name: 'vipLanding.portada', label: 'Imagen de portada (opcional)', type: 'image', marca: true, when: vip, help: 'Si no eliges una, se usa la primera foto de la galería.' },
		{ name: 'vipLanding.puntosClave', label: 'Puntos clave', type: 'tags', when: vip, placeholder: 'Vista panorámica, acabados importados… (Enter para agregar)' },
		{ name: 'vipLanding.ocultarPrecio', label: 'Ocultar precio ("Precio a consultar")', type: 'checkbox', when: vip },

		{ type: 'section', label: 'Versión en inglés (mercado de EE. UU.)', help: 'No hay que escribirla: se traduce sola en cuanto terminas el título y la descripción en español, y se vuelve a traducir si los cambias. Revísala; si corriges algo aquí a mano, se respeta y ya no se reemplaza.' },
		{ name: 'en.titulo', label: 'Title (English)', cols: 12 },
		{ name: 'en.descripcion', label: 'Description (English)', type: 'markdown', rows: 6 },
		{ name: 'en.amenidades', label: 'Amenities (English)', type: 'tags' },
		{ name: 'en.vipLanding.titular', label: 'VIP headline (English)', cols: 6, when: vip },
		{ name: 'en.vipLanding.ctaTexto', label: 'VIP button (English)', cols: 6, when: vip },
		{ name: 'en.vipLanding.subtitular', label: 'VIP subtitle (English)', type: 'textarea', rows: 2, when: vip },
		{ name: 'en.vipLanding.puntosClave', label: 'VIP highlights (English)', type: 'tags', when: vip },
		{ name: 'en.vacacional.comoLlegar', label: 'Getting there (English)', type: 'textarea', rows: 2, when: esVacacional },
		{ name: 'en.vacacional.reglas', label: 'House rules (English, one per line)', type: 'textarea', rows: 3, when: esVacacional },
		{ name: 'en.vacacional.cancelacion', label: 'Cancellation (English)', type: 'textarea', rows: 2, when: esVacacional },
		{ name: 'en.seo.titulo', label: 'Google title (English)', maxlength: 70, cols: 6 },
		{ name: 'en.seo.descripcion', label: 'Google description (English)', maxlength: 160, cols: 6 },

		{ type: 'section', label: 'SEO (opcional)', help: 'Si los dejas vacíos se generan automáticamente.' },
		{ name: 'seo.titulo', label: 'Título para Google', maxlength: 70, cols: 12 },
		{ name: 'seo.descripcion', label: 'Descripción para Google', type: 'textarea', rows: 2, maxlength: 160 },
		seoPreviewField({
			title: (d) => (d.vip ? d.seo?.titulo || `${d.vipLanding?.titular || d.titulo || ''} | Propiedad exclusiva` : d.seo?.titulo || autoTitle(d)),
			description: (d) => d.seo?.descripcion || (d.vip && d.vipLanding?.subtitular) || autoDescription(conPrecio(d)),
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

// La ficha del inmueble: la única forma de crear o editar una propiedad en todo el panel. Se usa en su página
// (#/propiedades/…) y, con «emb», dentro de una ventana abierta desde otra pantalla (ver abrirFicha): ahí no
// navega; avisa con emb.alGuardar(casa) y emb.alEliminar(id) y pone sus botones en emb.pie.
async function renderEditor(container, id, emb = null) {
	const isNew = id === 'nuevo';
	const ref = isNew ? doc(collection(db, 'properties')) : doc(db, 'properties', id);
	const [snap, agentOpts, all, propietarios] = await Promise.all([isNew ? null : getDoc(ref), agentOptions(), loadAll(), loadPropietarios()]);
	const socioOpts = [['', 'Elegir…'], ...propietarios.map((p) => [p.id, p.tipo === 'colaborador' ? `${p.nombre} (colaborador${p.empresa ? ` · ${p.empresa}` : ''})` : tieneCasasPorNoche(p, all) ? `${p.nombre} (socio)` : p.nombre])];
	if (!isNew && !snap.exists()) {
		mount(container, emptyState('La propiedad no existe.', h('a', { href: '#/propiedades', class: 'btn btn-primary' }, 'Volver')));
		return;
	}
	const data = isNew ? { ...datosIniciales(), ...(emb?.inicial || {}) } : snap.data();
	// Datos privados del socio (renta vacacional). Si no hay permiso o no existe, queda vacío.
	const privRef = doc(db, 'properties', ref.id, 'privado', 'socio');
	// Dirección y mapa de una casa por noche: privados (el cliente los recibe con el pago). Ver privado/llegada.
	const llegadaRef = doc(db, 'properties', ref.id, 'privado', 'llegada');
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

	// Sin «catch»: si no se pudiera leer, es mejor el error que un formulario vacío que al guardar borre la dirección.
	if (!isNew && data.operacion === 'vacacional') {
		const ll = (await getDoc(llegadaRef)).data();
		if (ll) Object.assign(data, { direccion: ll.direccion || '', mapa: ll.mapa || '' });
	}
	let eraVacacional = data.operacion === 'vacacional';
	// Acuerdo de este inmueble. Si todavía no tiene el suyo, se muestra lo que quedó en la ficha de su dueño
	// (datos de antes) y al guardar pasa a ser de este inmueble.
	const acuerdoRef = doc(db, 'properties', ref.id, 'privado', 'acuerdo');
	let acuerdoPropio = isNew ? null : (await getDoc(acuerdoRef)).data() || null;
	const acuerdoInicial = acuerdoDe(acuerdoPropio, propietarios.find((p) => p.id === data.propietarioId), data.operacion);
	// Si alguien cambió algo del bloque en esta visita (no basta comparar valores: el formulario pone los suyos por defecto).
	let acuerdoTocado = false;
	// Qué se guarda como acuerdo de este inmueble: un objeto, 'borrar' o null (no tocar lo que haya).
	//  - Sin dueño: se borra solo si lo tenía y se lo quité aquí. Una casa enlazada solo desde la lista del dueño
	//    no tiene «propietarioId»: su acuerdo no se toca.
	//  - Cambió de dueño y no toqué el bloque: el acuerdo del dueño anterior no pasa al nuevo.
	//  - Sin acuerdo propio y sin tocar: se guarda lo que hereda de su dueño para la operación de AHORA; si a ese
	//    dueño no lo veo (lo lleva otro asesor), no escribo nada, para no tapar con un acuerdo vacío lo que él tiene.
	//  - Lo que no aplica a la operación de ahora se conserva guardado (no se muestra): volver a venta no lo pierde.
	function acuerdoPorGuardar(d, f) {
		if (!d.propietarioId) return data.propietarioId ? 'borrar' : null;
		const otroDueno = Boolean(data.propietarioId) && data.propietarioId !== d.propietarioId;
		const previo = otroDueno ? null : acuerdoPropio;
		const dueno = propietarios.find((p) => p.id === d.propietarioId);
		const heredado = previo ? {} : acuerdoHeredado(dueno, d.operacion);
		if (!previo && !acuerdoTocado) return dueno && Object.keys(heredado).length ? heredado : otroDueno && acuerdoPropio ? 'borrar' : null;
		const escrito = Object.fromEntries(camposDelAcuerdo(d.operacion).map((k) => [k, f[k] ?? '']));
		escrito.exclusiva = Boolean(escrito.exclusiva);
		if (!escrito.exclusiva) Object.assign(escrito, { exclusivaInicio: '', exclusivaFin: '' });
		const guardado = Object.fromEntries(CAMPOS_ACUERDO.filter((k) => previo?.[k] !== undefined).map((k) => [k, previo[k]]));
		// Sin acuerdo propio, lo heredado llena lo que el formulario trae vacío (p. ej. al cambiar de operación).
		const base = Object.fromEntries(Object.entries(heredado).filter(([k]) => !k.startsWith('exclusiva') && escrito[k] === ''));
		return { ...guardado, ...escrito, ...base };
	}
	// Propietario ya asignado que no está en mi lista (lo lleva otro asesor): se muestra y se respeta, sin poder cambiarlo.
	const ajeno = Boolean(data.propietarioId) && !propietarios.some((p) => p.id === data.propietarioId);
	if (ajeno) socioOpts.push([data.propietarioId, 'Asignado (lo lleva otro asesor)']);
	let slugTouched = Boolean(data.slug);
	const datosForm = { ...data, acuerdo: acuerdoInicial, socio: { margen: V.MARGEN, ...(socioGuardado || {}) }, vacacional: { nochesMin: 1, huespedesMax: 2, checkIn: '15:00', checkOut: '11:00', ...(data.vacacional || {}) } };
	mascotasUnaVez(datosForm);
	const form = renderForm(schema(agentOpts, isNew, socioOpts, ajeno), datosForm, { folder: `properties/${ref.id}` });
	form.el.addEventListener('input', (e) => { if (e.target.closest('[data-campo^="acuerdo."]')) acuerdoTocado = true; });
	form.el.addEventListener('change', (e) => { if (e.target.closest('[data-campo^="acuerdo."]')) acuerdoTocado = true; });
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
	}, h('span', { class: 'icon-list-ul', 'aria-hidden': 'true' }), ' Sugerir');
	const grupoCodigo = h('div', { class: 'input-group has-validation' });
	codigoInput.replaceWith(grupoCodigo);
	grupoCodigo.append(codigoInput, sugerir, avisoCodigo);
	revisarCodigo();

	// Código y siglas automáticos: mientras el código esté vacío o sea el que se armó solo, se
	// rehace al cambiar condominio, dirección, zona o asesor. Si lo escribes a mano, se respeta.
	const siglasInput = form.el.querySelector('[data-campo="condominioSiglas"] input');
	let codigoAuto = isNew && !normalizarCodigo(codigoInput.value);
	const rehacerCodigo = () => {
		const d = form.getData();
		if (siglasInput) siglasInput.placeholder = siglasCondominio(d.condominioSiglas, d.direccion);
		if (!codigoAuto) return;
		codigoInput.value = generarCodigo(d, { agentes, codigos: codigosUsados() });
		form.state.codigo = codigoInput.value;
		revisarCodigo();
	};
	codigoInput.addEventListener('input', (e) => { if (e.isTrusted) codigoAuto = !normalizarCodigo(codigoInput.value); });
	['input', 'change'].forEach((t) => form.el.addEventListener(t, (e) => { if (e.target !== codigoInput) rehacerCodigo(); }));
	rehacerCodigo();

	const textoEn = (en) => JSON.stringify([en?.titulo || '', en?.descripcion || '', en?.amenidades || [], en?.seo || {}, en?.vipLanding || {}, TEXTOS_VAC.map((k) => en?.vacacional?.[k] || '')]);

	// La versión en inglés se ve mientras se llena la ficha: se traduce sola al terminar de escribir el español
	// (al salir del campo), sin esperar a «Guardar». Lo corregido a mano se respeta.
	const CAMPOS_EN = ['titulo', 'descripcion', 'amenidades', 'seo.titulo', 'seo.descripcion', 'vipLanding.titular', 'vipLanding.ctaTexto',
		'vipLanding.subtitular', 'vipLanding.puntosClave', ...TEXTOS_VAC.map((k) => `vacacional.${k}`)];
	let enAuto = data.en || {}, turnoEn = 0, enCurso = Promise.resolve();
	const estadoEn = h('div', { class: 'col-12 small text-muted', role: 'status' });
	form.el.querySelector('[data-campo="en.titulo"]').before(estadoEn);
	// Lo que se manda a traducir: lo mismo que queda público al guardar. De una casa por noche no van la dirección
	// ni el mapa (privados) y el precio es el que ve el cliente, no el del socio.
	const paraTraducir = () => {
		const d = form.getData();
		// «en» es el guardado: las direcciones anteriores en inglés salen de lo publicado, no de un borrador sin guardar.
		d.en = data.en || {};
		if (esVacacional(d)) return { ...d, ...vacacionalPublico(mascotasUnaVez(d)), direccion: '', mapa: '' };
		delete d.vacacional;
		return d;
	};
	const traducirEnVivo = async () => {
		const s = form.state;
		s.en = s.en || {};
		if (s.en.titulo && textoEn(s.en) !== textoEn(enAuto)) s.en.manual = true;
		if (!String(s.descripcion || '').trim() || !faltaIngles(s)) return;
		const turno = ++turnoEn, antes = textoEn(s.en);
		estadoEn.textContent = 'Traduciendo al inglés…';
		try {
			const en = await traducirEn(paraTraducir());
			if (turno !== turnoEn) return;
			// Si alguien corrigió el inglés mientras se traducía, manda su corrección.
			if (textoEn(form.state.en) !== antes) { form.state.en.manual = true; estadoEn.textContent = ''; return; }
			CAMPOS_EN.forEach((k) => form.poner(`en.${k}`, getPath(en, k)));
			Object.assign(form.state.en, { slugsAnteriores: en.slugsAnteriores, fuente: en.fuente, manual: false });
			enAuto = clonar(form.state.en);
			estadoEn.textContent = 'Traducción automática lista: revísala.';
		} catch {
			if (turno === turnoEn) estadoEn.textContent = 'No se pudo traducir ahora; se intenta de nuevo al guardar.';
		}
	};
	form.el.addEventListener('change', (e) => { if (!e.target.closest('[data-campo^="en."]')) enCurso = traducirEnVivo(); });

	const recargar = async () => {
		const view = document.getElementById('view').firstElementChild;
		view.replaceChildren();
		await render(view, [ref.id]);
	};

	const save = async (btn) => {
		if (!form.validate()) return;
		// Si la traducción en vivo va en camino, se espera: así no se traduce dos veces.
		btn.disabled = true;
		await enCurso;
		btn.disabled = false;
		const d = form.getData();
		// Lo del socio nunca va al documento público (ni a la traducción).
		const socio = d.socio || {};
		delete d.socio;
		// El acuerdo con el dueño tampoco (privado/acuerdo).
		const delFormulario = d.acuerdo || {};
		delete d.acuerdo;
		let llegada = null;
		// El socio de la casa ya está en Propietarios: su nombre, teléfono y asesor salen de ahí, no se vuelven a escribir.
		const dueno = propietarios.find((p) => p.id === d.propietarioId) || null;
		if (esVacacional(d)) {
			if (!d.propietarioId) return toast('Elige el socio de la casa. Si todavía no existe, créalo en Propietarios.', 'warning');
			// Socio de otro asesor: se conserva lo ya guardado de él.
			if (dueno) {
				if (dueno.agentId) d.agentId = dueno.agentId;
				Object.assign(socio, { nombre: dueno.nombre || '', telefono: dueno.telefono || '' });
			}
			if (!(Number(socio.precioBase) > 0)) return toast('Escribe el precio por noche del socio.', 'warning');
			mascotasUnaVez(d);
			Object.assign(d, vacacionalPublico({ ...d, socio }));
			// La dirección y el mapa salen del documento público antes de armar código, SEO y traducción.
			llegada = { direccion: String(d.direccion || '').trim(), mapa: String(d.mapa || '').trim() };
			Object.assign(d, { direccion: '', mapa: '' });
			// Lo que no aplica a una casa por noche no se guarda aunque venga de cuando era venta o renta.
			Object.assign(d, { vip: false, mantenimiento: '' });
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
		if (isNew) {
			// Lo que lleva toda propiedad al nacer: historial de estado y de precio, y quién la creó.
			Object.assign(d, propiedadNueva(d));
		} else {
			// Fecha e historial del estado (setDoc reemplaza el documento: el historial se arma completo).
			d.estado = estadoDe(d).valor;
			d.historialEstado = data.historialEstado || [];
			if (estadoDe(data).valor !== d.estado) {
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
				if (!ultimo && Number(data.precio) && Number(data.precio) !== precioNuevo) {
					d.historialPrecio.push({ precio: Number(data.precio), moneda: data.moneda || 'USD', fecha: data.createdAt || Timestamp.now() });
				}
				const sinCambio = !ultimo && Number(data.precio) === precioNuevo;
				d.historialPrecio = [...d.historialPrecio, { precio: precioNuevo, moneda: d.moneda || 'USD', fecha: (sinCambio && data.createdAt) || Timestamp.now() }];
			}
			d.updatedAt = serverTimestamp();
			d.updatedBy = session.user.uid;
		}
		// Versión en inglés automática: si alguien la corrigió a mano, se respeta.
		d.en = d.en || {};
		if (d.en.titulo && textoEn(d.en) !== textoEn(enAuto)) d.en.manual = true;
		const traducirAhora = faltaIngles(d);
		if (!d.vip && d.titulo) llenarSeo(d);
		llenarAltFotos(d);
		btn.disabled = true;
		try {
			// Lo privado se guarda antes de quitarlo de lo público (en una casa nueva, después: su regla lee la casa).
			const guardarLlegada = () => llegada && setDoc(llegadaRef, { ...llegada, updatedAt: serverTimestamp(), updatedBy: session.user.uid });
			if (!isNew) await guardarLlegada();
			await setDoc(ref, d);
			if (isNew) await guardarLlegada();
			if (!llegada && eraVacacional) await deleteDoc(llegadaRef).catch(() => {});
			// (Va después de guardar la casa: su regla la lee.)
			const acuerdo = acuerdoPorGuardar(d, delFormulario);
			if (acuerdo === 'borrar') await deleteDoc(acuerdoRef);
			else if (acuerdo) await setDoc(acuerdoRef, { ...acuerdo, updatedAt: serverTimestamp(), updatedBy: session.user.uid });
			// Lo recién guardado es el punto de partida de un segundo «Guardar» sin recargar.
			if (acuerdo) acuerdoPropio = acuerdo === 'borrar' ? null : acuerdo;
			acuerdoTocado = false;
			eraVacacional = Boolean(llegada);
			if (esVacacional(d)) {
				await setDoc(privRef, {
					precioBase: Number(socio.precioBase) || 0, precioFinde: Number(socio.precioFinde) || 0,
					margen: socio.margen === null || socio.margen === undefined || socio.margen === '' ? V.MARGEN : Number(socio.margen),
					tarifas: (socio.tarifas || []).filter((t) => t.desde && t.hasta && Number(t.precio) > 0).map((t) => ({ desde: t.desde, hasta: t.hasta, precio: Number(t.precio) })),
					nombre: socio.nombre || '', telefono: socio.telefono || '', icalUrl: String(socio.icalUrl || '').trim(),
					updatedAt: serverTimestamp(), updatedBy: session.user.uid
				});
			}
			// La casa queda en la lista de su dueño y sale de la de cualquier otro; su `porNoche` se recalcula
			// (una sola forma de enlazar: asignarDueno). El acuerdo ya lo decidió acuerdoPorGuardar.
			// Una casa enlazada solo desde la lista de su dueño (sin propietarioId antes ni ahora) se deja como está.
			if (data.propietarioId || d.propietarioId) await asignarDueno({ id: ref.id, propietarioId: data.propietarioId, operacion: d.operacion }, d.propietarioId || '', { duenos: propietarios, casas: all, escribirCasa: false, conservarAcuerdo: true });
			if (!isNew) refrescarPortalesDe([ref.id]);
			await form.flushDeletes();
			await markPending(`Propiedad: ${d.titulo}`);
			const casa = { id: ref.id, ...d };
			if (!traducirAhora) {
				toast('Propiedad guardada. Recuerda publicar para ver los cambios en el sitio.');
				if (emb) emb.alGuardar(casa);
				else if (isNew) location.hash = `#/propiedades/${ref.id}`;
				return;
			}
			btn.textContent = 'Traduciendo al inglés…';
			try {
				await updateDoc(ref, { en: await traducirEn(d), updatedAt: serverTimestamp() });
				toast('Propiedad guardada y traducida al inglés. Recuerda publicar para ver los cambios en el sitio.');
			} catch (err) {
				toast('Propiedad guardada, pero no se pudo traducir al inglés. Vuelve a guardar o usa "EN · Traducir al inglés".', 'warning');
			}
			if (emb) emb.alGuardar(casa);
			else if (isNew) location.hash = `#/propiedades/${ref.id}`;
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
			await eliminarPropiedad({ ...data, id: ref.id });
			await markPending(`Propiedad eliminada: ${data.titulo}`);
			toast('Propiedad eliminada.');
			if (emb) emb.alEliminar(ref.id);
			else location.hash = '#/propiedades';
		} catch (err) {
			showError(err);
		}
	};

	// Duplicar: nace como toda propiedad nueva (propiedadNueva), sin publicar, con URL y código propios y sin el
	// historial, las URL anteriores, la difusión ni la versión en inglés de la original. Reutiliza las fotos sin su
	// ruta de almacenamiento, para que borrar fotos de la copia no elimine las de la original. Una casa por noche
	// lleva también su privado (socio y llegada); el acuerdo con el dueño no se copia.
	const duplicate = async (btn) => {
		btn.disabled = true;
		try {
			const newRef = doc(collection(db, 'properties'));
			const vac = esVacacional(data);
			// Sin «catch»: «no se pudo leer» no es «no existe» (la copia quedaría sin precio del socio ni dirección).
			const [socioPriv, llegadaPriv] = vac ? await Promise.all([getDoc(privRef), getDoc(llegadaRef)]) : [];
			const { historialPrecio, historialEstado, slugsAnteriores, difusion, en, codigo, ...base } = data;
			const titulo = `${data.titulo} (copia)`;
			const d = propiedadNueva({
				...base,
				titulo,
				slug: slugLibre(titulo, new Set(all.map((p) => p.slug).filter(Boolean))),
				// Todos los códigos cuentan, también el de la original.
				codigo: generarCodigo(data, { agentes, codigos: all.map((p) => p.codigo).filter(Boolean) }),
				publicado: false,
				destacada: false,
				fotos: (data.fotos || []).map(({ url, alt }) => ({ url, alt: alt || '' })),
				agentId: session.isAdmin ? data.agentId || '' : session.agentId,
				// La dirección y el mapa de una casa por noche son privados (data los trae de privado/llegada).
				...(vac ? { direccion: '', mapa: '' } : {})
			});
			await setDoc(newRef, d);
			// Después de crear la casa: su regla la lee.
			if (vac) {
				const sinSello = (s) => { const { updatedAt, updatedBy, ...resto } = s.data() || {}; return resto; };
				await guardarPrivadoVacacional(newRef.id, sinSello(socioPriv), sinSello(llegadaPriv));
			}
			if (data.propietarioId) await asignarDueno({ id: newRef.id, propietarioId: data.propietarioId, operacion: data.operacion }, data.propietarioId, { duenos: propietarios, casas: all, escribirCasa: false, conservarAcuerdo: true });
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
			const datos = paraTraducir();
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
	const eliminarBtn = !isNew && session.isAdmin ? h('button', { class: 'btn btn-outline-danger ms-auto', onclick: remove }, 'Eliminar') : null;
	const cuerpo = [
		!isNew ? h('p', { class: 'small text-muted' }, `Última actualización: ${formatDate(data.updatedAt)}`) : null,
		vigilarFormulario(form, 'propiedades'),
		h('div', { class: 'card' }, h('div', { class: 'card-body' }, form.el))];
	if (emb) {
		// Dentro de una ventana: mismos datos y mismo guardado; los botones van al pie de la ventana.
		container.replaceChildren();
		mount(container, ...cuerpo);
		emb.pie.replaceChildren(saveBtn, h('button', { type: 'button', class: 'btn btn-light', 'data-bs-dismiss': 'modal' }, 'Cancelar'), ...(eliminarBtn ? [eliminarBtn] : []));
		return;
	}
	mount(container, 
		pageHeader(isNew ? 'Nueva propiedad' : data.titulo,
			!isNew ? h('a', { href: `#/difusion/${id}`, class: 'btn btn-outline-primary' }, '📣 Difundir en portales') : null,
			!isNew ? h('a', { href: `#/ia/redactar/${id}`, class: 'btn btn-outline-primary' }, 'Armar borrador de ficha') : null,
			!isNew ? h('button', { class: 'btn btn-outline-primary', type: 'button', onclick: (e) => traducir(e.currentTarget) }, 'EN · Traducir al inglés') : null,
			!isNew && data.publicado ? h('a', { href: publicUrl(data), target: '_blank', class: 'btn btn-outline-primary' }, 'Ver en el sitio') : null,
			h('a', { href: '#/propiedades', class: 'btn btn-light' }, 'Volver')),
		...cuerpo,
		h('div', { class: 'sticky-actions' },
			saveBtn,
			h('a', { href: '#/propiedades', class: 'btn btn-light' }, 'Cancelar'),
			!isNew ? h('button', { class: 'btn btn-outline-secondary', onclick: (e) => duplicate(e.currentTarget) }, 'Duplicar') : null,
			eliminarBtn));
}

// Abre la ficha del inmueble en una ventana, desde otra pantalla (p. ej. la ficha de su dueño), para crear una
// («nuevo», con «inicial»: dueño y operación ya puestos) o editarla. Es la misma ficha de #/propiedades/….
export function abrirFicha(id, { inicial, titulo, alGuardar, alEliminar } = {}) {
	const cuerpo = h('div', {}, spinner()), pie = h('div', { class: 'd-flex flex-wrap gap-2 w-100' });
	const ventana = modal({ title: titulo || (id === 'nuevo' ? 'Nueva propiedad' : 'Editar propiedad'), size: 'modal-xl modal-fullscreen-lg-down', body: cuerpo, footer: pie });
	renderEditor(cuerpo, id, {
		inicial, pie,
		alGuardar: (casa) => { ventana.close(); if (alGuardar) alGuardar(casa); },
		alEliminar: (casaId) => { ventana.close(); if (alEliminar) alEliminar(casaId); }
	}).catch(showError);
}

export { spinner };
