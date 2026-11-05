/* Calculadora de renta: el cálculo de inversión en alquiler (un solo lugar para las fórmulas).
 * Funciona en tres lugares:
 *  - en el sitio como script clásico (deja window.EQRenta),
 *  - en el panel (import '/js/calc-renta.js' y luego window.EQRenta),
 *  - en Node para las pruebas (module.exports o globalThis.EQRenta).
 * Sintaxis ES5 a propósito. Los valores de ley están en PARAMS y se pueden cambiar desde el panel.
 * Todo se calcula en la moneda de la propiedad; los tramos en quetzales se convierten con el tipo de cambio.
 * Nada se redondea aquí: se redondea solo al mostrar. */
(function (root, factory) {
	var api = factory();
	if (typeof module === 'object' && module && module.exports) module.exports = api;
	if (root) root.EQRenta = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
	'use strict';

	var LEY_IUSI = 'Decreto 15-98 (Ley del IUSI), art. 11, reformado por el Decreto 18-2026 (publicado en el Diario de Centro América el 28-ago-2026, vigente aprox. desde el 26-nov-2026)';
	var LEY_ISR = 'Decreto 10-2012 (Ley de Actualización Tributaria, libro I: ISR)';
	var LEY_IVA = 'Decreto 27-92 (Ley del IVA)';
	var FUENTE_IUSI = 'Decreto 18-2026, art. 1 (reforma art. 11 Dto. 15-98), DCA 28-ago-2026. Vigente desde el 26-nov-2026 aprox.; antes regía la escala anterior';
	var FUENTE_IVA = 'Ley del IVA, Dto. 27-92, art. 3 num. 4; art. 10; arts. 45-47 (Dto. 4-2012)';
	var FUENTE_EXENCION = 'Decreto 18-2026, art. 4 (agrega el numeral 4 al art. 87 del Dto. 10-2012), para ventas desde el 1-ene-2027 (art. 5 b)';

	// Cada valor: { valor, etiqueta, unidad, grupo, fuente, confirmar }. Lista plana para editarla fácil en el panel.
	var PARAMS = {
		tipoCambio: { valor: 7.7, etiqueta: 'Tipo de cambio (Q por US$)', unidad: 'Q', grupo: 'General', fuente: 'Referencia de mercado; revisar el tipo de cambio de referencia del Banguat del día.', confirmar: true },

		iusiHabitacional: { valor: 0, etiqueta: 'IUSI vivienda o residencial', unidad: '‰', grupo: 'IUSI', fuente: FUENTE_IUSI + '. Vivienda y uso residencial: 0 ‰.', confirmar: false },
		iusiMixto: { valor: 0, etiqueta: 'IUSI uso mixto', unidad: '‰', grupo: 'IUSI', fuente: FUENTE_IUSI + '. Uso mixto: 0 ‰.', confirmar: false },
		iusiTramo1Hasta: { valor: 500000, etiqueta: 'Comercial y otros usos: tramo 1 hasta (valor inscrito)', unidad: 'Q', grupo: 'IUSI', fuente: FUENTE_IUSI + '. De Q 0 a Q 500,000. Ya no hay tramo exento.', confirmar: false },
		iusiTramo1Tasa: { valor: 3, etiqueta: 'Comercial y otros usos: tasa tramo 1', unidad: '‰', grupo: 'IUSI', fuente: FUENTE_IUSI + '. La tasa del tramo se aplica a todo el valor (no es marginal).', confirmar: false },
		iusiTramo2Hasta: { valor: 1000000, etiqueta: 'Comercial y otros usos: tramo 2 hasta', unidad: 'Q', grupo: 'IUSI', fuente: FUENTE_IUSI + '. De Q 500,000.01 a Q 1,000,000.', confirmar: false },
		iusiTramo2Tasa: { valor: 6, etiqueta: 'Comercial y otros usos: tasa tramo 2', unidad: '‰', grupo: 'IUSI', fuente: FUENTE_IUSI + '. La tasa del tramo se aplica a todo el valor (no es marginal).', confirmar: false },
		iusiTramo3Tasa: { valor: 9, etiqueta: 'Comercial y otros usos: tasa sobre Q 1,000,000', unidad: '‰', grupo: 'IUSI', fuente: FUENTE_IUSI + '. La tasa del tramo se aplica a todo el valor (no es marginal).', confirmar: false },

		isrCapitalTasa: { valor: 10, etiqueta: 'ISR rentas de capital: tasa', unidad: '%', grupo: 'ISR', fuente: LEY_ISR + ', art. 92 (tasa) y art. 84 (rentas de capital inmobiliarias).', confirmar: true },
		isrCapitalDeduccion: { valor: 30, etiqueta: 'ISR rentas de capital: deducción sin comprobar', unidad: '%', grupo: 'ISR', fuente: LEY_ISR + ': la base es la renta menos 30 %.', confirmar: true },
		isrSimplificadoTope: { valor: 30000, etiqueta: 'Régimen simplificado: tramo mensual', unidad: 'Q', grupo: 'ISR', fuente: LEY_ISR + ', régimen opcional simplificado sobre ingresos (mensual).', confirmar: true },
		isrSimplificadoTasa1: { valor: 5, etiqueta: 'Régimen simplificado: tasa hasta el tramo', unidad: '%', grupo: 'ISR', fuente: LEY_ISR + ', régimen opcional simplificado sobre ingresos.', confirmar: true },
		isrSimplificadoTasa2: { valor: 7, etiqueta: 'Régimen simplificado: tasa sobre el excedente', unidad: '%', grupo: 'ISR', fuente: LEY_ISR + ', régimen opcional simplificado sobre ingresos.', confirmar: true },
		isrUtilidadesTasa: { valor: 25, etiqueta: 'Régimen sobre utilidades: tasa', unidad: '%', grupo: 'ISR', fuente: LEY_ISR + ', régimen sobre las utilidades de actividades lucrativas.', confirmar: true },
		isrGananciaCapital: { valor: 10, etiqueta: 'ISR sobre la ganancia de la venta (rentas de capital)', unidad: '%', grupo: 'ISR', fuente: LEY_ISR + ', título IV (rentas y ganancias de capital), art. 92: 10 % sobre la ganancia (precio de venta menos costo de adquisición y mejoras). Solo si el vendedor no está exento: ' + FUENTE_EXENCION + ' exime a la persona individual sin actividad inmobiliaria inscrita en el RTU.', confirmar: true },
		isrGananciaUtilidades: { valor: 25, etiqueta: 'ISR sobre la ganancia de la venta (régimen sobre utilidades)', unidad: '%', grupo: 'ISR', fuente: LEY_ISR + ': si la propiedad es parte del negocio, la ganancia de la venta se suma a la utilidad del año y paga la tasa del régimen sobre utilidades. La exención del Decreto 18-2026 no aplica a personas jurídicas ni a quien tiene actividad inmobiliaria inscrita.', confirmar: true },

		ivaGeneral: { valor: 12, etiqueta: 'IVA régimen general', unidad: '%', grupo: 'IVA', fuente: FUENTE_IVA + '. El arrendamiento, también el de vivienda, paga IVA (no hay exención). En el régimen general se cobra al inquilino encima de la renta.', confirmar: false },
		ivaPequeno: { valor: 5, etiqueta: 'IVA pequeño contribuyente', unidad: '%', grupo: 'IVA', fuente: FUENTE_IVA + '. Pequeño contribuyente: 5 % sobre los ingresos brutos; lo paga el dueño.', confirmar: false },
		limitePequenoGTQ: { valor: 500285, etiqueta: 'Pequeño contribuyente: límite de ingresos al año', unidad: 'Q', grupo: 'IVA', fuente: 'Dto. 31-2024, arts. 15-17 (Ley del IVA arts. 45, 46 y 50): 125 salarios mínimos mensuales no agrícolas, sin bonificación incentivo. Monto 2026 según el salario mínimo vigente', confirmar: true },

		capCasa: { valor: 5, etiqueta: 'Cap rate de referencia: casa', unidad: '%', grupo: 'Mercado', fuente: 'Referencia interna de mercado en Guatemala.', confirmar: true },
		capApartamento: { valor: 6, etiqueta: 'Cap rate de referencia: apartamento', unidad: '%', grupo: 'Mercado', fuente: 'Referencia interna de mercado en Guatemala.', confirmar: true },
		capOficina: { valor: 7.5, etiqueta: 'Cap rate de referencia: oficina', unidad: '%', grupo: 'Mercado', fuente: 'Referencia interna de mercado en Guatemala.', confirmar: true },
		capLocal: { valor: 8, etiqueta: 'Cap rate de referencia: local', unidad: '%', grupo: 'Mercado', fuente: 'Referencia interna de mercado en Guatemala.', confirmar: true },
		capBodega: { valor: 8.5, etiqueta: 'Cap rate de referencia: bodega', unidad: '%', grupo: 'Mercado', fuente: 'Referencia interna de mercado en Guatemala.', confirmar: true },
		capFinca: { valor: 5, etiqueta: 'Cap rate de referencia: finca', unidad: '%', grupo: 'Mercado', fuente: 'Referencia interna de mercado en Guatemala.', confirmar: true },
		capSalidaExtra: { valor: 0.5, etiqueta: 'Cap rate de salida: puntos sobre la referencia', unidad: 'pp', grupo: 'Mercado', fuente: 'Supuesto conservador de valuación.', confirmar: true },
		capSalidaDefecto: { valor: 7, etiqueta: 'Cap rate de salida si no hay referencia', unidad: '%', grupo: 'Mercado', fuente: 'Supuesto conservador de valuación.', confirmar: true }
	};

	var USO_POR_TIPO = { casa: 'habitacional', apartamento: 'habitacional', finca: 'habitacional', oficina: 'comercial', local: 'comercial', bodega: 'comercial' };
	var CAP_POR_TIPO = { casa: 'capCasa', apartamento: 'capApartamento', oficina: 'capOficina', local: 'capLocal', bodega: 'capBodega', finca: 'capFinca' };

	function n(v, d) {
		if (v === '' || v === null || v === undefined) return d;
		var x = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
		return isFinite(x) ? x : d;
	}
	function extend(a, b) {
		var o = {}, k;
		for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
		for (k in b) if (Object.prototype.hasOwnProperty.call(b, k) && b[k] !== undefined) o[k] = b[k];
		return o;
	}
	// Valores numéricos de los parámetros, con los cambios del usuario encima.
	function valores(params) {
		var out = {}, k;
		for (k in PARAMS) out[k] = PARAMS[k].valor;
		if (params) for (k in params) {
			if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
			var v = params[k];
			if (v && typeof v === 'object' && 'valor' in v) v = v.valor;
			if (v !== null && v !== undefined && v !== '' && isFinite(Number(v))) out[k] = Number(v);
		}
		return out;
	}
	function b(v, d) {
		if (v === '' || v === null || v === undefined) return d;
		return !(v === false || v === 0 || v === 'false' || v === '0' || v === 'no');
	}
	function copiaParams() {
		var o = {}, k, j;
		for (k in PARAMS) { o[k] = {}; for (j in PARAMS[k]) o[k][j] = PARAMS[k][j]; }
		return o;
	}

	function usoPorTipo(tipo) { return USO_POR_TIPO[tipo] || 'habitacional'; }
	// IVA por defecto (todos los usos): pequeño contribuyente si la renta cobrada del año 1, en quetzales, no pasa del límite; si pasa, general.
	function ivaPorDefecto(inputs, params) {
		var i = inputs || {}, P = valores(params);
		var tc = n(i.tipoCambio, P.tipoCambio) || P.tipoCambio;
		var fx = i.moneda === 'GTQ' ? 1 : tc;
		var cobradoQ = n(i.rentaMensual, 0) * 12 * (1 - n(i.vacancia, 5) / 100) * fx;
		return cobradoQ <= P.limitePequenoGTQ ? 'pequeno' : 'general';
	}
	function capReferencia(tipo, params) {
		var key = CAP_POR_TIPO[tipo];
		return key ? valores(params)[key] : null;
	}

	// IUSI (Decreto 18-2026): vivienda, residencial y mixto 0 ‰; comercial y otros usos por tramos, sin tramo exento.
	// La tasa del tramo se aplica a todo el valor fiscal (no es marginal). Devuelve ‰.
	function tasaIusi(uso, valorFiscalQ, params) {
		var P = valores(params);
		if (uso === 'habitacional') return P.iusiHabitacional;
		if (uso === 'mixto') return P.iusiMixto;
		if (valorFiscalQ <= P.iusiTramo1Hasta) return P.iusiTramo1Tasa;
		if (valorFiscalQ <= P.iusiTramo2Hasta) return P.iusiTramo2Tasa;
		return P.iusiTramo3Tasa;
	}

	// Completa las entradas con los valores por defecto. Porcentajes en "%" (5 = 5 %).
	function normalizar(inputs, params) {
		var i = inputs || {};
		var P = valores(params);
		var tipo = i.tipo || '';
		var moneda = i.moneda === 'GTQ' ? 'GTQ' : 'USD';
		var uso = i.uso || usoPorTipo(tipo);
		var precio = n(i.precio, 0);
		var tc = n(i.tipoCambio, P.tipoCambio) || P.tipoCambio;
		var fx = moneda === 'USD' ? tc : 1; // de la moneda de la propiedad a quetzales
		var cap = capReferencia(tipo, params);
		var regimenISR = i.regimenISR || 'capital';
		var ivaAuto = i.regimenIVA !== 'pequeno' && i.regimenIVA !== 'general';
		return {
			tipo: tipo,
			precio: precio,
			moneda: moneda,
			rentaMensual: n(i.rentaMensual, 0),
			uso: uso,
			regimenISR: regimenISR,
			regimenIVA: ivaAuto ? ivaPorDefecto(i, params) : i.regimenIVA,
			ivaAutomatico: ivaAuto,
			// Exento de ISR en la venta: persona individual sin actividad inmobiliaria inscrita en el RTU (Decreto 18-2026).
			vendedorExento: b(i.vendedorExento, regimenISR === 'capital'),
			vacancia: n(i.vacancia, 5),
			gastosOperativos: n(i.gastosOperativos, 10),
			reservaCapex: n(i.reservaCapex, 0),
			crecimientoRenta: n(i.crecimientoRenta, 3),
			plazo: Math.max(1, Math.min(50, Math.round(n(i.plazo, 30)))),
			capSalida: n(i.capSalida, cap != null ? cap + P.capSalidaExtra : P.capSalidaDefecto),
			costosVenta: n(i.costosVenta, 5),
			tasaDescuento: n(i.tasaDescuento, 10),
			tipoCambio: tc,
			valorFiscal: n(i.valorFiscal, precio * fx), // siempre en quetzales
			iusiMil: n(i.iusiMil, null), // tasa ‰ forzada (opcional)
			depreciacion: n(i.depreciacion, 0),
			costosCompra: n(i.costosCompra, 0), // % del precio: notario, registro, impuesto de la compra
			restarImpuestoVenta: b(i.restarImpuestoVenta, true), // ISR sobre la ganancia de la venta
			capexSumaAlCosto: b(i.capexSumaAlCosto, true) // la reserva gastada en mejoras sube el costo de adquisición
		};
	}

	function isrDelAnio(e, cobrado, deducibles, P, fx) {
		if (e.regimenISR === 'simplificado') {
			var mesQ = cobrado / 12 * fx;
			var isrMesQ = P.isrSimplificadoTasa1 / 100 * Math.min(mesQ, P.isrSimplificadoTope) +
				P.isrSimplificadoTasa2 / 100 * Math.max(0, mesQ - P.isrSimplificadoTope);
			return isrMesQ * 12 / fx;
		}
		if (e.regimenISR === 'utilidades') return P.isrUtilidadesTasa / 100 * Math.max(0, cobrado - deducibles);
		return P.isrCapitalTasa / 100 * (1 - P.isrCapitalDeduccion / 100) * cobrado;
	}

	function vpn(tasa, flujos) {
		var s = 0;
		for (var t = 0; t < flujos.length; t++) s += flujos[t] / Math.pow(1 + tasa, t);
		return s;
	}

	// TIR por bisección (robusta). null si no hay cambio de signo en el rango.
	function tir(flujos) {
		if (!flujos || flujos.length < 2) return null;
		var pos = false, neg = false, t;
		for (t = 0; t < flujos.length; t++) { if (flujos[t] > 0) pos = true; if (flujos[t] < 0) neg = true; }
		if (!pos || !neg) return null;
		var f = function (r) { return vpn(r, flujos); };
		// Busca un intervalo con cambio de signo en una malla, empezando cerca de 0.
		var puntos = [-0.99, -0.9, -0.75, -0.5, -0.3, -0.15, -0.05, 0, 0.02, 0.05, 0.08, 0.12, 0.2, 0.35, 0.5, 1, 2, 5, 10];
		var lo = null, hi = null, flo, fhi, prev = f(puntos[0]);
		for (t = 1; t < puntos.length; t++) {
			var cur = f(puntos[t]);
			if (!isFinite(prev) || !isFinite(cur)) { prev = cur; continue; }
			if (prev === 0) return puntos[t - 1];
			if ((prev < 0) !== (cur < 0)) { lo = puntos[t - 1]; hi = puntos[t]; flo = prev; fhi = cur; break; }
			prev = cur;
		}
		if (lo === null) return null;
		for (var k = 0; k < 200; k++) {
			var mid = (lo + hi) / 2, fm = f(mid);
			if (Math.abs(fm) < 1e-9 || (hi - lo) < 1e-12) return mid;
			if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
		}
		return (lo + hi) / 2;
	}

	function calcular(inputs, params) {
		var e = normalizar(inputs, params);
		var P = valores(params);
		var fx = e.moneda === 'USD' ? e.tipoCambio : 1;
		var tasaMil = e.iusiMil != null ? e.iusiMil : tasaIusi(e.uso, e.valorFiscal, params);
		var iusi = e.valorFiscal * tasaMil / 1000 / fx; // anual, constante, en la moneda de la propiedad
		var g = e.crecimientoRenta / 100, v = e.vacancia / 100;
		var costosCompra = e.precio * e.costosCompra / 100;
		var inversion = e.precio + costosCompra; // lo que sale del bolsillo el año 0
		var anios = [], acumulado = 0, flujos = [-inversion], payback = null, depAcum = 0;

		// depPrevia: depreciación ya usada; no se deprecia más que el precio.
		function anio(t, depPrevia) {
			var pgi = e.rentaMensual * 12 * Math.pow(1 + g, t - 1);
			var cobrado = pgi * (1 - v);
			var opex = cobrado * e.gastosOperativos / 100;
			var capex = cobrado * e.reservaCapex / 100;
			var dep = e.regimenISR === 'utilidades' ? Math.max(0, Math.min(e.precio * e.depreciacion / 100, e.precio - (depPrevia || 0))) : 0;
			var deducibles = opex + iusi + dep;
			var isr = isrDelAnio(e, cobrado, deducibles, P, fx);
			var ivaPropietario = e.regimenIVA === 'pequeno' ? cobrado * P.ivaPequeno / 100 : 0;
			var ivaInquilino = e.regimenIVA === 'general' ? cobrado * P.ivaGeneral / 100 : 0;
			var noi = cobrado - opex - iusi;
			return {
				t: t, pgi: pgi, vacancia: pgi - cobrado, cobrado: cobrado, opex: opex, capex: capex, iusi: iusi,
				depreciacion: dep, isr: isr, ivaPropietario: ivaPropietario, ivaInquilino: ivaInquilino,
				noi: noi,
				antesImpuestos: noi - capex,
				neto: noi - capex - isr - ivaPropietario
			};
		}

		var tot = { pgi: 0, vacancia: 0, cobrado: 0, opex: 0, iusi: 0, capex: 0, isr: 0, ivaPropietario: 0, ivaInquilino: 0, neto: 0 };
		for (var t = 1; t <= e.plazo; t++) {
			var a = anio(t, depAcum);
			depAcum += a.depreciacion;
			var antes = acumulado;
			acumulado += a.neto;
			if (payback === null && inversion > 0 && a.neto > 0 && acumulado >= inversion) payback = t - 1 + (inversion - antes) / a.neto;
			a.acumulado = acumulado;
			a.reversion = 0;
			a.flujo = a.neto;
			for (var k in tot) tot[k] += a[k];
			anios.push(a);
		}

		// Venta al final del plazo (reversión).
		var noiSalida = anio(e.plazo + 1, depAcum).noi;
		var precioVenta = e.capSalida > 0 ? Math.max(0, noiSalida / (e.capSalida / 100)) : 0;
		var costosVentaMonto = precioVenta * e.costosVenta / 100;
		var reversion = precioVenta - costosVentaMonto; // ingreso neto de la venta, antes del ISR
		var mejoras = e.capexSumaAlCosto ? tot.capex : 0;
		var costoAdquisicion = inversion + mejoras;
		var depVenta = e.regimenISR === 'utilidades' ? depAcum : 0;
		var costoFiscal = costoAdquisicion - depVenta;
		var ganancia = reversion - costoFiscal;
		var tasaGanancia = e.regimenISR === 'utilidades' ? P.isrGananciaUtilidades : P.isrGananciaCapital;
		if (e.vendedorExento) tasaGanancia = 0;
		var impuestoCalculado = ganancia > 0 ? ganancia * tasaGanancia / 100 : 0;
		var impuestoVenta = e.restarImpuestoVenta ? impuestoCalculado : 0;
		var ventaNeta = reversion - impuestoVenta;
		var venta = {
			anio: e.plazo, noiSalida: noiSalida, capSalida: e.capSalida, precioVenta: precioVenta, costosVenta: costosVentaMonto,
			ingresoNeto: reversion, precioCompra: e.precio, costosCompra: costosCompra, mejoras: mejoras, costoAdquisicion: costoAdquisicion,
			depreciacionAcumulada: depVenta, costoFiscal: costoFiscal, ganancia: ganancia, tasa: tasaGanancia,
			exento: e.vendedorExento, impuestoCalculado: impuestoCalculado, impuesto: impuestoVenta, restado: e.restarImpuestoVenta, neta: ventaNeta
		};

		var ultimo = anios[anios.length - 1];
		ultimo.reversion = ventaNeta;
		ultimo.flujo = ultimo.neto + ventaNeta;
		for (t = 0; t < anios.length; t++) flujos.push(anios[t].flujo);
		// Los mismos flujos sin restar el impuesto de la venta, para comparar.
		var flujosSinImpuesto = flujos.slice();
		flujosSinImpuesto[flujos.length - 1] += impuestoVenta;

		var a1 = anios[0];
		var avisos = [];
		if (e.tipo === 'terreno') avisos.push('terreno');
		var ivaLimiteAnio = null;
		for (t = 0; t < anios.length; t++) if (anios[t].cobrado * fx > P.limitePequenoGTQ) { ivaLimiteAnio = t + 1; break; }
		if (e.regimenIVA === 'pequeno' && ivaLimiteAnio === 1) avisos.push('pequenoLimite');
		else if (e.regimenIVA === 'pequeno' && ivaLimiteAnio) avisos.push('pequenoLimiteFuturo');
		var laTir = e.precio > 0 ? tir(flujos) : null;
		if (laTir === null) avisos.push('tirNula');
		var recibido = tot.neto + ventaNeta;

		return {
			entradas: e,
			parametros: P,
			anios: anios,
			anio1: a1,
			iusiTasaMil: tasaMil,
			ivaLimiteAnio: ivaLimiteAnio, // primer año en que la renta cobrada pasa del límite de pequeño contribuyente
			valorFiscalQ: e.valorFiscal,
			cobradoAnualQ: a1.cobrado * fx,
			netoMensual: a1.neto / 12,
			rendimientoBruto: e.precio > 0 ? e.rentaMensual * 12 / e.precio : null,
			rendimientoNeto: e.precio > 0 ? a1.neto / e.precio : null,
			capRate: e.precio > 0 ? a1.noi / e.precio : null,
			payback: payback,
			inversion: inversion,
			noiSalida: noiSalida,
			reversion: reversion,
			venta: venta,
			totales: tot,
			recibido: recibido,
			gananciaTotal: recibido - inversion,
			multiplo: inversion > 0 ? recibido / inversion : null,
			flujos: flujos,
			tir: laTir,
			tirSinImpuestoVenta: e.precio > 0 ? tir(flujosSinImpuesto) : null,
			vpn: vpn(e.tasaDescuento / 100, flujos),
			avisos: avisos
		};
	}

	// ── Estado de resultados (cascada de bruto a neto) ─────────
	// Cada fila: { clave, etiqueta, etiquetaEn, monto, mensual, pct, tipo, nota, notaEn }.
	// tipo: 'ingreso' | 'resta' | 'subtotal' | 'total' | 'info'. Las restas van con monto negativo.
	// pct = monto ÷ base (renta bruta en el año; precio de venta en la venta). Las filas 'info' no se suman.
	function num2(v, lang, dec) {
		return new Intl.NumberFormat(locale(lang), { minimumFractionDigits: 0, maximumFractionDigits: dec === undefined ? 2 : dec }).format(v);
	}
	function fila(clave, tipo, monto, base, es, en, notaEs, notaEn) {
		return { clave: clave, tipo: tipo, etiqueta: es, etiquetaEn: en, monto: monto, mensual: monto == null ? null : monto / 12,
			pct: monto != null && base > 0 ? monto / base : null, nota: notaEs || '', notaEn: notaEn || notaEs || '' };
	}
	function regimenTexto(e, P, lang) {
		var en = lang === 'en';
		if (e.regimenISR === 'simplificado') return en
			? num2(P.isrSimplificadoTasa1, lang) + '% up to Q ' + num2(P.isrSimplificadoTope, lang, 0) + ' a month and ' + num2(P.isrSimplificadoTasa2, lang) + '% above, on rent collected (simplified regime)'
			: num2(P.isrSimplificadoTasa1, lang) + ' % hasta Q ' + num2(P.isrSimplificadoTope, lang, 0) + ' al mes y ' + num2(P.isrSimplificadoTasa2, lang) + ' % del excedente, sobre lo cobrado (régimen simplificado)';
		if (e.regimenISR === 'utilidades') return en
			? num2(P.isrUtilidadesTasa, lang) + '% of profit: collected − costs − IUSI − depreciation (profit regime)'
			: num2(P.isrUtilidadesTasa, lang) + ' % de la utilidad: cobrado − gastos − IUSI − depreciación (régimen sobre utilidades)';
		return en
			? num2(P.isrCapitalTasa, lang) + '% on ' + num2(100 - P.isrCapitalDeduccion, lang) + '% of rent collected (capital income)'
			: num2(P.isrCapitalTasa, lang) + ' % sobre el ' + num2(100 - P.isrCapitalDeduccion, lang) + ' % de lo cobrado (rentas de capital)';
	}

	// Año t (1 = primer año) del resultado de calcular().
	function cascadaAnio(r, t) {
		var a = r.anios[Math.max(1, Math.min(r.anios.length, t || 1)) - 1];
		var e = r.entradas, P = r.parametros, base = a.pgi;
		var vf = num2(Math.round(r.valorFiscalQ), 'es', 0), vfEn = num2(Math.round(r.valorFiscalQ), 'en', 0);
		var filas = [
			fila('bruta', 'ingreso', a.pgi, base, 'Renta bruta potencial', 'Potential gross rent',
				'Renta de ' + dinero(a.pgi / 12, e.moneda, 'es') + ' × 12 meses', 'Rent of ' + dinero(a.pgi / 12, e.moneda, 'en') + ' × 12 months'),
			fila('vacancia', 'resta', -a.vacancia, base, 'Vacancia', 'Vacancy',
				num2(e.vacancia, 'es') + ' % del año sin cobrar', num2(e.vacancia, 'en') + '% of the year not collected'),
			fila('cobrado', 'subtotal', a.cobrado, base, 'Ingreso efectivo (renta cobrada)', 'Effective income (rent collected)'),
			fila('opex', 'resta', -a.opex, base, 'Gastos operativos', 'Operating costs',
				'Administración, mantenimiento y seguro: ' + num2(e.gastosOperativos, 'es') + ' % de lo cobrado',
				'Management, maintenance and insurance: ' + num2(e.gastosOperativos, 'en') + '% of rent collected'),
			fila('iusi', 'resta', -a.iusi, base, 'IUSI', 'Property tax (IUSI)',
				a.iusi > 0 ? num2(r.iusiTasaMil, 'es') + ' ‰ sobre el valor fiscal de Q ' + vf : (e.uso === 'comercial' ? 'Sin valor fiscal' : '0 ‰: uso ' + (e.uso === 'mixto' ? 'mixto' : 'habitacional') + ' (Decreto 18-2026)'),
				a.iusi > 0 ? num2(r.iusiTasaMil, 'en') + '‰ on the assessed value of Q ' + vfEn : (e.uso === 'comercial' ? 'No assessed value' : '0‰: ' + (e.uso === 'mixto' ? 'mixed' : 'residential') + ' use (Decree 18-2026)')),
			fila('noi', 'subtotal', a.noi, base, 'Ingreso operativo neto (NOI)', 'Net operating income (NOI)',
				'Antes de la reserva y del impuesto sobre la renta', 'Before the reserve and income tax'),
			fila('capex', 'resta', -a.capex, base, 'Reserva para reparaciones mayores', 'Reserve for major repairs',
				'Capex: ' + num2(e.reservaCapex, 'es') + ' % de lo cobrado (techo, pintura, equipos)', 'Capex: ' + num2(e.reservaCapex, 'en') + '% of rent collected (roof, paint, equipment)'),
			fila('antesImpuestos', 'subtotal', a.antesImpuestos, base, 'Flujo antes de impuestos', 'Cash flow before taxes'),
			fila('isr', 'resta', -a.isr, base, 'ISR', 'Income tax (ISR)', regimenTexto(e, P, 'es'), regimenTexto(e, P, 'en'))
		];
		if (e.regimenIVA === 'pequeno') filas.push(fila('ivaPropietario', 'resta', -a.ivaPropietario, base, 'IVA pequeño contribuyente', 'VAT, small taxpayer',
			num2(P.ivaPequeno, 'es') + ' % de lo cobrado; lo pagas tú. Aplica si cobras hasta Q\u00a0' + num2(P.limitePequenoGTQ, 'es', 0) + ' al año',
			num2(P.ivaPequeno, 'en') + '% of rent collected; you pay it. Applies up to Q\u00a0' + num2(P.limitePequenoGTQ, 'en', 0) + ' a year'));
		filas.push(fila('neto', 'total', a.neto, base, 'Flujo neto para el dueño', 'Net cash flow to the owner', 'Lo que te queda', 'What you keep'));
		if (e.regimenIVA === 'general') filas.push(fila('ivaInquilino', 'info', a.ivaInquilino, base, 'IVA que cobras al inquilino', 'VAT you charge the tenant',
			num2(P.ivaGeneral, 'es') + ' % encima de la renta. Se cobra aparte y se entrega a la SAT: no es ingreso tuyo.',
			num2(P.ivaGeneral, 'en') + '% on top of the rent. Collected separately and paid to SAT: it is not your income.'));
		return filas;
	}

	function sinMes(filas) { for (var i = 0; i < filas.length; i++) filas[i].mensual = null; return filas; }

	// Venta al final del plazo. pct sobre el precio de venta.
	function cascadaVenta(r) {
		var v = r.venta, e = r.entradas, base = v.precioVenta, m = e.moneda;
		var notaIsr, notaIsrEn;
		if (v.exento) { notaIsr = 'Exento (Dto. 18-2026, art. 87 num. 4 Ley ISR)'; notaIsrEn = 'Exempt (Decree 18-2026, art. 87 no. 4 of the ISR law)'; }
		else if (!v.restado) { notaIsr = 'No se resta (opción desactivada). Sería ' + dinero(v.impuestoCalculado, m, 'es'); notaIsrEn = 'Not subtracted (option off). It would be ' + dinero(v.impuestoCalculado, m, 'en'); }
		else if (v.ganancia <= 0) { notaIsr = 'No hay ganancia: no se paga'; notaIsrEn = 'No gain: nothing to pay'; }
		else { notaIsr = num2(v.tasa, 'es') + ' % de la ganancia de ' + dinero(v.ganancia, m, 'es'); notaIsrEn = num2(v.tasa, 'en') + '% of the gain of ' + dinero(v.ganancia, m, 'en'); }
		return sinMes([
			fila('precioVenta', 'ingreso', v.precioVenta, base, 'Precio de venta estimado', 'Estimated sale price',
				'NOI del año ' + (v.anio + 1) + ' (' + dinero(v.noiSalida, m, 'es') + ') ÷ cap rate de salida ' + num2(v.capSalida, 'es') + ' %',
				'Year ' + (v.anio + 1) + ' NOI (' + dinero(v.noiSalida, m, 'en') + ') ÷ exit cap rate ' + num2(v.capSalida, 'en') + '%'),
			fila('costosVenta', 'resta', -v.costosVenta, base, 'Costos de venta', 'Selling costs',
				'Comisión y gastos notariales: ' + num2(e.costosVenta, 'es') + ' % del precio', 'Commission and notary fees: ' + num2(e.costosVenta, 'en') + '% of the price'),
			fila('ingresoNeto', 'subtotal', v.ingresoNeto, base, 'Ingreso neto de la venta', 'Net sale proceeds'),
			fila('isrVenta', 'resta', -v.impuesto, base, 'ISR sobre la ganancia de capital', 'Capital gains tax (ISR)', notaIsr, notaIsrEn),
			fila('ventaNeta', 'total', v.neta, base, 'Lo que te queda de la venta', 'What you keep from the sale'),
			fila('timbres', 'info', null, base, 'Impuesto de la venta para el comprador', 'Transfer tax for the buyer',
				'En la reventa se paga Impuesto de Timbres Fiscales (3 %), normalmente por el comprador; no es IVA. Confírmalo en la promesa de compraventa.',
				'On a resale, Stamp Tax (3%) is paid, normally by the buyer; it is not VAT. Confirm it in the purchase agreement.')
		]);
	}

	// Cálculo de la ganancia, paso a paso.
	function cascadaGanancia(r) {
		var v = r.venta, e = r.entradas;
		var filas = [
			fila('precioCompra', 'ingreso', v.precioCompra, 0, 'Precio de compra', 'Purchase price'),
			fila('costosCompra', 'ingreso', v.costosCompra, 0, 'Costos de compra', 'Purchase costs', num2(e.costosCompra, 'es') + ' % del precio', num2(e.costosCompra, 'en') + '% of the price'),
			fila('mejoras', 'ingreso', v.mejoras, 0, 'Mejoras (reserva usada en el plazo)', 'Improvements (reserve spent)',
				e.capexSumaAlCosto ? 'Suma de la reserva de los ' + v.anio + ' años' : 'No se suma al costo', e.capexSumaAlCosto ? 'Sum of the reserve over ' + v.anio + ' years' : 'Not added to the cost'),
			fila('costoAdquisicion', 'subtotal', v.costoAdquisicion, 0, 'Costo de adquisición', 'Acquisition cost')
		];
		if (v.depreciacionAcumulada > 0) filas.push(
			fila('depreciacion', 'resta', -v.depreciacionAcumulada, 0, 'Depreciación ya deducida', 'Depreciation already deducted', 'Régimen sobre utilidades', 'Profit regime'),
			fila('costoFiscal', 'subtotal', v.costoFiscal, 0, 'Costo fiscal', 'Tax basis'));
		filas.push(
			fila('ingresoNeto', 'ingreso', v.ingresoNeto, 0, 'Ingreso neto de la venta', 'Net sale proceeds'),
			fila('menosCosto', 'resta', -v.costoFiscal, 0, v.depreciacionAcumulada > 0 ? 'Costo fiscal' : 'Costo de adquisición', v.depreciacionAcumulada > 0 ? 'Tax basis' : 'Acquisition cost'),
			fila('ganancia', 'subtotal', v.ganancia, 0, 'Ganancia de capital', 'Capital gain', v.ganancia <= 0 ? 'Sin ganancia: no hay impuesto' : '', v.ganancia <= 0 ? 'No gain: no tax' : ''),
			fila('tasa', 'info', null, 0, 'Tasa aplicada', 'Rate applied',
				v.exento ? 'Exento: persona individual sin actividad inmobiliaria inscrita en el RTU (Dto. 18-2026, art. 87 num. 4 Ley ISR)'
					: num2(v.tasa, 'es') + ' %' + (e.regimenISR === 'utilidades' ? ' (régimen sobre utilidades)' : ' (ganancia de capital, art. 92)'),
				v.exento ? 'Exempt: individual with no real-estate activity registered in the RTU (Decree 18-2026, art. 87 no. 4 of the ISR law)'
					: num2(v.tasa, 'en') + '%' + (e.regimenISR === 'utilidades' ? ' (profit regime)' : ' (capital gain, art. 92)')),
			fila('impuesto', 'total', v.impuestoCalculado, 0, 'ISR sobre la ganancia', 'Capital gains tax'));
		return sinMes(filas);
	}

	// Resumen del negocio en todo el plazo.
	function cascadaResumen(r) {
		var T = r.totales, e = r.entradas, n = e.plazo;
		var filas = [
			fila('rentas', 'ingreso', T.cobrado, 0, 'Rentas cobradas', 'Rent collected', 'Suma de los ' + n + ' años, ya sin vacancia', 'Total of ' + n + ' years, after vacancy'),
			fila('gastos', 'resta', -(T.opex + T.iusi), 0, 'Gastos operativos e IUSI', 'Operating costs and IUSI'),
			fila('reserva', 'resta', -T.capex, 0, 'Reserva para reparaciones mayores', 'Reserve for major repairs'),
			fila('isr', 'resta', -T.isr, 0, 'ISR de las rentas', 'Income tax on rent')
		];
		if (T.ivaPropietario > 0) filas.push(fila('iva', 'resta', -T.ivaPropietario, 0, 'IVA pequeño contribuyente', 'VAT, small taxpayer'));
		filas.push(
			fila('netoRentas', 'subtotal', T.neto, 0, 'Flujo neto de las rentas', 'Net cash flow from rent', n + ' años', n + ' years'),
			fila('venta', 'ingreso', r.venta.neta, 0, 'Venta, después de costos e impuesto', 'Sale, after costs and tax', 'Año ' + n, 'Year ' + n),
			fila('recibido', 'subtotal', r.recibido, 0, 'Total que recibes', 'Total you receive'),
			fila('inversion', 'resta', -r.inversion, 0, 'Inversión inicial', 'Initial investment',
				e.costosCompra > 0 ? 'Precio más ' + num2(e.costosCompra, 'es') + ' % de costos de compra' : 'Precio de compra',
				e.costosCompra > 0 ? 'Price plus ' + num2(e.costosCompra, 'en') + '% purchase costs' : 'Purchase price'),
			fila('ganancia', 'total', r.gananciaTotal, 0, 'Ganancia total del negocio', 'Total profit'),
			fila('multiplo', 'info', r.multiplo, 0, 'Múltiplo', 'Multiple',
				'Total que recibes ÷ inversión: ' + (r.multiplo == null ? '—' : num2(r.multiplo, 'es') + ' veces'),
				'Total received ÷ investment: ' + (r.multiplo == null ? '—' : num2(r.multiplo, 'en') + 'x')));
		return sinMes(filas);
	}

	// Renta mensual que da un rendimiento neto (año 1) objetivo, en %. null si no se alcanza.
	function rentaParaRendimiento(precio, objetivoNeto, inputs, params) {
		var base = extend(inputs || {}, { precio: precio });
		if (!(precio > 0)) return null;
		var meta = objetivoNeto / 100;
		var f = function (renta) { return calcular(extend(base, { rentaMensual: renta, plazo: 1 }), params).rendimientoNeto - meta; };
		var lo = 0, hi = precio;
		if (f(lo) > 0) return 0;
		if (f(hi) < 0) return null;
		for (var k = 0; k < 200; k++) {
			var mid = (lo + hi) / 2;
			if (f(mid) < 0) lo = mid; else hi = mid;
			if (hi - lo < 1e-7) break;
		}
		return (lo + hi) / 2;
	}

	// Escenarios variando la renta en los porcentajes dados.
	function escenarios(inputs, deltas, params) {
		var d = deltas || [-10, 0, 10];
		var out = [];
		for (var k = 0; k < d.length; k++) {
			var renta = n(inputs && inputs.rentaMensual, 0) * (1 + d[k] / 100);
			var r = calcular(extend(inputs, { rentaMensual: renta }), params);
			out.push({ delta: d[k], rentaMensual: renta, netoMensual: r.netoMensual, neto: r.anio1.neto, rendimientoNeto: r.rendimientoNeto, tir: r.tir, resultado: r });
		}
		return out;
	}

	// Renta sugerida: la que da el cap rate de referencia del tipo (NOI ≈ renta × 12 × (1 − vacancia) × (1 − gastos)).
	function rentaSugerida(precio, tipo, inputs, params) {
		var cap = capReferencia(tipo, params);
		if (cap == null || !(precio > 0)) return null;
		var e = normalizar(extend(inputs || {}, { precio: precio, tipo: tipo }), params);
		var factor = (1 - e.vacancia / 100) * (1 - e.gastosOperativos / 100);
		return factor > 0 ? precio * cap / 100 / 12 / factor : null;
	}

	function locale(lang) { return lang === 'en' ? 'en-US' : 'es-GT'; }
	function dinero(v, moneda, lang, decimales) {
		if (v === null || v === undefined || !isFinite(v)) return '—';
		var prefijo = moneda === 'GTQ' ? 'Q' : 'US$';
		var dec = decimales || 0;
		var s = new Intl.NumberFormat(locale(lang), { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Math.abs(v));
		return (v < 0 ? '−' : '') + prefijo + ' ' + s;
	}
	function porcentaje(v, lang, decimales) {
		if (v === null || v === undefined || !isFinite(v)) return '—';
		var dec = decimales === undefined ? 1 : decimales;
		return new Intl.NumberFormat(locale(lang), { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v * 100) + ' %';
	}

	return {
		PARAMS: PARAMS,
		copiaParams: copiaParams,
		valores: valores,
		normalizar: normalizar,
		calcular: calcular,
		cascadaAnio: cascadaAnio,
		cascadaVenta: cascadaVenta,
		cascadaGanancia: cascadaGanancia,
		cascadaResumen: cascadaResumen,
		tir: tir,
		vpn: vpn,
		tasaIusi: tasaIusi,
		rentaParaRendimiento: rentaParaRendimiento,
		escenarios: escenarios,
		rentaSugerida: rentaSugerida,
		usoPorTipo: usoPorTipo,
		ivaPorDefecto: ivaPorDefecto,
		capReferencia: capReferencia,
		dinero: dinero,
		porcentaje: porcentaje
	};
});
