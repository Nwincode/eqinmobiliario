// Avisos por correo del chat de una reserva vacacional. POST /api/aviso-chat { chat: token }
// Lo llaman la página del cliente y el panel después de guardar (la solicitud o un mensaje).
// Quién recibe y qué dice lo decide netlify/lib/aviso-chat-envio.mjs con lo guardado, no con lo que mande quien llama.
// Límite por chat y por IP, guardado en la base (quien abriera muchos chats con correos ajenos no manda una ráfaga de avisos).
// Es también la primera vez que el servidor ve una solicitud: congela sus montos (montosSolicitud, con la cuenta de
// escritura) con los precios de la casa de ese momento; si no llega, lo hace el cron de plazos. Y revisa que no llegue
// encima de otra que aparta esas fechas (las reglas no ven las demás solicitudes).
import { json } from '../lib/auth.mjs';
import { servicioCorreo } from '../lib/correo.mjs';
import { datosConfigurados, leerPublico, leerPrivado } from '../lib/firestore.mjs';
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { congelarMontos, cerrarSiSeCruza, cerrarLasQueSeCruzan } from '../lib/reservas-servidor.mjs';
import { purgarCasa } from '../lib/ocupacion.mjs';
import { enviarAvisosChat, avisarQueTocaConfirmar } from '../lib/aviso-chat-envio.mjs';
import { limitadorDurable, ipDe } from '../lib/limite.mjs';
import { revisarComprobante } from '../lib/comprobantes.mjs';

// Guardado en la base (lo comparten todas las instancias): quien abriera muchos chats no manda una ráfaga de correos
// aunque Netlify reparta sus pedidos. Si la base falla, cuenta el de memoria (un aviso de verdad no se pierde por eso).
const porChat = limitadorDurable('aviso-chat', 20, 10 * 60_000, { siFalla: 'memoria' });
const porIp = limitadorDurable('aviso-chat-ip', 60, 10 * 60_000, { siFalla: 'memoria' });

export default async (req, context) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!datosConfigurados()) return json(200, { enviado: false, motivo: 'Correo no configurado' });
	let token = '';
	try {
		token = String((await req.json()).chat || '');
	} catch {
		return json(400, { error: 'Solicitud inválida' });
	}
	if (!/^[A-Za-z0-9]{20,40}$/.test(token)) return json(400, { error: 'Chat inválido' });
	if (await porIp(ipDe(req, context)) || await porChat(token)) return json(429, { error: 'Demasiados avisos seguidos' });
	// Solo una solicitud sin responder (lo de después ya tiene sus montos en la reserva). Si falla, sigue el correo.
	// Si llegó encima de otra que aparta esas fechas, se cierra sola (cerrarSiSeCruza). Las fechas de la casa cambiaron
	// (aparta las suyas, o no): su copia del CDN se borra.
	const chat = await leerPublico(`chats/${token}`).catch(() => null);
	if (escrituraConfigurada() && chat?.leadId && !chat.estado) {
		// Abierta: si sus fechas ya tienen una reserva confirmada, se cierra (también con un aviso que llega tarde); si
		// sigue abierta y todavía no tiene montos, se congelan (la primera vez: aparta sus fechas) y, si le toca al
		// equipo, se le avisa.
		const cerrada = await transaccion((tx) => cerrarSiSeCruza(tx, chat.leadId)).catch((err) => { console.error('Solicitud cruzada:', err.message); return null; });
		// (Las de /api/solicitud ya nacen con sus montos y la casa purgada: aquí solo sale su «Te toca confirmar».)
		if (!cerrada && !(await leerPrivado(`montosSolicitud/${chat.leadId}`).catch(() => null))) {
			await transaccion((tx) => congelarMontos(tx, chat.leadId)).catch((err) => console.error('Montos de la solicitud:', err.message));
			await avisarQueTocaConfirmar(token).catch((err) => console.error('Te toca confirmar:', err.message));
			await purgarCasa(chat.propertyId);
		} else if (cerrada) await purgarCasa(chat.propertyId);
		else if (chat.teTocaPendiente) await avisarQueTocaConfirmar(token).catch((err) => console.error('Te toca confirmar:', err.message));
	} else if (escrituraConfigurada() && chat?.estado === 'confirmada' && chat.avisoPendiente && chat.propertyId) {
		// Recién confirmada en el panel (su aviso todavía pendiente): las otras abiertas que se cruzan se cierran.
		for (const t of await cerrarLasQueSeCruzan(chat.propertyId, chat.llegada, chat.salida).catch(() => [])) await enviarAvisosChat(t).catch(() => {});
	}
	// El cliente subió su comprobante: la IA lo lee y se compara con la reserva (netlify/lib/comprobantes.mjs), después de
	// responder. Si no hay IA o falla, no queda nada que mostrar.
	if (chat?.comprobanteMensaje && chat.estado === 'confirmada') {
		const revision = revisarComprobante(token).catch((err) => console.error('Revisión del comprobante:', err.message));
		if (context?.waitUntil) context.waitUntil(revision); else await revision;
	}
	if (!servicioCorreo()) return json(200, { enviado: false, motivo: 'Correo no configurado' });
	try {
		const enviados = await enviarAvisosChat(token);
		return enviados === null ? json(404, { error: 'No existe' }) : json(200, { enviados });
	} catch (err) {
		console.error('Aviso de chat:', err.message);
		return json(502, { error: 'No se pudo enviar el aviso' });
	}
};

export const config = { path: '/api/aviso-chat' };
