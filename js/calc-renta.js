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

	// Cada valor: { valor, etiqueta, unidad, grupo, fuente, confirmar }. Lista plana para editarla fácil en el panel.
	var PARAMS = {
		tipoCambio: { valor: 7.7, etiqueta: 'Tipo de cambio (Q por US$)', unidad: 'Q', grupo: 'General', fuente: 'Referencia de mercado; revisar el tipo de cambio de referencia del Banguat del día.', confirmar: true },

		iusiHabitacional: { valor: 0, etiqueta: 'IUSI uso habitacional', unidad: '‰', grupo: 'IUSI', fuente: LEY_IUSI + ': vivienda exenta.', confirmar: true },
		iusiMixto: { valor: 0, etiqueta: 'IUSI uso mixto', unidad: '‰', grupo: 'IUSI', fuente: LEY_IUSI + ': uso mixto exento.', confirmar: true },
		iusiTramo1Hasta: { valor: 2000, etiqueta: 'Comercial: exento hasta (valor fiscal)', unidad: 'Q', grupo: 'IUSI', fuente: LEY_IUSI + '. Tramos tomados de la ley anterior, por confirmar.', confirmar: true },
		iusiTramo2Hasta: { valor: 20000, etiqueta: 'Comercial: tramo 2 hasta', unidad: 'Q', grupo: 'IUSI', fuente: LEY_IUSI + '. Tramos tomados de la ley anterior, por confirmar.', confirmar: true },
		iusiTramo2Tasa: { valor: 3, etiqueta: 'Comercial: tasa tramo 2', unidad: '‰', grupo: 'IUSI', fuente: LEY_IUSI + '. La tasa del tramo se aplica a todo el valor (no es marginal).', confirmar: true },
		iusiTramo3Hasta: { valor: 70000, etiqueta: 'Comercial: tramo 3 hasta', unidad: 'Q', grupo: 'IUSI', fuente: LEY_IUSI + '. Tramos tomados de la ley anterior, por confirmar.', confirmar: true },
		iusiTramo3Tasa: { valor: 6, etiqueta: 'Comercial: tasa tramo 3', unidad: '‰', grupo: 'IUSI', fuente: LEY_IUSI + '. La tasa del tramo se aplica a todo el valor (no es marginal).', confirmar: true },
		iusiTramo4Tasa: { valor: 9, etiqueta: 'Comercial: tasa sobre el tramo 3', unidad: '‰', grupo: 'IUSI', fuente: LEY_IUSI + '. La tasa del tramo se aplica a todo el valor (no es marginal).', confirmar: true },

		isrCapitalTasa: { valor: 10, etiqueta: 'ISR rentas de capital: tasa', unidad: '%', grupo: 'ISR', fuente: LEY_ISR + ', art. 92 (tasa) y art. 84 (rentas de capital inmobiliarias).', confirmar: true },
		isrCapitalDeduccion: { valor: 30, etiqueta: 'ISR rentas de capital: deducción sin comprobar', unidad: '%', grupo: 'ISR', fuente: LEY_ISR + ': la base es la renta menos 30 %.', confirmar: true },
		isrSimplificadoTope: { valor: 30000, etiqueta: 'Régimen simplificado: tramo mensual', unidad: 'Q', grupo: 'ISR', fuente: LEY_ISR + ', régimen opcional simplificado sobre ingresos (mensual).', confirmar: true },
		isrSimplificadoTasa1: { valor: 5, etiqueta: 'Régimen simplificado: tasa hasta el tramo', unidad: '%', grupo: 'ISR', fuente: LEY_ISR + ', régimen opcional simplificado sobre ingresos.', confirmar: true },
		isrSimplificadoTasa2: { valor: 7, etiqueta: 'Régimen simplificado: tasa sobre el excedente', unidad: '%', grupo: 'ISR', fuente: LEY_ISR + ', régimen opcional simplificado sobre ingresos.', confirmar: true },
		isrUtilidadesTasa: { valor: 25, etiqueta: 'Régimen sobre utilidades: tasa', unidad: '%', grupo: 'ISR', fuente: LEY_ISR + ', régimen sobre las utilidades de actividades lucrativas.', confirmar: true },

		ivaGeneral: { valor: 12, etiqueta: 'IVA régimen general', unidad: '%', grupo: 'IVA', fuente: LEY_IVA + ', art. 10. Se cobra al inquilino encima de la renta.', confirmar: true },
		ivaPequeno: { valor: 5, etiqueta: 'IVA pequeño contribuyente', unidad: '%', grupo: 'IVA', fuente: LEY_IVA + ', régimen de pequeño contribuyente (sobre ingresos brutos).', confirmar: true },
		ivaPequenoLimite: { valor: 150000, etiqueta: 'Pequeño contribuyente: límite anual', unidad: 'Q', grupo: 'IVA', fuente: LEY_IVA + ': ingresos anuales máximos para el régimen.', confirmar: true },

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
	var IVA_POR_USO = { habitacional: 'exento', mixto: 'exento', comercial: 'general' };
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
	function copiaParams() {
		var o = {}, k, j;
		for (k in PARAMS) { o[k] = {}; for (j in PARAMS[k]) o[k][j] = PARAMS[k][j]; }
		return o;
	}

	function usoPorTipo(tipo) { return USO_POR_TIPO[tipo] || 'habitacional'; }
	function ivaPorUso(uso) { return IVA_POR_USO[uso] || 'exento'; }
	function capReferencia(tipo, params) {
		var key = CAP_POR_TIPO[tipo];
		return key ? valores(params)[key] : null;
	}

	// IUSI comercial: la tasa del tramo se aplica a todo el valor fiscal (no es marginal). Devuelve ‰.
	function tasaIusi(uso, valorFiscalQ, params) {
		var P = valores(params);
		if (uso === 'habitacional') return P.iusiHabitacional;
		if (uso === 'mixto') return P.iusiMixto;
		if (valorFiscalQ <= P.iusiTramo1Hasta) return 0;
		if (valorFiscalQ <= P.iusiTramo2Hasta) return P.iusiTramo2Tasa;
		if (valorFiscalQ <= P.iusiTramo3Hasta) return P.iusiTramo3Tasa;
		return P.iusiTramo4Tasa;
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
		return {
			tipo: tipo,
			precio: precio,
			moneda: moneda,
			rentaMensual: n(i.rentaMensual, 0),
			uso: uso,
			regimenISR: i.regimenISR || 'capital',
			regimenIVA: i.regimenIVA || ivaPorUso(uso),
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
			depreciacion: n(i.depreciacion, 0)
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
		var anios = [], acumulado = 0, flujos = [-e.precio], payback = null;

		function anio(t) {
			var pgi = e.rentaMensual * 12 * Math.pow(1 + g, t - 1);
			var cobrado = pgi * (1 - v);
			var opex = cobrado * e.gastosOperativos / 100;
			var capex = cobrado * e.reservaCapex / 100;
			var deducibles = opex + iusi + e.precio * e.depreciacion / 100;
			var isr = isrDelAnio(e, cobrado, deducibles, P, fx);
			var ivaPropietario = e.regimenIVA === 'pequeno' ? cobrado * P.ivaPequeno / 100 : 0;
			var ivaInquilino = e.regimenIVA === 'general' ? cobrado * P.ivaGeneral / 100 : 0;
			return {
				t: t, pgi: pgi, vacancia: pgi - cobrado, cobrado: cobrado, opex: opex, capex: capex, iusi: iusi,
				isr: isr, ivaPropietario: ivaPropietario, ivaInquilino: ivaInquilino,
				noi: cobrado - opex - iusi,
				neto: cobrado - opex - capex - iusi - isr - ivaPropietario
			};
		}

		for (var t = 1; t <= e.plazo; t++) {
			var a = anio(t);
			var antes = acumulado;
			acumulado += a.neto;
			if (payback === null && e.precio > 0 && a.neto > 0 && acumulado >= e.precio) payback = t - 1 + (e.precio - antes) / a.neto;
			a.acumulado = acumulado;
			a.reversion = 0;
			a.flujo = a.neto;
			anios.push(a);
		}
		var noiSalida = anio(e.plazo + 1).noi;
		var reversion = e.capSalida > 0 ? Math.max(0, noiSalida / (e.capSalida / 100) * (1 - e.costosVenta / 100)) : 0;
		var ultimo = anios[anios.length - 1];
		ultimo.reversion = reversion;
		ultimo.flujo = ultimo.neto + reversion;
		for (t = 0; t < anios.length; t++) flujos.push(anios[t].flujo);

		var a1 = anios[0];
		var avisos = [];
		if (e.tipo === 'terreno') avisos.push('terreno');
		if (e.regimenIVA === 'pequeno' && a1.cobrado * fx > P.ivaPequenoLimite) avisos.push('pequenoLimite');
		if (e.uso === 'mixto') avisos.push('mixtoIva');
		var laTir = e.precio > 0 ? tir(flujos) : null;
		if (laTir === null) avisos.push('tirNula');

		return {
			entradas: e,
			parametros: P,
			anios: anios,
			anio1: a1,
			iusiTasaMil: tasaMil,
			valorFiscalQ: e.valorFiscal,
			cobradoAnualQ: a1.cobrado * fx,
			netoMensual: a1.neto / 12,
			rendimientoBruto: e.precio > 0 ? e.rentaMensual * 12 / e.precio : null,
			rendimientoNeto: e.precio > 0 ? a1.neto / e.precio : null,
			capRate: e.precio > 0 ? a1.noi / e.precio : null,
			payback: payback,
			noiSalida: noiSalida,
			reversion: reversion,
			flujos: flujos,
			tir: laTir,
			vpn: vpn(e.tasaDescuento / 100, flujos),
			avisos: avisos
		};
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
		tir: tir,
		vpn: vpn,
		tasaIusi: tasaIusi,
		rentaParaRendimiento: rentaParaRendimiento,
		escenarios: escenarios,
		rentaSugerida: rentaSugerida,
		usoPorTipo: usoPorTipo,
		ivaPorUso: ivaPorUso,
		capReferencia: capReferencia,
		dinero: dinero,
		porcentaje: porcentaje
	};
});
