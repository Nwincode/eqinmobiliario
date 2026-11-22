(function () {

	'use strict';

	var config = window.EQ_CONFIG || {};
	var EN = document.documentElement.lang === 'en';
	var T = EN ? {
		errorCorreo: 'Please check your email (e.g. name@email.com).', quisiste: 'Did you mean {correo}?', usar: 'Use it', estaBien: 'If yours is right, tap send again.',
		faltaNombre: 'Please enter your name.', faltaTelefono: 'Please enter a valid phone number.', errorFecha: 'Pick a date from today on.', faltaCorreo: 'Please enter your email: we will let you know there when they reply.', revisa: 'Please check the fields marked in red.',
		gracias: 'Thank you! We received your request and an advisor will contact you shortly.',
		fallo: 'We couldn\'t send the form.', escribenos: 'Message us on WhatsApp', soy: 'Hi, my name is ', visita: ' I would like to visit on ', tel: ' My phone: ',
		ver: 'Show', enviando: 'Sending…', una: '1 property', varias: ' properties', escribe: 'Tell us what you are looking for.', buscando: 'Searching…', sinConexion: 'We couldn\'t connect. Please use the filters below.',
		cuota: 'Estimated payment: ', alMes: ' per month', enganche: 'Down payment ', prestamo: ' · Loan '
	} : {
		errorCorreo: 'Revisa tu correo (p. ej. nombre@correo.com).', quisiste: '¿Quisiste decir {correo}?', usar: 'Usar ese', estaBien: 'Si el tuyo está bien, toca enviar otra vez.',
		faltaNombre: 'Escribe tu nombre.', faltaTelefono: 'Escribe un teléfono válido (8 dígitos en Guatemala).', errorFecha: 'Elige una fecha de hoy en adelante.', faltaCorreo: 'Escribe tu correo: ahí te avisamos cuando te respondan.', revisa: 'Revisa los campos marcados en rojo.',
		gracias: '¡Gracias! Recibimos tus datos y un asesor te contactará pronto.',
		fallo: 'No pudimos enviar el formulario.', escribenos: 'Escríbenos por WhatsApp', soy: 'Hola, soy ', visita: ' Me gustaría visitarla el ', tel: ' Mi teléfono: ',
		ver: 'Ver', enviando: 'Enviando…', una: '1 propiedad', varias: ' propiedades', escribe: 'Escribe qué estás buscando.', buscando: 'Buscando…', sinConexion: 'No pudimos conectar. Usa los filtros de abajo.',
		cuota: 'Cuota aproximada: ', alMes: ' al mes', enganche: 'Enganche ', prestamo: ' · Préstamo '
	};

	// Fecha de la visita: de hoy (día de Guatemala, no el del navegador) a un año. El calendario no ofrece días pasados y,
	// si alguien la escribe a mano, el envío la revisa (diaValido). En WhatsApp va escrita («25 nov 2026»), no «2026-11-25».
	var DIA_MS = 86400000;
	var diaGt = function (sumar) { return new Date(Date.now() - 6 * 3600000 + (sumar || 0) * DIA_MS).toISOString().slice(0, 10); };
	var diaValido = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T12:00:00Z')) && v >= diaGt() && v <= diaGt(365); };
	var diaEscrito = function (v) { return new Date(v + 'T12:00:00Z').toLocaleDateString(EN ? 'en-US' : 'es-GT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
	document.querySelectorAll('input[name="fechaVisita"]').forEach(function (f) { f.min = diaGt(); f.max = diaGt(365); });

	// Textos personalizados desde el panel (config.t.jsGracias → T.gracias, etc.).
	var textosPanel = config.t || {};
	Object.keys(T).forEach(function (k) {
		var clave = k === 'escribenos' ? k : 'js' + k.charAt(0).toUpperCase() + k.slice(1);
		if (typeof textosPanel[clave] === 'string') T[k] = textosPanel[clave];
	});

	// ------------------------------------------------------------ Aviso «View this site in English»
	// Solo se ofrece (nunca se cambia el idioma solo) y no vuelve a salir si se cierra.
	var aviso = document.querySelector('.aviso-idioma');
	// (Con el almacenamiento bloqueado, se ofrece igual y no se recuerda: nada de esto tumba el resto del sitio.)
	var avisoCerrado = false;
	try { avisoCerrado = Boolean(localStorage.getItem('eq_aviso_idioma')); } catch (e) { /* sin memoria del navegador */ }
	if (aviso && /^en/i.test(navigator.language || '') && !avisoCerrado) {
		aviso.hidden = false;
		aviso.querySelector('button').addEventListener('click', function () {
			aviso.hidden = true;
			try { localStorage.setItem('eq_aviso_idioma', '1'); } catch (e) { /* sin memoria del navegador */ }
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

	// Guarda el lead de contacto en Firestore por REST: no hace falta cargar el SDK en el sitio público. (La solicitud de
	// reserva la guarda el servidor, con su chat: js/reserva-chat.js solicitar.)
	function saveLead(lead) {
		// El id se conserva en el lead: con él, /api/aviso-lead lee el lead guardado.
		lead.id = randomId();
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
				update: { name: base + '/leads/' + lead.id, fields: fields },
				currentDocument: { exists: false },
				updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }]
			}]
		};
		var url = 'https://firestore.googleapis.com/v1/' + base + ':commit' + (config.apiKey ? '?key=' + config.apiKey : '');
		return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
			.then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); });
	}

	// Avisa por correo al equipo (si está configurado en Netlify). Si falla, no pasa nada:
	// el lead ya quedó guardado. Solo va su id: la función lee el lead guardado.
	function avisarEquipo(lead) {
		try {
			fetch('/api/aviso-lead', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lead.id }) })
				.catch(function () {});
		} catch (err) { /* navegador sin fetch keepalive */ }
	}

	function whatsappFallback(lead) {
		var text = T.soy + lead.nombre + '. ' + (lead.mensaje || '') + (lead.fechaVisita ? T.visita + diaEscrito(lead.fechaVisita) + '.' : '') + T.tel + lead.telefono;
		return 'https://wa.me/' + String(config.whatsapp || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(text);
	}

	// Campos que faltan o están mal: cada uno en rojo con su mensaje debajo, y la página va al primero. Se quita al escribir.
	function quitarMarca(campo) {
		var caja = campo.closest('.input-group') || campo;
		campo.classList.remove('is-invalid');
		campo.removeAttribute('aria-invalid');
		campo.removeAttribute('aria-describedby');
		var msg = caja.nextElementSibling;
		if (msg && msg.classList.contains('invalid-feedback')) msg.remove();
		// Sin campos en rojo, «Revisa los campos marcados en rojo» ya no aplica: se quita.
		var form = campo.form, box = form && form.querySelector('.lead-form-status');
		if (box && !form.querySelector('.is-invalid') && box.classList.contains('text-danger') && !box.getAttribute('data-vac')) { box.textContent = ''; box.className = 'lead-form-status'; }
	}
	// «quedarse»: no mover la página (p. ej. cuando el calendario ya se llevó la vista y el foco).
	function marcarCampos(form, errores, quedarse) {
		form.querySelectorAll('.is-invalid').forEach(quitarMarca);
		errores.forEach(function (x) {
			var campo = x[0], caja = campo.closest('.input-group') || campo;
			campo.classList.add('is-invalid');
			campo.setAttribute('aria-invalid', 'true');
			var msg = document.createElement('div');
			msg.className = 'invalid-feedback d-block';
			msg.id = (campo.id || campo.name) + '-error';
			if (typeof x[1] === 'string') msg.textContent = x[1]; else msg.appendChild(x[1]);
			campo.setAttribute('aria-describedby', msg.id);
			caja.insertAdjacentElement('afterend', msg);
			// Se quita al escribir y también con el autollenado del navegador (que a veces solo avisa «change»).
			var quitar = function () { campo.removeEventListener('input', quitar); campo.removeEventListener('change', quitar); quitarMarca(campo); };
			campo.addEventListener('input', quitar);
			campo.addEventListener('change', quitar);
		});
		if (quedarse) return;
		var primero = errores[0][0];
		primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
		primero.focus({ preventScroll: true });
	}
	// «¿Quisiste decir ana@gmail.com?» con un botón que lo pone; si la persona deja el suyo, el segundo envío pasa.
	function sugerencia(form, correo) {
		var caja = document.createElement('span');
		caja.appendChild(document.createTextNode(T.quisiste.replace('{correo}', correo) + ' '));
		var b = document.createElement('button');
		b.type = 'button';
		b.className = 'btn btn-link p-0 align-baseline';
		b.textContent = T.usar;
		b.addEventListener('click', function () { form.email.value = correo; quitarMarca(form.email); form.email.focus(); });
		caja.appendChild(b);
		caja.appendChild(document.createTextNode(' ' + T.estaBien));
		return caja;
	}

	function setStatus(form, html, ok) {
		var box = form.querySelector('.lead-form-status');
		box.className = 'lead-form-status mt-3 ' + (ok ? 'text-success' : 'text-danger');
		box.innerHTML = '<span class="' + (ok ? 'icon-check-circle' : 'icon-exclamation-triangle') + ' eq-ic" aria-hidden="true"></span>' + html;
	}

	// La prueba de «no soy un robot» de cada formulario de reserva (js/reserva-chat.js): se prepara al tocarlo, no al abrir.
	var pruebas = [];
	function pruebaDe(form) {
		for (var i = 0; i < pruebas.length; i++) if (pruebas[i][0] === form) return pruebas[i][1];
		var p = window.EQChat.prueba(form);
		pruebas.push([form, p]);
		return p;
	}
	// La solicitud de reserva que se cortó (sin respuesta o el servidor falló) se recuerda en la pestaña 30 min
	// (sessionStorage), no solo en memoria: si el cliente recarga, el reintento va con el mismo id. Al abrir la ficha, si el
	// servidor ya la tiene, se muestra el enlace a su solicitud (sus fechas salen ocupadas porque ya las apartó él).
	// Una llave por casa (eq-pendiente:{casa}): dos fichas abiertas en la misma pestaña no se pisan.
	var PENDIENTE = function (form) { return 'eq-pendiente:' + (form.getAttribute('data-property-id') || ''); };
	function guardarPendiente(form, p) {
		form.eqPendiente = p;
		try { if (p) sessionStorage.setItem(PENDIENTE(form), JSON.stringify(p)); else sessionStorage.removeItem(PENDIENTE(form)); } catch (e) { /* sin memoria del navegador */ }
	}
	function leerPendiente(form) {
		try {
			var p = JSON.parse(sessionStorage.getItem(PENDIENTE(form)) || 'null');
			if (p && p.lead && p.lead.propertyId === (form.getAttribute('data-property-id') || '') && Date.now() - p.cuando < 30 * 60000) return p;
		} catch (e) { /* sin memoria del navegador */ }
		return null;
	}
	document.querySelectorAll('.lead-form').forEach(function (form) {
		form.addEventListener('focusin', function () { if (typeof form.eqReserva === 'function' && window.EQChat) pruebaDe(form); });
		var recordada = form.getAttribute('data-property-id') ? leerPendiente(form) : null;
		if (recordada) form.eqPendiente = recordada;
		// (Cuando ya cargaron reserva-chat.js y vacacional.js.)
		if (recordada) window.addEventListener('load', function () {
			if (!window.EQChat) return;
			window.EQChat.yaGuardada(recordada.lead).then(function (si) {
				if (si !== true) return;
				guardarPendiente(form, null);
				try { localStorage.setItem('eq-reserva', recordada.lead.token); localStorage.setItem('eq-reserva-casa', recordada.lead.propertyId); } catch (e) { /* sin memoria */ }
				if (typeof form.eqYaPediste === 'function') form.eqYaPediste(recordada.lead.token);
				// El aviso al anfitrión y al cliente que la respuesta perdida no alcanzó a pedir (si ya salió, no sale dos veces).
				window.EQChat.avisar(recordada.lead.token);
			});
		});
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			// Trampa para bots: un campo oculto que una persona nunca llena. Su nombre no se parece a nada que el autollenado
			// del navegador conozca (empresa, sitio web, dirección…), o le llenaría el campo a un cliente real y su envío se perdería.
			if (form.eq_vacio && form.eq_vacio.value) return;
			// La misma solicitud de reserva otra vez (la anterior se cortó: red o servidor; mismo correo, casa, fechas y
			// personas, y hace menos de 30 min): va con su id, su token y su código. El nombre y el teléfono, como estén ahora
			// (si los corrigió, el servidor pone al día la misma solicitud). Antes se le pregunta al servidor si ya la tiene:
			// si sí, no se vuelve a revisar (pasada la medianoche no se corta por «la llegada ya pasó», y sus propias fechas no
			// le salen «ya no están libres»); si no, se revisa como una nueva.
			var firmaForm = JSON.stringify([form.email ? form.email.value.trim().toLowerCase() : '', form.getAttribute('data-property-id') || '', location.search]);
			var pend = form.eqPendiente && form.eqPendiente.firma === firmaForm && Date.now() - form.eqPendiente.cuando < 30 * 60000 && window.EQChat ? form.eqPendiente : null;
			if (pend) {
				pend.lead.nombre = form.nombre.value.trim();
				pend.lead.telefono = form.codigo ? EQFormato.unirTelefono(form.codigo.value, form.telefono.value) : form.telefono.value.trim();
			}
			var lead = pend ? pend.lead : {
				nombre: form.nombre.value.trim(),
				// Un solo formato: «+código número», el mismo del panel (formato.js `unirTelefono`): el «+» escrito manda, y
				// el código que el autollenado pega al número («50255551234», «00502…») no se repite.
				telefono: form.codigo ? EQFormato.unirTelefono(form.codigo.value, form.telefono.value) : form.telefono.value.trim(),
				// En minúsculas: el mismo correo se reconoce igual siempre (las repetidas se buscan por él).
				email: form.email ? form.email.value.trim().toLowerCase() : '',
				mensaje: form.mensaje ? form.mensaje.value.trim() : '',
				origen: form.getAttribute('data-origen') || 'sitio',
				pagina: location.pathname,
				propertyId: form.getAttribute('data-property-id') || '',
				propertyTitulo: form.getAttribute('data-property-titulo') || '',
				agentId: form.getAttribute('data-agent-id') || ''
			};
			if (!pend && form.fechaVisita && form.fechaVisita.value) lead.fechaVisita = form.fechaVisita.value;
			if (!pend && form.tipoVisita) lead.tipoVisita = form.tipoVisita.value;
			// Cuadro de reserva (js/vacacional.js): sin fechas válidas no se envía.
			var reserva = pend ? pend.reserva : typeof form.eqReserva === 'function' ? form.eqReserva() : null;
			// Sin fechas, el calendario se marca y se lleva la vista; los demás campos igual se revisan y se marcan.
			var sinFechas = !pend && typeof form.eqReserva === 'function' && !reserva;
			if (reserva && !pend) {
				lead.reserva = reserva.datos;
				lead.mensaje = (reserva.resumen + (lead.mensaje ? '\n' + lead.mensaje : '')).slice(0, 2000);
			}
			lead.idioma = EN ? 'en' : 'es';
			if (campana) lead.campana = campana;
			// Lo marcado en un envío anterior se revisa de nuevo desde cero.
			form.querySelectorAll('.is-invalid').forEach(quitarMarca);
			var errores = [];
			if (!lead.nombre) errores.push([form.nombre, T.faltaNombre]);
			// Con la misma regla del panel (admin/js/formato.js): el largo de cada país (en Guatemala, 8 después del +502).
			if (!EQFormato.telefonoValido(lead.telefono)) errores.push([form.telefono, T.faltaTelefono]);
			if (lead.fechaVisita && !diaValido(lead.fechaVisita)) errores.push([form.fechaVisita, T.errorFecha]);
			// El correo (obligatorio solo en la reserva; si se escribe, siempre) con la misma regla del panel y las funciones.
			if (form.email && (lead.email || form.email.required) && !EQFormato.correoValido(lead.email)) errores.push([form.email, lead.email ? T.errorCorreo : T.faltaCorreo]);
			else if (form.email && lead.email && EQFormato.sugerenciaCorreo(lead.email) && form.getAttribute('data-correo-visto') !== lead.email) {
				// Dominio mal escrito («gmial.com»): se sugiere una vez; si la persona deja el suyo, el siguiente envío pasa.
				// Sin fechas la vista se va al calendario: ahí no cuenta como visto.
				if (!sinFechas) form.setAttribute('data-correo-visto', lead.email);
				errores.push([form.email, sugerencia(form, EQFormato.sugerenciaCorreo(lead.email))]);
			}
			if (pend) errores = errores.filter(function (e) { return e[0] === form.nombre || e[0] === form.telefono; });
			if (errores.length) {
				marcarCampos(form, errores, sinFechas);
				if (!sinFechas) setStatus(form, T.revisa, false);
				return;
			}
			if (sinFechas) return;
			var button = form.querySelector('button[type=submit]');
			button.disabled = true;

			// «chat»: token de la conversación de la reserva (vacío si no se pudo abrir).
			var done = function (chat) {
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
				// Reserva: todo sigue dentro del sitio, en la página de la reserva (solicitud, estado y chat).
				setStatus(form, reserva.gracias + (chat ? ' <a class="btn btn-primary btn-sm mt-2" href="' + window.EQChat.enlace(chat, EN) + '"><span class="icon-comments eq-ic" aria-hidden="true"></span>' + reserva.ver + '</a>' : ''), true);
				if (chat) location.href = window.EQChat.enlace(chat, EN);
			};
			// Lo que el servidor de reservas explica (la llegada ya pasó, la casa ya no recibe, demasiados envíos) se dice tal
			// cual; lo demás, el aviso de siempre. Siempre con WhatsApp a la mano.
			var fail = function (err) {
				var wa = config.whatsapp ? ' <a href="' + whatsappFallback(lead) + '" target="_blank" rel="noopener">' + T.escribenos + '</a>.' : '';
				// (El servidor lo dice en el idioma del cliente.)
				// Un 503 que no pasó con sus reintentos: «Hay muchas solicitudes en este momento…», no el aviso de siempre.
				var motivo = err && [403, 409, 429, 503].indexOf(err.status) > -1 && err.datos && err.datos.error ? String(err.datos.error) : '';
				setStatus(form, (motivo ? motivo.replace(/[<>&]/g, '') + ' ' : T.fallo) + wa, false);
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
			// Lo que una página publicada antes puede mandar distinto no hace perder la solicitud:
			//  - la casa cambió de asesor y el sitio no se ha vuelto a publicar: va sin asesor (la recibe el administrador).
			// Solo si las reglas lo rechazan (403): un corte de red no la manda a otro asesor ni la guarda dos veces.
			// Reserva: las fechas se revisan otra vez al día justo antes de guardar (otra persona pudo pedirlas con esta
			// página abierta); si ya no están libres, no se envía y el calendario lo dice.
			var revisar = function () { return reserva && typeof form.eqRevisar === 'function' ? form.eqRevisar() : Promise.resolve(true); };
			// Una pendiente que el servidor no tiene se revisa como nueva; si ya no cuadra (fechas tomadas, precio que cambió),
			// se suelta: la próxima sale como una solicitud nueva, con lo que el cliente ve ahora. Si el servidor no respondió
			// la pregunta, no se suelta: se manda la misma (mismo id) y el servidor decide.
			var libres = pend ? window.EQChat.yaGuardada(pend.lead).then(function (si) {
				return si !== false || revisar().then(function (ok) { if (!ok) guardarPendiente(form, null); return ok; });
			}) : revisar();
			libres.then(function (ok) {
				if (!ok) { button.disabled = false; return; }
				guardar();
			});
			function guardar() {
			// Reserva: la solicitud, su chat y su índice los guarda juntos el servidor (/api/solicitud), con la prueba de «no
			// soy un robot» si está activa. Después, los avisos al socio, al equipo y al cliente con su enlace.
			if (reserva) {
				if (!window.EQChat) { fail(); button.disabled = false; return; }
				var pruebaForm = pruebaDe(form);
				// Un 503 (muchas solicitudes a la vez) se reintenta solo, con espera creciente (1, 2 y 4 s) y otra prueba de
				// «no soy un robot» (cada una sirve una vez), mostrando «Enviando…»: el cliente no tiene que hacer nada.
				var enviar = function (n) {
					return pruebaForm.respuesta().then(function (ts) { return window.EQChat.solicitar(lead, reserva.datos, ts); }).catch(function (err) {
						if (!err || err.status !== 503 || n >= 3) throw err;
						setStatus(form, T.enviando, true);
						return new Promise(function (listo) { setTimeout(listo, 1000 * Math.pow(2, n)); }).then(function () { pruebaForm.otra(); return enviar(n + 1); });
					});
				};
				enviar(0)
					.then(function (token) { guardarPendiente(form, null); window.EQChat.avisar(token); done(token); }, function (err) {
						// Sin respuesta (red) o el servidor falló: se guarda para reintentar la misma; un «no» del servidor, no.
						guardarPendiente(form, !err || !err.status || err.status >= 500 ? { firma: firmaForm, lead: lead, reserva: reserva, cuando: pend ? pend.cuando : Date.now() } : null);
						fail(err);
					})
					.then(function () { pruebaForm.otra(); button.disabled = false; });
				return;
			}
			saveLead(lead).catch(function (err) {
				if (!lead.propertyId || !lead.agentId || err.message !== 'HTTP 403') throw err;
				lead.agentId = '';
				return saveLead(lead);
			}).then(function () {
				avisarEquipo(lead);
				done('');
			}, fail).then(function () { button.disabled = false; });
			}
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
		var presetTipo = document.body.getAttribute('data-preset-tipo') || '';
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
					if (f[k].value && !(k === 'orden' && f[k].value === 'recientes') && !(k === 'tipo' && f[k].value === presetTipo)) qs.set(k, f[k].value);
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

		// Va al listado de una operación conservando los filtros de la dirección; «cambios» pone o quita los suyos.
		function ir(op, cambios) {
			var params = new URLSearchParams(location.search);
			Object.keys(cambios).forEach(function (k) { cambios[k] ? params.set(k, cambios[k]) : params.delete(k); });
			var qs = params.toString();
			location.href = (rutas[op] || rutas['']) + (qs ? '?' + qs : '');
		}

		// La operación cambia de página para que cada listado tenga su propia URL indexable.
		form.addEventListener('change', function (e) {
			if (e.target.name !== 'operacion') return;
			var op = form.elements.operacion.value;
			if (op === preset) return;
			// En la página de una zona o de un tipo, ese filtro se conserva en el nuevo listado.
			var fijos = {};
			if (presetZona) fijos.zona = presetZona;
			if (presetTipo) fijos.tipo = presetTipo;
			ir(op, fijos);
		});

		// En la página de una zona o de un tipo («Casas en venta»), elegir otra zona u otro tipo lleva al
		// listado de la operación con ese filtro.
		if (presetZona) form.elements.zona.addEventListener('change', function () { ir(preset, { zona: form.elements.zona.value }); });
		if (presetTipo) {
			form.addEventListener('change', function (e) {
				if (e.target.name === 'tipo') ir(preset, { tipo: form.elements.tipo.value });
			});
		}

		var timer;
		form.addEventListener('input', function (e) {
			if (e.target.name === 'operacion' || (presetZona && e.target.name === 'zona') || (presetTipo && e.target.name === 'tipo')) return;
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
				// Los filtros de precio van en US$ (data-precio): un monto en quetzales se convierte con el tipo de cambio único.
				r.moneda = /(^|[^a-z])(q\.?\s*\d|quetzal)/.test(t) ? 'GTQ' : 'USD';
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
				var usd = function (v) { return v ? String(Math.round(EQFormato.enUSD(v, r.moneda))) : ''; };
				var valores = { tipo: r.tipo, zona: r.zona, habitaciones: hab ? String(hab) : '', max: usd(r.max), min: usd(r.min), q: '' };
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
				var montoTexto = function (v) { return EQFormato.montoPrecio(Math.round(v), r.moneda) + (r.moneda === 'GTQ' ? ' (≈ ' + EQFormato.montoPrecio(Math.round(EQFormato.enUSD(v, 'GTQ')), 'USD') + ')' : ''); };
				if (r.max) partes.push((EN ? 'up to ' : 'hasta ') + montoTexto(r.max));
				if (r.min) partes.push((EN ? 'from ' : 'desde ') + montoTexto(r.min));
				iaStatus.textContent = partes.length ? (EN ? 'Showing: ' : 'Mostrando: ') + partes.join(' · ') : (EN ? 'Searching by keywords. You can refine with the filters below.' : 'Buscando por palabras. Puedes afinar con los filtros de abajo.');
			};
			iaBtn.addEventListener('click', buscarIA);
			iaInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); buscarIA(); } });
		}
	}

	// ------------------------------------------------------------ Calculadora de cuota

	document.querySelectorAll('[data-calc]').forEach(function (box) {
		var precio = parseFloat(box.getAttribute('data-precio')) || 0;
		var moneda = box.getAttribute('data-moneda') === 'GTQ' ? 'GTQ' : 'USD';
		var out = box.querySelector('.calc-result');
		// El mismo formato que el precio de la propiedad: «US$ 70,000» (entero), «US$ 1,234.56» (cuota).
		var fmt = function (n) { return EQFormato.montoPrecio(Math.round(n * 100) / 100, moneda); };
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

	// Aviso breve abajo de la pantalla (y para el lector de pantalla): así se nota que algo pasó.
	function avisoBreve(texto) {
		var el = document.querySelector('.eq-aviso-breve') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'eq-aviso-breve' }));
		el.setAttribute('role', 'status');
		el.textContent = texto;
		el.hidden = false;
		clearTimeout(el.eqTimer);
		el.eqTimer = setTimeout(function () { el.hidden = true; }, 2200);
	}
	document.querySelectorAll('.js-copy-link').forEach(function (btn) {
		btn.addEventListener('click', function () {
			var url = btn.getAttribute('data-url');
			var copiar = function () {
				var ok = function () {
					btn.classList.add('copied');
					avisoBreve(EN ? 'Link copied' : 'Enlace copiado');
					setTimeout(function () { btn.classList.remove('copied'); }, 2000);
				};
				if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, function () { window.prompt(EN ? 'Copy the link:' : 'Copia el enlace:', url); });
				else window.prompt(EN ? 'Copy the link:' : 'Copia el enlace:', url);
			};
			// En celular abre el menú de compartir del teléfono; si no existe o no se deja, copia el enlace.
			if (btn.hasAttribute('data-compartir') && navigator.share) {
				navigator.share({ title: document.title, url: url }).catch(function (err) { if (!err || err.name !== 'AbortError') copiar(); });
				return;
			}
			copiar();
		});
	});

	// ------------------------------------------------------------ Barra fija de la ficha (celular y tableta)
	// Se esconde mientras el cuadro de reserva o de visita está a la vista (ya tiene su propio botón) y mientras se escribe
	// (con el teclado abierto la barra subía con él y tapaba los campos y el botón de enviar).
	var barra = document.querySelector('.ficha-barra');
	var cuadro = document.querySelector('.vac-card[data-vacacional], #ficha-form');
	if (barra) {
		var aLaVista = false, escribiendo = false;
		var pintarBarra = function () { document.body.classList.toggle('sin-barra-ficha', aLaVista || escribiendo); };
		if (cuadro && 'IntersectionObserver' in window) new IntersectionObserver(function (es) { aLaVista = es[0].isIntersecting; pintarBarra(); }, { threshold: 0.15 }).observe(cuadro);
		document.addEventListener('focusin', function (e) { if (e.target.matches('input, select, textarea')) { escribiendo = true; pintarBarra(); } });
		document.addEventListener('focusout', function () { setTimeout(function () { escribiendo = Boolean(document.activeElement && document.activeElement.matches('input, select, textarea')); pintarBarra(); }, 50); });
	}

	// ------------------------------------------------------------ Fotos de las casas: compartir en vez de guardar
	// Las fotos llevan su marca de agua (admin/js/marca.js). Además, quien intenta guardar una foto (clic derecho, mantener
	// el dedo encima, arrastrarla) o pulsa la tecla de captura en la computadora ve un aviso con el enlace de la casa para
	// compartirla. Una página web no puede impedir ni detectar una captura en el celular: esto solo la desanima.
	var FOTOS_CASA = '.ficha-foto img, .ficha-lightbox img, .prop-fotos img, .property-item img';
	// En una casa por noche se habla de las fechas libres; en venta y renta, de los detalles.
	var porNoche = Boolean(document.querySelector('[data-vacacional]'));
	var TC = EN ? { titulo: 'Did you like this property?', texto: 'Share it with this link: whoever opens it sees all the photos, the price and ' + (porNoche ? 'the free dates.' : 'every detail.'), copiar: 'Copy link', copiado: 'Link copied', pie: 'Photos by Equipo Inmobiliario.', cerrar: 'Close' }
		: { titulo: '¿Te gustó esta propiedad?', texto: 'Compártela con este enlace: quien lo abra ve todas las fotos, el precio y ' + (porNoche ? 'las fechas libres al día.' : 'todos los detalles.'), copiar: 'Copiar enlace', copiado: 'Enlace copiado', pie: 'Las fotos son de Equipo Inmobiliario.', cerrar: 'Cerrar' };
	var dialogoCompartir = null;
	function avisoCompartir(img) {
		var tarjeta = img && img.closest('a[href]');
		var canonica = document.querySelector('link[rel="canonical"]');
		var url = tarjeta && !img.closest('.ficha-galeria, .ficha-lightbox') ? tarjeta.href : (canonica ? canonica.href : location.href.split('#')[0]);
		var foto = img ? (img.currentSrc || img.src) : ((document.querySelector('meta[property="og:image"]') || {}).content || '');
		if (!dialogoCompartir) {
			dialogoCompartir = document.createElement('dialog');
			dialogoCompartir.className = 'eq-compartir';
			dialogoCompartir.setAttribute('aria-labelledby', 'eq-compartir-titulo');
			dialogoCompartir.innerHTML = '<button type="button" class="eq-compartir-cerrar" aria-label="' + TC.cerrar + '"><span class="icon-close" aria-hidden="true"></span></button>' +
				'<img class="eq-compartir-foto" alt="" draggable="false"><div class="eq-compartir-cuerpo"><h2 id="eq-compartir-titulo">' + TC.titulo + '</h2><p>' + TC.texto + '</p>' +
				'<p class="eq-compartir-enlace"><span class="icon-link" aria-hidden="true"></span><span data-url></span></p>' +
				'<div class="eq-compartir-botones"><a class="btn btn-success" target="_blank" rel="noopener" data-wa><span class="icon-whatsapp" aria-hidden="true"></span>WhatsApp</a>' +
				'<button type="button" class="btn btn-primary" data-copiar><span class="icon-link" aria-hidden="true"></span>' + TC.copiar + '</button></div>' +
				'<p class="eq-compartir-pie">' + TC.pie + '</p></div>';
			document.body.appendChild(dialogoCompartir);
			// Si la foto no carga, no queda un hueco: el aviso sigue sin ella.
			dialogoCompartir.querySelector('.eq-compartir-foto').addEventListener('error', function () { this.hidden = true; });
			dialogoCompartir.querySelector('.eq-compartir-cerrar').addEventListener('click', function () { dialogoCompartir.close(); });
			dialogoCompartir.addEventListener('click', function (e) { if (e.target === dialogoCompartir) dialogoCompartir.close(); });
			dialogoCompartir.querySelector('[data-copiar]').addEventListener('click', function () {
				var u = dialogoCompartir.getAttribute('data-url');
				if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { avisoBreve(TC.copiado); }, function () { window.prompt(TC.copiar, u); });
				else window.prompt(TC.copiar, u);
			});
		}
		dialogoCompartir.setAttribute('data-url', url);
		dialogoCompartir.querySelector('[data-url]').textContent = url.replace(/^https?:\/\//, '');
		dialogoCompartir.querySelector('[data-wa]').href = 'https://wa.me/?text=' + encodeURIComponent(url);
		var f = dialogoCompartir.querySelector('.eq-compartir-foto');
		f.hidden = !foto;
		if (foto) f.src = foto;
		if (!dialogoCompartir.open) dialogoCompartir.showModal();
	}
	// Se apaga en Contenido → Fotos de las casas; y nunca sale a quien es del equipo (entró al panel en este navegador).
	var conAviso = config.avisoCompartir !== false;
	try { if (localStorage.getItem('eq_equipo')) conAviso = false; } catch (e) { /* sin memoria del navegador */ }
	document.addEventListener('contextmenu', function (e) {
		var img = e.target.closest && e.target.closest(FOTOS_CASA);
		if (!img || !conAviso) return;
		e.preventDefault();
		avisoCompartir(img);
	});
	document.addEventListener('dragstart', function (e) { if (e.target.closest && e.target.closest(FOTOS_CASA)) e.preventDefault(); });
	// Tecla de captura (Windows) y las combinaciones de Mac que el navegador alcanza a ver, solo donde hay fotos de casas.
	var conFotos = document.querySelector('.ficha-galeria, .prop-fotos, .property-item img');
	if (conFotos && conAviso) {
		document.addEventListener('keyup', function (e) { if (e.key === 'PrintScreen') avisoCompartir(document.querySelector('.ficha-foto img')); });
		document.addEventListener('keydown', function (e) { if (e.metaKey && e.shiftKey && /^[345]$/.test(e.key)) avisoCompartir(document.querySelector('.ficha-foto img')); });
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

	// ------------------------------------------------------------ Barra fija de la landing VIP
	// En celular: un control por pantalla. La barra sale cuando el botón de la portada ya no se ve
	// y se esconde mientras se ve el formulario de contacto.

	var barraVip = document.querySelector('.vip-sticky-cta');
	var botonPortada = document.querySelector('.vip-hero .btn-vip');
	var contactoVip = document.getElementById('vip-contacto');
	if (barraVip && botonPortada && 'IntersectionObserver' in window) {
		var visto = { portada: true, contacto: false };
		var pintarBarra = function () {
			var oculta = visto.portada || visto.contacto;
			barraVip.classList.toggle('vip-sticky-oculta', oculta);
			barraVip.setAttribute('aria-hidden', oculta ? 'true' : 'false');
			barraVip.querySelectorAll('a').forEach(function (a) { a.tabIndex = oculta ? -1 : 0; });
		};
		var mirar = function (el, clave) {
			if (!el) return;
			new IntersectionObserver(function (entradas) {
				visto[clave] = entradas[entradas.length - 1].isIntersecting;
				pintarBarra();
			}).observe(el);
		};
		pintarBarra();
		mirar(botonPortada, 'portada');
		mirar(contactoVip, 'contacto');
	}

	// ------------------------------------------------------------ Fotos de las tarjetas
	// Delegado en el documento: el carrusel de portada clona tarjetas y los filtros las reordenan.

	var cargarFotos = function (e) {
		var caja = e.target.closest && e.target.closest('.prop-fotos');
		if (!caja) return;
		caja.querySelectorAll('img[data-src]').forEach(function (img) {
			img.src = img.getAttribute('data-src');
			img.removeAttribute('data-src');
		});
	};
	document.addEventListener('pointerover', cargarFotos, { passive: true });
	document.addEventListener('touchstart', cargarFotos, { passive: true });
	document.addEventListener('focusin', cargarFotos);
	document.addEventListener('click', function (e) {
		var flecha = e.target.closest('.prop-fotos .eq-flecha');
		if (!flecha) return;
		var tira = flecha.parentNode.querySelector('.img');
		var n = tira.children.length;
		var i = Math.round(tira.scrollLeft / tira.clientWidth) + (flecha.classList.contains('eq-flecha-prev') ? -1 : 1);
		tira.scrollLeft = ((i + n) % n) * tira.clientWidth;
	});
	// «scroll» no burbujea: se escucha en captura.
	document.addEventListener('scroll', function (e) {
		var tira = e.target;
		if (!tira.classList || !tira.classList.contains('img') || !tira.clientWidth) return;
		var i = Math.round(tira.scrollLeft / tira.clientWidth);
		var caja = tira.parentNode;
		var contador = caja.querySelector('.foto-contador');
		if (contador) contador.textContent = (i + 1) + ' / ' + tira.children.length;
	}, { capture: true, passive: true });

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
			[['.ficha-flecha.eq-flecha-prev', -1], ['.ficha-flecha.eq-flecha-next', 1]].forEach(function (f) {
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

			// Llegan solo las que tienen texto (las de solo estrellas las quita netlify/functions/resenas-google.mjs).
			var cita = el('blockquote', 'gr-resena-texto');
			cita.appendChild(el('p', '', String(r.texto)));
			tarjeta.appendChild(cita);
			tarjeta.appendChild(botonMas());

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

	// Asesores (portada): en el celular la descripción se ve en dos líneas; al tocarla se abre completa.
	document.querySelectorAll('.ini-bio').forEach(function (b) {
		b.addEventListener('click', function () {
			b.setAttribute('aria-expanded', String(b.getAttribute('aria-expanded') !== 'true'));
		});
	});

	// Barra de navegación: fondo sólido al bajar de la portada.
	var siteNav = document.querySelector('.site-nav');
	if (siteNav) {
		var marcarScroll = function () { siteNav.classList.toggle('is-scrolled', window.scrollY > 40); };
		marcarScroll();
		window.addEventListener('scroll', marcarScroll, { passive: true });
	}

})();
