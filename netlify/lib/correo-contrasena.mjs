// Correo «Crea o cambia tu contraseña»: el mismo para dar acceso (dueños, colaboradores, equipo) y para «¿Olvidaste tu
// contraseña?». Lo manda netlify/functions/contrasena.mjs. Es el diseño que aprobó el dueño, tal cual (cuadro beige
// «Cuida tu cuenta», redes en el pie, ícono en el botón de WhatsApp, sin relleno invisible en la vista previa: docs/revision-antes-de-unir.md). No va en la plantilla
// común porque ella cambiaría el aspecto de los demás correos; pero sus colores salen del mismo tema (`coloresCorreo`:
// Contenido → Colores; los tonos claros, de `TONOS_CORREO`) y el WhatsApp y las redes, de Contenido (`whatsappEmpresa`, `redesEmpresa`), nunca escritos a mano.
// Imágenes en images/correo/. Tablas y estilos en línea para Gmail, Outlook y Apple Mail.
import { esc, coloresCorreo, whatsappEmpresa, redesEmpresa, SITE_URL } from './correo.mjs';

export const ASUNTO_CONTRASENA = 'Crea o cambia tu contraseña';
export const ASUNTO_VERIFICAR = 'Confirma tu correo';

// Los textos que cambian según para qué es el enlace; el resto del correo es el mismo (una sola pieza).
const TEXTOS = {
	contrasena: { asunto: ASUNTO_CONTRASENA, preheader: 'Elige tu contraseña para entrar al panel. El enlace vence en 1 hora.', titulo: 'Crea o cambia tu contraseña',
		intro: 'Toca el botón y elige la contraseña con la que entrarás al panel.', boton: 'Crear mi contraseña',
		nota: 'Sirve una sola vez y vence en <strong style="color:{dark}">1 hora</strong>.', notaTexto: 'sirve una sola vez y vence en 1 hora' },
	verificar: { asunto: ASUNTO_VERIFICAR, preheader: 'Un toque para confirmar tu correo y activar la verificación en dos pasos.', titulo: 'Confirma tu correo',
		intro: 'Toca el botón para confirmar que este correo es tuyo. Después activas la verificación en dos pasos al entrar al panel.', boton: 'Confirmar mi correo',
		nota: 'Sirve una sola vez.', notaTexto: 'sirve una sola vez' }
};

// link: el enlace de Google (un solo uso); email: el usuario; tipo: 'contrasena' (vence en 1 hora) o 'verificar'.
export async function correoContrasena({ link, email, tipo = 'contrasena' }) {
	const x = TEXTOS[tipo] || TEXTOS.contrasena;
	const base = await coloresCorreo();
	// Los tonos claros, con su nombre y su valor exacto del diseño aprobado (correo.mjs `TONOS_CORREO`).
	const t = base.tonos;
	const c = { ...base, suave: t.fondo, usuario: t.usuario, usuarioBorde: t.usuarioBorde, linea: t.divisor, beige: t.beige, beigeBorde: t.beigeBorde, punto: t.punto };
	const [ayuda, whatsapp, redes] = await Promise.all([
		whatsappEmpresa('Hola, necesito ayuda para entrar al panel de Equipo Inmobiliario.'), whatsappEmpresa(''), redesEmpresa()]);
	const enlace = esc(link);
	const correo = esc(email);
	const correoUrl = encodeURIComponent(String(email || ''));
	const html = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${c.suave}">${x.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.suave}" style="background:${c.suave}"><tr><td align="center" style="padding:28px 12px;font-family:Arial,Helvetica,sans-serif">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">

<tr><td align="center" bgcolor="${c.dark}" style="background:${c.dark};background-image:linear-gradient(${c.dark},${c.dark});border-radius:12px 12px 0 0;padding:24px 24px 22px">
  <img src="${SITE_URL}/Icono_Equipoinmobiliario@0.75x.png" width="180" height="43" alt="Equipo Inmobiliario" style="display:block;margin:0 auto;border:0;outline:none;width:180px;height:auto;color:${c.white};font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold">
</td></tr>
<tr><td bgcolor="${c.dark}" style="background:${c.dark};line-height:0;font-size:0">
  <img src="${SITE_URL}/images/correo/cabecera.jpg" width="600" height="220" alt="" style="display:block;border:0;width:100%;max-width:600px;height:auto">
</td></tr>
<tr><td bgcolor="${c.cyan}" style="background:${c.cyan};height:4px;line-height:4px;font-size:4px">&nbsp;</td></tr>

<tr><td bgcolor="${c.white}" style="background:${c.white};padding:36px 28px 30px;font-family:Arial,Helvetica,sans-serif">
  <h1 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:32px;font-weight:bold;color:${c.dark}">${x.titulo}</h1>
  <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:${c.ink}">${x.intro}</p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-collapse:separate"><tr>
    <td bgcolor="${c.usuario}" style="background:${c.usuario};border:1px solid ${c.usuarioBorde};border-radius:8px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif">
      <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;letter-spacing:1px;font-weight:bold;color:${c.ink}">TU USUARIO</p>
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:${c.dark};word-break:break-all;overflow-wrap:anywhere"><span style="color:${c.dark};text-decoration:none">${correo}</span></p>
    </td>
  </tr></table>

  <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 14px;border-collapse:separate"><tr>
    <td align="center" bgcolor="${c.primary}" style="background:${c.primary};border:2px solid ${c.primary};border-radius:8px;mso-padding-alt:16px 40px">
      <a href="${enlace}" target="_blank" style="display:block;padding:16px 40px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:22px;font-weight:bold;color:${c.white};text-decoration:none;border-radius:8px">${x.boton}</a>
    </td>
  </tr></table>
  <p style="margin:0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${c.ink}">${x.nota.replace('{dark}', c.dark)}<br>¿El botón no abre? <a href="${enlace}" target="_blank" style="color:${c.primary};text-decoration:underline">Usa este enlace</a>.</p>
${ayuda ? `  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;border-top:1px solid ${c.linea}"><tr>
    <td align="center" style="padding:22px 0 0;font-family:Arial,Helvetica,sans-serif">
      <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${c.ink}">¿Necesitas ayuda? Escríbenos y te atendemos.</p>
      <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-collapse:separate"><tr>
        <td align="center" bgcolor="${c.white}" style="background:${c.white};border:2px solid ${c.whatsapp};border-radius:8px;mso-padding-alt:10px 20px">
          <a href="${esc(ayuda)}" target="_blank" style="display:block;padding:10px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;font-weight:bold;color:${c.whatsapp};text-decoration:none;border-radius:8px"><img src="${SITE_URL}/images/correo/whatsapp.png" width="22" height="22" alt="" style="vertical-align:middle;border:0;margin:0 8px 2px 0">Escribir por WhatsApp</a>
        </td>
      </tr></table>
    </td>
  </tr></table>
` : ''}
</td></tr>

<tr><td bgcolor="${c.white}" style="background:${c.white};padding:0 28px 28px;border-radius:0 0 12px 12px;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>
    <td bgcolor="${c.beige}" style="background:${c.beige};border:1px solid ${c.beigeBorde};border-radius:8px;padding:16px 18px 6px;font-family:Arial,Helvetica,sans-serif">
      <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;letter-spacing:1.5px;font-weight:bold;color:${c.gold}">CUIDA TU CUENTA</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="22" valign="top" style="padding:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:bold;color:${c.gold}">&#10003;</td>
          <td valign="top" style="padding:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${c.ink}">Entra siempre en <a href="${SITE_URL}/admin/" target="_blank" style="color:${c.dark};font-weight:bold;text-decoration:none">eqinmobiliario.gt/admin</a>.</td>
        </tr>
        <tr>
          <td width="22" valign="top" style="padding:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:bold;color:${c.gold}">&#10003;</td>
          <td valign="top" style="padding:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${c.ink}">Nunca te pediremos tu contraseña por teléfono, WhatsApp ni correo.</td>
        </tr>
        <tr>
          <td width="22" valign="top" style="padding:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:bold;color:${c.gold}">&#10003;</td>
          <td valign="top" style="padding:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${c.ink}">¿No esperabas este correo? Ignóralo: nada cambia en tu cuenta.</td>
        </tr>
      </table>
    </td>
  </tr></table>
</td></tr>

<tr><td align="center" style="padding:24px 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${c.ink}">
  <strong style="color:${c.dark}">Equipo Inmobiliario S.A.</strong><br>
  <a href="${SITE_URL}" target="_blank" style="display:inline-block;padding:4px 6px 12px;color:${c.primary};text-decoration:none;font-weight:bold">eqinmobiliario.gt</a><br>
  ${redes.instagram ? `<a href="${esc(redes.instagram)}" target="_blank" style="display:inline-block;margin:0 5px;text-decoration:none"><img src="${SITE_URL}/images/correo/instagram.png" width="32" height="32" alt="Instagram" style="display:block;border:0"></a>` : ''}${redes.facebook ? `<a href="${esc(redes.facebook)}" target="_blank" style="display:inline-block;margin:0 5px;text-decoration:none"><img src="${SITE_URL}/images/correo/facebook.png" width="32" height="32" alt="Facebook" style="display:block;border:0"></a>` : ''}${whatsapp ? `<a href="${esc(whatsapp)}" target="_blank" style="display:inline-block;margin:0 5px;text-decoration:none"><img src="${SITE_URL}/images/correo/whatsapp.png" width="32" height="32" alt="WhatsApp" style="display:block;border:0"></a>` : ''}
</td></tr>
<tr><td align="center" style="padding:14px 16px 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:${c.ink}">
  Lo recibes porque tienes un usuario en el panel de Equipo&nbsp;Inmobiliario.<br>
  <a href="mailto:atencioncliente@eqinmobiliario.gt?subject=Eliminar%20mi%20cuenta%20del%20panel&amp;body=Hola%2C%20quiero%20que%20eliminen%20mi%20cuenta%20del%20panel.%20Mi%20usuario%20es%3A%20${correoUrl}" style="display:inline-block;padding:6px 6px;color:${c.primary};text-decoration:underline">Eliminar mi cuenta del panel</a><span style="color:${c.punto}">&middot;</span><a href="${SITE_URL}/privacidad/" target="_blank" style="display:inline-block;padding:6px 6px;color:${c.primary};text-decoration:underline">Política de privacidad</a>
</td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>`;
	const texto = `${x.titulo} (panel de Equipo Inmobiliario).\n\nTu usuario: ${email}\n\nAbre este enlace (${x.notaTexto}):\n${link}\n\nEntra siempre en eqinmobiliario.gt/admin. Nunca te pediremos tu contraseña por teléfono, WhatsApp ni correo. Si no esperabas este correo, ignóralo: nada cambia en tu cuenta.${ayuda ? `\n\n¿Necesitas ayuda? Escríbenos por WhatsApp: ${ayuda}` : ''}\nEquipo Inmobiliario S.A. · eqinmobiliario.gt`;
	return { asunto: x.asunto, html, texto };
}
