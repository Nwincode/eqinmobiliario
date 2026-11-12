// Control de las solicitudes de reserva vacacional: cada hora, de 7 a 21 h de Guatemala, avisa por correo al equipo de
// - las que el socio lleva más de 2 horas sin responder (las de la noche vencen a las 7 a. m.), y
// - las reservas confirmadas que el socio canceló.
// Cada una se avisa una sola vez: entra en el correo de la hora en que venció o se canceló.
import { correoConfigurado, destinatariosEquipo, enviarCorreo, plantilla, boton, esc, SITE_URL } from '../lib/correo.mjs';
import { datosConfigurados, desde, leerPrivado } from '../lib/firestore.mjs';
import { whatsappUrl, prefijoMoneda, miles } from '../../admin/js/formato.js';

const HORA = 3600_000;
const PLAZO = 2 * HORA;

export default async () => {
	if (!correoConfigurado() || !datosConfigurados()) return;
	try {
		const ahora = Date.now();
		// Guatemala va 6 horas detrás de UTC, sin horario de verano. A las 7 se recogen también las de la noche.
		const ventana = (new Date(ahora).getUTCHours() + 18) % 24 === 7 ? 10 * HORA : HORA;
		const enVentana = (t) => t > ahora - ventana && t <= ahora;
		const [nuevas, cambiadas] = await Promise.all([
			desde('leads', 'createdAt', new Date(ahora - ventana - PLAZO)),
			desde('leads', 'updatedAt', new Date(ahora - ventana))
		]);
		const sinRespuesta = nuevas.filter((l) => l.reserva?.codigo && !l.solicitud?.estado && enVentana(l.createdAt.getTime() + PLAZO));
		const canceladas = cambiadas.filter((l) => l.solicitud?.estado === 'cancelada');
		if (!sinRespuesta.length && !canceladas.length) return;

		const socios = {};
		for (const id of new Set([...sinRespuesta, ...canceladas].map((l) => l.propietarioId).filter(Boolean))) {
			socios[id] = (await leerPrivado(`propietarios/${id}`).catch(() => null))?.nombre || '';
		}
		const linea = (l) => {
			const r = l.reserva;
			return [`${r.codigo} · ${l.nombre}`, l.propertyTitulo, `${r.llegada} → ${r.salida} · ${r.huespedes} personas · ${prefijoMoneda(r.moneda)} ${miles(r.total)}`,
				socios[l.propietarioId] && `Socio: ${socios[l.propietarioId]}`, l.solicitud?.motivo && `Motivo: ${l.solicitud.motivo}`].filter(Boolean);
		};
		const saludo = (l) => `Hola ${l.nombre}, te escribo de ${SITE_URL.replace(/^https?:\/\//, '')} por tu reserva ${l.reserva.codigo} de ${l.propertyTitulo}.`;
		const grupos = [['Sin responder hace más de 2 horas', sinRespuesta], ['Canceladas por el socio', canceladas]].filter(([, lista]) => lista.length);
		const asunto = [sinRespuesta.length && `${sinRespuesta.length} sin responder`, canceladas.length && `${canceladas.length} cancelada(s)`].filter(Boolean).join(' · ');

		const html = await plantilla({
			titulo: 'Reservas que necesitan tu atención',
			intro: 'Escribile al cliente para no perder la reserva.',
			bloques: (c) => grupos.map(([titulo, lista]) => `<h2 style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;color:${c.dark}">${titulo}</h2>
${lista.map((l) => `<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:${c.dark}">${linea(l).map(esc).join('<br>')}</p>
${boton(c, `WhatsApp a ${esc(l.nombre)}`, whatsappUrl(l.telefono, saludo(l)), c.whatsapp)}`).join('')}`).join('') + `
<p style="margin:0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px"><a href="${SITE_URL}/admin/#/solicitudes" target="_blank" style="display:inline-block;padding:12px 8px;color:${c.primary};font-weight:bold;text-decoration:underline">Ver en el panel</a></p>`
		});
		const texto = grupos.map(([titulo, lista]) => [titulo, ...lista.map((l) => [...linea(l), whatsappUrl(l.telefono, saludo(l))].join('\n'))].join('\n\n')).join('\n\n');
		await enviarCorreo({ para: destinatariosEquipo(), asunto: `Reservas: ${asunto}`, html, texto });
	} catch (err) {
		console.error('Solicitudes sin respuesta:', err.message);
	}
};

export const config = { schedule: '0 0-3,13-23 * * *' };
