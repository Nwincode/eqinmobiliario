/* Calculadora de renta del sitio (fichas en venta y /calculadora-de-renta/).
 * Las cuentas las hace window.EQRenta (js/calc-renta.js); aquí solo se leen los campos y se muestran resultados.
 * Los textos vienen del HTML (<script class="renta-t">), editables en el panel. */
(function () {
	'use strict';
	var R = window.EQRenta;
	if (!R) return;

	function fmt(texto, datos) {
		return String(texto || '').replace(/\{(\w+)\}/g, function (m, k) { return datos[k] != null ? datos[k] : m; });
	}
	function el(tag, cls, text) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text != null) e.textContent = text;
		return e;
	}
	function num(input) {
		if (!input) return 0;
		var v = parseFloat(String(input.value).replace(/,/g, ''));
		return isFinite(v) && v > 0 ? v : 0;
	}

	function iniciar(card) {
		var t = {};
		try { t = JSON.parse(card.querySelector('.renta-t').textContent); } catch (e) { /* sin textos */ }
		var lang = card.getAttribute('data-lang') || 'es';
		var tipo = card.getAttribute('data-tipo') || '';
		var campo = function (name) { return card.querySelector('[name="' + name + '"]'); };
		var out = function (name) { return card.querySelector('[data-out="' + name + '"]'); };
		var monedaSel = campo('moneda');
		var ultimo = null;

		function moneda() { return monedaSel ? monedaSel.value : (card.getAttribute('data-moneda') || 'USD'); }
		function dinero(v) { return R.dinero(v, moneda(), lang); }
		function pct(v) { return R.porcentaje(v, lang, 1); }
		function entradas() {
			var uso = campo('uso').value;
			return {
				tipo: tipo, precio: num(campo('precio')), moneda: moneda(), rentaMensual: num(campo('renta')), uso: uso,
				regimenISR: 'capital', regimenIVA: 'auto',
				vacancia: Math.min(100, num(campo('vacancia'))), gastosOperativos: Math.min(100, num(campo('gastos'))), reservaCapex: 0,
				// Comisión de arrendamiento: plazo elegido (por defecto el del motor); el resto, valores del motor.
				plazoContrato: num(campo('plazoContrato')) || R.PARAMS.plazoContrato.valor
			};
		}

		// Cascada del primer año, como un estado de resultados: − restas, = subtotales.
		function desglose(a, regimen) {
			var p = out('desglose');
			p.textContent = '';
			p.appendChild(el('p', 'renta-d-titulo', t.rentaDesgloseTitulo));
			var dl = el('dl');
			var filas = [
				['', t.rentaDBruta, a.pgi], ['resta', t.rentaDVacancia, a.vacancia], ['subtotal', t.rentaDEfectivo || '', a.cobrado],
				['resta', t.rentaDGastos, a.opex], ['resta', t.rentaDIusi, a.iusi, true]
			];
			// Comisión de arrendamiento repartida en los años del contrato (en caja se paga al firmar).
			if (a.comisionDevengada > 0) filas.push(['resta', t.rentaDComision || '', a.comisionDevengada]);
			filas.push(['resta', t.rentaDIsr, a.isr]);
			// IVA según el monto cobrado al año: pequeño contribuyente lo pagas tú; general lo cobras aparte.
			if (regimen === 'pequeno') filas.push(['resta', t.rentaDIvaPeq || '', a.ivaPropietario]);
			filas.push(['total', t.rentaDNeto, a.neto], ['mes', t.rentaDNetoMes || '', a.neto / 12]);
			if (regimen === 'general') filas.push(['info', t.rentaDIvaGen || '', a.ivaInquilino]);
			for (var i = 0; i < filas.length; i++) {
				var f = filas[i];
				if (!f[1]) continue;
				var fila = el('div', 'renta-d' + (f[0] ? ' renta-d-' + f[0] : ''));
				var dt = el('dt');
				// El IUSI de vivienda está exento: se dice con palabras en vez de mostrar «US$ 0» (y sin «−», porque no resta nada).
				var exento = f[3] && !(f[2] > 0) && t.rentaDExento;
				var signo = exento ? '' : f[0] === 'resta' ? '−' : (f[0] === 'subtotal' || f[0] === 'total') ? '=' : '';
				var s = el('span', 'renta-d-signo', signo || '\u00a0'); // sin signo, un espacio: así la fila conserva la línea base
				s.setAttribute('aria-hidden', 'true');
				dt.appendChild(s);
				dt.appendChild(document.createTextNode(f[1]));
				fila.appendChild(dt);
				fila.appendChild(el('dd', null, exento || (f[0] === 'resta' && f[2] > 0 ? '−' : '') + dinero(f[2])));
				dl.appendChild(fila);
			}
			p.appendChild(dl);
		}

		function escenarios(e) {
			var box = out('escenarios');
			var grid = box.querySelector('.renta-esc-grid');
			grid.textContent = '';
			var lista = R.escenarios(e, [-10, 0, 10]);
			var etiquetas = [t.rentaMenos10, t.rentaActual, t.rentaMas10];
			for (var i = 0; i < lista.length; i++) {
				var c = el('div', 'renta-esc' + (lista[i].delta === 0 ? ' is-actual' : ''));
				c.appendChild(el('p', 'renta-esc-titulo', etiquetas[i]));
				var dl = el('dl');
				var pares = [[t.rentaEscRenta, dinero(lista[i].rentaMensual)], [t.rentaEscNeto, dinero(lista[i].netoMensual)], [t.rentaEscRend, pct(lista[i].rendimientoNeto)]];
				for (var k = 0; k < pares.length; k++) {
					var d = el('div');
					d.appendChild(el('dt', null, pares[k][0]));
					d.appendChild(el('dd', null, pares[k][1]));
					dl.appendChild(d);
				}
				c.appendChild(dl);
				grid.appendChild(c);
			}
			box.hidden = false;
		}

		function calcular() {
			var e = entradas();
			var spans = card.querySelectorAll('.renta-moneda');
			for (var i = 0; i < spans.length; i++) spans[i].textContent = '(' + (e.moneda === 'GTQ' ? 'Q' : 'US$') + ')';
			var listo = e.precio > 0 && e.rentaMensual > 0;
			out('vacio').hidden = listo;
			out('desglose').hidden = !listo;
			out('escenarios').hidden = !listo;
			out('iva').hidden = true;
			card.classList.toggle('is-vacia', !listo);
			if (!listo) {
				ultimo = null;
				out('neto').textContent = '—';
				out('rendNeto').textContent = '—';
				out('rendBruto').textContent = '—';
				return;
			}
			var r = R.calcular(e);
			ultimo = r;
			out('neto').textContent = dinero(r.netoMensual);
			out('neto').classList.toggle('is-negativo', r.netoMensual < 0);
			out('rendNeto').textContent = pct(r.rendimientoNeto);
			out('rendBruto').textContent = pct(r.rendimientoBruto);
			desglose(r.anio1, r.entradas.regimenIVA);
			if (r.entradas.regimenIVA === 'general') {
				out('iva').textContent = fmt(t.rentaIva, { monto: dinero(r.anio1.ivaInquilino / 12) });
				out('iva').hidden = false;
			}
			escenarios(e);
		}

		function resumen() {
			var e = ultimo.entradas, a = ultimo.anio1;
			var usoSel = campo('uso');
			return fmt(t.rentaResumen, {
				precio: dinero(e.precio), renta: dinero(e.rentaMensual), uso: usoSel.options[usoSel.selectedIndex].text,
				neto: dinero(ultimo.netoMensual), rend: pct(ultimo.rendimientoNeto), bruto: pct(ultimo.rendimientoBruto),
				vacancia: e.vacancia, gastos: e.gastosOperativos,
				bruta: dinero(a.pgi), vacMonto: dinero(a.vacancia), efectivo: dinero(a.cobrado), gastosMonto: dinero(a.opex),
				iusi: a.iusi > 0 ? dinero(a.iusi) : (t.rentaDExento || dinero(0)),
				comisionResta: a.comisionDevengada > 0 ? ' − ' + (t.rentaDComision || '') + ' ' + dinero(a.comisionDevengada) : '',
				isr: dinero(a.isr), netoAnual: dinero(a.neto),
				// Pequeño contribuyente entra en la cuenta; el IVA general va aparte, como dato.
				ivaResta: e.regimenIVA === 'pequeno' ? ' − ' + (t.rentaDIvaPeq || 'IVA') + ' ' + dinero(a.ivaPropietario) : '',
				ivaNota: e.regimenIVA === 'general' ? '\n' + (t.rentaDIvaGen || 'IVA') + ': ' + dinero(a.ivaInquilino) : ''
			}).slice(0, 1900);
		}

		card.addEventListener('input', calcular);
		card.addEventListener('change', calcular);

		var cta = card.querySelector('[data-renta-cta]');
		if (cta) cta.addEventListener('click', function () {
			var estado = card.querySelector('.renta-estado');
			if (!ultimo) {
				var vacio = num(campo('precio')) ? campo('renta') : campo('precio');
				vacio.focus();
				return;
			}
			var form = document.querySelector(card.getAttribute('data-form')) || document.querySelector('.lead-form');
			if (!form) return;
			if (!form.hasAttribute('data-origen-original')) {
				form.setAttribute('data-origen-original', form.getAttribute('data-origen') || '');
				// Después de enviar (form.reset) el formulario vuelve a su origen normal.
				form.addEventListener('reset', function () { form.setAttribute('data-origen', form.getAttribute('data-origen-original')); });
			}
			form.setAttribute('data-origen', 'calculadora');
			if (form.mensaje) {
				form.mensaje.value = resumen();
				// El resumen tiene varias líneas: se agranda el cuadro para que se lea sin desplazarse.
				if (form.mensaje.rows < 7) form.mensaje.rows = 7;
			}
			if (estado) estado.textContent = t.rentaListo || '';
			var reducir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			form.scrollIntoView({ behavior: reducir ? 'auto' : 'smooth', block: 'start' });
			if (form.nombre) setTimeout(function () { form.nombre.focus({ preventScroll: true }); }, reducir ? 0 : 400);
		});

		calcular();
	}

	function todos() {
		var cards = document.querySelectorAll('[data-renta]');
		for (var i = 0; i < cards.length; i++) iniciar(cards[i]);
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', todos);
	else todos();
})();
