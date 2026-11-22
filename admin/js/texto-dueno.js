// Lo que el dueño cambia de su calendario y sus precios en «Mis propiedades» (views/mis-casas.js), en palabras: el texto
// de su renglón en la bitácora de la casa (properties/{id}/bitacora `que`, lo ven el equipo y él). Solo con estas
// palabras: firestore.rules no le deja escribir otra cosa (TEXTO_DUENO, la misma expresión, copiada tal cual; la prueba
// scripts/test-bitacora.mjs revisa que sea la misma y que cada texto de aquí cuadre). Un texto libre podría decir «el
// administrador aprobó…» o llevar un teléfono. Puro (sin pantalla): lo prueba node.
import { dia, MESES_CORTOS } from './formato.js';

const hoy = () => globalThis.EQVacacional.hoy();

export const QUE_CADA = { fecha: 'cada año en estas fechas', semanaSanta: 'cada año en Semana Santa' };
export const MOTIVOS_BLOQUEO = ['Otra reserva', 'Mantenimiento', 'Uso propio'];
const CALENDARIO = { bloquear: 'bloqueó', habilitar: 'habilitó', precio: 'precio especial', minimo: 'mínimo de noches' };

// Un rango de fechas corto: «16 – 20 nov», «30 nov – 2 dic 2027», «28 dic 2026 – 3 ene 2027».
export const rango = (r) => {
	const anio = (iso) => iso.slice(0, 4);
	if (anio(r.desde) !== anio(r.hasta)) return `${dia(r.desde)} ${anio(r.desde)} – ${dia(r.hasta)} ${anio(r.hasta)}`;
	const base = r.desde === r.hasta ? dia(r.desde) : `${r.desde.slice(0, 7) === r.hasta.slice(0, 7) ? Number(r.desde.slice(8)) : dia(r.desde)} – ${dia(r.hasta)}`;
	return anio(r.hasta) === hoy().slice(0, 4) ? base : `${base} ${anio(r.hasta)}`;
};

// titulo: el de la pantalla («Entre semana», «Precios especiales»…); motivo: el de un día bloqueado.
export const textoDueno = {
	precio: (titulo) => `precio ${titulo.toLowerCase()}`,
	calendario: (que, r, motivo = '', cada = '') => `${CALENDARIO[que]} ${rango(r)}${que === 'bloquear' ? ` (${motivo})` : ''}${cada ? ` (${QUE_CADA[cada]})` : ''}`,
	quito: (titulo, r, todos = false) => `quitó ${titulo.toLowerCase()} ${rango(r)}${todos ? ' (todos los años)' : ''}`,
	temporadas: (anio) => `puso las temporadas de ${anio}`,
	personas: (n) => `personas máximo ${n}`
};

// Lo que dejan escribir las reglas (RE2, el texto entero; sin barras invertidas para copiarla tal cual).
// Un día: «16», «16 nov» o «16 nov 2027» (el año solo después del mes).
const D = `[1-3]?[0-9]( (${MESES_CORTOS.join('|')})( 20[0-9]{2})?)?`;
const R = `${D}( – ${D})?`;
export const TEXTO_DUENO = `(precio (entre semana|fin de semana)|personas máximo [0-9]{1,2}|puso las temporadas de [0-9]{4}`
	+ `|(bloqueó|habilitó|precio especial|mínimo de noches) ${R}( [(](${MOTIVOS_BLOQUEO.join('|')})[)])?( [(](${Object.values(QUE_CADA).join('|')})[)])?`
	+ `|quitó (precios especiales|mínimos de noches) ${R}( [(]todos los años[)])?)`;
