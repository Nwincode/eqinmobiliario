/* Chat de la reserva (renta vacacional): el cliente habla con el anfitrión y el equipo sin que nadie
 * pase teléfonos ni correos. La conversación vive en Firestore (chats/{token}/mensajes) y se usa por
 * REST, sin cargar el SDK. El token es la llave: largo, al azar y solo va en el enlace del cliente
 * (/reserva/#token), después del «#» para que no llegue a estadísticas ni a otros sitios.
 * Deja window.EQChat: solicitar(lead, reserva, turnstile) y prueba(form) al reservar, y la página /reserva/ (#reserva-chat).
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
	// Documento de Firestore (REST) → objeto sencillo (con sus mapas: la cita, la traducción y estadoEn).
	function valorDe(v) {
		return 'stringValue' in v ? v.stringValue : 'doubleValue' in v ? v.doubleValue : 'integerValue' in v ? Number(v.integerValue) : 'timestampValue' in v ? v.timestampValue
			: 'booleanValue' in v ? v.booleanValue : 'mapValue' in v ? plano(v.mapValue) : '';
	}
	function plano(doc) {
		var out = {}, f = (doc && doc.fields) || {};
		Object.keys(f).forEach(function (k) { out[k] = valorDe(f[k]); });
		return out;
	}
	function pedir(url, cuerpo) {
		return fetch(API + url + (url.indexOf('?') > -1 ? '&' : '?') + LLAVE, cuerpo
			? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : undefined)
			.then(function (r) {
				if (r.ok) return r.json();
				// Con el motivo de la base (ALREADY_EXISTS, ABORTED…): un 409 no siempre es «ya quedó».
				return r.json().catch(function () { return {}; }).then(function (d) { throw new Error('HTTP ' + r.status + ' ' + ((d.error && d.error.status) || '')); });
			});
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
	// La página «Tu reserva» en el idioma de la reserva (/en/reservation/ en inglés).
	function enlace(token, en) { return location.origin + (en ? '/en/reservation/#' : '/reserva/#') + token; }
	// Avisa por correo a quien le toca leer (lo decide el servidor con lo guardado). Si falla, el mensaje ya quedó.
	function avisar(token) {
		try { fetch('/api/aviso-chat', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat: token }) }).catch(function () {}); } catch (e) { /* sin fetch keepalive */ }
	}

	// Prueba de «no soy un robot» (Cloudflare Turnstile), solo si el servidor tiene sus llaves (GET /api/solicitud).
	// `prueba(form)` la prepara en el formulario de reserva (al tocarlo); `respuesta()` da la de este envío (a lo más 15 s)
	// y, si el script de Cloudflare no cargó o falló, lo vuelve a intentar en cada envío. Sin respuesta va '' y el
	// servidor la recibe igual, con un límite más estricto: la reserva nunca se queda trabada por la prueba.
	var llave = null;
	function llaveTurnstile() {
		if (!llave) llave = fetch('/api/solicitud', { headers: { Accept: 'application/json' } })
			.then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
			.then(function (d) { return d.turnstile || ''; }, function () { llave = null; return ''; });
		return llave;
	}
	var cargaTurnstile = null;
	function cargarTurnstile() {
		if (!cargaTurnstile) cargaTurnstile = new Promise(function (ok, mal) {
			var s = document.createElement('script');
			s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
			s.async = true;
			s.onload = function () { window.turnstile ? ok(window.turnstile) : mal(new Error('sin turnstile')); };
			s.onerror = function () { cargaTurnstile = null; s.remove(); mal(new Error('sin turnstile')); };
			document.head.appendChild(s);
		});
		return cargaTurnstile;
	}
	function prueba(form) {
		var widget = null, respuesta = '', esperando = [], preparando = null;
		var listo = function (v) { respuesta = v || ''; esperando.splice(0).forEach(function (f) { f(respuesta); }); };
		function preparar() {
			if (widget !== null) return Promise.resolve(true);
			if (!preparando) preparando = llaveTurnstile().then(function (k) {
				if (!k) return false;
				return cargarTurnstile().then(function (ts) {
					var caja = form.querySelector('.eq-turnstile') || document.createElement('div');
					caja.className = 'eq-turnstile';
					// Justo antes de la fila del botón de enviar (si Cloudflare la muestra, queda donde se va a tocar).
					var fila = (form.querySelector('button[type=submit]') || {}).parentNode;
					if (!caja.parentNode) { if (fila && fila !== form && fila.parentNode) fila.parentNode.insertBefore(caja, fila); else form.appendChild(caja); }
					widget = ts.render(caja, { sitekey: k, appearance: 'interaction-only', size: 'flexible', language: document.documentElement.lang === 'en' ? 'en' : 'es',
						callback: listo, 'expired-callback': function () { respuesta = ''; }, 'error-callback': function () { listo(''); } });
					return true;
				});
			}).catch(function () { return false; }).then(function (hay) { preparando = null; return hay; });
			return preparando;
		}
		preparar();
		return {
			respuesta: function () {
				return preparar().then(function (hay) {
					if (!hay || respuesta) return respuesta;
					return new Promise(function (f) { esperando.push(f); setTimeout(function () { f(respuesta); }, 15000); });
				});
			},
			// Cada respuesta sirve una vez: después de un envío se pide otra.
			otra: function () { respuesta = ''; if (widget !== null && window.turnstile) try { window.turnstile.reset(widget); } catch (e) { widget = null; } }
		};
	}

	// Manda una solicitud de reserva al servidor (netlify/functions/solicitud.mjs), que guarda juntos la solicitud, su chat
	// y su índice. `lead` (lo del formulario) y `r` (lo cotizado) ya vienen revisados por la página. El id y el token se
	// ponen una vez por solicitud: si se reintenta (corte de red), el servidor reconoce que ya quedó. Devuelve el token.
	function solicitar(lead, r, turnstile) {
		lead.id = lead.id || alAzar(20);
		lead.token = lead.token || alAzar(28);
		var cuerpo = {
			leadId: lead.id, token: lead.token, turnstile: turnstile || '',
			lead: { nombre: lead.nombre, telefono: lead.telefono, email: lead.email, mensaje: lead.mensaje, origen: lead.origen, pagina: lead.pagina,
				propertyId: lead.propertyId, idioma: lead.idioma, campana: lead.campana },
			reserva: r,
			// Foto y dirección de la ficha, para que el cliente reconozca la casa en su reserva.
			chat: { foto: ((document.querySelector('meta[property="og:image"]') || {}).content || '').slice(0, 500), url: location.pathname.slice(0, 200) }
		};
		return fetch('/api/solicitud', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
			.then(function (res) {
				return res.json().catch(function () { return {}; }).then(function (d) {
					if (!res.ok || !d.token) throw Object.assign(new Error(d.error || 'HTTP ' + res.status), { status: res.status, datos: d });
					// Y de qué casa es: si vuelve a la ficha (botón «atrás»), ve el enlace a su solicitud (js/vacacional.js).
					try { localStorage.setItem(GUARDADO, d.token); localStorage.setItem(GUARDADO + '-casa', lead.propertyId || ''); localStorage.setItem(GUARDADO + '-idioma', lead.idioma || 'es'); } catch (e) { /* sin memoria del navegador */ }
					return d.token;
				});
			});
	}

	// ¿El servidor ya tiene esta solicitud? (antes de reintentar una que se cortó). true / false, o null si no respondió.
	// El token va en el cuerpo (no en la dirección: no queda en registros ni en el historial).
	function yaGuardada(lead) {
		if (!lead.id || !lead.token) return Promise.resolve(false);
		return fetch('/api/solicitud', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ consulta: true, leadId: lead.id, token: lead.token }) })
			.then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
			.then(function (d) { return d.guardada === true; }, function () { return null; });
	}

	window.EQChat = { solicitar: solicitar, prueba: prueba, enlace: enlace, avisar: avisar, yaGuardada: yaGuardada };

	// ------------------------------------------------------------ Página /reserva/
	var caja = document.getElementById('reserva-chat');
	if (!caja) return;
	var TEXTOS = JSON.parse(caja.querySelector('.vac-chat-textos').textContent);
	// Antes de leer la reserva, el idioma de la página (/en/reservation/ o /reserva/).
	var t = TEXTOS[document.documentElement.lang === 'en' ? 'en' : 'es'] || TEXTOS.es;
	var token = location.hash.slice(1);
	if (!token) { try { token = localStorage.getItem(GUARDADO) || ''; } catch (e) { token = ''; } }

	function el(tag, clase, texto) {
		var e = document.createElement(tag);
		if (clase) e.className = clase;
		if (texto != null) e.textContent = texto;
		return e;
	}
	function icono(nombre) { var s = el('span', 'icon-' + nombre); s.setAttribute('aria-hidden', 'true'); return s; }
	function fmt(s, datos) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return datos[k] == null ? '' : datos[k]; }); }
	function sinReserva() { caja.querySelector('.vac-chat-estado').textContent = t.vacChatSin; }
	// Sin red (o la base no respondió): no es «no encontramos tu reserva»; se dice y se ofrece reintentar.
	function sinRed() {
		var estado = caja.querySelector('.vac-chat-estado');
		estado.textContent = t.vacChatSinRed + ' ';
		var otra = el('button', 'btn btn-outline-primary btn-sm', t.vacChatReintentar);
		otra.type = 'button';
		otra.addEventListener('click', function () { location.reload(); });
		estado.appendChild(otra);
	}

	if (!/^[A-Za-z0-9]{20,40}$/.test(token) || !config.projectId) return sinReserva();

	pedir(RAIZ + '/chats/' + token).then(function (doc) {
		var c = plano(doc);
		t = TEXTOS[c.idioma] || TEXTOS.es;
		var en = c.idioma === 'en';
		var lang = en ? 'en' : 'es';
		document.documentElement.lang = lang;
		var H = window.EQHilo;
		var dia = new Intl.DateTimeFormat(en ? 'en-US' : 'es-GT', { day: 'numeric', month: 'short', timeZone: 'UTC' });
		var diaSemana = new Intl.DateTimeFormat(en ? 'en-US' : 'es-GT', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
		var fecha = function (x) { return dia.format(new Date(x + 'T00:00:00Z')); };
		var rango = String(c.llegada).slice(0, 7) === String(c.salida).slice(0, 7) && !en
			? Number(String(c.llegada).slice(8, 10)) + ' – ' + fecha(c.salida) : fecha(c.llegada) + ' – ' + fecha(c.salida);
		var total = EQFormato.montoPrecio(Number(c.total) || 0, c.moneda === 'GTQ' ? 'GTQ' : 'USD');
		// Los textos del hilo (admin/js/hilo.js) en el idioma del cliente.
		var th = { visto: t.vacChatVisto, enviando: t.vacChatEnviando, noSeEnvio: t.vacChatNoSeEnvio, responder: '', irACita: t.vacChatIrCita, comprobante: t.vacChatComprobante,
			datosDePago: t.vacChatDatosPago, datosDeLlegada: t.vacChatLlegada, cuadra: t.vacChatCuadra, soloEquipo: '', idioma: lang };

		// El esqueleto ya viene en la página (con sus íconos); aquí solo se llena.
		var cuerpo = caja.querySelector('.vac-chat-cuerpo');
		var poner = function (k, v) { cuerpo.querySelector('[data-out="' + k + '"]').textContent = v; };
		poner('titulo', en && c.propertyTituloEn || c.propertyTitulo);
		poner('fechas', rango);
		poner('noches', String(c.noches));
		poner('huespedes', String(c.huespedes));
		poner('total', total);
		cuerpo.querySelector('[data-out="noches"]').parentNode.title = c.noches === 1 ? t.vacNoche1 : fmt(t.vacNochesN, { n: c.noches });
		cuerpo.querySelector('[data-out="huespedes"]').parentNode.title = c.huespedes === 1 ? t.vacHuesped1 : fmt(t.vacHuespedesN, { n: c.huespedes });
		poner('nota', t.vacChatGuarda);
		var resumen = cuerpo.querySelector('[data-out="resumen"]');
		var sub = cuerpo.querySelector('[data-out="sub"]');
		var pasos = cuerpo.querySelector('[data-out="pasos"]');
		var sigue = cuerpo.querySelector('[data-out="sigue"]');
		var sello = cuerpo.querySelector('[data-out="estado"]');
		var lista = cuerpo.querySelector('.vac-chat-mensajes');
		var form = cuerpo.querySelector('.vac-chat-form');
		var campo = form.querySelector('textarea');
		var boton = form.querySelector('button[type=submit]');
		var aviso = cuerpo.querySelector('.vac-chat-aviso');
		var regla = cuerpo.querySelector('.vac-chat-regla');
		var adjuntar = form.querySelector('.vac-chat-adjuntar');
		var archivo = form.querySelector('input[type=file]');
		campo.placeholder = t.vacChatPh;
		campo.setAttribute('aria-label', t.vacChatPh);
		boton.setAttribute('aria-label', t.vacChatEnviar);
		adjuntar.setAttribute('aria-label', t.vacChatFoto);
		adjuntar.title = t.vacChatFoto;
		caja.querySelector('.vac-chat-estado').hidden = true;
		cuerpo.hidden = false;
		var FOTOS = 'https://firebasestorage.googleapis.com/v0/b/' + config.storageBucket + '/o/';
		function alerta(texto) { aviso.textContent = texto || ''; regla.hidden = Boolean(texto); campo.classList.toggle('hilo-mal', Boolean(texto)); }

		// El plazo de pago, en hora de Guatemala (el mismo del correo): «mañana 16:20», «viernes 20 nov 14:00».
		var hora = new Intl.DateTimeFormat(en ? 'en-US' : 'es-GT', { timeZone: 'America/Guatemala', hour: 'numeric', minute: '2-digit', hourCycle: en ? 'h12' : 'h23' });
		var diaGt = function (ms) { return new Date(ms - 6 * 3600000).toISOString().slice(0, 10); };
		function cuandoVence(ms) {
			var n = Math.round((Date.parse(diaGt(ms) + 'T00:00:00Z') - Date.parse(diaGt(Date.now()) + 'T00:00:00Z')) / 86400000);
			var d = n === 0 ? (en ? 'today' : 'hoy') : n === 1 ? (en ? 'tomorrow' : 'mañana') : diaSemana.format(new Date(diaGt(ms) + 'T12:00:00Z'));
			return d + ' ' + hora.format(new Date(ms));
		}
		// `ch` = el chat tal como está guardado (estado, plazo de pago y si ya mandó su comprobante). `estadoChat`: el de
		// ahora, para que el aviso del filtro no prometa lo que ya no toca.
		var estadoChat = 'Pendiente', camaraVisible = false;
		function boton2(texto, iconoNombre, alTocar) {
			var b = el('button', 'hilo-btn hilo-btn-pri');
			b.type = 'button';
			if (iconoNombre) b.appendChild(icono(iconoNombre));
			b.appendChild(document.createTextNode(texto));
			b.addEventListener('click', alTocar);
			return b;
		}
		function ponerEstado(ch) {
			var valor = ch.estado;
			var estado = { confirmada: 'Confirmada', pagada: 'Pagada', no: 'No', cancelada: 'Cancelada' }[valor] || 'Pendiente';
			estadoChat = estado;
			// Una solicitud sin respuesta pasa a «tarde» a las 2 h (ya se avisó al equipo) y vence a las 24 h (se cierra sola:
			// netlify/functions/plazos-reservas.mjs). La que confirma el equipo (se cotizó por debajo) no aparta fechas.
			var espera = Date.now() - new Date(c.createdAt).getTime();
			var pendiente = estado === 'Pendiente';
			var vencida = pendiente && espera > 24 * 3600000;
			// «Tu reserva EQ-…» (con el código en su lugar) y, ya respondida, las fechas y el total en la misma línea.
			var partes = t.vacChatTuReserva.split('{codigo}');
			sub.replaceChildren(partes[0], el('span', '', c.codigo), (partes[1] || '') + (pendiente ? '' : ' · ' + rango + ' · ' + total));
			sub.children[0].setAttribute('data-out', 'codigo');
			// Sin respuesta: la fila del resumen con su estado. Después: los pasos y lo que sigue.
			resumen.hidden = !pendiente;
			sello.querySelector('span').textContent = t.vacChatEsperando;
			var conComprobante = estado === 'Confirmada' && Boolean(ch.comprobanteCliente) && !(Number(ch.pagoReabierto) >= new Date(ch.comprobanteCliente).getTime());
			var reabierto = estado === 'Confirmada' && Boolean(ch.comprobanteCliente) && !conComprobante;
			var vence = Number(ch.vencePago) || 0;
			pasos.replaceChildren();
			if (!pendiente && estado !== 'No' && estado !== 'Cancelada') {
				var llego = estado === 'Pagada' && diaGt(Date.now()) >= c.llegada;
				pasos.appendChild(H.pasosEnLinea([{ texto: t.vacChatPasoPedida, estado: 'ok' }, { texto: t.vacChatPasoConfirmada, estado: 'ok' },
					{ texto: t.vacChatPasoPaga, estado: estado === 'Pagada' ? 'ok' : 'ya' }, { texto: t.vacChatPasoLlegada, estado: llego ? 'ok' : estado === 'Pagada' ? 'ya' : '' }]));
			}
			// Lo que sigue: título, detalle y la acción del momento.
			var titulo = '', detalle = '', accion = null;
			if (estado === 'Confirmada') {
				if (conComprobante) { titulo = t.vacChatEnviado; detalle = t.vacChatLoRevisa; }
				else {
					titulo = vence > 0 ? fmt(t.vacChatVence, { cuando: cuandoVence(vence) }) : t.vacChatPagaAntes;
					detalle = reabierto ? t.vacChatOtraVez : t.vacChatPagaYSube;
					accion = boton2(t.vacChatSubir, 'camera', function () { archivo.click(); });
				}
			} else if (estado === 'Pagada') {
				titulo = fmt(t.vacChatLlegas, { dia: diaSemana.format(new Date(c.llegada + 'T12:00:00Z')) }); detalle = t.vacChatDireccionAbajo;
				accion = el('span', 'hilo-pildora hilo-verde vac-chat-sello'); accion.appendChild(el('i')); accion.appendChild(el('span', '', t.vacChatEstadoPagada));
			} else if (estado === 'No' || estado === 'Cancelada' || vencida || ch.confirmaEquipo) {
				titulo = vencida ? t.vacChatEstadoNo : estado === 'No' ? t.vacChatEstadoNo : estado === 'Cancelada' ? t.vacChatEstadoCancelada : t.vacChatEsperando;
				detalle = vencida ? t.vacChatSigueVencida : estado === 'No' ? t.vacChatSigueNo : estado === 'Cancelada' ? t.vacChatSigueCancelada : t.vacChatSigueEquipo;
				// Sin reserva (no se dio o se canceló): un botón a la ficha para elegir otras fechas.
				if (!pendiente || vencida) {
					var sello2 = el('span', 'hilo-pildora hilo-gris vac-chat-sello'); sello2.appendChild(el('i')); sello2.appendChild(el('span', '', estado === 'Cancelada' ? t.vacChatEstadoCancelada : t.vacChatEstadoNo));
					accion = sello2;
					if (/^\/[^\/]/.test(c.url || '')) { accion = el('a', 'hilo-btn hilo-btn-sec', t.vacChatOtrasFechas); accion.href = c.url + '#vac-titulo'; }
				}
			}
			sigue.hidden = !titulo;
			sigue.replaceChildren();
			if (titulo) {
				var txt = el('span', 'hilo-sigue-txt');
				txt.appendChild(el('b', '', titulo));
				txt.appendChild(document.createTextNode(detalle));
				sigue.appendChild(txt);
				if (accion) { var acc = el('span', 'hilo-sigue-acc'); acc.appendChild(accion); sigue.appendChild(acc); }
			}
			// La cámara (comprobante de pago) solo cuando hay a quién pagar y todavía no se mandó.
			camaraVisible = estado === 'Confirmada' && !conComprobante;
			adjuntar.hidden = !camaraVisible;
			form.classList.toggle('vac-chat-sin-camara', !camaraVisible);
		}
		ponerEstado(c);

		// El mapa se guarda como enlace, como código «Insertar mapa» o como dirección o coordenadas: siempre sale un enlace.
		function enlaceMapa(mapa) {
			var s = String(mapa || '').trim();
			var url = (/src=["'](https:\/\/[^"']+)["']/.exec(s) || [])[1] || (/^https:\/\/\S+$/.test(s) ? s : '');
			return url || (s && !/[<>]/.test(s) ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s) : '');
		}
		// Datos de llegada: la dirección y el mapa vienen en el mensaje (privados hasta el pago); cómo llegar y
		// horarios, de la ficha de la casa. Nunca de un texto libre.
		var casaDatos = null;
		function llegada(tarj, m) {
			var pinta = function (p) {
				var v = (p.vacacional && p.vacacional.mapValue && p.vacacional.mapValue.fields) || {};
				var txt = function (x) { return (x && x.stringValue) || ''; };
				// Mensajes anteriores a este cambio no la traen: se lee de la casa, como antes.
				var direccion = m.direccion === undefined ? txt(p.direccion) : m.direccion;
				var mapa = enlaceMapa(m.mapa === undefined ? txt(p.mapa) : m.mapa);
				if (direccion) tarj.appendChild(el('p', '', direccion));
				if (mapa) {
					var a = el('a', '', t.vacChatMapa);
					a.href = mapa; a.target = '_blank'; a.rel = 'noopener';
					tarj.appendChild(a);
				}
				if (txt(v.comoLlegar)) tarj.appendChild(el('p', '', txt(v.comoLlegar)));
				tarj.appendChild(el('p', '', fmt(t.vacChatHorario, { entrada: txt(v.checkIn) || '15:00', salida: txt(v.checkOut) || '11:00' })));
			};
			if (casaDatos) return pinta(casaDatos);
			pedir(RAIZ + '/properties/' + c.propertyId).then(function (doc) { casaDatos = doc.fields || {}; pinta(casaDatos); }).catch(function () {});
		}
		// Las tarjetas: los datos de pago (con «Copiar datos»), los de llegada y el comprobante.
		function tarjeta(m) {
			if (m.tipo === 'pago') {
				var tp = el('div', 'hilo-tarj vac-chat-pago');
				tp.dataset.id = m.id;
				tp.appendChild(el('h3', '', t.vacChatPagaDirecto));
				tp.appendChild(el('p', '', m.texto + ' · ' + total));
				var fila = el('div', 'hilo-tarj-fila');
				var copiar = el('button', 'hilo-btn hilo-btn-sec', t.vacChatCopiar);
				copiar.type = 'button';
				copiar.addEventListener('click', function () {
					var hecho = function () { copiar.textContent = t.vacChatCopiado; setTimeout(function () { copiar.textContent = t.vacChatCopiar; }, 2000); };
					try { navigator.clipboard.writeText(m.texto + '\n' + total).then(hecho, function () {}); } catch (e) { /* sin portapapeles */ }
				});
				fila.appendChild(copiar);
				tp.appendChild(fila);
				return tp;
			}
			if (m.tipo === 'llegada') {
				var tl = el('div', 'hilo-tarj vac-chat-pago');
				tl.dataset.id = m.id;
				tl.appendChild(el('h3', '', t.vacChatLlegada));
				llegada(tl, m);
				return tl;
			}
			if (m.tipo === 'foto') return m.texto.indexOf(FOTOS) === 0 ? H.tarjetaComprobante(m, th) : 'omitir';
			return null;
		}
		var EVENTOS = { pidio: t.vacChatEvPidio, pagoRecibido: t.vacChatEvPagado, no: t.vacChatEstadoNo, cancelada: t.vacChatEstadoCancelada };
		function textoEvento(ev) {
			if (ev.clave === 'confirmo') return ev.por === 'equipo' ? t.vacChatEvConfirmoEquipo : t.vacChatEvConfirmo;
			return EVENTOS[ev.clave] || '';
		}
		var QUIEN = { cliente: t.vacChatTu, socio: t.vacChatSocio, equipo: t.vacChatEquipo };

		// Lo que está saliendo o no salió (por intento: su id), sobre lo guardado.
		var locales = {}, mensajes = [], chatAhora = c, firma = '';
		function pintar(forzar) {
			var vistoOtros = [chatAhora.vistoSocio, chatAhora.vistoEquipo].filter(Boolean).sort().pop() || '';
			var items = mensajes.slice();
			Object.keys(locales).forEach(function (k) { if (!mensajes.some(function (m) { return m.id === locales[k].id; })) items.push(locales[k]); });
			var nueva = JSON.stringify([items.map(function (m) { return [m.id, m._estado || '', m.traduccion || '']; }), vistoOtros, chatAhora.estado || '', chatAhora.estadoEn || '']);
			if (nueva === firma && !forzar) return;
			firma = nueva;
			var nodos = H.armarHilo(items, { yo: 'cliente', idioma: lang, t: th, chat: chatAhora, vistoOtros: vistoOtros ? new Date(vistoOtros).getTime() : 0,
				etiqueta: function (m) { return m.de === 'cliente' ? '' : QUIEN[m.de] || QUIEN.equipo; }, nombreDe: function (de) { return QUIEN[de] || QUIEN.equipo; },
				textoEvento: textoEvento, tarjeta: tarjeta, alReintentar: function (m) { reintentar(m.id); } });
			H.pintarHilo(lista, nodos.length ? nodos : [el('p', 'hilo-vacio', t.vacChatVacio)], Boolean(forzar));
		}
		function cargar() {
			return Promise.all([
				pedir(RAIZ + '/chats/' + token + '/mensajes?pageSize=300&orderBy=createdAt'),
				pedir(RAIZ + '/chats/' + token)
			]).then(function (res) {
				mensajes = (res[0].documents || []).map(function (d) { var m = plano(d); m.id = d.name.split('/').pop(); return m; });
				chatAhora = plano(res[1]);
				ponerEstado(chatAhora);
				pintar();
				// Marco como visto lo que me escribieron (solo si hay algo nuevo de ellos).
				var ultimo = mensajes[mensajes.length - 1];
				if (ultimo && ultimo.de !== 'cliente' && !document.hidden && (!chatAhora.vistoCliente || chatAhora.vistoCliente < ultimo.createdAt)) {
					pedir(RAIZ + ':commit', { writes: [{
						update: { name: RAIZ + '/chats/' + token, fields: {} }, updateMask: { fieldPaths: [] }, currentDocument: { exists: true },
						updateTransforms: [{ fieldPath: 'vistoCliente', setToServerValue: 'REQUEST_TIME' }]
					}] }).catch(function () {});
				}
			});
		}
		// La foto del comprobante va junto con la marca «el cliente adjuntó su comprobante» en el chat (desde ahí el
		// anfitrión ya no cancela solo).
		// La marca dice qué mensaje es la foto (comprobanteMensaje): las reglas revisan que nazca en el mismo lote.
		// `id`: el mismo en los reintentos del mismo mensaje (se cortó la red con el mensaje ya guardado). Si la base lo
		// rechaza, se lee ese mensaje: solo si existe y es este (mismo autor y mismo texto o foto) cuenta como hecho; el
		// código del error no basta (una contención o la base de producción pueden dar otro).
		function guardarMensaje(campos, id) {
			var msj = nuevo('chats/' + token + '/mensajes/' + id, campos);
			var lote = [msj];
			if (campos.tipo && campos.tipo.stringValue === 'foto') lote.push({ update: { name: RAIZ + '/chats/' + token, fields: { comprobanteMensaje: str(id) } }, updateMask: { fieldPaths: ['comprobanteMensaje'] }, currentDocument: { exists: true },
				updateTransforms: [{ fieldPath: 'comprobanteCliente', setToServerValue: 'REQUEST_TIME' }] });
			return pedir(RAIZ + ':commit', { writes: lote }).catch(function (err) {
				return pedir(RAIZ + '/chats/' + token + '/mensajes/' + id).then(function (doc) {
					var f = (doc && doc.fields) || {};
					var igual = ['de', 'texto', 'url'].every(function (k) { return (f[k] && f[k].stringValue) === (campos[k] && campos[k].stringValue); });
					if (!igual) throw err;
				}, function () { throw err; });
			});
		}
		// Lo que se está mandando, por intento (texto o foto): su id (y la foto ya subida), para reintentar sin repetir. El
		// texto que volvió al campo por un corte y se manda otra vez es el mismo intento; si se escribe algo distinto, o el
		// mismo texto después de haber salido bien, es otro.
		var pendientes = {}, ultimoTexto = null, intentos = 0;
		function intentoTexto(texto) {
			if (!ultimoTexto || ultimoTexto.texto !== texto) ultimoTexto = { texto: texto, n: ++intentos };
			return ultimoTexto.n + ':' + texto;
		}
		// Uno a la vez: los envíos van en fila (un comprobante que termina de subir mientras sale un texto espera su turno).
		// Mientras sale, la burbuja dice «Enviando…»; si no sale (sin red), «No se envió · Reintentar» debajo, con el mismo
		// id (nunca sale dos veces). Si lo guardado no se puede volver a leer, el mensaje igual quedó.
		var enviando = false, fila = Promise.resolve();
		function mandar(campos, clave) {
			var p = pendientes[clave] = pendientes[clave] || {};
			p.id = p.id || alAzar(20);
			p.campos = campos;
			var texto = campos.texto && campos.texto.stringValue;
			if (!campos.tipo) { locales[clave] = { id: p.id, de: 'cliente', texto: texto, _estado: 'enviando' }; pintar(true); }
			var paso = function () {
				enviando = true;
				adjuntar.disabled = true;
				return guardarMensaje(campos, p.id)
					.then(function () { delete pendientes[clave]; delete locales[clave]; if (clave.charAt(0) === 't') ultimoTexto = null; alerta(''); avisar(token); return cargar().catch(function () { pintar(true); }); })
					// La base lo rechazó (403): con un texto, es su filtro de contacto (el mismo del navegador; con el reloj del teléfono
					// muy corrido pueden no coincidir): se dice eso, por tipo si se reconoce, y el texto vuelve al campo.
					.catch(function (err) {
						if (texto && /HTTP 403/.test(err && err.message)) {
							delete locales[clave]; pintar(true);
							if (!campo.value) campo.value = texto;
							var tipo = V.tipoDeContacto(texto);
							return alerta(t['vacChatBloqueo' + (tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : '')] || t.vacChatBloqueo);
						}
						if (locales[clave]) { locales[clave]._estado = 'fallo'; pintar(true); } else alerta(t.vacChatFallo);
					})
					.then(function () { enviando = false; adjuntar.disabled = false; });
			};
			// Pase lo que pase con un envío, el siguiente sale igual (la fila nunca se queda trabada).
			fila = fila.then(paso, paso);
			return fila;
		}
		function reintentar(id) {
			Object.keys(pendientes).forEach(function (k) { if (pendientes[k].id === id) mandar(pendientes[k].campos, k); });
		}
		// El aviso de contacto mientras se escribe: el campo en rojo y «Enviar» apagado (lo que dice: el mismo texto de siempre).
		function avisoDe(texto) {
			var tipo = V.tipoDeContacto(texto);
			if (!tipo) return '';
			var clave = 'vacChatBloqueo' + tipo.charAt(0).toUpperCase() + tipo.slice(1);
			var conCamara = camaraVisible && t[clave + 'Pago'];
			// Coordenadas: la dirección llega con el pago; pagada, ya está arriba; sin reserva, un aviso sin promesa.
			if (tipo === 'ubicacion') clave += estadoChat === 'Pagada' ? 'Pagada' : estadoChat === 'No' || estadoChat === 'Cancelada' ? 'Sin' : '';
			// Lo raro (letras de ancho completo, otro alfabeto): se dice qué parte, si se encuentra.
			var raro = tipo === 'raro' ? (texto.match(/[０-９Ａ-Ｚａ-ｚ＠．。｡：／﹫]+/) || [''])[0] : '';
			return conCamara ? t[clave + 'Pago'] : raro ? fmt(t.vacChatBloqueoRaro, { parte: raro }) : t[clave] || t.vacChatBloqueo;
		}
		function revisar() { var a = avisoDe(campo.value); alerta(a); boton.disabled = Boolean(a); return !a; }
		// Lo que se escribe a mano en el campo es otro intento (el texto que vuelve por un corte no pasa por aquí).
		campo.addEventListener('input', function () {
			ultimoTexto = null;
			campo.style.height = 'auto'; campo.style.height = Math.min(campo.scrollHeight + 2, 132) + 'px';
			revisar();
		});
		// Enter envía; Mayús + Enter baja de línea.
		campo.addEventListener('keydown', function (e) {
			if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : boton.click(); }
		});
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var texto = campo.value.trim();
			if (!texto) return;
			// Teléfonos, correos y enlaces no pasan (el aviso dice qué parte parece contacto, en su idioma).
			if (!revisar()) return;
			if (enviando) return;
			// El campo se vacía de inmediato (otro Enter ya no encuentra texto).
			campo.value = ''; campo.style.height = '';
			mandar({ de: str('cliente'), texto: str(texto) }, 't:' + intentoTexto(texto));
		});
		// Foto del comprobante: se sube a la carpeta de esta reserva y queda como un mensaje.
		adjuntar.addEventListener('click', function () { archivo.click(); });
		archivo.addEventListener('change', function () {
			var f = archivo.files[0];
			archivo.value = '';
			if (!f) return;
			adjuntar.disabled = true;
			// La misma foto otra vez (se cortó la red): si ya se subió, se usa esa (no queda un archivo de más ni otro mensaje).
			var clave = 'f:' + f.name + ':' + f.size + ':' + f.lastModified;
			var ya = pendientes[clave] && pendientes[clave].url;
			// La foto se prepara como las del panel (admin/js/imagen.js: girada, hasta 1920 px, WebP), con la misma pieza: una
			// foto de 12 MB del teléfono o una de iPhone (HEIC) sube en segundos y cabe en el tope de 5 MB.
			var procesar = ya ? Promise.resolve(null) : window.EQImagen ? window.EQImagen.procesarImagen(f) : Promise.reject(new Error('sin EQImagen'));
			procesar.then(function (p) {
				if (ya) return { url: ya };
				if (!/^image\/(jpeg|png|webp)$/.test(p.blob.type) || p.blob.size >= 5 * 1024 * 1024) throw Object.assign(new Error('foto'), { foto: true });
				var nombre = 'chats/' + token + '/' + alAzar(16) + '.' + (p.blob.type === 'image/webp' ? 'webp' : p.blob.type.split('/')[1]);
				return fetch(FOTOS.slice(0, -1) + '?uploadType=media&name=' + encodeURIComponent(nombre), { method: 'POST', headers: { 'Content-Type': p.blob.type }, body: p.blob })
					.then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
					.then(function (r) { return { url: FOTOS + encodeURIComponent(nombre) + '?alt=media&token=' + r.downloadTokens }; });
			}, function () { throw Object.assign(new Error('foto'), { foto: true }); })
				.then(function (r) {
					pendientes[clave] = pendientes[clave] || {};
					pendientes[clave].url = r.url;
					return mandar({ de: str('cliente'), tipo: str('foto'), texto: str(r.url) }, clave);
				})
				.catch(function (err) { alerta(err && err.foto ? t.vacChatFotoGrande : t.vacChatFallo); adjuntar.disabled = false; });
		});
		cargar().catch(function () { pintar(true); });
		// Mensajes nuevos: se revisa cada 10 s mientras la página está a la vista.
		setInterval(function () { if (!document.hidden) cargar().catch(function () {}); }, 10000);
	}, function (err) { return /HTTP 404/.test(err && err.message) ? sinReserva() : sinRed(); });
})();
