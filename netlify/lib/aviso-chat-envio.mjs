// Manda los correos que tocan por el chat de una reserva (los decide avisos-chat.mjs con lo guardado, no con lo que
// mande quien llama). Lo usan netlify/functions/aviso-chat.mjs (el sitio y el panel, después de guardar) y
// netlify/functions/reservas.mjs (después de confirmar, cancelar o cobrar por el socio).
// El correo del cliente sale de su solicitud y el del socio de su ficha, ambos leídos con la cuenta de servicio, y el
// título de la casa, de la casa guardada. Devuelve cuántos salieron (0 sin correo o base configurados), o null si el chat no existe.
import { leerPublico, leerPrivado, listar, datosConfigurados } from './firestore.mjs';
import { enviarCorreo, correoConfigurado, destinatariosEquipo, plantilla, boton, esc, SITE_URL } from './correo.mjs';
import { avisosChat } from './avisos-chat.mjs';

export async function enviarAvisosChat(token) {
	if (!correoConfigurado() || !datosConfigurados()) return 0;
	const chat = await leerPublico(`chats/${token}`);
	if (!chat) return null;
	const [mensajes, lead, socio, casa] = await Promise.all([
		listar(`chats/${token}/mensajes`),
		chat.leadId ? leerPrivado(`leads/${chat.leadId}`) : null,
		chat.propietarioId ? leerPrivado(`propietarios/${chat.propietarioId}`) : null,
		/^[\w-]{1,60}$/.test(chat.propertyId || '') ? leerPrivado(`properties/${chat.propertyId}`) : null
	]);
	mensajes.sort((a, b) => a.createdAt - b.createdAt);
	const avisos = avisosChat({ chat, casa, mensajes, sitio: SITE_URL, correos: { cliente: lead?.email || '', socio: socio?.email || '', equipo: destinatariosEquipo() } });
	for (const a of avisos) {
		const html = await plantilla({ titulo: a.titulo, intro: esc(a.intro), preheader: a.intro, bloques: (c) => boton(c, a.boton, a.url, c.primary, { ancho: true }) });
		await enviarCorreo({ para: a.para, asunto: a.asunto, html, texto: `${a.titulo}\n${a.intro}\n\n${a.boton}: ${a.url}` });
	}
	return avisos.length;
}
