// Acuerdo con el dueño de UN inmueble: exclusiva, comisión e impuestos. Vive en properties/{id}/privado/acuerdo
// (nunca es público; lo leen y escriben el administrador y el asesor de esa propiedad).
// Aquí vive también la comisión de un inmueble (comisionDe): una sola cuenta para cotización, reportes y fichas.
// Antes estos datos se guardaban una sola vez en la ficha de la persona: mientras un inmueble no tenga su propio
// acuerdo, vale lo que quedó en su dueño. Sin dependencias: lo usan el panel y las funciones de Netlify.

import { duenoDe } from './duenos.js';

const EXCLUSIVA = ['exclusiva', 'exclusivaInicio', 'exclusivaFin', 'contrato'];
const COBRO = ['comisionRegimen', 'comisionModo'];
const VENTA = ['comisionPct', 'impuestoVenta', 'impuestoPaga', 'notasImpuestos'];
const RENTA = ['comisionRentaMeses'];

// Qué se acuerda según la operación: la exclusiva, siempre; la comisión, en venta (%) y renta (meses);
// los impuestos del traspaso, solo en venta. En la renta por noche la empresa gana el margen de la casa.
export function camposDelAcuerdo(operacion) {
	return [...EXCLUSIVA, ...(operacion === 'venta' ? [...VENTA, ...COBRO] : operacion === 'renta' ? [...RENTA, ...COBRO] : [])];
}
export const CAMPOS_ACUERDO = [...EXCLUSIVA, ...COBRO, ...VENTA, ...RENTA];

const tiene = (v) => v !== undefined && v !== null && v !== '' && v !== false;
const soloCampos = (origen, campos) => Object.fromEntries(campos.filter((k) => tiene((origen || {})[k])).map((k) => [k, origen[k]]));

// Lo que un inmueble hereda de la ficha de su dueño (datos de antes), limitado a lo que aplica a su operación.
export function acuerdoHeredado(dueno, operacion) {
	return soloCampos(dueno, camposDelAcuerdo(operacion));
}

// El acuerdo vigente de un inmueble: el suyo si ya lo tiene; si no, lo heredado de su dueño.
export function acuerdoDe(propio, dueno, operacion) {
	return propio ? soloCampos(propio, camposDelAcuerdo(operacion)) : acuerdoHeredado(dueno, operacion);
}

// Días que faltan para que venza la exclusiva (negativo = vencida); null si no hay exclusiva con fecha.
// «zona» es el desfase horario de quien pregunta: el panel usa la hora del navegador; las funciones, la de Guatemala.
export function diasExclusiva(acuerdo, ahora = Date.now(), zona = '') {
	if (!acuerdo?.exclusiva || !acuerdo.exclusivaFin) return null;
	const fin = new Date(`${acuerdo.exclusivaFin}T23:59:59${zona}`).getTime();
	return Number.isNaN(fin) ? null : Math.ceil((fin - ahora) / 86400000);
}

// Exclusivas vencidas o por vencer en «dias» días, una por inmueble, la que vence antes primero.
// casas: [{ id, titulo, operacion, propietarioId, agentId }]; acuerdos: { [id]: acuerdo propio | null }; duenos: lista.
export function exclusivasPorVencer(casas, acuerdos, duenos, { ahora = Date.now(), dias = 30, zona = '' } = {}) {
	// Manda el dueño que la casa dice tener; si no lo dice, el que la tiene en su lista.
	return casas.map((c) => {
		const d = duenoDe(c, duenos), acuerdo = acuerdoDe(acuerdos[c.id], d, c.operacion);
		return { casa: c, dueno: d, acuerdo, dias: diasExclusiva(acuerdo, ahora, zona) };
	}).filter((x) => x.dias !== null && x.dias <= dias).sort((a, b) => String(a.acuerdo.exclusivaFin).localeCompare(String(b.acuerdo.exclusivaFin)));
}

// Campos de antes que ya se pueden borrar de la ficha de la persona: los que quedaron copiados en TODOS los
// inmuebles donde aplican. Lo que no tiene dónde caer (p. ej. una comisión de venta sin casa en venta) se queda.
// casas: las de esa persona; conAcuerdo: ids de las que ya tienen su propio acuerdo.
export function legadoSobrante(dueno, casas, conAcuerdo) {
	const yaEsta = new Set(conAcuerdo);
	return CAMPOS_ACUERDO.filter((k) => {
		if (!((dueno || {})[k] !== undefined)) return false;
		const donde = casas.filter((c) => camposDelAcuerdo(c.operacion).includes(k));
		return donde.length > 0 && donde.every((c) => yaEsta.has(c.id));
	});
}

// ---------------------------------------------------------------- Comisión de un inmueble
// Regla general (settings/crm; se cambia en Reportes). Estos son los valores de siempre, si nadie la cambió.
export const REGLAS_POR_DEFECTO = { comisionVentaPct: 5, comisionRentaMeses: 1, parteAsesorPct: 50 };
const esNumero = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));

// La comisión de un inmueble: la acordada para ese inmueble (su acuerdo, o lo heredado de su dueño: acuerdoDe);
// si no hay, la regla general; si tampoco, la de siempre. Un 0 acordado vale 0 (no es «vacío»).
//  - venta: { tipo: 'pct', valor } = % del precio.
//  - renta: { tipo: 'meses', valor } = meses de renta por cada año de contrato; un contrato largo usa la escala de
//    ley (mesesArrendamiento en admin/js/cotizacion.js): 1 mes acordado y 1 año de contrato = 1 renta.
//  - por noche (u otra): null. En la renta por noche EQ no cobra comisión: gana el margen (js/calc-vacacional.js).
// Lleva también el régimen y el modo de cobro acordados ('' si no se acordaron) y de dónde salió: 'acuerdo' o 'general'.
export function comisionDe(operacion, acuerdo, reglas) {
	const campo = operacion === 'venta' ? ['comisionPct', 'comisionVentaPct', 'pct'] : operacion === 'renta' ? ['comisionRentaMeses', 'comisionRentaMeses', 'meses'] : null;
	if (!campo) return null;
	const [propio, general, tipo] = campo;
	const acordado = esNumero(acuerdo?.[propio]);
	const valor = Number(acordado ? acuerdo[propio] : esNumero(reglas?.[general]) ? reglas[general] : REGLAS_POR_DEFECTO[general]);
	return { tipo, valor, fuente: acordado ? 'acuerdo' : 'general', regimen: acuerdo?.comisionRegimen || '', modo: acuerdo?.comisionModo || '' };
}
// Cuánto es: venta, `base` = precio; renta, `base` = renta mensual y `rentas` = las rentas que vale el contrato a
// 1 mes por año (mesesArrendamiento(años); 1 si no se sabe el plazo).
export function montoComision(c, base, rentas = 1) {
	if (!c) return 0;
	const b = Number(base) || 0;
	return c.tipo === 'pct' ? b * c.valor / 100 : b * c.valor * (Number(rentas) || 0);
}
// «5 % en venta», «1 mes de renta»: cómo se dice una comisión.
export const textoComision = (c) => (!c ? '' : c.tipo === 'pct' ? `${c.valor} %` : `${c.valor} ${c.valor === 1 ? 'mes' : 'meses'} de renta`);
