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
import { colorTema } from '../../admin/js/tema-def.js';
import { leerPublico } from './firestore.mjs';

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
	return String(process.env.AVISO_CORREO || '').split(',').map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
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
// bloques(c) recibe los colores y devuelve el HTML del contenido.
export async function plantilla({ titulo, intro = '', bloques }) {
	const c = await colores();
	return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${c.white};font-family:Arial,Helvetica,sans-serif;color:${c.dark}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.white}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="background:${c.dark};color:${c.white};padding:16px 24px;border-radius:12px 12px 0 0;font-size:15px;font-weight:bold">${NOMBRE}</td></tr>
<tr><td style="border:1px solid ${c.ink}33;border-top:0;border-radius:0 0 12px 12px;padding:24px">
<h1 style="font-size:20px;line-height:1.3;margin:0 0 8px">${esc(titulo)}</h1>
${intro ? `<p style="margin:0 0 16px;color:${c.ink};font-size:14px;line-height:1.5">${intro}</p>` : ''}
${bloques(c)}
</td></tr>
<tr><td style="padding:16px 8px;color:${c.ink};font-size:12px;text-align:center">Aviso automático del panel de ${NOMBRE} · <a href="${SITE_URL}/admin/" style="color:${c.primary}">Abrir el panel</a></td></tr>
</table></td></tr></table></body></html>`;
}

export function boton(c, texto, url, color = c.primary) {
	return `<a href="${esc(url)}" style="display:inline-block;background:${color};color:${c.white};text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:8px;margin:4px 8px 4px 0">${esc(texto)}</a>`;
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
