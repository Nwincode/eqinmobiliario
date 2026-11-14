// Envío de correos con Zoho ZeptoMail (https://www.zoho.com/zeptomail/) o con Resend (https://resend.com).
// Si están las dos claves, se usa ZeptoMail.
// Variables de entorno en Netlify (las pone el dueño de la cuenta; nunca se pegan en el chat):
//   ZEPTOMAIL_TOKEN  token de envío de ZeptoMail (Mail Agent → SMTP/API → "Send Mail Token")
//   ZEPTOMAIL_HOST   opcional, solo si la cuenta de Zoho no es la de EE. UU. (p. ej. api.zeptomail.eu)
//   RESEND_API_KEY   clave de Resend (alternativa a ZeptoMail)
//   AVISO_CORREO     a quién llegan los avisos y el resumen del día (varios, separados por coma)
//   CORREO_REMITENTE quién envía, p. ej. "Equipo Inmobiliario <avisos@eqinmobiliario.gt>"
//                    (el dominio debe estar verificado en el servicio; con ZeptoMail es obligatorio)
import siteConfig from '../../site.config.json' with { type: 'json' };
import { colorTema, contraste } from '../../admin/js/tema-def.js';
import { leerPublico } from './firestore.mjs';
import { correoValido } from '../../admin/js/formato.js';

export const SITE_URL = siteConfig.siteUrl.replace(/\/$/, '');
const NOMBRE = 'Equipo Inmobiliario';

// 'zeptomail', 'resend' o '' (sin configurar).
export function servicioCorreo() {
	if (process.env.ZEPTOMAIL_TOKEN) return 'zeptomail';
	if (process.env.RESEND_API_KEY) return 'resend';
	return '';
}

export const correoConfigurado = () => Boolean(servicioCorreo() && destinatariosEquipo().length);

export function destinatariosEquipo() {
	return String(process.env.AVISO_CORREO || '').split(',').map((s) => s.trim()).filter(correoValido);
}

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Colores de Contenido → Colores (o los originales de css/tema.css).
let temaCache = null;
async function colores() {
	if (!temaCache) temaCache = (await leerPublico('settings/site'))?.tema || {};
	const c = (k) => colorTema(temaCache, k);
	return { dark: c('dark'), primary: c('primary'), white: c('white'), ink: c('ink'), whatsapp: c('whatsapp') };
}

// Diseño común de los correos: encabezado, contenido y pie.
// bloques(c) recibe los colores (los del tema, más c.linea y c.suave, que salen de mezclarlos) y devuelve el HTML.
// preheader: la línea que el programa de correo muestra junto al asunto (si falta, se usa la intro sin etiquetas).
// Todo va en tablas con estilos en línea para que Gmail y Outlook lo muestren igual.
export async function plantilla({ titulo, intro = '', bloques, preheader = '' }) {
	const base = await colores();
	// Tonos suaves del gris del tema sobre el fondo (Outlook no entiende colores con transparencia).
	const mezcla = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, '0')).join('');
	const c = { ...base, linea: mezcla(base.ink, base.white, 0.22), suave: mezcla(base.ink, base.white, 0.06) };
	const fuente = 'font-family:Arial,Helvetica,sans-serif';
	const previa = esc(preheader || String(intro).replace(/<[^>]+>/g, '')).slice(0, 180);
	return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:${c.suave};${fuente};color:${c.dark}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${c.suave}">${previa}${'&#8199;&#847;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.suave}" style="background:${c.suave}"><tr><td align="center" style="padding:24px 12px;${fuente}">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td bgcolor="${c.dark}" style="background:${c.dark};color:${c.white};padding:16px 24px;border-radius:12px 12px 0 0;${fuente};font-size:15px;line-height:20px;font-weight:bold;letter-spacing:.2px">${NOMBRE}</td></tr>
<tr><td bgcolor="${c.white}" style="background:${c.white};border:1px solid ${c.linea};border-top:0;border-radius:0 0 12px 12px;padding:28px 24px;${fuente};color:${c.dark}">
<h1 style="margin:0 0 8px;${fuente};font-size:22px;line-height:28px;font-weight:bold;color:${c.dark}">${esc(titulo)}</h1>
${intro ? `<p style="margin:0 0 20px;${fuente};font-size:15px;line-height:22px;color:${c.ink}">${intro}</p>` : ''}
${bloques(c)}
</td></tr>
<tr><td style="padding:16px 12px 4px;${fuente};color:${c.ink};font-size:12px;line-height:18px;text-align:center">Aviso automático del panel de ${NOMBRE}.<br><a href="${SITE_URL}/admin/" target="_blank" style="display:inline-block;padding:12px 8px;color:${c.primary};text-decoration:underline">Abrir el panel</a></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

// Botón que funciona en Gmail y Outlook (tabla con fondo + enlace con relleno).
// El texto se pone claro u oscuro según lo que mejor se lea sobre el color del botón.
// opciones.borde: botón secundario (fondo blanco, borde y texto del color). opciones.ancho: ocupa todo el ancho.
export function boton(c, texto, url, color = c.primary, { borde = false, ancho = false } = {}) {
	const fondo = borde ? c.white : color;
	const letra = borde
		? (contraste(color, c.white) >= 4.5 ? color : c.dark)
		: (contraste(c.white, color) >= contraste(c.dark, color) ? c.white : c.dark);
	const linea = borde ? color : fondo;
	const tabla = ancho ? 'width:100%;margin:0 0 10px' : 'display:inline-block;margin:0 8px 10px 0;vertical-align:top';
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${ancho ? ' width="100%"' : ''} style="${tabla};border-collapse:separate"><tr><td align="center" bgcolor="${fondo}" style="background:${fondo};border:2px solid ${linea};border-radius:8px;mso-padding-alt:12px 20px">`
		+ `<a href="${esc(url)}" target="_blank" style="display:block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:${letra};text-decoration:none;border-radius:8px">${esc(texto)}</a></td></tr></table>`;
}

// "Nombre <correo@dominio>" → { name, address }
function remitente() {
	const v = String(process.env.CORREO_REMITENTE || '').trim();
	const m = v.match(/^(.*?)\s*<([^>]+)>$/);
	return m ? { name: m[1].replace(/^"|"$/g, '').trim() || NOMBRE, address: m[2].trim() } : { name: NOMBRE, address: v };
}

async function enviarZepto({ lista, asunto, html, texto }) {
	const de = remitente();
	if (!de.address) throw new Error('Con ZeptoMail falta CORREO_REMITENTE en Netlify (una dirección del dominio verificado).');
	const token = String(process.env.ZEPTOMAIL_TOKEN).trim();
	const host = String(process.env.ZEPTOMAIL_HOST || 'api.zeptomail.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
	const res = await fetch(`https://${host}/v1.1/email`, {
		method: 'POST',
		headers: {
			Authorization: /^Zoho-enczapikey /i.test(token) ? token : `Zoho-enczapikey ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify({
			from: de,
			to: lista.map((address) => ({ email_address: { address } })),
			subject: asunto,
			htmlbody: html,
			textbody: texto
		})
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) {
		const det = body.error?.details?.[0]?.message || body.error?.message || res.status;
		throw new Error(`ZeptoMail rechazó el correo: ${det}`);
	}
	return body.request_id;
}

async function enviarResend({ lista, asunto, html, texto }) {
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			from: process.env.CORREO_REMITENTE || `${NOMBRE} <onboarding@resend.dev>`,
			to: lista,
			subject: asunto,
			html,
			text: texto
		})
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(`Resend rechazó el correo: ${body.message || res.status}`);
	return body.id;
}

export async function enviarCorreo({ para, asunto, html, texto }) {
	const lista = [...new Set((Array.isArray(para) ? para : [para]).filter(Boolean))];
	const servicio = servicioCorreo();
	if (!servicio) throw new Error('Falta la clave del servicio de correo en Netlify (ZEPTOMAIL_TOKEN o RESEND_API_KEY).');
	if (!lista.length) throw new Error('Falta AVISO_CORREO en Netlify.');
	const datos = { lista, asunto, html, texto };
	return servicio === 'zeptomail' ? enviarZepto(datos) : enviarResend(datos);
}
