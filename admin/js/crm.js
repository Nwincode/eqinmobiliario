// CRM: clientes, actividades (agenda e historial) y propietarios.
// El asesor solo consulta lo suyo (lo exigen las reglas de Firestore); el administrador, todo.
import {
	db, doc, getDoc, getDocs, setDoc, updateDoc, deleteField, collection, query, where, serverTimestamp, Timestamp, runTransaction, arrayUnion
} from './firebase.js';
import { h, badge, nombreYDatos } from './ui.js';
import { session } from './session.js';
import { telefonoWa as telNorm, dinero, esPorcentaje, idClientePorContacto, correoValido, fechaHora, enMs } from './formato.js';
import { REGLAS_POR_DEFECTO, comisionDe, montoComision, textoComision } from './acuerdo.js';
import { queCorreoCorregido } from './reservas-calculo.js';

export const ETAPAS = [
	['nuevo', 'Nuevo', 'secondary'],
	['contactado', 'Contactado', 'info'],
	['visita', 'Visita', 'primary'],
	['oferta', 'Oferta', 'warning'],
	['cierre', 'Cierre', 'success'],
	['perdido', 'Perdido', 'light']
];
export const TIPOS_CLIENTE = [
	['comprador', 'Comprador'], ['inquilino', 'Inquilino'], ['propietario', 'Propietario'], ['inversionista', 'Inversionista']
];
export const TIPOS_ACTIVIDAD = [
	['llamada', 'Llamada', 'icon-phone'], ['whatsapp', 'WhatsApp', 'icon-whatsapp'], ['correo', 'Correo', 'icon-envelope-o'],
	['visita', 'Visita', 'icon-home'], ['reunion', 'Reunión', 'icon-handshake-o'], ['tarea', 'Tarea', 'icon-check-square-o'], ['nota', 'Nota', 'icon-sticky-note-o']
];

export const etapaLabel = (v) => (ETAPAS.find(([k]) => k === v) || ETAPAS[0])[1];
export const etapaBadge = (v) => { const e = ETAPAS.find(([k]) => k === v) || ETAPAS[0]; return badge(e[1], e[2]); };
export const tipoActividad = (v) => TIPOS_ACTIVIDAD.find(([k]) => k === v) || TIPOS_ACTIVIDAD[5];
// Ícono del tipo de actividad (su nombre va en `title`).
export const iconoActividad = (v) => { const [, label, icono] = tipoActividad(v); return h('span', { class: `${icono} crm-icono`, title: label, 'aria-hidden': 'true' }); };

// La fila de una actividad (la de la Agenda): ícono, qué es y, abajo, el cliente, cuándo y el asesor; a la derecha lo que se
// le pase (✓ hecha, su vencimiento, ⋮). La usan la Agenda, la ficha del cliente e Inicio.
// `marcas`: etiquetas al final de la línea de datos (nombreYDatos: «Vencida», «Hoy»); `der`: los botones de la fila.
export function filaActividad(a, { cliente = true, asesor = '', der = null, marcas = null } = {}) {
	const detalle = [cliente && a.clienteId ? h('a', { href: `#/clientes/${a.clienteId}` }, a.clienteNombre || 'Cliente') : null,
		a.fecha ? fechaHora(a.fecha) : 'Sin fecha', asesor || null].filter(Boolean);
	return h('li', { class: 'list-group-item d-flex align-items-center gap-2' },
		iconoActividad(a.tipo),
		h('div', { class: 'flex-grow-1', style: 'min-width:0' },
			nombreYDatos(a.titulo || tipoActividad(a.tipo)[1], detalle.map((x, i) => [i ? ' · ' : '', x]), marcas ? [marcas] : [], { cls: 'small' })),
		der ? h('div', { class: 'd-flex align-items-center gap-2 flex-shrink-0' }, der) : null);
}

export { telNorm };

export function money(monto, moneda = 'USD') {
	if (!monto) return '—';
	return dinero(monto, moneda);
}

// Consulta respetando el rol: el asesor filtra por su agentId (si no, Firestore la rechaza).
async function cargar(nombre, filtroAsesor = '') {
	const col = collection(db, nombre);
	let q = col;
	if (!session.isAdmin) q = query(col, where('agentId', '==', session.agentFiltro));
	else if (filtroAsesor) q = query(col, where('agentId', '==', filtroAsesor));
	const snap = await getDocs(q);
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export const loadClientes = (asesor) => cargar('clientes', asesor);
export const loadActividades = (asesor) => cargar('actividades', asesor);
export const loadPropietarios = (asesor) => cargar('propietarios', asesor);
export const loadReservas = (asesor) => cargar('reservas', asesor);

export async function loadPropiedades() {
	const snap = await getDocs(collection(db, 'properties'));
	let props = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
	if (!session.isAdmin) props = props.filter((p) => p.agentId === session.agentId);
	return props;
}

// Acuerdo con el dueño de cada inmueble (properties/{id}/privado/acuerdo), para varias casas a la vez.
// Por casa: su acuerdo; null si todavía no tiene; undefined si no se pudo leer (sin permiso o sin red), para que
// nadie lo tome por «no tiene» y escriba encima.
export async function loadAcuerdos(casas) {
	const pares = await Promise.all(casas.map(async (c) => [c.id, await getDoc(doc(db, 'properties', c.id, 'privado', 'acuerdo')).then((s) => (s.exists() ? s.data() : null), () => undefined)]));
	return Object.fromEntries(pares);
}

export const ms = enMs;

// Regla general de comisión (settings/crm): la de un inmueble sin comisión acordada y la de un negocio sin comisión propia.
// La cuenta es una sola: comisionDe en admin/js/acuerdo.js.
export { REGLAS_POR_DEFECTO };

// La parte del asesor es una sola (settings/crm.parteAsesorPct): la usan Reportes y la liquidación de las cotizaciones.
// Si la regla no la tiene guardada, vale la que se guardó antes en Cotizaciones (settings/cotizacion.pctAsesor); si
// tampoco, 50 %. `parteAsesorFuente` dice de dónde salió ('regla', 'cotizaciones' o 'defecto'): Reportes lo muestra
// para que el administrador la confirme (nada cambia de número sin que lo vea).
export async function loadReglas() {
	try {
		const [snap, cot] = await Promise.all([getDoc(doc(db, 'settings', 'crm')), getDoc(doc(db, 'settings', 'cotizacion')).catch(() => null)]);
		const d = snap.exists() ? { ...snap.data() } : {};
		const valido = (v) => v !== '' && v != null && Number.isFinite(Number(v));
		// La parte del asesor es un porcentaje de 0 a 100 (una guardada fuera de eso no vale: Reportes pide revisarla).
		const parteAsesorFuente = esPorcentaje(d.parteAsesorPct) ? 'regla' : esPorcentaje(cot?.data()?.pctAsesor) ? 'cotizaciones' : 'defecto';
		if (parteAsesorFuente !== 'regla') delete d.parteAsesorPct;
		if (parteAsesorFuente === 'cotizaciones') d.parteAsesorPct = cot.data().pctAsesor;
		return { ...Object.fromEntries(Object.entries(REGLAS_POR_DEFECTO).map(([k, v]) => [k, valido(d[k]) ? Number(d[k]) : v])), parteAsesorFuente };
	} catch {
		return { ...REGLAS_POR_DEFECTO, parteAsesorFuente: 'defecto' };
	}
}

// Comisión de un negocio de un cliente: la propia de ese negocio, si no la regla general de su operación
// (venta: % del precio; renta: meses de renta, con el monto como renta mensual y un año de contrato). La propia va en la
// misma forma: % en venta (comisionPct), meses en renta (comisionMeses). Un cliente de renta de antes con su % y sin
// meses sigue con su % (no cambia su monto sin que nadie lo vea); su ficha pide los meses.
// El cliente no guarda qué inmueble cerró: por eso aquí no entra el acuerdo de un inmueble.
const dato = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
export function comisionDeNegocio(c, reglas = REGLAS_POR_DEFECTO) {
	const renta = c.operacion === 'renta';
	const regla = renta ? (dato(c.comisionMeses) ? { tipo: 'meses', valor: Number(c.comisionMeses) }
		: dato(c.comisionPct) ? { tipo: 'pct', valor: Number(c.comisionPct) } : comisionDe('renta', null, reglas))
		: dato(c.comisionPct) ? { tipo: 'pct', valor: Number(c.comisionPct) } : comisionDe('venta', null, reglas);
	return montoComision(regla, c.montoEstimado);
}

export function textoRegla(reglas = REGLAS_POR_DEFECTO) {
	return `${textoComision(comisionDe('venta', null, reglas))} en venta · ${textoComision(comisionDe('renta', null, reglas))} en alquiler`;
}

// Estado de una actividad pendiente respecto a hoy.
export function vencimiento(a) {
	if (a.hecha) return 'hecha';
	const t = ms(a.fecha);
	if (!t) return 'sin-fecha';
	const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
	const manana = hoy.getTime() + 86400000;
	if (t < hoy.getTime()) return 'vencida';
	if (t < manana) return 'hoy';
	return 'proxima';
}

export async function crearActividad(datos) {
	const ref = doc(collection(db, 'actividades'));
	const a = {
		tipo: datos.tipo || 'tarea',
		titulo: String(datos.titulo || '').slice(0, 200),
		detalle: String(datos.detalle || '').slice(0, 2000),
		clienteId: datos.clienteId || '',
		clienteNombre: datos.clienteNombre || '',
		propertyId: datos.propertyId || '',
		propertyTitulo: datos.propertyTitulo || '',
		agentId: datos.agentId || session.agentId || '',
		fecha: datos.fecha ? Timestamp.fromDate(datos.fecha) : null,
		hecha: Boolean(datos.hecha),
		hechaEn: datos.hecha ? serverTimestamp() : null,
		autor: session.profile?.nombre || session.user?.email || '',
		createdAt: serverTimestamp()
	};
	await setDoc(ref, a);
	if (a.clienteId && (a.hecha || a.tipo === 'nota')) {
		await updateDoc(doc(db, 'clientes', a.clienteId), { ultimoContacto: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => {});
	}
	return { id: ref.id, ...a };
}

// Corrige el correo de un lead: la única forma (la ficha del cliente, en sus leads, y Solicitudes). Es el correo al que
// escriben los avisos del servidor (aviso-chat-envio.mjs, solicitud.mjs y rebotes.mjs lo leen de leads/{id}, nunca de una
// copia): limpio y en minúsculas, como lo guarda el sitio (los rebotes y las repetidas lo buscan tal cual). Quita «El correo
// no llegó». Una solicitud de reserva la corrige el servidor (/api/reenviar-enlace, solo el administrador): deja los
// renglones del historial y, abierta, le cambia el enlace y se lo manda al correo nuevo. Un lead de contacto (sin reserva)
// no recibe nada. Sin cambio (el mismo correo que el guardado ahora), no escribe nada. Devuelve { cambio, enviado: el correo
// al que salió el enlace ('' si no salió; null si no tocaba), motivo }. Las reglas: el administrador y el asesor del lead
// (firestore.rules match /leads).
export async function corregirCorreo(lead, correo) {
	const nuevo = limpiarCorreo(correo);
	if (!correoValido(nuevo)) throw new Error('Revisa el correo (p. ej. nombre@correo.com).');
	// Una solicitud de reserva: lo guarda el servidor (/api/reenviar-enlace; las reglas no lo dejan desde aquí), que le
	// cambia el enlace en la misma transacción (el viejo pudo llegar a otra persona) y, abierta, le manda el nuevo. Con el
	// mismo correo de ahora también va (otro enlace y otro correo: el reintento si el anterior no salió). Solo el administrador.
	if (lead.reserva?.codigo) {
		if (!session.isAdmin) throw new Error('El correo de una reserva lo corrige el administrador.');
		let r = {};
		try {
			const res = await fetch('/api/reenviar-enlace', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await session.user.getIdToken()}` }, body: JSON.stringify({ leadId: lead.id, correo: nuevo }) });
			r = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(r.error || `El servidor respondió ${res.status}.`);
		} catch (err) { throw err instanceof TypeError ? new Error('Sin conexión con el servidor: el correo no se cambió.') : err; }
		if (r.cambio) { lead.email = nuevo; delete lead.reboteCorreo; }
		return { cambio: Boolean(r.cambio), rotado: Boolean(r.rotado), enviado: r.enviado ? r.para || '' : '', motivo: r.motivo || '' };
	}
	// Se lee el guardado ahora (otra pestaña pudo corregirlo ya): el «antes» del historial es el de verdad.
	const ref = doc(db, 'leads', lead.id);
	const renglon = (que) => ({ que, quien: session.user.uid, nombre: session.profile?.nombre || '', cuando: new Date().toISOString() });
	const { cambio } = await runTransaction(db, async (tx) => {
		const l = (await tx.get(ref)).data() || {};
		const antes = limpiarCorreo(l.email);
		if (nuevo === antes) return { cambio: false };
		tx.update(ref, { email: nuevo, reboteCorreo: deleteField(), updatedAt: serverTimestamp(),
			...(l.reserva?.codigo ? { 'solicitud.historial': arrayUnion(renglon(queCorreoCorregido(antes, nuevo))) } : {}) });
		return { cambio: true };
	});
	lead.email = nuevo;
	delete lead.reboteCorreo;
	return { cambio, enviado: null, motivo: '' };
}
// Un correo como lo guarda el sitio: sin espacios y en minúsculas (lo que muestra el botón es lo que se guarda).
export const limpiarCorreo = (correo) => String(correo || '').trim().toLowerCase();

// Une los leads en una ficha por persona: busca cliente por teléfono o correo; si no existe, lo crea.
// Devuelve cuántos leads se vincularon y cuántos clientes nuevos se crearon.
// Corre en cada pestaña de Clientes que se abre: cada lead va en su transacción, que vuelve a leer el lead y lo salta
// si otra pestaña (u otra persona) ya lo unió; así dos pestañas no crean dos clientes del mismo lead. Al cliente que ya
// existe se le agrega con arrayUnion (no se pisa lo que otra pestaña agregó). Un cliente nuevo lleva un id sacado de su
// teléfono o correo (idClientePorContacto) y se escribe uniendo (merge + arrayUnion): dos leads distintos de la misma
// persona en dos pestañas caen en la misma ficha. Si ese id ya es de un cliente de otro asesor (las reglas no dejan
// escribirlo), el lead va a una ficha nueva con id al azar, como antes.
export async function sincronizarLeads(leads, clientes) {
	const porTel = new Map(clientes.filter((c) => c.telefonoNorm).map((c) => [c.telefonoNorm, c]));
	const porMail = new Map(clientes.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c]));
	const recordar = (c, tel, mail) => { if (tel && !porTel.has(tel)) porTel.set(tel, c); if (mail && !porMail.has(mail)) porMail.set(mail, c); };
	// Una solicitud de reserva por noche no es un cliente del CRM (la atiende Solicitudes).
	const pendientes = leads.filter((l) => !l.clienteId && !window.EQVacacional.esSolicitudReserva(l));
	let vinculados = 0;
	let nuevos = 0;
	for (const l of pendientes) {
		// El asesor solo puede vincular leads asignados a él.
		if (!session.isAdmin && l.agentId !== session.agentId) continue;
		const tel = telNorm(l.telefono);
		const mail = String(l.email || '').toLowerCase();
		const agentId = l.agentId || (session.isAdmin ? '' : session.agentId);
		const existente = (tel && porTel.get(tel)) || (mail && porMail.get(mail)) || null;
		const refLead = doc(db, 'leads', l.id);
		const unir = (idCliente) => runTransaction(db, async (tx) => {
			const ahora = await tx.get(refLead);
			if (!ahora.exists()) return { salto: '' };
			if (ahora.data().clienteId) return { salto: ahora.data().clienteId };
			if (existente) {
				tx.update(doc(db, 'clientes', existente.id), { ...(l.propertyId ? { interes: arrayUnion(l.propertyId) } : {}), leadIds: arrayUnion(l.id), updatedAt: serverTimestamp() });
				tx.update(refLead, { clienteId: existente.id });
				return { cliente: existente, nuevo: false };
			}
			const ref = idCliente ? doc(db, 'clientes', idCliente) : doc(collection(db, 'clientes'));
			const c = {
				nombre: l.nombre || 'Sin nombre',
				telefono: l.telefono || '',
				telefonoNorm: tel,
				email: l.email || '',
				tipo: 'comprador',
				etapa: 'nuevo',
				agentId,
				fuente: l.campana?.utm_source || l.origen || '',
				idioma: l.idioma || 'es',
				interes: l.propertyId ? [l.propertyId] : [],
				leadIds: [l.id],
				createdAt: l.createdAt || serverTimestamp(),
				updatedAt: serverTimestamp()
			};
			const { interes, ...resto } = c;
			tx.set(ref, { ...resto, ...(interes.length ? { interes: arrayUnion(...interes) } : {}), leadIds: arrayUnion(l.id) }, { merge: true });
			tx.update(refLead, { clienteId: ref.id });
			return { cliente: { id: ref.id, ...c }, nuevo: true };
		});
		const porContacto = existente ? '' : idClientePorContacto(tel, mail);
		let r;
		try { r = await unir(porContacto); } catch (err) {
			if (!porContacto || err?.code !== 'permission-denied') throw err;
			r = await unir('');
		}
		if (r.salto !== undefined) {
			// Otra pestaña ya lo unió: el próximo lead de la misma persona va a esa ficha.
			if (r.salto) { l.clienteId = r.salto; recordar(clientes.find((c) => c.id === r.salto) || { id: r.salto }, tel, mail); }
			continue;
		}
		const c = r.cliente;
		if (r.nuevo) { clientes.push(c); nuevos++; } else {
			c.interes = [...new Set([...(c.interes || []), ...(l.propertyId ? [l.propertyId] : [])])];
			c.leadIds = [...new Set([...(c.leadIds || []), l.id])];
		}
		recordar(c, tel, mail);
		l.clienteId = c.id;
		vinculados++;
	}
	return { vinculados, nuevos };
}

export function proximaActividad(actividades, clienteId) {
	return actividades
		.filter((a) => a.clienteId === clienteId && !a.hecha && ms(a.fecha))
		.sort((a, b) => ms(a.fecha) - ms(b.fecha))[0];
}

export function chipVencimiento(a) {
	const v = vencimiento(a);
	if (v === 'vencida') return badge('Vencida', 'danger');
	if (v === 'hoy') return badge('Hoy', 'warning');
	return null;
}
