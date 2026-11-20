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
			if (m && m.desde <= ultima && m.hasta >= llegada) min = Math.max(min, Math.floor(Number(m.noches) || 1));
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
	function sociosEnMora(reservas, ahora) {
		var out = {};
		(reservas || []).forEach(function (r) {
			var n = nivelComision(r, ahora);
			if (n >= 2 && r.propietarioId) out[r.propietarioId] = Math.max(n, out[r.propietarioId] || 0);
		});
		return out;
	}

	// Alerta de una solicitud para el administrador: 'tarde' (sin responder en 2 h), 'mora' (comisión con
	// más de 72 h) o 'bloqueada' (dijeron que no se dio y esas fechas están bloqueadas en el calendario).
	var PLAZO_RESPUESTA = 2 * 3600000;
	function alertaSolicitud(estado, creado, fechas, reserva, bloqueos, ahora) {
		if (estado === 'pendiente') return ahora - creado > PLAZO_RESPUESTA ? 'tarde' : '';
		if (estado === 'confirmada') return nivelComision(reserva, ahora) === 3 ? 'mora' : '';
		if (estado !== 'no') return '';
		return (bloqueos || []).some(function (b) { return b.desde < fechas.salida && b.hasta > fechas.llegada; }) ? 'bloqueada' : '';
	}

	// ¿El texto trae un teléfono, un correo o un enlace? Un solo filtro para el chat de la reserva y para lo que el dueño
	// escribe de su casa y sale publicado (admin/js/mi-casa.js): los datos de contacto se entregan al confirmar la reserva;
	// antes, nadie los pasa. Fechas, años («2019/2020»), horas, montos y medidas («1200 / 1500 m²») no cuentan como
	// teléfono; los números escritos con letras sí, y también unas coordenadas (llevan a la casa, que es privada hasta el
	// pago). Una página corta (t.me/villa, Bit.Ly/x, casa.lago.me) cuenta con «/» después o al final: «Perfecto.Me avisas»
	// no. También correos y usuarios disfrazados («juan at gmail dot com», «ig casalago_gt») y un número partido en dos. (firestore.rules tiene su propia copia para el chat: se pone al día en otra tanda.)
	var DIGITOS = /cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|zero|one|two|three|four|five|six|seven|eight|nine/g;
	function tieneContacto(texto) {
		// Puntos «raros» (。．) como punto; una «O» entre números como cero («5O55»).
		var original = String(texto || '').replace(/[。．｡]/g, '.').replace(/(\d)[oO](?=\d)/g, '$10').replace(/(\d)[oO](?=\d)/g, '$10');
		var t = original.toLowerCase();
		if (/@|\barroba\b|https?:|https?\/\/|www\.|\bw\s*w\s*w\b|wa\.me|\]\(|\.(com|net|org|gt)\b|\bpunto (com|net|org|gt)\b/.test(t)) return true;
		// Correos y páginas disfrazados: «juan at gmail dot com», «juan[at]gmail», «casa(dot)com», «casa[.]com», «casa,com».
		if (/\b(at|arroba)\b.{1,30}\b(dot|punto)\b|[\[(](at|dot|\.)[\])]|[a-z0-9-]{3,},(com|net|org)\b/.test(t) || /[a-z]AT[a-z]+DOT[a-z]/.test(original)) return true;
		// Un usuario en otra plataforma («ig casalago_gt», «gmail: juanperez», «skype juan.perez», «al wa»).
		if (/\b(gmail|hotmail|outlook|yahoo|skype|ig|fb|insta|instagram|facebook|telegram|signal|tiktok)\b\s*:?\s*@?(?!(para|como|por|del|los|las|con|que|una|unas|unos|tambi)\b)[a-z0-9._]{4,}/.test(t)
			|| /\b(al|por|mi) (wa|whats|wsp|wasap)\b/.test(t) || /\b(airbnb|booking|vrbo)\b.{0,20}\bcomo\b/.test(t)) return true;
		// Páginas cortas (t.me/x, Bit.Ly/x, casa.lago.me): con «/» después o al final del texto, en mayúscula o minúscula.
		if (/(^|[^\w.@-])[a-z0-9-]+(\.[a-z0-9-]+)*\.(me|co|io|ly|ee|info|biz|gl|page|link|app)(\/|$)/i.test(original.trim())) return true;
		// Coordenadas: dos números con decimales (con «lat/lon», N/S/E/O o grados, o «14.63,-90.50»), o en grados y minutos.
		if (/(^|[^\d.,])-?\d{1,2}\.\d{3,}\s*°?\s*[ns]?\s*[,;]?\s*(lon(g(itud)?)?|lng)?\s*[:=]?\s*[eowv]?\s*-?\d{1,3}\.\d{3,}(?!\d)/.test(t)
			|| /(^|[^\d.,])-?\d{1,2}\.\d{2,},\s*-\d{1,3}\.\d{2,}(?!\d)/.test(t) || /\d{1,2}\s*°\s*\d{1,2}\s*['′]/.test(t)) return true;
		// Años: un rango («2019/2020», «2024-2025») o uno suelto sin otros números pegados (un fijo de Guatemala
		// «2024 5678» empieza como un año y sigue siendo teléfono).
		t = t.replace(/\b(19|20)\d{2}-[01]\d-[0-3]\d\b/g, ' x ')
			.replace(/\b((?:19|20)\d{2})\s*[-\/]\s*((?:19|20)\d{2})\b/g, function (m, a, b) { return b - a > 0 && b - a <= 10 ? ' x ' : m; })
			.replace(/\b(19|20)\d{2}\b/g, function (m, a, i, s) { return /\d/.test(s.slice(Math.max(0, i - 3), i)) || /^[^\da-záéíóúñ]{0,3}\d/.test(s.slice(i + 4, i + 8)) ? m : ' x '; })
			.replace(/\b\d+([.,]\d+)?\s*m(²|2\b)/g, ' x ')
			.replace(/(\bq\.?|\bus\$|\$|\busd)\s?\d+([.,]\d+)*/g, ' x ')
			.replace(/\b(\d{1,2}\/\d{1,2}(\/\d{2,4})?|\d{1,2}:\d{2}|\d{1,3}(,\d{3})+(\.\d+)?|\d+\.\d{2})\b/g, ' x ').replace(DIGITOS, '0');
		// Siete dígitos seguidos, o un número partido en dos grupos de 4 («5555 y luego 1234»).
		return /(\d[^\da-záéíóúñ]{0,3}){7,}/.test(t) || /(^|\D)\d{4}(?!\d)[^\d]{1,30}(^|\D)\d{4}(?!\d)/.test(t);
	}

	return {
		tieneContacto: tieneContacto,
		IVA: IVA, INGUAT: INGUAT, MARGEN: MARGEN, CALENDARIOS: CALENDARIOS,
		r2: r2, nochePublica: nochePublica, desgloseNoche: desgloseNoche, cotizar: cotizar, subtotalDeTotal: subtotalDeTotal,
		esFecha: esFecha, hoy: hoy, sumarDias: sumarDias, nochesEntre: nochesEntre, unirRangos: unirRangos,
		nochesOcupadas: nochesOcupadas, minimoNoches: minimoNoches, quitarRango: quitarRango, liberarNoches: liberarNoches, validarEstancia: validarEstancia, salidaMaxima: salidaMaxima,
		parseICal: parseICal,
		pascua: pascua, semanaSanta: semanaSanta, tocaSemanaSanta: tocaSemanaSanta, repetirRango: repetirRango,
		esFinde: esFinde, precioNoche: precioNoche, nochesDe: nochesDe, planPublico: planPublico,
		precioDesde: precioDesde, cotizarEstancia: cotizarEstancia, gananciaEstancia: gananciaEstancia,
		choquesReserva: choquesReserva, rangosReservados: rangosReservados, cambioDeReserva: cambioDeReserva, esSolicitudReserva: esSolicitudReserva, resumenReservas: resumenReservas,
		nivelComision: nivelComision, horasAtrasoComision: horasAtrasoComision, sociosEnMora: sociosEnMora, alertaSolicitud: alertaSolicitud
	};
});
