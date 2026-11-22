// Envío de correos con Zoho CPaaS (antes ZeptoMail, https://www.zoho.com/zeptomail/) o con Resend (https://resend.com).
// Si están las dos claves, se usa ZeptoMail.
// Variables de entorno en Netlify (las pone el dueño de la cuenta; nunca se pegan en el chat):
//   ZEPTOMAIL_TOKEN  clave de API de Zoho CPaaS (Mail Agent → SMTP/API → «Clave de API»)
//   ZEPTOMAIL_HOST   opcional: el «Host» de esa pantalla si no es cpaas.zoho.com (p. ej. el de la cuenta en Europa)
//   RESEND_API_KEY   clave de Resend (alternativa a ZeptoMail)
//   AVISO_CORREO     a quién llegan los avisos y el resumen del día (varios, separados por coma)
//   CORREO_REMITENTE quién envía, p. ej. "Equipo Inmobiliario <avisos@eqinmobiliario.gt>"
//                    (el dominio debe estar verificado en el servicio; con ZeptoMail es obligatorio)
import { anotarOk, anotarFallo } from './estado.mjs';
import siteConfig from '../../site.config.json' with { type: 'json' };
// Los valores de Contenido que el dueño no ha cambiado: los mismos que usa el sitio (scripts/build.mjs `defaults`).
import seed from '../../data/seed.json' with { type: 'json' };
import { colorTema, contraste } from '../../admin/js/tema-def.js';
import { leerPublico } from './firestore.mjs';
import { correoValido, whatsappUrl, telefonoWa } from '../../admin/js/formato.js';

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

// Lo que los correos toman de Contenido (settings/site): los colores (o los originales de css/tema.css) y el WhatsApp
// de la empresa (Contenido → Contacto). Se lee una vez por copia de la función.
let sitioCache = null;
const sitio = async () => (sitioCache ||= (await leerPublico('settings/site')) || {});
async function colores() {
	const tema = (await sitio()).tema || {};
	const c = (k) => colorTema(tema, k);
	return { dark: c('dark'), primary: c('primary'), cyan: c('cyan'), white: c('white'), ink: c('ink'), gold: c('gold'), whatsapp: c('whatsapp') };
}

// Un tono entre dos colores del tema (t: cuánto del primero). Outlook no entiende colores con transparencia.
export const mezcla = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, '0')).join('');
// Tonos claros con nombre del diseño aprobado del correo de la contraseña (netlify/lib/correo-contrasena.mjs), tal como
// los aprobó el dueño (no se sacan mezclando: así quedan exactos).
export const TONOS_CORREO = { fondo: '#eef3f6', usuario: '#edf5fa', usuarioBorde: '#d3e4ee', divisor: '#e3e9ee', beige: '#f7f3eb', beigeBorde: '#e6dbc6', punto: '#b5bec5' };
// Los colores de un correo: los del tema, la línea (c.linea) y el fondo suave (c.suave) de la plantilla común, y los
// tonos con nombre del diseño aprobado (TONOS_CORREO).
export async function coloresCorreo() {
	const base = await colores();
	return { ...base, linea: mezcla(base.ink, base.white, 0.18), suave: mezcla(base.primary, base.white, 0.07), tonos: TONOS_CORREO };
}
// Redes de la empresa (Contenido → Redes; si no están, las del sitio por defecto).
export async function redesEmpresa() {
	const r = { ...(seed.settings?.redes || {}), ...Object.fromEntries(Object.entries((await sitio()).redes || {}).filter(([, v]) => v)) };
	return { instagram: /^https:\/\//.test(r.instagram || '') ? r.instagram : '', facebook: /^https:\/\//.test(r.facebook || '') ? r.facebook : '' };
}

// Enlace de WhatsApp a la empresa con un mensaje (el número de Contenido → Contacto, el mismo del sitio); '' si no hay.
export async function whatsappEmpresa(mensaje) {
	const tel = (await sitio()).contacto?.whatsapp || seed.settings?.contacto?.whatsapp || '';
	return telefonoWa(tel) ? whatsappUrl(tel, mensaje) : '';
}

// Diseño común de todos los correos (el mismo del correo de la contraseña, que aprobó el dueño): logo, foto (la de la
// casa en los de una reserva; si no, la de la cabecera), línea de acento, contenido y pie con la empresa.
// bloques(c) recibe los colores (los del tema, más c.linea y c.suave) y devuelve el HTML del contenido.
// etiqueta: línea corta sobre el título (p. ej. el código de la reserva). pie: por qué le llega (si falta, el aviso del panel).
// ayuda: el botón de WhatsApp para quien no es del panel (cliente). pieEnlaces: [[texto, url]] después del pie.
// Tablas y estilos en línea para Gmail, Outlook y Apple Mail.
export async function plantilla({ titulo, intro = '', bloques, preheader = '', foto = '', etiqueta = '', pie = '', pieEnlaces = [], ayuda = false, lang = 'es' }) {
	const c = await coloresCorreo();
	const fuente = 'font-family:Arial,Helvetica,sans-serif';
	const previa = esc(preheader || String(intro).replace(/<[^>]+>/g, '')).slice(0, 180);
	const imagen = /^https:\/\//.test(foto) ? foto : `${SITE_URL}/images/correo/cabecera.jpg`;
	const en = lang === 'en';
	const whatsapp = ayuda ? await whatsappEmpresa(en ? 'Hi, I need help with my booking.' : 'Hola, necesito ayuda.') : '';
	return `<!doctype html><html lang="${en ? 'en' : 'es'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:${c.suave};${fuente};color:${c.dark}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${c.suave}">${previa}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.suave}" style="background:${c.suave}"><tr><td align="center" style="padding:28px 12px;${fuente}">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td align="center" bgcolor="${c.dark}" style="background:${c.dark};border-radius:12px 12px 0 0;padding:22px 24px 20px">
  <img src="${SITE_URL}/Icono_Equipoinmobiliario@0.75x.png" width="180" height="43" alt="${NOMBRE}" style="display:block;margin:0 auto;border:0;outline:none;width:180px;height:auto;color:${c.white};${fuente};font-size:18px;font-weight:bold">
</td></tr>
<tr><td bgcolor="${c.dark}" style="background:${c.dark};line-height:0;font-size:0"><img src="${esc(imagen)}" width="600" alt="" style="display:block;border:0;width:100%;max-width:600px;height:auto"></td></tr>
<tr><td bgcolor="${c.cyan}" style="background:${c.cyan};height:4px;line-height:4px;font-size:4px">&nbsp;</td></tr>
<tr><td bgcolor="${c.white}" style="background:${c.white};padding:30px 28px 26px;border-radius:0 0 12px 12px;${fuente};color:${c.dark}">
${etiqueta ? `<p style="margin:0 0 6px;${fuente};font-size:13px;line-height:18px;font-weight:bold;color:${c.primary}">${esc(etiqueta)}</p>` : ''}
<h1 style="margin:0 0 10px;${fuente};font-size:24px;line-height:30px;font-weight:bold;color:${c.dark}">${esc(titulo)}</h1>
${intro ? `<p style="margin:0 0 20px;${fuente};font-size:16px;line-height:24px;color:${c.ink}">${intro}</p>` : ''}
${bloques(c)}
${whatsapp ? `<p style="margin:22px 0 0;padding:18px 0 0;border-top:1px solid ${c.linea};text-align:center;${fuente};font-size:14px;line-height:20px;color:${c.ink}">${en ? 'Something not working?' : '¿Algo no funciona?'} <a href="${esc(whatsapp)}" target="_blank" style="color:${c.whatsapp};font-weight:bold;text-decoration:underline">${en ? 'Message us on WhatsApp' : 'Escríbenos por WhatsApp'}</a>.</p>` : ''}
</td></tr>
<tr><td align="center" style="padding:20px 12px 4px;${fuente};font-size:13px;line-height:20px;color:${c.ink}">
  <strong style="color:${c.dark}">Equipo Inmobiliario S.A.</strong> · <a href="${SITE_URL}" target="_blank" style="color:${c.primary};text-decoration:none;font-weight:bold">eqinmobiliario.gt</a><br>
  ${pie ? esc(pie) : `Aviso automático del panel. <a href="${SITE_URL}/admin/" target="_blank" style="display:inline-block;padding:8px 4px;color:${c.primary};text-decoration:underline">Abrir el panel</a>`}
  ${pieEnlaces.length ? `<br>${pieEnlaces.map(([t, u]) => `<a href="${esc(u)}" target="_blank" style="display:inline-block;padding:8px 6px;color:${c.primary};text-decoration:underline">${esc(t)}</a>`).join(' · ')}` : ''}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

// Tabla corta de datos (etiqueta a la izquierda, valor en negrita a la derecha): fechas, personas, total.
export function datos(c, filas) {
	const celda = 'font-family:Arial,Helvetica,sans-serif;padding:8px 0;border-bottom:1px solid ' + c.linea;
	if (!filas.some((f) => f && f[1])) return '';
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px">${filas.filter((f) => f && f[1]).map(([k, v]) =>
		`<tr><td style="${celda};font-size:14px;line-height:20px;color:${c.ink}">${esc(k)}</td><td align="right" style="${celda};font-size:15px;line-height:20px;font-weight:bold;color:${c.dark}">${esc(v)}</td></tr>`).join('')}</table>`;
}

// Lista de dos líneas por fila (p. ej. las reservas de un estado de cuenta): a la izquierda el nombre (14 px) y debajo
// el detalle (13 px, gris); a la derecha el monto (14 px, negrita) y debajo su estado (13 px, gris). El monto nunca se
// parte; el nombre, si no cabe en una línea, termina en «…». Cada fila en su tabla: el ancho de un monto no le quita
// espacio al nombre de otra. filas: [{ nombre, detalle, monto, estado }].
export function lista(c, filas) {
	const fuente = 'font-family:Arial,Helvetica,sans-serif';
	const celda = `${fuente};padding:8px 0;border-bottom:1px solid ${c.linea};vertical-align:top`;
	const chica = `font-size:13px;line-height:18px;color:${c.ink}`;
	return filas.map((f, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${i === filas.length - 1 ? 22 : 0}px;table-layout:auto"><tr>`
		+ `<td width="100%" style="${celda};max-width:0"><div style="font-size:14px;line-height:20px;color:${c.dark};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.nombre)}</div><div style="${chica}">${esc(f.detalle)}</div></td>`
		+ `<td align="right" style="${celda};padding-left:12px;white-space:nowrap"><div style="font-size:14px;line-height:20px;font-weight:bold;color:${c.dark}">${esc(f.monto)}</div><div style="${chica}">${esc(f.estado)}</div></td>`
		+ '</tr></table>').join('');
}

// Un título chico dentro del correo (el de unos pasos, el mes de un estado de cuenta).
export const subtitulo = (c, texto, { arriba = 0, abajo = 8 } = {}) => `<p style="margin:${arriba}px 0 ${abajo}px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:${c.dark}">${esc(texto)}</p>`;

// Pasos numerados (lo que sigue, en orden).
export function pasos(c, titulo, lista) {
	const fuente = 'font-family:Arial,Helvetica,sans-serif';
	return `${subtitulo(c, titulo, { arriba: 22, abajo: 10 })}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${lista.map((t, i) => `<tr><td width="32" valign="top" style="padding:0 0 10px"><span style="display:inline-block;width:22px;height:22px;border-radius:11px;background:${c.primary};color:${c.white};${fuente};font-size:12px;line-height:22px;text-align:center;font-weight:bold">${i + 1}</span></td><td valign="top" style="padding:1px 0 10px;${fuente};font-size:14px;line-height:20px;color:${c.ink}">${esc(t)}</td></tr>`).join('')}</table>`;
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

// Dos remitentes: lo que no se responde (contraseñas, avisos internos) sale de CORREO_REMITENTE (noreply@); lo que
// sí puede responderse (reservas, al cliente y al socio) sale del primer correo del equipo (AVISO_CORREO, reservas@)
// si es del mismo dominio (el verificado en el servicio); si no, sale del noreply@ con «Responder a» ese correo.
function remitenteDe(responder) {
	const base = remitente();
	const equipo = responder ? destinatariosEquipo()[0] || '' : '';
	if (!equipo) return { de: base, resp: '' };
	const dominio = (c) => String(c).split('@')[1]?.toLowerCase() || '';
	return { de: dominio(equipo) && dominio(equipo) === dominio(base.address) ? { name: base.name, address: equipo } : base, resp: equipo };
}

async function enviarZepto({ lista, asunto, html, texto, responder }) {
	const { de, resp } = remitenteDe(responder);
	if (!de.address) throw new Error('Con ZeptoMail falta CORREO_REMITENTE en Netlify (una dirección del dominio verificado).');
	const token = String(process.env.ZEPTOMAIL_TOKEN).trim();
	const host = String(process.env.ZEPTOMAIL_HOST || 'cpaas.zoho.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
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
			...(resp ? { reply_to: [{ address: resp, name: NOMBRE }] } : {}),
			subject: asunto,
			htmlbody: html,
			textbody: texto,
			// Sin seguimiento: Zoho no reescribe ni registra los enlaces (el de la contraseña es de un solo uso).
			track_clicks: false,
			track_opens: false
		})
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) {
		const det = body.error?.details?.[0]?.message || body.error?.message || res.status;
		// Si Zoho no acepta ese remitente o el «Responder a», el correo sale igual del de siempre: nunca se pierde por eso.
		if (resp && res.status < 500) { console.error('ZeptoMail no aceptó reservas@ como remitente o «Responder a»; sale del remitente de siempre:', det); return enviarZepto({ lista, asunto, html, texto, responder: false }); }
		throw new Error(`ZeptoMail rechazó el correo: ${det}`);
	}
	return body.request_id;
}

async function enviarResend({ lista, asunto, html, texto, responder }) {
	const { de, resp } = remitenteDe(responder);
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			from: de.address ? `${de.name} <${de.address}>` : `${NOMBRE} <onboarding@resend.dev>`,
			to: lista,
			...(resp ? { reply_to: resp } : {}),
			subject: asunto,
			html,
			text: texto
		})
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(`Resend rechazó el correo: ${body.message || res.status}`);
	return body.id;
}

// responder: true en los correos que la persona puede contestar (reservas); sale de reservas@ (remitenteDe).
export async function enviarCorreo({ para, asunto, html, texto, responder = false }) {
	const lista = [...new Set((Array.isArray(para) ? para : [para]).filter(Boolean))];
	const servicio = servicioCorreo();
	if (!servicio) throw new Error('Falta la clave del servicio de correo en Netlify (ZEPTOMAIL_TOKEN o RESEND_API_KEY).');
	if (!lista.length) throw new Error('Falta AVISO_CORREO en Netlify.');
	const datos = { lista, asunto, html, texto, responder };
	// Lo que sale o falla queda en estado/correo (la tarjeta «Estado del sistema»; un ok por hora como mucho).
	try {
		const id = await (servicio === 'zeptomail' ? enviarZepto(datos) : enviarResend(datos));
		await anotarOk('correo');
		return id;
	} catch (err) {
		await anotarFallo('correo', err.message);
		throw err;
	}
}
