// Lo privado de una casa por noche: el costo del socio (privado/socio: precios, margen, iCal) y los datos de llegada
// (privado/llegada: dirección y mapa). Una sola forma de escribirlo para todo el panel: la ficha, el importador,
// «Duplicar» y «Mis propiedades» del dueño. Se escribe solo lo que se pasa (merge): lo que cambió otra pantalla
// mientras tanto no se pisa. El contacto del socio no se copia aquí: vive en su ficha de Propietarios.
import { db, doc, setDoc, serverTimestamp } from './firebase.js';
import { session } from './session.js';
import '/js/calc-vacacional.js';

const V = window.EQVacacional;

// Cada campo del socio con su formato; solo los que vienen.
const LIMPIAR = {
	precioBase: (v) => Number(v) || 0,
	precioFinde: (v) => Number(v) || 0,
	margen: (v) => (v === null || v === undefined || v === '' ? V.MARGEN : Number(v)),
	tarifas: (v) => (v || []).filter((t) => t.desde && t.hasta && Number(t.precio) > 0).map((t) => ({ desde: t.desde, hasta: t.hasta, precio: Number(t.precio) })),
	icalUrl: (v) => String(v || '').trim()
};
export const socioLimpio = (s = {}) => Object.fromEntries(Object.keys(LIMPIAR).filter((k) => k in s).map((k) => [k, LIMPIAR[k](s[k])]));

// «tx»: una transacción o un lote (la ficha lo escribe junto con la casa). Sin él, se escribe en el momento.
// En una casa nueva va después de crearla: su regla la lee.
export async function guardarPrivadoVacacional(id, socio, llegada, tx = null) {
	const sello = { updatedAt: serverTimestamp(), updatedBy: session.user.uid };
	const escribir = (nombre, v) => {
		const r = doc(db, 'properties', id, 'privado', nombre);
		return tx ? tx.set(r, v, { merge: true }) : setDoc(r, v, { merge: true });
	};
	const s = socioLimpio(socio || {});
	if (Object.keys(s).length) await escribir('socio', { ...s, ...sello });
	if (llegada) await escribir('llegada', { direccion: String(llegada.direccion || '').trim(), mapa: String(llegada.mapa || '').trim(), ...sello });
}
