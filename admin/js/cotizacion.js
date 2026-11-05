// Cotización de servicios: cálculos puros (sin pantalla ni base de datos), para el panel y para las pruebas.
// `npm run test:cotizacion` prueba estas funciones.
//
// Conceptos:
//  - honorario: lo que el emisor quiere recibir limpio por el servicio.
//  - régimen general (IVA 12 %): total = honorario × 1.12; el IVA va aparte.
//  - pequeño contribuyente (5 %): no se cobra IVA aparte; el emisor paga el 5 % del total a la SAT.
//      · «Todo incluido»: total = honorario ÷ 0.95, así el emisor sigue recibiendo el honorario.
//      · «Honorario + IVA»: el honorario es el precio final (el 5 % sale de ahí).

export const IVA_GENERAL = 0.12;
export const TASA_PEQUENO = 0.05;

export const REGIMENES = [
	['general', 'Régimen general (IVA 12 %)'],
	['pequeno', 'Pequeño contribuyente (5 %)']
];
export const MODOS = [
	['todo', 'Todo incluido'],
	['separado', 'Honorario + IVA']
];
export const SERVICIOS = [
	['compraventa', 'Compraventa'],
	['arrendamiento', 'Arrendamiento'],
	['administracion', 'Administración'],
	['otro', 'Otro servicio']
];
export const MONEDAS = [['USD', 'US$'], ['GTQ', 'Q']];

export const CONDICIONES_DEF = 'La comisión de compraventa se paga al firmar la escritura; la de arrendamiento, al firmar el contrato.';
export const NOTA_PEQUENO = 'Factura de pequeño contribuyente; el impuesto del 5 % lo paga el emisor a la SAT.';
export const VIGENCIA_DEF = 15;

const num = (v, d = 0) => { const x = Number(v); return v === '' || v === null || v === undefined || !isFinite(x) ? d : x; };
export const redondear = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Comisión de arrendamiento en rentas para un contrato de n años (proporcional en fracciones).
// Años 1-5: 1 renta por año; 6-10: 1 renta cada 2 años; más de 10: 1 renta cada 3 años.
// Es la misma fórmula que mesesComision() de js/calc-renta.js (la prueba compara las dos).
export function mesesArrendamiento(anios) {
	const x = Math.max(0, num(anios));
	return Math.min(x, 5) + Math.max(0, Math.min(x, 10) - 5) / 2 + Math.max(0, x - 10) / 3;
}

// Factor que convierte el honorario en el precio todo incluido.
export function factorTodoIncluido(regimen) {
	return regimen === 'pequeno' ? 1 / (1 - TASA_PEQUENO) : 1 + IVA_GENERAL;
}

// Porcentaje todo incluido que ve el cliente (5 → 5.6 en general; 5 → 5.263… en pequeño contribuyente).
export function pctTodoIncluido(pct, regimen) {
	return num(pct) * factorTodoIncluido(regimen);
}

// Desglose de un honorario según régimen y modo: { honorario, impuesto, total, impuestoAparte }.
//  impuestoAparte = true cuando el impuesto se suma al honorario en la factura (IVA general).
export function desglose(honorario, regimen, modo = 'todo') {
	const hon = redondear(Math.max(0, num(honorario)));
	if (regimen === 'pequeno') {
		const total = modo === 'separado' ? hon : redondear(hon / (1 - TASA_PEQUENO));
		// El 5 % que paga el emisor sale del total; con «Honorario + IVA» le queda menos que el honorario.
		const impuesto = redondear(total * TASA_PEQUENO);
		return { honorario: hon, impuesto, total, neto: redondear(total - impuesto), impuestoAparte: false };
	}
	const impuesto = redondear(hon * IVA_GENERAL);
	return { honorario: hon, impuesto, total: redondear(hon + impuesto), neto: hon, impuestoAparte: true };
}

export function lineaVacia(tipo = 'compraventa', moneda = 'USD') {
	return { tipo, moneda, precio: '', pct: tipo === 'administracion' ? 10 : 5, renta: '', anios: 1, descripcion: '', monto: '' };
}

// Calcula una línea de servicio. Devuelve el honorario base y los textos de cálculo.
export function calcularLinea(linea, regimen = 'general', modo = 'todo') {
	const l = linea || {};
	const moneda = l.moneda === 'GTQ' ? 'GTQ' : 'USD';
	let base = 0, mensual = false, concepto = '', detalle = '', listo = false, meses = null;
	if (l.tipo === 'compraventa') {
		const precio = num(l.precio), pct = num(l.pct, 5);
		base = precio * pct / 100;
		listo = precio > 0;
		concepto = 'Intermediación de compraventa';
		detalle = `${porcentaje(modo === 'todo' ? pctTodoIncluido(pct, regimen) : pct)} sobre un precio de ${dinero(precio, moneda)}`;
	} else if (l.tipo === 'arrendamiento') {
		const renta = num(l.renta);
		const anios = Math.min(30, Math.max(0, num(l.anios, 1)));
		meses = mesesArrendamiento(anios);
		base = renta * meses;
		listo = renta > 0 && anios > 0;
		concepto = 'Comisión por contrato de arrendamiento';
		detalle = `Contrato de ${numero(anios)} año${anios === 1 ? '' : 's'} = ${rentas(meses)} de ${dinero(renta, moneda)} (renta mensual sin IVA)`;
	} else if (l.tipo === 'administracion') {
		const renta = num(l.renta), pct = num(l.pct, 10);
		base = renta * pct / 100;
		mensual = true;
		listo = renta > 0;
		concepto = 'Administración de la propiedad';
		detalle = `${porcentaje(modo === 'todo' ? pctTodoIncluido(pct, regimen) : pct)} de la renta mensual de ${dinero(renta, moneda)}, cada mes`;
	} else {
		base = num(l.monto);
		listo = base > 0;
		concepto = String(l.descripcion || '').trim() || 'Otro servicio';
		detalle = '';
	}
	return { tipo: l.tipo || 'otro', moneda, mensual, listo, meses, concepto, detalle, ...desglose(base, regimen, modo) };
}

// Calcula toda la cotización: líneas y totales por moneda, separando lo que se paga una vez de lo mensual.
export function calcularCotizacion(cot) {
	const c = cot || {};
	const regimen = c.regimen === 'pequeno' ? 'pequeno' : 'general';
	const modo = c.modo === 'separado' ? 'separado' : 'todo';
	const lineas = (c.lineas || []).map((l) => calcularLinea(l, regimen, modo));
	const totales = [];
	for (const l of lineas) {
		if (!l.listo) continue;
		let t = totales.find((x) => x.moneda === l.moneda && x.mensual === l.mensual);
		if (!t) totales.push(t = { moneda: l.moneda, mensual: l.mensual, honorario: 0, impuesto: 0, total: 0 });
		t.honorario = redondear(t.honorario + l.honorario);
		t.impuesto = redondear(t.impuesto + l.impuesto);
		t.total = redondear(t.total + l.total);
	}
	totales.sort((a, b) => Number(a.mensual) - Number(b.mensual) || (a.moneda === 'USD' ? -1 : 1));
	return { regimen, modo, lineas, totales };
}

// ── Formato (igual que la calculadora: es-GT, «US$ 1,234») ─────────────
export function dinero(v, moneda = 'USD', dec) {
	if (v === null || v === undefined || !isFinite(v)) return '—';
	const d = dec ?? (Math.abs(v - Math.round(v)) > 0.004 ? 2 : 0);
	const s = new Intl.NumberFormat('es-GT', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(v));
	return `${v < 0 ? '−' : ''}${moneda === 'GTQ' ? 'Q' : 'US$'} ${s}`;
}
export function numero(v, max = 2) {
	return new Intl.NumberFormat('es-GT', { maximumFractionDigits: max }).format(num(v));
}
export function porcentaje(v, max = 2) {
	return `${numero(v, max)} %`;
}
export function rentas(m) {
	return `${numero(m, 2)} renta${Math.abs(m - 1) < 1e-9 ? '' : 's'}`;
}

// Número de cotización por fecha y hora: COT-AAAAMMDD-HHMM (único por asesor sin contador compartido).
export function numeroCotizacion(fecha = new Date()) {
	const p = (n) => String(n).padStart(2, '0');
	return `COT-${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}-${p(fecha.getHours())}${p(fecha.getMinutes())}`;
}

export function fechaISO(fecha = new Date()) {
	const p = (n) => String(n).padStart(2, '0');
	return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

export function fechaLarga(iso) {
	if (!iso) return '';
	const [y, m, d] = String(iso).split('-').map(Number);
	if (!y) return String(iso);
	return new Date(y, m - 1, d).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Fecha en que vence la cotización (ISO) a partir de la fecha y los días de vigencia.
export function venceEl(iso, dias) {
	const [y, m, d] = String(iso || fechaISO()).split('-').map(Number);
	return fechaISO(new Date(y, m - 1, d + Math.max(0, Math.round(num(dias, VIGENCIA_DEF)))));
}

const etqImpuesto = (regimen) => (regimen === 'pequeno' ? 'Impuesto 5 %' : 'IVA 12 %');

// Texto corto de cada línea para WhatsApp y para el resumen.
export function textoLinea(l, regimen, modo) {
	const sufijo = l.mensual ? ' al mes' : '';
	if (modo === 'todo' || regimen === 'pequeno') return `${dinero(l.total, l.moneda)}${sufijo}${modo === 'todo' ? ' (todo incluido)' : ''}`;
	return `${dinero(l.honorario, l.moneda)} + IVA ${dinero(l.impuesto, l.moneda)} = ${dinero(l.total, l.moneda)}${sufijo}`;
}

// Resumen en texto plano para pegar en WhatsApp (con *negritas* de WhatsApp).
export function textoWhatsApp(cot) {
	const c = cot || {};
	const r = calcularCotizacion(c);
	const nombre = String(c.cliente?.nombre || '').trim().split(/\s+/)[0];
	const out = [];
	out.push(`${nombre ? `Hola ${nombre}, ` : ''}te comparto la cotización ${c.numero || ''} de ${c.emisor?.nombre || 'Equipo Inmobiliario'}:`.replace(/\s+:/, ':'));
	if (c.propiedad?.texto) out.push(`Propiedad: ${c.propiedad.texto}`);
	out.push('');
	for (const l of r.lineas.filter((x) => x.listo)) {
		out.push(`• *${l.concepto}*`);
		if (l.detalle) out.push(`  ${l.detalle}`);
		out.push(`  ${textoLinea(l, r.regimen, r.modo)}`);
	}
	if (r.totales.length) {
		out.push('');
		for (const t of r.totales) {
			const etq = t.mensual ? 'Total mensual' : 'Total';
			if (r.modo === 'separado' && r.regimen === 'general') out.push(`*${etq}: ${dinero(t.total, t.moneda)}* (honorario ${dinero(t.honorario, t.moneda)} + ${etqImpuesto(r.regimen)} ${dinero(t.impuesto, t.moneda)})`);
			else out.push(`*${etq}: ${dinero(t.total, t.moneda)}*${r.regimen === 'general' ? ' (IVA incluido)' : ''}`);
		}
	}
	if (r.regimen === 'pequeno') out.push(NOTA_PEQUENO);
	if (c.condiciones) out.push('', String(c.condiciones).trim());
	out.push(`Vigencia: ${num(c.vigenciaDias, VIGENCIA_DEF)} días (hasta el ${fechaLarga(venceEl(c.fecha, c.vigenciaDias))}).`);
	if (c.asesor) out.push('', c.asesor);
	return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
