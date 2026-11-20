// Campana de avisos (barra de arriba) y tarjeta «Avisos» de Inicio: lo que espera a quien está en el panel, cada uno
// con un enlace a donde se resuelve. Lo arma avisos-reglas.js (puro) con lo que ya está guardado; aquí solo se lee la
// base (cada fuente por su lado: una que falle no deja la campana vacía) y se pinta.
// Quién ve qué: el administrador, todo; el asesor, los cambios que piden sus dueños y sus exclusivas (no lee
// solicitudes ni chats); el socio, sus solicitudes sin responder, los mensajes de sus clientes y su pago a EQ.
import '/js/calc-vacacional.js';
import { db, doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where, orderBy, limit, serverTimestamp } from './firebase.js';
import { h, showError } from './ui.js';
import { armarAvisos, clavesPorRevisar, claveListo, hace } from './avisos-reglas.js';
import { bajoElPlan, conDatosDelChat } from './reservas-calculo.js';

const V = window.EQVacacional;
const DIA = 86400000;
const ms = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === 'number' ? v : Date.parse(v || '') || 0);
const todos = async (q) => (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
const seguro = (p, vacio = []) => p.catch((err) => { console.warn('Avisos', err); return vacio; });

// El último mensaje de cada chat abierto (uno por chat): si es del cliente, falta responderle.
// Abierto = no cancelado ni «No se dio», y con la salida hace menos de 7 días.
async function sinResponder(chats) {
	const desde = V.sumarDias(V.hoy(), -7);
	const abiertos = chats.filter((c) => !['no', 'cancelada'].includes(c.estado) && String(c.salida || '') >= desde);
	const ultimos = await Promise.all(abiertos.map(async (c) => {
		const s = await seguro(getDocs(query(collection(db, 'chats', c.id, 'mensajes'), orderBy('createdAt', 'desc'), limit(1))), null);
		const m = s?.docs[0]?.data();
		return m?.de === 'cliente' ? { codigo: c.codigo, nombre: String(c.nombre || '').trim().split(/\s+/)[0], casa: c.propertyTitulo, fecha: ms(m.createdAt) } : null;
	}));
	return ultimos.filter(Boolean);
}

// ¿Qué «Listo» ya se marcaron? Con las reglas de antes no se puede leer: sin «Listo» (los avisos se ven igual).
async function atendidos(claves) {
	const hechos = new Set();
	let puede = true;
	await Promise.all([...new Set(claves)].map(async (k) => {
		try { if ((await getDoc(doc(db, 'avisosAtendidos', k))).exists()) hechos.add(k); } catch { puede = false; }
	}));
	return { hechos, puede };
}

async function cambiosDeDuenos() {
	const { session } = await import('./session.js');
	const res = await fetch('/api/mi-casa', { headers: { Authorization: `Bearer ${await session.user.getIdToken()}` } });
	if (!res.ok) throw new Error(`Cambios de los dueños: ${res.status}`);
	return (await res.json()).cambios || [];
}

async function leerFuentes() {
	const { session, misCasas } = await import('./session.js');
	const ahora = Date.now();
	const hoy = V.hoy();
	if (session.esSocio) {
		const mio = session.profile?.propietarioId || '-';
		const [chats, mias, reservas] = await Promise.all([
			seguro(todos(query(collection(db, 'chats'), where('propietarioId', '==', mio)))),
			seguro(misCasas()),
			seguro(todos(query(collection(db, 'reservas'), where('propietarioId', '==', mio))))]);
		// Un chat de una casa que ya no es suya se ve en Solicitudes, pero no lo puede responder.
		const suyas = new Set(mias.filter((c) => c.operacion === 'vacacional').map((c) => c.id));
		const deHoy = chats.filter((c) => suyas.has(c.propertyId));
		return {
			solicitudes: deHoy.filter((c) => !c.estado && String(c.llegada || '') >= hoy).map((c) => ({
				leadId: c.leadId, codigo: c.codigo, nombre: String(c.nombre || '').trim().split(/\s+/)[0], casa: c.propertyTitulo, creado: ms(c.createdAt), estado: 'pendiente',
				alerta: V.alertaSolicitud('pendiente', ms(c.createdAt), c, null, null, ahora)
			})),
			mensajes: await sinResponder(deHoy),
			comisiones: reservas.filter((r) => r.codigo && !r.comision?.comprobante).map((r) => ({ codigo: r.codigo, casa: r.propertyTitulo, vence: r.comision?.vence, nivel: V.nivelComision(r, ahora) })).filter((r) => r.nivel >= 1)
		};
	}
	const { loadPropietarios, loadPropiedades, loadReservas, loadAcuerdos } = await import('./crm.js');
	const { exclusivasPorVencer } = await import('./acuerdo.js');
	const { conDueno } = await import('./duenos.js');
	const admin = session.isAdmin;
	const filtroAsesor = admin ? [] : [where('agentId', '==', session.agentFiltro)];
	const [casas, propietarios, leads, chats, reservas, comentarios, nuevos, cambiosDueno, congelados] = await Promise.all([
		seguro(loadPropiedades()), seguro(loadPropietarios()),
		admin ? seguro(todos(query(collection(db, 'leads'), where('reserva.codigo', '>', '')))) : [],
		admin ? seguro(todos(collection(db, 'chats'))) : [],
		admin ? seguro(loadReservas()) : [],
		// Todas las respuestas del dueño: un pedido de cambios con una aprobación más nueva de la misma casa ya no avisa.
		seguro(todos(filtroAsesor.length ? query(collection(db, 'comentariosPropietarios'), ...filtroAsesor) : collection(db, 'comentariosPropietarios'))),
		// Leads de la web sin atender: el administrador, todos; el asesor, los suyos (las reglas no le dejan leer otros).
		seguro(todos(query(collection(db, 'leads'), ...filtroAsesor, where('estado', '==', 'nuevo')))),
		// Lo que un dueño cambió él solo de su casa por noche (ya publicado): lo lee el servidor (netlify/functions/mi-casa.mjs).
		admin ? seguro(cambiosDeDuenos()) : [],
		// Montos congelados: una cotizada por debajo del precio de la casa la confirma el administrador (bajoElPlan).
		admin ? seguro(todos(collection(db, 'montosSolicitud'))) : []]);
	const montos = Object.fromEntries(congelados.map((m) => [m.id, m]));
	const chatDe = Object.fromEntries(chats.map((c) => [c.codigo, c]));
	const casa = Object.fromEntries(casas.map((c) => [c.id, c]));
	const dueno = Object.fromEntries(propietarios.map((p) => [p.id, p]));
	const reserva = Object.fromEntries(reservas.map((r) => [r.id, r]));
	const conCasa = casas.filter((c) => conDueno(c, propietarios));
	const acuerdos = await seguro(loadAcuerdos(conCasa), {});
	return {
		solicitudes: leads.map((l) => {
			const est = l.solicitud?.estado || 'pendiente';
			return {
				leadId: l.id, codigo: l.reserva.codigo, nombre: l.nombre, casa: l.propertyTitulo || casa[l.propertyId]?.titulo, creado: ms(l.createdAt),
				// Una solicitud sin responder cuya llegada ya pasó ya no se puede atender: no avisa.
				estado: est === 'pendiente' && String(l.reserva.llegada || '') < hoy ? 'vieja' : est,
				equipo: bajoElPlan(montos[l.id]),
				alerta: ((a) => (a === 'mora' && reserva[l.solicitud?.reservaId]?.comision?.comprobante ? '' : a))(
					// Con lo que dice su chat (pago marcado, comprobante): la misma cuenta de Solicitudes (V.nivelMora).
					V.alertaSolicitud(est, ms(l.createdAt), l.reserva, reserva[l.solicitud?.reservaId] && conDatosDelChat(reserva[l.solicitud.reservaId], chatDe[l.reserva.codigo]), casa[l.propertyId]?.vacacional?.bloqueos, ahora))
			};
		}),
		mensajes: await sinResponder(chats),
		comprobantes: reservas.filter((r) => r.codigo && r.estado === 'confirmada' && r.comision?.comprobante && !r.comision.pagada).map((r) => ({
			codigo: r.codigo, socio: dueno[r.propietarioId]?.nombre, casa: r.propertyTitulo, fecha: ms(r.updatedAt) || ahora })),
		comentarios: comentarios.filter((c) => c.tipo === 'cambios' && !comentarios.some((x) => x.tipo === 'aprobado' && x.propiedadId === c.propiedadId && ms(x.fecha) > ms(c.fecha))).map((c) => ({ id: c.id, propietarioId: c.propietarioId, dueno: dueno[c.propietarioId]?.nombre, casa: casa[c.propiedadId]?.titulo, texto: c.texto, fecha: ms(c.fecha), agentId: c.agentId })),
		// Las solicitudes de reserva por noche no son leads del CRM: ya avisan como solicitud.
		leads: nuevos.filter((l) => !V.esSolicitudReserva(l)).map((l) => ({ id: l.id, nombre: String(l.nombre || '').trim().split(/\s+/)[0], casa: l.propertyTitulo, creado: ms(l.createdAt) })),
		cambiosDueno: cambiosDueno.map((c) => ({ id: c.id, nombre: c.nombre, casa: c.titulo, fecha: c.cuando || ahora, cuantos: (c.cambios || []).length })),
		exclusivas: exclusivasPorVencer(conCasa, acuerdos, propietarios, { dias: 30 }).map((x) => ({
			casaId: x.casa.id, casa: x.casa.titulo, dueno: x.dueno?.nombre, fin: x.acuerdo?.exclusivaFin, dias: x.dias, agentId: x.casa.agentId || '' }))
	};
}

// Una sola lectura a la vez; se repite como mucho cada 2 minutos (o al instante con forzar, tras resolver algo).
let ultimo = { ts: 0, promesa: null };
export function cargarAvisos(forzar = false) {
	if (!forzar && ultimo.promesa && Date.now() - ultimo.ts < 120000) return ultimo.promesa;
	const promesa = leerFuentes().then(async (f) => {
		const { hechos, puede } = await atendidos(clavesPorRevisar(f));
		return { avisos: armarAvisos({ ...f, atendidos: hechos }), puedeListo: puede };
	});
	ultimo = { ts: Date.now(), promesa };
	promesa.catch(() => { ultimo = { ts: 0, promesa: null }; });
	return promesa;
}

// Después de responder, confirmar, pagar o marcar «Listo»: la campana y la tarjeta se vuelven a contar.
export const avisarAvisos = () => document.dispatchEvent(new CustomEvent('avisos'));

// «Listo» con «Deshacer» en la misma fila (sin preguntar antes).
async function marcarListo(aviso, fila, btn) {
	if (btn) btn.disabled = true;
	const { session } = await import('./session.js');
	const { tipo, objeto, fin, agentId } = aviso.listo;
	const ref = doc(db, 'avisosAtendidos', claveListo(aviso.listo));
	try {
		await setDoc(ref, { tipo, objeto, ...(fin ? { fin } : {}), agentId, por: session.user.uid, fecha: serverTimestamp() });
	} catch (err) { if (btn) btn.disabled = false; return showError(err); }
	const original = [...fila.childNodes];
	fila.classList.add('aviso-hecho');
	fila.replaceChildren(h('span', { class: 'aviso-icono icon-check', 'aria-hidden': 'true' }),
		h('span', { class: 'aviso-texto', role: 'status' }, 'Listo: ya no se avisa.'),
		h('button', { type: 'button', class: 'btn btn-sm btn-link aviso-deshacer', onclick: async () => {
			try { await deleteDoc(ref); } catch (err) { return showError(err); }
			fila.classList.remove('aviso-hecho');
			fila.replaceChildren(...original);
			avisarAvisos();
		} }, 'Deshacer'));
	avisarAvisos();
}

// Una fila: ícono, qué pasa, de qué casa y cuándo; un toque lleva a donde se resuelve.
function fila(a, puedeListo, alIr) {
	const li = h('li', { class: `aviso-fila${a.urgente ? ' aviso-urgente' : ''}` },
		h('a', { href: a.href, class: 'aviso-enlace', onclick: alIr },
			h('span', { class: `aviso-icono ${a.icono}`, 'aria-hidden': 'true' }),
			h('span', { class: 'aviso-texto' },
				h('span', { class: 'aviso-titulo' }, a.titulo),
				h('span', { class: 'aviso-detalle' }, [a.detalle, a.tipo === 'exclusiva' ? '' : hace(a.fecha)].filter(Boolean).join(' · ')))),
		a.listo && puedeListo ? h('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary aviso-listo', title: 'Ya lo atendí: dejar de avisar', onclick: (e) => marcarListo(a, li, e.currentTarget) },
			h('span', { class: 'icon-check', 'aria-hidden': 'true' }), 'Listo') : null);
	return li;
}

const contar = (n) => (n === 1 ? '1 aviso' : `${n} avisos`);

// La campana en pantalla (una por sesión del panel; al volver a entrar se pinta otra y esta queda sin uso).
let actual = null;
window.addEventListener('hashchange', () => { actual?.menu.hide(); actual?.actualizar(false); });
document.addEventListener('avisos', () => actual?.actualizar(true));
document.addEventListener('pendientes', () => actual?.actualizar(true));

// Campana de la barra de arriba. Se pinta una vez; se vuelve a contar al cambiar de pantalla (cada 2 min como mucho)
// y al instante cuando algo se resuelve.
export function campana() {
	const numero = h('span', { class: 'nav-aviso avisos-numero', hidden: true, 'aria-hidden': 'true' });
	const btn = h('button', { type: 'button', class: 'btn btn-sm btn-light avisos-btn', 'aria-label': 'Avisos', title: 'Avisos',
		'aria-expanded': 'false', 'data-bs-toggle': 'dropdown', 'data-bs-auto-close': 'outside' },
	h('span', { class: 'icon-bell', 'aria-hidden': 'true' }), numero);
	const lista = h('div', { class: 'dropdown-menu dropdown-menu-end avisos-lista' });
	const caja = h('div', { class: 'dropdown avisos' }, btn, lista);
	const menu = new window.bootstrap.Dropdown(btn, { popperConfig: { strategy: 'fixed' } });
	// Con la lista abierta solo cambia el número: la fila recién marcada «Listo» (con su «Deshacer») sigue ahí
	// hasta cerrarla.
	let pendiente = null;
	const pintarLista = ({ avisos, puedeListo }) => lista.replaceChildren(
		h('div', { class: 'avisos-cab' }, h('strong', {}, 'Avisos'), h('span', { class: 'avisos-ayuda' }, 'Cada uno se quita solo al resolverlo.')),
		avisos.length ? h('ul', { class: 'avisos-filas' }, avisos.map((a) => fila(a, puedeListo, () => menu.hide())))
			: h('p', { class: 'avisos-vacio' }, h('span', { class: 'icon-check-circle', 'aria-hidden': 'true' }), 'Nada por atender. Aquí te aviso cuando llegue algo.'));
	const pintar = (datos) => {
		const n = datos.avisos.length;
		numero.hidden = !n;
		numero.textContent = String(n > 99 ? '99+' : n);
		btn.setAttribute('aria-label', n ? `Avisos: ${contar(n)}` : 'Avisos: nada por atender');
		if (lista.classList.contains('show')) pendiente = datos;
		else pintarLista(datos);
	};
	btn.addEventListener('hidden.bs.dropdown', () => { if (pendiente) pintarLista(pendiente); pendiente = null; });
	actual = { actualizar: (forzar) => cargarAvisos(forzar).then(pintar, (err) => console.warn('Avisos', err)), menu };
	actual.actualizar(true);
	return caja;
}

// Tarjeta de Inicio: los primeros 5, con la misma fila de la campana.
export async function tarjetaAvisos() {
	const { avisos, puedeListo } = await cargarAvisos();
	if (!avisos.length) return null;
	const resto = avisos.length - 5;
	return h('section', { class: 'card mb-4 tarjeta-pendientes tarjeta-avisos', 'aria-labelledby': 'avisos-titulo' },
		h('div', { class: 'card-header tarjeta-pendientes-cab' },
			h('span', { class: 'tarjeta-pendientes-icono icon-bell', 'aria-hidden': 'true' }),
			h('div', { class: 'me-auto' },
				h('h2', { class: 'tarjeta-pendientes-titulo', id: 'avisos-titulo' }, 'Avisos'),
				h('div', { class: 'tarjeta-pendientes-ayuda' }, 'Lo que espera por ti. Cada uno se quita solo al resolverlo.')),
			h('span', { class: 'nav-aviso', title: contar(avisos.length) }, h('span', { 'aria-hidden': 'true' }, String(avisos.length)), h('span', { class: 'visually-hidden' }, contar(avisos.length)))),
		h('ul', { class: 'avisos-filas' }, avisos.slice(0, 5).map((a) => fila(a, puedeListo))),
		resto > 0 ? h('button', { type: 'button', class: 'pendientes-mas btn btn-link', onclick: () => document.querySelector('.avisos-btn')?.click() },
			`Ver ${resto} más`, h('span', { class: 'icon-angle-right', 'aria-hidden': 'true' })) : null);
}
