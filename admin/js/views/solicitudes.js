// Solicitudes de reserva que llegan de la web. El socio ve las de sus casas y las responde;
// el administrador ve todas, con lo que falta responder y la comisión por cobrar.
// Comisión: el socio la paga a EQ el día de llegada y sube su comprobante; solo el administrador la marca pagada.
// Nada se borra: cada respuesta queda en el historial con quién y cuándo.
// Confirmar, cancelar, «No se dio», pago recibido y comisión pagada pasan por admin/js/reservas.js (lo mismo que usa
// Rentas vacacionales): allí se escriben la reserva, sus fechas en la casa, la solicitud y el chat; lo del socio, por el
// servidor (/api/reservas). Los montos salen de admin/js/reservas-calculo.js, lo mismo que usa el servidor.
import '/js/calc-vacacional.js';
import { h, statCard, mount, pageHeader, emptyState, toast, showError, errorMessage, modal, confirmDialog, badge, iconoBtn, formatDate, hoy, dia, ahoraYa } from '../ui.js';
import { session } from '../session.js';
import { comisionPagada, cobrarComision, ponerComprobante, estadoServidor } from '../reservas.js';
import { cambioElPrecio, llegadaPasada, comprobanteVigente, conDatosDelChat, TEXTO_CONFIRMA_EQUIPO, conPlazo, venceRespuesta, TEXTO_PRECIO_CAMBIO, ultimoDelHistorial, diaQueConfirmo } from '../reservas-calculo.js';
import { cargarSolicitudes, ESTADOS, estado, fechas } from '../solicitudes-base.js';
import { DIAS_CORTE } from '../permisos-socio.js';
import { whatsappUrl, nNoches, sumarPorMoneda, dineroPorMoneda, correoValido } from '../formato.js';
import { uploadImage, renderForm } from '../form.js';
import { money, ms, corregirCorreo, limpiarCorreo } from '../crm.js';
import { hace } from '../avisos-reglas.js';
import { avisarAvisos } from '../avisos.js';

const V = window.EQVacacional;
// Comprobantes del pago a EQ subiendo ahora (por reserva) y cuánto se espera cada uno. `vista`: la pantalla de
// Solicitudes abierta ahora (si se salió y se volvió mientras subía, al terminar se pone al día esa, no la de antes).
const SUBIENDO = new Set();
const LIMITE_SUBIDA = 90_000;
const vista = { pintar: () => {}, recargar: () => {} };
// Atraso de la comisión, según V.nivelComision().
const ATRASO = [['Al día', 'secondary'], ['Vencida', 'warning'], ['+24 h', 'danger'], ['+72 h · fuera del sitio', 'danger']];

export async function render(container, [codigo] = []) {
	const recargar = () => { container.replaceChildren(); return render(container, [codigo]); };
	const S = await cargarSolicitudes({ recargar: () => recargar() });
	const { admin, equipo, leads: todas, chats, datosChat, porResponder, revisiones, deHoy, reservas, propietarios, netos, variosChats,
		reservaDe, puedeCancelar, puedeNoMeLlego, debe, moraDe, porCobrar, teToca, alerta, ocupada, repetidaDe, seCruzaCon, cuenta, montosDe, plataDe, pasada, sinConfirmar,
		puedeConfirmar, puedePagoRecibido, hacer, confirmar, pagoRecibido, noMeLlego, noSeDio, cancelar } = S;
	// Primero la que se abrió por enlace, luego las que tienen un mensaje del cliente sin responder y las pendientes.
	// Cotizada por debajo del precio de la casa: la confirma el administrador, va arriba.
	const orden = (l) => (l.reserva.codigo === codigo ? 0 : teToca(l) ? 0.5 : porResponder.has(l.reserva.codigo) ? 1 : estado(l) === 'pendiente' ? 2 : 3);
	const leads = todas.sort((a, b) => orden(a) - orden(b) || ms(b.createdAt) - ms(a.createdAt));
	vista.recargar = () => (container.isConnected ? recargar() : undefined);

	// El socio sube la foto de su transferencia o depósito. Mientras sube, su botón se apaga y dice «Subiendo…» (otro toque
	// o una pestaña que se repinta no suben otra: SUBIENDO, por reserva); si no termina en LIMITE_SUBIDA, se dice y se
	// puede volver a intentar. El archivo que llegara tarde queda sin usar: la reserva guarda solo el que sí se registró.
	function subirComprobante(res) {
		if (SUBIENDO.has(res.id)) return;
		const archivo = h('input', { type: 'file', accept: 'image/*', onchange: async () => {
			const foto = archivo.files[0];
			if (!foto || SUBIENDO.has(res.id)) return;
			SUBIENDO.add(res.id);
			vista.pintar();
			let url;
			try {
				let vence;
				const tarde = new Promise((_, mal) => { vence = setTimeout(() => mal(Object.assign(new Error('lenta'), { code: 'subida/lenta' })), LIMITE_SUBIDA); });
				({ url } = await Promise.race([uploadImage(foto, `comprobantes/${res.id}`), tarde]).finally(() => clearTimeout(vence)));
			} catch (err) {
				const red = err?.code === 'subida/lenta' || /^storage\/(retry-limit-exceeded|canceled|unknown)$/.test(err?.code || '') || err?.code === 'auth/network-request-failed';
				toast(red ? 'No se pudo subir el comprobante: la conexión está lenta o se cortó. Vuelve a intentarlo.' : `No se pudo subir el comprobante: ${errorMessage(err)}`, 'warning');
				SUBIENDO.delete(res.id);
				return vista.pintar();
			}
			// Apagado hasta que la reserva lo registra; después la pantalla abierta se repinta con lo guardado.
			try { await ponerComprobante(res, url); toast('Comprobante enviado.'); avisarAvisos(); } catch (err) { showError(err); }
			SUBIENDO.delete(res.id);
			vista.pintar();
			await vista.recargar();
		} });
		archivo.click();
	}
	// El botón del comprobante: mientras sube, apagado y con «Subiendo…».
	const botonComprobante = (com, res) => (SUBIENDO.has(res.id)
		? h('button', { type: 'button', class: 'btn-toque btn btn-sm btn-outline-secondary', disabled: true, 'aria-live': 'polite' },
			h('span', { class: 'spinner-border spinner-border-sm me-1', 'aria-hidden': 'true' }), 'Subiendo…')
		: iconoBtn('icon-upload', com.comprobante ? 'Cambiar comprobante' : 'Subir comprobante del pago a EQ', { onclick: () => subirComprobante(res) }));

	// La alerta de cada mañana: confirmada, llegada pasada y sin «Pago recibido». Si el equipo supo que el cliente pagó,
	// «Cobrar comisión»: desde ahí su atraso cuenta para apagarle los permisos al socio (permisos-socio.js cuentaParaCorte).
	async function cobrar(l, res) {
		if (!(await confirmDialog(`${l.reserva.codigo}: ¿el cliente sí pagó? Se cobra la ganancia de EQ (${money(res.comision.monto, res.moneda)}) y, si el socio se atrasa ${DIAS_CORTE} días, se le apagan los permisos.`, { okText: 'Cobrar comisión', danger: false }))) return;
		await hacer(async () => { await cobrarComision(res); toast('Comisión por cobrar.'); });
	}

	async function pagada(l, res, nivel) {
		if (!(await confirmDialog(`${l.reserva.codigo}: ¿ya recibiste la ganancia de EQ (${money(res.comision.monto, res.moneda)})?`, { okText: 'Marcar pagada', danger: false }))) return;
		await hacer(async () => {
			await comisionPagada({ ...res, propertyTitulo: res.propertyTitulo || l.propertyTitulo }, nivel);
			toast('Ganancia de EQ pagada.');
		});
	}

	// Lo que vence solo (netlify/functions/plazos-reservas.mjs): se dice en la tarjeta para que nadie se sorprenda.
	function plazo(l) {
		const p = S.plazoDe(l);
		if (!p) return null;
		if (p.sinPlazo) return h('div', { class: 'small text-muted' }, h('span', { class: 'icon-clock-o me-1', 'aria-hidden': 'true' }), S.textoPlazo(p));
		return h('div', { class: `small ${p.vence - Date.now() < 6 * 3600000 ? 'text-danger' : 'text-muted'}` }, h('span', { class: 'icon-clock-o me-1', 'aria-hidden': 'true' }), S.textoPlazo(p));
	}
	// Quién hizo qué y cuándo con esta solicitud: lo último que pasó a la vista (un correo corregido o reenviado no lo
	// tapa: ultimoDelHistorial); todo, al abrirlo.
	function historial(sol) {
		const renglones = (sol.historial || []).filter((x) => x?.que);
		if (!renglones.length) return null;
		const linea = (x) => `${x.que} · ${x.nombre || ''}${x.nombre ? ' · ' : ''}${formatDate(x.cuando)}`;
		const ultimo = ultimoDelHistorial(renglones);
		// El motivo va con el renglón que lo puso (el que la cerró: lo último que pasó), no con una nota de después.
		const conMotivo = (x) => linea(x) + (sol.motivo && x === ultimo ? ` · ${sol.motivo}` : '');
		if (renglones.length === 1) return h('div', { class: 'small text-muted' }, conMotivo(ultimo));
		return h('details', { class: 'small text-muted' }, h('summary', {}, conMotivo(ultimo)),
			h('ol', { class: 'mb-0 ps-3' }, renglones.map((x) => h('li', {}, conMotivo(x)))));
	}

	// Corregir el correo del cliente (crm.js corregirCorreo: el mismo que usa su ficha de cliente). Con el formulario del panel:
	// revisa el formato y sugiere «¿Quisiste decir …?». Al guardar se le reenvía el enlace de su reserva: el botón dice a qué
	// correo, tal como se guarda (un error de dedo mandaría su reserva a otra persona); con el mismo correo, no se guarda.
	function corregirElCorreo(l) {
		const form = renderForm([{ name: 'email', label: 'Correo del cliente', type: 'email', required: true }], { email: l.email || '' });
		const campo = form.el.querySelector('input[type=email]');
		const texto = h('span', { class: 'text-break' });
		const avion = h('span', { class: 'icon-paper-plane me-1', 'aria-hidden': 'true' });
		// Lo mismo que revisa el servidor: abierta (sin responder o confirmada) y su salida no ha pasado.
		const reenvia = ['pendiente', 'confirmada'].includes(estado(l)) && l.reserva.salida >= hoy();
		const guardar = h('button', { class: 'btn btn-primary text-start', onclick: async (e) => {
			const boton = e.currentTarget;
			if (!form.validate()) return;
			boton.disabled = true;
			try {
				const r = await corregirCorreo(l, form.getData().email);
				m.close();
				if (!r.cambio) toast('Ya tenía ese correo.');
				else if (r.enviado) toast(`Correo corregido: le reenviamos el enlace de su reserva a ${r.enviado}.`);
				else if (r.enviado === '' && reenvia) toast(`Correo corregido, pero el enlace no se reenvió${r.motivo ? ` (${r.motivo.replace(/\.$/, '')})` : ''}: los próximos avisos sí le llegan ahí.`, 'warning');
				else toast('Correo corregido: los próximos avisos le llegan ahí.');
				await recargar();
			} catch (err) { showError(err); boton.disabled = false; }
		} }, avion, texto);
		const pintarBoton = () => {
			const nuevo = limpiarCorreo(campo?.value);
			const igual = nuevo === limpiarCorreo(l.email);
			texto.textContent = igual || !correoValido(nuevo) ? 'Guardar' : reenvia ? `Guardar y reenviar a ${nuevo}` : `Guardar ${nuevo}`;
			guardar.disabled = igual;
			avion.hidden = !(reenvia && !igual && correoValido(nuevo));
		};
		campo?.addEventListener('input', pintarBoton);
		pintarBoton();
		const m = modal({ title: `Correo · ${l.reserva.codigo}`, body: form.el, footer: [h('button', { class: 'btn btn-light', 'data-bs-dismiss': 'modal' }, 'Cancelar'), guardar] });
	}

	function tarjeta(l) {
		const r = l.reserva;
		const sol = l.solicitud || {};
		const est = estado(l);
		// Una reserva ya confirmada muestra lo que quedó guardado (su comisión), no la cuenta con los precios de hoy.
		const res = est === 'confirmada' ? reservaDe(l) : null;
		// Todo en la moneda de la solicitud (la que vio el cliente): si la casa cambió de moneda después, la cuenta con la
		// casa de hoy saldría en otra y no se muestra (esa solicitud no se confirma: sinConfirmar lo dice).
		const c = plataDe(l);
		// El precio de hoy ya no es el que se le cotizó (solo mientras se puede confirmar).
		const cambio = est === 'pendiente' && cambioElPrecio(montosDe(l), cuenta(l));
		const ch = datosChat[r.codigo];
		const aviso = alerta(l);
		const tarde = aviso === 'tarde';
		const evasion = aviso === 'bloqueada';
		const yaOcupada = ocupada(l);
		// Otra solicitud sin responder con alguna de estas noches (llegó mientras la otra ya no las apartaba, o a la vez).
		const cruce = est === 'pendiente' && !yaOcupada && seCruzaCon(l);
		const yaPaso = pasada(l);
		const noConfirma = sinConfirmar(l);
		const mon = res?.moneda || r.moneda || 'USD';
		const wa = (mensaje) => iconoBtn('icon-whatsapp', `WhatsApp a ${l.nombre}`, { href: whatsappUrl(l.telefono, mensaje), target: '_blank', rel: 'noopener' });
		const com = res?.comision?.monto > 0 ? res.comision : null;
		// El atraso que castiga (V.nivelMora): solo si se sabe que el cliente pagó (pago marcado o «Cobrar comisión»).
		const nivel = com ? V.nivelMora(conDatosDelChat(res, ch), Date.now()) : 0;
		const icono = (i) => h('span', { class: `icon-${i} me-1`, 'aria-hidden': 'true' });
		const boton = (texto, clase, onclick, i) => h('button', { type: 'button', class: `btn-toque btn btn-sm ${clase}`, onclick }, icono(i), texto);
		return h('div', { class: `card mb-2${r.codigo === codigo ? ' border-primary' : tarde ? ' border-warning' : ''}` }, h('div', { class: 'card-body' },
			h('div', { class: 'd-flex flex-wrap align-items-center gap-2' },
				h('strong', {}, r.codigo), h('span', {}, admin ? l.nombre : String(l.nombre || '').trim().split(/\s+/)[0]), badge(...ESTADOS[est]),
				evasion ? badge('Revisar: fechas bloqueadas', 'danger') : null,
				yaOcupada ? badge('Esas fechas ya tienen otra reserva', 'warning') : null,
				cruce ? badge(`Se cruza con otra solicitud: ${cruce}`, 'warning') : null,
				teToca(l) ? badge('Te toca confirmar', 'danger') : null,
				yaPaso ? badge('La fecha de llegada ya pasó', 'warning') : null,
				((x) => (x ? badge(`Posible repetida de ${x}`, 'warning') : null))(repetidaDe(l)),
				porResponder.has(r.codigo) ? badge('Mensaje sin responder', 'info') : null,
				datosChat[r.codigo]?.estado === 'pagada' ? badge('Pago recibido', 'success') : null,
				est === 'confirmada' && ch?.estado === 'confirmada' && comprobanteVigente(ch) ? badge('Cliente subió comprobante', 'info') : null,
				est === 'confirmada' && ch?.estado === 'confirmada' && ch.pagoReabierto && !comprobanteVigente(ch) ? badge('Se le pidió otro comprobante', 'warning') : null,
				cambio ? badge(TEXTO_PRECIO_CAMBIO, 'warning') : null,
				h('span', { class: `ms-auto small ${tarde ? 'text-danger' : 'text-muted'}` }, hace(ms(l.createdAt)))),
			h('div', { class: 'small text-muted' }, [l.propertyTitulo, netos[l.propertyId]?.codigoSocio && `Código del socio: ${netos[l.propertyId].codigoSocio}`, admin && propietarios.find((p) => p.id === l.propietarioId)?.nombre].filter(Boolean).join(' · ')),
			h('div', {}, `${fechas(r)} · ${nNoches(r.noches)} · ${r.huespedes} ${r.huespedes === 1 ? 'persona' : 'personas'}`),
			h('div', { class: 'small' }, `Cliente paga ${money(r.total, r.moneda)}`,
				c ? ` · ${admin ? 'Socio' : 'Tu parte'} ${money(c.costoSocio, mon)} · ${admin ? 'Ganancia de EQ' : 'Ganancia de EQ (se la pagas)'} ${money(c.ganancia, mon)}` : ''),
			com ? h('div', { class: 'small d-flex flex-wrap align-items-center gap-2' }, h('span', {}, icono('money'), `Ganancia de EQ: se paga el ${dia(com.vence)}`),
				com.pagada ? badge('Pagada', 'success') : [badge(...ATRASO[nivel]), com.comprobante ? badge('Comprobante enviado', 'info') : null]) : null,
			noConfirma ? h('div', { class: 'small text-danger' }, h('span', { class: 'icon-exclamation-triangle me-1', 'aria-hidden': 'true' }), noConfirma) : null,
			// La revisión del comprobante con la IA: solo un aviso (nunca decide); la de la foto que está vigente.
			((rv) => (rv?.texto && est === 'confirmada' && ch && comprobanteVigente(ch) && rv.mensaje === ch.comprobanteMensaje
				? h('div', { class: `small ${rv.cuadra ? 'text-success' : 'text-danger'}` }, h('span', { class: `icon-${rv.cuadra ? 'check-circle' : 'exclamation-triangle'} me-1`, 'aria-hidden': 'true' }),
					rv.texto, h('span', { class: 'text-muted' }, [rv.leido?.banco, rv.leido?.referencia && `ref. ${rv.leido.referencia}`].filter(Boolean).map((x) => ` · ${x}`).join('')))
				: null))(revisiones[l.id]),
			// El correo del cliente rebotó (/api/rebote-correo): no recibe los avisos de su reserva; se le escribe por WhatsApp.
			admin && l.reboteCorreo ? h('div', { class: 'small text-danger' }, h('span', { class: 'icon-envelope-o me-1', 'aria-hidden': 'true' }),
				'El correo no llegó: escríbele por WhatsApp o corrígelo.') : null,
			plazo(l),
			// Hasta cuándo vale «No me llegó»: después, sin pago marcado, la ganancia de EQ cuenta como cobrada (V.cobrable).
			!admin && est === 'confirmada' && res && puedeNoMeLlego(l) ? h('div', { class: 'small text-muted' }, icono('clock-o'),
				`Si no te pagó, toca «No me llegó» antes del ${dia(V.sumarDias(V.ultimoDiaNoLlego(res), 1))}; después la ganancia de EQ cuenta como cobrada.`) : null,
			historial(sol),
			h('div', { class: 'd-flex flex-wrap align-items-center gap-2 mt-2' },
				// Con el cliente solo habla el equipo por WhatsApp; el socio le escribe por el chat y al equipo, por WhatsApp.
				!admin ? (equipo ? iconoBtn('icon-whatsapp', `WhatsApp a ${equipo.nombre}`, { href: whatsappUrl(equipo.whatsapp,
					`Hola, soy ${session.dueno?.nombre || session.profile?.nombre || 'el socio'}. Te escribo por la solicitud ${r.codigo} de ${l.propertyTitulo} (${fechas(r)}).`), target: '_blank', rel: 'noopener' }) : null)
					: est === 'no'
					? wa(`Hola ${l.nombre}, te escribimos de EQ Inmobiliario. ¿Pudiste reservar ${l.propertyTitulo} para ${fechas(r)}?`)
					: wa(`Hola ${l.nombre}, te escribo por tu solicitud ${r.codigo} de ${l.propertyTitulo} (${fechas(r)}).`),
				// La conversación vive en Mensajes (una sola: el hilo con sus acciones).
				chats[r.codigo] ? iconoBtn('icon-comments', 'Chat con el cliente', { href: `#/mensajes/${encodeURIComponent(r.codigo)}` }) : null,
				est === 'pendiente' && deHoy(l.propertyId) ? [puedeConfirmar(l) ? boton('Confirmar', 'btn-primary', () => confirmar(l), 'check') : null, boton('No se dio', puedeConfirmar(l) ? 'btn-outline-secondary' : 'btn-primary', () => noSeDio(l, yaOcupada ? 'Fechas no disponibles' : ''), 'close')] : null,
				puedePagoRecibido(l) ? boton('Pago recibido', 'btn-primary', () => pagoRecibido(l), 'money') : null,
				com?.comprobante ? iconoBtn('icon-file-image-o', 'Ver comprobante del pago a EQ', { href: com.comprobante, target: '_blank', rel: 'noopener' }) : null,
				com && !com.pagada && !admin ? botonComprobante(com, res) : null,
				com && !com.pagada && session.isAdmin ? boton('Pagada', 'btn-success', () => pagada(l, res, nivel), 'money') : null,
				com && !com.pagada && !com.cobrar && !res.pagoRecibido && session.isAdmin && llegadaPasada(r.llegada, ahoraYa()) && ch?.estado === 'confirmada' ? boton('Cobrar comisión', 'btn-outline-primary', () => cobrar(l, res), 'check') : null,
				// Con el pago recibido o el día de llegada ya empezado, cancelar anularía la comisión: solo el administrador
				// (el servidor lo exige: motivoParaNoCancelar en admin/js/reservas-calculo.js).
				est === 'confirmada' && (session.isAdmin ? r.salida > hoy() : puedeCancelar(l)) ? boton('Cancelar', 'btn-outline-danger', () => cancelar(l), 'ban') : null,
				// Con el comprobante del cliente, o desde el día de llegada sin el pago: en vez de «Cancelar».
				!admin && est === 'confirmada' && puedeNoMeLlego(l) ? boton('No me llegó', 'btn-outline-danger', () => noMeLlego(l), 'ban') : null,
				// El correo al que le llegan los avisos de su reserva y su lápiz (lo lee el servidor de la solicitud), juntos y al
				// final: las respuestas van primero; en el celular no se separan de fila.
				admin ? h('span', { class: 'd-inline-flex align-items-center gap-2 mw-100 ms-auto' },
					h('span', { class: `small text-break ${l.reboteCorreo ? 'text-danger' : 'text-muted'}`, style: 'min-width:0' }, h('span', { class: 'icon-envelope-o me-1', 'aria-hidden': 'true' }), l.email || 'Sin correo'),
					iconoBtn('icon-pencil', 'Corregir el correo', { onclick: () => corregirElCorreo(l) })) : null)));
	}

	const lista = h('div', {});
	const filtro = { socio: '', estado: codigo === 'cobrar' ? 'cobrar' : '' };
	const pintar = vista.pintar = () => {
		const ver = leads.filter((l) => (!filtro.socio || l.propietarioId === filtro.socio) && (!filtro.estado || (filtro.estado === 'cobrar' ? porCobrar(l) : filtro.estado === 'alerta' ? alerta(l) : estado(l) === filtro.estado)));
		// Por cobrar: primero la más atrasada; luego la que vence antes.
		if (filtro.estado === 'cobrar') ver.sort((a, b) => moraDe(reservaDe(b)) - moraDe(reservaDe(a)) || String(reservaDe(a).comision.vence).localeCompare(String(reservaDe(b).comision.vence)));
		lista.replaceChildren(ver.length ? ver.map(tarjeta) : emptyState('No hay solicitudes.'));
	};
	pintar();

	const numero = (icono, valor, texto) => h('div', { class: 'col-4' }, statCard(icono, texto, valor, { cls: 'stat-envuelve' }));
	const elegir = (campo, titulo, opciones) => h('select', {
		class: 'form-select form-select-sm w-auto', 'aria-label': titulo, onchange: (e) => { filtro[campo] = e.target.value; pintar(); }
	}, h('option', { value: '' }, titulo), opciones.map(([v, t]) => h('option', { value: v, selected: filtro[campo] === v }, t)));
	const total = {};
	reservas.filter((r) => r.estado === 'confirmada' && r.comision && !r.comision.pagada)
		.forEach((r) => { total[r.moneda] = (total[r.moneda] || 0) + r.comision.monto; });
	// Aviso al socio: cuánto debe a EQ (por moneda: nunca se suman Q y US$), cuánto con atraso y lo que ya le pasa por eso,
	// con el botón que deja solo esas reservas (y el que vuelve a todas). Sin atraso, una línea sin rojo.
	const avisoDeuda = (() => {
		if (admin) return null;
		const debidas = reservas.filter(debe);
		if (!debidas.length) return null;
		const peor = Math.max(...debidas.map(moraDe));
		// Las monedas siempre en el mismo orden (el total y lo atrasado se leen igual).
		const suma = (l) => dineroPorMoneda(Object.fromEntries(Object.entries(sumarPorMoneda(l, (r) => r.comision.monto, (r) => r.moneda || r.comision.moneda)).sort(([a], [b]) => b.localeCompare(a))));
		const todo = suma(debidas), atrasado = suma(debidas.filter((r) => moraDe(r) >= 1));
		const deuda = `Debes a EQ ${todo}${!peor ? '' : atrasado === todo ? ', con atraso' : ` (con atraso: ${atrasado})`}`;
		const texto = peor === 3 ? `${deuda}. Con más de 72 horas de atraso, tus casas salieron del sitio hasta que EQ lo marque pagado.`
			: peor === 2 ? `${deuda}. Con más de 24 horas de atraso, los clientes de tus casas le escriben a EQ hasta que lo marque pagado.`
			: peor === 1 ? `${deuda}. A las 24 horas de atraso, los clientes de tus casas le escriben a EQ.`
			: `${deuda}: se paga el ${dia(debidas.map((r) => r.comision.vence).sort()[0])}.`;
		const ver = filtro.estado === 'cobrar'
			? h('a', { class: 'cot-btn btn btn-sm btn-outline-secondary', href: '#/solicitudes' }, h('span', { class: 'icon-list me-1', 'aria-hidden': 'true' }), 'Ver todas')
			: h('a', { class: 'cot-btn btn btn-sm btn-outline-primary', href: '#/solicitudes/cobrar' }, h('span', { class: 'icon-money me-1', 'aria-hidden': 'true' }), 'Ver lo que debo');
		// Sin atraso, una línea con el botón a la derecha; con atraso, el botón sigue al texto (en el celular no le quita ancho).
		if (!peor) return h('div', { class: 'd-flex align-items-center gap-2 small text-muted mb-3' }, h('span', { class: 'icon-money', 'aria-hidden': 'true' }),
			h('span', { class: 'flex-grow-1', style: 'min-width:0' }, texto), h('span', { class: 'flex-shrink-0' }, ver));
		ver.classList.add('ms-1', 'align-middle');
		return h('div', { class: `d-flex gap-2 alert ${peor >= 2 ? 'alert-danger' : 'alert-warning'}`, role: 'alert' }, h('span', { class: 'icon-exclamation-triangle mt-1', 'aria-hidden': 'true' }),
			h('span', { class: 'flex-grow-1', style: 'min-width:0' }, texto, ' ', ver));
	})();
	const conSolicitud = propietarios.filter((p) => leads.some((l) => l.propietarioId === p.id));

	// ¿El servidor ya escribe lo del socio? (con su cuenta de escritura en Netlify: ver docs/portal-propietarios.md).
	// Se pinta cuando llega, sin hacer esperar a la pantalla.
	const indicador = h('div', {});
	if (session.isAdmin) estadoServidor().catch(() => 'error').then((servidor) => {
		indicador.className = 'small text-muted mb-2 d-flex align-items-center gap-1';
		indicador.replaceChildren(h('span', { class: servidor === 'activo' ? 'icon-check text-success' : 'icon-exclamation-triangle text-warning', 'aria-hidden': 'true' }),
			`Reservas por servidor: ${servidor === 'activo' ? 'activo' : servidor === 'sin configurar' ? 'sin configurar' : 'con error (revisa la cuenta de escritura en Netlify)'}`);
	});
	// Sin datos de pago no se puede confirmar (el cliente no sabría a dónde pagar): se avisa aquí, antes de que llegue
	// el momento de confirmar. Al equipo, por cada socio con solicitudes abiertas; al socio, de sí mismo.
	const sinDatosPago = (x) => !String(x?.datosPago || '').trim();
	const abiertas = (id) => leads.some((l) => l.propietarioId === id && ['pendiente', 'confirmada'].includes(estado(l)));
	const faltaPago = admin ? propietarios.filter((p) => sinDatosPago(p) && abiertas(p.id)) : [];
	const avisoPago = admin
		? (faltaPago.length ? h('div', { class: 'alert alert-warning d-flex flex-wrap align-items-center gap-2', role: 'alert' }, h('span', { class: 'icon-exclamation-triangle', 'aria-hidden': 'true' }),
			h('span', { class: 'flex-grow-1' }, `Faltan los datos de pago de ${faltaPago.map((p) => p.nombre || 'un socio').join(', ')}: sin ellos no se puede confirmar su reserva.`),
			faltaPago.map((p) => h('a', { class: 'btn btn-sm btn-outline-primary', href: `#/propietarios/${p.id}` }, faltaPago.length > 1 ? `Completar (${String(p.nombre || '').split(' ')[0]})` : 'Completar'))) : null)
		: (session.dueno && sinDatosPago(session.dueno) ? h('div', { class: 'alert alert-warning d-flex flex-wrap align-items-center gap-2', role: 'alert' }, h('span', { class: 'icon-exclamation-triangle', 'aria-hidden': 'true' }),
			h('span', { class: 'flex-grow-1' }, 'Faltan tus datos de pago: sin ellos no puedes confirmar una reserva, porque el cliente no sabría a dónde pagar.'),
			equipo ? h('a', { class: 'btn btn-sm btn-outline-primary', target: '_blank', rel: 'noopener', href: whatsappUrl(equipo.whatsapp, 'Hola, te envío mis datos de pago para las reservas (banco, tipo y número de cuenta, a nombre de quién): ') },
				h('span', { class: 'icon-whatsapp me-1', 'aria-hidden': 'true' }), 'Enviar mis datos') : null) : null);
	// Por hacer del administrador: las que le tocan a él, con su plazo de 24 h (después se cierran solas).
	const suyas = leads.filter(teToca);
	const porHacer = suyas.length ? h('div', { class: 'alert alert-danger d-flex align-items-baseline gap-2', role: 'alert' }, h('span', { class: 'icon-exclamation-triangle', 'aria-hidden': 'true' }),
		h('span', { class: 'flex-grow-1' }, `Te toca confirmar (${TEXTO_CONFIRMA_EQUIPO.toLowerCase()}): `,
			suyas.map((l, i) => [i ? ', ' : '', h('a', { href: `#/solicitudes/${encodeURIComponent(l.reserva.codigo)}` }, l.reserva.codigo),
				conPlazo(ms(l.createdAt)) ? ` (vence ${formatDate(new Date(venceRespuesta(ms(l.createdAt))))})` : '']))) : null;
	mount(container,
		pageHeader('Solicitudes'),
		porHacer,
		avisoPago,
		indicador,
		variosChats.length ? h('div', { class: 'alert alert-warning d-flex gap-2', role: 'alert' }, h('span', { class: 'icon-exclamation-triangle mt-1', 'aria-hidden': 'true' }),
			`${variosChats.join(', ')}: ${variosChats.length === 1 ? 'esta solicitud tiene' : 'estas solicitudes tienen'} más de un chat. Revisa cuál es el del cliente; hasta entonces el socio no puede confirmarla ni cancelarla.`) : null,
		admin ? [
			h('div', { class: 'row g-2 mb-3' },
				numero('icon-clock-o', leads.filter((l) => estado(l) === 'pendiente').length, 'Sin responder'),
				numero('icon-check', leads.filter((l) => estado(l) === 'confirmada' && diaQueConfirmo(l.solicitud.historial).startsWith(hoy().slice(0, 7))).length, 'Confirmadas'),
				numero('icon-money', Object.entries(total).map(([m, n]) => money(V.r2(n), m)).join(' · ') || '—', 'Por cobrar')),
			h('div', { class: 'd-flex flex-wrap gap-2 mb-3' },
				elegir('socio', 'Todos los socios', conSolicitud.map((p) => [p.id, p.nombre])),
				elegir('estado', 'Todos los estados', [...Object.entries(ESTADOS).map(([v, [t]]) => [v, t]), ['cobrar', 'Ganancia de EQ por cobrar'], ['alerta', 'Con alerta']]))
		] : avisoDeuda,
		lista);
}
