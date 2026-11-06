// Portal del propietario: arma una copia resumida (sin nombres ni teléfonos de clientes)
// en portalPropietarios/{token}. El token es el enlace privado; regenerarlo revoca el anterior.
import {
	db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp, siteConfig, onSnapshot
} from './firebase.js';
import { session, loadAgents } from './session.js';
import { loadActividades, loadClientes, loadPropietarios, ms } from './crm.js';
import { estadoDe, visibilidadDe, seOfrece, ESTADOS_PROPIEDAD } from './estados.js';
import { portalesDe } from './difusion.js';
import { slugify } from './ui.js';
import { filasClientes, numerarClientes, combinarClientes, eventosAuto, fechaOferta } from './portal-clientes.js';

const SITE = (siteConfig.siteUrl || 'https://eqinmobiliario.gt').replace(/\/$/, '');
const DIA = 86400000;

export const TIPOS_BITACORA = [
	['foto', 'Fotos nuevas'],
	['precio', 'Cambio de precio'],
	['oferta', 'Oferta recibida'],
	['visita', 'Visita'],
	['paso', 'Próximo paso'],
	['nota', 'Nota']
];

// 32 bytes aleatorios en base64url: 43 caracteres, imposible de adivinar.
export function nuevoToken() {
	const b = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const enlacePortal = (token) => `${SITE}/propietarios/#t=${token}`;

const iso = (v) => { const t = ms(v); return t ? new Date(t).toISOString() : ''; };
const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const recorta = (s, n) => String(s || '').trim().slice(0, n);
const num = (v) => Number(v) || 0;

// Cómo se anuncia la propiedad: solo datos públicos de la ficha (nada interno).
function anuncioDe(p, urlFicha, enActivo) {
	const e = p.en || {};
	const conIngles = enActivo && urlFicha && e.titulo && e.descripcion;
	return {
		tipo: recorta(p.tipo, 40),
		zona: recorta(p.zona, 100),
		ciudad: recorta(p.ciudad, 100),
		habitaciones: num(p.habitaciones),
		banos: num(p.banos),
		m2Construccion: num(p.m2Construccion),
		m2Terreno: num(p.m2Terreno),
		descripcion: recorta(p.descripcion, 6000),
		fotos: (p.fotos || []).map((f) => f && f.url).filter((u) => /^https:\/\//.test(u || '')).slice(0, 6),
		en: conIngles ? {
			titulo: recorta(e.titulo, 200),
			descripcion: recorta(e.descripcion, 6000),
			url: `${SITE}${p.vip ? '/en/luxury/' : '/en/property/'}${slugify(e.slug || e.titulo)}/`
		} : null
	};
}

// Fecha desde la que la propiedad está en el mercado: primer estado visible del historial.
function enMercado(p) {
	const visibles = new Set(ESTADOS_PROPIEDAD.filter((e) => e.visibilidad === 'visible').map((e) => e.valor));
	const hist = (p.historialEstado || []).slice().sort((a, b) => ms(a.fecha) - ms(b.fecha));
	const inicio = hist.find((e) => visibles.has(e.estado));
	const desde = iso(inicio?.fecha) || iso(p.createdAt);
	const hasta = visibilidadDe(p) === 'visible' ? '' : iso(p.estadoFecha);
	return { desde, hasta };
}

// Leads (consultas) por propiedad. El asesor solo puede leer los suyos.
async function consultasPorPropiedad(ids) {
	const porId = Object.fromEntries(ids.map((id) => [id, []]));
	if (session.isAdmin) {
		await Promise.all(ids.map(async (id) => {
			const s = await getDocs(query(collection(db, 'leads'), where('propertyId', '==', id)));
			porId[id] = s.docs.map((d) => d.data());
		}));
	} else {
		const s = await getDocs(query(collection(db, 'leads'), where('agentId', '==', session.agentId || '-')));
		for (const d of s.docs) { const l = d.data(); if (porId[l.propertyId]) porId[l.propertyId].push(l); }
	}
	return porId;
}

const contar = (fechas, ahora) => ({ total: fechas.length, d30: fechas.filter((t) => t && ahora - t <= 30 * DIA).length });

// Actividades de visita de las propiedades de este propietario (con o sin comentario).
export async function visitasDe(prop, { actividades, clientes } = {}) {
	const ids = new Set((prop.propiedades || []).map((x) => x.propertyId).filter(Boolean));
	const [acts, cls] = await Promise.all([actividades || loadActividades(), clientes || loadClientes()]);
	const interes = Object.fromEntries(cls.map((c) => [c.id, c.interes || []]));
	return acts.filter((a) => a.tipo === 'visita').map((a) => {
		let pid = a.propertyId && ids.has(a.propertyId) ? a.propertyId : '';
		if (!pid && !a.propertyId && a.clienteId) {
			const coinciden = (interes[a.clienteId] || []).filter((x) => ids.has(x));
			if (coinciden.length === 1) pid = coinciden[0];
		}
		return pid ? { ...a, pid } : null;
	}).filter(Boolean);
}

// Arma el documento resumido. Devuelve { datos, privado }: `datos` va al enlace público;
// `privado` (números fijos de cada cliente y la última lista completa) se guarda solo en el
// documento del propietario, que el público nunca lee. De los clientes solo van número de orden, canal, fechas y etapa
// (sin ids, nombres, teléfonos ni correos); de la bitácora, solo los textos marcados como visibles.
export async function armarPortal(prop) {
	const ids = [...new Set((prop.propiedades || []).map((x) => x.propertyId).filter(Boolean))];
	const [props, agentes, consultas, actividades, clientes, site] = await Promise.all([
		Promise.all(ids.map(async (id) => { const s = await getDoc(doc(db, 'properties', id)); return s.exists() ? { id, ...s.data() } : null; })),
		loadAgents(),
		consultasPorPropiedad(ids),
		loadActividades(),
		loadClientes(),
		getDoc(doc(db, 'settings', 'site')).then((s) => (s.exists() ? s.data() : {})).catch(() => ({}))
	]);
	const ahora = Date.now();
	const portales = portalesDe(site);
	const enActivo = Boolean(site.en) && site.en.activo !== false;
	const visitas = await visitasDe(prop, { actividades, clientes });
	const bitacora = (prop.bitacora || []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
	const ag = agentes.find((a) => a.id === prop.agentId) || {};
	// El asesor no lee los clientes ni las consultas de otros asesores: lo que no ve se toma de la copia privada.
	const visibles = session.isAdmin ? null : new Set(clientes.map((c) => c.id));
	const privadoAnterior = prop.portalPrivado || {};
	const privado = {};

	const propiedades = props.filter(Boolean).map((p) => {
		const est = estadoDe(p);
		const merc = enMercado(p);
		const bit = bitacora.filter((b) => !b.propertyId || b.propertyId === p.id || ids.length === 1);
		const vis = visitas.filter((a) => a.pid === p.id);
		const hechas = vis.filter((a) => a.hecha || ms(a.fecha) < ahora);
		const fechaBit = (tipo) => bit.filter((b) => b.tipo === tipo).map((b) => Date.parse(`${b.fecha}T12:00:00`) || 0);
		const conOferta = clientes.filter((c) => ['oferta', 'cierre'].includes(c.etapa) && (c.interes || []).includes(p.id));
		const ofertasClientes = conOferta.map((c) => fechaOferta(c, actividades.filter((a) => a.clienteId === c.id)));
		const ofertasBit = fechaBit('oferta');
		const ofertas = ofertasBit.length >= ofertasClientes.length ? ofertasBit : ofertasClientes;
		const manuales = [
			...bit.filter((b) => b.visible && b.texto).map((b) => ({ fecha: b.fecha, tipo: b.tipo, texto: recorta(b.texto, 600) })),
			...vis.filter((a) => a.visiblePropietario && a.comentarioPropietario)
				.map((a) => ({ fecha: iso(a.fecha).slice(0, 10), tipo: 'visita', texto: recorta(a.comentarioPropietario, 600) }))
		];
		const hp = (p.historialPrecio || []).map((x) => ({ precio: Number(x.precio) || 0, moneda: x.moneda || 'USD', fecha: iso(x.fecha) })).filter((x) => x.precio);
		const enLinea = p.publicado && seOfrece(p);
		const difundida = portales.filter((po) => enLinea && (p.difusion || {})[po.id]?.estado === 'publicada')
			.map((po) => { const r = p.difusion[po.id]; return { nombre: po.nombre, url: /^https?:\/\//.test(r.url || '') ? r.url : '', desde: r.fecha || '' }; });
		const urlFicha = enLinea && p.slug ? `${SITE}${p.vip ? '/vip/' : '/propiedad/'}${p.slug}/` : '';
		// Toda la bitácora (visible o no) evita repetir lo que el asesor ya anotó a mano.
		const auto = eventosAuto({
			enMercadoDesde: merc.desde, enLinea, portales: difundida, historialPrecio: hp,
			visitasHechas: hechas.map((a) => ms(a.fecha)), ofertas: ofertasClientes,
			manuales: [...manuales, ...bit.map((b) => ({ fecha: b.fecha, tipo: b.tipo }))]
		});
		const eventos = [...manuales, ...auto].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 60);
		const ant = privadoAnterior[p.id] || {};
		const filas = combinarClientes(filasClientes({ propertyId: p.id, clientes, leads: consultas[p.id] || [], visitas: vis, actividades, ahora }), ant.clientes, visibles);
		const { lista: interesados, numeros } = numerarClientes(filas, ant.numeros);
		let consultasN = contar((consultas[p.id] || []).map((l) => ms(l.createdAt)), ahora);
		if (visibles && ant.consultas && ant.consultas.total > consultasN.total) consultasN = ant.consultas;
		privado[p.id] = {
			numeros,
			clientes: Object.fromEntries(filas.map(({ id, ...f }) => [id, f])),
			consultas: consultasN
		};
		return {
			id: p.id,
			titulo: recorta(p.titulo, 200),
			foto: (p.fotos || [])[0]?.url || '',
			url: urlFicha,
			operacion: p.operacion || 'venta',
			estado: est.valor,
			estadoFecha: iso(p.estadoFecha),
			enMercadoDesde: merc.desde,
			enMercadoHasta: merc.hasta,
			precio: Number(p.precio) || 0,
			moneda: p.moneda || 'USD',
			historialPrecio: hp.length ? hp : (p.precio ? [{ precio: Number(p.precio), moneda: p.moneda || 'USD', fecha: iso(p.createdAt) }] : []),
			kpis: {
				consultas: consultasN,
				visitas: contar([...hechas.map((a) => ms(a.fecha)), ...fechaBit('visita')], ahora),
				ofertas: contar(ofertas, ahora),
				visitasProximas: vis.filter((a) => !a.hecha && ms(a.fecha) >= ahora).length
			},
			eventos,
			clientes: interesados,
			portales: [...(urlFicha ? [{ nombre: 'eqinmobiliario.gt', url: urlFicha, desde: '' }] : []), ...difundida]
		};
	});

	const datos = {
		v: 2,
		email: String(prop.email || '').trim().toLowerCase(),
		agentId: prop.agentId || '',
		propietarioId: prop.id,
		nombre: primerNombre(prop.nombre),
		asesor: { nombre: recorta(ag.nombre, 100), whatsapp: String(ag.whatsapp || ag.telefono || '').replace(/[^\d+]/g, ''), telefono: String(ag.telefono || ag.whatsapp || '').replace(/[^\d+]/g, ''), foto: ag.foto || '' },
		exclusivaFin: prop.exclusiva && prop.exclusivaFin ? prop.exclusivaFin : '',
		proximoPaso: recorta(prop.proximoPaso, 400),
		propiedades,
		updatedAt: serverTimestamp()
	};
	return { datos, privado };
}

// Comentarios que el propietario dejó desde su portal (el más nuevo primero).
// El asesor solo puede leer los de sus propietarios: la consulta lleva su agentId.
function consultaComentarios(prop) {
	const filtros = [where('propietarioId', '==', prop.id)];
	if (!session.isAdmin) filtros.push(where('agentId', '==', session.agentId || '-'));
	return query(collection(db, 'comentariosPropietarios'), ...filtros);
}
const ordenarComentarios = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.fecha) - ms(a.fecha));

export async function comentariosDe(prop) {
	return ordenarComentarios(await getDocs(consultaComentarios(prop)));
}

// En vivo: llama cb(lista) cada vez que el propietario responde. Devuelve la función para dejar de escuchar.
export function escucharComentarios(prop, cb, alFallar) {
	return onSnapshot(consultaComentarios(prop), (s) => cb(ordenarComentarios(s)), alFallar);
}

// Borra la copia publicada de un token (si ya no existe, no hay nada que hacer).
export async function borrarCopia(token) {
	const ref = doc(db, 'portalPropietarios', token);
	if ((await getDoc(ref)).exists()) await deleteDoc(ref);
}

// Publica (o actualiza) el portal. Crea el token la primera vez. Devuelve el token.
export async function publicarPortal(prop, { regenerar = false } = {}) {
	const anterior = prop.portalToken || '';
	const token = regenerar || !anterior ? nuevoToken() : anterior;
	const { datos, privado } = await armarPortal(prop);
	await setDoc(doc(db, 'portalPropietarios', token), datos);
	if (token !== anterior) {
		// El enlace anterior se borra antes de guardar el nuevo: si falla, no queda abierto sin saberlo.
		if (anterior) await borrarCopia(anterior);
		await updateDoc(doc(db, 'propietarios', prop.id), { portalToken: token, portalPrivado: privado, portalActualizado: serverTimestamp() });
	} else {
		await updateDoc(doc(db, 'propietarios', prop.id), { portalPrivado: privado, portalActualizado: serverTimestamp() });
	}
	prop.portalPrivado = privado;
	prop.portalToken = token;
	prop.portalActualizado = new Date();
	return token;
}

// Quita el acceso por completo (borra la copia y el token).
export async function cerrarPortal(prop) {
	// Sin .catch: si no se pudo borrar la copia, el enlace seguiría abierto y hay que avisar.
	if (prop.portalToken) await borrarCopia(prop.portalToken);
	await updateDoc(doc(db, 'propietarios', prop.id), { portalToken: '' });
	prop.portalToken = '';
}

// Actualización automática: cuando cambia una propiedad, una visita o la etapa de un cliente,
// se vuelven a publicar los portales de los propietarios de esas propiedades.
// No bloquea la pantalla, junta varios cambios seguidos (1,5 s) y si falla solo avisa en la consola.
// Lo pendiente se guarda en el navegador: si se cierra la pestaña antes, se publica al volver a entrar.
const CLAVE_PENDIENTES = 'portal-pendientes';
const pendientesRefresco = new Set();
const clientesPendientes = new Set();
let temporizadorRefresco = null;

function guardarPendientes() {
	try {
		if (pendientesRefresco.size || clientesPendientes.size) localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify({ p: [...pendientesRefresco], c: [...clientesPendientes] }));
		else localStorage.removeItem(CLAVE_PENDIENTES);
	} catch { /* sin almacenamiento: se publica igual mientras la pestaña siga abierta */ }
}

function programar() {
	guardarPendientes();
	if (!pendientesRefresco.size && !clientesPendientes.size) return;
	clearTimeout(temporizadorRefresco);
	temporizadorRefresco = setTimeout(() => { refrescarAhora().catch((err) => console.warn('Portal del propietario: no se pudo actualizar.', err)); }, 1500);
}

export function refrescarPortalesDe(propertyIds) {
	for (const id of [].concat(propertyIds || [])) if (id) pendientesRefresco.add(id);
	programar();
}

async function refrescarAhora() {
	const ids = new Set(pendientesRefresco);
	const cls = [...clientesPendientes];
	pendientesRefresco.clear();
	clientesPendientes.clear();
	try {
		// Un cambio de etapa también toca las propiedades que el cliente visitó o consultó, aunque ya no estén en su interés.
		if (cls.length) {
			const acts = await loadActividades().catch(() => []);
			for (const a of acts) if (a.propertyId && cls.includes(a.clienteId)) ids.add(a.propertyId);
			for (const c of await loadClientes().catch(() => [])) if (cls.includes(c.id)) (c.interes || []).forEach((x) => ids.add(x));
		}
		const propietarios = await loadPropietarios();
		const tocados = propietarios.filter((p) => p.portalToken && (p.propiedades || []).some((x) => ids.has(x.propertyId)));
		for (const prop of tocados) {
			try { await publicarPortal(prop); } catch (err) { console.warn(`Portal del propietario ${prop.id}: no se pudo actualizar.`, err); }
		}
	} catch (err) {
		// No se pudo ni empezar: se deja pendiente para el próximo intento.
		ids.forEach((x) => pendientesRefresco.add(x));
		cls.forEach((x) => clientesPendientes.add(x));
		throw err;
	} finally {
		guardarPendientes();
	}
}

// Atajo para cambios de un cliente o de una actividad: la propiedad de la actividad, las de interés
// del cliente y las que visitó.
export function refrescarPorCliente(cliente, propertyId = '', extra = []) {
	if (cliente?.id) clientesPendientes.add(cliente.id);
	refrescarPortalesDe([...(propertyId ? [propertyId] : (cliente?.interes || [])), ...extra]);
}

// Al entrar al panel se publica lo que quedó pendiente de la vez anterior.
export function reanudarRefrescos() {
	try {
		const g = JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) || 'null');
		if (!g) return;
		(g.p || []).forEach((x) => x && pendientesRefresco.add(x));
		(g.c || []).forEach((x) => x && clientesPendientes.add(x));
	} catch { return; }
	programar();
}
