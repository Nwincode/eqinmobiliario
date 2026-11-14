// Cotización de servicios: cálculos puros (sin pantalla ni base de datos), para el panel y para las pruebas.
// `npm run test:cotizacion` prueba estas funciones.
//
// Conceptos:
//  - honorario: lo que el emisor quiere recibir limpio por el servicio.
//  - régimen general (IVA 12 %): total = honorario × 1.12; el IVA va aparte.
//  - pequeño contribuyente (5 %): no se cobra IVA aparte; el emisor paga el 5 % del total a la SAT.
//      · «Todo incluido»: total = honorario ÷ 0.95, así el emisor sigue recibiendo el honorario.
//      · «Honorario + IVA»: el honorario es el precio final (el 5 % sale de ahí).
import { miles } from './formato.js';
import { OPERACIONES, enOperacion } from './estados.js';
import { REGLAS_POR_DEFECTO, montoComision, comisionDe } from './acuerdo.js';

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
// excedente (Ley de Actualización Tributaria, Decreto 10-2012, art. 44). Los tres valores los puede cambiar el administrador.
// El límite está en quetzales: para montos en dólares se convierte con el tipo de cambio.
export const ISR_DEF = 5;
export const ISR_ALTO_DEF = 7;
export const ISR_LIMITE_DEF = 30000;
export const TC_DEF = 7.7;
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

// `reglas` = la regla general de comisión (settings/crm); sin ella, la de siempre. Al elegir el inmueble se pone la
// acordada para él (comisionDe en admin/js/acuerdo.js). En arrendamiento, `mesesPorAnio` = meses de renta por año de
// contrato (1 = la escala de ley tal cual).
export function lineaVacia(tipo = 'compraventa', moneda = 'USD', reglas = REGLAS_POR_DEFECTO) {
	const r = { ...REGLAS_POR_DEFECTO, ...(reglas || {}) };
	const l = { tipo, moneda, precio: '', pct: tipo === 'compraventa' ? r.comisionVentaPct : '', renta: '', anios: 1, descripcion: '', monto: '' };
	if (tipo === 'arrendamiento') l.mesesPorAnio = r.comisionRentaMeses;
	// La administración no siempre se cobra: empieza apagada y solo cuenta cuando se enciende.
	if (tipo === 'administracion') { l.adminTipo = 'pct'; l.activa = false; }
	return l;
}

// ¿La línea de administración está encendida? Las cotizaciones de antes no tenían el interruptor: cuentan como encendidas.
export const adminActiva = (l) => Boolean(l) && l.tipo === 'administracion' && l.activa !== false;
// Línea apagada: no sale en la hoja, ni en WhatsApp, ni en los totales ni en la liquidación, y no pide datos.
export const lineaApagada = (l) => Boolean(l) && l.tipo === 'administracion' && l.activa === false;

// Calcula una línea de servicio. Devuelve el honorario base y los textos de cálculo.
// Una línea sin % (o sin meses por año) usa la regla general de comisión (comisionDe con settings/crm), no un número fijo.
export function calcularLinea(linea, regimen = 'general', modo = 'todo', reglas = REGLAS_POR_DEFECTO) {
	const general = (op) => comisionDe(op, null, reglas || REGLAS_POR_DEFECTO).valor;
	const l = linea || {};
	const moneda = l.moneda === 'GTQ' ? 'GTQ' : 'USD';
	// falta: el primer dato que falta para calcular la línea ('' si está completa).
	let base = 0, mensual = false, concepto = '', detalle = '', listo = false, meses = null, falta = '';
	if (l.tipo === 'compraventa') {
		const precio = num(l.precio), pct = num(l.pct, general('venta'));
		base = montoComision({ tipo: 'pct', valor: pct }, precio);
		listo = precio > 0;
		falta = listo ? '' : 'precio';
		concepto = 'Intermediación de compraventa';
		detalle = `${porcentaje(modo === 'todo' ? pctTodoIncluido(pct, regimen) : pct)} sobre un precio de ${dinero(precio, moneda)}`;
	} else if (l.tipo === 'arrendamiento') {
		const renta = num(l.renta);
		const anios = Math.min(30, Math.max(0, num(l.anios, 1)));
		const porAnio = num(l.mesesPorAnio, general('renta'));
		meses = mesesArrendamiento(anios) * porAnio;
		base = montoComision({ tipo: 'meses', valor: porAnio }, renta, mesesArrendamiento(anios));
		listo = renta > 0 && anios > 0;
		falta = renta > 0 ? (anios > 0 ? '' : 'anios') : 'renta';
		concepto = 'Comisión por contrato de arrendamiento';
		detalle = `Contrato de ${numero(anios)} año${anios === 1 ? '' : 's'} = ${rentas(meses)} de ${dinero(renta, moneda)} (renta mensual sin IVA)${porAnio !== 1 ? `; ${numero(porAnio)} ${porAnio === 1 ? 'mes' : 'meses'} de renta por año, según lo acordado` : ''}`;
	} else if (lineaApagada(l)) {
		mensual = true;
		concepto = 'Administración de la propiedad';
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
	return { tipo: l.tipo || 'otro', moneda, mensual, listo, falta, meses, concepto, detalle, apagada: lineaApagada(l), ...desglose(base, regimen, modo) };
}

// Líneas que impiden guardar e imprimir: la administración sin su porcentaje (o renta) o sin su monto fijo.
// Las demás líneas incompletas solo se omiten de la hoja, como antes.
export function pendientes(cot, reglas) {
	const c = cot || {};
	const r = calcularCotizacion(c, reglas);
	const out = [];
	(c.lineas || []).forEach((l, i) => {
		const x = r.lineas[i];
		if (l.tipo !== 'administracion' || lineaApagada(l) || x.listo) return;
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
//   − ISR (solo régimen general, sobre el honorario sin IVA: isrPct % hasta isrLimite quetzales e isrPctAlto % sobre el excedente)
//   = neto;  × pctAsesor % = lo que recibe el asesor (el resto queda a la empresa).
const pct100 = (v, d) => Math.min(100, Math.max(0, num(v, d)));

// ISR escalonado sobre un honorario en su moneda. Devuelve el impuesto y cuánto cayó en cada tramo.
export function isrEscalonado(honorario, moneda, { isrPct = ISR_DEF, isrPctAlto = ISR_ALTO_DEF, isrLimite = ISR_LIMITE_DEF, tipoCambio = TC_DEF } = {}) {
	const h = Math.max(0, num(honorario));
	const p1 = pct100(isrPct, ISR_DEF), p2 = pct100(isrPctAlto, ISR_ALTO_DEF);
	const limQ = Math.max(0, num(isrLimite, ISR_LIMITE_DEF));
	const tc = num(tipoCambio, TC_DEF) > 0 ? num(tipoCambio, TC_DEF) : TC_DEF;
	const limite = moneda === 'USD' ? limQ / tc : limQ;
	const bajo = Math.min(h, limite), alto = Math.max(0, h - limite);
	return { isr: redondear(bajo * p1 / 100 + alto * p2 / 100), isrPct: p1, isrPctAlto: p2, limite: redondear(limite), limiteQ: limQ, tipoCambio: tc,
		baseBaja: redondear(bajo), baseAlta: redondear(alto) };
}

export function liquidacionTotal(t, regimen, { isrPct = ISR_DEF, isrPctAlto = ISR_ALTO_DEF, isrLimite = ISR_LIMITE_DEF, tipoCambio = TC_DEF, pctAsesor = PCT_ASESOR_DEF } = {}) {
	const x = t || {};
	const general = regimenValido(regimen) === 'general';
	const cobrado = redondear(num(x.total));
	const iva = general ? redondear(num(x.impuesto)) : 0;
	const impuestoPequeno = general ? 0 : redondear(cobrado * TASA_PEQUENO);
	const e = isrEscalonado(x.honorario, x.moneda || 'USD', { isrPct, isrPctAlto, isrLimite, tipoCambio });
	const isrP = general ? e.isrPct : 0;
	const isr = general ? e.isr : 0;
	const neto = redondear(cobrado - iva - impuestoPequeno - isr);
	const pctA = Math.min(100, Math.max(0, num(pctAsesor, PCT_ASESOR_DEF)));
	const asesor = redondear(neto * pctA / 100);
	return { moneda: x.moneda || 'USD', mensual: Boolean(x.mensual), regimen: general ? 'general' : 'pequeno',
		cobrado, iva, impuestoPequeno, isrPct: isrP, isrPctAlto: general ? e.isrPctAlto : 0, isrLimite: e.limite, isrLimiteQ: e.limiteQ,
		isrBaseBaja: general ? e.baseBaja : 0, isrBaseAlta: general ? e.baseAlta : 0, isr, neto, pctAsesor: pctA, asesor, empresa: redondear(neto - asesor) };
}

export function liquidacion(cot, opciones = {}, reglas) {
	const r = calcularCotizacion(cot, reglas);
	return r.totales.map((t) => liquidacionTotal(t, r.regimen, opciones));
}

// Calcula toda la cotización: líneas y totales por moneda, separando lo que se paga una vez de lo mensual.
export function calcularCotizacion(cot, reglas) {
	const c = cot || {};
	const regimen = c.regimen === 'pequeno' ? 'pequeno' : 'general';
	const modo = c.modo === 'separado' ? 'separado' : 'todo';
	const lineas = (c.lineas || []).map((l) => calcularLinea(l, regimen, modo, reglas));
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
export function textoWhatsApp(cot, reglas) {
	const c = cot || {};
	const r = calcularCotizacion(c, reglas);
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

// ── Cliente e inmueble: se eligen de los registros (Clientes y Propiedades) y se guarda una copia
// en la cotización, para que la hoja no cambie aunque después se edite el registro.
const texto = (v) => String(v ?? '').trim();
const cifra = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const mil = miles;

// «EQ-101 · Casa en San Antonio · Zona 16»: el texto corto de siempre (lista, WhatsApp, cotizaciones de antes).
export const textoPropiedad = (p) => [p?.codigo, p?.titulo, p?.zona].map(texto).filter(Boolean).join(' · ');

// Copia de la propiedad. `tipos` es la lista [valor, etiqueta] del inventario (para guardar «Casa», no «casa»).
export function snapshotPropiedad(p, tipos = []) {
	if (!p) return { id: '', texto: '' };
	const f = Array.isArray(p.fotos) ? p.fotos.find((x) => (typeof x === 'string' ? x : x?.url)) : null;
	const url = typeof f === 'string' ? f : f?.url || '';
	const tipo = texto(p.tipo);
	return {
		id: p.id || '', texto: textoPropiedad(p),
		codigo: texto(p.codigo), titulo: texto(p.titulo),
		tipo, tipoTexto: (tipos.find(([v]) => v === tipo) || [])[1] || (tipo ? tipo[0].toUpperCase() + tipo.slice(1) : ''),
		operacion: OPERACIONES.some(([v]) => v === p.operacion) ? p.operacion : 'venta',
		zona: texto(p.zona), ciudad: texto(p.ciudad), direccion: texto(p.direccion),
		precio: cifra(p.precio), moneda: p.moneda === 'GTQ' ? 'GTQ' : 'USD',
		habitaciones: cifra(p.habitaciones), banos: cifra(p.banos), parqueos: cifra(p.parqueos),
		m2Construccion: cifra(p.m2Construccion), m2Terreno: cifra(p.m2Terreno),
		foto: url ? { url, alt: texto(f?.alt) || texto(p.titulo) } : null
	};
}

// Copia del cliente. Sin NIT en el registro se usa CF (consumidor final).
export function snapshotCliente(cl) {
	if (!cl) return { id: '', nombre: '', nit: 'CF', telefono: '', email: '' };
	return { id: cl.id || '', nombre: texto(cl.nombre), nit: texto(cl.nit).toUpperCase() || 'CF', telefono: texto(cl.telefono), email: texto(cl.email) };
}

// Datos cortos del inmueble para la hoja. Las cotizaciones de antes (solo `texto`) dan lo que se pueda.
export function datosPropiedad(s) {
	const p = s || {};
	if (!p.titulo && !p.codigo) {
		const partes = texto(p.texto).split(' · ').filter(Boolean);
		if (partes.length < 2) return { titulo: partes[0] || '', codigo: '', lugar: '', rasgos: [], precio: '' };
		return { codigo: partes[0], titulo: partes[1], lugar: partes.slice(2).join(', '), rasgos: [], precio: '' };
	}
	const clase = [p.tipoTexto, enOperacion(p)].filter(Boolean).join(' ');
	const m2 = p.m2Construccion ? `${mil(p.m2Construccion)} m²${p.m2Terreno ? ' de construcción' : ''}` : '';
	const rasgos = [
		clase ? clase[0].toUpperCase() + clase.slice(1) : '',
		p.habitaciones ? `${mil(p.habitaciones)} ${p.habitaciones === 1 ? 'habitación' : 'habitaciones'}` : '',
		p.banos ? `${mil(p.banos)} ${p.banos === 1 ? 'baño' : 'baños'}` : '',
		p.parqueos ? `${mil(p.parqueos)} ${p.parqueos === 1 ? 'parqueo' : 'parqueos'}` : '',
		m2, p.m2Terreno ? `${mil(p.m2Terreno)} m² de terreno` : ''
	].filter(Boolean);
	const precio = p.precio ? `${dinero(p.precio, p.moneda)}${p.operacion === 'renta' ? ' al mes' : p.operacion === 'vacacional' ? ' por noche' : ''}` : '';
	return { titulo: p.titulo || p.codigo, codigo: p.titulo ? p.codigo : '', lugar: [p.direccion, p.zona, p.ciudad].filter(Boolean).join(', '), rasgos, precio };
}

// Búsqueda sin tildes ni mayúsculas en varios campos.
export const sinTildes = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function buscar(lista, q, campos, max = 8) {
	const palabras = sinTildes(q).split(/\s+/).filter(Boolean);
	const pasan = (x) => { const t = sinTildes(campos.map((k) => x[k]).join(' ')); return palabras.every((w) => t.includes(w)); };
	return lista.filter(pasan).slice(0, max);
}
