// Aviso inmediato por correo cuando alguien llena un formulario del sitio.
// POST /api/aviso-lead { id } (lo llama js/site.js después de guardar el lead en Firestore).
// Lo que dice el correo sale del lead GUARDADO (se vuelve a leer por su id con la cuenta de servicio), no de lo que
// trae la petición: así nadie usa esta dirección para mandarle al equipo un correo con lo que quiera. Solo uno recién
// creado (10 minutos) y solo escribe al equipo (AVISO_CORREO) y al asesor asignado.
// La lectura usa la misma cuenta de servicio que ya necesitan disponibilidad.mjs (el iCal privado), aviso-chat.mjs y los controles de
// cada hora (GOOGLE_SA_EMAIL y GOOGLE_SA_KEY): no hay nada nuevo que configurar. Sin ella no sale el
// aviso (queda en el registro de la función); el visitante no lo nota: su lead ya quedó guardado y el sitio no espera
// esta respuesta. Un mismo id se avisa una sola vez por instancia de la función (la cuenta solo lee: no puede marcar
// el lead como avisado). Queda: dentro de esos 10 minutos, otra instancia podría repetir el aviso del mismo lead.
import { json } from '../lib/auth.mjs';
import { leerPublico, leerPrivado, datosConfigurados } from '../lib/firestore.mjs';
import { telefonoWa as telWa } from '../../admin/js/formato.js';
import { enviarCorreo, correoConfigurado, destinatariosEquipo, plantilla, boton, esc, SITE_URL } from '../lib/correo.mjs';
import { limitador, ipDe } from '../lib/limite.mjs';

const limitado = limitador(5);

const cut = (v, n) => String(v ?? '').trim().slice(0, n);
// Leads ya avisados por esta instancia (id → hora), para no mandar dos veces el mismo.
const avisados = new Map();

export default async (req, context) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!correoConfigurado()) return json(200, { enviado: false, motivo: 'Correo no configurado' });
	if (limitado(ipDe(req, context))) return json(429, { error: 'Demasiados avisos seguidos' });

	let id;
	try {
		id = cut((await req.json())?.id, 60);
	} catch {
		return json(400, { error: 'Solicitud inválida' });
	}
	if (!/^[\w-]{8,60}$/.test(id)) return json(400, { error: 'Falta el lead' });
	if (!datosConfigurados()) {
		console.error('Aviso de lead: faltan GOOGLE_SA_EMAIL y GOOGLE_SA_KEY en Netlify; no se puede leer el lead y no sale el correo.');
		return json(200, { enviado: false, motivo: 'Sin cuenta de servicio para leer el lead' });
	}
	for (const [k, t] of avisados) if (Date.now() - t > 10 * 60_000) avisados.delete(k);
	if (avisados.has(id)) return json(200, { enviado: false, motivo: 'Ya se avisó' });
	let d;
	try {
		d = await leerPrivado(`leads/${id}`);
	} catch (err) {
		console.error('Aviso de lead: no se pudo leer', err.message);
		return json(502, { error: 'No se pudo leer el lead' });
	}
	const creado = d?.createdAt instanceof Date ? d.createdAt.getTime() : 0;
	if (!d || Date.now() - creado > 10 * 60_000) return json(404, { error: 'Lead no encontrado' });
	avisados.set(id, Date.now());
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
