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

	const filas = [
		['Nombre', lead.nombre],
		['Teléfono', lead.telefono],
		['Correo', lead.email],
		['Propiedad', lead.propertyTitulo],
		['Visita', [lead.fechaVisita, lead.tipoVisita].filter(Boolean).join(' · ')],
		['Asesor', asesor?.nombre || '']
	].filter(([, v]) => v);

	const html = await plantilla({
		titulo: `Nuevo interesado: ${lead.nombre}`,
		intro: lead.propertyTitulo ? `Pregunta por <strong>${esc(lead.propertyTitulo)}</strong>.` : 'Llenó un formulario del sitio.',
		bloques: (c) => `
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;line-height:1.5;margin:0 0 16px">
${filas.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:${c.ink};white-space:nowrap;vertical-align:top">${k}</td><td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`).join('')}
</table>
${lead.mensaje ? `<p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid ${c.primary};font-size:14px;line-height:1.5">${esc(lead.mensaje).replace(/\n/g, '<br>')}</p>` : ''}
<p style="margin:0 0 8px;font-size:14px">Contéstale pronto: quien responde primero suele quedarse con el cliente.</p>
<div>
${wa ? boton(c, 'Escribir por WhatsApp', `https://wa.me/${wa}?text=${encodeURIComponent(saludo)}`, c.whatsapp) : ''}
${lead.email ? boton(c, 'Responder por correo', `mailto:${lead.email}?subject=${encodeURIComponent(lead.propertyTitulo || 'Equipo Inmobiliario')}`) : ''}
${boton(c, 'Ver en el panel', `${SITE_URL}/admin/#/leads`, c.dark)}
</div>
${pagina ? `<p style="margin:16px 0 0;font-size:12px;color:${c.ink}">Desde: <a href="${esc(pagina)}" style="color:${c.primary}">${esc(pagina)}</a></p>` : ''}`
	});

	const texto = [`Nuevo interesado: ${lead.nombre}`, ...filas.map(([k, v]) => `${k}: ${v}`), lead.mensaje ? `\n${lead.mensaje}` : '', `\nPanel: ${SITE_URL}/admin/#/leads`].join('\n');

	try {
		await enviarCorreo({ para, asunto: `Nuevo interesado: ${lead.nombre}${lead.propertyTitulo ? ` · ${lead.propertyTitulo}` : ''}`, html, texto });
		return json(200, { enviado: true });
	} catch (err) {
		console.error('Aviso de lead:', err.message);
		return json(502, { error: 'No se pudo enviar el aviso' });
	}
};

export const config = { path: '/api/aviso-lead' };
