// Bitácora de cambios sensibles: una sola pieza para todo lo que toca dinero o al dueño (quién, cuándo, antes, después y
// qué). Cada cambio deja su renglón en bitacora/{id} en el MISMO lote o transacción que el cambio, y el documento que
// cambia lo nombra en `bitacoraId`: las reglas (firestore.rules, fotoCasa…) comparan la foto de antes y la de después
// con lo guardado, así no se puede cambiar sin dejar rastro ni anotar otra cosa. El servidor anota lo suyo en su
// transacción (netlify/lib/bitacora.mjs, con estas mismas fotos). La lee solo el administrador.
//  - casa: moneda, dueño (propietarioId), limpieza; precios del dueño (base, fin de semana, temporadas) y margen.
//  - propietario: datos de pago (con correo al equipo: `avisado`) y permisos del socio.
//  - permisos: los interruptores de todos los socios (settings/permisosSocios).
//  - permisosSocio: lo que resulta para un socio (permisosSocios/{id}: lo de todos, lo suyo y el atraso de su comisión).
//  - reserva: «Revisé Airbnb…» (revisadoAMano) al confirmar sin poder leer el calendario.
// Las fotos usan los mismos valores por omisión que las reglas: si se cambia una, se cambian las dos.
import { PERMISOS } from './permisos-socio.js';

export const MARGEN_POR_OMISION = 20;
const de = (o, k, d) => (o && o[k] !== undefined && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : d);

export const fotoCasa = (p = {}, s = {}) => ({
	moneda: de(p, 'moneda', ''), propietarioId: de(p, 'propietarioId', ''), limpieza: de(de(p, 'vacacional', {}), 'limpieza', 0),
	precioBase: de(s, 'precioBase', 0), precioFinde: de(s, 'precioFinde', 0), tarifas: de(s, 'tarifas', []), margen: de(s, 'margen', MARGEN_POR_OMISION)
});
export const fotoPropietario = (d = {}) => ({ datosPago: de(d, 'datosPago', ''), permisos: de(d, 'permisos', {}) });
export const fotoPermisos = (d = {}) => ({ precios: de(d, 'precios', true), fechas: de(d, 'fechas', true), casa: de(d, 'casa', true) });

// Igualdad de valores como la de las reglas (mapas sin importar el orden de sus llaves; 5 y 5.0 iguales).
export function igual(a, b) {
	if (a === b) return true;
	if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => igual(x, b[i]));
	if (a && b && typeof a === 'object' && typeof b === 'object') {
		const ka = Object.keys(a).filter((k) => a[k] !== undefined), kb = Object.keys(b).filter((k) => b[k] !== undefined);
		return ka.length === kb.length && ka.every((k) => igual(a[k], b[k]));
	}
	return false;
}

// El renglón (sin quién ni cuándo, que pone quien lo escribe). null si no cambió nada sensible.
// `avisado: false` cuando cambian los datos de pago: el servidor manda el correo al equipo y lo marca.
export function renglon({ tipo, objeto, casa = '', antes, despues }) {
	if (igual(antes, despues)) return null;
	return { tipo, objeto, ...(casa ? { casa } : {}), antes, despues, ...(tipo === 'propietario' && antes.datosPago !== despues.datosPago ? { avisado: false } : {}) };
}

// Quién hizo el cambio, por su nombre en el panel (users/{quien}, que solo cambia el administrador). El `nombre` guardado
// en el renglón lo escribe quien anota (las reglas no lo atan): vale solo si no hay usuario con ese id (el servidor, o
// alguien que ya no está). Un usuario sin nombre, por su correo. usuarios: { [uid]: { nombre, email } | null }.
export const firma = (e, usuarios = {}) => {
	const u = usuarios[e?.quien];
	return u ? String(u.nombre || u.email || 'Sin nombre') : String(e?.nombre || '');
};

// Qué cambió, en palabras, para la lista de la ficha: [{ campo, antes, despues }] con los valores ya escritos.
const NOMBRES = {
	moneda: 'Moneda', propietarioId: 'Dueño', limpieza: 'Limpieza', precioBase: 'Precio del dueño por noche', precioFinde: 'Precio del dueño en fin de semana',
	tarifas: 'Temporadas', margen: 'Margen de EQ', datosPago: 'Datos de pago', permisos: 'Permisos', precios: 'Precios y temporadas (todos)',
	fechas: 'Bloquear fechas (todos)', casa: '«La casa» (todos)', revisadoAMano: 'Revisó a mano'
};
const DE_UN_SOCIO = Object.fromEntries(PERMISOS.map(([c, nombre]) => [c, nombre]));
export function diferencias(e, { nombreDe = (x) => x, dinero = (n) => String(n), fecha = (f) => f } = {}) {
	const texto = (k, v) => {
		if (k === 'propietarioId') return v ? nombreDe(v) : 'sin dueño';
		if (k === 'margen') return `${v} %`;
		if (['limpieza', 'precioBase', 'precioFinde'].includes(k)) return Number(v) ? dinero(Number(v)) : '—';
		if (k === 'tarifas') return Array.isArray(v) && v.length ? v.map((t) => `${fecha(t.desde)} – ${fecha(t.hasta)}: ${dinero(Number(t.precio))}`).join('; ') : 'ninguna';
		// Los de un socio (propietarios/{id}.permisos), con los nombres de sus interruptores; «devolver» solo cuando está puesto.
		if (k === 'permisos') return Object.entries(v || {}).filter(([c, x]) => (c === 'devolver' ? x === true : x === false || x === true))
			.map(([c, x]) => (c === 'devolver' ? 'Devueltos hasta que pague' : `${DE_UN_SOCIO[c] || c} ${x ? 'sí' : 'no'}`)).join(', ') || 'los de todos';
		if (k === 'revisadoAMano') return Array.isArray(v) && v.length ? v.join(' y ') : '—';
		if (typeof v === 'boolean') return v ? 'encendido' : 'apagado';
		return v === '' || v == null ? '(vacío)' : String(v);
	};
	return Object.keys({ ...e.antes, ...e.despues }).filter((k) => !igual(e.antes?.[k], e.despues?.[k]))
		.map((k) => ({ campo: e.tipo === 'permisosSocio' ? (NOMBRES[k] || k).replace(' (todos)', '') : NOMBRES[k] || k, antes: texto(k, e.antes?.[k]), despues: texto(k, e.despues?.[k]) }));
}
