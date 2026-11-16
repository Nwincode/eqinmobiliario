// Manda los correos que tocan por el chat de una reserva (los decide avisos-chat.mjs con lo guardado, no con lo que
// mande quien llama). Lo usan netlify/functions/aviso-chat.mjs (el sitio y el panel, después de guardar) y
// netlify/functions/reservas.mjs (después de confirmar, cancelar o cobrar por el socio).
// El correo del cliente sale de su solicitud y el del socio de su ficha, ambos leídos con la cuenta de servicio, y el
// título de la casa, de la casa guardada. Devuelve cuántos salieron (0 sin correo o base configurados), o null si el chat no existe.
import { leerPublico, leerPrivado, listar, datosConfigurados } from './firestore.mjs';
import { enviarCorreo, servicioCorreo, destinatariosEquipo, plantilla, boton, datos, pasos, esc, SITE_URL } from './correo.mjs';
import { avisosChat } from './avisos-chat.mjs';
import { fotoCdn, pasaPorCdn } from '../../scripts/lib/foto-cdn.mjs';

export async function enviarAvisosChat(token) {
	// Basta el servicio de correo: el cliente y el socio reciben lo suyo aunque falten los correos del equipo (AVISO_CORREO).
	if (!servicioCorreo() || !datosConfigurados()) return 0;
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
	// Cada correo por su lado: si falla el del socio, el del cliente igual sale (y al revés).
	let fallas = 0;
	for (const a of avisos) {
		try {
			const en = a.lang === 'en';
			const filas = (a.datos || []).filter((f) => f[1]);
			const html = await plantilla({
				titulo: a.titulo, intro: esc(a.intro), preheader: a.intro, lang: a.lang, ayuda: a.rol === 'cliente',
				// La foto de la casa guardada (su primera foto, por el CDN a 1200×630), nunca la del chat (la escribe el navegador).
				foto: pasaPorCdn(casa?.fotos?.[0]?.url) ? new URL(fotoCdn(casa.fotos[0].url, 1200, '&h=630&fit=cover&fm=jpg'), SITE_URL).href : '', etiqueta: `${en ? 'Booking' : 'Solicitud'} ${chat.codigo}`,
				pie: a.rol === 'cliente' ? (en ? 'You get this because you requested a booking on eqinmobiliario.gt.' : 'Lo recibes porque pediste una reserva en eqinmobiliario.gt.')
					: a.rol === 'casa' ? 'Lo recibes porque tu casa está publicada en eqinmobiliario.gt.' : '',
				bloques: (c) => datos(c, filas) + boton(c, a.boton, a.url, c.primary, { ancho: true })
					+ (a.nota ? `<p style="margin:4px 0 0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:${c.ink}">${esc(a.nota)}</p>` : '')
					+ (a.pasos?.length ? pasos(c, en ? 'What\'s next' : 'Qué sigue', a.pasos) : '')
			});
			const texto = [a.titulo, a.intro, '', ...filas.map(([k, v]) => `${k}: ${v}`), '', `${a.boton}: ${a.url}`, a.nota || '', ...(a.pasos || []).map((t, i) => `${i + 1}. ${t}`)].join('\n');
			await enviarCorreo({ responder: true, para: a.para, asunto: a.asunto, html, texto });
		} catch (err) { fallas++; console.error('Aviso de chat a', a.para.length, 'correo(s):', err.message); }
	}
	if (fallas && fallas === avisos.length) throw new Error('No salió ningún aviso');
	return avisos.length - fallas;
}
