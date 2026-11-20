// Control de las solicitudes de reserva vacacional: cada hora, de 7 a 21 h de Guatemala, avisa por correo al equipo de
// - las que el socio lleva más de 2 horas sin responder (las de la noche vencen a las 7 a. m.),
// - los mensajes del cliente en el chat de su reserva que llevan más de 2 horas sin respuesta, y
// - las reservas confirmadas que se cancelaron: por la solicitud y también por la reserva misma (una cancelación escrita
//   directo en la base, sin pasar por el panel, no manda el correo de /api/aviso-chat; aquí sí llega).
// - las que el socio respondió «No se dio», o que se cancelaron sin pago o porque «el cliente canceló», y después esas
//   mismas fechas aparecen bloqueadas o con otra reserva en la casa (puede ser un cliente que se cerró por fuera);
// - a las 7 a. m., las reservas confirmadas sin pago marcado cuya llegada ya pasó (el socio no tocó «Pago recibido» ni
//   «No me llegó»): sin esto, su comisión vence sin que nadie sepa si el cliente pagó. Salen cada mañana hasta resolverse.
// Además reintenta una vez los correos del chat que no salieron (avisoPendiente: aviso-chat-envio.mjs).
// Cada una se avisa una sola vez: entra en el correo de la hora en que venció o se canceló (la de «No se dio» queda
// anotada en alertas/bloqueo-{id}, que solo escribe la cuenta de escritura: las reglas no dejan a nadie más).
// Es lo único de una reserva que llega al equipo: lo demás lo resuelven el cliente y el socio en la plataforma.
// Además, a las 7 a. m. le recuerda a cada socio las comisiones que se pagan ese día.
import { servicioCorreo, destinatariosEquipo, enviarCorreo, plantilla, boton, esc, SITE_URL } from '../lib/correo.mjs';
import { datosConfigurados, consultar, desde, leerPrivado, listar } from '../lib/firestore.mjs';
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { sinResponder } from '../lib/avisos-chat.mjs';
import { enviarAvisosChat, avisarQueTocaConfirmar } from '../lib/aviso-chat-envio.mjs';
import { prefijoMoneda, miles } from '../../admin/js/formato.js';
import { MOTIVO_SIN_PAGO, MOTIVO_NO_LLEGO, MOTIVO_DUPLICADA, MOTIVO_FECHAS_APARTADAS, MOTIVO_SIN_CHAT, conPlazo, comprobanteVigente } from '../../admin/js/reservas-calculo.js';
import '../../js/calc-vacacional.js';

const V = globalThis.EQVacacional;

const HORA = 3600_000;
const PLAZO = 2 * HORA;
const REPASO = 10 * 60_000;

export default async () => {
	// Basta el servicio de correo: el recordatorio de comisiones va a cada socio; lo demás, solo si hay correos del equipo.
	if (!servicioCorreo() || !datosConfigurados()) return;
	try {
		const ahora = Date.now();
		// Guatemala va 6 horas detrás de UTC, sin horario de verano. A las 7 se recogen también las de la noche.
		const sonLas7 = (new Date(ahora).getUTCHours() + 18) % 24 === 7;
		const ventana = sonLas7 ? 10 * HORA : HORA;
		// Lo nuevo va aparte: si falla, no se pierde la alerta de siempre (cada caso se avisa una sola vez).
		if (sonLas7) await recordarComisiones(ahora).catch((err) => console.error('Recordatorio de comisiones:', err.message));
		const enVentana = (t) => t > ahora - ventana && t <= ahora;
		const [nuevas, cambiadas] = await Promise.all([
			desde('leads', 'createdAt', new Date(ahora - ventana - PLAZO)),
			desde('leads', 'updatedAt', new Date(ahora - ventana))
		]);
		const sinRespuesta = nuevas.filter((l) => l.reserva?.codigo && !l.solicitud?.estado && enVentana(l.createdAt.getTime() + PLAZO));
		const deSolicitud = cambiadas.filter((l) => l.solicitud?.estado === 'cancelada');
		// Reservas de la web canceladas en la ventana (las reglas exigen al socio la hora del servidor en updatedAt) que no
		// salieron ya por su solicitud. Si esta lectura falla, se avisa lo de siempre.
		const yaVan = new Set(deSolicitud.map((l) => l.reserva?.codigo));
		const deReserva = (await desde('reservas', 'updatedAt', new Date(ahora - ventana)).catch((err) => { console.error('Reservas canceladas:', err.message); return []; }))
			.filter((r) => r.estado === 'cancelada' && r.codigo && !yaVan.has(r.codigo))
			.map((r) => ({ nombre: r.huesped || 'Huésped', propertyTitulo: r.propertyTitulo, propietarioId: r.propietarioId, solicitud: { motivo: r.motivo },
				revisadoAMano: r.revisadoAMano, reserva: { codigo: r.codigo, llegada: r.llegada, salida: r.salida, moneda: r.moneda, total: r.alojamiento } }));
		const canceladas = [...deSolicitud, ...deReserva];
		const hoy = V.hoy(ahora);
		// Los chats, sin listarlos todos: cada grupo con su consulta (un rango sobre un campo, con el índice que Firestore
		// crea solo). Los que salen hoy o después; los que tienen un correo pendiente (un texto no vacío) y los que tienen
		// el pago reabierto, por viejos que sean. Si una falla, sigue lo demás.
		const chatsCon = (campo, valor) => consultar('chats', campo, valor).catch((err) => { console.error(`Chats (${campo}):`, err.message); return []; });
		const [abiertos, conAvisoPendiente, conPagoReabierto] = await Promise.all([
			consultar('chats', 'salida', hoy).catch((err) => { console.error('Chats abiertos:', err.message); return []; }),
			chatsCon('avisoPendiente', '\u0001'),
			sonLas7 ? chatsCon('pagoReabierto', 1) : []
		]);
		// Los correos del chat que no salieron: un reintento cada uno (aviso-chat-envio.mjs lo quita salga o no).
		for (const c of conAvisoPendiente) await enviarAvisosChat(c.id, { reintento: true }).catch((err) => console.error('Reintento de aviso:', err.message));
		// «Te toca confirmar» que no salió (cotizada por debajo del precio de la casa, sin responder): otro intento.
		for (const c of abiertos.filter((x) => x.teTocaPendiente && !x.estado)) await avisarQueTocaConfirmar(c.id).catch((err) => console.error('Reintento de «Te toca confirmar»:', err.message));
		// Confirmadas sin pago marcado con la llegada ya pasada: cada mañana, hasta que se resuelvan.
		const sinPago = !sonLas7 ? [] : await (async () => {
			// Todas las de plazos (lo de antes no) sin la comisión pagada, sin límite de días: una que el socio nunca marca
			// sigue saliendo hasta que se resuelva (y desde los 3 días de la llegada ya cuenta para la mora: V.cobrable).
			const candidatas = (await listar('reservas')).filter((r) => r.estado === 'confirmada' && r.leadId && r.chat && r.llegada < hoy && !r.comision?.pagada && !r.comision?.cobrar
				&& conPlazo(r.createdAt instanceof Date ? r.createdAt.getTime() : Date.parse(r.createdAt || '') || 0));
			// Su chat, uno por uno (son pocas): solo cuenta si la solicitud sigue confirmada.
			const chats = await Promise.all(candidatas.map((r) => leerPrivado(`chats/${r.chat}`).catch(() => null)));
			return candidatas.filter((r, i) => chats[i]?.estado === 'confirmada')
				.map((r) => ({ nombre: r.huesped || 'Huésped', propertyTitulo: r.propertyTitulo, propietarioId: r.propietarioId,
					revisadoAMano: r.revisadoAMano, reserva: { codigo: r.codigo, llegada: r.llegada, salida: r.salida, moneda: r.moneda, total: r.alojamiento } }));
		})().catch((err) => { console.error('Confirmadas sin pago:', err.message); return []; });
		// «No me llegó» reabrió el pago, venció el plazo nuevo y el cliente no mandó otro comprobante: no se cancela sola
		// (mandó uno antes), lo revisa el equipo con los dos. Cada mañana, hasta que se resuelva.
		const reabiertas = conPagoReabierto.filter((c) => c.estado === 'confirmada' && Number(c.vencePago) > 0 && Number(c.vencePago) < ahora && !comprobanteVigente(c))
			.map((c) => ({ nombre: c.nombre, propertyTitulo: c.propertyTitulo, propietarioId: c.propietarioId, reserva: { codigo: c.codigo, llegada: c.llegada, salida: c.salida, moneda: c.moneda, total: c.total } }));
		// Chats de reservas vigentes donde lo último lo escribió el cliente y nadie le ha contestado: solo los abiertos (los
		// viejos no cuentan ni cuestan lecturas, por muchos que haya).
		const mensajes = await (async () => {
			const vigentes = abiertos.filter((c) => !['no', 'cancelada'].includes(c.estado));
			return (await Promise.all(vigentes.map(async (c) => {
				const lista = (await listar(`chats/${c.id}/mensajes`)).sort((a, b) => a.createdAt - b.createdAt);
				// Un mensaje que no avisó por correo (el otro estaba conversando y se fue sin leerlo): su aviso sale 10 min
				// después, una sola vez (cuando esa marca cae en la ventana de esta revisión). Si falla, sigue lo demás.
				const ultimo = lista.at(-1);
				if (ultimo && enVentana(new Date(ultimo.createdAt).getTime() + REPASO)) await enviarAvisosChat(c.id, { repaso: true }).catch((err) => console.error('Repaso de aviso:', err.message));
				return sinResponder(lista, { ahora, plazo: PLAZO, ventana }) ? { nombre: c.nombre, propertyTitulo: c.propertyTitulo, propietarioId: c.propietarioId,
					reserva: { codigo: c.codigo, llegada: c.llegada, salida: c.salida, huespedes: c.huespedes, moneda: c.moneda, total: c.total } } : null;
			}))).filter(Boolean);
		})().catch((err) => { console.error('Mensajes sin responder:', err.message); return []; });
		// Se anota una sola vez al avisar: sin correos del equipo no se anota (se avisa cuando los haya).
		const sospechosas = !destinatariosEquipo().length ? [] : await noSeDioYBloqueada(ahora).catch((err) => { console.error('«No se dio» y bloqueada:', err.message); return []; });
		if (!destinatariosEquipo().length || (!sinRespuesta.length && !canceladas.length && !mensajes.length && !sospechosas.length && !sinPago.length && !reabiertas.length)) return;

		const socios = {};
		for (const id of new Set([...sinRespuesta, ...canceladas, ...mensajes, ...sospechosas, ...sinPago, ...reabiertas].map((l) => l.propietarioId).filter(Boolean))) {
			socios[id] = (await leerPrivado(`propietarios/${id}`).catch(() => null))?.nombre || '';
		}
		const linea = (l) => {
			const r = l.reserva;
			return [`${r.codigo} · ${l.nombre}`, l.propertyTitulo, [`${r.llegada} → ${r.salida}`, r.huespedes && `${r.huespedes} personas`, r.total != null && `${prefijoMoneda(r.moneda)} ${miles(r.total)}`].filter(Boolean).join(' · '),
				socios[l.propietarioId] && `Socio: ${socios[l.propietarioId]}`, l.solicitud?.motivo && `Motivo: ${l.solicitud.motivo}`,
				// Se confirmó sin poder leer un calendario: quien confirmó dijo que lo revisó a mano.
				l.revisadoAMano?.length && `Se confirmó sin leer ${l.revisadoAMano.join(' y ')} (revisado a mano)`].filter(Boolean);
		};
		const enPanel = (l) => `${SITE_URL}/admin/#/solicitudes/${l.reserva.codigo}`;
		const grupos = [['Solicitudes sin responder hace más de 2 horas', sinRespuesta], ['Mensajes del cliente sin responder hace más de 2 horas', mensajes], ['Reservas canceladas', canceladas],
			['«No se dio» o cancelada y después esas fechas se ocuparon: revisa si el cliente se cerró por fuera', sospechosas],
			['Confirmadas sin «Pago recibido» y con la llegada ya pasada: pregúntale al socio si el cliente pagó; si pagó, toca «Cobrar comisión» en la solicitud (desde ahí su atraso le apaga los permisos)', sinPago],
			['El socio dijo «No me llegó», venció el plazo nuevo y el cliente no mandó otro comprobante: revisa con los dos (no se cancela sola)', reabiertas]].filter(([, lista]) => lista.length);
		const asunto = [sinRespuesta.length && `${sinRespuesta.length} sin responder`, mensajes.length && `${mensajes.length} mensaje(s) sin respuesta`, canceladas.length && `${canceladas.length} cancelada(s)`, sospechosas.length && `${sospechosas.length} cerrada(s) con fechas ocupadas`, sinPago.length && `${sinPago.length} sin pago marcado`, reabiertas.length && `${reabiertas.length} pago reabierto vencido`].filter(Boolean).join(' · ');

		const html = await plantilla({
			titulo: 'Reservas que necesitan tu atención',
			intro: sinRespuesta.length || mensajes.length ? 'El socio no respondió a tiempo. Abre la solicitud y respóndele al cliente desde el chat para no perder la reserva.' : 'Abre cada una en el panel para ver qué pasó.',
			bloques: (c) => grupos.map(([titulo, lista]) => `<h2 style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;color:${c.dark}">${titulo}</h2>
${lista.map((l) => `<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:${c.dark}">${linea(l).map(esc).join('<br>')}</p>
${boton(c, `Abrir ${l.reserva.codigo}`, enPanel(l), c.primary)}`).join('')}`).join('') + `
<p style="margin:0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px"><a href="${SITE_URL}/admin/#/solicitudes" target="_blank" style="display:inline-block;padding:12px 8px;color:${c.primary};font-weight:bold;text-decoration:underline">Ver en el panel</a></p>`
		});
		const texto = grupos.map(([titulo, lista]) => [titulo, ...lista.map((l) => [...linea(l), enPanel(l)].join('\n'))].join('\n\n')).join('\n\n');
		await enviarCorreo({ para: destinatariosEquipo(), asunto: `Reservas: ${asunto}`, html, texto });
	} catch (err) {
		console.error('Solicitudes sin respuesta:', err.message);
	}
};

// «No se dio» (salvo las repetidas) o cancelada sin pago o porque «el cliente canceló» (de los últimos 60 días, con
// fechas por venir) y ahora esas noches están bloqueadas o tienen una reserva anotada a mano en la misma casa: la señal
// de un cliente que pudo cerrarse por fuera. Una sola vez por solicitud; sin la cuenta de
// escritura no se puede anotar, y no se avisa (para no mandar el mismo correo cada hora).
// Las que cerró el sistema porque otra se confirmó en esas fechas (Duplicada, «Fechas ya reservadas») o porque no tenían
// chat («Sin chat») no cuentan.
const cerradaSinReserva = (s) => (s?.estado === 'no' && ![MOTIVO_DUPLICADA, MOTIVO_FECHAS_APARTADAS, MOTIVO_SIN_CHAT].includes(s.motivo)) || (s?.estado === 'cancelada' && [MOTIVO_SIN_PAGO, MOTIVO_NO_LLEGO, 'Cliente canceló'].includes(s.motivo));
async function noSeDioYBloqueada(ahora) {
	if (!escrituraConfigurada()) return [];
	const hoy = V.hoy(ahora);
	const nos = (await desde('leads', 'updatedAt', new Date(ahora - 60 * 24 * HORA)))
		.filter((l) => cerradaSinReserva(l.solicitud) && l.propertyId && l.reserva?.llegada && l.reserva.salida > hoy);
	if (!nos.length) return [];
	const reservas = await listar('reservas');
	const casas = new Map();
	const avisar = [];
	for (const l of nos) {
		if (!casas.has(l.propertyId)) casas.set(l.propertyId, await leerPrivado(`properties/${l.propertyId}`).catch(() => null));
		const choca = (b) => Boolean(b?.desde) && b.desde < l.reserva.salida && b.hasta > l.reserva.llegada;
		const bloqueada = (casas.get(l.propertyId)?.vacacional?.bloqueos || []).some(choca);
		// Solo una reserva anotada a mano (sin solicitud de la web): otra solicitud de la web confirmada en esas fechas es el
		// camino normal (dos clientes pidieron lo mismo y se le dio a uno).
		const otra = reservas.some((r) => r.propertyId === l.propertyId && r.estado !== 'cancelada' && !r.leadId && choca({ desde: r.llegada, hasta: r.salida }));
		if (!bloqueada && !otra) continue;
		const ruta = `alertas/bloqueo-${l.id}`;
		const nueva = await transaccion(async ({ leer, crear }) => {
			if (await leer(ruta)) return false;
			crear(ruta, { leadId: l.id, codigo: l.reserva.codigo || '' }, { ahora: ['cuando'] });
			return true;
		}).catch((err) => { console.error('Alerta de bloqueo:', err.message); return false; });
		if (nueva) avisar.push(l);
	}
	return avisar;
}

// Comisiones que se pagan hoy: un correo a cada socio con las suyas, para que pague y suba su comprobante sin que el equipo lo persiga.
async function recordarComisiones(ahora) {
	const hoy = V.hoy(ahora);
	const deHoy = (await listar('reservas')).filter((r) => r.estado === 'confirmada' && r.comision?.monto > 0 && !r.comision.pagada && r.comision.vence === hoy && r.propietarioId);
	for (const id of new Set(deHoy.map((r) => r.propietarioId))) {
		const socio = await leerPrivado(`propietarios/${id}`).catch(() => null);
		if (!socio?.email) continue;
		const suyas = deHoy.filter((r) => r.propietarioId === id).map((r) => `${r.codigo || r.propertyTitulo} · ${r.propertyTitulo} · ${prefijoMoneda(r.moneda)} ${miles(r.comision.monto)}`);
		const html = await plantilla({
			titulo: 'Comisiones que se pagan hoy',
			intro: 'Hoy llegan estos huéspedes. Paga la comisión y sube tu comprobante en Solicitudes.',
			bloques: (c) => `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:${c.dark}">${suyas.map(esc).join('<br>')}</p>
${boton(c, 'Abrir Solicitudes', `${SITE_URL}/admin/#/solicitudes`, c.primary, { ancho: true })}`
		});
		// Si falla el de un socio, los demás igual reciben el suyo.
		await enviarCorreo({ responder: true, para: [socio.email], asunto: `Comisiones de hoy: ${suyas.length}`, html, texto: `Comisiones que se pagan hoy:\n${suyas.join('\n')}\n\n${SITE_URL}/admin/#/solicitudes` })
			.catch((err) => console.error('Comisiones de un socio:', err.message));
	}
}

export const config = { schedule: '0 0-3,13-23 * * *' };
