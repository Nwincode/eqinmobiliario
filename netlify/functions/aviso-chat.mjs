// Avisos por correo del chat de una reserva vacacional. POST /api/aviso-chat { chat: token }
// Lo llaman la página del cliente y el panel después de guardar (la solicitud o un mensaje).
// Quién recibe y qué dice lo decide netlify/lib/avisos-chat.mjs con lo guardado, no con lo que mande quien llama:
// el correo del cliente sale de su solicitud y el del socio de su ficha, ambos leídos con la cuenta de servicio.
import { json } from '../lib/auth.mjs';
import { leerPublico, leerPrivado, listar, datosConfigurados } from '../lib/firestore.mjs';
import { enviarCorreo, correoConfigurado, destinatariosEquipo, plantilla, boton, esc, SITE_URL } from '../lib/correo.mjs';
import { avisosChat } from '../lib/avisos-chat.mjs';

const hits = new Map();
function limitado(clave) {
	const now = Date.now();
	const lista = (hits.get(clave) || []).filter((t) => now - t < 10 * 60_000);
	lista.push(now);
	hits.set(clave, lista);
	return lista.length > 20;
}

export default async (req) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!correoConfigurado() || !datosConfigurados()) return json(200, { enviado: false, motivo: 'Correo no configurado' });
	let token = '';
	try {
		token = String((await req.json()).chat || '');
	} catch {
		return json(400, { error: 'Solicitud inválida' });
	}
	if (!/^[A-Za-z0-9]{20,40}$/.test(token)) return json(400, { error: 'Chat inválido' });
	if (limitado(token)) return json(429, { error: 'Demasiados avisos seguidos' });

	const chat = await leerPublico(`chats/${token}`);
	if (!chat) return json(404, { error: 'No existe' });
	try {
		const [mensajes, lead, socio] = await Promise.all([
			listar(`chats/${token}/mensajes`),
			chat.leadId ? leerPrivado(`leads/${chat.leadId}`) : null,
			chat.propietarioId ? leerPrivado(`propietarios/${chat.propietarioId}`) : null
		]);
		mensajes.sort((a, b) => a.createdAt - b.createdAt);
		const avisos = avisosChat({ chat, mensajes, sitio: SITE_URL, correos: { cliente: lead?.email || '', socio: socio?.email || '', equipo: destinatariosEquipo() } });
		for (const a of avisos) {
			const html = await plantilla({ titulo: a.titulo, intro: esc(a.intro), preheader: a.intro, bloques: (c) => boton(c, a.boton, a.url, c.primary, { ancho: true }) });
			await enviarCorreo({ para: a.para, asunto: a.asunto, html, texto: `${a.titulo}\n${a.intro}\n\n${a.boton}: ${a.url}` });
		}
		return json(200, { enviados: avisos.length });
	} catch (err) {
		console.error('Aviso de chat:', err.message);
		return json(502, { error: 'No se pudo enviar el aviso' });
	}
};

export const config = { path: '/api/aviso-chat' };
