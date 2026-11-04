// CRM: clientes, actividades (agenda e historial) y propietarios.
// El asesor solo consulta lo suyo (lo exigen las reglas de Firestore); el administrador, todo.
import {
	db, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, serverTimestamp, Timestamp, writeBatch
} from './firebase.js';
import { h, badge, toDate } from './ui.js';
import { session } from './session.js';

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
	['llamada', 'Llamada', '📞'], ['whatsapp', 'WhatsApp', '💬'], ['correo', 'Correo', '✉️'],
	['visita', 'Visita', '🏠'], ['reunion', 'Reunión', '🤝'], ['tarea', 'Tarea', '✔️'], ['nota', 'Nota', '📝']
];

export const etapaLabel = (v) => (ETAPAS.find(([k]) => k === v) || ETAPAS[0])[1];
export const etapaBadge = (v) => { const e = ETAPAS.find(([k]) => k === v) || ETAPAS[0]; return badge(e[1], e[2]); };
export const tipoActividad = (v) => TIPOS_ACTIVIDAD.find(([k]) => k === v) || TIPOS_ACTIVIDAD[5];

// Teléfono comparable: solo dígitos; los de 8 dígitos se asumen de Guatemala.
export function telNorm(tel) {
	let n = String(tel || '').replace(/\D/g, '');
	if (n.length === 8) n = `502${n}`;
	return n;
}

export function money(monto, moneda = 'USD') {
	if (!monto) return '—';
	return `${{ USD: 'US$', GTQ: 'Q' }[moneda] || moneda} ${Number(monto).toLocaleString('en-US')}`;
}

// Consulta respetando el rol: el asesor filtra por su agentId (si no, Firestore la rechaza).
async function cargar(nombre, filtroAsesor = '') {
	const col = collection(db, nombre);
	let q = col;
	if (!session.isAdmin) q = query(col, where('agentId', '==', session.agentId || '-'));
	else if (filtroAsesor) q = query(col, where('agentId', '==', filtroAsesor));
	const snap = await getDocs(q);
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export const loadClientes = (asesor) => cargar('clientes', asesor);
export const loadActividades = (asesor) => cargar('actividades', asesor);
export const loadPropietarios = (asesor) => cargar('propietarios', asesor);

export async function loadPropiedades() {
	const snap = await getDocs(collection(db, 'properties'));
	let props = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
	if (!session.isAdmin) props = props.filter((p) => p.agentId === session.agentId);
	return props;
}

export const ms = (v) => toDate(v)?.getTime() || 0;

// Regla general de comisión (settings/crm): se usa cuando el cliente no tiene una comisión propia.
export const REGLAS_POR_DEFECTO = { comisionVentaPct: 5, comisionRentaMeses: 1, parteAsesorPct: 50 };

export async function loadReglas() {
	try {
		const snap = await getDoc(doc(db, 'settings', 'crm'));
		const d = snap.exists() ? snap.data() : {};
		return Object.fromEntries(Object.entries(REGLAS_POR_DEFECTO).map(([k, v]) => [k, Number.isFinite(Number(d[k])) && d[k] !== '' && d[k] != null ? Number(d[k]) : v]));
	} catch {
		return { ...REGLAS_POR_DEFECTO };
	}
}

// Comisión de un negocio: la propia del cliente o la regla general
// (venta: % del precio; renta: meses de renta, con el monto como renta mensual).
export function comisionDe(c, reglas = REGLAS_POR_DEFECTO) {
	const monto = Number(c.montoEstimado) || 0;
	if (c.comisionPct !== undefined && c.comisionPct !== null && c.comisionPct !== '') return monto * Number(c.comisionPct) / 100;
	if (c.operacion === 'renta') return monto * reglas.comisionRentaMeses;
	return monto * reglas.comisionVentaPct / 100;
}

export function textoRegla(reglas = REGLAS_POR_DEFECTO) {
	const meses = reglas.comisionRentaMeses;
	return `${reglas.comisionVentaPct} % en venta · ${meses} ${meses === 1 ? 'mes' : 'meses'} de renta en alquiler`;
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

// Une los leads en una ficha por persona: busca cliente por teléfono o correo; si no existe, lo crea.
// Devuelve cuántos leads se vincularon y cuántos clientes nuevos se crearon.
export async function sincronizarLeads(leads, clientes) {
	const porTel = new Map(clientes.filter((c) => c.telefonoNorm).map((c) => [c.telefonoNorm, c]));
	const porMail = new Map(clientes.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c]));
	const pendientes = leads.filter((l) => !l.clienteId);
	let vinculados = 0;
	let nuevos = 0;
	let batch = writeBatch(db);
	let ops = 0;
	const flush = async () => { if (ops) { await batch.commit(); batch = writeBatch(db); ops = 0; } };
	for (const l of pendientes) {
		const tel = telNorm(l.telefono);
		const mail = String(l.email || '').toLowerCase();
		let c = (tel && porTel.get(tel)) || (mail && porMail.get(mail));
		// El asesor solo puede vincular leads asignados a él.
		const agentId = l.agentId || (session.isAdmin ? '' : session.agentId);
		if (!session.isAdmin && l.agentId !== session.agentId) continue;
		if (!c) {
			const ref = doc(collection(db, 'clientes'));
			c = {
				id: ref.id,
				nombre: l.nombre || 'Sin nombre',
				telefono: l.telefono || '',
				telefonoNorm: tel,
				email: l.email || '',
				tipo: l.propertyId ? 'comprador' : 'comprador',
				etapa: 'nuevo',
				agentId,
				fuente: l.campana?.utm_source || l.origen || '',
				idioma: l.idioma || 'es',
				interes: l.propertyId ? [l.propertyId] : [],
				leadIds: [l.id],
				createdAt: l.createdAt || serverTimestamp(),
				updatedAt: serverTimestamp()
			};
			batch.set(ref, Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'id')));
			ops++;
			if (tel) porTel.set(tel, c);
			if (mail) porMail.set(mail, c);
			clientes.push(c);
			nuevos++;
		} else {
			const interes = [...new Set([...(c.interes || []), ...(l.propertyId ? [l.propertyId] : [])])];
			const leadIds = [...new Set([...(c.leadIds || []), l.id])];
			c.interes = interes;
			c.leadIds = leadIds;
			batch.update(doc(db, 'clientes', c.id), { interes, leadIds, updatedAt: serverTimestamp() });
			ops++;
		}
		batch.update(doc(db, 'leads', l.id), { clienteId: c.id });
		ops++;
		l.clienteId = c.id;
		vinculados++;
		if (ops >= 400) await flush();
	}
	await flush();
	return { vinculados, nuevos };
}

export function proximaActividad(actividades, clienteId) {
	return actividades
		.filter((a) => a.clienteId === clienteId && !a.hecha && ms(a.fecha))
		.sort((a, b) => ms(a.fecha) - ms(b.fecha))[0];
}

export function fechaCorta(v) {
	const d = toDate(v);
	if (!d) return '';
	return d.toLocaleString('es-GT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function chipVencimiento(a) {
	const v = vencimiento(a);
	if (v === 'vencida') return h('span', { class: 'badge text-bg-danger' }, 'Vencida');
	if (v === 'hoy') return h('span', { class: 'badge text-bg-warning' }, 'Hoy');
	return null;
}
