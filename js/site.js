(function () {

	'use strict';

	var config = window.EQ_CONFIG || {};
	var EN = document.documentElement.lang === 'en';
	var T = EN ? {
		errorDatos: 'Please enter your name and a valid phone number (8+ digits).',
		gracias: 'Thank you! We received your request and an advisor will contact you shortly.',
		fallo: 'We couldn\'t send the form.', escribenos: 'Message us on WhatsApp', soy: 'Hi, my name is ', visita: ' I would like to visit on ', tel: ' My phone: ',
		una: '1 property', varias: ' properties', escribe: 'Tell us what you are looking for.', buscando: 'Searching…', sinConexion: 'We couldn\'t connect. Please use the filters below.',
		cuota: 'Estimated payment: ', alMes: ' per month', enganche: 'Down payment ', prestamo: ' · Loan '
	} : {
		errorDatos: 'Escribe tu nombre y un teléfono válido (8 dígitos o más).',
		gracias: '¡Gracias! Recibimos tus datos y un asesor te contactará pronto.',
		fallo: 'No pudimos enviar el formulario.', escribenos: 'Escríbenos por WhatsApp', soy: 'Hola, soy ', visita: ' Me gustaría visitarla el ', tel: ' Mi teléfono: ',
		una: '1 propiedad', varias: ' propiedades', escribe: 'Escribe qué estás buscando.', buscando: 'Buscando…', sinConexion: 'No pudimos conectar. Usa los filtros de abajo.',
		cuota: 'Cuota aproximada: ', alMes: ' al mes', enganche: 'Enganche ', prestamo: ' · Préstamo '
	};

	// ------------------------------------------------------------ Campañas (Google Ads, Meta, UTM)
	// Se guarda la última visita que llegó desde una campaña para atribuir el lead al anuncio.
	var CAMPOS_CAMPANA = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
	var campana = null;
	try {
		var qs = new URLSearchParams(location.search);
		var nueva = {};
		CAMPOS_CAMPANA.forEach(function (k) { if (qs.get(k)) nueva[k] = qs.get(k).slice(0, 150); });
		if (Object.keys(nueva).length) {
			nueva.landing = location.pathname.slice(0, 150);
			localStorage.setItem('eq_campana', JSON.stringify({ datos: nueva, t: Date.now() }));
		}
		var guardada = JSON.parse(localStorage.getItem('eq_campana') || 'null');
		if (guardada && Date.now() - guardada.t < 30 * 24 * 3600 * 1000) campana = guardada.datos;
	} catch (e) { /* almacenamiento no disponible */ }

	// ------------------------------------------------------------ Seguimiento (Meta Pixel + GTM)

	// Nombres equivalentes en Google Analytics 4.
	var GA4_EVENTS = { Lead: 'generate_lead', Contact: 'contact', Search: 'search', ViewContent: 'view_item' };

	function track(event, params) {
		params = params || {};
		if (window.fbq) window.fbq('track', event, params);
		window.dataLayer = window.dataLayer || [];
		window.dataLayer.push(Object.assign({ event: 'eq_' + event.toLowerCase() }, params));
		if (window.gtag) {
			window.gtag('event', GA4_EVENTS[event] || event, params);
			// Conversiones de Google Ads configuradas en el panel.
			var conversion = event === 'Lead' ? config.adsLead : event === 'Contact' ? config.adsContact : '';
			if (conversion) window.gtag('event', 'conversion', { send_to: conversion });
		}
	}

	var viewContent = document.body.getAttribute('data-view-content');
	if (viewContent) {
		try { track('ViewContent', JSON.parse(viewContent)); } catch (e) { /* datos mal formados: se ignora */ }
	}

	document.addEventListener('click', function (e) {
		var link = e.target.closest('a[data-track], a[href^="tel:"], a[href^="mailto:"], a[href*="wa.me/"]');
		if (!link) return;
		var channel = link.href.indexOf('wa.me') > -1 ? 'whatsapp' : link.href.indexOf('tel:') === 0 ? 'telefono' : link.href.indexOf('mailto:') === 0 ? 'correo' : 'otro';
		track(link.getAttribute('data-track') || 'Contact', { canal: channel });
	});

	// ------------------------------------------------------------ Formularios de contacto (leads)

	function randomId() {
		var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		var out = '';
		var bytes = window.crypto.getRandomValues(new Uint8Array(20));
		for (var i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
		return out;
	}

	function str(v) { return { stringValue: String(v || '') }; }

	// Guarda el lead en Firestore por REST: no hace falta cargar el SDK en el sitio público.
	function saveLead(lead) {
		var base = 'projects/' + config.projectId + '/databases/(default)/documents';
		var fields = {
			nombre: str(lead.nombre),
			telefono: str(lead.telefono),
			email: str(lead.email),
			mensaje: str(lead.mensaje),
			origen: str(lead.origen),
			pagina: str(lead.pagina),
			propertyId: str(lead.propertyId),
			propertyTitulo: str(lead.propertyTitulo),
			agentId: str(lead.agentId),
			estado: str('nuevo')
		};
		if (lead.fechaVisita) fields.fechaVisita = str(lead.fechaVisita);
		if (lead.tipoVisita) fields.tipoVisita = str(lead.tipoVisita);
		fields.idioma = str(lead.idioma);
		if (lead.campana) {
			var mapa = {};
			Object.keys(lead.campana).slice(0, 8).forEach(function (k) { mapa[k] = str(lead.campana[k]); });
			fields.campana = { mapValue: { fields: mapa } };
		}
		var body = {
			writes: [{
				update: { name: base + '/leads/' + randomId(), fields: fields },
				currentDocument: { exists: false },
				updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }]
			}]
		};
		var url = 'https://firestore.googleapis.com/v1/' + base + ':commit' + (config.apiKey ? '?key=' + config.apiKey : '');
		return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
			.then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); });
	}

	function whatsappFallback(lead) {
		var text = T.soy + lead.nombre + '. ' + (lead.mensaje || '') + (lead.fechaVisita ? T.visita + lead.fechaVisita + '.' : '') + T.tel + lead.telefono;
		return 'https://wa.me/' + String(config.whatsapp || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(text);
	}

	function setStatus(form, html, ok) {
		var box = form.querySelector('.lead-form-status');
		box.className = 'lead-form-status mt-3 ' + (ok ? 'text-success' : 'text-danger');
		box.innerHTML = html;
	}

	document.querySelectorAll('.lead-form').forEach(function (form) {
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			if (form.empresa && form.empresa.value) return; // trampa para bots
			var lead = {
				nombre: form.nombre.value.trim(),
				telefono: form.telefono.value.trim(),
				email: form.email.value.trim(),
				mensaje: form.mensaje.value.trim(),
				origen: form.getAttribute('data-origen') || 'sitio',
				pagina: location.pathname,
				propertyId: form.getAttribute('data-property-id') || '',
				propertyTitulo: form.getAttribute('data-property-titulo') || '',
				agentId: form.getAttribute('data-agent-id') || ''
			};
			if (form.fechaVisita && form.fechaVisita.value) lead.fechaVisita = form.fechaVisita.value;
			if (form.tipoVisita) lead.tipoVisita = form.tipoVisita.value;
			lead.idioma = EN ? 'en' : 'es';
			if (campana) lead.campana = campana;
			if (!lead.nombre || lead.telefono.replace(/\D/g, '').length < 8) {
				setStatus(form, T.errorDatos, false);
				return;
			}
			var button = form.querySelector('button[type=submit]');
			button.disabled = true;

			var done = function () {
				track('Lead', { content_name: lead.propertyTitulo || lead.origen, content_ids: lead.propertyId ? [lead.propertyId] : [] });
				form.reset();
				setStatus(form, T.gracias, true);
			};
			var fail = function () {
				var wa = config.whatsapp ? ' <a href="' + whatsappFallback(lead) + '" target="_blank" rel="noopener">' + T.escribenos + '</a>.' : '';
				setStatus(form, T.fallo + wa, false);
			};

			if (!config.projectId) {
				// Sin base de datos configurada: se envía por WhatsApp.
				if (config.whatsapp) {
					window.open(whatsappFallback(lead), '_blank', 'noopener');
					done();
				} else {
					fail();
				}
				button.disabled = false;
				return;
			}
			saveLead(lead).then(done, fail).then(function () { button.disabled = false; });
		});
	});

	// ------------------------------------------------------------ Filtros del listado

	var grid = document.getElementById('listing-grid');
	if (grid) {
		var PER_PAGE = 12;
		var form = document.getElementById('listing-filters');
		var cols = Array.prototype.slice.call(grid.querySelectorAll('.listing-col'));
		var countEl = document.getElementById('listing-count');
		var emptyEl = document.getElementById('listing-empty');
		var pager = document.getElementById('listing-pagination');
		var preset = document.body.getAttribute('data-preset-operacion') || '';
		var rutas = { '': document.body.getAttribute('data-base') || '/propiedades/', venta: document.body.getAttribute('data-ruta-venta') || '/propiedades/venta/', renta: document.body.getAttribute('data-ruta-renta') || '/propiedades/renta/' };
		var presetZona = document.body.getAttribute('data-preset-zona') || '';
		var page = 1;
		var lastSearch = '';

		var params = new URLSearchParams(location.search);
		['q', 'tipo', 'zona', 'habitaciones', 'min', 'max', 'orden'].forEach(function (k) {
			if (params.get(k) && form.elements[k]) form.elements[k].value = params.get(k);
		});
		page = Math.max(1, parseInt(params.get('pagina'), 10) || 1);

		var normalize = function (s) {
			return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
		};

		var apply = function (pushState) {
			var f = form.elements;
			var q = normalize(f.q.value.trim());
			var min = parseFloat(f.min.value) || 0;
			var max = parseFloat(f.max.value) || Infinity;
			var hab = parseInt(f.habitaciones.value, 10) || 0;

			var visible = cols.filter(function (col) {
				var d = col.firstElementChild.dataset;
				var precio = parseFloat(d.precio) || 0;
				return (!q || q.split(/\s+/).every(function (w) { return normalize(d.texto).indexOf(w) > -1; }))
					&& (!f.tipo.value || d.tipo === f.tipo.value)
					&& (!f.zona.value || d.zona === f.zona.value)
					&& (!hab || (parseInt(d.habitaciones, 10) || 0) >= hab)
					&& (precio >= min || !precio) && (precio <= max);
			});

			var orden = f.orden.value;
			visible.sort(function (a, b) {
				var da = a.firstElementChild.dataset, db = b.firstElementChild.dataset;
				if (orden === 'precio-asc') return (parseFloat(da.precio) || Infinity) - (parseFloat(db.precio) || Infinity);
				if (orden === 'precio-desc') return (parseFloat(db.precio) || 0) - (parseFloat(da.precio) || 0);
				return cols.indexOf(a) - cols.indexOf(b);
			});

			var pages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
			page = Math.min(page, pages);
			cols.forEach(function (c) { c.hidden = true; });
			visible.forEach(function (c, i) {
				grid.appendChild(c);
				c.hidden = i < (page - 1) * PER_PAGE || i >= page * PER_PAGE;
			});

			countEl.textContent = visible.length === 1 ? T.una : visible.length + T.varias;
			emptyEl.hidden = visible.length > 0;
			pager.innerHTML = '';
			if (pages > 1) {
				for (var i = 1; i <= pages; i++) {
					var a = document.createElement('a');
					a.href = '#';
					a.textContent = i;
					a.dataset.page = i;
					if (i === page) { a.className = 'active'; a.setAttribute('aria-current', 'page'); }
					pager.appendChild(a);
				}
			}

			if (pushState) {
				var qs = new URLSearchParams();
				['q', 'tipo', 'zona', 'habitaciones', 'min', 'max', 'orden'].forEach(function (k) {
					if (f[k].value && !(k === 'orden' && f[k].value === 'recientes')) qs.set(k, f[k].value);
				});
				if (page > 1) qs.set('pagina', page);
				history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : ''));
				var signature = qs.toString();
				if (signature && signature !== lastSearch) {
					lastSearch = signature;
					track('Search', { search_string: f.q.value || f.zona.value || f.tipo.value });
				}
			}
		};

		// La operación cambia de página para que cada listado tenga su propia URL indexable.
		form.elements.operacion.addEventListener('change', function () {
			var op = form.elements.operacion.value;
			if (op === preset) return;
			var qs = location.search;
			location.href = rutas[op] + qs;
		});

		// En la página de una zona, elegir otra zona lleva al listado general filtrado.
		if (presetZona) {
			form.elements.zona.addEventListener('change', function () {
				var z = form.elements.zona.value;
				location.href = rutas[preset] + (z ? '?zona=' + encodeURIComponent(z) : '');
			});
		}

		var timer;
		form.addEventListener('input', function (e) {
			if (e.target.name === 'operacion' || (presetZona && e.target.name === 'zona')) return;
			clearTimeout(timer);
			timer = setTimeout(function () { page = 1; apply(true); }, 250);
		});
		form.addEventListener('submit', function (e) { e.preventDefault(); page = 1; apply(true); });
		form.addEventListener('reset', function () {
			setTimeout(function () {
				form.elements.operacion.value = preset;
				if (presetZona) form.elements.zona.value = presetZona;
				page = 1;
				apply(true);
			});
		});
		pager.addEventListener('click', function (e) {
			var a = e.target.closest('a[data-page]');
			if (!a) return;
			e.preventDefault();
			page = parseInt(a.dataset.page, 10);
			apply(true);
			grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});

		apply(false);

		// Búsqueda inteligente: la IA convierte la frase del visitante en filtros.
		var iaBtn = document.getElementById('ia-buscar');
		if (iaBtn) {
			var iaInput = document.getElementById('ia-texto');
			var iaStatus = document.querySelector('.ia-search-status');
			var opciones = function (sel) {
				return Array.prototype.slice.call(sel.options).map(function (o) { return o.value; }).filter(Boolean);
			};
			var buscarIA = function () {
				var texto = iaInput.value.trim();
				if (texto.length < 4) { iaStatus.textContent = T.escribe; return; }
				iaBtn.disabled = true;
				iaStatus.textContent = T.buscando;
				fetch('/api/ia', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ tarea: 'busquedaPublica', datos: { texto: texto, zonas: opciones(form.elements.zona), tipos: opciones(form.elements.tipo) } })
				}).then(function (res) { return res.json().then(function (b) { if (!res.ok) throw new Error(b.error || 'Error'); return b; }); })
					.then(function (r) {
						track('Search', { search_string: texto });
						var f = form.elements;
						var hab = Math.min(4, r.habitaciones || 0);
						var valores = { tipo: r.tipo || '', zona: r.zona || '', habitaciones: hab ? String(hab) : '', max: r.precioMaximo ? String(Math.round(r.precioMaximo)) : '', min: '', q: r.texto || '' };
						if (r.operacion && r.operacion !== preset) {
							var qs = new URLSearchParams();
							Object.keys(valores).forEach(function (k) { if (valores[k]) qs.set(k, valores[k]); });
							location.href = rutas[r.operacion] + (qs.toString() ? '?' + qs : '');
							return;
						}
						Object.keys(valores).forEach(function (k) { if (f[k] && !(presetZona && k === 'zona')) f[k].value = valores[k]; });
						page = 1;
						apply(true);
						iaStatus.textContent = r.respuesta || '';
					})
					.catch(function (err) { iaStatus.textContent = err.message === 'Failed to fetch' ? T.sinConexion : err.message; })
					.then(function () { iaBtn.disabled = false; });
			};
			iaBtn.addEventListener('click', buscarIA);
			iaInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); buscarIA(); } });
		}
	}

	// ------------------------------------------------------------ Calculadora de cuota

	document.querySelectorAll('[data-calc]').forEach(function (box) {
		var precio = parseFloat(box.getAttribute('data-precio')) || 0;
		var prefijo = box.getAttribute('data-moneda') === 'GTQ' ? 'Q' : 'US$';
		var out = box.querySelector('.calc-result');
		var fmt = function (n) { return prefijo + ' ' + Math.round(n).toLocaleString('en-US'); };
		var calc = function () {
			var enganche = Math.min(90, Math.max(0, parseFloat(box.querySelector('[name=enganche]').value) || 0));
			var tasa = Math.max(0, parseFloat(box.querySelector('[name=tasa]').value) || 0) / 100 / 12;
			var meses = Math.max(1, parseInt(box.querySelector('[name=anios]').value, 10) || 1) * 12;
			var prestamo = precio * (1 - enganche / 100);
			var cuota = tasa ? prestamo * tasa / (1 - Math.pow(1 + tasa, -meses)) : prestamo / meses;
			out.innerHTML = T.cuota + '<strong>' + fmt(cuota) + T.alMes + '</strong><br><span class="small">' + T.enganche + fmt(precio * enganche / 100) + T.prestamo + fmt(prestamo) + '</span>';
		};
		box.addEventListener('input', calc);
		calc();
	});

	// ------------------------------------------------------------ Copiar enlace de una propiedad

	document.querySelectorAll('.js-copy-link').forEach(function (btn) {
		btn.addEventListener('click', function () {
			var url = btn.getAttribute('data-url');
			var ok = function () {
				btn.classList.add('copied');
				btn.setAttribute('aria-label', 'Enlace copiado');
				setTimeout(function () { btn.classList.remove('copied'); btn.setAttribute('aria-label', 'Copiar enlace'); }, 2000);
			};
			if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, function () { window.prompt('Copia el enlace:', url); });
			else window.prompt('Copia el enlace:', url);
		});
	});

	// ------------------------------------------------------------ Galería de la landing VIP

	var lightbox = document.getElementById('vip-lightbox');
	if (lightbox && lightbox.showModal) {
		var items = Array.prototype.slice.call(document.querySelectorAll('.vip-gallery-item img'));
		var img = lightbox.querySelector('img');
		var current = 0;
		var show = function (i) {
			current = (i + items.length) % items.length;
			img.src = items[current].src;
			img.alt = items[current].alt;
		};
		document.querySelectorAll('.vip-gallery-item').forEach(function (btn) {
			btn.addEventListener('click', function () {
				show(parseInt(btn.dataset.index, 10));
				lightbox.showModal();
			});
		});
		lightbox.querySelector('.vip-lb-close').addEventListener('click', function () { lightbox.close(); });
		lightbox.querySelector('.vip-lb-prev').addEventListener('click', function () { show(current - 1); });
		lightbox.querySelector('.vip-lb-next').addEventListener('click', function () { show(current + 1); });
		lightbox.addEventListener('click', function (e) { if (e.target === lightbox) lightbox.close(); });
		document.addEventListener('keydown', function (e) {
			if (!lightbox.open) return;
			if (e.key === 'ArrowLeft') show(current - 1);
			if (e.key === 'ArrowRight') show(current + 1);
		});
	}

})();
