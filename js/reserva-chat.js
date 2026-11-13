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
	// Guarda un documento nuevo con la hora del servidor.
	function crearDoc(ruta, fields) {
		return pedir(RAIZ + ':commit', { writes: [{
			update: { name: RAIZ + '/' + ruta, fields: fields }, currentDocument: { exists: false },
			updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }]
		}] });
	}
	function alAzar(n) {
		var letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', out = '';
		var bytes = window.crypto.getRandomValues(new Uint8Array(n));
		for (var i = 0; i < n; i++) out += letras[bytes[i] % letras.length];
		return out;
	}
	function enlace(token) { return location.origin + '/reserva/#' + token; }

	// Abre la conversación de una solicitud recién enviada. Devuelve el token (promesa).
	function crear(lead, r) {
		if (!config.projectId) return Promise.reject(new Error('sin base de datos'));
		var token = alAzar(28);
		return crearDoc('chats/' + token, {
			codigo: str(r.codigo), propertyId: str(lead.propertyId), propertyTitulo: str(lead.propertyTitulo),
			propietarioId: str(lead.propietarioId), nombre: str(String(lead.nombre || '').trim().split(/\s+/)[0].slice(0, 40)),
			llegada: str(r.llegada), salida: str(r.salida), noches: num(r.noches), huespedes: num(r.huespedes),
			total: num(r.total), moneda: str(r.moneda), idioma: str(lead.idioma === 'en' ? 'en' : 'es')
		}).then(function () {
			try { localStorage.setItem(GUARDADO, token); } catch (e) { /* sin memoria del navegador */ }
			return token;
		});
	}

	window.EQChat = { crear: crear, enlace: enlace };

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
		var pintados = -1;
		function pintar(mensajes) {
			if (mensajes.length === pintados) return;
			pintados = mensajes.length;
			if (!mensajes.length) { lista.replaceChildren(el('li', 'vac-chat-vacio', t.vacChatVacio)); return; }
			lista.replaceChildren.apply(lista, mensajes.map(function (m) {
				var li = el('li', 'vac-chat-msj vac-chat-' + (m.de === 'cliente' ? 'mio' : 'otro'));
				li.appendChild(el('span', 'vac-chat-quien', (QUIEN[m.de] || QUIEN.equipo) + (m.createdAt ? ' · ' + hora.format(new Date(m.createdAt)) : '')));
				li.appendChild(el('p', '', m.texto));
				return li;
			}));
		}
		function cargar() {
			return pedir(RAIZ + '/chats/' + token + '/mensajes?pageSize=200&orderBy=createdAt').then(function (res) { pintar((res.documents || []).map(plano)); });
		}
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var texto = campo.value.trim();
			if (!texto) return;
			// Teléfonos, correos y enlaces no pasan: los datos de contacto se entregan al confirmar la reserva.
			if (V.tieneContacto(texto)) { aviso.textContent = t.vacChatBloqueo; aviso.className = 'vac-chat-aviso vac-chat-alerta'; return; }
			boton.disabled = true;
			crearDoc('chats/' + token + '/mensajes/' + alAzar(20), { de: str('cliente'), texto: str(texto) })
				.then(function () { campo.value = ''; aviso.textContent = ''; aviso.className = 'vac-chat-aviso'; return cargar(); })
				.catch(function () { aviso.textContent = t.vacChatFallo; aviso.className = 'vac-chat-aviso vac-chat-alerta'; })
				.then(function () { boton.disabled = false; });
		});
		cargar().catch(function () { pintar([]); });
		// Mensajes nuevos: se revisa cada 20 s mientras la página está a la vista.
		setInterval(function () { if (!document.hidden) cargar().catch(function () {}); }, 20000);
	}, sinReserva);
})();
