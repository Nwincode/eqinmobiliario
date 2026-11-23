// Lo que el dueño cambia de su calendario y sus precios en «Mis propiedades» (views/mis-casas.js), en palabras: el texto
// de su renglón en la bitácora de la casa (properties/{id}/bitacora `que`, lo ven el equipo y él). Solo con estas
// palabras: firestore.rules no le deja escribir otra cosa (TEXTO_DUENO, la misma expresión, copiada tal cual; la prueba
// scripts/test-bitacora.mjs revisa que sea la misma y que cada texto de aquí cuadre). Un texto libre podría decir «el
// administrador aprobó…» o llevar un teléfono. Puro (sin pantalla): lo prueba node.
import { dia, MESES_CORTOS, miles, nNoches } from './formato.js';

const hoy = () => globalThis.EQVacacional.hoy();

export const QUE_CADA = { fecha: 'cada año en estas fechas', semanaSanta: 'cada año en Semana Santa' };
export const MOTIVOS_BLOQUEO = ['Otra reserva', 'Mantenimiento', 'Uso propio'];
const CALENDARIO = { bloquear: 'bloqueó', habilitar: 'habilitó', precio: 'precio especial', minimo: 'mínimo de noches' };

// Un rango de fechas corto: «16 – 20 nov», «30 nov – 2 dic 2027», «28 dic 2026 – 3 ene 2027». El año se omite si es
// `delAnio` (el de hoy; el estado de cuenta pasa el de su mes).
export const rango = (r, delAnio = hoy().slice(0, 4)) => {
	const anio = (iso) => iso.slice(0, 4);
	if (anio(r.desde) !== anio(r.hasta)) return `${dia(r.desde)} ${anio(r.desde)} – ${dia(r.hasta)} ${anio(r.hasta)}`;
	const base = r.desde === r.hasta ? dia(r.desde) : `${r.desde.slice(0, 7) === r.hasta.slice(0, 7) ? Number(r.desde.slice(8)) : dia(r.desde)} – ${dia(r.hasta)}`;
	return anio(r.hasta) === delAnio ? base : `${base} ${anio(r.hasta)}`;
};

// Un precio en el texto: «US$ 1,250» o «Q 900.50» (las dos monedas de una casa).
const monto = (n, moneda) => `${moneda === 'GTQ' ? 'Q' : 'US$'} ${miles(n)}`;
const SIN_FINDE = 'igual que entre semana';
const TOPE_TEXTO = 1_000_000;

// titulo: el de la pantalla («Entre semana», «Precios especiales»…). Con el valor de antes y el de ahora: «precio entre
// semana: US$ 900 → US$ 1,000», «personas máximo: 8 → 12». valor: el motivo de un día bloqueado, el precio especial o
// las noches del mínimo.
export const textoDueno = {
	precio: (titulo, antes = 0, ahora = 0, moneda = 'USD') => {
		const t = titulo.toLowerCase();
		const valor = (n) => (Number(n) ? monto(Number(n), moneda) : t === 'fin de semana' ? SIN_FINDE : '');
		// Un precio de antes que no cabe en el texto (1,000,000 o más: lo puso el equipo; el dueño llega a PRECIO_MAX) no se
		// escribe: las reglas aceptan el texto sin él solo si el de antes era 0 o así de alto.
		const [a, b] = [Number(antes) >= TOPE_TEXTO ? '' : valor(antes), valor(ahora)];
		return `precio ${t}${b ? `: ${a ? `${a} → ` : ''}${b}` : ''}`;
	},
	calendario: (que, r, valor = '', cada = '', moneda = 'USD') => `${CALENDARIO[que]} ${rango(r)}${que === 'bloquear' ? ` (${valor})` : ''}${cada ? ` (${QUE_CADA[cada]})` : ''}`
		+ (que === 'precio' ? `: ${monto(Number(valor), moneda)}` : que === 'minimo' ? `: ${nNoches(Number(valor))}` : ''),
	quito: (titulo, r, todos = false) => `quitó ${titulo.toLowerCase()} ${rango(r)}${todos ? ' (todos los años)' : ''}`,
	temporadas: (anio) => `puso las temporadas de ${anio}`,
	personas: (n, antes) => (antes && antes !== n ? `personas máximo: ${antes} → ${n}` : `personas máximo ${n}`)
};

// El mismo texto sin los valores («precio entre semana», «personas máximo 12»): el de las reglas de antes (una pestaña con el
// sitio nuevo y las reglas todavía sin publicar: mis-casas.js lo reintenta así) y el del aviso «Hay cambios sin publicar»
// (meta/publish lo lee todo el equipo; el precio del dueño solo el administrador y el asesor de la casa).
export const sinValores = (t) => String(t).replace(/^personas máximo: [0-9]+ → ([0-9]+)$/, 'personas máximo $1').replace(/: .*$/, '');

// Lo que dejan escribir las reglas (RE2, el texto entero; sin barras invertidas para copiarla tal cual). Además, las reglas
// revisan que el texto diga lo que de verdad cambió en el mismo lote (firestore.rules renglonCuadra): el precio de antes y
// el de ahora (privado/socio, al medio centavo), las personas, y que la lista nombrada (días bloqueados, precios especiales,
// mínimos) cambió, con su monto o sus noches en la lista nueva. El texto sin valores también tiene que nombrar algo que cambió.
// Un día: «16», «16 nov» o «16 nov 2027» (el año solo después del mes).
const D = `[1-3]?[0-9]( (${MESES_CORTOS.join('|')})( 20[0-9]{2})?)?`;
const R = `${D}( – ${D})?`;
// Un monto con sus comas: hasta 999,999.99 (el panel no deja pasar de PRECIO_MAX), sin lugar para un teléfono.
const M = '(US[$]|Q) [0-9]{1,3}(,[0-9]{3})?([.][0-9]{1,2})?';
const P = `(${M}|${SIN_FINDE})`;
// El motivo del bloqueo y si se repite cada año.
const CON = `( [(](${MOTIVOS_BLOQUEO.join('|')})[)])?( [(](${Object.values(QUE_CADA).join('|')})[)])?`;
export const TEXTO_DUENO = `(precio (entre semana|fin de semana)(: (${P} → )?${P})?|personas máximo(: [0-9]{1,2} →)? [0-9]{1,2}|puso las temporadas de [0-9]{4}`
	// Cada verbo con su valor: el monto solo en «precio especial», las noches solo en «mínimo de noches»; «bloqueó» y
	// «habilitó», sin valor (las reglas solo revisan que los bloqueos cambiaron: un monto ahí sería inventado).
	+ `|(bloqueó|habilitó) ${R}${CON}|precio especial ${R}${CON}(: ${M})?|mínimo de noches ${R}${CON}(: [0-9]{1,2} noches?)?`
	+ `|quitó (precios especiales|mínimos de noches) ${R}( [(]todos los años[)])?)`;
