(function () {

	'use strict';

	var config = window.EQ_CONFIG || {};

	// ------------------------------------------------------------ Seguimiento (Meta Pixel + GTM)

	function track(event, params) {
		if (window.fbq) window.fbq('track', event, params || {});
		window.dataLayer = window.dataLayer || [];
		window.dataLayer.push(Object.assign({ event: 'eq_' + event.toLowerCase() }, params || {}));
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
		var text = 'Hola, soy ' + lead.nombre + '. ' + (lead.mensaje || '') + ' Mi teléfono: ' + lead.telefono;
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
			if (!lead.nombre || lead.telefono.replace(/\D/g, '').length < 8) {
				setStatus(form, 'Escribe tu nombre y un teléfono válido (8 dígitos o más).', false);
				return;
			}
			var button = form.querySelector('button[type=submit]');
			button.disabled = true;

			var done = function () {
				track('Lead', { content_name: lead.propertyTitulo || lead.origen, content_ids: lead.propertyId ? [lead.propertyId] : [] });
				form.reset();
				setStatus(form, '¡Gracias! Recibimos tus datos y un asesor te contactará pronto.', true);
			};
			var fail = function () {
				var wa = config.whatsapp ? ' <a href="' + whatsappFallback(lead) + '" target="_blank" rel="noopener">Escríbenos por WhatsApp</a>.' : '';
				setStatus(form, 'No pudimos enviar el formulario.' + wa, false);
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

			countEl.textContent = visible.length === 1 ? '1 propiedad' : visible.length + ' propiedades';
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
			location.href = '/propiedades/' + (op ? op + '/' : '') + qs;
		});

		var timer;
		form.addEventListener('input', function (e) {
			if (e.target.name === 'operacion') return;
			clearTimeout(timer);
			timer = setTimeout(function () { page = 1; apply(true); }, 250);
		});
		form.addEventListener('submit', function (e) { e.preventDefault(); page = 1; apply(true); });
		form.addEventListener('reset', function () {
			setTimeout(function () {
				form.elements.operacion.value = preset;
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
	}

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
