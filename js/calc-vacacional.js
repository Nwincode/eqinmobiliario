/* Renta vacacional por noches: precios, impuestos, fechas y calendario de Airbnb (iCal).
 * Un solo lugar para las fórmulas. Funciona igual que js/calc-renta.js:
 *  - en el sitio como script clásico (deja window.EQVacacional),
 *  - en el panel (import '/js/calc-vacacional.js' y luego window.EQVacacional),
 *  - en Node y en la función de Netlify (module.exports o globalThis.EQVacacional).
 * Sintaxis ES5 a propósito.
 *
 * Reglas:
 *  - cada noche tiene su costo del socio: precio base, precio de fin de semana (noches de viernes y
 *    sábado) o una tarifa por fechas (temporada, feriados). Prioridad: tarifa por fechas > fin de semana > base.
 *  - noche al público = costo del socio de esa noche × (1 + margen). El margen (20 %) es la ganancia
 *    de la empresa sobre la suma de todas las noches de la estancia.
 *  - subtotal = suma de las noches al público + limpieza (la limpieza no lleva margen).
 *  - impuestos sobre el subtotal: IVA 12 % + INGUAT 10 % (impuesto de turismo).
 *  - el depósito es reembolsable: va aparte y no lleva impuestos.
 *  - fechas como texto 'AAAA-MM-DD'. Una estancia [llegada, salida) ocupa las noches de llegada a
 *    salida − 1: el día de salida de una reserva puede ser el de llegada de la siguiente (como Airbnb). */
(function (root, factory) {
	var api = factory();
	if (typeof module === 'object' && module && module.exports) module.exports = api;
	if (root) root.EQVacacional = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
	'use strict';

	var IVA = 12;
	var INGUAT = 10;
	var MARGEN = 20;
	// La estancia más larga que se puede pedir: un solo número para el calendario, validarEstancia y firestore.rules
	// (reservaCotizada: noches <= 90). Más larga es otra cosa (renta mensual) y una solicitud de un año apartaría la casa.
	var MAX_NOCHES = 90;
	// Días después de la llegada en que el socio todavía puede decir «No me llegó» (después, su comisión cuenta como cobrada).
	var DIAS_NO_LLEGO = 3;
	var DIA = 86400000;
	// Los calendarios (iCal) que puede tener una casa, uno por plataforma: el campo en privado/socio, su nombre y su
	// columna en el importador. Airbnb sigue en «icalUrl» (el de siempre).
	var CALENDARIOS = [
		{ campo: 'icalUrl', nombre: 'Airbnb', columna: 'ical_airbnb' },
		{ campo: 'icalBooking', nombre: 'Booking', columna: 'ical_booking' },
		{ campo: 'icalVrbo', nombre: 'VRBO', columna: 'ical_vrbo' }
	];

	function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : 0; }
	// Redondeo a centavos sin errores de coma flotante (1.005 → 1.01).
	function r2(n) { return Math.round((Number(n) + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100; }

	function margenDe(v) {
		if (v === undefined || v === null || v === '') return MARGEN;
		var n = Number(v);
		return isFinite(n) && n >= 0 ? n : MARGEN;
	}

	// Precio por noche que ve el cliente (antes de impuestos).
	function nochePublica(precioSocio, margen) {
		return r2(num(precioSocio) * (1 + margenDe(margen) / 100));
	}

	// Desglose del panel: precio del socio, ganancia, noche al público e impuestos de una noche.
	function desgloseNoche(precioSocio, margen) {
		var socio = r2(num(precioSocio));
		var publica = nochePublica(socio, margen);
		var iva = r2(publica * IVA / 100);
		var inguat = r2(publica * INGUAT / 100);
		return { precioSocio: socio, margen: margenDe(margen), ganancia: r2(publica - socio), nochePublica: publica, iva: iva, inguat: inguat, impuestos: r2(iva + inguat), nocheConImpuestos: r2(publica + iva + inguat) };
	}

	// Cotización de una estancia. o = { precios: [precio de cada noche], limpieza, deposito }
	// o, si todas las noches cuestan igual, o = { nochePublica, noches, limpieza, deposito }.
	function cotizar(o) {
		var precios = o.precios ? o.precios.map(function (p) { return r2(num(p)); }) : null;
		var noches = precios ? precios.length : Math.max(0, Math.floor(Number(o.noches) || 0));
		var noche = precios ? (noches ? precios[0] : 0) : r2(num(o.nochePublica));
		var alojamiento = precios ? r2(precios.reduce(function (a, b) { return a + b; }, 0)) : r2(noche * noches);
		var uniforme = !precios || precios.every(function (p) { return p === noche; });
		var limpieza = noches ? r2(num(o.limpieza)) : 0;
		var subtotal = r2(alojamiento + limpieza);
		var iva = r2(subtotal * IVA / 100);
		var inguat = r2(subtotal * INGUAT / 100);
		var impuestos = r2(iva + inguat);
		return {
			noches: noches, noche: uniforme ? noche : 0, uniforme: uniforme, alojamiento: alojamiento, limpieza: limpieza, subtotal: subtotal,
			iva: iva, inguat: inguat, impuestos: impuestos, total: r2(subtotal + impuestos),
			deposito: r2(num(o.deposito))
		};
	}

	// El subtotal (sin impuestos) que se cotizó, sacado del total que vio el cliente (un chat de antes no lo trae): de los
	// subtotales al centavo que con estos impuestos dan ese total, el mayor (así nunca queda por debajo del cotizado).
	function subtotalDeTotal(total) {
		var t = r2(num(total)), base = Math.round(t / (1 + (IVA + INGUAT) / 100) * 100), mejor = null;
		for (var k = -3; k <= 3; k++) {
			var s = (base + k) / 100;
			if (s >= 0 && r2(s + r2(r2(s * IVA / 100) + r2(s * INGUAT / 100))) === t) mejor = s;
		}
		return mejor === null ? r2(t / (1 + (IVA + INGUAT) / 100)) : mejor;
	}

	// ---------------------------------------------------------------- Fechas
	// (Ida y vuelta: el navegador acepta «2029-02-30» y lo pasa al 2 de marzo; aquí no es una fecha.)
	function esFecha(s) { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; var t = Date.parse(s + 'T00:00:00Z'); return !isNaN(t) && new Date(t).toISOString().slice(0, 10) === s; }
	function aDia(s) { return Math.round(Date.parse(s + 'T00:00:00Z') / DIA); }
	function deDia(n) { return new Date(n * DIA).toISOString().slice(0, 10); }
	function sumarDias(s, n) { return deDia(aDia(s) + n); }
	// «Hoy» para todo lo de la renta por noche: la fecha de Guatemala (UTC−6 todo el año), la misma en el sitio,
	// el panel y las funciones, esté donde esté quien pregunta. Una sola: no se calcula en ningún otro lado.
	function hoy(ahora) { return new Date((ahora == null ? Date.now() : ahora) - 6 * 3600000).toISOString().slice(0, 10); }
	function nochesEntre(llegada, salida) {
		if (!esFecha(llegada) || !esFecha(salida)) return 0;
		return Math.max(0, aDia(salida) - aDia(llegada));
	}

	// Rangos válidos, ordenados y unidos (los que se tocan o se cruzan quedan en uno).
	function unirRangos(rangos) {
		var lista = (rangos || []).filter(function (r) {
			return r && esFecha(r.desde) && esFecha(r.hasta) && aDia(r.hasta) > aDia(r.desde);
		}).map(function (r) { return { desde: r.desde, hasta: r.hasta }; });
		lista.sort(function (a, b) { return a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0; });
		var out = [];
		lista.forEach(function (r) {
			var ult = out[out.length - 1];
			if (ult && r.desde <= ult.hasta) { if (r.hasta > ult.hasta) ult.hasta = r.hasta; } else out.push(r);
		});
		return out;
	}

	// Conjunto de noches ocupadas { 'AAAA-MM-DD': true } a partir de rangos [desde, hasta).
	function nochesOcupadas(rangos) {
		var set = {};
		unirRangos(rangos).forEach(function (r) {
			for (var d = aDia(r.desde), fin = aDia(r.hasta); d < fin; d++) set[deDia(d)] = true;
		});
		return set;
	}

	// Mínimo de noches de una estancia: el general de la casa o el mayor de las fechas especiales
	// (Navidad, Semana Santa…) que toque alguna de sus noches. minimos: [{ desde, hasta (incluida), noches }].
	function minimoNoches(llegada, salida, nochesMin, minimos) {
		var min = Math.max(1, Math.floor(Number(nochesMin) || 1));
		var ultima = sumarDias(salida, -1);
		(minimos || []).forEach(function (m) {
			// Uno con la fecha final antes de la inicial (dato malo) no vale.
			if (m && m.desde <= m.hasta && m.desde <= ultima && m.hasta >= llegada) min = Math.max(min, Math.floor(Number(m.noches) || 1));
		});
		return min;
	}
	// Quita las noches desde–hasta (incluidas) de una lista de rangos con 'hasta' incluido; parte los rangos
	// que queden a medias y conserva sus demás datos (precio, noches).
	function quitarRango(lista, desde, hasta) {
		var out = [];
		(lista || []).forEach(function (r) {
			if (!r || r.hasta < desde || r.desde > hasta) { if (r) out.push(r); return; }
			var copia = function (d, h) { var c = {}; for (var k in r) c[k] = r[k]; c.desde = d; c.hasta = h; return c; };
			if (r.desde < desde) out.push(copia(r.desde, sumarDias(desde, -1)));
			if (r.hasta > hasta) out.push(copia(sumarDias(hasta, 1), r.hasta));
		});
		return out;
	}

	// Libera las noches de llegada a salida (la salida no ocupa noche) en rangos [desde, hasta).
	function liberarNoches(rangos, llegada, salida) {
		var incluidos = (rangos || []).map(function (r) { return { desde: r.desde, hasta: sumarDias(r.hasta, -1) }; });
		return quitarRango(incluidos, llegada, sumarDias(salida, -1)).map(function (r) { return { desde: r.desde, hasta: sumarDias(r.hasta, 1) }; });
	}

	// Revisa una estancia. Devuelve { ok, noches, error, minimo } con error: 'fechas' | 'pasado' | 'orden' | 'minimo' | 'ocupada'.
	function validarEstancia(o) {
		var llegada = o.llegada, salida = o.salida;
		if (!esFecha(llegada) || !esFecha(salida)) return { ok: false, noches: 0, error: 'fechas' };
		if (o.hoy && llegada < o.hoy) return { ok: false, noches: 0, error: 'pasado' };
		var noches = nochesEntre(llegada, salida);
		if (noches < 1) return { ok: false, noches: 0, error: 'orden' };
		var ocupadas = o.ocupadas || {};
		for (var d = aDia(llegada), fin = aDia(salida); d < fin; d++) {
			if (ocupadas[deDia(d)]) return { ok: false, noches: noches, error: 'ocupada' };
		}
		var minimo = minimoNoches(llegada, salida, o.nochesMin, o.minimos);
		if (noches < minimo) return { ok: false, noches: noches, error: 'minimo', minimo: minimo };
		// El tope de las reglas de la base (firestore.rules reservaCotizada): una estancia más larga no se puede pedir.
		if (noches > MAX_NOCHES) return { ok: false, noches: noches, error: 'maximo', maximo: MAX_NOCHES };
		return { ok: true, noches: noches, error: '' };
	}

	// Última salida posible desde una llegada: el primer día ocupado después de la llegada
	// (ese día sí se puede salir). null si no hay límite.
	function salidaMaxima(llegada, ocupadas) {
		var claves = Object.keys(ocupadas || {}).filter(function (k) { return k > llegada; }).sort();
		return claves.length ? claves[0] : null;
	}

	// ---------------------------------------------------------------- Temporadas que se repiten cada año
	// Domingo de Pascua de un año (calendario gregoriano, método de Meeus/Jones/Butcher).
	function pascua(anio) {
		var a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4;
		var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
		var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
		var mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
		return anio + '-' + (mes < 10 ? '0' : '') + mes + '-' + (dia < 10 ? '0' : '') + dia;
	}
	// Semana Santa de un año: del Domingo de Ramos al Domingo de Pascua.
	function semanaSanta(anio) { var p = pascua(anio); return { desde: sumarDias(p, -7), hasta: p }; }
	// ¿El rango (con 'hasta' incluido) toca la Semana Santa del año en que empieza o en que termina?
	function tocaSemanaSanta(r) {
		if (!r || !esFecha(r.desde) || !esFecha(r.hasta)) return false;
		return [+r.desde.slice(0, 4), +r.hasta.slice(0, 4)].some(function (y) { var ss = semanaSanta(y); return r.desde <= ss.hasta && r.hasta >= ss.desde; });
	}
	// El mismo día y mes en otro año (el 29 de febrero, en un año sin él, es el 28).
	function mismoDia(iso, anio) {
		var md = iso.slice(5);
		if (md === '02-29' && !(anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0))) md = '02-28';
		return anio + '-' + md;
	}
	// Las mismas fechas en los `anios` años siguientes. cada = 'fecha' (mismo día y mes al empezar y al terminar; el 29 de
	// febrero pasa al 28) o 'semanaSanta' (los mismos días contados desde la Pascua de cada año, que cambia). Conserva los
	// demás datos (también `serie`) y anota `cada`. Devuelve solo las copias (sin el rango original).
	function repetirRango(r, cada, anios) {
		var out = [], largo = aDia(r.hasta) - aDia(r.desde), y0 = +r.desde.slice(0, 4);
		var desdePascua = aDia(r.desde) - aDia(pascua(y0));
		var saltoFin = +r.hasta.slice(0, 4) - y0; // un rango de fin de año termina el año siguiente
		for (var k = 1; k <= (anios || 1); k++) {
			var y = y0 + k, desde, hasta;
			if (cada === 'semanaSanta') { desde = sumarDias(pascua(y), desdePascua); hasta = sumarDias(desde, largo); }
			else { desde = mismoDia(r.desde, y); hasta = mismoDia(r.hasta, y + saltoFin); }
			var copia = {};
			for (var key in r) copia[key] = r[key];
			copia.desde = desde; copia.hasta = hasta; copia.cada = cada;
			out.push(copia);
		}
		return out;
	}

	// ---------------------------------------------------------------- Precio de cada noche
	// plan = { base, finde, tarifas: [{ desde, hasta, precio }] }. 'hasta' es la última noche de la
	// tarifa (incluida). Sirve igual para el plan del socio (privado) y para el plan público.
	function esFinde(fecha) { var d = new Date(aDia(fecha) * DIA).getUTCDay(); return d === 5 || d === 6; }
	function precioNoche(fecha, plan) {
		plan = plan || {};
		var tarifas = plan.tarifas || [];
		for (var i = tarifas.length - 1; i >= 0; i--) {
			var t = tarifas[i];
			if (t && esFecha(t.desde) && esFecha(t.hasta) && fecha >= t.desde && fecha <= t.hasta && num(t.precio)) return r2(num(t.precio));
		}
		if (num(plan.finde) && esFinde(fecha)) return r2(num(plan.finde));
		return r2(num(plan.base));
	}
	// Noches de una estancia: ['AAAA-MM-DD', …] de la llegada a la salida − 1.
	function nochesDe(llegada, salida) {
		var out = [];
		if (!esFecha(llegada) || !esFecha(salida)) return out;
		for (var d = aDia(llegada), fin = aDia(salida); d < fin; d++) out.push(deDia(d));
		return out;
	}
	// Plan público a partir del plan del socio: cada precio × (1 + margen). Solo precios y fechas.
	function planPublico(planSocio, margen) {
		planSocio = planSocio || {};
		return {
			base: nochePublica(planSocio.base, margen),
			finde: num(planSocio.finde) ? nochePublica(planSocio.finde, margen) : 0,
			tarifas: (planSocio.tarifas || []).filter(function (t) {
				return t && esFecha(t.desde) && esFecha(t.hasta) && t.hasta >= t.desde && num(t.precio);
			}).map(function (t) { return { desde: t.desde, hasta: t.hasta, precio: nochePublica(t.precio, margen) }; })
		};
	}
	// Precio "desde": la noche más barata del plan (sin contar tarifas que ya pasaron si se da 'hoy').
	function precioDesde(plan, hoy) {
		plan = plan || {};
		var lista = [num(plan.base), num(plan.finde)];
		(plan.tarifas || []).forEach(function (t) { if (t && (!hoy || t.hasta >= hoy)) lista.push(num(t.precio)); });
		lista = lista.filter(function (n) { return n > 0; });
		return lista.length ? r2(Math.min.apply(Math, lista)) : 0;
	}
	// Cotización completa de una estancia con el plan público.
	// o = { plan, llegada, salida, limpieza, deposito } → cotizar() + detalle [{ fecha, precio }].
	function cotizarEstancia(o) {
		var detalle = nochesDe(o.llegada, o.salida).map(function (f) { return { fecha: f, precio: precioNoche(f, o.plan) }; });
		var c = cotizar({ precios: detalle.map(function (n) { return n.precio; }), limpieza: o.limpieza, deposito: o.deposito });
		c.detalle = detalle;
		return c;
	}
	// Para el panel: costo del socio, ganancia y precio al público de una estancia.
	// La ganancia es el margen sobre la suma del costo de todas las noches.
	function gananciaEstancia(o) {
		var dias = nochesDe(o.llegada, o.salida);
		var costo = r2(dias.reduce(function (a, f) { return a + precioNoche(f, o.planSocio); }, 0));
		var pub = planPublico(o.planSocio, o.margen);
		var alojamiento = r2(dias.reduce(function (a, f) { return a + precioNoche(f, pub); }, 0));
		return { noches: dias.length, costoSocio: costo, ganancia: r2(alojamiento - costo), alojamiento: alojamiento };
	}

	// ---------------------------------------------------------------- Reservas (panel)
	// Una reserva: { id, propertyId, llegada, salida, estado, costoSocio, alojamiento, pagadoSocio, moneda }.
	// Solo las confirmadas ocupan fechas y cuentan en el estado de cuenta del propietario.
	function confirmada(r) { return r && r.estado === 'confirmada' && esFecha(r.llegada) && esFecha(r.salida) && r.salida > r.llegada; }

	// Reservas confirmadas de la misma casa que se cruzan con esta (la salida no ocupa noche).
	function choquesReserva(reserva, lista) {
		return (lista || []).filter(function (r) {
			return confirmada(r) && r.id !== reserva.id && r.propertyId === reserva.propertyId
				&& r.llegada < reserva.salida && reserva.llegada < r.salida;
		});
	}

	// Fechas que las reservas confirmadas de una casa bloquean en el calendario público.
	function rangosReservados(lista, propertyId) {
		return unirRangos((lista || []).filter(function (r) { return confirmada(r) && r.propertyId === propertyId; })
			.map(function (r) { return { desde: r.llegada, hasta: r.salida }; }));
	}

	// Un lead que es una solicitud de reserva por noche: lo atiende Solicitudes (con su chat), no es un interesado del
	// CRM: no cuenta en «Leads sin atender», ni en Reportes, ni en el resumen diario, ni crea un cliente.
	function esSolicitudReserva(l) { return Boolean(l && l.reserva); }

	// Un cambio de reserva (crear, editar, cancelar, borrar) en UNA casa: las fechas que quedan reservadas y el choque,
	// si lo hay. La fuente son las reservas (leídas en ese momento), no la lista vieja de una pestaña.
	//  o = { guardadas: lo que tiene la casa ahora, reservas: las que quien cambia puede leer de esa casa,
	//        antes: la reserva como estaba (null si es nueva), despues: como queda (null si se borra),
	//        propertyId, completas: true si `reservas` son TODAS las de la casa (el administrador) }.
	// Quien no las ve todas (el socio no lee las de antes sin propietarioId; el asesor, solo las suyas) parte de lo
	// guardado: quita solo las noches de esta reserva y suma las confirmadas que ve; así no libera fechas ajenas.
	function cambioDeReserva(o) {
		var pid = o.propertyId, antes = o.antes || null, despues = o.despues || null;
		var id = (despues || antes || {}).id;
		var lista = (o.reservas || []).filter(function (r) { return r && r.id !== id; }).concat(despues ? [despues] : []);
		var base = unirRangos(o.guardadas);
		if (antes && confirmada(antes) && antes.propertyId === pid) base = liberarNoches(base, antes.llegada, antes.salida);
		var reservadas = o.completas ? rangosReservados(lista, pid) : unirRangos(base.concat(rangosReservados(lista, pid)));
		var choque = null;
		if (despues && confirmada(despues) && despues.propertyId === pid) {
			choque = choquesReserva(despues, lista)[0] || null;
			// Quien no ve todas: también choca con lo guardado que no es de esta reserva.
			if (!choque && !o.completas) {
				var r = base.filter(function (x) { return x.desde < despues.salida && despues.llegada < x.hasta; })[0];
				if (r) choque = { llegada: r.desde, salida: r.hasta };
			}
		}
		return { reservadas: reservadas, choque: choque };
	}

	// Estado de cuenta: reservas, noches y, por moneda, lo que toca al propietario y la ganancia.
	function resumenReservas(lista) {
		var out = { reservas: 0, noches: 0, porMoneda: {} };
		(lista || []).filter(confirmada).forEach(function (r) {
			var m = out.porMoneda[r.moneda || 'USD'] || (out.porMoneda[r.moneda || 'USD'] = { costoSocio: 0, pagado: 0, porPagar: 0, ganancia: 0 });
			var costo = Number(r.costoSocio) || 0;
			out.reservas++;
			out.noches += nochesEntre(r.llegada, r.salida);
			m.costoSocio = r2(m.costoSocio + costo);
			m[r.pagadoSocio ? 'pagado' : 'porPagar'] = r2(m[r.pagadoSocio ? 'pagado' : 'porPagar'] + costo);
			m.ganancia = r2(m.ganancia + (Number(r.alojamiento) || 0) - costo);
		});
		return out;
	}

	// ---------------------------------------------------------------- iCal (Airbnb, Booking…)
	// Devuelve solo fechas: [{ desde, hasta }]. No guarda nombres ni descripciones.
	function fechaIcal(valor) {
		var m = /^(\d{4})(\d{2})(\d{2})/.exec(String(valor || '').trim());
		return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
	}
	function parseICal(texto) {
		var lineas = String(texto || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
		var out = [];
		var ev = null;
		lineas.forEach(function (l) {
			if (/^BEGIN:VEVENT/i.test(l)) { ev = {}; return; }
			if (/^END:VEVENT/i.test(l)) {
				if (ev && ev.desde) {
					var hasta = ev.hasta && ev.hasta > ev.desde ? ev.hasta : sumarDias(ev.desde, 1);
					out.push({ desde: ev.desde, hasta: hasta });
				}
				ev = null;
				return;
			}
			if (!ev) return;
			var m = /^(DTSTART|DTEND)(;[^:]*)?:(.*)$/i.exec(l);
			if (!m) return;
			var f = fechaIcal(m[3]);
			if (!esFecha(f)) return;
			if (m[1].toUpperCase() === 'DTSTART') ev.desde = f; else ev.hasta = f;
		});
		return unirRangos(out);
	}

	// El calendario de EQ para Airbnb, Booking y VRBO (netlify/functions/calendario.mjs): un evento de día completo por
	// estancia [desde, hasta), sin nombres ni datos del huésped. `id`: lo que distingue a cada evento (la reserva).
	// `sello`: AAAAMMDDTHHMMSSZ de ahora. Lo lee parseICal (prueba de ida y vuelta en scripts/test-vacacional.mjs).
	function aICal(estancias, sello) {
		var sin = function (f) { return String(f).replace(/-/g, ''); };
		var lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Equipo Inmobiliario//Reservas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
		(estancias || []).filter(function (e) { return e && esFecha(e.desde) && esFecha(e.hasta) && e.hasta > e.desde; }).forEach(function (e, i) {
			lineas.push('BEGIN:VEVENT', 'UID:' + String(e.id || i).replace(/[^A-Za-z0-9_-]/g, '') + '@eqinmobiliario.gt', 'DTSTAMP:' + sello,
				'DTSTART;VALUE=DATE:' + sin(e.desde), 'DTEND;VALUE=DATE:' + sin(e.hasta), 'SUMMARY:Reservado (Equipo Inmobiliario)', 'TRANSP:OPAQUE', 'END:VEVENT');
		});
		lineas.push('END:VCALENDAR');
		return lineas.join('\r\n') + '\r\n';
	}

	// Comisión de una reserva confirmada: el socio la paga a EQ el día de llegada (hora de Guatemala, UTC−6).
	// 0 al día (o nada que cobrar) · 1 vencida · 2 más de 24 h (sus clientes escriben a EQ) · 3 más de 72 h (sus casas salen del sitio).
	// Horas que lleva vencida la comisión de una reserva (desde el fin del día de llegada); null si no hay nada que cobrar.
	function horasAtrasoComision(r, ahora) {
		var c = r && r.comision;
		if (!c || c.pagada || r.estado !== 'confirmada' || !num(c.monto) || !esFecha(c.vence)) return null;
		return (ahora - (Date.parse(c.vence + 'T00:00:00-06:00') + DIA)) / 3600000;
	}
	function nivelComision(r, ahora) {
		var horas = horasAtrasoComision(r, ahora);
		return horas === null || horas < 0 ? 0 : horas < 24 ? 1 : horas < 72 ? 2 : 3;
	}
	// El peor atraso de cada socio: { propietarioId: 2 | 3 }.
	// ¿Esta comisión puede castigar al socio (casas fuera del sitio a las 72 h, permisos apagados a los 7 días)? Cuando se
	// sabe que el cliente pagó o ya no hay cómo saberlo de otra forma:
	//  - «Pago recibido» (pagoRecibido en la reserva; las de antes, su chat «pagada»: chatPagado, que pone quien lee el chat);
	//  - el cliente mandó su comprobante y sigue en pie (chatComprobante: comprobanteVigente, también lo pone quien lee el chat);
	//  - «Cobrar comisión» del equipo desde la alerta de cada mañana;
	//  - sigue confirmada pasados DIAS_NO_LLEGO días de la llegada: el socio ya no puede decir «No me llegó», así que no
	//    marcar nada no lo libra del castigo;
	//  - una reserva sin chat (a mano o de antes) cuenta como siempre.
	function cobrablePorPrueba(r) {
		return Boolean(r && (r.pagoRecibido || r.chatPagado || r.chatComprobante || (r.comision && r.comision.cobrar) || !r.chat));
	}
	// El último día en que el socio todavía puede decir «No me llegó» (y desde el siguiente, cobrable sin prueba).
	function ultimoDiaNoLlego(r) { return esFecha(r && r.llegada) ? sumarDias(r.llegada, DIAS_NO_LLEGO) : ''; }
	function cobrable(r, ahora) {
		if (!r) return false;
		if (cobrablePorPrueba(r)) return true;
		return r.estado === 'confirmada' && esFecha(r.llegada) && hoy(ahora === undefined ? Date.now() : ahora) > ultimoDiaNoLlego(r);
	}
	// Horas de atraso que castigan: con una prueba de pago, desde que vence (horasAtrasoComision); cobrable solo por el
	// tiempo, desde que dejó de poder decir «No me llegó» (el fin de ultimoDiaNoLlego): así no salta de golpe a 72 h.
	// null si no castiga.
	// ¿Hay que leer su chat para saber si castiga? Cuando la reserva no trae su propia prueba (cobrablePorPrueba) y la
	// comisión ya venció: el chat dice si se marcó «pagada» o si el cliente mandó su comprobante (conDatosDelChat en
	// admin/js/reservas-calculo.js). La misma condición para la pausa (netlify/lib/comisiones.mjs) y el corte de
	// permisos (admin/js/permisos-socio.js faltaSaberSiPago): así el servidor y el panel cuentan lo mismo cada día.
	function faltaLeerChat(r, ahora) {
		if (!r || !r.chat || cobrablePorPrueba(r)) return false;
		var horas = horasAtrasoComision(r, ahora);
		return horas !== null && horas >= 0;
	}
	function horasMora(r, ahora) {
		var horas = horasAtrasoComision(r, ahora);
		if (horas === null || !cobrable(r, ahora)) return null;
		if (cobrablePorPrueba(r)) return horas;
		return Math.min(horas, (ahora - (Date.parse(ultimoDiaNoLlego(r) + 'T00:00:00-06:00') + DIA)) / 3600000);
	}
	// El nivel de atraso que castiga: el de horasMora si es cobrable; si no, a lo más «vencida» (1).
	function nivelMora(r, ahora) {
		if (!cobrable(r, ahora)) return Math.min(nivelComision(r, ahora), 1);
		var horas = horasMora(r, ahora);
		return horas === null || horas < 0 ? 0 : horas < 24 ? 1 : horas < 72 ? 2 : 3;
	}
	function sociosEnMora(reservas, ahora) {
		var out = {};
		(reservas || []).forEach(function (r) {
			var n = nivelMora(r, ahora);
			if (n >= 2 && r.propietarioId) out[r.propietarioId] = Math.max(n, out[r.propietarioId] || 0);
		});
		return out;
	}

	// Alerta de una solicitud para el administrador: 'tarde' (sin responder en 2 h), 'mora' (comisión con
	// más de 72 h) o 'bloqueada' (dijeron que no se dio y esas fechas están bloqueadas en el calendario).
	var PLAZO_RESPUESTA = 2 * 3600000;
	function alertaSolicitud(estado, creado, fechas, reserva, bloqueos, ahora) {
		if (estado === 'pendiente') return ahora - creado > PLAZO_RESPUESTA ? 'tarde' : '';
		if (estado === 'confirmada') return nivelMora(reserva, ahora) === 3 ? 'mora' : '';
		if (estado !== 'no') return '';
		return (bloqueos || []).some(function (b) { return b.desde < fechas.salida && b.hasta > fechas.llegada; }) ? 'bloqueada' : '';
	}

	// ¿El texto trae un teléfono, un correo o un enlace? Un solo filtro para el chat de la reserva y para lo que el dueño
	// escribe de su casa y sale publicado (admin/js/mi-casa.js): no se pasan por aquí;
	// antes, nadie los pasa. Fechas, años («2019/2020»), horas («a las 1430»), montos con su moneda o su unidad («3450
	// quetzales», «2500 pies», «350 de limpieza», «1100 entre semana»), cuentas («1500 + 350», «3 x 450 = 1350») y medidas
	// («1200 / 1500 m²») no cuentan como teléfono; los números escritos con letras sí, y también unas coordenadas (llevan
	// a la casa, que es privada hasta el pago), una página corta (t.me/villa, Bit.Ly/x, casa.lago.me), correos y usuarios
	// disfrazados («juan at gmail dot com», «ig casalago_gt»), un número partido en dos («5555 y luego 1234», «5555 + 1234»)
	// y un monto que en realidad es un teléfono («Q 5555 1234»).
	// LA MISMA LISTA corre en firestore.rules (función tieneContacto, escrita por scripts/reglas-contacto.mjs desde aquí;
	// `npm test` revisa que esté al día y scripts/emulador/test-reglas.mjs pasa el mismo corpus por las dos): por eso solo
	// usa lo que entienden las dos (sin «lookahead», sin funciones al reemplazar, sin NFKC: el ancho completo «５»,
	// «＠» o «ｗｗｗ» cuenta como contacto; las cifras de otras escrituras, «٥» o «⑤», como dígitos).
	// pasos: ['si', patrón] → contacto si aparece; ['cambia', patrón, por] → reemplaza todo lo que aparece.
	//   'crudo': en el texto tal como llegó; el resto, en minúsculas.
	var UNIDAD = '(pies|pie|ft|varas|vara|metros|metro|mts|km|kms|kil[oó]metros|kilos|kilo|kg|kgs|lbs|libras|quetzales|d[oó]lares|usd|gtq|noches|noche|semanas|semana|meses|mes|d[ií]as|d[ií]a|horas|hora|hrs|hr|personas|adultos|ni[ñn]os|hu[eé]spedes|habitaciones|cuartos|camas|ba[ñn]os|parqueos|de limpieza|de dep[oó]sito|de terreno|de construcci[oó]n|entre semana|fin de semana|la noche|por noche|cada una|cada uno|cada noche|al mes|en total|total)';
	var LETRA = 'a-záéíóúñü';
	// Un usuario de otra plataforma o de un correo: con la forma de uno (lleva cifras, punto o guion bajo: «villa.lago»,
	// «ana_88», «anaperez90»). Una palabra de diccionario no («Mi correo es obligatorio», «Mi whatsapp es lento»); en una
	// red social (REDES), una palabra pura sí cuenta donde no cabe otra cosa («mi insta es villalago», «ig juanlago»: el paso
	// que sigue al de los usuarios). LARGO: una palabra pegada y larga, que solo cuenta
	// donde nada más cabe (después de «búscame como», un mensaje que es solo «villalago en insta»).
	var USUARIO = '([a-z][a-z0-9]*([._][a-z0-9]|[0-9])[a-z0-9._]*)';
	var LARGO = '[a-z]{8,}';
	var REDES = '(ig|insta|instagram|tiktok|facebook|fb|telegram|tg)';
	var RED_O_CORREO = 'gmail|hotmail|outlook|yahoo|icloud|correo|mail|email|e-mail|skype|ig|fb|insta|instagram|facebook|telegram|tg|signal|tiktok|whatsapp|wa'
		+ '|snap|snapchat|wechat|discord|viber|threads|twitter';
	var CORREOS = '(gmail|hotmail|outlook|yahoo|icloud)';
	// Palabras que dicen «esto es un teléfono»: una fecha junto a ellas no se lee como fecha («tel 2020-12-31»). De «escribir»
	// y «contactar», solo el imperativo dirigido («escríbeme», «contáctanos», «text me»), no «te escribo el 20/12».
	var IMPERATIVO = 'escr[ií]beme|escr[ií]bime|escr[ií]benos|escr[ií]binos|cont[aá]ctame|cont[aá]ctanos|text me|write me|reach me|contact me';
	var PALABRA_TEL = '(tel|tel[eé]fono|cel|celular|m[oó]vil|fijo|ll[aá]m[a-z]*|whats[a-z]*|wsp|wa|wasap|n[uú]mero|number|phone|call|mobile|cell|' + IMPERATIVO + ')';
	// Un sustantivo que anuncia un número («cel 22:00-12:30», «contacto 22:55 12:34»): lo que va pegado a él (sin palabras en
	// medio) no es un horario.
	var SUST_TEL = '(tel|tel[eé]fono|cel|celular|m[oó]vil|fijo|whats[a-z]*|wsp|wa|wasap|n[uú]mero|number|phone|mobile|cell|contacto|contact)';
	// Lo que puede ir entre el sustantivo y el número: signos, o «es», «is», «el», «al», «a las», «at» («mi cel es el …»).
	var TRAS_SUST = '([^0-9a-z' + 'áéíóúñü' + '\\n]{0,5}|[ \\t:]*((es|is|son)[ \\t]+)?((el|al|a las|at|del)[ \\t]+)?)';
	// Las que no dejan duda (sin «número», que también es de una boleta o una referencia).
	var TEL_CLARO = '(tel|tel[eé]fono|cel|celular|m[oó]vil|fijo|ll[aá]m[a-z]*|whats[a-z]*|wsp|wasap|phone|call|mobile|cell)';
	// <codigos-pais> Lo escribe scripts/reglas-contacto.mjs desde admin/js/formato.js CODIGOS_PAIS (largos de libphonenumber): no se edita a mano.
	var CON_CODIGO = '502([0-9]{8}|18[01][0-9]{8}|19[0-9]{9})|1([0-9]{10})|52([0-9]{10})|503([0-9]{8}|[89]00[0-9]{4}([0-9]{4})?)|504([0-9]{8}|8002[0-9]{7})|505([0-9]{8})|506([0-9]{8}|800[0-9]{7}|90[059][0-9]{7})|507([0-9]{7,8}|800[0-9]{4,5}|(00800|800[0-9])[0-9]{6})|501([0-9]{7}|0800[0-9]{7})|57([0-9]{10}|1800[0-9]{7}|19(0[01]|4[78])[0-9]{7})|34([0-9]{9})|44([0-9]{9,10}|800[0-9]{4})|49([0-9]{4,15})|33([0-9]{9})|39([0-9]{6,12})|31([0-9]{9}|140[0-9]{2,3}|800[0-9]{4,7}|90[069][0-9]{4,7}|970[0-9]{8})|54([0-9]{10,11})|56([0-9]{9}|(123|800)[0-9]{8}|600[0-9]{7,8})|55([0-9]{10,11}|300[0-9]{5}|4(00[0-9]|020|370)[0-9]{4}|[3589]00[0-9]{6,7})|972([0-9]{8,9}|1[0-9]{6,11})|61([0-9]{9}|1[0-9]{3,9})';
	var CODIGOS = '502|52|503|504|505|506|507|501|57|34|44|49|33|39|31|54|56|55|972|61';
	var SEGUIDOS = '2010 ?[-/,] ?2011|2011 ?[-/,] ?2012|2012 ?[-/,] ?2013|2013 ?[-/,] ?2014|2014 ?[-/,] ?2015|2015 ?[-/,] ?2016|2016 ?[-/,] ?2017|2017 ?[-/,] ?2018|2018 ?[-/,] ?2019|2019 ?[-/,] ?2020|2020 ?[-/,] ?2021|2021 ?[-/,] ?2022|2022 ?[-/,] ?2023|2023 ?[-/,] ?2024|2024 ?[-/,] ?2025|2025 ?[-/,] ?2026|2026 ?[-/,] ?2027|2027 ?[-/,] ?2028|2028 ?[-/,] ?2029|2029 ?[-/,] ?2030|2030 ?[-/,] ?2031|2031 ?[-/,] ?2032|2032 ?[-/,] ?2033|2033 ?[-/,] ?2034|2034 ?[-/,] ?2035|2035 ?[-/,] ?2036';
	// </codigos-pais>
	// Los años de una fecha de reserva: del año pasado a dentro de 3, con el reloj del navegador. En el patrón va la marca
	// ANIOS_MARCA: se cambia por esos años al usarlo, y scripts/reglas-contacto.mjs la cambia en la regla por los del año de
	// la base (request.time), uno más hacia adelante. Así no hay que escribir los años cada enero.
	var ANIOS_MARCA = '§ANIOS§';
	// (Del año pasado a dentro de 4; la regla, de y−2 a y+5: con el reloj del teléfono un año corrido, el navegador nunca
	// deja pasar una fecha que la regla rechace.)
	function aniosCercanos() { var y = new Date().getUTCFullYear(); return [y - 1, y, y + 1, y + 2, y + 3, y + 4].join('|'); }
	var ANIOS = ANIOS_MARCA;
	// Una fecha de reserva, por su forma: completa con un año cercano (ANIOS) y separador, o dos años seguidos. Una hora
	// (00:00 a 23:59) y un día/mes sin año («20/12», sin otra «/» y cifras detrás) también se leen por su forma, pero no las
	// protege una palabra de teléfono (es normal escribir «llámame a las 22:00»).
	var FECHA = '((' + ANIOS + ')-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])|(0?[1-9]|[12][0-9]|3[01])[/.-](0?[1-9]|[12][0-9]|3[01])[/.-](' + ANIOS + ')|' + SEGUIDOS + ')';
	// Un día/mes en los dos órdenes («24/12», «12/24»).
	// (Una sola forma, sin dos caminos para «1/1»: con dos, una secuencia larga tardaba segundos —«1/1-» × 24—.)
	var DM = '(0?[1-9]|[12][0-9]|3[01])/(0?[1-9]|[12][0-9]|3[01])';
	var HORA_O_DIA = '(([01]?[0-9]|2[0-3]):[0-5][0-9]|' + DM + '([^/0-9]|$))';
	// Dos horas seguidas y una no es «redonda» (:00, :15, :30, :45): con una palabra de teléfono cerca, un número partido
	// («escríbeme al 21:12 y 23:45»); «llámame entre 14:00 y 16:00» sí es un horario.
	var HORA = '([01]?[0-9]|2[0-3]):[0-5][0-9]', HORA_RARA = '([01]?[0-9]|2[0-3]):(0[1-9]|1[0-46-9]|2[0-9]|3[1-9]|4[0-46-9]|5[0-9])';
	var DOS_HORAS = '(' + HORA + '[ \\t]*(y|e|and|-|–|,|a las|a)?[ \\t]*' + HORA_RARA + '|' + HORA_RARA + '[ \\t]*(y|e|and|-|–|,|a las|a)?[ \\t]*' + HORA + ')';
	// Una secuencia de días/mes y horas («24/12 14:30», «24/12, 25/12 y 1/1», «22:00 - 07:00», «20/12 a las 15:00»): cada
	// elemento es un día/mes (con su hora, si va pegada) o una hora, y entre dos va un conector de verdad (dos horas con solo un
	// espacio en medio no se juntan: «22:55 12:34» es un número).
	var TOK = '(' + DM + '|' + HORA + ')';
	var ELEM = '(' + DM + '([ \\t]+' + HORA + ')?|' + HORA + ')';
	var UNE = '[ \\t]*(,|y|e|o|or|a las|a|al|at|-|–|and|to|hasta)[ \\t]*';
	var SEP = '([ \\t]*(,|y|e|o|a las|a|al|-|–|and|to|hasta)[ \\t]*|[ \\t]+)';
	// La forma de un grupo de 4 cifras: A empieza de 2 a 7 (como la mitad de un celular de Guatemala), R igual pero
	// redondo (termina en 00 o 50: un monto), B y C los demás (C redondo). NR: uno que no es redondo.
	var G = { R: '[2-7][0-9](00|50)', A: '[2-7][0-9]{3}', C: '[0189][0-9](00|50)', B: '[0-9]{4}', NR: '[0-9]{2}([0-9][1-9]|[1-46-9]0)', AN: '[2-7][0-9]([0-9][1-9]|[1-46-9]0)' };
	// Los cuatro pasos que marcan un grupo (N) con su forma (#X#), del más específico al más general.
	function marcas(patron, por) {
		return ['R', 'A', 'C', 'B'].map(function (x) { return ['cambia', patron.replace('N', G[x]), por.replace('X', x)]; });
	}
	// Cada búsqueda («si») dice qué parece (el cuarto dato): el aviso le dice al cliente qué parte parece contacto.
	var FILTRO_CONTACTO = [
		// Ancho completo y puntos de otras escrituras: nadie los escribe sin querer disfrazar algo.
		['si', '[０-９Ａ-Ｚａ-ｚ＠．。｡：／﹫]', 'crudo', 'raro'],
		['si', '[a-z]AT[a-z]+DOT[a-z]', 'crudo', 'correo'],
		// 1. Se normaliza sin quitar nada que se lea: fuera lo invisible (anchos cero, guion suave, marcas de dirección,
		// marcas combinadas como el acento suelto o el «⃣» de 5️⃣), todo espacio raro es un espacio (y un salto de línea
		// también: «ig:» en una línea y el usuario en la otra es lo mismo), las letras cirílicas y griegas que parecen
		// latinas son latinas, y las cifras disfrazadas son cifras (una «o», «l» o «I» entre números; superíndices junto a
		// cifras; otras escrituras, «٥», «⑤», «𝟓»; las escritas con letras: cada una vale 5).
		['cambia', '[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFE00-\uFE0F\uFEFF\\p{M}]', ''],
		['cambia', '[\\p{Z}\\t\\r\\n\u0085]+', ' '],
		// (Con sus mayúsculas: lower() de las reglas no las pasa a minúscula; tampoco la «İ».)
		['cambia', '[аαАΑ]', 'a'], ['cambia', '[еεёЕΕЁ]', 'e'], ['cambia', '[оοσОΟ]', 'o'], ['cambia', '[рρРΡ]', 'p'], ['cambia', '[сС]', 'c'], ['cambia', '[уγУ]', 'y'],
		['cambia', '[хχХΧ]', 'x'], ['cambia', '[іιӏІΙӀİ]', 'i'], ['cambia', '[јЈ]', 'j'], ['cambia', '[ѕЅ]', 's'], ['cambia', '[кκКΚ]', 'k'], ['cambia', '[тτТΤ]', 't'],
		['cambia', '[νΝ]', 'v'], ['cambia', '[мМΜ]', 'm'], ['cambia', '[нНΗ]', 'h'], ['cambia', '[вВΒ]', 'b'], ['cambia', '[ԁ]', 'd'], ['cambia', '[ɡ]', 'g'], ['cambia', '[ΖZ]', 'z'],
		['cambia', '🔟', '55'],
		['cambia', '[0-9]o[0-9]', '555'], ['cambia', '[0-9]o[0-9]', '555'], ['cambia', '[0-9][ \\t]?[li][0-9]', '555'], ['cambia', '[0-9][ \\t]?[li][0-9]', '555'],
		['cambia', '[0-9⁰⁴-⁹₀-₉][¹²³]|[¹²³][0-9⁰⁴-⁹¹²³₀-₉]', '55'], ['cambia', '[0-9⁰⁴-⁹₀-₉][¹²³]|[¹²³][0-9⁰⁴-⁹¹²³₀-₉]', '55'],
		['cambia', '[^\\P{N}0-9²³¹]', '5'],
		// Las fechas, horas y días/meses se leen por su forma (antes de pasar los números en palabras a cifras: «phone» lleva
		// «one»), salvo que tengan delante un código de país, «+» o «00» («whatsapp +502 23-12-2025»), o una fecha completa
		// tenga cerca una palabra de teléfono, aunque haya un código en medio («tel 502 2026-12-31», «2025-2026 es mi fijo»).
		// Es la única excepción que se aplica antes de buscar teléfonos.
		['si', '((\\+|(^|[^0-9:.,/-])00)[ \\t]*\\(?[0-9]{0,4}\\)?|(^|[^0-9:.,/-])\\(?(' + CODIGOS + ')\\)?)[ \\t.-]*(' + FECHA + '|' + HORA_O_DIA + ')'
			+ '|\\b' + PALABRA_TEL + '\\b[^0-9\\n]{0,15}(\\+?[0-9]{1,4}([ \\t.-]|\\(|\\))*)?' + FECHA + '|' + FECHA + '[^0-9\\n]{0,15}\\b' + PALABRA_TEL + '\\b', 0, 'telefono'],
		['si', '\\b' + PALABRA_TEL + '\\b[^0-9\\n]{0,15}' + DOS_HORAS
			// Un sustantivo de teléfono con lo que no es un horario: una hora no redonda entre las primeras tres («cel 22/12 a las
			// 12:31», «wa 22:12 y 12:31»), dos días/mes en lista («mi número es 22/12 y 12/31») o dos horas sin rango («cel 22:00
			// 12:30»). Un rango de horas redondas o de días pegado al sustantivo es un horario y pasa («Celular 8:00-17:00»,
			// «Contacto: 24/12 – 26/12»).
			+ '|\\b' + SUST_TEL + '\\b' + TRAS_SUST + '(' + TOK + SEP + '){0,2}' + HORA_RARA
			+ '|\\b' + SUST_TEL + '\\b' + TRAS_SUST + DM + '([ \\t]*(,|y|e|and)[ \\t]*|[ \\t]+)' + DM
			+ '|\\b' + SUST_TEL + '\\b' + TRAS_SUST + HORA + '([ \\t]*(,|y|e|and)[ \\t]*|[ \\t]+)' + HORA
			// Una palabra de teléfono con un día/mes y una hora no redonda («llámame el 22/12 12:31»), o con 4 cifras sueltas (no
			// un año cercano: «llámame en 2027 el 24/12») y una hora o un día/mes detrás («mi cel 5555 hasta 12:34»).
			+ '|\\b' + PALABRA_TEL + '\\b[^0-9\\n]{0,15}' + DM + '[ \\t,]+((a las|at)[ \\t]+)?' + HORA_RARA
			// …o un día/mes y 4 cifras («llámame 22/12 y 1231»), o tres o más días/mes seguidos («llámame 2/2 1/2 3/1»).
			+ '|\\b' + PALABRA_TEL + '\\b[^0-9\\n]{0,15}' + DM + SEP + '[0-9]{4}([^0-9]|$)'
			+ '|\\b' + PALABRA_TEL + '\\b[^0-9\\n]{0,15}' + DM + '(' + SEP + DM + '){2,11}'
			+ '|\\b' + PALABRA_TEL + '\\b[^0-9\\n]{0,15}([013-9][0-9]{3}|2[1-9][0-9]{2}|20[0-14-9][0-9])[ \\t,.-]*((a las|las|y|e|hasta|to|el|del|a|al|and|at)[ \\t]+)?' + TOK, 0, 'telefono'],
		['cambia', '\\b' + FECHA + '\\b', ' x '],
		// Una secuencia de días/mes y horas se lee entera como fechas, solo si no tiene cifras ni un separador pegados delante (si
		// no, «5555 12:34» o «5555, 12:34» pasaban) ni detrás. Lo que sigue a una palabra de teléfono ya se revisó arriba.
		['cambia', '(^|[^0-9 \\t.,;:/-]|[^0-9 \\t.,;:/-][ \\t]+|[^0-9 \\t.,;:/-]:[ \\t]*)' + ELEM + '(' + UNE + ELEM + '){0,11}(([.,:;!?]|\\))*[ \\t]*$|[ \\t]*[^0-9 \\t.:/-]|[.,:][^0-9])', ' x '],
		// Cientos y miles también son cifras («cuatro mil ochocientos cuarenta y dos», «mil ciento veintidós»): cada uno vale
		// una (de más, nunca de menos: así un teléfono dictado así llega a sus 8). Antes de las unidades: «ochocientos» lleva «ocho».
		['cambia', '\\b(cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos|mil|hundred|thousand)\\b', '5'],
		['cambia', '\\b(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)[ \\t]+y[ \\t]+', '5'],
		['cambia', '\\b(diez|once|doce|trece|catorce|quince|dieci[a-z]+|veinte|veinti[a-z]+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa'
			+ '|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\\b', '55'],
		['cambia', 'cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|zero|one|two|three|four|five|six|seven|eight|nine', '5'],
		['cambia', '\\ba[ \\t]r[ \\t]r[ \\t]o[ \\t]b[ \\t]a\\b|\\b4rr0b4\\b|\\b4rr5b4\\b', ' arroba '],
		// 2. Correos y enlaces.
		['si', '[@﹫]|\\barroba\\b|https?:|https?//|www\\.|\\bw[ \\t]*w[ \\t]*w\\b|\\.(com|net|org|gt)\\b|\\bpunto[ \\t]+(com|net|org|gt)\\b', 0, 'correo'],
		['si', '\\b(at|arroba)\\b[^\\n]{1,30}\\b(dot|punto)\\b|(\\[|\\(|<|\\{)(at|dot|punto|arroba|\\.)(\\]|\\)|>|\\})|[a-z0-9-]{3,},(com|net|org)\\b'
			+ '|\\bat[ \\t]+' + CORREOS + '\\b|\\b' + CORREOS + '[ \\t,]+(punto|dot|com)\\b'
			// «anaperez90 gmail», «anaperez90 (gmail)», «ana.perez en hotmail», «anaperez90 de gmail»; una palabra larga sin
			// forma de usuario («anaperez en gmail») solo al principio o después de «a», «es» o «:».
			+ '|\\b' + USUARIO + '[ \\t]*(\\(|\\[)?[ \\t]*((en|del|de)[ \\t]+(el[ \\t]+)?)?' + CORREOS + '\\b'
			+ '|(^|\\b(a|al|es|is)\\b|:)[ \\t]*' + LARGO + '[ \\t]+(en|del)[ \\t]+(el[ \\t]+)?' + CORREOS + '\\b', 0, 'correo'],
		['si', 'wa\\.me|\\bw[ \\t]*a[ \\t]*\\.[ \\t]*m[ \\t]*e\\b|\\]\\(|\\bbit[ \\t.]*ly\\b|\\bwhatsapp[ \\t.]+com\\b|\\b(tinyurl|linktr|shorturl|cutt[ \\t.]*ly|rebrand[ \\t.]*ly)\\b'
			// Una página corta: dominio.tld/ruta con un TLD de dos letras o uno de los cortos conocidos, o al final del texto.
			+ '|(^|[^a-z0-9_.@-])[a-z0-9-]+([ \\t]?\\.[ \\t]?[a-z0-9-]+)*[ \\t]?\\.[ \\t]?([a-z]{2}|link|page|app|info|biz|xyz|site|online)[ \\t]?/[ \\t]?[a-z0-9]'
			+ '|(^|[^a-z0-9_.@-])[a-z0-9-]+(\\.[a-z0-9-]+)*\\.(me|co|io|ly|ee|gd|gy|cc|to|info|biz|gl|page|link|app)[ \\t]*$', 0, 'enlace'],
		// 3. Un usuario en otra plataforma: después de «red:», «red es», «red,», «red =», «red ->» solo uno con forma de
		// usuario («ig: villa_lago», «correo -> anaperez90»); también «villa.lago en insta», «en ig como villa.lago»,
		// «búscame como villalago», «red, me llamo X» y un mensaje que es solo «villalago en insta».
		['si', '\\b(' + RED_O_CORREO + ')\\b[ \\t]*([:,=>-]+[ \\t]*|\\b(es|is)\\b[ \\t]*)?@?' + USUARIO
			// «my insta handle is villa.lago», «IG handle: villa_lago», «instagram account: villa_lago», «discord villa#1234»,
			// «line: villa_lago», «line id villa_lago» (no la palabra «line» sola).
			+ '|\\b(' + RED_O_CORREO + ')\\b[^\\n]{0,20}\\b(handle|account|username|user|usuario|cuenta|id|nick)\\b[ \\t]*(:|\\b(es|is)\\b)?[ \\t]*@?' + USUARIO
			+ '|\\bdiscord\\b[ \\t:]*@?[a-z0-9._]+#[0-9]{4}|\\bline[ \\t]*(:|\\bid\\b)[ \\t:]*@?' + USUARIO
			+ '|\\b' + USUARIO + '[ \\t]+(en|on)[ \\t]+' + REDES + '\\b'
			+ '|\\b(' + RED_O_CORREO + ')\\b[^\\n]{0,25}\\b(como|as|llamo|soy)[ \\t]+@?' + USUARIO
			+ '|\\b(b[uú]sca(me|nos)|encu[eé]ntra(me|nos)|encuentras|find me|look me up|search)\\b[^\\n]{0,30}\\b(como|as)[ \\t]+@?[a-z][a-z0-9._]{3,}'
			+ '|\\b' + REDES + '[ \\t]*,?[ \\t]*me[ \\t]+llamo[ \\t]+@?[a-z]{4,}'
			+ '|^[ \\t]*[a-z][a-z0-9._]{3,}[ \\t]+(en|on)[ \\t]+' + REDES + '[ \\t.!]*$'
			+ '|\\b(al|por|mi)[ \\t](wa|whats|wsp|wasap)\\b|\\b(airbnb|booking|vrbo)\\b[^\\n]{0,20}\\bcomo\\b', 0, 'red'],
		// Un usuario sin forma de usuario (una palabra pura) solo donde no cabe otra cosa: «mi … ig es juanlago» (mi, usuario o
		// cuenta antes de la red y «es» después), un mensaje que es solo «instagram es villalago» o «ig juanlago» (con «:» no: «fb: gracias»), y «mi ig
		// juanlago» al final de una frase. «Lo vi en facebook marketplace» o «facebook es donde la vi» pasan; «mi instagram es
		// privado» no (límite aceptado: BLOQUEADAS_A_PROPOSITO del corpus).
		['si', '\\b(mi|my|usuario|user|username|cuenta|account|handle)\\b[^\\n]{0,20}\\b' + REDES + '\\b[ \\t]*:?[ \\t]*\\b(es|is)\\b[ \\t]*:?[ \\t]*@?[a-z][a-z0-9._]{2,}'
			+ '|^[ \\t]*' + REDES + '[ \\t]*:?[ \\t]*\\b(es|is)\\b[ \\t]*:?[ \\t]*@?[a-z][a-z0-9._]{2,}[ \\t.!]*$'
			+ '|^[ \\t]*((mi|my)[ \\t]+)?(ig|insta|fb|tg|tiktok|telegram)([ \\t]+@?|[ \\t]*@)[a-z][a-z0-9._]{3,}[ \\t.!]*$'
			+ '|\\b(mi|my)[ \\t]+' + REDES + '[ \\t]*:?[ \\t]*@?[a-z][a-z0-9._]{3,}[ \\t]*([.!,;]|$)', 0, 'red'],
		// 4. Coordenadas: dos números con decimales (con «lat/lon», N/S/E/O o grados, o «14.63,-90.50»), o en grados y minutos.
		['si', '(^|[^0-9.,])-?[0-9]{1,2}\\.[0-9]{3,}[ \\t]*°?[ \\t]*[ns]?[ \\t]*[,;]?[ \\t]*(lon(g(itud)?)?|lng)?[ \\t]*[:=]?[ \\t]*[eowv]?[ \\t]*-?[0-9]{1,3}\\.[0-9]{3,}'
			+ '|(^|[^0-9.,])-?[0-9]{1,2}\\.[0-9]{2,},[ \\t]*-[0-9]{1,3}\\.[0-9]{2,}|[0-9]{1,2}[ \\t]*°[ \\t]*[0-9]{1,2}[ \\t]*[\'′]', 0, 'ubicacion'],
		// 5. Teléfonos.
		// «+502» dicho con palabras («plus five zero two», «más cinco cero dos»).
		['si', '\\b(plus|m[aá]s)[ \\t]+(5[ \\t,]*5[ \\t,]*5|5[ \\t,]*0[ \\t,]*[0-9])\\b', 0, 'telefono'],
		// Un número partido con puntos como un teléfono («55.55.12.34», «5555.12.34»).
		['si', '(^|[^0-9.,])[2-7][0-9](\\.[0-9]{2}){3}([^0-9.]|$)|(^|[^0-9.,])[2-7][0-9]{3}\\.[0-9]{2}\\.[0-9]{2}([^0-9.]|$)|(^|[^0-9.,])[2-7][0-9]\\.[0-9]{2}\\.[0-9]{4}([^0-9.]|$)', 0, 'telefono'],
		// Con su código de país, seguido («50255551234», «+50255551234», «0050255551234», «13055551234»): siempre, aunque
		// vaya después de «referencia».
		['si', '(^|[^0-9])(\\+|00)?(' + CON_CODIGO + ')([^0-9]|$)', 0, 'telefono'],
		// Con una palabra que no deja duda cerca, 10 cifras (un celular de EE. UU., México o Colombia sin código) o 9 (España,
		// Perú) son un teléfono, aunque vayan después de «referencia». Sin esa palabra, 9 cifras pasan y 10 después de
		// «referencia» también: prima la referencia (los dos, límites aceptados en el corpus).
		['si', '\\b' + TEL_CLARO + '\\b[^\\n]{0,30}[0-9]([^0-9' + LETRA + ']{0,3}[0-9]){8}|[0-9]{9}[^\\n]{0,30}\\b' + TEL_CLARO + '\\b', 0, 'telefono'],
		// La única excepción antes de juntar cifras: 10 o más seguidas (sin juntar grupos) justo después de referencia,
		// autorización, boleta o transacción (y en inglés), hasta 18, sin «+» (ya se revisó arriba que no sean un número con su
		// código de país ni lleven cerca una palabra de teléfono).
		['cambia', '\\b(referencia|ref|autorizaci[oó]n|boleta|transacci[oó]n|reference|transaction|authorization|confirmation|receipt)\\b[^0-9+\\n]{0,30}[0-9]{10,18}([.,]?[ \\t]*$|[ \\t]*[^0-9 \\t.,/+-]|[.,/+-][^0-9])', ' x '],
		// Un teléfono posible: se juntan las cifras de los grupos cercanos (como se marcaría) y se bloquea un celular o fijo
		// de Guatemala (8 cifras que empiezan de 2 a 7) o uno internacional (10 o más), lleve lo que lleve delante («ref»,
		// «vuelo», «Q», «No.»…). «Son Q2345 y Q5678» o «boleta 70012345» se bloquean: preferible a dejar pasar un teléfono
		// (el aviso le dice que suba el comprobante en foto). Una «x» suelta entre números no corta un teléfono.
		// Antes, un precio: con su moneda delante (Q, Q., $, US$, USD) o detrás (quetzales, dólares), con comas de miles y
		// en mil exactos, hasta 999 millones («Q25,000,000», «US$ 22,500,000.00», «40,000,000 quetzales»). Sin «,000» al
		// final no es un precio: «Q55,551,234» es un teléfono disfrazado y se bloquea; con más cifras, tampoco (internacional).
		['cambia', '(\\bq\\.?|\\bus\\$|\\$|\\busd)[ \\t]?[0-9]{1,3}(,[0-9]{3})?,000(\\.[0-9]{1,2})?([^0-9.,]|[.,][^0-9]|[.,]?$)'
			+ '|(^|[^0-9.,])[0-9]{1,3}(,[0-9]{3})?,000(\\.[0-9]{1,2})?[ \\t]*(quetzales|d[oó]lares)\\b', ' x '],
		['cambia', '[ \\t]x[ \\t]', ' * '],
		['si', '(^|[^0-9])[2-7]([^0-9' + LETRA + ']{0,3}[0-9]){7}|[0-9]([^0-9' + LETRA + ']{0,3}[0-9]){9}', 0, 'telefono'],
		// 6. Lo que queda: dos grupos de 4 con palabras en medio («5555 y luego 1234»). Las excepciones de aquí abajo solo
		// sirven para esta última búsqueda: un año suelto, m², montos con unidad o moneda, horas, miles y decimales.
		['cambia', '(^[^0-9]{0,2}|[^0-9]{3})(19|20)[0-9]{2}([^0-9' + LETRA + ']{0,3}[' + LETRA + ']|[^0-9' + LETRA + ']{0,3}$|[^0-9' + LETRA + ']{4})', ' x '],
		['cambia', '(^[^0-9]{0,2}|[^0-9]{3})(19|20)[0-9]{2}([^0-9' + LETRA + ']{0,3}[' + LETRA + ']|[^0-9' + LETRA + ']{0,3}$|[^0-9' + LETRA + ']{4})', ' x '],
		['cambia', '\\b[0-9]+([.,][0-9]+)?[ \\t]*m(²|2\\b)', ' x ']
	].concat(marcas(',[ \\t]*N[ \\t]*' + UNIDAD + '\\b', ', #X# '), marcas('(^|[^0-9# \\t.+-])[ \\t]*N[ \\t]*' + UNIDAD + '\\b', ' #X# '), [
		['cambia', '(^|[^0-9# \\t.,+-])[ \\t]*[0-9]{1,6}([.,][0-9]+)*[ \\t]*' + UNIDAD + '([^' + LETRA + ']|$)', ' x ']
	], marcas('(\\bq\\.?|\\bus\\$|\\$|\\busd)[ \\t]?N\\b', ' #X# '), [
		['cambia', '(\\bq\\.?|\\bus\\$|\\$|\\busd)[ \\t]?[0-9]+([.,][0-9]+)*([ ,.-]+[^0-9 ,.-]|[^0-9a-z ,.-]|[ ,.-]*$)', ' x '],
		// Una hora («a las 1430», «at 1500»), solo si lo es (00:00 a 23:59).
		['cambia', '\\b(las|at)[ \\t]+2[0-3](00|30)\\b', ' #R# '], ['cambia', '\\b(las|at)[ \\t]+2[0-3][0-5][0-9]\\b', ' #A# '],
		['cambia', '\\b(las|at)[ \\t]+[01][0-9](00|30)\\b', ' #C# '], ['cambia', '\\b(las|at)[ \\t]+[01][0-9][0-5][0-9]\\b', ' #B# '],
		['cambia', '\\b(las|at)[ \\t]+[0-9][0-5][0-9]([^0-9 \\t]|[ \\t]+[^0-9 \\t]|[ \\t]*$)', ' x '],
		['cambia', '\\b([0-9]{1,2}/[0-9]{1,2}(/[0-9]{2,4})?|[0-9]{1,2}:[0-9]{2}|[0-9]{1,3}(,[0-9]{3})+(\\.[0-9]+)?|[0-9]+\\.[0-9]{2})\\b', ' x '],
		// Cuentas: «1500 + 350» y «450 = 1350» no se leen como dos grupos de 4.
		['cambia', '(^|[^0-9])[0-9]{3,4}[ \\t]*([=×*+]|[ \\t]x)[ \\t]*[0-9]{3}([^0-9]|$)', ' x    x '],
		['cambia', '(^|[^0-9])[0-9]{3}[ \\t]*([=×*+]|[ \\t]x)[ \\t]*[0-9]{4}([^0-9]|$)', ' x    x '],
		['cambia', '(^|[^0-9])[0-9]{3,4}[ \\t]*([=×*+]|[ \\t]x)[ \\t]*[0-9]{3}([^0-9]|$)', ' x    x '],
		['cambia', '(^|[^0-9])([2-7][0-9]|[0189][0-9])(00|50)[ \\t]*[+=][ \\t]*([2-7][0-9]|[0189][0-9])(00|50)([^0-9]|$)', ' x    x '],
		['cambia', '(^|[^0-9])([2-7][0-9]|[0189][0-9])(00|50)[ \\t]*[+=][ \\t]*([2-7][0-9]|[0189][0-9])(00|50)([^0-9]|$)', ' x    x '],
		['cambia', '(^|[^0-9 \\t])[ \\t]*([0-9]{1,4}[ \\t]*[×*=][ \\t]*[0-9]{1,3}|[0-9]{1,3}[ \\t]*[×*=][ \\t]*[0-9]{4})([^0-9 \\t]|[ \\t]+[^0-9 \\t]|[ \\t]*$)', ' x    x '],
		['cambia', '(^|[^0-9 \\t])[ \\t]*([0-9]{1,4}[ \\t]*[×*=][ \\t]*[0-9]{1,3}|[0-9]{1,3}[ \\t]*[×*=][ \\t]*[0-9]{4})([^0-9 \\t]|[ \\t]+[^0-9 \\t]|[ \\t]*$)', ' x    x '],
		// El NIT de Guatemala, solo con su forma y sin la de un teléfono («NIT 1234567-8»; «NIT 55551234-k» o «5555123-4» no).
		['cambia', '\\bnit([ \\t:.]+es)?[ \\t:.]*([0-9]{1,6}-[0-9k]|[0189][0-9]{6}-[0-9]|[0-9]{7}-k)\\b', ' x '],
		// Dos grupos de 4 con palabras en medio (o uno marcado): el primero empieza de 2 a 7 y no son los dos redondos; o
		// «Mi número empieza con 5555».
		['si', '(^|[^0-9#])' + G.AN + '[^0-9#][^0-9]{0,29}([0-9]([^0-9' + LETRA + '#]{0,3}[0-9]){3}([^0-9]|$)|#[ARBC]#)'
			+ '|(^|[^0-9#])' + G.R + '[^0-9#][^0-9]{0,29}(' + G.NR + '([^0-9]|$)|#[AB]#)'
			+ '|#A#[^0-9]{0,29}[^0-9#][0-9]{4}([^0-9#]|$)|#R#[^0-9]{0,29}[^0-9#]' + G.NR + '([^0-9#]|$)'
			+ '|#A#[ \\t,;]{0,3}((y|e|o|and|or|las|a las|at)[ \\t]{1,3})?#[ARBC]#|#R#[ \\t,;]{0,3}((y|e|o|and|or|las|a las|at)[ \\t]{1,3})?#[AB]#'
			+ '|\\b(empieza|comienza|inicia|starts)[^0-9]{0,15}[2-7][0-9]{3}([^0-9]|$)', 0, 'telefono']
	]);
	// Las vocales con acento (y la ñ, la ü) también en mayúscula: el navegador pasa todo a minúsculas, pero lower() de las
	// reglas puede dejar «Ó» como está («TRANSACCIÓN»). Dentro de una clase se agrega la mayúscula; fuera, la letra se
	// vuelve una clase con las dos. Así la regla generada y el navegador dicen lo mismo.
	var MAYUS = { 'á': 'Á', 'é': 'É', 'í': 'Í', 'ó': 'Ó', 'ú': 'Ú', 'ñ': 'Ñ', 'ü': 'Ü' };
	function ambas(p) {
		var out = '', clase = false;
		for (var i = 0; i < p.length; i++) {
			var c = p.charAt(i);
			if (c === '\\') { out += c + p.charAt(i + 1); i++; continue; }
			if (c === '[' && !clase) clase = true; else if (c === ']' && clase) clase = false;
			out += MAYUS[c] ? (clase ? c + MAYUS[c] : '[' + c + MAYUS[c] + ']') : c;
		}
		return out;
	}
	FILTRO_CONTACTO = FILTRO_CONTACTO.map(function (p) { return [p[0], ambas(p[1]), p[2], p[3]]; });
	var filtroListo = null;
	// Qué parece contacto en el texto: 'telefono', 'correo', 'red', 'enlace', 'ubicacion', 'raro', o '' si nada. El aviso
	// se lo dice al cliente en una línea (vacChatBloqueo_<tipo> en scripts/lib/i18n.mjs).
	function tipoDeContacto(texto) {
		if (!filtroListo) { var anios = aniosCercanos(); filtroListo = FILTRO_CONTACTO.map(function (p) { return [p[0], new RegExp(p[1].split(ANIOS_MARCA).join(anios), p[0] === 'cambia' ? 'gu' : 'u'), p[2], p[3]]; }); }
		var crudo = String(texto || ''), t = crudo.toLowerCase();
		for (var i = 0; i < filtroListo.length; i++) {
			var p = filtroListo[i];
			if (p[0] === 'si' && p[1].test(p[2] === 'crudo' ? crudo : t)) return p[3] || 'raro';
			if (p[0] === 'cambia') t = t.replace(p[1], p[2]);
		}
		return '';
	}
	function tieneContacto(texto) { return tipoDeContacto(texto) !== ''; }

	return {
		tieneContacto: tieneContacto, tipoDeContacto: tipoDeContacto, FILTRO_CONTACTO: FILTRO_CONTACTO, ANIOS_MARCA: ANIOS_MARCA, MAX_NOCHES: MAX_NOCHES, DIAS_NO_LLEGO: DIAS_NO_LLEGO,
		IVA: IVA, INGUAT: INGUAT, MARGEN: MARGEN, CALENDARIOS: CALENDARIOS,
		r2: r2, nochePublica: nochePublica, desgloseNoche: desgloseNoche, cotizar: cotizar, subtotalDeTotal: subtotalDeTotal,
		esFecha: esFecha, hoy: hoy, sumarDias: sumarDias, nochesEntre: nochesEntre, unirRangos: unirRangos,
		nochesOcupadas: nochesOcupadas, minimoNoches: minimoNoches, quitarRango: quitarRango, liberarNoches: liberarNoches, validarEstancia: validarEstancia, salidaMaxima: salidaMaxima,
		parseICal: parseICal, aICal: aICal,
		pascua: pascua, semanaSanta: semanaSanta, tocaSemanaSanta: tocaSemanaSanta, repetirRango: repetirRango,
		esFinde: esFinde, precioNoche: precioNoche, nochesDe: nochesDe, planPublico: planPublico,
		precioDesde: precioDesde, cotizarEstancia: cotizarEstancia, gananciaEstancia: gananciaEstancia,
		choquesReserva: choquesReserva, rangosReservados: rangosReservados, cambioDeReserva: cambioDeReserva, esSolicitudReserva: esSolicitudReserva, resumenReservas: resumenReservas, confirmada: confirmada,
		nivelComision: nivelComision, horasAtrasoComision: horasAtrasoComision, sociosEnMora: sociosEnMora, cobrable: cobrable, cobrablePorPrueba: cobrablePorPrueba, faltaLeerChat: faltaLeerChat, horasMora: horasMora, ultimoDiaNoLlego: ultimoDiaNoLlego, nivelMora: nivelMora, alertaSolicitud: alertaSolicitud
	};
});
