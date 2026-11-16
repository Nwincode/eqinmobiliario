// POST /api/contrasena { email }: el correo «Crea o cambia tu contraseña» con el diseño de la empresa
// (netlify/lib/correo-contrasena.mjs), enviado con el servicio de correo de la empresa (Zoho CPaaS / ZeptoMail).
// Lo usan «Dar acceso», «Reenviar correo», Usuarios y «¿Olvidaste tu contraseña?» (admin/js/contrasena.js).
//
// Seguridad: hace lo mismo que el correo de Firebase, que cualquiera puede pedir para cualquier correo: el enlace
// (de Google, un solo uso, vence en 1 hora) va SOLO al correo de esa cuenta y nunca vuelve en la respuesta. Sin
// sesión de administrador, la respuesta es la misma exista o no la cuenta (no se puede averiguar quién tiene usuario)
// y hay límite de pedidos por IP y por correo.
// El enlace lo pide a Google la cuenta de servicio de los accesos (GOOGLE_SA_ACCESOS_*), o la de escritura si no hay
// una aparte; necesita el rol «Firebase Authentication Admin». Respuestas: 200 enviado; 400 correo inválido;
// 404 (solo al administrador) esa cuenta no existe; 429 demasiados pedidos; 503 sin configurar o falló el envío:
// el panel manda entonces el correo de Firebase de siempre.
import { googleToken, cuentaAccesos } from '../lib/google.mjs';
import { enviarCorreo, servicioCorreo } from '../lib/correo.mjs';
import { correoContrasena } from '../lib/correo-contrasena.mjs';
import { staffUser, json } from '../lib/auth.mjs';
import { limitador, ipDe } from '../lib/limite.mjs';
import { correoValido } from '../../admin/js/formato.js';
import siteConfig from '../../site.config.json' with { type: 'json' };

const PROYECTO = siteConfig.firebase.projectId;
const ALCANCE = 'https://www.googleapis.com/auth/cloud-platform';
const porIp = limitador(5, 10 * 60_000);
const porCorreo = limitador(3, 60 * 60_000);

// El enlace de Google para poner la contraseña de esa cuenta; null si la cuenta no existe.
async function enlaceDe(email) {
	const token = await googleToken(ALCANCE, cuentaAccesos());
	const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROYECTO}/accounts:sendOobCode`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ requestType: 'PASSWORD_RESET', email, returnOobLink: true })
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) {
		if (/EMAIL_NOT_FOUND|USER_NOT_FOUND/.test(body.error?.message || '')) return null;
		throw new Error(`Google no dio el enlace: ${body.error?.message || res.status}`);
	}
	// La página de Google donde se escribe la contraseña, en español.
	const link = new URL(body.oobLink);
	link.searchParams.set('lang', 'es');
	return link.href;
}

export default async (req, context) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!cuentaAccesos() || !servicioCorreo()) return json(503, { error: 'Sin configurar' });
	let cuerpo;
	try { cuerpo = await req.json(); } catch { return json(400, { error: 'Solicitud inválida' }); }
	const email = String(cuerpo?.email || '').trim().toLowerCase();
	if (!correoValido(email)) return json(400, { error: 'Correo inválido' });
	let admin = null;
	try { admin = (await staffUser(req))?.admin ? true : null; } catch { /* sin sesión o token vencido: como cualquiera */ }
	if (!admin && (porIp(ipDe(req, context)) || porCorreo(email))) return json(429, { error: 'Demasiados intentos: espera unos minutos.' });
	try {
		const link = await enlaceDe(email);
		if (!link) return admin ? json(404, { error: 'Ese correo no tiene cuenta.' }) : json(200, { ok: true });
		const { asunto, html, texto } = correoContrasena({ link, email });
		await enviarCorreo({ para: email, asunto, html, texto });
		return json(200, { ok: true });
	} catch (err) {
		console.error('Contraseña:', err.message);
		return json(503, { error: 'No se pudo enviar' });
	}
};

export const config = { path: '/api/contrasena' };
