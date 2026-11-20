// Avisos por correo del chat de una reserva vacacional. POST /api/aviso-chat { chat: token }
// Lo llaman la página del cliente y el panel después de guardar (la solicitud o un mensaje).
// Quién recibe y qué dice lo decide netlify/lib/aviso-chat-envio.mjs con lo guardado, no con lo que mande quien llama.
// Límite por chat y por IP (quien abriera muchos chats con correos ajenos no manda una ráfaga de avisos).
// Es también la primera vez que el servidor ve una solicitud: congela sus montos (montosSolicitud, con la cuenta de
// escritura) con los precios de la casa de ese momento; si no llega, lo hace el cron de plazos.
import { json } from '../lib/auth.mjs';
import { servicioCorreo } from '../lib/correo.mjs';
import { datosConfigurados, leerPublico } from '../lib/firestore.mjs';
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { congelarMontos } from '../lib/reservas-servidor.mjs';
import { enviarAvisosChat } from '../lib/aviso-chat-envio.mjs';
import { limitador, ipDe } from '../lib/limite.mjs';

const porChat = limitador(20);
const porIp = limitador(60);

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
	if (porIp(ipDe(req, context)) || porChat(token)) return json(429, { error: 'Demasiados avisos seguidos' });
	// Solo una solicitud sin responder (lo de después ya tiene sus montos en la reserva). Si falla, sigue el correo.
	if (escrituraConfigurada()) {
		const chat = await leerPublico(`chats/${token}`).catch(() => null);
		if (chat?.leadId && !chat.estado) await transaccion((tx) => congelarMontos(tx, chat.leadId)).catch((err) => console.error('Montos de la solicitud:', err.message));
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
