(function () {

	'use strict';

	var config = window.EQ_CONFIG || {};
	var EN = document.documentElement.lang === 'en';
	var T = EN ? {
		errorDatos: 'Please enter your name and a valid phone number (8+ digits).',
		gracias: 'Thank you! We received your request and an advisor will contact you shortly.',
		fallo: 'We couldn\'t send the form.', escribenos: 'Message us on WhatsApp', soy: 'Hi, my name is ', visita: ' I would like to visit on ', tel: ' My phone: ',
		ver: 'Show', una: '1 property', varias: ' properties', escribe: 'Tell us what you are looking for.', buscando: 'Searching…', sinConexion: 'We couldn\'t connect. Please use the filters below.',
		cuota: 'Estimated payment: ', alMes: ' per month', enganche: 'Down payment ', prestamo: ' · Loan '
	} : {
		errorDatos: 'Escribe tu nombre y un teléfono válido (8 dígitos o más).',
		gracias: '¡Gracias! Recibimos tus datos y un asesor te contactará pronto.',
		fallo: 'No pudimos enviar el formulario.', escribenos: 'Escríbenos por WhatsApp', soy: 'Hola, soy ', visita: ' Me gustaría visitarla el ', tel: ' Mi teléfono: ',
		ver: 'Ver', una: '1 propiedad', varias: ' propiedades', escribe: 'Escribe qué estás buscando.', buscando: 'Buscando…', sinConexion: 'No pudimos conectar. Usa los filtros de abajo.',
		cuota: 'Cuota aproximada: ', alMes: ' al mes', enganche: 'Enganche ', prestamo: ' · Préstamo '
	};

	// Textos personalizados desde el panel (config.t.jsGracias → T.gracias, etc.).
	var textosPanel = config.t || {};
	Object.keys(T).forEach(function (k) {
		var clave = k === 'escribenos' ? k : 'js' + k.charAt(0).toUpperCase() + k.slice(1);
		if (typeof textosPanel[clave] === 'string') T[k] = textosPanel[clave];
	});

	// ------------------------------------------------------------ Aviso «View this site in English»
	// Solo se ofrece (nunca se cambia el idioma solo) y no vuelve a salir si se cierra.
	var aviso = document.querySelector('.aviso-idioma');
	if (aviso && /^en/i.test(navigator.language || '') && !localStorage.getItem('eq_aviso_idioma')) {
		aviso.hidden = false;
		aviso.querySelector('button').addEventListener('click', function () {
			aviso.hidden = true;
			localStorage.setItem('eq_aviso_idioma', '1');
		});
	}

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
			if (conversion) window.gtag('event', 'conversion', { send_to: conversion, transaction_id: params.transaction_id });
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
		if (lead.propietarioId) fields.propietarioId = str(lead.propietarioId);
		if (lead.fechaVisita) fields.fechaVisita = str(lead.fechaVisita);
		if (lead.tipoVisita) fields.tipoVisita = str(lead.tipoVisita);
		fields.idioma = str(lead.idioma);
		if (lead.campana) {
			var mapa = {};
			Object.keys(lead.campana).slice(0, 8).forEach(function (k) { mapa[k] = str(lead.campana[k]); });
			fields.campana = { mapValue: { fields: mapa } };
		}
		// Renta vacacional: fechas, noches, huéspedes y total de la solicitud de reserva.
		if (lead.reserva) {
			var res = {};
			Object.keys(lead.reserva).slice(0, 10).forEach(function (k) {
				var v = lead.reserva[k];
				res[k] = typeof v === 'number' && isFinite(v) ? { doubleValue: v } : str(v);
			});
			fields.reserva = { mapValue: { fields: res } };
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

	// Avisa por correo al equipo (si está configurado en Netlify). Si falla, no pasa nada:
	// el lead ya quedó guardado.
	function avisarEquipo(lead) {
		try {
			fetch('/api/aviso-lead', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) })
				.catch(function () {});
		} catch (err) { /* navegador sin fetch keepalive */ }
	}

	function whatsappFallback(lead) {
		var text = T.soy + lead.nombre + '. ' + (lead.mensaje || '') + (lead.fechaVisita ? T.visita + lead.fechaVisita + '.' : '') + T.tel + lead.telefono;
		return 'https://wa.me/' + String(config.whatsapp || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(text);
	}

	function setStatus(form, html, ok) {
		var box = form.querySelector('.lead-form-status');
		box.className = 'lead-form-status mt-3 ' + (ok ? 'text-success' : 'text-danger');
		box.innerHTML = '<span class="' + (ok ? 'icon-check-circle' : 'icon-exclamation-triangle') + ' eq-ic" aria-hidden="true"></span>' + html;
	}

	document.querySelectorAll('.lead-form').forEach(function (form) {
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			if (form.empresa && form.empresa.value) return; // trampa para bots
			var lead = {
				nombre: form.nombre.value.trim(),
				telefono: form.telefono.value.trim(),
				email: form.email ? form.email.value.trim() : '',
				mensaje: form.mensaje ? form.mensaje.value.trim() : '',
				origen: form.getAttribute('data-origen') || 'sitio',
				pagina: location.pathname,
				propertyId: form.getAttribute('data-property-id') || '',
				propertyTitulo: form.getAttribute('data-property-titulo') || '',
				agentId: form.getAttribute('data-agent-id') || ''
			};
			if (form.fechaVisita && form.fechaVisita.value) lead.fechaVisita = form.fechaVisita.value;
			if (form.tipoVisita) lead.tipoVisita = form.tipoVisita.value;
			// Cuadro de reserva (js/vacacional.js): sin fechas válidas no se envía.
			var reserva = typeof form.eqReserva === 'function' ? form.eqReserva() : null;
			if (typeof form.eqReserva === 'function') {
				if (!reserva) return;
				lead.reserva = reserva.datos;
				// Casa de un socio: la solicitud le aparece en su panel.
				if (form.getAttribute('data-propietario-id')) lead.propietarioId = form.getAttribute('data-propietario-id');
				lead.mensaje = (reserva.resumen + (lead.mensaje ? '\n' + lead.mensaje : '')).slice(0, 2000);
			}
			lead.idioma = EN ? 'en' : 'es';
			if (campana) lead.campana = campana;
			if (!lead.nombre || lead.telefono.replace(/\D/g, '').length < 8) {
				setStatus(form, T.errorDatos, false);
				return;
			}
			var button = form.querySelector('button[type=submit]');
			button.disabled = true;

			var done = function () {
				// Conversiones mejoradas de Google Ads: gtag cifra (SHA-256) el correo y el teléfono
				// antes de enviarlos; mejoran la atribución de anuncios sin exponer los datos.
				if (window.gtag) {
					var tel = lead.telefono.replace(/\D/g, '');
					if (tel.length === 8) tel = '502' + tel;
					var userData = { phone_number: '+' + tel };
					if (lead.email) userData.email = lead.email.trim().toLowerCase();
					window.gtag('set', 'user_data', userData);
				}
				track('Lead', { content_name: lead.propertyTitulo || lead.origen, content_ids: lead.propertyId ? [lead.propertyId] : [], transaction_id: 'lead-' + Date.now().toString(36) });
				form.reset();
				if (!reserva) return setStatus(form, T.gracias, true);
				// Reserva: se abre el WhatsApp de quien atiende la casa con el mensaje ya escrito.
				var wa = 'https://wa.me/' + String(form.eqWhatsapp || config.whatsapp || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(reserva.whatsapp);
				setStatus(form, reserva.gracias + ' <a class="btn btn-primary btn-sm mt-2" href="' + wa + '" target="_blank" rel="noopener"><span class="icon-whatsapp eq-ic" aria-hidden="true"></span>' + reserva.abrir + '</a>', true);
				location.href = wa;
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
			// Si las reglas de la base todavía no aceptan «propietarioId», se guarda sin él: la solicitud no se pierde.
			saveLead(lead).catch(function (err) {
				if (!lead.propietarioId) throw err;
				delete lead.propietarioId;
				return saveLead(lead);
			}).then(function () { avisarEquipo(lead); done(); }, fail).then(function () { button.disabled = false; });
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
		var verBtn = document.getElementById('listing-ver');
		var abrirBtn = document.getElementById('filtros-abrir');
		var preset = document.body.getAttribute('data-preset-operacion') || '';
		var rutas = { '': document.body.getAttribute('data-base') || '/propiedades/', venta: document.body.getAttribute('data-ruta-venta') || '/propiedades/venta/', renta: document.body.getAttribute('data-ruta-renta') || '/propiedades/renta/', vacacional: document.body.getAttribute('data-ruta-vacacional') || '' };
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
			verBtn.textContent = T.ver + ' ' + countEl.textContent;
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
		form.addEventListener('change', function (e) {
			if (e.target.name !== 'operacion') return;
			var op = form.elements.operacion.value;
			if (op === preset) return;
			// En la página de una zona se conserva la zona como filtro del nuevo listado.
			var params = new URLSearchParams(location.search);
			if (presetZona) params.set('zona', presetZona);
			var qs = params.toString();
			location.href = (rutas[op] || rutas['']) + (qs ? '?' + qs : '');
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
		form.elements.orden.addEventListener('change', function () { page = 1; apply(true); });
		form.addEventListener('submit', function (e) { e.preventDefault(); page = 1; apply(true); filtros(false); });

		// En celular los filtros son un panel inferior que abre la lupa.
		var filtros = function (abrir) {
			form.classList.toggle('abierto', abrir);
			abrirBtn.setAttribute('aria-expanded', abrir);
		};
		abrirBtn.addEventListener('click', function () { filtros(true); form.elements.q.focus(); });
		document.getElementById('filtros-cerrar').addEventListener('click', function () { filtros(false); });
		document.addEventListener('keydown', function (e) { if (e.key === 'Escape') filtros(false); });
		document.addEventListener('click', function (e) {
			if (!form.contains(e.target) && !abrirBtn.contains(e.target)) filtros(false);
		});
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

		// Búsqueda por frase: se lee la frase del visitante y se convierte en filtros (sin IA).
		var iaBtn = document.getElementById('ia-buscar');
		if (iaBtn) {
			var iaInput = document.getElementById('ia-texto');
			var iaStatus = document.querySelector('.ia-search-status');
			// Opciones de un desplegable o de un grupo de pastillas, con su texto visible.
			var opciones = function (campo) {
				return Array.prototype.map.call(campo.options || campo, function (o) {
					return { value: o.value, texto: (o.labels ? o.labels[0] : o).textContent.trim() };
				}).filter(function (o) { return o.value; });
			};
			var SINONIMOS = {
				casa: ['casa', 'casas', 'house', 'houses', 'home', 'homes', 'chalet'],
				apartamento: ['apartamento', 'apartamentos', 'apto', 'aptos', 'depto', 'departamento', 'apartment', 'apartments', 'condo', 'condos', 'penthouse', 'loft'],
				terreno: ['terreno', 'terrenos', 'lote', 'lotes', 'lot', 'lots', 'land'],
				oficina: ['oficina', 'oficinas', 'office', 'offices'],
				local: ['local', 'locales', 'comercial', 'retail'],
				bodega: ['bodega', 'bodegas', 'galera', 'warehouse'],
				finca: ['finca', 'fincas', 'farm', 'rancho']
			};
			var monto = function (txt) {
				var m = txt.match(/(\d+(?:[.,]\d+)*)\s*(millones|millon|mil|mm|k|m\b)?/);
				if (!m) return 0;
				var num = /^\d{1,3}([.,]\d{3})+$/.test(m[1]) ? m[1].replace(/[.,]/g, '') : m[1].replace(',', '.');
				var v = parseFloat(num);
				if (m[2] === 'k' || m[2] === 'mil') v *= 1000;
				else if (m[2]) v *= 1000000;
				return v;
			};
			var palabra = function (t, w) { return new RegExp('(^|[^a-z0-9])' + w + '([^a-z0-9]|$)').test(t); };
			var leerFrase = function (texto) {
				var t = normalize(texto);
				var r = { operacion: '', tipo: '', zona: '', habitaciones: 0, max: 0, min: 0 };
				if (/\b(rent|renta|rentar|alquiler|alquilar|arrendar|arrendamiento)\b/.test(t)) r.operacion = 'renta';
				if (rutas.vacacional && /\b(vacacional|vacaciones|vacation|airbnb|por noche|per night|nightly|noches|nights)\b/.test(t)) r.operacion = 'vacacional';
				else if (/\b(venta|vender|comprar|compra|buy|sale)\b/.test(t)) r.operacion = 'venta';
				opciones(form.elements.tipo).some(function (o) {
					var pals = (SINONIMOS[o.value] || []).concat([normalize(o.value), normalize(o.texto)]);
					if (pals.some(function (w) { return w && palabra(t, w); })) { r.tipo = o.value; return true; }
					return false;
				});
				var z = t.match(/\b(?:zona|zone|z\.?)\s*(\d{1,2})\b/);
				opciones(form.elements.zona).some(function (o) {
					var zn = normalize(o.value);
					var hit = z ? new RegExp('\\b(zona|zone)\\s*' + z[1] + '\\b').test(zn) : (zn.length > 3 && !/^(zona|zone)\s*\d+$/.test(zn) && t.indexOf(zn) > -1);
					if (hit) { r.zona = o.value; return true; }
					return false;
				});
				var hab = t.match(/(\d+)\s*\+?\s*(?:habitacion|habitaciones|hab\b|cuartos?|recamaras?|dormitorios?|bedrooms?|beds?|bd\b|br\b)/);
				if (hab) r.habitaciones = parseInt(hab[1], 10);
				var tope = t.match(/(?:hasta|maximo|max|presupuesto(?:\s+de)?|no mas de|menos de|under|up to|below|less than|budget(?: of)?)\s*(?:de\s*)?(?:us\s*\$|usd|\$|q\.?)?\s*(\d[\d.,]*\s*(?:millones|millon|mil|mm|k|m\b)?)/);
				var piso = t.match(/(?:desde|minimo|mas de|from|at least|over|more than)\s*(?:us\s*\$|usd|\$|q\.?)?\s*(\d[\d.,]*\s*(?:millones|millon|mil|mm|k|m\b)?)/);
				var suelto = t.match(/(?:us\s*\$|usd|\$|\bq\.?)\s*(\d[\d.,]*\s*(?:millones|millon|mil|mm|k|m\b)?)|(\d[\d.,]*\s*(?:millones|millon|mil|mm|k)\b)/);
				r.max = tope ? monto(tope[1]) : 0;
				r.min = piso ? monto(piso[1]) : 0;
				if (!r.max && !r.min && suelto) r.max = monto(suelto[1] || suelto[2]);
				if (r.max < 100) r.max = 0;
				if (r.min < 100) r.min = 0;
				return r;
			};
			var etiqueta = function (sel, v) {
				var o = opciones(sel).filter(function (x) { return x.value === v; })[0];
				return o ? o.texto : v;
			};
			var buscarIA = function () {
				var texto = iaInput.value.trim();
				if (texto.length < 3) { iaStatus.textContent = T.escribe; return; }
				var r = leerFrase(texto);
				track('Search', { search_string: texto });
				var f = form.elements;
				var hab = Math.min(4, r.habitaciones || 0);
				var valores = { tipo: r.tipo, zona: r.zona, habitaciones: hab ? String(hab) : '', max: r.max ? String(Math.round(r.max)) : '', min: r.min ? String(Math.round(r.min)) : '', q: '' };
				var nada = !r.operacion && !r.tipo && !r.zona && !hab && !r.max && !r.min;
				if (nada) {
					var VACIAS = /^(busco|buscamos|quiero|necesito|una?|unos?|unas?|el|la|los|las|de|del|en|con|para|por|que|y|o|me|mi|i|want|need|looking|for|a|an|the|in|with|and|or|of|to)$/;
					valores.q = normalize(texto).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2 && !VACIAS.test(w); }).slice(0, 3).join(' ');
				}
				if (r.operacion && r.operacion !== preset) {
					var qs = new URLSearchParams();
					Object.keys(valores).forEach(function (k) { if (valores[k]) qs.set(k, valores[k]); });
					location.href = rutas[r.operacion] + (qs.toString() ? '?' + qs : '');
					return;
				}
				Object.keys(valores).forEach(function (k) { if (f[k] && !(presetZona && k === 'zona')) f[k].value = valores[k]; });
				page = 1;
				apply(true);
				var partes = [];
				if (r.tipo) partes.push(etiqueta(f.tipo, r.tipo));
				if (r.zona) partes.push(etiqueta(f.zona, r.zona));
				if (hab) partes.push(hab + (EN ? '+ bedrooms' : '+ habitaciones'));
				if (r.max) partes.push((EN ? 'up to ' : 'hasta ') + Math.round(r.max).toLocaleString('en-US'));
				if (r.min) partes.push((EN ? 'from ' : 'desde ') + Math.round(r.min).toLocaleString('en-US'));
				iaStatus.textContent = partes.length ? (EN ? 'Showing: ' : 'Mostrando: ') + partes.join(' · ') : (EN ? 'Searching by keywords. You can refine with the filters below.' : 'Buscando por palabras. Puedes afinar con los filtros de abajo.');
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
		var fmt = function (n) { return prefijo + ' ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
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
			// En celular abre el menú de compartir del teléfono; si no existe, copia el enlace.
			if (btn.hasAttribute('data-compartir') && navigator.share) {
				navigator.share({ title: document.title, url: url }).catch(function () {});
				return;
			}
			var nombre = btn.getAttribute('aria-label');
			var ok = function () {
				btn.classList.add('copied');
				btn.setAttribute('aria-label', 'Enlace copiado');
				setTimeout(function () { btn.classList.remove('copied'); btn.setAttribute('aria-label', nombre); }, 2000);
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

	// ------------------------------------------------------------ Galería de la ficha

	var fichaLb = document.getElementById('ficha-lightbox');
	if (fichaLb && fichaLb.showModal) {
		var fotosFicha = Array.prototype.slice.call(fichaLb.querySelectorAll('.flb-fotos span'));
		var lbImg = fichaLb.querySelector('img');
		var lbPie = fichaLb.querySelector('figcaption');
		var actual = 0;
		var mostrar = function (i) {
			actual = (i + fotosFicha.length) % fotosFicha.length;
			lbImg.src = fotosFicha[actual].getAttribute('data-src');
			lbImg.alt = fotosFicha[actual].getAttribute('data-alt');
			lbPie.textContent = (actual + 1) + ' / ' + fotosFicha.length;
		};
		document.querySelectorAll('.ficha-foto, .ficha-ver-todas').forEach(function (btn) {
			btn.addEventListener('click', function () {
				mostrar(parseInt(btn.getAttribute('data-index'), 10) || 0);
				fichaLb.showModal();
			});
		});
		fichaLb.querySelector('.flb-cerrar').addEventListener('click', function () { fichaLb.close(); });
		fichaLb.querySelector('.flb-prev').addEventListener('click', function () { mostrar(actual - 1); });
		fichaLb.querySelector('.flb-next').addEventListener('click', function () { mostrar(actual + 1); });
		fichaLb.addEventListener('click', function (e) { if (e.target === fichaLb) fichaLb.close(); });
		document.addEventListener('keydown', function (e) {
			if (!fichaLb.open) return;
			if (e.key === 'ArrowLeft') mostrar(actual - 1);
			if (e.key === 'ArrowRight') mostrar(actual + 1);
		});
		// Deslizar con el dedo dentro del visor.
		var inicioX = null;
		fichaLb.addEventListener('touchstart', function (e) { inicioX = e.touches[0].clientX; }, { passive: true });
		fichaLb.addEventListener('touchend', function (e) {
			if (inicioX === null) return;
			var dx = e.changedTouches[0].clientX - inicioX;
			if (Math.abs(dx) > 40) mostrar(actual + (dx < 0 ? 1 : -1));
			inicioX = null;
		});
		// Contador del carrusel en celular.
		var galeria = document.querySelector('.ficha-galeria');
		var contador = document.querySelector('.ficha-contador');
		if (galeria && contador) {
			var fotoVisible = function () { return Math.round(galeria.scrollLeft / galeria.clientWidth); };
			galeria.addEventListener('scroll', function () {
				contador.textContent = (fotoVisible() + 1) + ' / ' + fotosFicha.length;
			}, { passive: true });
			// Flechas del carrusel: dan la vuelta al llegar al final.
			[['.ficha-flecha-prev', -1], ['.ficha-flecha-next', 1]].forEach(function (f) {
				document.querySelector(f[0]).addEventListener('click', function () {
					var i = (fotoVisible() + f[1] + fotosFicha.length) % fotosFicha.length;
					galeria.scrollLeft = i * galeria.clientWidth;
				});
			});
		}
	}

	// Reseñas de Google: se leen en vivo de /api/resenas-google. Arriba va una barra delgada
	// con la calificación y, si hay reseñas, entran como diapositivas al MISMO carrusel de los
	// testimonios del panel (un solo carrusel y un solo par de flechas). Si no está configurado
	// o falla, la sección queda igual que sin Google.
	// Todo se arma con textContent (nunca innerHTML) porque el texto viene de terceros.
	var cajaGoogle = document.getElementById('resenas-google');
	if (cajaGoogle && window.fetch) {
		var txt = cajaGoogle.dataset;
		var seccionResenas = cajaGoogle.closest('.sec-testimonials');
		var el = function (tag, clase, texto) {
			var n = document.createElement(tag);
			if (clase) n.className = clase;
			if (texto) n.textContent = texto;
			return n;
		};
		// Nombre completo de la clase (icon-…) para que el recorte de CSS del build la conserve.
		var icono = function (clase) {
			var i = el('span', clase + ' eq-ic');
			i.setAttribute('aria-hidden', 'true');
			return i;
		};
		// Cinco estrellas: llenas, media (si la calificación lo pide) y vacías.
		var estrellas = function (valor) {
			var v = Math.max(0, Math.min(5, Number(valor) || 0));
			var mitades = Math.round(v * 2);
			var cont = el('span', 'gr-estrellas');
			cont.setAttribute('role', 'img');
			cont.setAttribute('aria-label', (Math.round(v * 10) / 10) + ' ' + txt.estrellas);
			for (var i = 1; i <= 5; i++) {
				var e = el('span', mitades >= i * 2 ? 'icon-star' : (mitades === i * 2 - 1 ? 'icon-star-half-o' : 'icon-star gr-estrella-vacia'));
				e.setAttribute('aria-hidden', 'true');
				cont.appendChild(e);
			}
			return cont;
		};
		var enlace = function (url, texto, clase) {
			var a = el('a', clase, texto);
			a.href = url; a.target = '_blank'; a.rel = 'noopener';
			return a;
		};
		var urlSegura = function (u) { return typeof u === 'string' && /^https:\/\//i.test(u) ? u : ''; };
		// Sin nombre se muestra el ícono de persona en lugar de una letra.
		var inicial = function (nombre) {
			var letra = String(nombre || '').trim().charAt(0).toUpperCase();
			var av = letra ? el('span', 'gr-avatar gr-avatar-letra', letra) : el('span', 'gr-avatar gr-avatar-letra');
			if (!letra) av.appendChild(icono('icon-user'));
			av.setAttribute('aria-hidden', 'true');
			return av;
		};
		var avatar = function (r) {
			var foto = urlSegura(r.autorFoto) || (/^\/[^/]/.test(r.autorFoto || '') ? r.autorFoto : '');
			if (!foto) return inicial(r.autor);
			var img = el('img', 'gr-avatar');
			img.src = foto; img.alt = ''; img.width = 44; img.height = 44;
			img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
			img.addEventListener('error', function () { img.replaceWith(inicial(r.autor)); });
			return img;
		};
		// Una diapositiva con la misma estructura que las del panel (.item > …) para que el
		// carrusel la trate igual. El texto no se cambia: solo se recorta a la vista con CSS.
		var botonMas = function () {
			var mas = el('button', 'gr-leer-mas', txt.mas);
			mas.type = 'button';
			mas.hidden = true;
			mas.setAttribute('aria-expanded', 'false');
			return mas;
		};
		var diapositiva = function (r) {
			var autor = String(r.autor || '').trim() || txt.anonimo || 'Google';
			var item = el('div', 'item gr-item');
			var tarjeta = el('article', 'gr-resena');
			var cabeza = el('header', 'gr-resena-cabeza');
			cabeza.appendChild(avatar(r));
			var quien = el('div', 'gr-resena-quien');
			var nombre = el('h3', 'gr-resena-autor');
			var perfil = urlSegura(r.autorUrl);
			if (perfil) nombre.appendChild(enlace(perfil, autor)); else nombre.textContent = autor;
			quien.appendChild(nombre);
			var linea = el('p', 'gr-resena-linea');
			linea.appendChild(estrellas(r.estrellas));
			if (r.fecha) linea.appendChild(el('span', 'gr-resena-fecha', String(r.fecha)));
			quien.appendChild(linea);
			cabeza.appendChild(quien);
			tarjeta.appendChild(cabeza);

			// Reseñas de solo estrellas (sin texto): no se dibujan comillas vacías.
			if (String(r.texto || '').trim()) {
				var cita = el('blockquote', 'gr-resena-texto');
				cita.appendChild(el('p', '', String(r.texto)));
				tarjeta.appendChild(cita);
				tarjeta.appendChild(botonMas());
			}

			var pie = el('footer', 'gr-resena-pie');
			var fuente = el('span', 'gr-fuente');
			fuente.appendChild(icono('icon-google'));
			fuente.appendChild(document.createTextNode(txt.publicada + ' Google'));
			pie.appendChild(fuente);
			var verla = urlSegura(r.enlace);
			if (verla) {
				var a = enlace(verla, txt.verResena, 'gr-ver');
				a.appendChild(icono('icon-external-link'));
				pie.appendChild(a);
			}
			tarjeta.appendChild(pie);
			item.appendChild(tarjeta);
			return item;
		};

		// Barra delgada: 4.9 ★★★★★ · Reseñas en Google · Basado en N reseñas · enlaces.
		var barra = function (d, calif) {
			var nota = el('div', 'gr-nota');
			nota.appendChild(el('span', 'gr-nota-num', calif.toFixed(1)));
			nota.appendChild(estrellas(calif));
			var detalle = el('p', 'gr-nota-detalle');
			var titulo = el('strong', 'gr-nota-titulo');
			titulo.appendChild(icono('icon-google'));
			titulo.appendChild(document.createTextNode(txt.titulo));
			detalle.appendChild(titulo);
			if (d.total) detalle.appendChild(el('span', 'gr-nota-total', txt.basado + ' ' + d.total + ' ' + txt.total));
			nota.appendChild(detalle);
			cajaGoogle.appendChild(nota);
			var botones = el('div', 'gr-botones');
			var ver = urlSegura(d.verEnGoogle), dejar = urlSegura(d.dejarResena);
			if (ver) {
				var v = enlace(ver, txt.ver, 'gr-boton');
				v.appendChild(icono('icon-external-link'));
				botones.appendChild(v);
			}
			if (dejar) {
				var b = enlace(dejar, '', 'gr-boton gr-boton-dejar');
				b.appendChild(icono('icon-pencil'));
				b.appendChild(document.createTextNode(txt.dejar));
				botones.appendChild(b);
			}
			if (botones.childNodes.length) cajaGoogle.appendChild(botones);
			cajaGoogle.hidden = false;
		};

		var envoltura = seccionResenas && seccionResenas.querySelector('.testimonial-slider-wrap');
		var carrusel = null;
		// «Leer más» solo en las reseñas que no caben en las líneas visibles (también en las
		// copias que el carrusel crea para dar la vuelta).
		var revisar = function () {
			if (!envoltura) return;
			envoltura.querySelectorAll('.gr-resena, .testimonial').forEach(function (t) {
				var p = t.querySelector('blockquote p'), mas = t.querySelector('.gr-leer-mas');
				if (!p || !mas || t.classList.contains('is-abierta')) return;
				mas.hidden = p.scrollHeight <= p.clientHeight + 2;
			});
		};
		// Un solo manejador para todas las diapositivas, copias incluidas (cloneNode no copia eventos).
		if (envoltura) {
			envoltura.addEventListener('click', function (ev) {
				var mas = ev.target.closest ? ev.target.closest('.gr-leer-mas') : null;
				if (!mas) return;
				var tarjeta = mas.closest('.gr-resena, .testimonial');
				var abierta = tarjeta.classList.toggle('is-abierta');
				mas.textContent = abierta ? txt.menos : txt.mas;
				mas.setAttribute('aria-expanded', String(abierta));
				// Mientras alguien lee una reseña abierta, el carrusel no avanza solo.
				if (abierta && carrusel && carrusel.pause) carrusel.pause();
			});
		}
		// Sin Google y sin testimonios del panel no queda nada que mostrar.
		var siVacia = function () {
			var lista = envoltura && envoltura.querySelector('.testimonial-slider');
			if (seccionResenas && cajaGoogle.hidden && (!lista || !lista.children.length)) seccionResenas.hidden = true;
		};

		fetch('/api/resenas-google?lang=' + (txt.lang === 'en' ? 'en' : 'es'))
			.then(function (r) { return r.ok ? r.json() : null; })
			.then(function (d) {
				if (!d || !d.configurado || !d.calificacion) return siVacia();
				barra(d, Number(d.calificacion) || 0);
				var resenas = (d.resenas || []).slice(0, 5);
				if (!resenas.length || !envoltura || typeof window.eqIniciarTestimonios !== 'function') return;
				// Se desarma el carrusel, se agregan las reseñas de Google al inicio y se vuelve a armar.
				carrusel = window.eqIniciarTestimonios(function (lista) {
					var primera = lista.firstChild;
					resenas.forEach(function (r) { lista.insertBefore(diapositiva(r), primera); });
					// Los testimonios del panel se recortan igual, para que todas midan lo mismo.
					lista.querySelectorAll('.testimonial blockquote').forEach(function (b) { b.after(botonMas()); });
					envoltura.classList.add('gr-mixto');
					var flechas = document.getElementById('testimonial-nav');
					if (flechas) flechas.hidden = false;
				});
				// Las diapositivas fuera de la vista (y sus copias) no reciben el foco del teclado:
				// ahora llevan enlaces y botones, y tns solo las marca con aria-hidden.
				var ocultas = function () {
					envoltura.querySelectorAll('.testimonial-slider > .tns-item').forEach(function (x) {
						x.inert = x.getAttribute('aria-hidden') === 'true';
					});
				};
				if (carrusel && carrusel.events) {
					ocultas();
					carrusel.events.on('indexChanged', ocultas);
					carrusel.events.on('transitionEnd', ocultas);
					carrusel.events.on('newBreakpointEnd', ocultas);
				}
				revisar();
				window.addEventListener('resize', revisar, { passive: true });
				if (window.AOS) window.AOS.refresh();
			})
			.catch(siVacia);
	}

	// Barra de navegación: fondo sólido al bajar de la portada.
	var siteNav = document.querySelector('.site-nav');
	if (siteNav) {
		var marcarScroll = function () { siteNav.classList.toggle('is-scrolled', window.scrollY > 40); };
		marcarScroll();
		window.addEventListener('scroll', marcarScroll, { passive: true });
	}

})();
