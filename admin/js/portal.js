// Portal del propietario: arma una copia resumida (sin nombres ni teléfonos de clientes)
// en portalPropietarios/{token}. El token es el enlace privado; regenerarlo revoca el anterior.
import {
	db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp, siteConfig
} from './firebase.js';
import { session, loadAgents } from './session.js';
import { loadActividades, loadClientes, ms } from './crm.js';
import { estadoDe, visibilidadDe, seOfrece, ESTADOS_PROPIEDAD } from './estados.js';
import { portalesDe } from './difusion.js';

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

// Arma el documento resumido. Nada de clientes: solo conteos y textos marcados como visibles.
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
	const visitas = await visitasDe(prop, { actividades, clientes });
	const bitacora = (prop.bitacora || []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
	const ag = agentes.find((a) => a.id === prop.agentId) || {};

	const propiedades = props.filter(Boolean).map((p) => {
		const est = estadoDe(p);
		const merc = enMercado(p);
		const bit = bitacora.filter((b) => !b.propertyId || b.propertyId === p.id || ids.length === 1);
		const vis = visitas.filter((a) => a.pid === p.id);
		const hechas = vis.filter((a) => a.hecha || ms(a.fecha) < ahora);
		const fechaBit = (tipo) => bit.filter((b) => b.tipo === tipo).map((b) => Date.parse(`${b.fecha}T12:00:00`) || 0);
		const ofertasClientes = clientes.filter((c) => ['oferta', 'cierre'].includes(c.etapa) && (c.interes || []).includes(p.id)).map((c) => ms(c.updatedAt) || ms(c.createdAt));
		const ofertasBit = fechaBit('oferta');
		const ofertas = ofertasBit.length >= ofertasClientes.length ? ofertasBit : ofertasClientes;
		const eventos = [
			...bit.filter((b) => b.visible && b.texto).map((b) => ({ fecha: b.fecha, tipo: b.tipo, texto: recorta(b.texto, 600) })),
			...vis.filter((a) => a.visiblePropietario && a.comentarioPropietario)
				.map((a) => ({ fecha: iso(a.fecha).slice(0, 10), tipo: 'visita', texto: recorta(a.comentarioPropietario, 600) }))
		].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 60);
		const hp = (p.historialPrecio || []).map((x) => ({ precio: Number(x.precio) || 0, moneda: x.moneda || 'USD', fecha: iso(x.fecha) })).filter((x) => x.precio);
		const enLinea = p.publicado && seOfrece(p);
		const difundida = portales.filter((po) => enLinea && (p.difusion || {})[po.id]?.estado === 'publicada')
			.map((po) => { const r = p.difusion[po.id]; return { nombre: po.nombre, url: /^https?:\/\//.test(r.url || '') ? r.url : '', desde: r.fecha || '' }; });
		const urlFicha = enLinea && p.slug ? `${SITE}${p.vip ? '/vip/' : '/propiedad/'}${p.slug}/` : '';
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
				consultas: contar((consultas[p.id] || []).map((l) => ms(l.createdAt)), ahora),
				visitas: contar([...hechas.map((a) => ms(a.fecha)), ...fechaBit('visita')], ahora),
				ofertas: contar(ofertas, ahora),
				visitasProximas: vis.filter((a) => !a.hecha && ms(a.fecha) >= ahora).length
			},
			eventos,
			portales: [...(urlFicha ? [{ nombre: 'eqinmobiliario.gt', url: urlFicha, desde: '' }] : []), ...difundida]
		};
	});

	return {
		v: 1,
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
	const datos = await armarPortal(prop);
	await setDoc(doc(db, 'portalPropietarios', token), datos);
	if (token !== anterior) {
		// El enlace anterior se borra antes de guardar el nuevo: si falla, no queda abierto sin saberlo.
		if (anterior) await borrarCopia(anterior);
		await updateDoc(doc(db, 'propietarios', prop.id), { portalToken: token, portalActualizado: serverTimestamp() });
	} else {
		await updateDoc(doc(db, 'propietarios', prop.id), { portalActualizado: serverTimestamp() });
	}
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
