import {
	db, doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where, serverTimestamp, arrayUnion, arrayRemove, Timestamp, runTransaction, writeBatch
} from '../firebase.js';
import {
	h, toast, showError, confirmDialog, pageHeader, badge, emptyState, formatPrice, formatDate, slugify, spinner
, mount, downloadCsv, cajaTabla, iconoBtn, menuMas, modal, errorMessage, elegirOpcion, ocupado, fallaDelServidor, botonNuevaCasa } from '../ui.js';
import { renderForm, borrarFotosSinUso, uploadImage, procesarImagen, getPath, clonar } from '../form.js';
import { session, agentOptions, loadAgents, markPending, trasGuardar, misCasas } from '../session.js';
import { datosParaServidor, revisarCasaNueva } from '../casa-nueva.js';
import { campoCalendarioEq } from '../calendario-eq.js';
import { seoPreviewField, stripMd } from '../seo.js';
import { autoSeoTitle, autoSeoDescripcion, huespedesDe, recortar, resumenSeo } from '../seo-auto.js';
import { pedirIA } from '../ia.js';
import { tituloEn, tituloEnViejo } from '../reglas.js';
import { updateDoc, SITIO } from '../firebase.js';
import { ESTADOS_PROPIEDAD, amenidadesPara, amenidadesEnDe, precioVisible, textosConPrecioOculto, mascotasUnaVez, estadosPara, tipoAplica, incoherencia, OPERACIONES, TIPOS, operacionDe, estadoDe, visibilidadDe } from '../estados.js';
import { generarCodigo, normalizarCodigo, siglasCondominio, PLANTILLA } from '../importar.js';
import { revisar, vigilarFormulario } from '../pendientes.js';
import { refrescarPortalesDe } from '../portal.js';
import { generarDescripcion } from '../descripcion.js';
import { miles, dinero, whatsappUrl, slugLibre } from '../formato.js';
import { filaCasa, publicUrl } from '../ficha-casa.js';
import { sinTildes, REGIMENES, MODOS } from '../cotizacion.js';
import { acuerdoDe, acuerdoHeredado, camposDelAcuerdo, CAMPOS_ACUERDO } from '../acuerdo.js';
import { loadPropietarios } from '../crm.js';
import { asignarDueno, confirmarCambioDeDueno } from '../enlace-dueno.js';
import { deLaCasa, porVenir, avisoPorVenir, refContacto, alDiaEnLaWeb } from '../reservas.js';
import { faltaDireccion } from '../reservas-calculo.js';
import { tieneCasasPorNoche } from '../duenos.js';
import { cambiosEntre, aplicarCambios, historialCon, entradaEstado, huespedesMaxDe, vacacionalPublico, planSocioDe, casaBase, casaQueNace } from '../cambios-casa.js';
import { guardarPrivadoVacacional, socioLimpio, crearCasa } from '../privado-casa.js';
import { anotar, bitacoraActiva, verCambios } from '../bitacora-panel.js';
import { fotoCasa, igual } from '../bitacora.js';
import { propiedadParaIA } from '../para-ia.js';
import { TEXTOS_VAC, fuenteEs, faltaIngles, fuenteTraducida } from '../ingles.js';
import '/js/calc-vacacional.js';

const V = window.EQVacacional;

const faltanDe = (p) => revisar('propiedades', p);

// Mismo SEO automático que usa el generador del sitio (admin/js/seo-auto.js).
const autoTitle = (d) => autoSeoTitle(d);
const autoDescription = (d) => autoSeoDescripcion(d, formatPrice(precioVisible(d), d.moneda, d.operacion), [
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
	await borrarFotosSinUso(paths, p.id);
}

// Pone la marca de agua a las fotos ya subidas que no la tienen. Sube una copia nueva con marca
// y guarda la ruta de la original en «sinMarca». Devuelve la galería nueva, o null si no cambió nada.
// Traduce (sin IA: diccionario, plantillas y traductor gratuito) los textos en español y devuelve la versión en inglés.
// Qué se traduce y cuándo falta: admin/js/ingles.js.
export { fuenteEs, faltaIngles };
// La dirección en inglés sale del título: al cambiarlo se guarda el anterior para redirigir.
// Descripción para Google escrita a mano pero muy corta (menos de 70): el sitio pone la automática (templates.mjs).
const propiaCorta = (t) => Boolean(t) && String(t).length < 70;
const titulosEnAnteriores = (en, titulo) => [...new Set([...(en?.slugsAnteriores || []), en?.slug ? '' : en?.titulo])].filter((t) => t && t !== titulo);
// Al traductor va solo lo público: pedirIA lo limpia con admin/js/para-ia.js.
export async function traducirEn(d) {
	const r = await pedirIA('traducir', { propiedad: d });
	return {
		// Una amenidad por cada una en español: si la traducción trae menos, sale del diccionario (no se pierde ninguna).
		titulo: r.titulo || '', descripcion: r.descripcion || '', amenidades: amenidadesEnDe({ amenidades: d.amenidades, en: { amenidades: r.amenidades } }),
		// A qué lista en español corresponde cada una (estados.js `amenidadesEnDe`).
		amenidadesDe: [...(d.amenidades || [])],
		seo: {
			titulo: r.seoTitulo || (r.titulo ? autoSeoTitle({ ...d, titulo: r.titulo }, true) : ''),
			descripcion: r.seoDescripcion || recortar(resumenSeo(r.descripcion), 155)
		},
		vipLanding: { titular: r.vipTitular || '', subtitular: r.vipSubtitular || '', puntosClave: r.puntosClave || [], ctaTexto: r.ctaTexto || '' },
		vacacional: Object.fromEntries(TEXTOS_VAC.map((k) => [k, r[k] || ''])),
		slugsAnteriores: titulosEnAnteriores(d.en, r.titulo),
		fuente: fuenteTraducida(d, r),
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

// Los tipos viven en estados.js; se reexportan para quien ya los importa de aquí.
export { TIPOS };
// La lista de operaciones vive en estados.js; se reexporta para quien ya la importa de aquí.
export { OPERACIONES };
const esVacacional = (d) => d.operacion === 'vacacional';
const HORAS = Array.from({ length: 24 }, (_, i) => { const hh = `${String(i).padStart(2, '0')}:00`; return [hh, hh]; });

// Renta vacacional. Lo privado (costo del socio, margen, contacto, enlace iCal) vive en
// properties/{id}/privado/socio, que solo lee el equipo. En el documento público solo quedan
// los precios por noche al público (base, fin de semana y tarifas por fechas) y las fechas ocupadas.
const hoyISO = () => V.hoy();
// Dónde saca el socio el enlace de cada calendario. Privado: la página solo muestra qué noches están ocupadas.
const AYUDA_ICAL = {
	Airbnb: 'Calendario → Disponibilidad → Conectar calendarios → Exportar.',
	Booking: 'Extranet: Tarifas y disponibilidad → Sincronizar calendarios → Exportar.',
	VRBO: 'Calendario → Importar/Exportar → Exportar.'
};
// Los precios públicos de una casa por noche salen del costo del socio (admin/js/cambios-casa.js, puro: también lo usa el
// servidor con la casa que sube el socio); se reexporta para quien ya lo importa de aquí.
export { vacacionalPublico, planSocioDe };
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
	el.replaceChildren(cajaTabla(h('table', { class: 'table table-admin table-sm align-middle mb-2 tabla-vacacional' },
		// En el orden en que se arma el precio: lo del socio, la ganancia, el precio, cada impuesto y lo que paga el cliente.
		h('thead', {}, h('tr', {}, ['Noche', 'Socio', `Ganancia ${V.r2(s.margen ?? V.MARGEN)} %`, 'Precio sin impuestos', `IVA ${V.IVA} %`, `INGUAT ${V.INGUAT} %`, 'El cliente paga']
			.map((t, i) => h('th', { scope: 'col', class: i ? 'text-end' : null }, t)))),
		h('tbody', {}, filas.map(([nombre, p]) => {
			const n = V.desgloseNoche(p, s.margen);
			return h('tr', {}, h('td', {}, nombre), [n.precioSocio, n.ganancia, n.nochePublica, n.iva, n.inguat].map((x) => h('td', { class: 'text-end' }, m(x))),
				h('td', { class: 'text-end fw-semibold' }, m(n.nocheConImpuestos)));
		})))),
	h('p', { class: 'small text-muted mb-0' },
		`En la página se publica "${m(V.precioDesde(pub, hoyISO()))} por noche" + impuestos (IVA ${V.IVA} % e INGUAT ${V.INGUAT} %). `,
		`Ejemplo de 7 noches desde hoy: el socio recibe ${m(ejemplo.costoSocio)} y la ganancia es ${m(ejemplo.ganancia)}. `,
		'La limpieza se cobra aparte sin margen y el depósito no lleva impuestos. Solo el equipo ve esta tabla.'));
}
export const ESTADOS = ESTADOS_PROPIEDAD.map((e) => [e.valor, e.label]);
// Amenidades de un toque en el editor; la ficha les pone su ícono.
export const MONEDAS = [['USD', 'Dólares (US$)'], ['GTQ', 'Quetzales (Q)']];

// Valores de una propiedad nueva (editor e importación).
// Precios por fechas de una casa por noche: hasta 10 (las reglas los revisan uno por uno; ver firestore.rules).
export const MAX_TARIFAS = 10;

export function datosIniciales() {
	return { ...casaBase(), agentId: session.isAdmin ? '' : session.agentId };
}

// Lo que lleva toda propiedad al nacer: su historial de estado y de precio empezado y quién la creó.
// Una sola para todo el panel: la usan la ficha (al guardar una nueva), «Duplicar» y el importador. El núcleo
// (casaQueNace, admin/js/cambios-casa.js) es el mismo que usa el servidor con la casa que sube el socio.
export function propiedadNueva(datos) {
	const d = casaQueNace({ ...datosIniciales(), ...datos }, autor());
	d.estadoFecha = serverTimestamp();
	d.createdAt = d.updatedAt = serverTimestamp();
	d.createdBy = d.updatedBy = session.user.uid;
	return d;
}
// Borra una propiedad con todo lo suyo: lo privado (socio, llegada, acuerdo, la llave del calendario de EQ y lo último
// leído de Airbnb/Booking/VRBO), el documento, sus fotos y su
// renglón en la lista de casas de su dueño. Una sola para todo el panel: la usan la ficha y el listado.
export async function eliminarPropiedad(p) {
	// Una casa por noche con huéspedes por venir no se borra; sin ellos, se borra también el contacto de sus huéspedes.
	const reservas = p.operacion === 'vacacional' ? await deLaCasa(p.id) : [];
	const pendientes = p.operacion === 'vacacional' ? await porVenir(p.id) : [];
	if (pendientes.length) throw new Error(avisoPorVenir(pendientes, `No se puede eliminar «${p.titulo}»`));
	// La casa y lo privado (también el contacto de sus huéspedes), en un solo lote: el precio del dueño y el margen
	// (privado/socio) solo se van con la casa (firestore.rules), y un corte o un rechazo no deja una casa sin su precio, ni
	// un privado suelto, ni sus huéspedes sin contacto con la casa todavía ahí. (Un lote lleva hasta 500: con más reservas
	// que eso, los contactos de más se borran antes, en lotes propios.)
	const contactos = reservas.map((r) => refContacto(p.id, r.id));
	const sobran = contactos.slice(0, Math.max(0, contactos.length - 480));
	for (let i = 0; i < sobran.length; i += 480) {
		const parte = writeBatch(db);
		sobran.slice(i, i + 480).forEach((ref) => parte.delete(ref));
		await parte.commit();
	}
	const lote = writeBatch(db);
	contactos.slice(sobran.length).forEach((ref) => lote.delete(ref));
	for (const privado of ['socio', 'llegada', 'acuerdo', 'calendario', 'icalLeido']) lote.delete(doc(db, 'properties', p.id, 'privado', privado));
	lote.delete(doc(db, 'properties', p.id));
	await lote.commit();
	await borrarFotos(p);
	// Cada renglón de esa lista es { propertyId } (Propietarios no guarda más). Si no se pudo quitar, la casa ya
	// no existe y la ficha del dueño no la muestra: se anota en la consola y el borrado sigue.
	try {
		const duenos = await getDocs(query(collection(db, 'propietarios'), where('propiedades', 'array-contains', { propertyId: p.id })));
		await Promise.all(duenos.docs.map((x) => updateDoc(x.ref, { propiedades: arrayRemove({ propertyId: p.id }) })));
	} catch (err) { console.warn('No se pudo quitar la casa de la lista de su dueño', err); }
}
// La URL libre vive en admin/js/formato.js (la usa también el servidor); se reexporta para quien ya la importa de aquí.
export { slugLibre };
// Lo que se revisa antes de guardar una casa, venga de la ficha o del importador (una sola regla para los dos):
//  - una casa por noche lleva dueño y no lleva asesor (agentId ''): sus solicitudes las atienden el administrador y
//    su dueño, y así ningún asesor lee el teléfono de sus huéspedes; tampoco lleva VIP ni mantenimiento. Por eso
//    solo el administrador la crea o la cambia (las reglas dejan al asesor solo casas con su agentId);
//  - con huéspedes por venir no deja de ser por noche (perderían sus fechas);
//  - con solicitudes abiertas no cambia de moneda (sus montos están en la moneda de antes: no se comparan);
//  - no se muestra en la página sin su dirección exacta (el cliente la recibe al pagar: revisarPublicar).
// antes = la casa guardada (null si es nueva); d = como queda: se le ponen los ajustes. Lanza un Error con el motivo.
// `direccion`: la que trae la ficha (sin ella, la guardada en privado/llegada).
// Devuelve { ajustes, sinLlegada }: sinLlegada = dejó de ser por noche (su dirección y mapa privados se borran).
export async function revisarCasa(antes, d, id, { direccion } = {}) {
	const era = antes?.operacion === 'vacacional', es = esVacacional(d);
	if ((es || era) && !session.isAdmin) throw new Error('Las casas por noche las lleva el administrador (no llevan asesor).');
	if (es && !d.propietarioId) throw new Error('Elige el dueño de la casa por noche. Si todavía no existe, créalo en Propietarios.');
	if (era && !es) {
		const pendientes = await porVenir(id);
		if (pendientes.length) throw new Error(avisoPorVenir(pendientes, 'No puede dejar de ser renta por noche'));
	}
	if (antes && es && (antes.moneda || 'USD') !== (d.moneda || 'USD')) {
		const abiertas = await solicitudesAbiertas(id);
		if (abiertas.length) throw new Error(`No se puede cambiar la moneda mientras tenga solicitudes abiertas (${abiertas.slice(0, 3).join(', ')}): sus montos están en la moneda de antes. Ciérralas o espera a que terminen.`);
	}
	await revisarPublicar({ ...d, id }, direccion);
	const ajustes = es ? { agentId: '', vip: false, mantenimiento: '' } : {};
	Object.assign(d, ajustes);
	return { ajustes, sinLlegada: era && !es };
}
// Solicitudes de la casa sin responder o confirmadas que no han terminado (sus códigos).
async function solicitudesAbiertas(id) {
	const hoy = V.hoy();
	return (await getDocs(query(collection(db, 'leads'), where('propertyId', '==', id)))).docs.map((x) => x.data())
		.filter((l) => l.reserva?.codigo && (!l.solicitud?.estado || l.solicitud.estado === 'pendiente' || (l.solicitud.estado === 'confirmada' && l.reserva.salida >= hoy)))
		.map((l) => l.reserva.codigo);
}
// Una casa por noche visible en la página lleva su dirección exacta (privado/llegada): sin ella, «Pago recibido» no
// tiene qué mandarle al cliente. Lo revisan la ficha, el importador y «Mostrar en la página» (una o varias).
export const SIN_DIRECCION_PUBLICAR = 'Para mostrar una casa por noche en la página, primero escribe su dirección exacta en la ficha: el cliente la recibe al pagar.';
export async function revisarPublicar(p, direccion) {
	if (!esVacacional(p) || !p.publicado) return;
	const dir = direccion !== undefined ? direccion : (await getDoc(doc(db, 'properties', p.id, 'privado', 'llegada')).catch(() => null))?.data()?.direccion;
	if (faltaDireccion({ direccion: dir })) throw new Error(SIN_DIRECCION_PUBLICAR);
}

// Casas por noche de antes con un asesor: lo pierden, y también sus reservas y solicitudes (con ese agentId el asesor
// leía el teléfono y el correo de los huéspedes). Primero lo que cuelga; al final la casa, así lo que falle se
// vuelve a intentar la próxima vez. Solo el administrador.
async function sinAsesorPorNoche(p) {
	const deCasa = (col) => getDocs(query(collection(db, col), where('propertyId', '==', p.id)));
	const [reservas, leads] = await Promise.all([deCasa('reservas'), deCasa('leads')]);
	for (const d of [...reservas.docs, ...leads.docs]) if (d.data().agentId) await updateDoc(d.ref, { agentId: '' });
	await updateDoc(doc(db, 'properties', p.id), { agentId: '' });
	p.agentId = '';
}

// Lo privado de una casa por noche (costo del socio, dirección y mapa) se escribe con guardarPrivadoVacacional
// (admin/js/privado-casa.js); se reexporta para quien ya lo importa de aquí.
export { guardarPrivadoVacacional, crearCasa };

// Guarda los cambios de una propiedad que ya existe. Una sola para el panel: la ficha y el importador.
// En una transacción vuelve a leer la casa (y el costo del socio) y pone encima solo lo que cambió quien guarda
// (admin/js/cambios-casa.js): lo que otra pantalla escribió mientras tanto (noches reservadas, días bloqueados,
// mínimos y precios del dueño, difusión, estado o visibilidad desde la lista) se queda. Con lo que resulta se
// calculan los precios públicos de una casa por noche y el historial de estado y de precio. Devuelve la casa guardada.
//  - cambios: campos de la casa («vacacional», campo por campo); undefined = quitarlo.
//  - socio: solo los campos del costo del socio que cambiaron. llegada: dirección y mapa de una casa por noche.
//  - sinLlegada: dejó de ser por noche; se borra privado/llegada.
export async function guardarCambios(id, cambios, { socio = null, llegada = null, sinLlegada = false } = {}) {
	const ref = doc(db, 'properties', id);
	const quien = autor();
	const conBitacora = await bitacoraActiva();
	return runTransaction(db, async (tx) => {
		const snap = await tx.get(ref);
		if (!snap.exists()) throw new Error('La propiedad ya no existe.');
		const antes = snap.data();
		const casa = aplicarCambios(antes, cambios);
		const vac = esVacacional(casa);
		// El costo del socio guardado AHORA (también en una casa que dejó de ser por noche: la bitácora lo compara).
		const guardado = (await tx.get(doc(db, 'properties', id, 'privado', 'socio')).catch(() => null))?.data() || {};
		const socioDespues = vac ? { ...guardado, ...socioLimpio(socio || {}) } : guardado;
		if (vac) {
			// El precio público sale del costo del socio guardado AHORA más lo que se cambió aquí.
			const pub = vacacionalPublico({ ...casa, socio: socioDespues });
			casa.precio = pub.precio;
			casa.vacacional = { ...casa.vacacional, ...pub.vacacional };
		}
		const hist = historialCon(antes, casa, quien);
		Object.assign(casa, { estado: hist.estado, historialEstado: hist.historialEstado, historialPrecio: hist.historialPrecio, updatedAt: serverTimestamp(), updatedBy: session.user.uid });
		if (hist.cambioEstado) casa.estadoFecha = serverTimestamp();
		// Moneda, dueño, limpieza, precios del dueño o margen: su renglón en la bitácora, en esta misma transacción.
		const bitacoraId = anotar(tx, { tipo: 'casa', objeto: id, casa: id, antes: fotoCasa(antes, guardado), despues: fotoCasa(casa, socioDespues) }, conBitacora);
		if (bitacoraId) casa.bitacoraId = bitacoraId;
		tx.set(ref, casa);
		if (vac) await guardarPrivadoVacacional(id, socio, llegada, tx, { bitacoraId: igual(fotoCasa({}, guardado), fotoCasa({}, socioDespues)) ? '' : bitacoraId });
		if (sinLlegada) tx.delete(doc(db, 'properties', id, 'privado', 'llegada'));
		return casa;
	});
}

export { publicUrl };

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

// Quién y cuándo, para el historial de estados (serverTimestamp no se permite dentro de arreglos).
function autor() {
	return { fecha: Timestamp.now(), por: session.profile?.nombre || session.user?.email || '', porUid: session.user?.uid || '' };
}
export const entradaHistorial = (estado) => entradaEstado(estado, autor());

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
				...Object.fromEntries(V.CALENDARIOS.map((c) => [c.columna, s[c.campo]])),
				enlaces_fotos: (p.fotos || []).map((f) => f.url).filter(Boolean).join(' '),
				enlace: p.slug ? `${SITIO}${publicUrl(p)}` : '',
				publicado: p.publicado ? 'sí' : 'no'
			};
			filas.push(cab.map((c) => String(val[c] ?? '')));
		}
		downloadCsv(`propiedades-${hoyISO()}.csv`, filas);
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
	if (session.isAdmin) {
		const conAsesor = props.filter((p) => esVacacional(p) && p.agentId);
		// (Sus páginas llevan el asesor en el formulario: hay que volver a publicar.)
		try { for (const p of conAsesor) await sinAsesorPorNoche(p); if (conAsesor.length) await markPending('Casas por noche sin asesor'); } catch (err) { console.warn('Casas por noche con asesor sin poner al día', err); }
		// El precio del socio de cada casa por noche, para «Faltan» (sin él, la reserva de la web no tiene piso). No se inventa.
		await Promise.all(props.filter(esVacacional).map(async (p) => {
			try { p.socio = (await getDoc(doc(db, 'properties', p.id, 'privado', 'socio'))).data() || {}; } catch { /* sin leer: no se marca */ }
		}));
	}
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
	const lista = h('div', { class: 'lista-casas' });
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

	// Una casa por fila, en todos los tamaños (docs: lista de propiedades). Foto, datos y, a la derecha,
	// el ⚠ con lo que falta (o ✓) arriba y el ⋮ abajo. Tocar la fila abre la ficha; en «Elegir varias», la marca.
	const avisosDe = (p, editable) => {
		const motivo = motivoVisibilidad(p);
		return [
			motivo.color === 'success' ? null : { icono: motivo.icono, texto: `No sale en la página: ${motivo.texto}`, href: `#/propiedades/${p.id}` },
			...faltanDe(p).map((f) => ({ icono: 'icon-pencil', texto: `Falta: ${f.etiqueta}`, href: `#/propiedades/${p.id}` })),
			editable && p.titulo && faltaIngles(p) ? { icono: 'icon-globe', texto: 'Falta la versión en inglés', onclick: () => traducir([p]) } : null
		].filter(Boolean);
	};
	const fila = (p) => {
		const editable = canEdit(p);
		const motivo = motivoVisibilidad(p);
		const nombre = p.titulo || 'la propiedad';
		const enSitio = p.publicado && p.slug;
		const enlaceWa = enSitio && whatsappUrl('', `${p.titulo || 'Propiedad'} — ${formatPrice(precioVisible(p), p.moneda, p.operacion)}\n${SITIO}${publicUrl(p)}`);
		const cambiarEstado = async () => {
			// Solo los estados que aplican a su operación (incoherencia): una casa por noche no queda «Vendida».
			const opciones = estadosPara(p.operacion || 'venta');
			const label = await elegirOpcion(`Estado de ${nombre}`, opciones.map((e) => e.label));
			const estado = opciones.find((e) => e.label === label)?.valor;
			if (!estado || estado === estadoDe(p).valor) return;
			guardarRapido(p, cambioDeEstado(estado), { estado }, `Estado de ${p.titulo}: ${label}`, `Estado cambiado a «${label}». ${trasGuardar()}`);
		};
		const alternarVisible = async () => {
			const publicado = !p.publicado;
			try { await revisarPublicar({ ...p, publicado }); } catch (err) { return toast(err.message, 'warning'); }
			guardarRapido(p, { publicado }, { publicado }, `${publicado ? 'Visible' : 'Oculta'}: ${p.titulo}`,
				`${publicado ? 'Visible en la página.' : 'Oculta de la página.'} ${trasGuardar()}`);
		};
		// Lo que más se usa, arriba; borrar, al final. Tocar la fila ya abre la ficha (sin «Editar»).
		const menu = menuMas(`Acciones de ${nombre}`, [
			enSitio && { icono: 'icon-whatsapp', texto: 'Compartir por WhatsApp', target: '_blank', href: enlaceWa },
			enSitio && { icono: 'icon-external-link', texto: 'Ver en la página', target: '_blank', href: publicUrl(p) },
			editable && { icono: 'icon-exchange', texto: `Cambiar estado (${estadoDe(p).label})`, onclick: cambiarEstado },
			editable && { icono: p.publicado ? 'icon-eye-slash' : 'icon-eye', texto: p.publicado ? 'Ocultar de la página' : 'Mostrar en la página', onclick: alternarVisible },
			editable && { icono: 'icon-list-ul', texto: 'Mejorar descripción', onclick: () => mejorar([p]) },
			editable && { icono: 'icon-search', texto: 'Completar SEO', onclick: () => completarSeo([p]) },
			editable && { icono: 'icon-globe', texto: 'Traducir al inglés', onclick: () => traducir([p]) },
			session.isAdmin && { icono: 'icon-trash-o', texto: 'Eliminar', peligro: true, onclick: () => eliminar([p]) }
		]);
		const avisos = avisosDe(p, editable);
		const sel = h('input', {
			class: 'form-check-input', type: 'checkbox', checked: seleccion.has(p.id), disabled: !editable,
			'aria-label': `Elegir ${nombre}`,
			onchange: (e) => { e.target.checked ? seleccion.add(p.id) : seleccion.delete(p.id); pintarBarra(); }
		});
		// Computadora: una sola línea de más (código, asesor y fecha), para no saturar la fila.
		const extra = [p.codigo ? h('code', {}, p.codigo) : null,
			agentName[p.agentId] ? h('span', { title: 'Asesor' }, h('span', { class: 'icon-user', 'aria-hidden': 'true' }), h('span', { class: 'casa-nombre' }, agentName[p.agentId])) : null,
			p.updatedAt ? h('span', { title: 'Última actualización' }, h('span', { class: 'icon-clock-o', 'aria-hidden': 'true' }), formatDate(p.updatedAt, false)) : null].filter(Boolean);
		return filaCasa(p, {
			oculta: motivo.color !== 'success', sel, extra,
			alTocar: () => { location.hash = `#/propiedades/${p.id}`; },
			der: [avisos.length ? menuMas(`Pendientes de ${nombre}`, avisos, { icono: 'icon-exclamation-triangle', cls: 'casa-aviso' })
				: h('span', { class: 'casa-ok', role: 'img', title: 'Todo en orden', 'aria-label': 'Todo en orden' }, h('span', { class: 'icon-check-circle', 'aria-hidden': 'true' })),
			menu]
		});
	};

	const draw = () => {
		const q = sinTildes(search.value.trim());
		const rows = props.filter((p) =>
			(!q || sinTildes(`${p.titulo} ${p.codigo || ''} ${p.socio?.codigoSocio || ''} ${p.zona} ${p.direccion} ${p.ciudad}`).includes(q))
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
		lista.replaceChildren(...rows.map(fila));
		vacio.hidden = rows.length > 0;
		pintarBarra();
	};

	// ---- Acciones en masa ----
	const seleccion = new Set();
	let visibles = [];
	const elegidas = () => props.filter((p) => seleccion.has(p.id));
	const btnTodas = h('button', { type: 'button', class: 'btn btn-sm btn-link p-0 solo-eligiendo',
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
		// Lo que el panel revisa (p. ej. la dirección para mostrar una casa por noche) se dice; un error de la base, no.
		let motivo = '';
		for (const p of lista) {
			try { await accion(p); ok++; } catch (err) { fallos.push(p.titulo || p.id); if (!err.code && !motivo) motivo = err.message; console.error(err); }
		}
		refrescarPortalesDe(lista.map((p) => p.id));
		if (ok) await markPending(`${desc} (${ok})`).catch(() => {});
		if (ok) toast(aviso(ok));
		if (fallos.length) toast(`No se pudieron cambiar ${fallos.length}: ${fallos.slice(0, 3).join(', ')}${fallos.length > 3 ? '…' : ''}${motivo ? `. ${motivo}` : ''}`, 'danger');
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
		// Solo a las que ese estado aplica (una casa por noche no queda «Vendida»); las demás se nombran y no se tocan.
		const elegidasAhora = elegidas();
		const fuera = elegidasAhora.filter((p) => incoherencia({ operacion: p.operacion || 'venta', estado }));
		if (fuera.length) toast(`${incoherencia({ operacion: fuera[0].operacion || 'venta', estado })}: no se cambió ${fuera.length === 1 ? `«${fuera[0].titulo}»` : `en ${fuera.length} propiedades`}.`, 'warning');
		const lista = elegidasAhora.filter((p) => !fuera.includes(p));
		if (!lista.length) { selMasaEstado.value = ''; return; }
		enMasa(guardarMasa(cambioDeEstado(estado), { estado }), `Estado cambiado a ${label}`,
			(n) => `${n} cambiada${n === 1 ? '' : 's'} a «${label}». ${trasGuardar()}`, lista);
		seleccion.clear();
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
		// Una casa por noche no lleva asesor (revisarCasa): se nombra y no se toca.
		const porNoche = elegidas().filter(esVacacional);
		if (porNoche.length) toast(`Las casas por noche no llevan asesor: no se cambió ${porNoche.length === 1 ? `«${porNoche[0].titulo}»` : `en ${porNoche.length} propiedades`}.`, 'warning');
		await enMasa(guardarMasa({ agentId }, { agentId }), `Asesor asignado: ${nombre}`,
			(n) => `${n} asignada${n === 1 ? '' : 's'} a ${nombre}.`, elegidas().filter((p) => !esVacacional(p)));
		seleccion.clear();
		selMasaAsesor.value = '';
	});
	const btnMostrar = h('button', { type: 'button', class: 'btn btn-sm btn-outline-primary',
		onclick: () => enMasa(async (p) => { await revisarPublicar({ ...p, publicado: true }); await guardarMasa({ publicado: true }, { publicado: true })(p); }, 'Visibles en la página',
			(n) => `${n} visible${n === 1 ? '' : 's'} en la página. ${trasGuardar()}`) },
		h('span', { class: 'icon-eye', 'aria-hidden': 'true' }), ' Mostrar');
	const btnOcultar = h('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary',
		onclick: () => enMasa(guardarMasa({ publicado: false }, { publicado: false }), 'Ocultas de la página',
			(n) => `${n} oculta${n === 1 ? '' : 's'}. ${trasGuardar()}`) },
		h('span', { class: 'icon-eye-slash', 'aria-hidden': 'true' }), ' Ocultar');
	const mejorar = async (lista) => {
		const l = lista || elegidas();
		if (!(await confirmDialog(`¿Mejorar la descripción de ${nombreDe(l)}? Queda el párrafo de presentación y la nota de lo que no incluye el precio; se quitan las listas copiadas de la ficha (habitaciones, amenidades, estadía), que la página ya muestra de sus campos. El texto anterior queda guardado como respaldo.`, { okText: 'Mejorar', danger: false }))) return;
		await enMasa(async (p) => {
			const descripcion = generarDescripcion(propiedadParaIA(p));
			if (descripcion === p.descripcion) return;
			await guardarMasa({ descripcion, descripcionAnterior: p.descripcion || '' }, { descripcion, descripcionAnterior: p.descripcion || '' })(p);
		}, 'Descripciones mejoradas', (k) => `${k} descripción${k === 1 ? '' : 'es'} lista${k === 1 ? '' : 's'}. Revísalas y publica.`, lista);
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
			}, 'Descripción anterior', (k) => `${k} descripción${k === 1 ? '' : 'es'} restaurada${k === 1 ? '' : 's'}. ${trasGuardar()}`);
		} },
		h('span', { class: 'icon-undo', 'aria-hidden': 'true' }), ' Volver a la anterior');
	const traducir = async (lista) => {
		const l = lista || elegidas();
		if (!(await confirmDialog(`¿Traducir al inglés ${nombreDe(l)}? Las que corregiste a mano en inglés se respetan. Revisa la traducción antes de publicar.`, { okText: 'Traducir', danger: false }))) return;
		await enMasa(async (p) => {
			if (!p.titulo || (p.en?.manual && String(p.en?.titulo || '').trim())) return;
			const en = await traducirEn(p);
			await guardarMasa({ en }, { en })(p);
		}, 'Traducción al inglés', (k) => `${k} propiedad${k === 1 ? '' : 'es'} traducida${k === 1 ? '' : 's'} al inglés. ${trasGuardar()}`, lista);
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
		}, 'SEO completado', (k) => `SEO de ${k} propiedad${k === 1 ? '' : 'es'} revisado y completado. ${trasGuardar()}`, lista);
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
					titulo: t.en.titulo, descripcion: t.en.descripcion, amenidades: amenidadesEnDe({ amenidades: d.amenidades, en: t.en }), amenidadesDe: [...(d.amenidades || [])],
					seo: { titulo: autoSeoTitle({ ...d, titulo: t.en.titulo }, true), descripcion: recortar(resumenSeo(t.en.descripcion), 155) },
					vipLanding: p.en?.vipLanding || { titular: '', subtitular: '', puntosClave: [], ctaTexto: '' },
					vacacional: p.en?.vacacional || {},
					slugsAnteriores: titulosEnAnteriores(p.en, t.en.titulo),
					fuente: fuenteTraducida(d, { titulo: t.en.titulo, descripcion: t.en.descripcion, ...(p.en?.vacacional || {}),
						vipTitular: p.en?.vipLanding?.titular, vipSubtitular: p.en?.vipLanding?.subtitular, ctaTexto: p.en?.vipLanding?.ctaTexto }), manual: false
				};
				await guardarMasa(cambios, cambios)(p);
			}, 'Textos preparados', (k) => `Textos puestos en ${k} propiedad${k === 1 ? '' : 'es'}. Revísalos y publica.`);
		} },
		h('span', { class: 'icon-pencil', 'aria-hidden': 'true' }), ' Poner textos preparados');
	const btnMarca = h('button', { type: 'button', class: 'btn btn-sm btn-outline-primary',
		onclick: async (e) => {
			// El botón se toma antes de esperar: después del «await» el evento ya no lo trae (currentTarget = null).
			const boton = e.currentTarget;
			const n = seleccion.size;
			if (!(await confirmDialog(`¿Poner la marca de agua a las fotos de ${n} propiedad${n === 1 ? '' : 'es'}? Las que ya la tienen se saltan. Puede tardar unos minutos; no cierres esta página.`, { okText: 'Poner marca', danger: false }))) return;
			const txt = boton.lastChild.textContent;
			let hecha = 0;
			await enMasa(async (p) => {
				const fotos = await marcarFotos(p, (i, t) => { boton.lastChild.textContent = ` Propiedad ${hecha + 1} de ${n}: foto ${i} de ${t}…`; });
				hecha++;
				if (fotos) await guardarMasa({ fotos }, { fotos })(p);
			}, 'Marca de agua en fotos', (k) => `Fotos de ${k} propiedad${k === 1 ? '' : 'es'} con marca de agua. ${trasGuardar()}`);
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
	// «Elegir varias»: cada fila muestra su casilla y tocarla la marca; al terminar se suelta la selección.
	const btnElegir = h('button', { type: 'button', class: 'btn btn-sm btn-link p-0',
		onclick: () => { if (!lista.classList.toggle('eligiendo')) seleccion.clear(); draw(); } }, 'Elegir varias');
	const pintarBarra = () => {
		const editables = visibles.filter(canEdit);
		nSel.textContent = String(seleccion.size);
		barra.hidden = seleccion.size === 0;
		selTodas.checked = editables.length > 0 && editables.every((p) => seleccion.has(p.id));
		selTodas.indeterminate = seleccion.size > 0 && !selTodas.checked;
		selTodas.disabled = btnTodas.hidden = editables.length === 0;
		btnElegir.textContent = lista.classList.contains('eligiendo') ? 'Terminar' : 'Elegir varias';
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
		(k) => `${k === 1 ? '1 propiedad sin inglés se tradujo sola' : `${k} propiedades sin inglés se tradujeron solas`}. ${trasGuardar()}`, sinIngles);
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
		(k) => `${k === 1 ? '1 título en inglés se corrigió solo' : `${k} títulos en inglés se corrigieron solos`}. ${trasGuardar()}`, tituloMalo));
	// Si se vuelve con filtros puestos, en celular se muestran abiertos.
	if (btnFiltros.classList.contains('con-filtros')) btnFiltros.click();

	// La misma acción principal y el mismo ⋮ en los dos tamaños: arriba con el título en pantallas anchas;
	// en el celular, en la fila del buscador (sin repetir el título que ya dice la barra de arriba).
	const nueva = () => botonNuevaCasa('Nueva propiedad', { href: '#/propiedades/nuevo' });
	const masLista = () => menuMas('Más acciones', [
		session.isAdmin ? { icono: 'icon-upload', texto: 'Importar desde CSV', href: '#/propiedades/importar' } : null,
		props.length ? { icono: 'icon-download', texto: 'Exportar todas (CSV)', onclick: (e) => exportarCsv(props, agentName, e.currentTarget) } : null]);
	const encabezado = pageHeader('Propiedades', nueva(), masLista());
	encabezado.classList.add('d-none', 'd-md-flex');
	mount(container,
		props.length ? encabezado : pageHeader('Propiedades', nueva(), masLista()),
		props.length ? h('div', {},
			h('div', { class: 'row g-2 mb-3' },
				// En tableta, la búsqueda arriba y los filtros a todo el ancho (en 1/3 + 2/3 el último se cortaba).
				h('div', { class: 'col-lg-4 d-flex gap-2' }, search, btnFiltros, h('span', { class: 'd-flex gap-2 d-md-none' }, nueva(), masLista())),
				h('div', { class: 'col-lg-8' }, cajaFiltros)),
			h('div', { class: 'mb-2 d-flex align-items-center gap-3' },
				count, limpiar,
				h('span', { class: 'ms-auto d-flex gap-3' }, btnTodas, btnElegir)),
			barra, vacio,
			lista)
			: emptyState('Aún no hay propiedades.', h('a', { href: '#/propiedades/nuevo', class: 'btn btn-primary' }, 'Crear la primera')));
}

// `paraSocio`: la misma ficha para el socio que sube su casa nueva («Mis propiedades» → «Agregar casa»): sin lo del equipo
// (paraElSocio). { colaborador }: el colaborador elige el asesor de su casa en venta o renta.
function schema(agentOpts, isNew, socioOpts, ajeno = false, casaId = '', paraSocio = null) {
	const campos = camposDeLaFicha(agentOpts, isNew, socioOpts, ajeno, casaId);
	return paraSocio ? paraElSocio(campos, paraSocio) : campos;
}
// Lo que el socio no ve en su casa nueva: lo pone el servidor (dueño, URL, código, estado, visible) o es del equipo
// (orden, destacada, VIP, margen, ganancia, código del socio, calendarios, acuerdo, video, inglés y Google). Lo que es
// obligatorio en toda casa, marcado; lo que depende de la operación (precio, dirección exacta) lo dice la revisión de
// admin/js/casa-nueva.js al publicar (la misma del servidor), junto al campo.
const SOLO_EQUIPO = new Set(['slug', 'codigo', 'condominioSiglas', 'estado', 'propietarioId', 'orden', 'publicado', 'destacada', 'vip', 'video',
	'socio.codigoSocio', 'socio.margen', 'vacacional.bloqueos', ...V.CALENDARIOS.map((c) => `socio.${c.campo}`)]);
const SECCIONES_EQUIPO = ['Acuerdo con el dueño', 'Landing page VIP', 'Versión en inglés (mercado de EE. UU.)', 'SEO (opcional)'];
const CUSTOM_EQUIPO = ['Ganancia y precio al público', 'Así se verá en Google', 'Calendario de EQ (pégalo en Airbnb, Booking y VRBO)'];
const OBLIGATORIOS_SOCIO = new Set(['zona', 'ciudad']);
const PARA_EL_SOCIO = {
	// Con nombre 1 a 40 (storage.rules: la carpeta de la casa nueva no admite más).
	fotos: { marcaFija: true, numeradas: true },
	// Sin la ayuda de enlaces del formato (los textos no los llevan).
	descripcion: { type: 'textarea' },
	// Su casa sale con precio (la revisión lo pide en venta y renta): sin «Déjalo vacío para mostrar Precio a consultar».
	precio: { help: 'En venta, el total; en renta, al mes.' },
	agentId: { label: 'Asesor de la casa', help: 'Atiende a los interesados y te avisa; tú no hablas con ellos.' },
	mapa: { type: 'text', help: 'En Google Maps: Compartir → Copiar vínculo.' },
	'socio.precioBase': { label: 'Tu precio por noche', help: 'Lo que recibes por noche. La página le suma la comisión y los impuestos.' },
	'socio.precioFinde': { label: 'Tu precio en fin de semana', help: 'Noches de viernes y sábado. Vacío = el de siempre.' }
};
function paraElSocio(campos, { colaborador = false } = {}) {
	let enSeccionEquipo = false;
	return campos.map((f) => {
		if (f.type === 'section') enSeccionEquipo = SECCIONES_EQUIPO.includes(f.label);
		const oculto = enSeccionEquipo || SOLO_EQUIPO.has(f.name) || (f.type === 'custom' && CUSTOM_EQUIPO.includes(f.label))
			|| String(f.name || '').startsWith('acuerdo.') || String(f.name || '').startsWith('en.') || String(f.name || '').startsWith('vipLanding.');
		if (oculto) return { ...f, when: () => false };
		if (f.type === 'section' && f.label === 'Fotos') return { ...f, help: 'Al menos 5 (hasta 40). La primera es la portada.' };
		const g = { ...f, ...(PARA_EL_SOCIO[f.name] || {}) };
		if (OBLIGATORIOS_SOCIO.has(f.name)) g.required = true;
		// El asesor solo lo elige el colaborador, y solo en venta o renta (por noche no lleva).
		if (f.name === 'agentId') Object.assign(g, { disabled: !colaborador, when: (d) => colaborador && !esVacacional(d) });
		return g;
	});
}
function camposDeLaFicha(agentOpts, isNew, socioOpts, ajeno = false, casaId = '') {
	// La landing VIP no tiene caja de reserva: una casa por noche siempre usa su ficha normal.
	const vip = (d) => Boolean(d.vip) && !esVacacional(d);
	const conDueno = (d) => Boolean(d.propietarioId);
	// Un terreno no tiene cuartos, baños, parqueos, construcción, niveles ni año: no se le preguntan.
	const construido = (d) => d.tipo !== 'terreno';
	// Una casa por noche no lleva precio ni VIP: moneda, orden, visible y destacada caben en una sola fila.
	const fila = (d) => (esVacacional(d) ? 3 : 4);
	// La vista previa de Google usa el precio que verá el cliente (el de una casa por noche sale del precio del socio).
	const conPrecio = (d) => (esVacacional(d) ? { ...d, ...vacacionalPublico(d) } : d);
	return [
		{ type: 'section', label: 'Datos principales' },
		{ name: 'titulo', label: 'Título', required: true, maxlength: 90, cols: 8, placeholder: 'Ej. Casa con jardín en Residencial San Antonio' },
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
		{ name: 'precio', label: 'Precio', type: 'number', min: 0, max: 100000000, step: 1, cols: 4, help: 'Déjalo vacío para mostrar "Precio a consultar".', when: (d) => !esVacacional(d) },
		{ name: 'moneda', label: 'Moneda', type: 'select', options: MONEDAS, cols: fila },
		{ name: 'orden', label: 'Orden', type: 'number', cols: fila, help: 'Número menor aparece primero.' },
		{ name: 'publicado', label: 'Visible en la página', type: 'checkbox', cols: fila, default: isNew ? false : undefined },
		{ name: 'destacada', label: 'Destacada en la portada', type: 'checkbox', cols: fila },
		{ name: 'vip', label: 'Propiedad VIP (landing page)', type: 'checkbox', cols: 4, when: (d) => !esVacacional(d) },

		{ type: 'section', label: 'Fotos', help: 'La primera foto es la portada. Se reducen y optimizan automáticamente al subirlas.' },
		{ name: 'fotos', label: 'Galería', type: 'images', marca: true },

		{ type: 'section', label: 'Ubicación', when: (d) => !esVacacional(d) },
		{ type: 'section', label: 'Ubicación', when: esVacacional, help: 'En la página solo salen la zona y la ciudad. La dirección y el mapa son privados: el cliente los recibe cuando se marca el pago.' },
		{ name: 'zona', label: 'Zona', cols: 4, placeholder: 'Zona 16' },
		{ name: 'ciudad', label: 'Ciudad / municipio', cols: 4, placeholder: 'Guatemala' },
		{ name: 'direccion', label: 'Residencial / dirección', cols: 4, colsCelular: 12 },
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

		{ type: 'section', label: 'Renta vacacional por noches', when: esVacacional, help: 'El socio pone su precio por noche; la página suma el margen y lo muestra con impuestos aparte.' },
		{ name: 'socio.codigoSocio', label: 'Código del socio (opcional)', cols: 6, maxlength: 30, when: esVacacional, placeholder: 'Ej. CH-07', help: 'El código que el socio usa para esta casa. Se ve en el panel y en sus correos junto al nuestro; nunca en la página.' },
		{ name: 'socio.precioBase', label: 'Precio por noche del socio', type: 'number', min: 0, max: 50000, step: 0.01, cols: 4, when: esVacacional, help: 'Lo que recibe el socio por noche. Privado.' },
		{ name: 'socio.precioFinde', label: 'Precio del socio en fin de semana', type: 'number', min: 0, max: 50000, step: 0.01, cols: 4, when: esVacacional, help: 'Noches de viernes y sábado. Vacío = precio base.' },
		{ name: 'socio.margen', label: 'Margen de la empresa (%)', type: 'number', min: 0, step: 0.5, cols: 4, when: esVacacional, help: 'Por defecto 20 %, sobre todas las noches.' },
		// Hasta 10 (MAX_TARIFAS): las reglas revisan una por una que el precio público cuadre con el del dueño.
		{ name: 'socio.tarifas', label: `Precios por fechas (temporada, feriados; hasta ${MAX_TARIFAS})`, type: 'list', itemLabel: 'Tarifa', ordenar: false, max: MAX_TARIFAS, when: esVacacional, fields: [
			{ name: 'desde', label: 'Primera noche', type: 'date', cols: 4 },
			{ name: 'hasta', label: 'Última noche (incluida)', type: 'date', cols: 4 },
			{ name: 'precio', label: 'Precio del socio por noche', type: 'number', min: 0, max: 50000, step: 0.01, cols: 4 }
		] },
		{ type: 'custom', label: 'Ganancia y precio al público', when: esVacacional, update: desgloseVacacional },
		{ name: 'vacacional.limpieza', label: 'Cargo de limpieza (por estancia)', type: 'number', min: 0, max: 10000, step: 0.01, cols: 4, when: esVacacional, help: 'Se suma al cliente sin margen.' },
		{ name: 'vacacional.deposito', label: 'Depósito reembolsable', type: 'number', min: 0, max: 50000, step: 0.01, cols: 4, when: esVacacional, help: 'Se devuelve; no lleva impuestos.' },
		{ name: 'vacacional.nochesMin', label: 'Noches mínimas', type: 'number', min: 1, max: 30, step: 1, cols: 2, when: esVacacional, help: 'Lo normal es 1 o 2. Para feriados, mejor un mínimo por fechas en el calendario del dueño.' },
		{ name: 'vacacional.huespedesMax', label: 'Huéspedes máximos', type: 'number', min: 1, max: 50, step: 1, cols: 2, when: esVacacional },
		{ name: 'vacacional.checkIn', label: 'Hora de entrada', type: 'select', options: HORAS, default: '15:00', cols: 3, when: esVacacional },
		{ name: 'vacacional.checkOut', label: 'Hora de salida', type: 'select', options: HORAS, default: '11:00', cols: 3, when: esVacacional },
		{ name: 'vacacional.camas', label: 'Camas', type: 'number', min: 0, step: 1, cols: 2, when: esVacacional },
		{ name: 'vacacional.mascotas', label: 'Mascotas', type: 'select', options: [['', 'Sin indicar'], ['si', 'Se aceptan'], ['no', 'No se aceptan']], cols: 4, when: esVacacional },
		{ name: 'vacacional.comoLlegar', label: 'Cómo llegar (opcional)', type: 'textarea', rows: 2, when: esVacacional, placeholder: 'A 45 min de la capital; los últimos 2 km son de terracería.' },
		{ name: 'vacacional.reglas', label: 'Reglas de la casa (una por línea)', type: 'textarea', rows: 3, when: esVacacional, help: 'Vacío = las reglas generales de Contenido → Textos → Renta vacacional.' },
		{ name: 'vacacional.cancelacion', label: 'Cancelación', type: 'textarea', rows: 2, when: esVacacional, help: 'Vacío = la política general de Contenido → Textos → Renta vacacional.' },
		// Un calendario por plataforma (V.CALENDARIOS): sus noches ocupadas se bloquean solas en la página.
		...V.CALENDARIOS.map((c) => ({ name: `socio.${c.campo}`, label: `Calendario de ${c.nombre} (iCal, opcional)`, type: 'url', cols: 4, when: esVacacional, placeholder: 'https://….ics', help: AYUDA_ICAL[c.nombre] })),
		// Y al revés: lo que reservan los clientes de EQ, para que esas plataformas lo bloqueen.
		campoCalendarioEq(casaId, { when: esVacacional }),
		{ name: 'vacacional.bloqueos', label: 'Fechas ocupadas (además de los calendarios)', type: 'list', itemLabel: 'Bloqueo', ordenar: false, when: esVacacional, help: 'Ejemplo: primera 24 y última 26 = ocupadas las noches del 24, 25 y 26. El 24 en la mañana todavía puede salir el huésped anterior (en la página dice «Solo salida») y el 27 ya se puede llegar.', fields: [
			{ name: 'desde', label: 'Primera noche ocupada', type: 'date', cols: 6 },
			{ name: 'ultima', label: 'Última noche ocupada (incluida)', type: 'date', cols: 6 }
		] },

		{ type: 'section', label: 'Descripción' },
		{ name: 'descripcion', label: 'Descripción', type: 'markdown', rows: 8, required: true, ref: (el) => { schema.descInput = el; } },
		{ type: 'custom', update: (el, d) => {
			if (el.firstChild) return;
			let anterior = null;
			const deshacer = h('button', { type: 'button', class: 'btn btn-sm btn-link', hidden: true,
				onclick: () => { poner(anterior); deshacer.hidden = true; } }, 'Deshacer');
			const poner = (txt) => { schema.descInput.value = txt; schema.descInput.dispatchEvent(new Event('input')); };
			el.append(h('div', { class: 'd-flex flex-wrap align-items-center gap-2' },
				h('button', { type: 'button', class: 'btn btn-sm btn-outline-primary', onclick: async () => {
					if (!(await confirmDialog('Queda tu párrafo de presentación y la nota de lo que no incluye el precio; se quitan las listas copiadas de la ficha (habitaciones, amenidades, estadía), que la página ya muestra de sus campos. Puedes deshacerlo.', { okText: 'Mejorar', danger: false }))) return;
					anterior = schema.descInput.value;
					// Lo que se publica, como lo que sale a la IA: sin la dirección privada de una casa por noche.
					poner(generarDescripcion(propiedadParaIA({ ...d, descripcion: anterior })));
					deshacer.hidden = false;
				} }, h('span', { class: 'icon-list-ul', 'aria-hidden': 'true' }), ' Mejorar descripción'),
				deshacer,
				h('span', { class: 'small text-muted' }, 'Revisa el primer párrafo: ubicación y lo que hace especial a la propiedad.')));
		} },
		{ name: 'video', label: 'Video (YouTube o Vimeo)', type: 'url', placeholder: 'https://www.youtube.com/watch?v=…' },

		// Acuerdo con el dueño de ESTE inmueble (exclusiva, comisión, impuestos): privado, en privado/acuerdo.
		// Cada operación con lo suyo (admin/js/acuerdo.js): la exclusiva, siempre; comisión en venta (%) y renta
		// (meses); impuestos del traspaso solo en venta. En la renta por noche la empresa gana el margen.
		{ type: 'section', label: 'Acuerdo con el dueño', when: conDueno, help: 'Privado: no sale en la página. Es de este inmueble; otro inmueble del mismo dueño puede tener otro acuerdo.' },
		{ name: 'acuerdo.exclusiva', label: 'Tenemos exclusiva', type: 'checkbox', cols: 4, when: conDueno },
		{ name: 'acuerdo.exclusivaInicio', label: 'Exclusiva desde', type: 'date', cols: 4, when: (d) => conDueno(d) && Boolean(d.acuerdo?.exclusiva) },
		{ name: 'acuerdo.exclusivaFin', label: 'Exclusiva hasta', type: 'date', cols: 4, when: (d) => conDueno(d) && Boolean(d.acuerdo?.exclusiva), help: 'Avisamos 30 días antes de que venza.' },
		{ name: 'acuerdo.comisionPct', label: 'Comisión de venta %', type: 'number', min: 0, step: 0.5, cols: 4, when: (d) => conDueno(d) && d.operacion === 'venta', help: 'Vacío = regla general (Reportes).' },
		{ name: 'acuerdo.comisionRentaMeses', label: 'Comisión de renta (meses por cada año de contrato)', type: 'number', min: 0, step: 0.5, cols: 4, when: (d) => conDueno(d) && d.operacion === 'renta', help: 'Ej.: 1 = un mes de renta por año (contrato de 2 años = 2 rentas). Vacío = regla general (Reportes).' },
		{ name: 'acuerdo.comisionRegimen', label: 'Impuesto de la comisión', type: 'select', cols: 4, options: REGIMENES, default: 'pequeno', when: (d) => conDueno(d) && !esVacacional(d) },
		{ name: 'acuerdo.comisionModo', label: 'Cómo se cobra la comisión', type: 'select', cols: 4, options: MODOS, when: (d) => conDueno(d) && !esVacacional(d) },
		{ name: 'acuerdo.impuestoVenta', label: 'Impuesto del traspaso', type: 'select', cols: 4, when: (d) => conDueno(d) && d.operacion === 'venta', options: [['', 'Por definir'], ['iva', 'IVA 12 % (primera venta de inmueble nuevo)'], ['timbres', 'Timbres fiscales 3 % (reventa)']] },
		{ name: 'acuerdo.impuestoPaga', label: 'Quién paga el impuesto', type: 'select', cols: 4, when: (d) => conDueno(d) && d.operacion === 'venta', options: [['', 'Por definir'], ['comprador', 'Comprador'], ['vendedor', 'Vendedor'], ['mitad', 'Mitad y mitad']] },
		{ name: 'acuerdo.notasImpuestos', label: 'Notas de impuestos', cols: 4, when: (d) => conDueno(d) && d.operacion === 'venta', placeholder: 'IUSI al día, ISR, gastos de escritura…' },
		{ name: 'acuerdo.contrato', label: 'Enlace al contrato (Drive, Dropbox…)', type: 'url', cols: 12, when: conDueno, placeholder: 'https://…' },

		{ type: 'section', label: 'Landing page VIP', help: 'Solo para propiedades marcadas como VIP. Se publica en /vip/…', when: vip },
		{ name: 'vipLanding.titular', label: 'Titular', cols: 6, when: vip, placeholder: 'Ej. Vive frente al bosque, a 10 minutos de todo' },
		{ name: 'vipLanding.ctaTexto', label: 'Texto del botón', cols: 6, when: vip, placeholder: 'Agendar visita privada' },
		{ name: 'vipLanding.subtitular', label: 'Subtítulo', type: 'textarea', rows: 2, when: vip },
		{ name: 'vipLanding.portada', label: 'Imagen de portada (opcional)', type: 'image', marca: true, when: vip, help: 'Si no eliges una, se usa la primera foto de la galería.' },
		{ name: 'vipLanding.puntosClave', label: 'Puntos clave', type: 'tags', when: vip, placeholder: 'Vista panorámica, acabados importados… (Enter para agregar)' },
		// Mientras esté marcada se ve, aunque la casa deje de ser VIP: así se puede desmarcar (el precio sigue oculto).
		{ name: 'vipLanding.ocultarPrecio', label: 'Ocultar precio ("Precio a consultar")', type: 'checkbox', when: (d) => vip(d) || Boolean(d.vipLanding?.ocultarPrecio && !esVacacional(d)) },

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
			// La misma regla del sitio (templates.mjs seoDescription): la escrita, si tiene 70 letras o más.
			description: (d) => (propiaCorta(d.seo?.descripcion) ? '' : d.seo?.descripcion) || (d.vip && d.vipLanding?.subtitular) || autoDescription(conPrecio(d)),
			path: (d) => `${d.vip ? '/vip/' : '/propiedad/'}${slugify(d.slug || d.titulo || '')}/`,
			checks: (d) => [
				[(d.fotos || []).length >= 5, `${(d.fotos || []).length} fotos (recomendado: 5 o más).`],
				[(d.fotos || []).length > 0 && d.fotos.every((f) => f.alt), 'Todas las fotos tienen descripción.'],
				[stripMd(d.descripcion).split(/\s+/).filter(Boolean).length >= 80, 'Descripción de al menos 80 palabras (Google premia el contenido original).'],
				[Boolean(d.zona), 'Tiene zona (aparece en las búsquedas por zona).'],
				...[['', d.seo?.descripcion], [' en inglés', d.en?.seo?.descripcion]].filter(([, t]) => propiaCorta(t))
					.map(([idioma, t]) => [false, `Tu descripción${idioma} tiene ${t.length} letras: con menos de 70, Google recibe la automática.`])
			]
		})
	];
}

// La ficha del inmueble: la única forma de crear o editar una propiedad en todo el panel. Se usa en su página
// (#/propiedades/…) y, con «emb», dentro de una ventana abierta desde otra pantalla (ver abrirFicha): ahí no
// navega; avisa con emb.alGuardar(casa) y emb.alEliminar(id) y pone sus botones en emb.pie.
// Lo que la ficha del socio le pide al servidor (netlify/functions/mi-casa-nueva.mjs). Una revisión que no pasa (422)
// vuelve con sus errores por campo, para marcarlos; otro error se lanza con su texto.
async function alServidorCasaNueva(cuerpo) {
	const res = await fetch('/api/mi-casa-nueva', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await session.user.getIdToken()}` }, body: JSON.stringify(cuerpo) });
	const r = await res.json().catch(() => ({}));
	if (res.status === 422 && r.errores?.length) return r;
	if (!res.ok) throw new Error(r.error || fallaDelServidor(res.status));
	return r;
}
// La carpeta de fotos de su casa nueva: el servidor se la aparta (casasNuevas/{id}) y solo ahí le deja subir storage.rules.
const apartarCarpeta = async () => (await alServidorCasaNueva({ accion: 'apartar' })).id;
// El socio (propietario o colaborador) usa esta misma ficha para subir su casa nueva desde «Mis propiedades» (en una
// ventana): sin lo del equipo (paraElSocio), con sus fotos en la carpeta que le aparta el servidor, y «Publicar» la manda
// a netlify/functions/mi-casa-nueva.mjs, que la revisa otra vez y la publica (las reglas no le dejan crear casas).
async function renderEditor(container, id, emb = null) {
	const isNew = id === 'nuevo';
	const paraSocio = session.esSocio;
	if (paraSocio && !isNew) return mount(container, emptyState('Tu casa se cambia desde «Mis propiedades».'));
	const ref = !isNew ? doc(db, 'properties', id) : paraSocio ? doc(db, 'properties', await apartarCarpeta()) : doc(collection(db, 'properties'));
	const [snap, agentOpts, all, propietarios] = await Promise.all([isNew ? null : getDoc(ref), agentOptions(),
		paraSocio ? misCasas() : loadAll(), paraSocio ? [] : loadPropietarios()]);
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
	if (!session.isAdmin && !session.agentId && !paraSocio) {
		mount(container, h('div', { class: 'alert alert-warning' }, 'Tu usuario no está vinculado a un asesor. Pide a un administrador que lo vincule en "Usuarios".'));
		return;
	}

	// Los bloqueos se muestran por noches: la última ocupada es el día antes del que queda libre.
	if (data.vacacional?.bloqueos) data.vacacional.bloqueos = data.vacacional.bloqueos.map((b) => ({ desde: b.desde, ultima: b.hasta ? V.sumarDias(b.hasta, -1) : '' }));
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
	// El socio: la casa es suya y, en venta o renta, la atiende su asesor (el colaborador puede elegir otro).
	if (paraSocio) Object.assign(data, { propietarioId: session.profile.propietarioId || '', agentId: session.dueno?.agentId || '' });
	const datosForm = { ...data, acuerdo: acuerdoInicial, socio: { margen: V.MARGEN, ...(socioGuardado || {}) }, vacacional: { nochesMin: 1, huespedesMax: 2, checkIn: '15:00', checkOut: '11:00', ...(data.vacacional || {}) } };
	mascotasUnaVez(datosForm);
	const form = renderForm(schema(agentOpts, isNew, socioOpts, ajeno, isNew ? '' : ref.id, paraSocio ? { colaborador: session.dueno?.tipo === 'colaborador' } : null), datosForm, { folder: `properties/${ref.id}` });
	// La ficha como estaba al abrirla (o al último «Guardar»): con eso se sabe qué cambió quien la edita y solo eso se
	// guarda (guardarCambios). De una casa que no era por noche no hay nada por noche guardado: todo eso es nuevo.
	const comoQuedo = (f) => {
		const { socio = {}, acuerdo, ...datos } = clonar(f);
		if (!esVacacional(f)) delete datos.vacacional;
		return { datos, socio: esVacacional(f) ? socio : {} };
	};
	let alAbrir = comoQuedo(form.getData());
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
	// intentadoCon: el español con que ya se tradujo aquí sin quedar completa (un texto volvió vacío); con ese mismo
	// español no se vuelve a pedir en cada cambio de otro campo: se intenta otra vez al guardar.
	let enAuto = data.en || {}, turnoEn = 0, enCurso = Promise.resolve(), intentadoCon = null;
	const estadoEn = h('div', { class: 'col-12 small text-muted', role: 'status', hidden: paraSocio });
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
		if (!String(s.descripcion || '').trim() || !faltaIngles(s) || fuenteEs(s) === intentadoCon) return;
		const turno = ++turnoEn, antes = textoEn(s.en);
		estadoEn.textContent = 'Traduciendo al inglés…';
		try {
			const en = await traducirEn(paraTraducir());
			if (turno !== turnoEn) return;
			// Si alguien corrigió el inglés mientras se traducía, manda su corrección.
			if (textoEn(form.state.en) !== antes) { form.state.en.manual = true; estadoEn.textContent = ''; return; }
			CAMPOS_EN.forEach((k) => form.poner(`en.${k}`, getPath(en, k)));
			Object.assign(form.state.en, { slugsAnteriores: en.slugsAnteriores, amenidadesDe: en.amenidadesDe, fuente: en.fuente, manual: false });
			enAuto = clonar(form.state.en);
			intentadoCon = en.fuente ? null : fuenteEs(s);
			estadoEn.textContent = en.fuente ? 'Traducción automática lista: revísala.' : 'Faltó traducir un texto; se intenta de nuevo al guardar.';
		} catch {
			if (turno === turnoEn) estadoEn.textContent = 'No se pudo traducir ahora; se intenta de nuevo al guardar.';
		}
	};
	// El inglés de la casa del socio lo hace el equipo al marcar «Listo» en «Cambios de los dueños».
	if (!paraSocio) form.el.addEventListener('change', (e) => { if (!e.target.closest('[data-campo^="en."]')) enCurso = traducirEnVivo(); });

	// Se vuelve a pintar en su propio contenedor (no «el primer hijo de la pantalla»: arriba puede ir un aviso, como el de
	// la verificación en dos pasos). Solo en la página: en una ventana (emb) no hay «Traducir» y el guardado avisa a quien la abrió.
	const recargar = async () => {
		container.replaceChildren();
		await render(container, [ref.id]);
	};

	// `forzarIngles`: vuelve a traducir aunque el inglés esté al día (el botón «Traducir al inglés» con cambios sin guardar).
	const save = async (btn, { forzarIngles = false } = {}) => {
		if (paraSocio) return publicarDelSocio(btn);
		if (!form.validate()) return;
		// Si la traducción en vivo va en camino, se espera: así no se traduce dos veces.
		btn.disabled = true;
		await enCurso;
		btn.disabled = false;
		const mio = form.getData();
		const d = clonar(mio);
		// Lo mismo que revisa el importador: dueño de la casa por noche, sin asesor, sin pasar a venta con huéspedes por venir.
		let sinLlegada = false;
		try { ({ sinLlegada } = await revisarCasa(isNew ? null : { ...data, operacion: eraVacacional ? 'vacacional' : data.operacion }, d, ref.id, { direccion: String(d.direccion ?? '') })); }
		catch (err) { return toast(errorMessage(err), 'warning'); }
		// Si la casa ya tenía dueño y se elige otro, se pregunta antes de guardar nada.
		if (!isNew && !(await confirmarCambioDeDueno([{ casa: { ...data, id: ref.id }, a: d.propietarioId || '' }], propietarios))) return;
		// Lo del socio nunca va al documento público (ni a la traducción).
		const socio = d.socio || {};
		delete d.socio;
		// El acuerdo con el dueño tampoco (privado/acuerdo).
		const delFormulario = d.acuerdo || {};
		delete d.acuerdo;
		let llegada = null;
		// El dueño de la casa ya está en Propietarios: su nombre y teléfono salen de ahí, no se vuelven a escribir.
		if (esVacacional(d)) {
			if (!(Number(socio.precioBase) > 0)) return toast('Escribe el precio por noche del socio.', 'warning');
			if ((d.vacacional?.bloqueos || []).some((b) => b.desde && b.ultima && b.ultima < b.desde)) return toast('En las fechas ocupadas, la última noche va el mismo día o después de la primera.', 'warning');
			if ((socio.tarifas || []).filter((t) => t.desde && t.hasta && Number(t.precio) > 0).length > MAX_TARIFAS) return toast(`Hasta ${MAX_TARIFAS} precios por fechas: quita los que ya pasaron o junta los que se pueda.`, 'warning');
			// Un cero de más pasa fácil: un precio de fin de semana o por fechas de más de 5 veces el de siempre se pregunta.
			// Solo los que cambian en este guardado: uno alto que ya estaba guardado no se vuelve a preguntar.
			const base = Number(socio.precioBase);
			const yaEstaban = new Set([Number(socioGuardado?.precioFinde), ...(socioGuardado?.tarifas || []).map((t) => Number(t.precio))].filter((n) => n > 5 * Number(socioGuardado?.precioBase)));
			const altos = [Number(socio.precioFinde), ...(socio.tarifas || []).map((t) => Number(t.precio))].filter((n) => n > 5 * base && !yaEstaban.has(n));
			if (altos.length && !(await confirmDialog(`Hay un precio de ${dinero(Math.max(...altos), d.moneda)} por noche: ${Math.round(Math.max(...altos) / base)} veces el precio de siempre (${dinero(base, d.moneda)}). ¿Es correcto?`, { okText: 'Sí, es correcto', danger: false }))) return;
			mascotasUnaVez(d);
			// La dirección y el mapa salen del documento público antes de armar código, SEO y traducción.
			llegada = { direccion: String(d.direccion || '').trim(), mapa: String(d.mapa || '').trim() };
			Object.assign(d, { direccion: '', mapa: '' });
		} else {
			delete d.vacacional;
		}
		d.slug = slugify(d.slug || d.titulo);
		if (!d.slug) return toast('Escribe un título.', 'warning');
		// La zona sin espacios de más; la forma de escribirla la unifica el sitio (landings.mjs `unificarZonas`).
		d.zona = String(d.zona || '').trim().replace(/\s+/g, ' ');
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
		d.estado = estadoDe(d).valor;
		// «Ocultar precio»: ningún texto (título, URL, descripción, VIP, inglés, Google) puede decir el precio, en ninguna
		// forma (cifras, «987k», «1.2 millones»). Se dice junto a la casilla, en una línea.
		const conPrecio = textosConPrecioOculto(d);
		const avisoPrecio = form.el.querySelector('[data-campo="vipLanding.ocultarPrecio"]');
		avisoPrecio?.querySelector('.aviso-precio-oculto')?.remove();
		if (conPrecio.length) {
			const linea = `Con el precio oculto, quítalo de: ${conPrecio.map(([k]) => k).join(', ')}.`;
			avisoPrecio?.append(h('div', { class: 'form-text text-danger aviso-precio-oculto', role: 'alert' }, linea));
			avisoPrecio?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
			return toast(linea, 'warning');
		}
		// Versión en inglés automática: si alguien la corrigió a mano, se respeta.
		d.en = d.en || {};
		// La dirección en inglés sale de su título: si se corrigió a mano, la anterior redirige a la nueva (como en español).
		if (!isNew && data.en?.titulo && d.en.titulo && slugify(data.en.titulo) !== slugify(d.en.titulo)) d.en.slugsAnteriores = titulosEnAnteriores(data.en, d.en.titulo);
		// Lista en inglés corregida a mano con una por cada amenidad en español: queda emparejada (amenidadesEnDe).
		const enAmenCambio = JSON.stringify(d.en.amenidades || []) !== JSON.stringify(data.en?.amenidades || []);
		if (enAmenCambio && (d.en.amenidades || []).length && d.en.amenidades.length === (d.amenidades || []).length) d.en.amenidadesDe = [...d.amenidades];
		if (d.en.titulo && textoEn(d.en) !== textoEn(enAuto)) d.en.manual = true;
		const traducirAhora = forzarIngles || faltaIngles(d);
		// El SEO lleva el precio que verá el cliente (el de una casa por noche sale del precio del socio).
		if (!d.vip && d.titulo) {
			const conPublico = esVacacional(d) ? { ...d, ...vacacionalPublico({ ...d, socio }) } : d;
			llenarSeo(conPublico);
			d.seo = conPublico.seo;
		}
		llenarAltFotos(d);
		btn.disabled = true;
		// La casa como quedó guardada (con lo que otras pantallas escribieron mientras tanto).
		let guardada = null;
		try {
			if (isNew) {
				if (esVacacional(d)) Object.assign(d, vacacionalPublico({ ...d, socio }));
				// Lo que lleva toda propiedad al nacer: historial de estado y de precio, y quién la creó.
				Object.assign(d, propiedadNueva(d));
				// La casa y lo privado de una por noche, juntos (crearCasa).
				await crearCasa(ref, d, esVacacional(d) ? { socio, llegada } : {});
				guardada = d;
			} else {
				// Solo lo que cambió aquí, sobre lo guardado ahora; lo privado, en la misma transacción.
				guardada = await guardarCambios(ref.id, cambiosEntre(alAbrir.datos, d), {
					socio: esVacacional(d) ? cambiosEntre(alAbrir.socio, socio, []) : null,
					llegada, sinLlegada
				});
			}
			// Lo guardado es el punto de partida de un segundo «Guardar» sin recargar (también el acuerdo y «data», abajo).
			alAbrir = comoQuedo(mio);
			// La casa queda en la lista de su dueño y sale de la de cualquier otro; su `porNoche` se recalcula y sus
			// reservas, solicitudes y chats por venir pasan al dueño nuevo (una sola forma de enlazar: asignarDueno).
			// Una casa enlazada solo desde la lista de su dueño (sin propietarioId antes ni ahora) se deja como está.
			// Con un dueño de otro asesor que no cambia no hay nada que poner al día (y su ficha no se puede leer).
			// Va antes del acuerdo: si fallara, el acuerdo no se marca guardado y el siguiente «Guardar» lo vuelve a
			// decidir con el dueño anterior a la vista (no borra uno recién guardado).
			if ((data.propietarioId || d.propietarioId) && !(ajeno && data.propietarioId === d.propietarioId)) await asignarDueno({ id: ref.id, propietarioId: data.propietarioId, operacion: d.operacion }, d.propietarioId || '', { duenos: propietarios, casas: all, escribirCasa: false, conservarAcuerdo: true });
			// El acuerdo lo decide acuerdoPorGuardar. (Va después de guardar la casa: su regla la lee.)
			const acuerdo = acuerdoPorGuardar(d, delFormulario);
			if (acuerdo === 'borrar') await deleteDoc(acuerdoRef);
			else if (acuerdo) await setDoc(acuerdoRef, { ...acuerdo, updatedAt: serverTimestamp(), updatedBy: session.user.uid });
			if (acuerdo) acuerdoPropio = acuerdo === 'borrar' ? null : acuerdo;
			acuerdoTocado = false;
			eraVacacional = Boolean(llegada);
			if (!isNew) refrescarPortalesDe([ref.id]);
			// Lo que la ficha compara con «data» (dueño, URL, operación) queda como se guardó: un segundo «Guardar» no
			// vuelve a sacar la casa del dueño anterior ni le borra el acuerdo al nuevo.
			for (const k of Object.keys(data)) delete data[k];
			Object.assign(data, guardada, llegada || {});
			await form.flushDeletes();
			await markPending(`Propiedad: ${d.titulo}`);
			// Casa por noche: sus fechas, precios y estado salen en la página sin esperar al CDN (/api/disponibilidad).
			if (guardada.operacion === 'vacacional' || eraVacacional) alDiaEnLaWeb(ref.id);
			const casa = { id: ref.id, ...guardada };
			if (!traducirAhora) {
				toast(`Propiedad guardada. ${trasGuardar()}`);
				if (emb) emb.alGuardar(casa);
				else if (isNew) location.hash = `#/propiedades/${ref.id}`;
				return;
			}
			btn.textContent = 'Traduciendo al inglés…';
			try {
				await updateDoc(ref, { en: await traducirEn(guardada), updatedAt: serverTimestamp() });
				toast(`Propiedad guardada y traducida al inglés. ${trasGuardar()}`);
			} catch (err) {
				toast('Propiedad guardada, pero no se pudo traducir al inglés. Vuelve a guardar o usa «Traducir al inglés» en el menú ⋮.', 'warning');
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
	// lleva también su privado (costo del socio y llegada), sin el calendario de Airbnb ni las noches reservadas o
	// bloqueadas de la original; el acuerdo con el dueño no se copia.
	const duplicate = async (btn) => {
		btn.disabled = true;
		try {
			const newRef = doc(collection(db, 'properties'));
			const vac = esVacacional(data);
			// Sin «catch»: «no se pudo leer» no es «no existe» (la copia quedaría sin precio del socio ni dirección).
			const [socioPriv, llegadaPriv] = vac ? await Promise.all([getDoc(privRef), getDoc(llegadaRef)]) : [];
			const { historialPrecio, historialEstado, slugsAnteriores, difusion, en, codigo, demo, ...base } = data;
			const titulo = `${data.titulo} (copia)`;
			// La copia es otra casa: empieza sin noches reservadas, días bloqueados ni mínimos por fechas de la original.
			const { reservadas, bloqueos, minimos, ...vacacional } = data.vacacional || {};
			const d = propiedadNueva({
				...base,
				...(vac ? { vacacional } : {}),
				titulo,
				slug: slugLibre(titulo, new Set(all.map((p) => p.slug).filter(Boolean))),
				// Todos los códigos cuentan, también el de la original.
				codigo: generarCodigo(data, { agentes, codigos: all.map((p) => p.codigo).filter(Boolean) }),
				publicado: false,
				destacada: false,
				fotos: (data.fotos || []).map(({ url, alt }) => ({ url, alt: alt || '' })),
				// Una casa por noche no lleva asesor (revisarCasa).
				agentId: vac ? '' : session.isAdmin ? data.agentId || '' : session.agentId,
				// La dirección y el mapa de una casa por noche son privados (data los trae de privado/llegada).
				...(vac ? { direccion: '', mapa: '' } : {})
			});
			// El costo del socio sí (sin los calendarios ni el código del socio, que son de la original); la dirección y el
			// mapa también. Todo junto con la casa (crearCasa).
			const socioCopia = vac ? { ...(socioPriv.data() || {}) } : null;
			if (vac) { for (const c of V.CALENDARIOS) delete socioCopia[c.campo]; delete socioCopia.codigoSocio; }
			await crearCasa(newRef, d, vac ? { socio: socioCopia, llegada: llegadaPriv.data() || {} } : {});
			if (data.propietarioId) await asignarDueno({ id: newRef.id, propietarioId: data.propietarioId, operacion: data.operacion }, data.propietarioId, { duenos: propietarios, casas: all, escribirCasa: false, conservarAcuerdo: true });
			toast('Copia creada como borrador. Ajusta los datos y guarda.');
			location.hash = `#/propiedades/${newRef.id}`;
		} catch (err) {
			showError(err);
			btn.disabled = false;
		}
	};

	// ¿La ficha tiene algo sin guardar? (lo mismo que «Guardar» compararía con lo guardado).
	const sinGuardar = () => {
		const ahora = comoQuedo(form.getData());
		return acuerdoTocado || Object.keys(cambiosEntre(alAbrir.datos, ahora.datos)).length > 0 || Object.keys(cambiosEntre(alAbrir.socio, ahora.socio, [])).length > 0;
	};
	// Botón manual: vuelve a traducir todo (reemplaza correcciones hechas a mano). Con cambios sin guardar, primero se
	// guardan y se traduce lo guardado: traducir y volver a leer la base los borraría.
	const traducir = async (btn) => {
		if (sinGuardar()) return save(saveBtn, { forzarIngles: true });
		btn.disabled = true;
		toast('Traduciendo al inglés…');
		try {
			const datos = paraTraducir();
			await updateDoc(ref, { en: await traducirEn(datos), updatedAt: serverTimestamp() });
			await markPending(`Traducción al inglés: ${datos.titulo}`);
			toast('Versión en inglés lista. Revísala abajo y publica.');
			await recargar();
		} catch (err) {
			showError(err);
			btn.disabled = false;
		}
	};

	// La casa nueva del socio: lo mismo que revisa el servidor, aquí, para marcar cada campo antes de mandarla; y el
	// servidor la vuelve a revisar, la crea y la publica (netlify/functions/mi-casa-nueva.mjs).
	const publicarDelSocio = (btn) => ocupado(btn, async () => {
		if (!form.validate()) return;
		const datos = datosParaServidor(form.getData());
		const dueno = { tipo: session.dueno?.tipo, agentId: session.dueno?.agentId || '' };
		const { errores } = revisarCasaNueva({ datos, casaId: ref.id, dueno, agentes: agentOpts.map(([v]) => v).filter(Boolean), revisarOrigen: false });
		if (errores.length) return form.marcar(errores);
		const r = await alServidorCasaNueva({ casa: ref.id, datos });
		if (r.errores?.length) return form.marcar(r.errores);
		toast(r.publicaSola ? 'Publicada. Sale en la página en unos minutos.' : 'Publicada. Sale en la página cuando el equipo publique el sitio.');
		if (emb) emb.alGuardar({ id: ref.id, ...datos });
	});
	const saveBtn = h('button', { class: 'btn btn-primary', onclick: (e) => save(e.currentTarget) }, paraSocio ? 'Publicar' : 'Guardar');
	const eliminarBtn = !isNew && session.isAdmin ? h('button', { class: 'btn btn-outline-danger ms-auto', onclick: remove }, 'Eliminar') : null;
	const cuerpo = [
		!isNew ? h('p', { class: 'small text-muted' }, `Última actualización: ${formatDate(data.updatedAt)}`) : null,
		paraSocio ? null : vigilarFormulario(form, 'propiedades'),
		h('div', { class: 'card' }, h('div', { class: 'card-body' }, form.el))];
	if (emb) {
		// Dentro de una ventana: mismos datos y mismo guardado; los botones van al pie de la ventana.
		container.replaceChildren();
		mount(container, ...cuerpo);
		emb.pie.replaceChildren(saveBtn, h('button', { type: 'button', class: 'btn btn-light', 'data-bs-dismiss': 'modal' }, 'Cancelar'), ...(eliminarBtn ? [eliminarBtn] : []));
		return;
	}
	// Arriba: ← para volver y las demás acciones en el menú ⋮; abajo, solo Guardar y Cancelar (lo que no se toca por error).
	const acciones = isNew ? null : menuMas(`Acciones de ${data.titulo || 'la propiedad'}`, [
		data.publicado && { icono: 'icon-external-link', texto: 'Ver en el sitio', href: publicUrl(data), target: '_blank' },
		{ icono: 'icon-bullhorn', texto: 'Difundir en portales', href: `#/difusion/${id}` },
		{ icono: 'icon-file-text-o', texto: 'Armar borrador de ficha', href: `#/ia/redactar/${id}` },
		{ icono: 'icon-globe', texto: 'Traducir al inglés', onclick: (e) => traducir(e.currentTarget) },
		{ icono: 'icon-copy', texto: 'Duplicar', onclick: (e) => duplicate(e.currentTarget) },
		// Moneda, dueño, limpieza, precios del dueño, margen y «Revisé Airbnb»: quién, cuándo, antes y después.
		session.isAdmin && { icono: 'icon-history', texto: 'Cambios', onclick: () => verCambios({ casaId: id, titulo: `Cambios: ${data.titulo || 'la propiedad'}`, moneda: data.moneda }) },
		session.isAdmin && { icono: 'icon-trash-o', texto: 'Eliminar', peligro: true, onclick: remove }
	]);
	mount(container,
		pageHeader({ texto: isNew ? 'Nueva propiedad' : data.titulo, volver: '#/propiedades', volverTexto: 'Volver a Propiedades' }, acciones),
		...cuerpo,
		h('div', { class: 'sticky-actions' },
			saveBtn,
			h('a', { href: '#/propiedades', class: 'btn btn-light' }, 'Cancelar')));
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
	// Si no abre (p. ej. el servidor no le aparta la carpeta al socio), la ventana se cierra y dice por qué.
	}).catch((err) => { ventana.close(); showError(err); });
}

export { spinner };
