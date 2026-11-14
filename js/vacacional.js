/* Renta vacacional por noches: calendario de disponibilidad, desglose y solicitud de reserva.
   Usa window.EQVacacional (js/calc-vacacional.js). La solicitud viaja por el formulario de
   contacto de siempre (js/site.js llama a form.eqReserva() antes de enviar el lead). */
(function () {
	'use strict';
	var V = window.EQVacacional;
	if (!V) return;

	function pad(n) { return (n < 10 ? '0' : '') + n; }
	function fmt(s, datos) { return String(s || '').replace(/\{(\w+)\}/g, function (m, k) { return datos[k] != null ? datos[k] : m; }); }
	function fechaUTC(f) { return new Date(f + 'T12:00:00Z'); }
	function diaSemana(f) { return fechaUTC(f).getUTCDay(); }
	function mesDe(f) { return f.slice(0, 7); }
	function sumarMeses(ym, n) {
		var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
		y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
		return y + '-' + pad(m + 1);
	}
	// Código corto de reserva, sin letras ni números que se confundan (0/O, 1/I).
	function codigoReserva() {
		var letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', n = new Uint8Array(6), c = 'EQ-';
		crypto.getRandomValues(n);
		for (var i = 0; i < n.length; i++) c += letras[n[i] % letras.length];
		return c;
	}
	function diasDelMes(ym) { return new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate(); }

	function iniciar(card) {
		var datosEl = card.querySelector('.vac-datos');
		if (!datosEl) return;
		var D;
		try { D = JSON.parse(datosEl.textContent); } catch (e) { return; }
		var t = D.t || {};
		var EN = card.getAttribute('data-lang') === 'en';
		var locale = EN ? 'en-US' : 'es-GT';
		var prefijo = D.moneda === 'GTQ' ? 'Q' : 'US$';
		var corto = D.moneda === 'GTQ' ? 'Q' : '$';
		var hoy = V.hoy();
		var mesMin = mesDe(hoy);
		var mesMax = sumarMeses(mesMin, 18);
		var nochesMin = Math.max(1, D.nochesMin || 1);
		var minimos = D.minimos || []; // mínimos de noches por fechas (Navidad, Semana Santa…)
		function minimoDe(llegada, salida) { return V.minimoNoches(llegada, salida, nochesMin, minimos); }
		var ocupadas = V.nochesOcupadas(D.bloqueos || []);

		var cuerpo = card.querySelector('.vac-cal-cuerpo');
		var tituloMes = card.querySelector('.vac-cal-mes');
		var prev = card.querySelector('.vac-cal-prev');
		var next = card.querySelector('.vac-cal-next');
		var ayuda = card.querySelector('.vac-ayuda');
		var desglose = card.querySelector('[data-out=desglose]');
		var outLlegada = card.querySelector('[data-out=llegada]');
		var outSalida = card.querySelector('[data-out=salida]');
		var botonesCampo = card.querySelectorAll('.vac-fecha');
		var selHuespedes = card.querySelector('[name=huespedes]');
		var form = card.querySelector('.lead-form[data-origen="reserva"]') || card.querySelector('.lead-form');

		var fDia = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
		var fCorta = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
		var fDia = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
		var fMes = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
		var fSemana = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
		var fSemanaLarga = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });

		var estado = { mes: mesMin, llegada: '', salida: '', campo: 'llegada', foco: '' };

		function dinero(n) {
			n = Number(n) || 0;
			return prefijo + ' ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		}
		function dineroCorto(n) {
			n = Math.round(Number(n) || 0);
			if (n >= 10000) return corto + (Math.round(n / 100) / 10).toLocaleString('en-US') + 'k';
			return corto + n.toLocaleString('en-US');
		}
		function mayus(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
		function noches(n) { return n === 1 ? t.vacNoche1 : fmt(t.vacNochesN, { n: n }); }

		// ¿Se puede tocar este día según lo que se está eligiendo?
		function eligiendoSalida() { return estado.campo === 'salida' && !!estado.llegada; }
		function salidaValida(f) {
			if (!estado.llegada || f <= estado.llegada) return false;
			var max = V.salidaMaxima(estado.llegada, ocupadas);
			if (max && f > max) return false;
			return V.nochesEntre(estado.llegada, f) >= minimoDe(estado.llegada, f);
		}
		// La llegada necesita al menos las noches mínimas libres seguidas.
		function llegadaValida(f) {
			if (f < hoy) return false;
			for (var i = 0; i < nochesMin; i++) if (ocupadas[V.sumarDias(f, i)]) return false;
			return true;
		}
		function disponible(f) {
			if (f < hoy) return false;
			if (eligiendoSalida()) return salidaValida(f) || (f < estado.llegada && llegadaValida(f));
			return llegadaValida(f);
		}

		function etiqueta(f) {
			var partes = [fDia.format(fechaUTC(f))];
			if (f === estado.llegada) partes.push(t.vacLlegadaElegida);
			else if (f === estado.salida) partes.push(t.vacSalidaElegida);
			if (f >= hoy && !ocupadas[f]) partes.push(dinero(V.precioNoche(f, D.plan)) + ' ' + t.vacPorNoche);
			if (ocupadas[f] && f >= hoy) partes.push(t.vacOcupado);
			if (!disponible(f) && f !== estado.llegada && f !== estado.salida) partes.push(t.vacNoDisponible);
			return partes.join(', ');
		}

		function pintar(enfocar) {
			var ym = estado.mes;
			tituloMes.textContent = mayus(fMes.format(fechaUTC(ym + '-01')));
			prev.disabled = ym <= mesMin;
			next.disabled = ym >= mesMax;
			var primero = ym + '-01';
			var total = diasDelMes(ym);
			var foco = estado.foco && mesDe(estado.foco) === ym ? estado.foco : '';
			if (!foco) {
				if (estado.llegada && mesDe(estado.llegada) === ym) foco = estado.llegada;
				else foco = ym === mesMin ? hoy : primero;
			}
			estado.foco = foco;

			var h = '<table class="vac-cal-tabla" role="grid" aria-labelledby="' + (tituloMes.id || '') + '"><thead><tr>';
			for (var s = 0; s < 7; s++) {
				var ref = V.sumarDias('2026-11-01', s); // domingo
				h += '<th scope="col" abbr="' + mayus(fSemanaLarga.format(fechaUTC(ref))) + '">' + mayus(fSemana.format(fechaUTC(ref))).slice(0, 2) + '</th>';
			}
			h += '</tr></thead><tbody><tr>';
			var inicio = diaSemana(primero);
			for (var v = 0; v < inicio; v++) h += '<td role="gridcell"></td>';
			for (var d = 1; d <= total; d++) {
				var f = ym + '-' + pad(d);
				var col = (inicio + d - 1) % 7;
				if (col === 0 && d > 1) h += '</tr><tr>';
				var clases = ['vac-dia'];
				var libre = disponible(f);
				if (f < hoy) clases.push('is-pasado');
				else if (ocupadas[f]) clases.push('is-ocupado');
				if (f === hoy) clases.push('is-hoy');
				if (f === estado.llegada) clases.push('is-llegada');
				if (f === estado.salida) clases.push('is-salida');
				if (estado.llegada && estado.salida && f > estado.llegada && f < estado.salida) clases.push('is-rango');
				var elegido = f === estado.llegada || f === estado.salida;
				var precio = f >= hoy && !ocupadas[f] ? '<span class="vac-dia-precio" aria-hidden="true">' + dineroCorto(V.precioNoche(f, D.plan)) + '</span>' : '';
				h += '<td role="gridcell"' + (elegido ? ' aria-selected="true"' : '') + '><button type="button" class="' + clases.join(' ') + '" data-fecha="' + f + '"' +
					' tabindex="' + (f === foco ? '0' : '-1') + '"' + (libre || elegido ? '' : ' aria-disabled="true"') +
					' aria-label="' + etiqueta(f).replace(/"/g, '&quot;') + '"><span class="vac-dia-num" aria-hidden="true">' + d + '</span>' + precio + '</button></td>';
			}
			var resto = (7 - ((inicio + total) % 7)) % 7;
			for (var r = 0; r < resto; r++) h += '<td role="gridcell"></td>';
			h += '</tr></tbody></table>';
			cuerpo.innerHTML = h;
			if (enfocar) {
				var b = cuerpo.querySelector('[data-fecha="' + foco + '"]');
				if (b) b.focus();
			}
		}

		function actualizar() {
			outLlegada.textContent = estado.llegada ? mayus(fCorta.format(fechaUTC(estado.llegada))) : t.vacSinFecha;
			outSalida.textContent = estado.salida ? mayus(fCorta.format(fechaUTC(estado.salida))) : t.vacSinFecha;
			for (var i = 0; i < botonesCampo.length; i++) {
				var activo = botonesCampo[i].getAttribute('data-campo') === (estado.llegada && !estado.salida ? 'salida' : estado.campo);
				botonesCampo[i].classList.toggle('is-activo', activo && !(estado.llegada && estado.salida));
			}
			if (!estado.llegada) ayuda.textContent = t.vacEligeLlegada;
			else if (!estado.salida) {
				// La estancia mínima de siempre ya está escrita bajo el precio; aquí solo la de esas fechas si es otra.
				var minimo = minimoDe(estado.llegada, V.sumarDias(estado.llegada, 1));
				ayuda.textContent = t.vacEligeSalida + (minimo > 1 && minimo !== nochesMin ? ' ' + fmt(t.vacMinimo, { n: minimo }) : '');
			}
			else ayuda.textContent = noches(V.nochesEntre(estado.llegada, estado.salida)) + ': ' + outLlegada.textContent + ' → ' + outSalida.textContent + '.';
			pintarDesglose();
		}

		function fila(etq, valor, clase) {
			return '<div class="vac-fila' + (clase ? ' ' + clase : '') + '"><dt>' + etq + '</dt><dd>' + valor + '</dd></div>';
		}
		function pintarDesglose() {
			if (!estado.llegada || !estado.salida) { desglose.hidden = true; desglose.innerHTML = ''; return; }
			var c = V.cotizarEstancia({ plan: D.plan, llegada: estado.llegada, salida: estado.salida, limpieza: D.limpieza, deposito: D.deposito });
			var h = '<dl class="vac-desglose-lista">';
			h += fila(c.uniforme ? dinero(c.noche) + ' × ' + noches(c.noches) : noches(c.noches), dinero(c.alojamiento));
			h += '</dl>';
			if (!c.uniforme) {
				h += '<details class="vac-detalle"><summary>' + t.vacVerNoches + '</summary><ul>';
				c.detalle.forEach(function (n) { h += '<li><span>' + mayus(fCorta.format(fechaUTC(n.fecha))) + '</span><span>' + dinero(n.precio) + '</span></li>'; });
				h += '</ul></details>';
			}
			h += '<dl class="vac-desglose-lista">';
			if (c.limpieza) h += fila(t.vacLimpieza, dinero(c.limpieza));
			h += fila(t.vacIva, dinero(c.iva));
			h += fila(t.vacInguat, dinero(c.inguat));
			h += fila(t.vacTotal, dinero(c.total), 'vac-total');
			h += '</dl>';
			if (c.deposito) h += '<div class="vac-deposito"><dl class="vac-desglose-lista">' + fila(t.vacDeposito, dinero(c.deposito)) + '</dl><p>' + t.vacDepositoNota + '</p></div>';
			h += '<button type="button" class="btn btn-link vac-borrar">' + t.vacBorrar + '</button>';
			desglose.innerHTML = h;
			desglose.hidden = false;
		}

		function elegir(f) {
			if (eligiendoSalida() && f > estado.llegada) {
				if (!salidaValida(f)) return;
				estado.salida = f;
				estado.campo = 'llegada';
			} else {
				if (!llegadaValida(f)) return;
				var mantener = estado.campo === 'llegada' && estado.mantener && estado.salida;
				estado.llegada = f;
				if (!(mantener && estado.salida > f && V.validarEstancia({ llegada: f, salida: estado.salida, ocupadas: ocupadas, nochesMin: nochesMin, minimos: minimos, hoy: hoy }).ok)) estado.salida = '';
				estado.campo = estado.salida ? 'llegada' : 'salida';
			}
			estado.mantener = false;
			estado.foco = f;
			limpiarError();
			pintar(true);
			actualizar();
		}

		function mover(dias, aFecha) {
			var f = aFecha || V.sumarDias(estado.foco, dias);
			if (f < mesMin + '-01') f = mesMin + '-01';
			var limite = mesMax + '-' + pad(diasDelMes(mesMax));
			if (f > limite) f = limite;
			estado.foco = f;
			estado.mes = mesDe(f);
			pintar(true);
		}

		cuerpo.addEventListener('click', function (e) {
			var b = e.target.closest('[data-fecha]');
			if (!b || b.getAttribute('aria-disabled') === 'true') return;
			elegir(b.getAttribute('data-fecha'));
		});
		cuerpo.addEventListener('keydown', function (e) {
			var b = e.target.closest('[data-fecha]');
			if (!b) return;
			estado.foco = b.getAttribute('data-fecha');
			var dow = diaSemana(estado.foco);
			switch (e.key) {
				case 'ArrowLeft': mover(-1); break;
				case 'ArrowRight': mover(1); break;
				case 'ArrowUp': mover(-7); break;
				case 'ArrowDown': mover(7); break;
				case 'Home': mover(-dow); break;
				case 'End': mover(6 - dow); break;
				case 'PageUp': case 'PageDown': {
					var ym = sumarMeses(mesDe(estado.foco), e.key === 'PageUp' ? (e.shiftKey ? -12 : -1) : (e.shiftKey ? 12 : 1));
					var dia = Math.min(+estado.foco.slice(8, 10), diasDelMes(ym));
					mover(0, ym + '-' + pad(dia));
					break;
				}
				default: return;
			}
			e.preventDefault();
		});
		prev.addEventListener('click', function () { if (estado.mes > mesMin) { estado.mes = sumarMeses(estado.mes, -1); estado.foco = ''; pintar(false); } });
		next.addEventListener('click', function () { if (estado.mes < mesMax) { estado.mes = sumarMeses(estado.mes, 1); estado.foco = ''; pintar(false); } });
		Array.prototype.forEach.call(botonesCampo, function (b) {
			b.addEventListener('click', function () {
				var campo = b.getAttribute('data-campo');
				estado.campo = campo === 'salida' && estado.llegada ? 'salida' : 'llegada';
				estado.mantener = estado.campo === 'llegada';
				var ref = (estado.campo === 'salida' ? estado.salida || estado.llegada : estado.llegada) || hoy;
				estado.foco = ref; estado.mes = mesDe(ref);
				pintar(true);
				actualizar();
			});
		});
		desglose.addEventListener('click', function (e) {
			if (!e.target.closest('.vac-borrar')) return;
			estado.llegada = ''; estado.salida = ''; estado.campo = 'llegada';
			pintar(false);
			actualizar();
			var b = cuerpo.querySelector('[tabindex="0"]');
			if (b) b.focus();
		});

		function statusBox() { return form && form.querySelector('.lead-form-status'); }
		function limpiarError() {
			var box = statusBox();
			if (box && box.classList.contains('text-danger') && box.getAttribute('data-vac')) { box.textContent = ''; box.removeAttribute('data-vac'); }
		}
		if (form) {
			form.eqReserva = function () {
				var v = V.validarEstancia({ llegada: estado.llegada, salida: estado.salida, ocupadas: ocupadas, nochesMin: nochesMin, minimos: minimos, hoy: hoy });
				if (!v.ok) {
					var msg = v.error === 'pasado' ? t.vacErrPasado : v.error === 'ocupada' ? t.vacErrOcupada : v.error === 'minimo' ? fmt(t.vacErrMinimo, { n: v.minimo }) : t.vacErrFechas;
					var box = statusBox();
					if (box) { box.className = 'lead-form-status mt-3 text-danger'; box.setAttribute('data-vac', '1'); box.textContent = msg; }
					ayuda.textContent = msg;
					card.querySelector('.vac-cal').scrollIntoView({ behavior: 'smooth', block: 'center' });
					return null;
				}
				var c = V.cotizarEstancia({ plan: D.plan, llegada: estado.llegada, salida: estado.salida, limpieza: D.limpieza, deposito: D.deposito });
				var n = selHuespedes ? Math.max(1, +selHuespedes.value || 1) : 1;
				var codigo = codigoReserva();
				return {
					// Lo que ve el cliente al enviar: su código para dar seguimiento a la reserva.
					gracias: fmt(t.vacCodigo, { codigo: codigo }),
					ver: t.vacChatVer,
					datos: {
						codigo: codigo, llegada: estado.llegada, salida: estado.salida, noches: c.noches, huespedes: n,
						subtotal: c.subtotal, impuestos: c.impuestos, total: c.total, deposito: c.deposito, moneda: D.moneda || 'USD'
					},
					resumen: codigo + ' · ' + fmt(t.vacResumen, {
						llegada: estado.llegada, salida: estado.salida, noches: noches(c.noches),
						huespedes: n === 1 ? t.vacHuesped1 : fmt(t.vacHuespedesN, { n: n }), total: dinero(c.total)
					})
				};
			};
		}

		// Disponibilidad al día (iCal del socio y reservas confirmadas); si falla, quedan los bloqueos publicados.
		var id = card.getAttribute('data-id');
		if (id && window.fetch) {
			fetch('/api/disponibilidad?id=' + encodeURIComponent(id), { headers: { Accept: 'application/json' } })
				.then(function (r) { return r.ok ? r.json() : null; })
				.then(function (res) {
					if (!res || !res.ocupadas) return;
					// Casa en pausa: no se puede reservar por ahora.
					if (res.pausada) { card.innerHTML = '<p class="mb-0">' + t.vacPausada + '</p>'; return; }
					// Precios y mínimos al día: el socio los cambia sin esperar a que se publique el sitio.
					if (res.plan && res.plan.base > 0) D.plan = res.plan;
					if (res.minimos) minimos = res.minimos;
					ocupadas = V.nochesOcupadas((D.bloqueos || []).concat(res.ocupadas));
					if (estado.llegada && ocupadas[estado.llegada]) { estado.llegada = ''; estado.salida = ''; estado.campo = 'llegada'; }
					else if (estado.salida && !V.validarEstancia({ llegada: estado.llegada, salida: estado.salida, ocupadas: ocupadas, nochesMin: nochesMin, minimos: minimos, hoy: hoy }).ok) { estado.salida = ''; estado.campo = 'salida'; }
					var enfocado = cuerpo.contains(document.activeElement);
					pintar(enfocado);
					actualizar();
				})
				.catch(function () {});
		}

		// Fechas y huéspedes elegidos en el listado vacacional.
		var qs = new URLSearchParams(location.search);
		if (V.validarEstancia({ llegada: qs.get('llegada'), salida: qs.get('salida'), ocupadas: ocupadas, nochesMin: nochesMin, minimos: minimos, hoy: hoy }).ok) {
			estado.llegada = qs.get('llegada'); estado.salida = qs.get('salida'); estado.mes = mesDe(estado.llegada);
		}
		if (selHuespedes && qs.get('huespedes') && selHuespedes.querySelector('option[value="' + (+qs.get('huespedes') || 0) + '"]')) selHuespedes.value = +qs.get('huespedes');

		if (!tituloMes.id) tituloMes.id = 'vac-mes-' + (id || 'x').replace(/[^\w-]/g, '');
		pintar(false);
		actualizar();
	}

	// Listado vacacional: muestra solo las casas libres para las fechas y huéspedes elegidos,
	// y lleva esa elección a la ficha para no volver a pedirla.
	var buscar = document.getElementById('vac-buscar');
	if (buscar) {
		var hoyB = V.hoy();
		buscar.llegada.min = hoyB;
		buscar.llegada.addEventListener('change', function () {
			buscar.salida.min = buscar.llegada.value ? V.sumarDias(buscar.llegada.value, 1) : hoyB;
			if (buscar.salida.value && buscar.salida.value <= buscar.llegada.value) buscar.salida.value = '';
		});
		buscar.addEventListener('submit', function (e) {
			e.preventDefault();
			var q = { llegada: buscar.llegada.value, salida: buscar.salida.value, huespedes: +buscar.huespedes.value || 1 };
			var libres = 0;
			Array.prototype.forEach.call(document.querySelectorAll('#vac-grid .listing-col'), function (col) {
				var item = col.querySelector('[data-vac]'), d = {};
				try { d = JSON.parse(item.getAttribute('data-vac')); } catch (err) {}
				var ok = q.huespedes <= (d.huespedesMax || 1) && V.validarEstancia({ llegada: q.llegada, salida: q.salida, ocupadas: V.nochesOcupadas(d.bloqueos || []), nochesMin: d.nochesMin || 1, minimos: d.minimos, hoy: hoyB }).ok;
				col.hidden = !ok;
				if (!ok) return;
				libres++;
				// El precio de la tarjeta pasa a ser el total de esas fechas (con limpieza e impuestos), que es lo que se compara.
				var c = d.plan ? V.cotizarEstancia({ plan: d.plan, llegada: q.llegada, salida: q.salida, limpieza: d.limpieza }) : null;
				var precio = col.querySelector('.price span');
				if (c && c.total > 0 && precio) {
					precio.textContent = buscar.getAttribute(c.noches === 1 ? 'data-total1' : 'data-totaln')
						.replace('{total}', (d.moneda === 'GTQ' ? 'Q ' : 'US$ ') + c.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
						.replace('{n}', c.noches);
				}
				Array.prototype.forEach.call(col.querySelectorAll('a[href]'), function (a) {
					a.href = a.pathname + '?llegada=' + q.llegada + '&salida=' + q.salida + '&huespedes=' + q.huespedes;
				});
			});
			document.getElementById('listing-empty').hidden = libres > 0;
		});
	}

	var cards = document.querySelectorAll('[data-vacacional]');
	for (var i = 0; i < cards.length; i++) iniciar(cards[i]);
})();
