// Acuerdo con el dueño de UN inmueble: exclusiva, comisión e impuestos. Vive en properties/{id}/privado/acuerdo
// (nunca es público; lo leen y escriben el administrador y el asesor de esa propiedad).
// Antes estos datos se guardaban una sola vez en la ficha de la persona: mientras un inmueble no tenga su propio
// acuerdo, vale lo que quedó en su dueño. Sin dependencias: lo usan el panel y las funciones de Netlify.

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
	const dueno = (c) => duenos.find((d) => d.id === c.propietarioId || (d.propiedades || []).some((x) => x.propertyId === c.id)) || null;
	return casas.map((c) => {
		const d = dueno(c), acuerdo = acuerdoDe(acuerdos[c.id], d, c.operacion);
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
