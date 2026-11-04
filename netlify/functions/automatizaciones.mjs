// Estado de las automatizaciones y pruebas desde el panel (solo administradores).
// GET  /api/automatizaciones           → qué está configurado en Netlify
// POST /api/automatizaciones {accion}  → 'correo' (correo de prueba) o 'resumen' (resumen de hoy al equipo)
import { staffUser, json } from '../lib/auth.mjs';
import { correoConfigurado, destinatariosEquipo, enviarCorreo, plantilla } from '../lib/correo.mjs';
import { datosConfigurados } from '../lib/firestore.mjs';
import { enviarResumen } from '../lib/resumen.mjs';

export default async (req) => {
	let user;
	try {
		user = await staffUser(req);
	} catch {
		user = null;
	}
	if (!user?.admin) return json(403, { error: 'Solo para administradores.' });

	if (req.method === 'GET') {
		return json(200, {
			correo: Boolean(process.env.RESEND_API_KEY),
			destinatarios: destinatariosEquipo().length,
			remitente: Boolean(process.env.CORREO_REMITENTE),
			datos: datosConfigurados(),
			ia: Boolean(process.env.ANTHROPIC_API_KEY)
		});
	}
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!correoConfigurado()) return json(400, { error: 'Falta configurar RESEND_API_KEY y AVISO_CORREO en Netlify.' });

	const { accion } = await req.json().catch(() => ({}));
	try {
		if (accion === 'correo') {
			const html = await plantilla({
				titulo: 'Correo de prueba',
				intro: `Lo pidió ${user.nombre || 'un administrador'} desde el panel.`,
				bloques: () => '<p style="font-size:14px;margin:0">Si te llegó este correo, los avisos de nuevos interesados ya funcionan.</p>'
			});
			await enviarCorreo({ para: destinatariosEquipo(), asunto: 'Prueba de avisos · Equipo Inmobiliario', html, texto: 'Si te llegó este correo, los avisos ya funcionan.' });
			return json(200, { ok: true, mensaje: `Enviado a ${destinatariosEquipo().join(', ')}.` });
		}
		if (accion === 'resumen') {
			if (!datosConfigurados()) return json(400, { error: 'Falta la cuenta de servicio de Google (GOOGLE_SA_EMAIL y GOOGLE_SA_KEY).' });
			const r = await enviarResumen({ soloEquipo: true });
			return json(200, { ok: true, mensaje: r.total ? `Resumen enviado a ${destinatariosEquipo().join(', ')}.` : 'Hoy no hay pendientes: no se envió nada.' });
		}
		return json(400, { error: 'Acción desconocida' });
	} catch (err) {
		return json(502, { error: err.message });
	}
};

export const config = { path: '/api/automatizaciones' };
