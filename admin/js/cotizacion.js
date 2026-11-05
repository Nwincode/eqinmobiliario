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

// ¿Quién factura? El asesor (con sus datos) o la empresa (datos de settings/cotizacion).
export const EMISORES = [
	['asesor', 'El asesor'],
	['empresa', 'La empresa']
];
// Administración: el honorario lo decide quien cotiza en cada cotización.
export const TIPOS_ADMIN = [
	['pct', '% de la renta'],
	['fijo', 'Monto fijo al mes']
];
// Liquidación interna cuando factura la empresa.
// ISR del régimen opcional simplificado sobre ingresos: 5 % sobre los primeros Q 30,000 del mes y 7 % sobre el
// excedente (Ley de Actualización Tributaria, Decreto 10-2012, art. 44). Se usa 5 % fijo, editable por el administrador.
export const ISR_DEF = 5;
export const FUENTE_ISR = 'Régimen opcional simplificado, Decreto 10-2012, art. 44';
export const PCT_ASESOR_DEF = 100;

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
	const l = { tipo, moneda, precio: '', pct: tipo === 'compraventa' ? 5 : '', renta: '', anios: 1, descripcion: '', monto: '' };
	if (tipo === 'administracion') l.adminTipo = 'pct';
	return l;
}

// Calcula una línea de servicio. Devuelve el honorario base y los textos de cálculo.
export function calcularLinea(linea, regimen = 'general', modo = 'todo') {
	const l = linea || {};
	const moneda = l.moneda === 'GTQ' ? 'GTQ' : 'USD';
	// falta: el primer dato que falta para calcular la línea ('' si está completa).
	let base = 0, mensual = false, concepto = '', detalle = '', listo = false, meses = null, falta = '';
	if (l.tipo === 'compraventa') {
		const precio = num(l.precio), pct = num(l.pct, 5);
		base = precio * pct / 100;
		listo = precio > 0;
		falta = listo ? '' : 'precio';
		concepto = 'Intermediación de compraventa';
		detalle = `${porcentaje(modo === 'todo' ? pctTodoIncluido(pct, regimen) : pct)} sobre un precio de ${dinero(precio, moneda)}`;
	} else if (l.tipo === 'arrendamiento') {
		const renta = num(l.renta);
		const anios = Math.min(30, Math.max(0, num(l.anios, 1)));
		meses = mesesArrendamiento(anios);
		base = renta * meses;
		listo = renta > 0 && anios > 0;
		falta = renta > 0 ? (anios > 0 ? '' : 'anios') : 'renta';
		concepto = 'Comisión por contrato de arrendamiento';
		detalle = `Contrato de ${numero(anios)} año${anios === 1 ? '' : 's'} = ${rentas(meses)} de ${dinero(renta, moneda)} (renta mensual sin IVA)`;
	} else if (l.tipo === 'administracion') {
		// Sin porcentaje ni monto predeterminado: la línea no cuenta hasta que se escribe el valor.
		const renta = num(l.renta);
		mensual = true;
		concepto = 'Administración de la propiedad';
		if (l.adminTipo === 'fijo') {
			base = num(l.monto);
			listo = base > 0;
			falta = listo ? '' : 'monto';
			detalle = renta > 0 ? `Monto fijo cada mes (renta mensual de ${dinero(renta, moneda)})` : 'Monto fijo cada mes';
		} else {
			const pct = num(l.pct);
			base = renta * pct / 100;
			listo = renta > 0 && pct > 0;
			falta = renta > 0 ? (pct > 0 ? '' : 'pct') : 'renta';
			detalle = `${porcentaje(modo === 'todo' ? pctTodoIncluido(pct, regimen) : pct)} de la renta mensual de ${dinero(renta, moneda)}, cada mes`;
		}
	} else {
		base = num(l.monto);
		listo = base > 0;
		falta = listo ? '' : 'monto';
		concepto = String(l.descripcion || '').trim() || 'Otro servicio';
		detalle = '';
	}
	return { tipo: l.tipo || 'otro', moneda, mensual, listo, falta, meses, concepto, detalle, ...desglose(base, regimen, modo) };
}

// Líneas que impiden guardar e imprimir: la administración sin su porcentaje (o renta) o sin su monto fijo.
// Las demás líneas incompletas solo se omiten de la hoja, como antes.
export function pendientes(cot) {
	const c = cot || {};
	const r = calcularCotizacion(c);
	const out = [];
	(c.lineas || []).forEach((l, i) => {
		const x = r.lineas[i];
		if (l.tipo !== 'administracion' || x.listo) return;
		const mensaje = x.falta === 'renta' ? 'Escribe la renta mensual para calcular el porcentaje de administración.'
			: x.falta === 'pct' ? 'Escribe el porcentaje de administración.'
				: 'Escribe el monto mensual de administración.';
		out.push({ linea: i, campo: x.falta, mensaje });
	});
	return out;
}

// ── Emisor ──────────────────────────────────────────────────────────────
export const regimenValido = (v) => (v === 'pequeno' ? 'pequeno' : 'general');
export const etqRegimen = (v) => (v === 'pequeno' ? 'Pequeño contribuyente' : 'Régimen general de IVA');
const txt = (v) => String(v ?? '').trim();

// Copia del emisor que se guarda en la cotización (así la hoja no cambia si después cambian los datos).
//  asesor:  { nombre, nit, regimen, telefono, email } (emisoresAsesor/{id})
//  empresa: { razonSocial, nombreComercial, nit, regimen, direccion, telefono, email, usarLogo } (settings/cotizacion.empresa)
export function emisorDesde(tipo, { asesor = {}, empresa = {} } = {}) {
	if (tipo === 'asesor') {
		const a = asesor || {};
		return { tipo: 'asesor', nombre: txt(a.nombre), razonSocial: '', nit: txt(a.nit), regimen: regimenValido(a.regimen),
			direccion: '', telefono: txt(a.telefono), email: txt(a.email), logo: false };
	}
	const e = empresa || {};
	const comercial = txt(e.nombreComercial), razon = txt(e.razonSocial);
	return { tipo: 'empresa', nombre: comercial || razon, razonSocial: razon && razon !== comercial ? razon : '', nit: txt(e.nit),
		regimen: regimenValido(e.regimen), direccion: txt(e.direccion), telefono: txt(e.telefono), email: txt(e.email), logo: e.usarLogo !== false };
}

// Datos mínimos del emisor para la hoja: nombre y NIT.
export function faltanEmisor(emisor) {
	const e = emisor || {};
	return [!txt(e.nombre) && 'nombre', !txt(e.nit) && 'NIT'].filter(Boolean);
}

// ── Liquidación para el asesor (solo cuando factura la empresa; nunca sale en la hoja ni en WhatsApp) ──
// Por cada total (único o mensual, por moneda):
//   cobrado al cliente
//   − IVA a pagar (general: el IVA débito)  ó  − impuesto de pequeño contribuyente (5 % del total)
//   − ISR (solo régimen general: isrPct % sobre el honorario sin IVA)
//   = neto;  × pctAsesor % = lo que recibe el asesor (el resto queda a la empresa).
export function liquidacionTotal(t, regimen, { isrPct = ISR_DEF, pctAsesor = PCT_ASESOR_DEF } = {}) {
	const x = t || {};
	const general = regimenValido(regimen) === 'general';
	const cobrado = redondear(num(x.total));
	const iva = general ? redondear(num(x.impuesto)) : 0;
	const impuestoPequeno = general ? 0 : redondear(cobrado * TASA_PEQUENO);
	const isrP = general ? Math.min(100, Math.max(0, num(isrPct, ISR_DEF))) : 0;
	const isr = general ? redondear(num(x.honorario) * isrP / 100) : 0;
	const neto = redondear(cobrado - iva - impuestoPequeno - isr);
	const pctA = Math.min(100, Math.max(0, num(pctAsesor, PCT_ASESOR_DEF)));
	const asesor = redondear(neto * pctA / 100);
	return { moneda: x.moneda || 'USD', mensual: Boolean(x.mensual), regimen: general ? 'general' : 'pequeno',
		cobrado, iva, impuestoPequeno, isrPct: isrP, isr, neto, pctAsesor: pctA, asesor, empresa: redondear(neto - asesor) };
}

export function liquidacion(cot, opciones = {}) {
	const r = calcularCotizacion(cot);
	return r.totales.map((t) => liquidacionTotal(t, r.regimen, opciones));
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
