// La bitácora de cambios sensibles en el panel (lo puro, las fotos y las reglas: bitacora.js): anotar un cambio en el
// mismo lote o transacción que lo hace, y la lista «Cambios» de la ficha de una casa o de un dueño.
import { db, doc, getDoc, getDocs, collection, query, where, serverTimestamp } from './firebase.js';
import { h, modal, spinner, emptyState, showError, formatDate } from './ui.js';
import { dinero, diaConAnio, enMs } from './formato.js';
import { session } from './session.js';
import { renglon, diferencias, firma } from './bitacora.js';

// ¿Están publicadas las reglas con la bitácora? Con las de antes (el sitio se publica primero, las reglas en seguida), el
// renglón se negaría y con él todo el guardado: entonces se guarda como antes, sin renglón (esas reglas no lo piden).
// Lo dice reglas/r6, que solo las reglas nuevas dejan leer. El «sí» se guarda por sesión; el «no» se vuelve a preguntar en
// cada guardado: una pestaña abierta antes de publicar las reglas nuevas guardaría sin renglón y las reglas lo negarían.
let activa = null;
export function bitacoraActiva() {
	activa ||= getDoc(doc(db, 'reglas', 'r6')).then(() => true, () => { activa = null; return false; });
	return activa;
}

// Anota en `lote` (una transacción o un writeBatch) el renglón del cambio y devuelve su id para el `bitacoraId` del
// documento que cambia; null si no cambió nada sensible o si las reglas todavía son las de antes (`activa` = false).
export function anotar(lote, datos, activaYa) {
	const r = activaYa ? renglon(datos) : null;
	if (!r) return null;
	const ref = doc(collection(db, 'bitacora'));
	lote.set(ref, { ...r, quien: session.user.uid, nombre: String(session.profile?.nombre || '').slice(0, 120), cuando: serverTimestamp() });
	return ref.id;
}

const ms = enMs;

// Lista «Cambios» (solo el administrador): de una casa (casaId) o de un dueño (propietarioId). En la casa van también los
// cambios que el dueño hace él solo (properties/{id}/bitacora: precios, días bloqueados, «La casa»); en el dueño, las
// casas que se le pusieron o se le quitaron (los renglones de casa donde su id está antes o después, con el nombre de
// la casa y solo el cambio de dueño) y los datos de pago de antes de la bitácora (cambiosDatosPago). Lo más nuevo arriba.
// Un renglón de la bitácora: qué cambió (texto y/o «campo: antes → después») y, abajo, de quién, de qué casa y cuándo.
export function filaBitacora({ texto, cambios = [], detalle = [] }) {
	return h('li', { class: 'list-group-item px-0 text-break' },
		texto ? h('div', {}, texto) : null,
		cambios.map((c) => h('div', {}, h('span', { class: 'fw-semibold' }, `${c.campo}: `), c.antes, h('span', { class: 'text-muted', 'aria-label': 'cambió a' }, ' → '), c.despues)),
		h('div', { class: 'small text-muted' }, detalle.filter(Boolean).join(' · ')));
}

export async function verCambios({ casaId = '', propietarioId = '', titulo = 'Cambios', moneda = 'USD' }) {
	const caja = h('div', {}, spinner());
	modal({ title: titulo, body: caja });
	try {
		const todos = async (q) => (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
		// Con las reglas de antes la bitácora no se puede leer: se dice eso (no «sin permiso») y se muestra lo demás.
		let sinReglas = false;
		const deLaBitacora = (campo, valor) => todos(query(collection(db, 'bitacora'), where(campo, '==', valor)))
			.catch((err) => { if (err?.code !== 'permission-denied') throw err; sinReglas = true; return []; });
		const [sensibles, deLaCasa, deAntes, conEl, sinEl] = await Promise.all([
			deLaBitacora(casaId ? 'casa' : 'objeto', casaId || propietarioId),
			casaId ? todos(collection(db, 'properties', casaId, 'bitacora')).catch(() => []) : [],
			propietarioId ? todos(query(collection(db, 'cambiosDatosPago'), where('propietarioId', '==', propietarioId))).catch(() => []) : [],
			propietarioId ? deLaBitacora('despues.propietarioId', propietarioId) : [],
			propietarioId ? deLaBitacora('antes.propietarioId', propietarioId) : []
		]);
		// Del dueño: cada casa que pasó a él o dejó de ser suya, una vez (sin los cambios de precio de sus casas).
		const deCasas = [...new Map([...conEl, ...sinEl].filter((e) => e.tipo === 'casa' && e.antes?.propietarioId !== e.despues?.propietarioId).map((e) => [e.id, e])).values()];
		const casas = Object.fromEntries(await Promise.all([...new Set(deCasas.map((e) => e.casa || e.objeto))].map(async (x) => [x, (await getDoc(doc(db, 'properties', x)).catch(() => null))?.data()?.titulo || 'Casa borrada'])));
		// Los dueños que aparecen en un cambio de dueño, por su nombre.
		const ids = [...new Set([...sensibles, ...deCasas].flatMap((e) => [e.antes?.propietarioId, e.despues?.propietarioId]).filter(Boolean))];
		const nombres = Object.fromEntries(await Promise.all(ids.map(async (x) => [x, (await getDoc(doc(db, 'propietarios', x)).catch(() => null))?.data()?.nombre || x])));
		const nombreDe = (x) => nombres[x] || x;
		// Quién: el nombre de su usuario (quien lo verifican las reglas; el nombre guardado lo escribe quien anota).
		const uids = [...new Set([...sensibles, ...deLaCasa, ...deAntes, ...deCasas].map((e) => e.quien).filter((x) => typeof x === 'string' && x && !x.includes('/')))];
		const usuarios = Object.fromEntries(await Promise.all(uids.map(async (x) => [x, (await getDoc(doc(db, 'users', x)).catch(() => null))?.data() || null])));
		const textos = deLaCasa.map((b) => ({ cuando: ms(b.cuando), quien: b.quien, nombre: firma(b, usuarios), texto: b.que }));
		const sens = sensibles.filter((e) => casaId || ['propietario', 'permisosSocio'].includes(e.tipo)).map((e) => ({ cuando: ms(e.cuando), quien: e.quien, nombre: firma(e, usuarios), cambios: diferencias(e, { nombreDe, dinero: (n) => dinero(n, moneda), fecha: diaConAnio }) }));
		// Lo que el dueño cambió solo deja su texto y, si tocó precios, su renglón de la bitácora en la misma transacción:
		// una sola fila, no dos. Si el antes → después ya lo dice (su precio entre semana o de fin de semana), sin su texto
		// (diría lo mismo dos veces); con temporadas, el texto arriba (qué fechas) y el antes → después abajo.
		const loDiceElCambio = (s) => s.cambios.length && s.cambios.every((c) => ['precioBase', 'precioFinde'].includes(c.clave));
		for (const s of sens) {
			// La misma transacción: la misma hora del servidor (la más cercana, por si acaso, y a lo más 2 s).
			let i = -1;
			textos.forEach((t, k) => { if (t.quien === s.quien && Math.abs(t.cuando - s.cuando) <= 2000 && (i < 0 || Math.abs(t.cuando - s.cuando) < Math.abs(textos[i].cuando - s.cuando))) i = k; });
			if (i < 0) continue;
			const { texto } = textos.splice(i, 1)[0];
			if (!loDiceElCambio(s)) s.texto = texto;
		}
		const filas = [...sens, ...textos,
			...deCasas.map((e) => ({ cuando: ms(e.cuando), nombre: firma(e, usuarios), texto: casas[e.casa || e.objeto],
				cambios: diferencias({ tipo: 'casa', antes: { propietarioId: e.antes?.propietarioId || '' }, despues: { propietarioId: e.despues?.propietarioId || '' } }, { nombreDe }) })),
			...deAntes.map((c) => ({ cuando: ms(c.cuando), nombre: firma(c, usuarios), cambios: [{ campo: 'Datos de pago', antes: c.antes || '(vacío)', despues: c.despues || '(vacío)' }] }))
		].sort((a, b) => b.cuando - a.cuando);
		caja.replaceChildren(sinReglas ? h('p', { class: 'small text-muted' }, 'Los cambios se verán cuando se publiquen las reglas nuevas de Firestore.') : null,
			filas.length ? h('ul', { class: 'list-group list-group-flush' }, filas.map((f) => filaBitacora({ ...f, detalle: [f.nombre || 'Servidor', f.cuando ? formatDate(new Date(f.cuando)) : ''] })))
			: sinReglas ? null : emptyState('Sin cambios anotados todavía.'));
	} catch (err) { caja.replaceChildren(); showError(err); }
}
