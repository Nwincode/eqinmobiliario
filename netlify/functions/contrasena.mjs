// POST /api/contrasena { email }: el correo «Crea o cambia tu contraseña» con el diseño de la empresa
// (netlify/lib/correo-contrasena.mjs), enviado con el servicio de correo de la empresa (Zoho CPaaS / ZeptoMail).
// Lo usan «Dar acceso», «Reenviar correo», Usuarios y «¿Olvidaste tu contraseña?» (admin/js/contrasena.js).
//
// Seguridad (revisada aparte; ver docs/revision-antes-de-unir.md):
//  - El enlace (de Google, un solo uso, vence en 1 hora) va SOLO al correo de esa cuenta, el que Google devuelve y que
//    tiene que ser el pedido, y nunca vuelve en la respuesta ni en los registros.
//  - Solo a quien entra al panel: su cuenta de Firebase y un users/{uid} activo. Una cuenta creada por fuera (el alta
//    de Firebase es pública) no recibe correos con la marca de la empresa.
//  - Sin sesión de administrador, la respuesta es la misma exista o no la persona; límite por IP y por correo (los
//    pedidos rechazados no cuentan, así nadie deja a otro sin su correo).
//  - La cuenta de servicio es una aparte (GOOGLE_SA_ACCESOS_*), con el rol «Firebase Authentication Admin»; sin ella,
//    503 y el panel manda el correo de Firebase de siempre.
// Respuestas: 200 enviado; 400 correo inválido; 404 (solo al administrador) no tiene acceso al panel; 415 sin JSON;
// 429 demasiados pedidos; 503 sin configurar o falló el envío.
import { googleToken, cuentaAccesos } from '../lib/google.mjs';
import { leerPrivado, datosConfigurados } from '../lib/firestore.mjs';
import { enviarCorreo, servicioCorreo } from '../lib/correo.mjs';
import { correoContrasena } from '../lib/correo-contrasena.mjs';
import { staffUser, json } from '../lib/auth.mjs';
import { limitador, ipDe } from '../lib/limite.mjs';
import { correoValido } from '../../admin/js/formato.js';
import siteConfig from '../../site.config.json' with { type: 'json' };

const PROYECTO = siteConfig.firebase.projectId;
const API = `https://identitytoolkit.googleapis.com/v1/projects/${PROYECTO}`;
const ALCANCE = 'https://www.googleapis.com/auth/cloud-platform';
const porIp = limitador(10, 10 * 60_000);
const porCorreo = limitador(3, 60 * 60_000);

async function google(accion, cuerpo) {
	const token = await googleToken(ALCANCE, cuentaAccesos());
	const res = await fetch(`${API}/${accion}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
	const body = await res.json().catch(() => ({}));
	return { ok: res.ok, body, motivo: body.error?.message || String(res.status) };
}

// ¿Esa persona entra al panel? Su cuenta (sin deshabilitar) y su users/{uid} activo.
async function conAcceso(email) {
	const r = await google('accounts:lookup', { email: [email] });
	if (!r.ok) throw new Error(`Google no encontró la cuenta: ${r.motivo}`);
	const cuenta = (r.body.users || []).find((u) => String(u.email || '').toLowerCase() === email);
	if (!cuenta || cuenta.disabled) return false;
	const usuario = await leerPrivado(`users/${cuenta.localId}`);
	return Boolean(usuario?.activo);
}

// El enlace de Google para poner la contraseña de esa cuenta; null si Google no lo da para ese correo.
async function enlaceDe(email) {
	const r = await google('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email, returnOobLink: true });
	if (!r.ok) {
		if (/EMAIL_NOT_FOUND|USER_NOT_FOUND|USER_DISABLED/.test(r.motivo)) return null;
		throw new Error(`Google no dio el enlace: ${r.motivo}`);
	}
	if (String(r.body.email || '').toLowerCase() !== email || !r.body.oobLink) return null;
	// La página de Google donde se escribe la contraseña, en español.
	const link = new URL(r.body.oobLink);
	link.searchParams.set('lang', 'es');
	return link.href;
}

export default async (req, context) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!/^application\/json\b/i.test(req.headers.get('content-type') || '')) return json(415, { error: 'Solicitud inválida' });
	if (!cuentaAccesos() || !servicioCorreo() || !datosConfigurados()) return json(503, { error: 'Sin configurar' });
	let cuerpo;
	try { cuerpo = await req.json(); } catch { return json(400, { error: 'Solicitud inválida' }); }
	const email = String(cuerpo?.email || '').trim().toLowerCase();
	if (!correoValido(email) || !/^[\x21-\x7e]+$/.test(email)) return json(400, { error: 'Correo inválido' });
	let admin = false;
	try { admin = Boolean((await staffUser(req))?.admin); } catch { /* sin sesión o token vencido: como cualquiera */ }
	if (!admin && (porIp(ipDe(req, context)) || porCorreo(email))) return json(429, { error: 'Demasiados intentos: espera unos minutos.' });
	try {
		const link = (await conAcceso(email)) ? await enlaceDe(email) : null;
		if (!link) return admin ? json(404, { error: 'Ese correo no tiene acceso al panel.' }) : json(200, { ok: true });
		const { asunto, html, texto } = correoContrasena({ link, email });
		await enviarCorreo({ para: email, asunto, html, texto });
		return json(200, { ok: true });
	} catch (err) {
		console.error('Contraseña:', err.message);
		return json(503, { error: 'No se pudo enviar' });
	}
};

export const config = { path: '/api/contrasena' };
