/* Renta vacacional por noches: calendario de disponibilidad, desglose y solicitud de reserva.
   Usa window.EQVacacional (js/calc-vacacional.js). La solicitud viaja por el formulario de
   contacto de siempre (js/site.js llama a form.eqReserva() antes de enviar el lead). */
(function () {
	'use strict';
	var V = window.EQVacacional;
	if (!V) return;

	function pad(n) { return (n < 10 ? '0' : '') + n; }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
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
		// Precio de cada día en el calendario: con centavos, como todo precio (decisión del dueño); la letra es chica.
		// En la casilla del calendario, sin centavos (se lee de un vistazo); el desglose y el total llevan los exactos.
		function dineroCorto(n) {
			return corto + Math.round(Number(n) || 0).toLocaleString('en-US');
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
			// Eligiendo la salida, cualquier llegada posible también se puede tocar: así se cambia la llegada sin trabarse.
			if (eligiendoSalida()) return salidaValida(f) || (f !== estado.llegada && llegadaValida(f));
			return llegadaValida(f);
		}

		// La primera salida posible desde la llegada elegida (null si no hay ninguna en el calendario).
		function primeraSalida() {
			if (!estado.llegada) return null;
			for (var i = 1; i <= 400; i++) { var f = V.sumarDias(estado.llegada, i); if (f > mesMax + '-31') return null; if (salidaValida(f)) return f; }
			return null;
		}
		function etiqueta(f) {
			var partes = [fDia.format(fechaUTC(f))];
			if (f === estado.llegada) partes.push(t.vacLlegadaElegida);
			else if (f === estado.salida) partes.push(t.vacSalidaElegida);
			if (f >= hoy && !ocupadas[f]) partes.push(dinero(V.precioNoche(f, D.plan)) + ' ' + t.vacPorNoche);
			if (ocupadas[f] && f >= hoy) partes.push(t.vacOcupado);
			if (minimoHasta && f > estado.llegada && f < minimoHasta) partes.push(t.vacEnMinimo);
			if (!disponible(f) && f !== estado.llegada && f !== estado.salida) partes.push(t.vacNoDisponible);
			return partes.join(', ');
		}

		var minimoHasta = null; // eligiendo la salida: la primera posible (los días antes son la estancia mínima)
		function pintar(enfocar) {
			var ym = estado.mes;
			minimoHasta = eligiendoSalida() ? primeraSalida() : null;
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
				if (minimoHasta && f > estado.llegada && f < minimoHasta) clases.push('is-minimo');
				if (minimoHasta && f === minimoHasta) clases.push('is-salida-min');
				var elegido = f === estado.llegada || f === estado.salida;
				// Donde va el precio: el precio, o «Ocupado» si está reservado o bloqueado (sin decir por qué).
				var precio = f < hoy ? '' : '<span class="vac-dia-precio" aria-hidden="true">' + (ocupadas[f] ? esc(t.vacOcupadoCelda) : dineroCorto(V.precioNoche(f, D.plan))) + '</span>';
				h += '<td role="gridcell"' + (elegido ? ' aria-selected="true"' : '') + '><button type="button" class="' + clases.join(' ') + '" data-fecha="' + f + '"' +
					' tabindex="' + (f === foco ? '0' : '-1') + '"' + (libre || elegido ? '' : ' aria-disabled="true"') +
					' aria-label="' + etiqueta(f).replace(/"/g, '&quot;') + '"><span class="vac-dia-num" aria-hidden="true">' + d + '</span>' + precio + '</button></td>';
			}
			var resto = (7 - ((inicio + total) % 7)) % 7;
			for (var r = 0; r < resto; r++) h += '<td role="gridcell"></td>';
			h += '</tr>';
			h += '</tbody></table>';
			cuerpo.innerHTML = h;
			if (enfocar) {
				var b = cuerpo.querySelector('[data-fecha="' + foco + '"]');
				if (b) b.focus();
			}
			fijarBurbuja();
		}

		// El botón de enviar dice el paso que sigue: «Elige tu fecha de llegada», «Ahora elige tu salida», «Solicitar reserva»
		// (mientras falta una fecha, al tocarlo lleva al calendario).
		var textoBoton = form && form.querySelector('button[type=submit] .btn-texto');
		function actualizar() {
			if (textoBoton) textoBoton.textContent = estado.llegada && estado.salida ? t.vacSolicitar : estado.llegada ? t.vacBotonSalida : t.vacBotonLlegada;
			outLlegada.textContent = estado.llegada ? mayus(fCorta.format(fechaUTC(estado.llegada))) : t.vacSinFecha;
			outSalida.textContent = estado.salida ? mayus(fCorta.format(fechaUTC(estado.salida))) : t.vacSinFecha;
			for (var i = 0; i < botonesCampo.length; i++) {
				var activo = botonesCampo[i].getAttribute('data-campo') === (estado.llegada && !estado.salida ? 'salida' : estado.campo);
				botonesCampo[i].classList.toggle('is-activo', activo && !(estado.llegada && estado.salida));
			}
			// La ayuda es corta (2 líneas como máximo) y su caja tiene alto fijo: lo de abajo (huéspedes, formulario, botón)
			// no se mueve en cada toque. Los avisos van en la burbuja, que flota y no empuja nada.
			if (!estado.llegada) ayuda.textContent = estado.nota || t.vacEligeLlegada;
			else if (!estado.salida) {
				// Aquí, donde el cliente está mirando: la estancia mínima, la primera salida (y un botón a su mes si no se ve),
				// cómo cambiar la llegada y borrar. Sin esto, los días apagados no se entienden.
				var primera = primeraSalida();
				// El mínimo que de verdad fija la primera salida (un mínimo por fechas más adelante puede ser mayor).
				var minimo = primera ? V.nochesEntre(estado.llegada, primera) : minimoDe(estado.llegada, V.sumarDias(estado.llegada, 1));
				// El mínimo lo dice la burbuja sobre la primera salida; aquí solo el paso (y la fecha si queda en otro mes).
				var html = esc(primera ? t.vacEligeSalida + (minimo > 1 && mesDe(primera) !== estado.mes ? ' ' + fmt(t.vacSalidaDesde, { fecha: fCorta.format(fechaUTC(primera)) }) : '') : t.vacSinSalida);
				if (primera && mesDe(primera) !== estado.mes) html += ' <button type="button" class="btn btn-link vac-ayuda-btn" data-ver-mes="' + mesDe(primera) + '">' + esc(fmt(t.vacVerMes, { mes: fMes.format(fechaUTC(mesDe(primera) + '-01')) })) + '</button>';
				html += ' <button type="button" class="btn btn-link vac-ayuda-btn vac-borrar">' + esc(t.vacBorrar) + '</button>';
				ayuda.innerHTML = html;
			}
			else { ayuda.textContent = noches(V.nochesEntre(estado.llegada, estado.salida)) + ': ' + outLlegada.textContent + ' → ' + outSalida.textContent + '.'; }
			estado.nota = '';
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

		// Una burbuja chica que flota sobre el calendario (no ocupa espacio ni mueve nada) y apunta a un día.
		// Fija: «Mínimo N noches» sobre la primera salida posible mientras se elige la salida. De un momento: «día ocupado»…
		// sobre el día que se tocó; a los 3 s vuelve la fija.
		var globo = null;
		function burbuja(f, texto, fija) {
			var dia = cuerpo.querySelector('[data-fecha="' + f + '"]');
			var cal = card.querySelector('.vac-cal');
			if (!dia || !cal) return ocultarBurbuja();
			if (!globo) {
				globo = document.createElement('div');
				globo.className = 'vac-burbuja';
				globo.setAttribute('role', 'status');
				cal.appendChild(globo);
			}
			globo.textContent = texto;
			var c = cal.getBoundingClientRect(), d = dia.getBoundingClientRect();
			var izq = d.left - c.left + d.width / 2;
			globo.style.top = (d.top - c.top) + 'px';
			globo.classList.add('is-visible');
			// Sin salirse del calendario en los días de las orillas (la flecha sigue apuntando al día).
			var medio = globo.offsetWidth / 2, centro = Math.max(medio + 4, Math.min(c.width - medio - 4, izq));
			globo.style.left = centro + 'px';
			globo.style.setProperty('--flecha', (izq - centro) + 'px');
			clearTimeout(globo.eqTimer);
			if (!fija) globo.eqTimer = setTimeout(fijarBurbuja, 3000);
		}
		function ocultarBurbuja() { if (globo) { clearTimeout(globo.eqTimer); globo.classList.remove('is-visible'); } }
		// La fija: solo eligiendo la salida, con un mínimo de más de una noche y la primera salida en el mes que se ve.
		function fijarBurbuja() {
			var primera = estado.llegada && !estado.salida ? primeraSalida() : '';
			var n = primera ? V.nochesEntre(estado.llegada, primera) : 0;
			if (primera && n > 1 && mesDe(primera) === estado.mes) burbuja(primera, fmt(t.vacMinimoGlobo, { n: n }), true);
			else ocultarBurbuja();
		}
		// Tocó una noche dentro del mínimo: la burbuja de la primera salida late una vez (no sale otro mensaje).
		function latirBurbuja() {
			fijarBurbuja();
			if (globo) { globo.classList.remove('is-pulso'); void globo.offsetWidth; globo.classList.add('is-pulso'); }
		}
		function elegir(f) {
			// Tocar otra vez la llegada (sin salida) la quita.
			if (estado.llegada && !estado.salida && f === estado.llegada) return borrarFechas();
			var cambio = '';
			if (eligiendoSalida() && f > estado.llegada && !salidaValida(f)) {
				var v = V.validarEstancia({ llegada: estado.llegada, salida: f, ocupadas: ocupadas, nochesMin: nochesMin, minimos: minimos, hoy: hoy });
				// Antes del mínimo: la llegada se queda y se dice cuál es la primera salida (no se cambia la llegada sin decir nada).
				if (v.error === 'minimo') {
					var primera = primeraSalida();
					return latirBurbuja();
				}
				// Con noches ocupadas en medio: ese día pasa a ser la llegada, y se dice por qué.
				if (!llegadaValida(f)) return burbuja(f, t.vacEntreOcupadas);
				cambio = fmt(t.vacNuevaLlegada, { fecha: fCorta.format(fechaUTC(f)) });
			}
			var conSalida = false;
			if (eligiendoSalida() && f > estado.llegada && salidaValida(f)) {
				estado.salida = f;
				estado.campo = 'llegada';
				conSalida = true;
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
			if (cambio) burbuja(f, cambio);
			// Con las dos fechas el paso que sigue es el formulario: la pantalla baja suave hasta el presupuesto, con los
			// campos y el botón debajo (en celular y tableta; en computadora el cuadro va al lado y ya se ve).
			if (conSalida && !desglose.hidden && window.innerWidth < 992) setTimeout(function () {
				window.scrollTo({ top: Math.max(0, desglose.getBoundingClientRect().top + window.scrollY - 90), behavior: 'smooth' });
			}, 60);
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
			if (!b) return;
			// Un día ocupado no se elige, pero se dice por qué (no «no pasa nada»).
			if (b.getAttribute('aria-disabled') === 'true') {
				if (ocupadas[b.getAttribute('data-fecha')]) burbuja(b.getAttribute('data-fecha'), t.vacDiaOcupado);
				// Una noche rayada (dentro del mínimo) que no puede ser llegada: igual se dice cuál es el mínimo.
				else if (b.classList.contains('is-minimo') && estado.llegada) latirBurbuja();
				return;
			}
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
		function borrarFechas() {
			estado.llegada = ''; estado.salida = ''; estado.campo = 'llegada';
			pintar(false);
			actualizar();
			var b = cuerpo.querySelector('[tabindex="0"]');
			if (b) b.focus();
		}
		desglose.addEventListener('click', function (e) { if (e.target.closest('.vac-borrar')) borrarFechas(); });
		ayuda.addEventListener('click', function (e) {
			if (e.target.closest('.vac-borrar')) return borrarFechas();
			var ver = e.target.closest('[data-ver-mes]');
			if (ver) { estado.mes = ver.getAttribute('data-ver-mes'); estado.foco = ''; pintar(false); actualizar(); }
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
					// Se nota: el calendario se marca un momento y queda con el foco en un día para elegir.
					var cal = card.querySelector('.vac-cal');
					cal.scrollIntoView({ behavior: 'smooth', block: 'center' });
					cal.classList.add('vac-alerta');
					setTimeout(function () { cal.classList.remove('vac-alerta'); }, 1800);
					var dia = cuerpo.querySelector('[tabindex="0"]');
					if (dia) dia.focus({ preventScroll: true });
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

		// «US$ … por noche» de la ficha (arriba y en este cuadro) con el precio de hoy (`precioDesde`, la misma regla
		// del panel y de la publicación): el cliente no ve un precio arriba y otro en el calendario.
		function ponerDesde(plan) {
			var desde = V.precioDesde(plan, hoy);
			if (!(desde > 0)) return;
			// El monto que esté escrito (el de la publicación, aunque una tarifa ya haya vencido) se cambia por el de hoy.
			var monto = new RegExp(prefijo.replace(/[$]/g, '\\$') + ' [\\d,]+\\.\\d{2}');
			document.querySelectorAll('.ficha-precio, .vac-desde strong').forEach(function (el) {
				var n = el.firstChild;
				if (n && n.nodeType === 3 && monto.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(monto, dinero(desde));
			});
			// Viernes y sábado, con el precio de hoy; si ya es igual al de entre semana, no se dice.
			var finde = Number(plan.finde) || 0, base = Number(plan.base) || 0;
			document.querySelectorAll('.vac-finde').forEach(function (el) {
				el.hidden = !(finde > 0 && finde !== base);
				var out = el.querySelector('[data-out="finde"]');
				if (out && !el.hidden) out.textContent = dinero(finde);
			});
		}
		ponerDesde(D.plan);

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
					if (res.plan && res.plan.base > 0) { D.plan = res.plan; ponerDesde(D.plan); }
					if (res.minimos) minimos = res.minimos;
					ocupadas = V.nochesOcupadas((D.bloqueos || []).concat(res.ocupadas));
					var antes = estado.llegada + estado.salida;
					if (estado.llegada && ocupadas[estado.llegada]) { estado.llegada = ''; estado.salida = ''; estado.campo = 'llegada'; }
					else if (estado.salida && !V.validarEstancia({ llegada: estado.llegada, salida: estado.salida, ocupadas: ocupadas, nochesMin: nochesMin, minimos: minimos, hoy: hoy }).ok) { estado.salida = ''; estado.campo = 'salida'; }
					var enfocado = cuerpo.contains(document.activeElement);
					pintar(enfocado);
					actualizar();
					// Las fechas que traía (del listado o elegidas antes) ya no están libres: se dice, no se borran en silencio.
					if (antes && antes !== estado.llegada + estado.salida) { estado.nota = t.vacFechasYaNo; actualizar(); }
				})
				.catch(function () {});
		}

		// Fechas y huéspedes elegidos en el listado vacacional.
		var qs = new URLSearchParams(location.search);
		var traia = qs.get('llegada') && qs.get('salida');
		var sirve = traia && V.validarEstancia({ llegada: qs.get('llegada'), salida: qs.get('salida'), ocupadas: ocupadas, nochesMin: nochesMin, minimos: minimos, hoy: hoy }).ok;
		if (sirve) {
			estado.llegada = qs.get('llegada'); estado.salida = qs.get('salida'); estado.mes = mesDe(estado.llegada);
		}
		if (selHuespedes && qs.get('huespedes') && selHuespedes.querySelector('option[value="' + (+qs.get('huespedes') || 0) + '"]')) selHuespedes.value = +qs.get('huespedes');

		if (!tituloMes.id) tituloMes.id = 'vac-mes-' + (id || 'x').replace(/[^\w-]/g, '');
		pintar(false);
		actualizar();
		if (traia && !sirve) { estado.nota = t.vacFechasYaNo; actualizar(); }

		// Volvió a la ficha después de pedir esta casa (botón «atrás», otra pestaña): el enlace a su solicitud, arriba.
		try {
			var miToken = localStorage.getItem('eq-reserva');
			if (form && id && miToken && /^[A-Za-z0-9]{20,40}$/.test(miToken) && localStorage.getItem('eq-reserva-casa') === id) {
				var ya = document.createElement('p');
				ya.className = 'vac-ya-pediste';
				ya.textContent = t.vacYaPediste + ' ';
				var ir = document.createElement('a');
				ir.href = '/reserva/#' + miToken;
				ir.textContent = t.vacChatVer;
				ya.appendChild(ir);
				form.parentNode.insertBefore(ya, form);
			}
		} catch (e) { /* sin memoria del navegador */ }
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
		// La disponibilidad al día de cada casa (calendarios de Airbnb, Booking y VRBO, reservas y precios de hoy), una vez
		// por casa; si no responde, quedan los datos publicados.
		var alDia = {};
		function disponibilidad(id) {
			if (!id || !window.fetch) return Promise.resolve(null);
			if (!alDia[id]) alDia[id] = fetch('/api/disponibilidad?id=' + encodeURIComponent(id), { headers: { Accept: 'application/json' } })
				.then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
			return alDia[id];
		}
		buscar.addEventListener('submit', function (e) {
			e.preventDefault();
			var q = { llegada: buscar.llegada.value, salida: buscar.salida.value, huespedes: +buscar.huespedes.value || 1 };
			var cols = Array.prototype.slice.call(document.querySelectorAll('#vac-grid .listing-col'));
			var datos = cols.map(function (col) { var d = {}; try { d = JSON.parse(col.querySelector('[data-vac]').getAttribute('data-vac')); } catch (err) {} return d; });
			var boton = buscar.querySelector('button[type=submit]');
			if (boton) boton.disabled = true;
			Promise.all(datos.map(function (d) { return disponibilidad(d.id); })).then(function (vivos) {
				if (boton) boton.disabled = false;
				filtrar(q, cols, datos, vivos);
			});
		});
		function filtrar(q, cols, datos, vivos) {
			var libres = 0;
			cols.forEach(function (col, i) {
				var d = datos[i], vivo = vivos[i] || {};
				var plan = vivo.plan && vivo.plan.base > 0 ? vivo.plan : d.plan;
				var ocupadas = V.nochesOcupadas((d.bloqueos || []).concat(vivo.ocupadas || []));
				var ok = !vivo.pausada && q.huespedes <= (d.huespedesMax || 1) && V.validarEstancia({ llegada: q.llegada, salida: q.salida, ocupadas: ocupadas, nochesMin: d.nochesMin || 1, minimos: vivo.minimos || d.minimos, hoy: hoyB }).ok;
				col.hidden = !ok;
				if (!ok) return;
				libres++;
				// El precio de la tarjeta pasa a ser el total de esas fechas (con limpieza e impuestos), que es lo que se compara.
				var c = plan ? V.cotizarEstancia({ plan: plan, llegada: q.llegada, salida: q.salida, limpieza: d.limpieza }) : null;
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
		}
	}

	var cards = document.querySelectorAll('[data-vacacional]');
	for (var i = 0; i < cards.length; i++) iniciar(cards[i]);
})();
