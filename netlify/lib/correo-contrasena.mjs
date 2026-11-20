// Correo «Crea o cambia tu contraseña»: el mismo para dar acceso (dueños, colaboradores, equipo) y para «¿Olvidaste tu
// contraseña?». Lo manda netlify/functions/contrasena.mjs. Usa el diseño común de todos los correos (`plantilla` de
// correo.mjs: logo, cabecera, colores de Contenido y el WhatsApp de Contacto), no uno propio.
import { plantilla, boton, esc, whatsappEmpresa, SITE_URL } from './correo.mjs';

export const ASUNTO_CONTRASENA = 'Crea o cambia tu contraseña';

// link: el enlace de Google (un solo uso, vence en 1 hora); email: el usuario.
export async function correoContrasena({ link, email }) {
	const fuente = 'font-family:Arial,Helvetica,sans-serif';
	const ayuda = await whatsappEmpresa('Hola, necesito ayuda para entrar al panel de Equipo Inmobiliario.');
	const cuidar = ['Entra siempre en eqinmobiliario.gt/admin.', 'Nunca te pediremos tu contraseña por teléfono, WhatsApp ni correo.', '¿No esperabas este correo? Ignóralo: nada cambia en tu cuenta.'];
	const html = await plantilla({
		titulo: ASUNTO_CONTRASENA,
		intro: 'Toca el botón y elige la contraseña con la que entrarás al panel.',
		preheader: 'Elige tu contraseña para entrar al panel. El enlace vence en 1 hora.',
		pie: 'Lo recibes porque tienes un usuario en el panel de Equipo Inmobiliario.',
		pieEnlaces: [
			['Eliminar mi cuenta del panel', `mailto:atencioncliente@eqinmobiliario.gt?subject=${encodeURIComponent('Eliminar mi cuenta del panel')}&body=${encodeURIComponent(`Hola, quiero que eliminen mi cuenta del panel. Mi usuario es: ${email}`)}`],
			['Política de privacidad', `${SITE_URL}/privacidad/`]
		],
		bloques: (c) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-collapse:separate"><tr>
<td bgcolor="${c.suave}" style="background:${c.suave};border:1px solid ${c.linea};border-radius:8px;padding:14px 16px;${fuente}">
<p style="margin:0 0 4px;${fuente};font-size:12px;line-height:16px;letter-spacing:1px;font-weight:bold;color:${c.ink}">TU USUARIO</p>
<p style="margin:0;${fuente};font-size:17px;line-height:24px;font-weight:bold;color:${c.dark};word-break:break-all;overflow-wrap:anywhere">${esc(email)}</p>
</td></tr></table>
${boton(c, 'Crear mi contraseña', link, c.primary, { ancho: true })}
<p style="margin:0 0 22px;text-align:center;${fuente};font-size:13px;line-height:20px;color:${c.ink}">Sirve una sola vez y vence en <strong style="color:${c.dark}">1 hora</strong>.<br>¿El botón no abre? <a href="${esc(link)}" target="_blank" style="color:${c.primary};text-decoration:underline">Usa este enlace</a>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:separate"><tr>
<td style="border:1px solid ${c.linea};border-radius:8px;padding:16px 18px 6px;${fuente}">
<p style="margin:0 0 10px;${fuente};font-size:12px;line-height:16px;letter-spacing:1.5px;font-weight:bold;color:${c.dark}">CUIDA TU CUENTA</p>
${cuidar.map((t) => `<p style="margin:0 0 10px;${fuente};font-size:14px;line-height:20px;color:${c.ink}">&#10003;&nbsp; ${esc(t)}</p>`).join('')}
</td></tr></table>
${ayuda ? `<p style="margin:0 0 10px;text-align:center;${fuente};font-size:14px;line-height:20px;color:${c.ink}">¿Necesitas ayuda? Escríbenos y te atendemos.</p>${boton(c, 'Escribir por WhatsApp', ayuda, c.whatsapp, { borde: true, ancho: true })}` : ''}`
	});
	const texto = `Crea o cambia tu contraseña del panel de Equipo Inmobiliario.\n\nTu usuario: ${email}\n\nAbre este enlace (sirve una sola vez y vence en 1 hora):\n${link}\n\n${cuidar.join(' ')}${ayuda ? `\n\n¿Necesitas ayuda? Escríbenos por WhatsApp: ${ayuda}` : ''}\nEquipo Inmobiliario S.A. · eqinmobiliario.gt`;
	return { asunto: ASUNTO_CONTRASENA, html, texto };
}
