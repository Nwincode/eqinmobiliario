// Tarjeta «Estado del sistema» de Inicio (solo el administrador): lo que falló y desde cuándo, con la misma fila de la
// campana (avisos.js). Lo arma admin/js/estado-sistema.js (puro) con lo que el servidor anota en estado/{pieza} y lo que
// ya está guardado (meta/publish, correos por reintentar, avisos de datos de pago, calendarios que no responden).
// Sin nada roto no se muestra.
import '/js/calc-vacacional.js';
import { db, doc, getDoc, getDocs, collection, query, where } from './firebase.js';
import { h } from './ui.js';
import { fila } from './avisos.js';
import { hace } from './avisos-reglas.js';
import { armarEstado, correosDe, calendariosDe } from './estado-sistema.js';

const V = window.EQVacacional;
const todos = async (q) => (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
const seguro = (p, vacio) => p.catch((err) => { console.warn('Estado del sistema', err); return vacio; });
const dato = async (...ruta) => { const s = await getDoc(doc(db, ...ruta)); return s.exists() ? s.data() : null; };

// casas: las del panel (ya leídas en Inicio); solo se leen los calendarios de las de por noche.
export async function leerEstado(casas = []) {
	const [estados, publish, chats, pagos, pagosNuevos] = await Promise.all([
		seguro(todos(collection(db, 'estado')), []),
		seguro(dato('meta', 'publish'), {}),
		seguro(todos(query(collection(db, 'chats'), where('avisoPendiente', '>', ''))), []),
		seguro(todos(query(collection(db, 'cambiosDatosPago'), where('avisado', '==', false))), []),
		seguro(todos(query(collection(db, 'bitacora'), where('avisado', '==', false))), [])
	]);
	const calendarios = (await Promise.all(casas.filter((c) => c.operacion === 'vacacional').map(async (c) => {
		const [leido, socio] = await Promise.all([seguro(dato('properties', c.id, 'privado', 'icalLeido'), null), seguro(dato('properties', c.id, 'privado', 'socio'), null)]);
		return calendariosDe(c, leido, socio, V.CALENDARIOS);
	}))).flat();
	return armarEstado({ estados: Object.fromEntries(estados.map(({ id, ...d }) => [id, d])), publish: publish || {}, correos: correosDe(chats), pagos: [...pagos, ...pagosNuevos].map((p) => ({ desde: p.cuando })), calendarios });
}

export async function tarjetaEstado(casas) {
	const lista = await leerEstado(casas);
	if (!lista.length) return null;
	const rotos = lista.filter((x) => !x.aviso).length;
	return h('section', { class: 'card mb-4 tarjeta-pendientes tarjeta-avisos', 'aria-labelledby': 'estado-titulo' },
		h('div', { class: 'card-header tarjeta-pendientes-cab' },
			h('span', { class: 'tarjeta-pendientes-icono icon-exclamation-triangle', 'aria-hidden': 'true' }),
			h('div', { class: 'me-auto' },
				h('h2', { class: 'tarjeta-pendientes-titulo', id: 'estado-titulo' }, 'Estado del sistema'),
				h('div', { class: 'tarjeta-pendientes-ayuda' }, rotos ? 'Lo que falló y desde cuándo. Se quita solo cuando vuelve a funcionar.' : 'Nada roto. Topes anti-robots de las últimas 24 h.'))),
		h('ul', { class: 'avisos-filas' }, lista.map((x) => fila({ ...x, urgente: !x.aviso, fecha: 0,
			detalle: [x.detalle, x.desde ? `${x.aviso ? '' : 'desde '}${hace(x.desde)}` : ''].filter(Boolean).join(' · ') }, false))));
}
