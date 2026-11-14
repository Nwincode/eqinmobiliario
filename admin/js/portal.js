// Resumen que ve el dueño (propietario o colaborador) en su panel: una copia sin nombres ni teléfonos de clientes
// en portalPropietarios/{id}. La lee solo esa persona (con su usuario del panel) y el equipo; la arma el equipo.
// Lleva lo que la persona necesita de su ficha (nombre, correo, teléfono, datos de pago) y, de cada casa en venta o
// renta, cómo va. Las casas por noche no van aquí: el dueño las ve y las cambia en vivo (views/mis-casas.js).
import {
	db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField, collection, query, where, serverTimestamp, siteConfig, onSnapshot, runTransaction
} from './firebase.js';
import { session, loadAgents } from './session.js';
import { loadActividades, loadClientes, loadPropietarios, loadAcuerdos, ms } from './crm.js';
import { telefonoWa } from './formato.js';
import { estadoDe, visibilidadDe, seOfrece, ESTADOS_PROPIEDAD } from './estados.js';
import { portalesDe } from './difusion.js';
import { filasClientes, numerarClientes, combinarClientes, eventosAuto, fechaOferta } from './portal-clientes.js';
import { casasDe, vaAlResumen, exclusivaHasta, datosDelDueno, nuevoToken, enlaceSeguro } from './duenos.js';

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


const iso = (v) => { const t = ms(v); return t ? new Date(t).toISOString() : ''; };
const recorta = (s, n) => String(s || '').trim().slice(0, n);
const num = (v) => Number(v) || 0;

// Cómo se anuncia la propiedad: solo datos públicos de la ficha (nada interno).
function anuncioDe(p) {
	return {
		tipo: recorta(p.tipo, 40),
		zona: recorta(p.zona, 100),
		ciudad: recorta(p.ciudad, 100),
		habitaciones: num(p.habitaciones),
		banos: num(p.banos),
		parqueos: num(p.parqueos),
		m2Construccion: num(p.m2Construccion),
		m2Terreno: num(p.m2Terreno),
		descripcion: recorta(p.descripcion, 6000),
		fotos: (p.fotos || []).map((f) => enlaceSeguro(f && f.url)).filter(Boolean).slice(0, 6)
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
		const s = await getDocs(query(collection(db, 'leads'), where('agentId', '==', session.agentFiltro)));
		for (const d of s.docs) { const l = d.data(); if (porId[l.propertyId]) porId[l.propertyId].push(l); }
	}
	return porId;
}

const contar = (fechas, ahora) => ({ total: fechas.length, d30: fechas.filter((t) => t && ahora - t <= 30 * DIA).length });

// Actividades de visita de estas casas (con o sin comentario).
export async function visitasDe(casaIds, { actividades, clientes } = {}) {
	const ids = new Set(casaIds.filter(Boolean));
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

// Casas de una persona que van al resumen (venta y renta): las de su lista y las que dicen ser suyas.
export async function casasDelResumen(prop) {
	const enLista = (prop.propiedades || []).map((x) => x.propertyId).filter(Boolean);
	const [deLista, propias] = await Promise.all([
		Promise.all(enLista.map(async (id) => { const s = await getDoc(doc(db, 'properties', id)).catch(() => null); return s?.exists() ? { id, ...s.data() } : null; })),
		getDocs(query(collection(db, 'properties'), where('propietarioId', '==', prop.id))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })), () => [])
	]);
	const todas = [...deLista.filter(Boolean), ...propias.filter((c) => !enLista.includes(c.id))];
	return casasDe(prop, todas).filter(vaAlResumen);
}

// Arma el documento resumido. Devuelve { datos, privado }: `datos` es lo que lee el dueño;
// `privado` (números fijos de cada cliente y la última lista completa) se guarda solo en la
// ficha de la persona, que el dueño no lee. De los clientes solo van número de orden, canal, fechas y etapa
// (sin ids, nombres, teléfonos ni correos); de la bitácora, solo los textos marcados como visibles.
export async function armarPortal(prop) {
	const props = await casasDelResumen(prop);
	const ids = props.map((p) => p.id);
	const [agentes, consultas, actividades, clientes, site] = await Promise.all([
		loadAgents(),
		consultasPorPropiedad(ids),
		loadActividades(),
		loadClientes(),
		getDoc(doc(db, 'settings', 'site')).then((s) => (s.exists() ? s.data() : {})).catch(() => ({}))
	]);
	const ahora = Date.now();
	// La exclusiva es de cada inmueble (privado/acuerdo); se calcula más abajo, ya con lo guardado la vez anterior.
	const acuerdos = await loadAcuerdos(props);
	const portales = portalesDe(site);
	const visitas = await visitasDe(ids, { actividades, clientes });
	const bitacora = (prop.bitacora || []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
	const ag = agentes.find((a) => a.id === prop.agentId) || {};
	// El asesor no lee los clientes ni las consultas de otros asesores: lo que no ve se toma de la copia privada.
	const visibles = session.isAdmin ? null : new Set(clientes.map((c) => c.id));
	const privadoAnterior = prop.portalPrivado || {};
	const privado = {};

	const propiedades = props.map((p) => {
		const est = estadoDe(p);
		const merc = enMercado(p);
		// Solo lo de esta casa y lo anotado para «todas»: nunca lo de otra casa (tampoco de una por noche, que no va aquí).
		const bit = bitacora.filter((b) => !b.propertyId || b.propertyId === p.id);
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
		// Hasta cuándo va la exclusiva de esta casa (si quien actualiza no lee su acuerdo, la de la vez anterior).
		const exclusiva = exclusivaHasta(acuerdos[p.id], prop, p.operacion, ant.exclusivaHasta);
		privado[p.id] = {
			exclusivaHasta: exclusiva,
			numeros,
			clientes: Object.fromEntries(filas.map(({ id, ...f }) => [id, f])),
			consultas: consultasN
		};
		return {
			id: p.id,
			titulo: recorta(p.titulo, 200),
			// Solo la fecha (nunca la comisión ni los impuestos acordados), y la de esta casa.
			exclusivaHasta: exclusiva,
			anuncio: anuncioDe(p),
			foto: enlaceSeguro((p.fotos || [])[0]?.url),
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
		v: VERSION_RESUMEN,
		...datosDelDueno(prop),
		agentId: prop.agentId || '',
		propietarioId: prop.id,
		asesor: { nombre: recorta(ag.nombre, 100), whatsapp: telefonoWa(ag.whatsapp || ag.telefono), telefono: String(ag.telefono || ag.whatsapp || '').replace(/[^\d+]/g, ''), foto: ag.foto || '' },
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
	if (!session.isAdmin) filtros.push(where('agentId', '==', session.agentFiltro));
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

// Versión del resumen: la ficha la guarda (portalVersion) para saber a quién le falta rehacerlo (asegurarResumenes).
export const VERSION_RESUMEN = 3;


// Los resúmenes de una persona (el asesor solo puede buscar entre los suyos).
async function resumenesDe(propietarioId) {
	const filtros = [where('propietarioId', '==', propietarioId), ...(session.isAdmin ? [] : [where('agentId', '==', session.agentFiltro)])];
	return (await getDocs(query(collection(db, 'portalPropietarios'), ...filtros))).docs.map((d) => d.id);
}

// Publica (o actualiza) el resumen: uno solo por persona. Devuelve su id.
// En esta pestaña, uno a la vez por persona (lo de fondo, un guardado y un refresco no se pisan).
const enCurso = new Map();
export function publicarPortal(prop) {
	const turno = (enCurso.get(prop.id) || Promise.resolve()).catch(() => {}).then(() => publicarUno(prop));
	enCurso.set(prop.id, turno);
	turno.finally(() => { if (enCurso.get(prop.id) === turno) enCurso.delete(prop.id); }).catch(() => {});
	return turno;
}

async function publicarUno(prop) {
	const ref = doc(db, 'propietarios', prop.id);
	// 1) El id se reserva en la ficha con una transacción, ANTES de escribir el resumen: si otra pestaña o persona
	//    publica a la vez, la segunda ve el id ya reservado y lo usa (nunca dos ids para una persona).
	//    El id de un resumen de una versión anterior fue un enlace que se mandó por WhatsApp y que abría sin contraseña;
	//    el resumen nuevo lleva teléfono y datos de pago: nace con un id nuevo y el anterior se borra (paso 3).
	const { token, anterior, privadoAnterior } = await runTransaction(db, async (tx) => {
		const f = (await tx.get(ref)).data() || {};
		if (f.portalToken && f.portalVersion === VERSION_RESUMEN) return { token: f.portalToken, anterior: '', privadoAnterior: f.portalPrivado };
		const nuevo = nuevoToken();
		tx.update(ref, { portalToken: nuevo, portalVersion: VERSION_RESUMEN });
		return { token: nuevo, anterior: f.portalToken || '', privadoAnterior: f.portalPrivado };
	});
	// 2) El resumen. Si no se pudo escribir, la ficha deja de darlo por hecho (la próxima vez se rehace).
	let privado;
	try {
		const armado = await armarPortal({ ...prop, portalPrivado: privadoAnterior || prop.portalPrivado });
		privado = armado.privado;
		await setDoc(doc(db, 'portalPropietarios', token), armado.datos);
	} catch (err) {
		await runTransaction(db, async (tx) => {
			const f = (await tx.get(ref)).data() || {};
			if (f.portalToken === token && !(await getDoc(doc(db, 'portalPropietarios', token)).catch(() => null))?.exists()) tx.update(ref, { portalVersion: deleteField() });
		}).catch(() => {});
		throw err;
	}
	await updateDoc(ref, { portalPrivado: privado, portalActualizado: serverTimestamp() });
	// 3) Cualquier otro resumen de la misma persona se borra, menos el que la ficha tiene AHORA.
	const ahora = (await getDoc(ref).catch(() => null))?.data()?.portalToken || token;
	const otros = new Set([...(await resumenesDe(prop.id).catch(() => [])), anterior].filter((x) => x && x !== token && x !== ahora));
	for (const id of otros) await borrarCopia(id).catch((err) => console.warn('Resumen viejo sin borrar', id, err));
	Object.assign(prop, { portalPrivado: privado, portalToken: ahora, portalVersion: VERSION_RESUMEN, portalActualizado: new Date() });
	return ahora;
}

// Actualización automática: cuando cambia una propiedad, una visita o la etapa de un cliente,
// se vuelven a publicar los resúmenes de los dueños de esas propiedades.
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
	temporizadorRefresco = setTimeout(() => { refrescarAhora().catch((err) => console.warn('Resumen del dueño: no se pudo actualizar.', err)); }, 1500);
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
		const [propietarios, casas] = await Promise.all([loadPropietarios(),
			Promise.all([...ids].map((id) => getDoc(doc(db, 'properties', id)).then((s) => (s.exists() ? { id, ...s.data() } : { id }), () => ({ id }))))]);
		const tocados = propietarios.filter((p) => p.portalToken && casasDe(p, casas).length);
		for (const prop of tocados) {
			try { await publicarPortal(prop); } catch (err) { console.warn(`Resumen del dueño ${prop.id}: no se pudo actualizar.`, err); }
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
