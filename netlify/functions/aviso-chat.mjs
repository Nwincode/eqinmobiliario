// Avisos por correo del chat de una reserva vacacional. POST /api/aviso-chat { chat: token }
// Lo llaman la página del cliente y el panel después de guardar (la solicitud o un mensaje).
// Quién recibe y qué dice lo decide netlify/lib/aviso-chat-envio.mjs con lo guardado, no con lo que mande quien llama.
// Límite por chat y por IP (quien abriera muchos chats con correos ajenos no manda una ráfaga de avisos).
import { json } from '../lib/auth.mjs';
import { correoConfigurado } from '../lib/correo.mjs';
import { datosConfigurados } from '../lib/firestore.mjs';
import { enviarAvisosChat } from '../lib/aviso-chat-envio.mjs';
import { limitador, ipDe } from '../lib/limite.mjs';

const porChat = limitador(20);
const porIp = limitador(60);

export default async (req, context) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!correoConfigurado() || !datosConfigurados()) return json(200, { enviado: false, motivo: 'Correo no configurado' });
	let token = '';
	try {
		token = String((await req.json()).chat || '');
	} catch {
		return json(400, { error: 'Solicitud inválida' });
	}
	if (!/^[A-Za-z0-9]{20,40}$/.test(token)) return json(400, { error: 'Chat inválido' });
	if (porIp(ipDe(req, context)) || porChat(token)) return json(429, { error: 'Demasiados avisos seguidos' });
	try {
		const enviados = await enviarAvisosChat(token);
		return enviados === null ? json(404, { error: 'No existe' }) : json(200, { enviados });
	} catch (err) {
		console.error('Aviso de chat:', err.message);
		return json(502, { error: 'No se pudo enviar el aviso' });
	}
};

export const config = { path: '/api/aviso-chat' };
