// Control de las solicitudes de reserva vacacional: cada hora, de 7 a 21 h de Guatemala, avisa por correo al equipo de
// - las que el socio lleva más de 2 horas sin responder (las de la noche vencen a las 7 a. m.),
// - los mensajes del cliente en el chat de su reserva que llevan más de 2 horas sin respuesta, y
// - las reservas confirmadas que el socio canceló.
// Cada una se avisa una sola vez: entra en el correo de la hora en que venció o se canceló.
// Es lo único de una reserva que llega al equipo: lo demás lo resuelven el cliente y el socio en la plataforma.
// Además, a las 7 a. m. le recuerda a cada socio las comisiones que se pagan ese día.
import { correoConfigurado, destinatariosEquipo, enviarCorreo, plantilla, boton, esc, SITE_URL } from '../lib/correo.mjs';
import { datosConfigurados, desde, leerPrivado, listar } from '../lib/firestore.mjs';
import { sinResponder } from '../lib/avisos-chat.mjs';
import { prefijoMoneda, miles } from '../../admin/js/formato.js';

const HORA = 3600_000;
const PLAZO = 2 * HORA;

export default async () => {
	if (!correoConfigurado() || !datosConfigurados()) return;
	try {
		const ahora = Date.now();
		// Guatemala va 6 horas detrás de UTC, sin horario de verano. A las 7 se recogen también las de la noche.
		const sonLas7 = (new Date(ahora).getUTCHours() + 18) % 24 === 7;
		const ventana = sonLas7 ? 10 * HORA : HORA;
		if (sonLas7) await recordarComisiones(ahora);
		const enVentana = (t) => t > ahora - ventana && t <= ahora;
		const [nuevas, cambiadas] = await Promise.all([
			desde('leads', 'createdAt', new Date(ahora - ventana - PLAZO)),
			desde('leads', 'updatedAt', new Date(ahora - ventana))
		]);
		const sinRespuesta = nuevas.filter((l) => l.reserva?.codigo && !l.solicitud?.estado && enVentana(l.createdAt.getTime() + PLAZO));
		const canceladas = cambiadas.filter((l) => l.solicitud?.estado === 'cancelada');
		// Chats de reservas vigentes donde lo último lo escribió el cliente y nadie le ha contestado.
		const hoy = new Date(ahora - 6 * HORA).toISOString().slice(0, 10);
		const vigentes = (await listar('chats')).filter((c) => !['no', 'cancelada'].includes(c.estado) && c.salida >= hoy);
		const mensajes = (await Promise.all(vigentes.map(async (c) => {
			const lista = (await listar(`chats/${c.id}/mensajes`)).sort((a, b) => a.createdAt - b.createdAt);
			return sinResponder(lista, { ahora, plazo: PLAZO, ventana }) ? { nombre: c.nombre, propertyTitulo: c.propertyTitulo, propietarioId: c.propietarioId,
				reserva: { codigo: c.codigo, llegada: c.llegada, salida: c.salida, huespedes: c.huespedes, moneda: c.moneda, total: c.total } } : null;
		}))).filter(Boolean);
		if (!sinRespuesta.length && !canceladas.length && !mensajes.length) return;

		const socios = {};
		for (const id of new Set([...sinRespuesta, ...canceladas, ...mensajes].map((l) => l.propietarioId).filter(Boolean))) {
			socios[id] = (await leerPrivado(`propietarios/${id}`).catch(() => null))?.nombre || '';
		}
		const linea = (l) => {
			const r = l.reserva;
			return [`${r.codigo} · ${l.nombre}`, l.propertyTitulo, `${r.llegada} → ${r.salida} · ${r.huespedes} personas · ${prefijoMoneda(r.moneda)} ${miles(r.total)}`,
				socios[l.propietarioId] && `Socio: ${socios[l.propietarioId]}`, l.solicitud?.motivo && `Motivo: ${l.solicitud.motivo}`].filter(Boolean);
		};
		const enPanel = (l) => `${SITE_URL}/admin/#/solicitudes/${l.reserva.codigo}`;
		const grupos = [['Solicitudes sin responder hace más de 2 horas', sinRespuesta], ['Mensajes del cliente sin responder hace más de 2 horas', mensajes], ['Canceladas por el socio', canceladas]].filter(([, lista]) => lista.length);
		const asunto = [sinRespuesta.length && `${sinRespuesta.length} sin responder`, mensajes.length && `${mensajes.length} mensaje(s) sin respuesta`, canceladas.length && `${canceladas.length} cancelada(s)`].filter(Boolean).join(' · ');

		const html = await plantilla({
			titulo: 'Reservas que necesitan tu atención',
			intro: 'El socio no respondió a tiempo. Abrí la solicitud y respondele al cliente desde el chat para no perder la reserva.',
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

// Comisiones que se pagan hoy: un correo a cada socio con las suyas, para que pague y suba su comprobante sin que el equipo lo persiga.
async function recordarComisiones(ahora) {
	const hoy = new Date(ahora - 6 * HORA).toISOString().slice(0, 10);
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
		await enviarCorreo({ para: [socio.email], asunto: `Comisiones de hoy: ${suyas.length}`, html, texto: `Comisiones que se pagan hoy:\n${suyas.join('\n')}\n\n${SITE_URL}/admin/#/solicitudes` });
	}
}

export const config = { schedule: '0 0-3,13-23 * * *' };
