// Aviso inmediato por correo cuando alguien llena un formulario del sitio.
// POST /api/aviso-lead (lo llama js/site.js después de guardar el lead en Firestore).
// Solo escribe al equipo (AVISO_CORREO) y al asesor asignado: nunca a direcciones que mande el visitante.
import { json } from '../lib/auth.mjs';
import { leerPublico } from '../lib/firestore.mjs';
import { enviarCorreo, correoConfigurado, destinatariosEquipo, plantilla, boton, esc, SITE_URL } from '../lib/correo.mjs';

const hits = new Map();
function limitado(ip) {
	const now = Date.now();
	const lista = (hits.get(ip) || []).filter((t) => now - t < 10 * 60_000);
	lista.push(now);
	hits.set(ip, lista);
	return lista.length > 5;
}

const cut = (v, n) => String(v ?? '').trim().slice(0, n);

function telWa(tel) {
	let n = String(tel || '').replace(/\D/g, '');
	if (n.length === 8) n = `502${n}`;
	return n;
}

export default async (req, context) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!correoConfigurado()) return json(200, { enviado: false, motivo: 'Correo no configurado' });
	if (limitado(context?.ip || req.headers.get('x-nf-client-connection-ip') || 'anon')) return json(429, { error: 'Demasiados avisos seguidos' });

	let d;
	try {
		d = await req.json();
	} catch {
		return json(400, { error: 'Solicitud inválida' });
	}
	const lead = {
		nombre: cut(d.nombre, 120),
		telefono: cut(d.telefono, 40),
		email: cut(d.email, 160),
		mensaje: cut(d.mensaje, 2000),
		propertyTitulo: cut(d.propertyTitulo, 200),
		pagina: cut(d.pagina, 300),
		fechaVisita: cut(d.fechaVisita, 60),
		tipoVisita: cut(d.tipoVisita, 40),
		agentId: cut(d.agentId, 80).replace(/[^\w-]/g, '')
	};
	if (!lead.nombre || (!lead.telefono && !lead.email)) return json(400, { error: 'Faltan datos' });

	const asesor = lead.agentId ? await leerPublico(`agents/${lead.agentId}`) : null;
	const para = [...destinatariosEquipo(), asesor?.activo && asesor.email ? asesor.email : ''];

	const pagina = /^\/[\w\-/.%]*$/.test(lead.pagina) ? SITE_URL + lead.pagina : '';
	const saludo = `Hola ${lead.nombre.split(' ')[0]}, gracias por escribirnos${lead.propertyTitulo ? ` por ${lead.propertyTitulo}` : ''}. `;
	const wa = telWa(lead.telefono);

	const telLink = String(lead.telefono).replace(/[^\d+]/g, '');
	const filas = [
		['Nombre', lead.nombre],
		['Teléfono', lead.telefono, telLink ? `tel:${telLink}` : ''],
		['Correo', lead.email, lead.email ? `mailto:${lead.email}` : ''],
		['Propiedad', lead.propertyTitulo, pagina],
		['Página', !lead.propertyTitulo && pagina ? lead.pagina : '', pagina],
		['Visita', [lead.fechaVisita, lead.tipoVisita].filter(Boolean).join(' · ')],
		['Asesor', asesor?.nombre || '']
	].filter(([, v]) => v);

	const urlWa = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(saludo)}` : '';
	const urlCorreo = lead.email ? `mailto:${lead.email}?subject=${encodeURIComponent(`Re: ${lead.propertyTitulo || 'Equipo Inmobiliario'}`)}&body=${encodeURIComponent(saludo)}` : '';
	const urlPanel = `${SITE_URL}/admin/#/leads`;
	const contacto = [lead.telefono, lead.email].filter(Boolean).join(' · ');

	const html = await plantilla({
		titulo: `Nuevo interesado: ${lead.nombre}`,
		intro: lead.propertyTitulo ? `Pregunta por <strong style="color:inherit">${esc(lead.propertyTitulo)}</strong>. Contéstale pronto: quien responde primero suele quedarse con el cliente.` : 'Llenó un formulario del sitio. Contéstale pronto: quien responde primero suele quedarse con el cliente.',
		preheader: `${lead.propertyTitulo || 'Formulario del sitio'} · ${contacto}. Contéstale pronto.`,
		bloques: (c) => `
${urlWa ? boton(c, 'Responder por WhatsApp', urlWa, c.whatsapp, { ancho: true }) : ''}
${urlCorreo ? boton(c, 'Responder por correo', urlCorreo, c.primary, urlWa ? { ancho: true, borde: true } : { ancho: true }) : ''}
<p style="margin:0 0 20px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px"><a href="${urlPanel}" target="_blank" style="display:inline-block;padding:12px 8px;color:${c.primary};font-weight:bold;text-decoration:underline">Ver en el panel</a></p>
${lead.mensaje ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><td bgcolor="${c.suave}" style="background:${c.suave};border-left:3px solid ${c.primary};padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:${c.dark}">
<div style="font-size:12px;line-height:16px;color:${c.ink};margin:0 0 4px">Mensaje</div>${esc(lead.mensaje).replace(/\n/g, '<br>')}</td></tr></table>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px">
${filas.map(([k, v, url]) => `<tr><td width="96" style="padding:8px 12px 8px 0;border-top:1px solid ${c.linea};color:${c.ink};font-size:13px;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:8px 0;border-top:1px solid ${c.linea};color:${c.dark};font-weight:bold;word-break:break-word">${url ? `<a href="${esc(url)}" style="color:${c.primary};text-decoration:underline">${esc(v)}</a>` : esc(v)}</td></tr>`).join('')}
</table>`
	});

	const texto = [
		`Nuevo interesado: ${lead.nombre}`,
		lead.propertyTitulo ? `Pregunta por ${lead.propertyTitulo}. Contéstale pronto.` : 'Llenó un formulario del sitio. Contéstale pronto.',
		'',
		...filas.map(([k, v]) => `${k}: ${v}`),
		lead.mensaje ? `\nMensaje:\n${lead.mensaje}` : '',
		'',
		urlWa ? `Responder por WhatsApp: ${urlWa}` : '',
		lead.email ? `Responder por correo: ${lead.email}` : '',
		pagina ? `Página: ${pagina}` : '',
		`Ver en el panel: ${urlPanel}`
	].join('\n').replace(/\n{3,}/g, '\n\n');

	try {
		await enviarCorreo({ para, asunto: `Nuevo interesado: ${lead.nombre}${lead.propertyTitulo ? ` · ${lead.propertyTitulo}` : ''}`, html, texto });
		return json(200, { enviado: true });
	} catch (err) {
		console.error('Aviso de lead:', err.message);
		return json(502, { error: 'No se pudo enviar el aviso' });
	}
};

export const config = { path: '/api/aviso-lead' };
