/* Chat de la reserva (renta vacacional): el cliente habla con el anfitrión y el equipo sin que nadie
 * pase teléfonos ni correos. La conversación vive en Firestore (chats/{token}/mensajes) y se usa por
 * REST, sin cargar el SDK. El token es la llave: largo, al azar y solo va en el enlace del cliente
 * (/reserva/#token), después del «#» para que no llegue a estadísticas ni a otros sitios.
 * Deja window.EQChat: crear(lead, reserva) al reservar y la página /reserva/ (#reserva-chat).
 * Sintaxis ES5 a propósito, como el resto del sitio público.
 */
(function () {
	'use strict';
	var config = window.EQ_CONFIG || {};
	var V = window.EQVacacional;
	var RAIZ = 'projects/' + config.projectId + '/databases/(default)/documents';
	var API = 'https://firestore.googleapis.com/v1/';
	var LLAVE = config.apiKey ? 'key=' + config.apiKey : '';
	var GUARDADO = 'eq-reserva';

	function str(v) { return { stringValue: String(v == null ? '' : v) }; }
	function num(v) { return { doubleValue: Number(v) || 0 }; }
	// Documento de Firestore (REST) → objeto sencillo.
	function plano(doc) {
		var out = {}, f = (doc && doc.fields) || {};
		Object.keys(f).forEach(function (k) {
			var v = f[k];
			out[k] = 'stringValue' in v ? v.stringValue : 'doubleValue' in v ? v.doubleValue : 'integerValue' in v ? Number(v.integerValue) : 'timestampValue' in v ? v.timestampValue : '';
		});
		return out;
	}
	function pedir(url, cuerpo) {
		return fetch(API + url + (url.indexOf('?') > -1 ? '&' : '?') + LLAVE, cuerpo
			? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : undefined)
			.then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
	}
	// Un documento nuevo con la hora del servidor (como escritura de un lote).
	function nuevo(ruta, fields) {
		return { update: { name: RAIZ + '/' + ruta, fields: fields }, currentDocument: { exists: false },
			updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] };
	}
	function alAzar(n) {
		var letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', out = '';
		var bytes = window.crypto.getRandomValues(new Uint8Array(n));
		for (var i = 0; i < n; i++) out += letras[bytes[i] % letras.length];
		return out;
	}
	function enlace(token) { return location.origin + '/reserva/#' + token; }
	// Avisa por correo a quien le toca leer (lo decide el servidor con lo guardado). Si falla, el mensaje ya quedó.
	function avisar(token) {
		try { fetch('/api/aviso-chat', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat: token }) }).catch(function () {}); } catch (e) { /* sin fetch keepalive */ }
	}

	// ¿Están publicadas las reglas nuevas de la base? Leer un índice que no existe responde «no existe» (404) con las
	// nuevas y «sin permiso» (403) con las de antes. Solo con las de antes se escribe a la manera de antes; ante cualquier
	// otra respuesta o sin red, se escribe como piden las nuevas (si falla, se ve el error: no se esconde).
	var reglas = null;
	function reglasDeAntes() {
		// Un id al azar en cada carga: nadie puede crear de antemano el documento que se consulta y engañar a todos los clientes.
		if (!reglas) reglas = fetch(API + RAIZ + '/chatsPorSolicitud/prueba-' + alAzar(24) + (LLAVE ? '?' + LLAVE : ''))
			.then(function (r) { return r.status === 403; }, function () { return false; });
		return reglas;
	}

	// Abre la conversación de una solicitud recién enviada. Devuelve el token (promesa).
	function crear(lead, r) {
		if (!config.projectId) return Promise.reject(new Error('sin base de datos'));
		var token = alAzar(28);
		var chat = nuevo('chats/' + token, {
			codigo: str(r.codigo), leadId: str(lead.id), propertyId: str(lead.propertyId), propertyTitulo: str(lead.propertyTitulo),
			propietarioId: str(lead.propietarioId), nombre: str(String(lead.nombre || '').trim().split(/\s+/)[0].slice(0, 40)),
			llegada: str(r.llegada), salida: str(r.salida), noches: num(r.noches), huespedes: num(r.huespedes),
			total: num(r.total), moneda: str(r.moneda), idioma: str(lead.idioma === 'en' ? 'en' : 'es'),
			// Foto y dirección de la ficha, para que el cliente reconozca la casa en su reserva.
			foto: str(((document.querySelector('meta[property="og:image"]') || {}).content || '').slice(0, 500)), url: str(location.pathname.slice(0, 200))
		});
		// Un chat por solicitud: nace junto con su índice (chatsPorSolicitud/{solicitud}, que solo se crea una vez).
		// Con las reglas de antes (que no conocen ese índice) el chat se abre solo.
		var indice = { update: { name: RAIZ + '/chatsPorSolicitud/' + lead.id, fields: { token: str(token) } }, currentDocument: { exists: false } };
		return reglasDeAntes().then(function (antes) {
			return pedir(RAIZ + ':commit', { writes: antes ? [chat] : [chat, indice] });
		}).then(function () {
			try { localStorage.setItem(GUARDADO, token); } catch (e) { /* sin memoria del navegador */ }
			return token;
		});
	}

	window.EQChat = { crear: crear, enlace: enlace, avisar: avisar };

	// ------------------------------------------------------------ Página /reserva/
	var caja = document.getElementById('reserva-chat');
	if (!caja) return;
	var TEXTOS = JSON.parse(caja.querySelector('.vac-chat-textos').textContent);
	var t = TEXTOS.es;
	var token = location.hash.slice(1);
	if (!token) { try { token = localStorage.getItem(GUARDADO) || ''; } catch (e) { token = ''; } }

	function el(tag, clase, texto) {
		var e = document.createElement(tag);
		if (clase) e.className = clase;
		if (texto != null) e.textContent = texto;
		return e;
	}
	function fmt(s, datos) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return datos[k] == null ? '' : datos[k]; }); }
	function sinReserva() { caja.querySelector('.vac-chat-estado').textContent = t.vacChatSin; }

	if (!/^[A-Za-z0-9]{20,40}$/.test(token) || !config.projectId) return sinReserva();

	pedir(RAIZ + '/chats/' + token).then(function (doc) {
		var c = plano(doc);
		t = TEXTOS[c.idioma] || TEXTOS.es;
		var en = c.idioma === 'en';
		document.documentElement.lang = en ? 'en' : 'es';
		var dia = new Intl.DateTimeFormat(en ? 'en-US' : 'es-GT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
		var hora = new Intl.DateTimeFormat(en ? 'en-US' : 'es-GT', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
		var dinero = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		var fecha = function (x) { return dia.format(new Date(x + 'T00:00:00Z')); };

		// El esqueleto ya viene en la página (con sus íconos); aquí solo se llena.
		var cuerpo = caja.querySelector('.vac-chat-cuerpo');
		var poner = function (k, v) { cuerpo.querySelector('[data-out="' + k + '"]').textContent = v; };
		poner('titulo', c.propertyTitulo);
		// Estado de la solicitud: lo marca quien la responde en el panel.
		var sello = cuerpo.querySelector('[data-out="estado"]');
		function ponerEstado(valor) {
			var estado = { confirmada: 'Confirmada', pagada: 'Pagada', no: 'No', cancelada: 'Cancelada' }[valor] || 'Pendiente';
			sello.className = 'vac-chat-sello vac-chat-sello-' + estado.toLowerCase();
			sello.querySelector('span:last-child').textContent = t['vacChatEstado' + estado];
			// Qué sigue: guía al cliente en cada paso sin que nadie tenga que escribirle.
			// Una solicitud sin respuesta pasa a «tarde» a las 2 h (ya se avisó al equipo) y vence a las 48 h.
			var espera = Date.now() - new Date(c.createdAt).getTime();
			var sigue = estado !== 'Pendiente' ? estado : espera > 48 * 3600000 ? 'Vencida' : espera > 2 * 3600000 ? 'Tarde' : 'Pendiente';
			cuerpo.querySelector('[data-out="sigue"]').textContent = t['vacChatSigue' + sigue];
		}
		ponerEstado(c.estado);
		// Foto de la casa con enlace a su ficha (solo direcciones del propio sitio y fotos por https).
		var casa = cuerpo.querySelector('[data-out="casa"]');
		if (/^https:\/\//.test(c.foto || '')) {
			casa.querySelector('img').src = c.foto;
			if (/^\/[^\/]/.test(c.url || '')) { casa.href = c.url; casa.setAttribute('aria-label', t.vacChatVerCasa); }
			casa.hidden = false;
		}
		poner('codigo', c.codigo);
		poner('fechas', fecha(c.llegada) + ' – ' + fecha(c.salida));
		poner('noches', c.noches === 1 ? t.vacNoche1 : fmt(t.vacNochesN, { n: c.noches }));
		poner('huespedes', c.huespedes === 1 ? t.vacHuesped1 : fmt(t.vacHuespedesN, { n: c.huespedes }));
		poner('total', (c.moneda === 'GTQ' ? 'Q ' : 'US$ ') + dinero.format(c.total));
		poner('nota', t.vacChatNota);
		var lista = cuerpo.querySelector('.vac-chat-mensajes');
		var form = cuerpo.querySelector('.vac-chat-form');
		var campo = form.querySelector('textarea');
		var boton = form.querySelector('button');
		var aviso = cuerpo.querySelector('.vac-chat-aviso');
		campo.placeholder = t.vacChatPh;
		campo.setAttribute('aria-label', t.vacChatPh);
		boton.setAttribute('aria-label', t.vacChatEnviar);
		caja.querySelector('.vac-chat-estado').hidden = true;
		cuerpo.hidden = false;

		var QUIEN = { cliente: t.vacChatTu, socio: t.vacChatSocio, equipo: t.vacChatEquipo };
		var adjuntar = form.querySelector('.vac-chat-adjuntar');
		var archivo = form.querySelector('input[type=file]');
		adjuntar.setAttribute('aria-label', t.vacChatFoto);
		adjuntar.title = t.vacChatFoto;
		var FOTOS = 'https://firebasestorage.googleapis.com/v0/b/' + config.storageBucket + '/o/';
		function alerta(texto) { aviso.textContent = texto || ''; aviso.className = 'vac-chat-aviso' + (texto ? ' vac-chat-alerta' : ''); }

		// El mapa se guarda como enlace, como código «Insertar mapa» o como dirección o coordenadas: siempre sale un enlace.
		function enlaceMapa(mapa) {
			var s = String(mapa || '').trim();
			var url = (/src=["'](https:\/\/[^"']+)["']/.exec(s) || [])[1] || (/^https:\/\/\S+$/.test(s) ? s : '');
			return url || (s && !/[<>]/.test(s) ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s) : '');
		}

		// Datos de llegada: la dirección y el mapa vienen en el mensaje (privados hasta el pago); cómo llegar y
		// horarios, de la ficha de la casa. Nunca de un texto libre.
		var casaDatos = null;
		function llegada(li, m) {
			var pinta = function (p) {
				var v = (p.vacacional && p.vacacional.mapValue && p.vacacional.mapValue.fields) || {};
				var txt = function (x) { return (x && x.stringValue) || ''; };
				// Mensajes anteriores a este cambio no la traen: se lee de la casa, como antes.
				var direccion = m.direccion === undefined ? txt(p.direccion) : m.direccion;
				var mapa = enlaceMapa(m.mapa === undefined ? txt(p.mapa) : m.mapa);
				if (direccion) li.appendChild(el('p', '', direccion));
				if (mapa) {
					var a = el('a', '', t.vacChatMapa);
					a.href = mapa; a.target = '_blank'; a.rel = 'noopener';
					li.appendChild(a);
				}
				if (txt(v.comoLlegar)) li.appendChild(el('p', '', txt(v.comoLlegar)));
				li.appendChild(el('p', '', fmt(t.vacChatHorario, { entrada: txt(v.checkIn) || '15:00', salida: txt(v.checkOut) || '11:00' })));
			};
			if (casaDatos) return pinta(casaDatos);
			pedir(RAIZ + '/properties/' + c.propertyId).then(function (doc) { casaDatos = doc.fields || {}; pinta(casaDatos); }).catch(function () {});
		}

		var firma = '';
		function pintar(mensajes, vistoOtros) {
			// «Visto» va bajo mi último mensaje cuando el anfitrión o el equipo ya abrieron la conversación después.
			var ultimoMio = mensajes.filter(function (m) { return m.de === 'cliente'; }).pop();
			var visto = Boolean(ultimoMio && vistoOtros && ultimoMio.createdAt && vistoOtros >= ultimoMio.createdAt);
			var nueva = mensajes.length + '|' + visto;
			if (nueva === firma) return;
			firma = nueva;
			if (!mensajes.length) { lista.replaceChildren(el('li', 'vac-chat-vacio', t.vacChatVacio)); return; }
			var filas = [];
			mensajes.forEach(function (m) {
				var li = el('li', 'vac-chat-msj vac-chat-' + (m.de === 'cliente' ? 'mio' : 'otro') + (m.tipo === 'pago' || m.tipo === 'llegada' ? ' vac-chat-pago' : ''));
				var titulo = { pago: t.vacChatPago, llegada: t.vacChatLlegada, foto: t.vacChatComprobante }[m.tipo];
				if (titulo) li.appendChild(el('strong', '', titulo));
				li.appendChild(el('span', 'vac-chat-quien', (QUIEN[m.de] || QUIEN.equipo) + (m.createdAt ? ' · ' + hora.format(new Date(m.createdAt)) : '')));
				if (m.tipo === 'llegada') llegada(li, m);
				else if (m.tipo === 'foto') {
					if (m.texto.indexOf(FOTOS) === 0) { var img = el('img'); img.src = m.texto; img.alt = t.vacChatComprobante; img.loading = 'lazy'; li.appendChild(img); }
				} else li.appendChild(el('p', '', m.texto));
				filas.push(li);
				if (visto && m === ultimoMio) filas.push(el('li', 'vac-chat-visto', t.vacChatVisto));
			});
			lista.replaceChildren.apply(lista, filas);
		}
		function cargar() {
			return Promise.all([
				pedir(RAIZ + '/chats/' + token + '/mensajes?pageSize=300&orderBy=createdAt'),
				pedir(RAIZ + '/chats/' + token)
			]).then(function (res) {
				var mensajes = (res[0].documents || []).map(plano), ahora = plano(res[1]);
				ponerEstado(ahora.estado);
				var vistoOtros = [ahora.vistoSocio, ahora.vistoEquipo].filter(Boolean).sort().pop() || '';
				pintar(mensajes, vistoOtros);
				// Marco como visto lo que me escribieron (solo si hay algo nuevo de ellos).
				var ultimo = mensajes[mensajes.length - 1];
				if (ultimo && ultimo.de !== 'cliente' && !document.hidden && (!ahora.vistoCliente || ahora.vistoCliente < ultimo.createdAt)) {
					pedir(RAIZ + ':commit', { writes: [{
						update: { name: RAIZ + '/chats/' + token, fields: {} }, updateMask: { fieldPaths: [] }, currentDocument: { exists: true },
						updateTransforms: [{ fieldPath: 'vistoCliente', setToServerValue: 'REQUEST_TIME' }]
					}] }).catch(function () {});
				}
			});
		}
		// La foto del comprobante va junto con la marca «el cliente adjuntó su comprobante» en el chat (desde ahí el
		// anfitrión ya no cancela solo). Con las reglas de antes, que no la conocen, el mensaje va solo.
		// La marca dice qué mensaje es la foto (comprobanteMensaje): las reglas revisan que nazca en el mismo lote.
		function guardarMensaje(campos) {
			var id = alAzar(20);
			var msj = nuevo('chats/' + token + '/mensajes/' + id, campos);
			if (!campos.tipo || campos.tipo.stringValue !== 'foto') return pedir(RAIZ + ':commit', { writes: [msj] });
			var marca = { update: { name: RAIZ + '/chats/' + token, fields: { comprobanteMensaje: str(id) } }, updateMask: { fieldPaths: ['comprobanteMensaje'] }, currentDocument: { exists: true },
				updateTransforms: [{ fieldPath: 'comprobanteCliente', setToServerValue: 'REQUEST_TIME' }] };
			return reglasDeAntes().then(function (antes) { return pedir(RAIZ + ':commit', { writes: antes ? [msj] : [msj, marca] }); });
		}
		function mandar(campos) {
			boton.disabled = true; adjuntar.disabled = true;
			return guardarMensaje(campos)
				.then(function () { alerta(''); avisar(token); return cargar(); })
				.catch(function () { alerta(t.vacChatFallo); })
				.then(function () { boton.disabled = false; adjuntar.disabled = false; });
		}
		// Enter envía; Mayús + Enter baja de línea.
		campo.addEventListener('keydown', function (e) {
			if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : boton.click(); }
		});
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var texto = campo.value.trim();
			if (!texto) return;
			// Teléfonos, correos y enlaces no pasan: los datos de contacto se entregan al confirmar la reserva.
			if (V.tieneContacto(texto)) return alerta(t.vacChatBloqueo);
			mandar({ de: str('cliente'), texto: str(texto) }).then(function () { if (!aviso.textContent) campo.value = ''; });
		});
		// Foto del comprobante: se sube a la carpeta de esta reserva y queda como un mensaje.
		adjuntar.addEventListener('click', function () { archivo.click(); });
		archivo.addEventListener('change', function () {
			var f = archivo.files[0];
			archivo.value = '';
			if (!f) return;
			if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size >= 5 * 1024 * 1024) return alerta(t.vacChatFotoGrande);
			var nombre = 'chats/' + token + '/' + alAzar(16) + '.' + f.type.split('/')[1];
			adjuntar.disabled = true;
			fetch(FOTOS.slice(0, -1) + '?uploadType=media&name=' + encodeURIComponent(nombre), { method: 'POST', headers: { 'Content-Type': f.type }, body: f })
				.then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
				.then(function (r) { return mandar({ de: str('cliente'), tipo: str('foto'), texto: str(FOTOS + encodeURIComponent(nombre) + '?alt=media&token=' + r.downloadTokens) }); })
				.catch(function () { alerta(t.vacChatFallo); adjuntar.disabled = false; });
		});
		cargar().catch(function () { pintar([], ''); });
		// Mensajes nuevos: se revisa cada 10 s mientras la página está a la vista.
		setInterval(function () { if (!document.hidden) cargar().catch(function () {}); }, 10000);
	}, sinReserva);
})();
