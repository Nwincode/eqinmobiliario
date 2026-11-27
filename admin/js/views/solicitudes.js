// Solicitudes de reserva que llegan de la web. El socio ve las de sus casas y las responde;
// el administrador ve todas, con lo que falta responder y la comisión por cobrar.
// Comisión: el socio la paga a EQ el día de llegada y sube su comprobante; solo el administrador la marca pagada.
// Nada se borra: cada respuesta queda en el historial con quién y cuándo.
// Confirmar, cancelar, «No se dio», pago recibido y comisión pagada pasan por admin/js/reservas.js (lo mismo que usa
// Rentas vacacionales): allí se escriben la reserva, sus fechas en la casa, la solicitud y el chat; lo del socio, por el
// servidor (/api/reservas). Los montos salen de admin/js/reservas-calculo.js, lo mismo que usa el servidor.
import '/js/calc-vacacional.js';
import { h, statCard, mount, pageHeader, emptyState, toast, showError, errorMessage, modal, confirmDialog, badge, iconoBtn, menuMas, nombreYDatos, formatDate, hoy, dia, ahoraYa } from '../ui.js';
import { session } from '../session.js';
import { comisionPagada, cobrarComision, ponerComprobante, estadoServidor } from '../reservas.js';
import { cambioElPrecio, llegadaPasada, comprobanteVigente, conDatosDelChat, TEXTO_CONFIRMA_EQUIPO, conPlazo, venceRespuesta, TEXTO_PRECIO_CAMBIO, ultimoDelHistorial, diaQueConfirmo } from '../reservas-calculo.js';
import { cargarSolicitudes, ESTADOS, estado } from '../solicitudes-base.js';
import { DIAS_CORTE } from '../permisos-socio.js';
import { whatsappUrl, nNoches, sumarPorMoneda, dineroPorMoneda, correoValido, primerNombre, fechasReserva } from '../formato.js';
import { uploadImage, renderForm } from '../form.js';
import { money, ms, corregirCorreo, limpiarCorreo } from '../crm.js';
import { hace } from '../avisos-reglas.js';
import { avisarAvisos } from '../avisos.js';
import { fotosOcultas } from '../hilo.js';
import { estadoIA } from '../ia.js';

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
	const [S, iaActiva] = await Promise.all([cargarSolicitudes({ recargar: () => recargar() }), estadoIA()]);
	const { admin, equipo, leads: todas, chats, datosChat, porResponder, revisiones, fotos, deHoy, propietarios, netos, variosChats,
		reservaDe, puedeCancelar, puedeNoMeLlego, debidas, solicitudDe, moraDe, teToca, alerta, ocupada, repetidaDe, seCruzaCon, cuenta, montosDe, plataDe, pasada, sinConfirmar,
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
			let path;
			try {
				let vence;
				const tarde = new Promise((_, mal) => { vence = setTimeout(() => mal(Object.assign(new Error('lenta'), { code: 'subida/lenta' })), LIMITE_SUBIDA); });
				// Solo la ruta: Storage no abre comprobantes/ a nadie; lo sirve /api/foto (verComprobante).
				({ path } = await Promise.race([uploadImage(foto, `comprobantes/${res.id}`, null, undefined, { sinEnlace: true }), tarde]).finally(() => clearTimeout(vence)));
			} catch (err) {
				const red = err?.code === 'subida/lenta' || /^storage\/(retry-limit-exceeded|canceled|unknown)$/.test(err?.code || '') || err?.code === 'auth/network-request-failed';
				toast(red ? 'No se pudo subir el comprobante: la conexión está lenta o se cortó. Vuelve a intentarlo.' : `No se pudo subir el comprobante: ${errorMessage(err)}`, 'warning');
				SUBIENDO.delete(res.id);
				return vista.pintar();
			}
			// Apagado hasta que la reserva lo registra; después la pantalla abierta se repinta con lo guardado.
			try { await ponerComprobante(res, path); toast('Comprobante enviado.'); avisarAvisos(); } catch (err) { showError(err); }
			SUBIENDO.delete(res.id);
			vista.pintar();
			await vista.recargar();
		} });
		archivo.click();
	}
	// El comprobante del pago a EQ lo sirve el servidor (/api/foto { reserva }: el administrador y el socio de la reserva).
	// La pestaña se abre al tocar (si no, el navegador la bloquea) y recibe la foto cuando llega.
	async function verComprobante(res) {
		const ventana = window.open('', '_blank');
		try {
			const r = await fetch('/api/foto', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await session.user.getIdToken()}` }, body: JSON.stringify({ reserva: res.id }) });
			if (!r.ok) throw new Error(r.status === 403 ? 'Este comprobante no es de tus reservas.' : `No se pudo abrir el comprobante (${r.status}).`);
			const url = URL.createObjectURL(await r.blob());
			if (ventana) ventana.location.href = url; else window.open(url, '_blank');
		} catch (err) { ventana?.close(); showError(err); }
	}
	// El botón del comprobante: mientras sube, apagado y con «Subiendo…».
	const botonComprobante = (com, res) => (SUBIENDO.has(res.id)
		? h('button', { type: 'button', class: 'btn-toque btn btn-sm btn-outline-secondary', disabled: true, 'aria-live': 'polite' },
			h('span', { class: 'spinner-border spinner-border-sm me-1', 'aria-hidden': 'true' }), 'Subiendo…')
		: iconoBtn('icon-upload', com.comprobante ? 'Cambiar comprobante' : 'Subir comprobante de la comisión', { onclick: () => subirComprobante(res) }));

	// La alerta de cada mañana: confirmada, llegada pasada y sin «Pago recibido». Si el equipo supo que el cliente pagó,
	// «Cobrar comisión»: desde ahí su atraso cuenta para apagarle los permisos al socio (permisos-socio.js cuentaParaCorte).
	async function cobrar(l, res) {
		if (!(await confirmDialog(`${l.reserva.codigo}: ¿el cliente sí pagó? Se cobra la comisión (${money(res.comision.monto, res.moneda)}) y, si el socio se atrasa ${DIAS_CORTE} días, se le apagan los permisos.`, { okText: 'Cobrar comisión', danger: false }))) return;
		await hacer(async () => { await cobrarComision(res); toast('Comisión por cobrar.'); });
	}

	async function pagada(res, nivel, titulo) {
		if (!(await confirmDialog(`${res.codigo || titulo}: ¿ya recibiste la comisión (${money(res.comision.monto, res.moneda)})?`, { okText: 'Marcar pagada', danger: false }))) return;
		await hacer(async () => {
			await comisionPagada({ ...res, propertyTitulo: res.propertyTitulo || titulo }, nivel);
			toast('Comisión pagada.');
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
	// revisa el formato y sugiere «¿Quisiste decir …?». Al guardar se le manda un enlace nuevo de su reserva (el viejo deja de
	// servir: pudo llegar a otra persona; /api/reenviar-enlace): el botón dice a qué
	// correo, tal como se guarda (un error de dedo mandaría su reserva a otra persona); con el mismo correo, «Reenviar a …».
	function corregirElCorreo(l) {
		const form = renderForm([{ name: 'email', label: 'Correo del cliente', type: 'email', required: true }], { email: l.email || '' });
		const campo = form.el.querySelector('input[type=email]');
		const texto = h('span', { class: 'text-break' });
		const avion = h('span', { class: 'icon-paper-plane me-1', 'aria-hidden': 'true' });
		// Lo mismo que revisa el servidor: abierta (sin responder o confirmada) y su salida no ha pasado.
		const reenvia = ['pendiente', 'confirmada'].includes(estado(l)) && l.reserva.salida >= hoy();
		// Junto a «Cancelar», nunca en otra fila: ocupa lo que queda y la dirección parte dentro del botón (no se recorta: se lee entera).
		const guardar = h('button', { class: 'btn btn-primary text-start', style: 'flex: 1 1 0; min-width: 0', onclick: async (e) => {
			const boton = e.currentTarget;
			if (!form.validate()) return;
			boton.disabled = true;
			try {
				const r = await corregirCorreo(l, form.getData().email);
				m.close();
				const nuevo = r.rotado ? ' (el enlace de antes ya no sirve)' : '';
				if (r.enviado) toast(`${r.cambio ? 'Correo corregido: l' : 'L'}e mandamos el enlace nuevo de su reserva a ${r.enviado}${nuevo}.`);
				else if (reenvia) toast(`${r.cambio ? 'Correo corregido, pero el' : 'El'} enlace nuevo no se le mandó${r.motivo ? ` (${r.motivo.replace(/\.$/, '')})` : ''}${nuevo}: vuelve a intentarlo con el mismo correo.`, 'warning');
				else if (!r.cambio) toast('Ya tenía ese correo.');
				else toast(`Correo corregido: los próximos avisos le llegan ahí${nuevo}.`);
				await recargar();
			} catch (err) { showError(err); boton.disabled = false; }
		} }, avion, texto);
		const pintarBoton = () => {
			const nuevo = limpiarCorreo(campo?.value);
			const igual = nuevo === limpiarCorreo(l.email);
			// Con el mismo correo de ahora, en una reserva abierta: «Reenviar a …» (otro enlace nuevo, si el anterior no salió).
			texto.textContent = !correoValido(nuevo) ? 'Guardar' : igual ? (reenvia ? `Reenviar a ${nuevo}` : 'Guardar') : reenvia ? `Guardar y reenviar a ${nuevo}` : `Guardar ${nuevo}`;
			guardar.disabled = igual && !reenvia;
			avion.hidden = !(reenvia && correoValido(nuevo));
		};
		campo?.addEventListener('input', pintarBoton);
		pintarBoton();
		const m = modal({ title: `Correo · ${l.reserva.codigo}`, body: form.el, footer: [h('button', { class: 'btn btn-light', 'data-bs-dismiss': 'modal' }, 'Cancelar'), guardar] });
	}

	// La ganancia de EQ de una reserva: cuándo se paga y cómo va, y sus botones (ver y subir el comprobante; marcarla
	// pagada). Lo mismo en la tarjeta de una solicitud y en la de una reserva sin solicitud (tarjetaReserva).
	const icono = (i) => h('span', { class: `icon-${i} me-1`, 'aria-hidden': 'true' });
	const boton = (texto, clase, onclick, i) => h('button', { type: 'button', class: `btn-toque btn btn-sm ${clase}`, onclick }, icono(i), texto);
	const lineaComision = (com, nivel) => h('div', { class: 'small d-flex flex-wrap align-items-center gap-2' }, h('span', {}, icono('money'), `Comisión: se paga el ${dia(com.vence)}`),
		com.pagada ? badge('Pagada', 'success') : [badge(...ATRASO[nivel]), com.comprobante ? badge('Comprobante enviado', 'info') : null]);
	// A la vista, lo que se hace con la ganancia de EQ: «Pagada» (equipo) y, mientras sube, «Subiendo…» apagado (un segundo
	// toque no sube otra). Ver y subir el comprobante van en el ⋮ de la tarjeta (masComision).
	const botonesComision = (com, res, nivel, titulo) => [
		!com.pagada && !admin && SUBIENDO.has(res.id) ? botonComprobante(com, res) : null,
		!com.pagada && session.isAdmin ? boton('Pagada', 'btn-success', () => pagada(res, nivel, titulo), 'money') : null];
	const masComision = (com, res) => [
		com.comprobante ? { icono: 'icon-file-image-o', texto: 'Ver comprobante de la comisión', onclick: () => verComprobante(res) } : null,
		!com.pagada && !admin && !SUBIENDO.has(res.id) ? { icono: 'icon-upload', texto: com.comprobante ? 'Cambiar comprobante' : 'Subir comprobante de la comisión', onclick: () => subirComprobante(res) } : null];
	// Una sola fila de botones: lo secundario en un ⋮ al final (borrar o anular, al final y en rojo).
	const mas = (titulo, items) => menuMas(`Más acciones: ${titulo}`, items, { cls: 'btn-outline-secondary' });

	// Una reserva que debe ganancia de EQ y no tiene solicitud que se vea (sin chat: el socio no la ve en la lista): la
	// misma tarjeta, con lo de su ganancia y nada de lo que se responde en una solicitud.
	function tarjetaReserva(res) {
		const nivel = V.nivelMora(conDatosDelChat(res, datosChat[res.codigo]), Date.now());
		return h('div', { class: 'card mb-2', dataset: { codigo: res.codigo || res.id } }, h('div', { class: 'card-body' },
			nombreYDatos((admin ? res.huesped : primerNombre(res.huesped)) || 'Reserva sin chat', [res.codigo, res.propertyTitulo, admin && propietarios.find((p) => p.id === res.propietarioId)?.nombre].filter(Boolean).join(' · '),
				[badge(...ESTADOS.confirmada)], { envuelve: true }),
			h('div', {}, `${fechasReserva(res)} · ${nNoches(res.noches)}`),
			h('div', { class: 'small' }, `${admin ? 'Socio' : 'Tu parte'} ${money(res.costoSocio, res.moneda)} · Comisión ${money(res.comision.monto, res.moneda)}`),
			lineaComision(res.comision, nivel),
			h('div', { class: 'd-flex flex-wrap align-items-center gap-2 mt-2' }, botonesComision(res.comision, res, nivel, res.propertyTitulo), mas(res.codigo || res.propertyTitulo, masComision(res.comision, res)))));
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
		return h('div', { class: `card mb-2${r.codigo === codigo ? ' border-primary' : tarde ? ' border-warning' : ''}`, dataset: { codigo: r.codigo } }, h('div', { class: 'card-body' },
			// El nombre solo en su línea; el código, cuándo llegó, la casa y el socio en la de datos (se recorta por el final), con
			// las etiquetas al final (nombreYDatos).
			nombreYDatos((admin ? l.nombre : primerNombre(l.nombre)) || '(sin nombre)',
				[`${r.codigo} · `, h('span', { class: tarde ? 'text-danger' : null }, hace(ms(l.createdAt))),
					[l.propertyTitulo, netos[l.propertyId]?.codigoSocio && `Código del socio: ${netos[l.propertyId].codigoSocio}`, admin && propietarios.find((p) => p.id === l.propietarioId)?.nombre].filter(Boolean).map((x) => ` · ${x}`).join('')],
				[badge(...ESTADOS[est]),
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
					cambio ? badge(TEXTO_PRECIO_CAMBIO, 'warning') : null], { envuelve: true }),
			h('div', {}, `${fechasReserva(r)} · ${nNoches(r.noches)} · ${r.huespedes} ${r.huespedes === 1 ? 'persona' : 'personas'}`),
			// Con impuestos: por eso la parte del socio y la de EQ no suman ese total. En el celular, lo que se reparte baja a
			// su propia línea (sin que un monto quede solo en otra); en la computadora, todo en una.
			h('div', { class: 'small' }, `Cliente paga ${money(r.total, r.moneda)} con impuestos`,
				c ? h('span', { class: 'd-block d-md-inline' }, h('span', { class: 'd-none d-md-inline' }, ' · '), `${admin ? 'Socio' : 'Tu parte'} ${money(c.costoSocio, mon)} · Comisión ${money(c.ganancia, mon)}`) : null),
			com ? lineaComision(com, nivel) : null,
			noConfirma ? h('div', { class: 'small text-danger' }, h('span', { class: 'icon-exclamation-triangle me-1', 'aria-hidden': 'true' }), noConfirma) : null,
			// La revisión del comprobante con la IA: solo un aviso (nunca decide); la de la foto que está vigente. Lo que el socio
			// no ve lo dice estadoDeFoto (hilo.js), lo mismo que decide /api/foto: al socio, que el equipo la revisa; al equipo, por
			// qué y el enlace al chat, donde está «Mostrar al socio».
			((rv) => {
				if (est !== 'confirmada' || ch?.estado !== 'confirmada') return null;
				const ocultas = fotosOcultas(fotos[r.codigo] || [], { chat: ch, rv, ia: iaActiva, ahora: ahoraYa() });
				const vigente = comprobanteVigente(ch);
				const oculta = vigente && ocultas.some((o) => o.m.id === ch.comprobanteMensaje);
				const leida = vigente && rv?.texto && rv.mensaje === ch.comprobanteMensaje && !(!admin && oculta)
					? h('div', { class: `small ${rv.cuadra && !rv.oculta ? 'text-success' : 'text-danger'}` }, h('span', { class: `icon-${rv.cuadra ? 'check-circle' : 'exclamation-triangle'} me-1`, 'aria-hidden': 'true' }),
						rv.texto, h('span', { class: 'text-muted' }, [rv.leido?.banco, rv.leido?.referencia && `ref. ${rv.leido.referencia}`].filter(Boolean).map((x) => ` · ${x}`).join(''))) : null;
				if (!admin) return oculta ? h('div', { class: 'small text-muted' }, h('span', { class: 'icon-info-circle me-1', 'aria-hidden': 'true' }), 'El equipo está revisando la foto del comprobante.') : leida;
				return [leida, ocultas.length ? h('div', { class: 'small text-danger' }, h('span', { class: 'icon-eye-slash me-1', 'aria-hidden': 'true' }),
					ocultas.length === 1 ? `Foto oculta al socio: ${ocultas[0].marca}` : `${ocultas.length} fotos ocultas al socio`, ' · ',
					h('a', { href: `#/mensajes/${encodeURIComponent(r.codigo)}` }, 'Revisar en el chat')) : null];
			})(revisiones[l.id]),
			// El correo del cliente rebotó (/api/rebote-correo): no recibe los avisos de su reserva; se le escribe por WhatsApp.
			admin && l.reboteCorreo ? h('div', { class: 'small text-danger' }, h('span', { class: 'icon-envelope-o me-1', 'aria-hidden': 'true' }),
				'El correo no llegó: escríbele por WhatsApp o corrígelo.') : null,
			plazo(l),
			// Hasta cuándo vale «No me llegó»: después, sin pago marcado, la ganancia de EQ cuenta como cobrada (V.cobrable).
			!admin && est === 'confirmada' && res && puedeNoMeLlego(l) ? h('div', { class: 'small text-muted' }, icono('clock-o'),
				`Si no te pagó, toca «No me llegó» antes del ${dia(V.sumarDias(V.ultimoDiaNoLlego(res), 1))}; después la comisión cuenta como cobrada.`) : null,
			historial(sol),
			h('div', { class: 'd-flex flex-wrap align-items-center gap-2 mt-2' },
				// Con el cliente solo habla el equipo por WhatsApp; el socio le escribe por el chat y al equipo, por WhatsApp.
				!admin ? (equipo ? iconoBtn('icon-whatsapp', `WhatsApp a ${equipo.nombre}`, { href: whatsappUrl(equipo.whatsapp,
					`Hola, soy ${session.dueno?.nombre || session.profile?.nombre || 'el socio'}. Te escribo por la solicitud ${r.codigo} de ${l.propertyTitulo} (${fechasReserva(r)}).`), target: '_blank', rel: 'noopener' }) : null)
					: est === 'no'
					? wa(`Hola ${l.nombre}, te escribimos de Equipo Inmobiliario. ¿Pudiste reservar ${l.propertyTitulo} para ${fechasReserva(r)}?`)
					: wa(`Hola ${l.nombre}, te escribo por tu solicitud ${r.codigo} de ${l.propertyTitulo} (${fechasReserva(r)}).`),
				// La conversación vive en Mensajes (una sola: el hilo con sus acciones).
				chats[r.codigo] ? iconoBtn('icon-comments', 'Chat con el cliente', { href: `#/mensajes/${encodeURIComponent(r.codigo)}` }) : null,
				// Si el socio no puede confirmarla (la confirma el equipo), ninguna acción va en azul: «No se dio» queda gris.
				est === 'pendiente' && deHoy(l.propertyId) ? [puedeConfirmar(l) ? boton('Confirmar', 'btn-primary', () => confirmar(l), 'check') : null, boton('No se dio', puedeConfirmar(l) || !admin ? 'btn-outline-secondary' : 'btn-primary', () => noSeDio(l, yaOcupada ? 'Fechas no disponibles' : ''), 'close')] : null,
				puedePagoRecibido(l) ? boton('Pago recibido', 'btn-primary', () => pagoRecibido(l), 'money') : null,
				com ? botonesComision(com, res, nivel, l.propertyTitulo) : null,
				com && !com.pagada && !com.cobrar && !res.pagoRecibido && session.isAdmin && llegadaPasada(r.llegada, ahoraYa()) && ch?.estado === 'confirmada' ? boton('Cobrar comisión', 'btn-outline-primary', () => cobrar(l, res), 'check') : null,
				// En el ⋮: el comprobante de la ganancia de EQ y, al final y en rojo, «Cancelar reserva» o, en su lugar, «No me llegó»
				// (con el comprobante del cliente, o desde el día de llegada sin el pago). Con el pago recibido o el día de llegada ya
				// empezado, cancelar anularía la comisión: solo el administrador (el servidor lo exige: motivoParaNoCancelar en
				// admin/js/reservas-calculo.js).
				mas(r.codigo, [
					...(com ? masComision(com, res) : []),
					est === 'confirmada' && (session.isAdmin ? r.salida > hoy() : puedeCancelar(l)) ? { icono: 'icon-ban', texto: 'Cancelar reserva', peligro: true, onclick: () => cancelar(l) } : null,
					!admin && est === 'confirmada' && puedeNoMeLlego(l) ? { icono: 'icon-ban', texto: 'No me llegó', peligro: true, onclick: () => noMeLlego(l) } : null]),
				// El correo al que le llegan los avisos de su reserva y su lápiz (lo lee el servidor de la solicitud), juntos y al
				// final: las respuestas van primero; en el celular no se separan de fila.
				admin ? h('span', { class: 'd-inline-flex align-items-center gap-2 mw-100 ms-auto' },
					h('span', { class: `small text-break ${l.reboteCorreo ? 'text-danger' : 'text-muted'}`, style: 'min-width:0' }, h('span', { class: 'icon-envelope-o me-1', 'aria-hidden': 'true' }), l.email || 'Sin correo'),
					iconoBtn('icon-pencil', 'Corregir el correo', { onclick: () => corregirElCorreo(l) })) : null)));
	}

	const lista = h('div', {});
	// Terminada y sin nada por hacer: cancelada, «No se dio» o confirmada cuya salida ya pasó, sin mensaje que responder,
	// sin ganancia de EQ por cobrar ni «Pago recibido» por tocar. La que se abrió por enlace nunca se pliega.
	const porCobrar = new Set(debidas);
	const anterior = (l) => l.reserva.codigo !== codigo && !teToca(l) && !porResponder.has(l.reserva.codigo) && !porCobrar.has(reservaDe(l))
		&& !puedePagoRecibido(l) && (['no', 'cancelada'].includes(estado(l)) || (estado(l) === 'confirmada' && l.reserva.salida < hoy()));
	let anterioresAbierta = false;
	const filtro = { socio: '', estado: codigo === 'cobrar' ? 'cobrar' : '' };
	const pintar = vista.pintar = () => {
		const delSocio = (x) => !filtro.socio || x.propietarioId === filtro.socio;
		// Por cobrar: las mismas reservas que suma el aviso (debidas, la más atrasada primero), cada una con su solicitud si
		// se ve y está confirmada (así lleva su ganancia y sus botones); si no, con la tarjeta de la reserva.
		if (filtro.estado === 'cobrar') {
			const deber = debidas.filter(delSocio);
			return lista.replaceChildren(deber.length ? deber.map((res) => ((l) => (l && estado(l) === 'confirmada' ? tarjeta(l) : tarjetaReserva(res)))(solicitudDe(res))) : emptyState('No hay comisiones por cobrar.'));
		}
		const ver = leads.filter((l) => delSocio(l) && (!filtro.estado || (filtro.estado === 'alerta' ? alerta(l) : estado(l) === filtro.estado)));
		if (!ver.length) return lista.replaceChildren(emptyState('No hay solicitudes.'));
		// Sin filtro, lo terminado va plegado al final en «Anteriores (N)»: así arriba queda solo lo que sigue activo.
		const viejas = filtro.estado ? [] : ver.filter(anterior);
		const activas = ver.filter((l) => !viejas.includes(l));
		lista.replaceChildren(...activas.map(tarjeta), viejas.length ? h('details', {
			class: 'calc-detalle', open: anterioresAbierta || undefined, ontoggle: (e) => { anterioresAbierta = e.target.open; }
		}, h('summary', {}, h('span', { class: 'icon-chevron-down me-2 calc-chev', 'aria-hidden': 'true' }), `Anteriores (${viejas.length})`,
			h('span', { class: 'ms-auto small text-muted fw-normal d-none d-md-inline' }, 'Canceladas, «No se dio» y las que ya pasaron')),
		viejas.map(tarjeta)) : null);
	};
	pintar();

	const numero = (icono, valor, texto) => h('div', { class: 'col-4' }, statCard(icono, texto, valor, { cls: 'stat-envuelve' }));
	const elegir = (campo, titulo, opciones) => h('select', {
		class: 'form-select form-select-sm w-auto', 'aria-label': titulo, onchange: (e) => { filtro[campo] = e.target.value; pintar(); }
	}, h('option', { value: '' }, titulo), opciones.map(([v, t]) => h('option', { value: v, selected: filtro[campo] === v }, t)));
	// Lo que se debe, por moneda (nunca se suman Q y US$), siempre en el mismo orden: el aviso del socio y «Por cobrar».
	const suma = (l) => dineroPorMoneda(Object.fromEntries(Object.entries(sumarPorMoneda(l, (r) => r.comision.monto, (r) => r.moneda || r.comision.moneda)).sort(([a], [b]) => b.localeCompare(a))));
	// Aviso al socio: cuánto debe a EQ (por moneda: nunca se suman Q y US$), cuánto con atraso y lo que ya le pasa por eso,
	// con el botón que deja solo esas reservas (y el que vuelve a todas). Sin atraso, una línea sin rojo.
	const avisoDeuda = (() => {
		if (admin) return null;
		if (!debidas.length) return null;
		const peor = Math.max(...debidas.map(moraDe));
		const todo = suma(debidas), atrasado = suma(debidas.filter((r) => moraDe(r) >= 1));
		const deuda = `Debes a Equipo Inmobiliario ${todo}${!peor ? '' : atrasado === todo ? ', con atraso' : ` (con atraso: ${atrasado})`}`;
		const texto = peor === 3 ? `${deuda}. Con más de 72 horas de atraso, tus casas salieron del sitio hasta que Equipo Inmobiliario lo marque pagado.`
			: peor === 2 ? `${deuda}. Con más de 24 horas de atraso, los clientes de tus casas le escriben a Equipo Inmobiliario hasta que lo marque pagado.`
			: peor === 1 ? `${deuda}. A las 24 horas de atraso, los clientes de tus casas le escriben a Equipo Inmobiliario.`
			: `${deuda}: se paga el ${dia(debidas.map((r) => r.comision.vence).sort()[0])}.`;
		const ver = filtro.estado === 'cobrar'
			? h('a', { class: 'btn-toque btn btn-sm btn-outline-secondary', href: '#/solicitudes' }, h('span', { class: 'icon-list me-1', 'aria-hidden': 'true' }), 'Ver todas')
			: h('a', { class: 'btn-toque btn btn-sm btn-outline-primary', href: '#/solicitudes/cobrar' }, h('span', { class: 'icon-money me-1', 'aria-hidden': 'true' }), 'Ver lo que debo');
		// Sin atraso, una línea con el botón a la derecha; con atraso, en el celular el botón sigue al texto (no le quita
		// ancho) y desde tableta va a la derecha (aviso-linea: no agranda una línea del texto).
		if (!peor) return h('div', { class: 'd-flex align-items-center gap-2 small text-muted mb-3' }, h('span', { class: 'icon-money', 'aria-hidden': 'true' }),
			h('span', { class: 'flex-grow-1', style: 'min-width:0' }, texto), h('span', { class: 'flex-shrink-0' }, ver));
		ver.classList.add('ms-1', 'align-middle');
		return h('div', { class: `d-flex align-items-md-center gap-2 alert ${peor >= 2 ? 'alert-danger' : 'alert-warning'}`, role: 'alert' }, h('span', { class: 'icon-exclamation-triangle mt-1 mt-md-0', 'aria-hidden': 'true' }),
			h('span', { class: 'aviso-linea flex-grow-1', style: 'min-width:0' }, h('span', {}, texto), ' ', ver));
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
			suyas.map((l, i) => [i ? ', ' : '', h('a', { class: 'enlace-toque', href: `#/solicitudes/${encodeURIComponent(l.reserva.codigo)}` }, l.reserva.codigo),
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
				numero('icon-money', suma(debidas) || '—', 'Por cobrar')),
			h('div', { class: 'd-flex flex-wrap gap-2 mb-3' },
				elegir('socio', 'Todos los socios', conSolicitud.map((p) => [p.id, p.nombre])),
				elegir('estado', 'Todos los estados', [...Object.entries(ESTADOS).map(([v, [t]]) => [v, t]), ['cobrar', 'Comisión por cobrar'], ['alerta', 'Con alerta']]))
		] : avisoDeuda,
		lista);
}
