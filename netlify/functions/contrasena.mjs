// POST /api/contrasena { email }: el correo «Crea o cambia tu contraseña» con el diseño de la empresa
// (netlify/lib/correo-contrasena.mjs), enviado con el servicio de correo de la empresa (Zoho CPaaS / ZeptoMail).
// Lo usan «Dar acceso», «Reenviar correo», Usuarios, «¿Olvidaste tu contraseña?», «Este enlace ya no sirve» y «Cambiar mi
// contraseña» (admin/js/contrasena.js).
//
// Seguridad (revisada aparte; ver docs/revision-antes-de-unir.md):
//  - El enlace (de Google, un solo uso, vence en 1 hora) va SOLO al correo de esa cuenta, el que Google devuelve y que
//    tiene que ser el pedido, y nunca vuelve en la respuesta ni en los registros.
//  - Solo a quien entra al panel: su cuenta de Firebase y un users/{uid} activo con ese mismo correo. Una cuenta creada por fuera (el alta
//    de Firebase es pública) no recibe correos con la marca de la empresa.
//  - Sin sesión de administrador, la respuesta es la misma exista o no la persona; límite por IP y por correo (los
//    pedidos rechazados no cuentan, así nadie deja a otro sin su correo).
//  - La cuenta de servicio es una aparte (GOOGLE_SA_ACCESOS_*), con el rol «Firebase Authentication Admin»; sin ella,
//    503 y el panel manda el correo de Firebase de siempre.
// Respuestas: 200 enviado; 400 correo inválido; 404 (solo al administrador) no tiene acceso al panel; 415 sin JSON;
// 429 demasiados pedidos; 503 sin configurar o falló el envío.
import { googleToken, cuentaAccesos } from '../lib/google.mjs';
import { leerPrivado, datosConfigurados } from '../lib/firestore.mjs';
import { enviarCorreo, servicioCorreo, SITE_URL, plantilla, boton, esc, whatsappEmpresa } from '../lib/correo.mjs';
import { correoContrasena } from '../lib/correo-contrasena.mjs';
import { staffUser, sesionDe, json } from '../lib/auth.mjs';
import { limitadorDurable, ipDe } from '../lib/limite.mjs';
import { correoValido } from '../../admin/js/formato.js';
import siteConfig from '../../site.config.json' with { type: 'json' };

const PROYECTO = siteConfig.firebase.projectId;
const API = `https://identitytoolkit.googleapis.com/v1/projects/${PROYECTO}`;
const ALCANCE = 'https://www.googleapis.com/auth/cloud-platform';
// Guardados en la base (limitadorDurable): se cumplen aunque Netlify tenga varias copias de la función o la reinicie.
const porIp = limitadorDurable('contrasena-ip', 10, 10 * 60_000);
const porCorreo = limitadorDurable('contrasena-correo', 3, 60 * 60_000);
const avisosPorCuenta = limitadorDurable('contrasena-aviso', 3, 60 * 60_000);

// Aviso «Tu contraseña cambió» a la cuenta que acaba de cambiarla: si no fue la persona, se entera y avisa.
async function avisoCambio(email) {
	// El WhatsApp de Contenido → Contacto (el mismo del sitio).
	const wa = await whatsappEmpresa('Hola, no cambié mi contraseña del panel y me llegó un aviso.');
	const html = await plantilla({
		titulo: 'Tu contraseña cambió',
		intro: `La contraseña del panel para <strong>${esc(email)}</strong> se cambió hace un momento.`,
		preheader: 'Si fuiste tú, no tienes que hacer nada.',
		bloques: (c) => `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:${c.ink}">Si fuiste tú, no tienes que hacer nada. <strong style="color:${c.dark}">Si no fuiste tú</strong>, escríbenos de inmediato y pide un correo nuevo para poner tu contraseña en «¿Olvidaste tu contraseña?».</p>`
			+ (wa ? boton(c, 'Escribir por WhatsApp', wa, c.whatsapp) : '') + boton(c, 'Abrir el panel', `${SITE_URL}/admin/`, c.primary, { borde: true })
	});
	await enviarCorreo({ para: email, asunto: 'Tu contraseña del panel cambió', html, texto: `La contraseña del panel para ${email} se cambió hace un momento. Si no fuiste tú, escríbenos de inmediato${wa ? ` por WhatsApp: ${wa}` : '.'}` });
}

async function google(accion, cuerpo) {
	const token = await googleToken(ALCANCE, cuentaAccesos());
	const res = await fetch(`${API}/${accion}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
	const body = await res.json().catch(() => ({}));
	return { ok: res.ok, body, motivo: body.error?.message || String(res.status) };
}

// ¿Ese correo entra al panel? Su users/{uid} activo y con ese MISMO correo: si alguien cambia el correo de su cuenta
// en Google por uno ajeno, ese otro no recibe correos con la marca de la empresa.
async function delPanel(uid, email) {
	const usuario = await leerPrivado(`users/${uid}`);
	return Boolean(usuario?.activo) && String(usuario.email || '').toLowerCase() === email;
}

// ¿Esa persona entra al panel? Su cuenta (sin deshabilitar) y su users/{uid} (delPanel).
async function conAcceso(email) {
	const r = await google('accounts:lookup', { email: [email] });
	if (!r.ok) throw new Error(`Google no encontró la cuenta: ${r.motivo}`);
	const cuenta = (r.body.users || []).find((u) => String(u.email || '').toLowerCase() === email);
	if (!cuenta || cuenta.disabled) return false;
	return delPanel(cuenta.localId, email);
}

// El enlace de Google para poner la contraseña de esa cuenta; null si Google no lo da para ese correo.
async function enlaceDe(email) {
	const r = await google('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email, returnOobLink: true });
	if (!r.ok) {
		if (/EMAIL_NOT_FOUND|USER_NOT_FOUND|USER_DISABLED/.test(r.motivo)) return null;
		throw new Error(`Google no dio el enlace: ${r.motivo}`);
	}
	if (String(r.body.email || '').toLowerCase() !== email || !r.body.oobLink) return null;
	// El enlace lleva a la página de la empresa (admin/js/app.js, pantallaContrasena), no a la de Google: el código de
	// un solo uso es el que dio Google y lo vuelve a validar Google al guardar.
	const codigo = new URL(r.body.oobLink).searchParams.get('oobCode');
	if (!codigo) return null;
	// Después de «#»: esa parte de la dirección no llega a ningún servidor ni registro (la lee el panel y la borra).
	return `${SITE_URL}/admin/#mode=resetPassword&oobCode=${encodeURIComponent(codigo)}`;
}

export default async (req, context) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!/^application\/json\b/i.test(req.headers.get('content-type') || '')) return json(415, { error: 'Solicitud inválida' });
	if (!cuentaAccesos() || !servicioCorreo() || !datosConfigurados()) return json(503, { error: 'Sin configurar' });
	let cuerpo;
	try { cuerpo = await req.json(); } catch { return json(400, { error: 'Solicitud inválida' }); }
	// { aviso: 'cambiada' }: lo pide el panel justo después de guardar la contraseña nueva. Solo sale si Google confirma
	// que la contraseña de ESA cuenta cambió hace menos de 10 minutos y la cuenta entra al panel (users/{uid} activo):
	// una cuenta creada por fuera no puede usarlo para mandar correos con la marca. Va al correo que tiene Google.
	if (cuerpo?.aviso === 'cambiada') {
		if (await porIp(ipDe(req, context))) return json(429, { error: 'Demasiados intentos' });
		let s = null;
		try { s = await sesionDe(req); } catch { /* token inválido */ }
		if (!s?.uid) return json(401, { error: 'Sesión inválida' });
		try {
			const r = await google('accounts:lookup', { localId: [s.uid] });
			const cuenta = r.ok ? r.body.users?.[0] : null;
			if (!cuenta?.email || cuenta.disabled || Date.now() - Number(cuenta.passwordUpdatedAt || 0) > 600_000) return json(401, { error: 'Sesión inválida' });
			const correo = String(cuenta.email).toLowerCase();
			if (!(await delPanel(s.uid, correo))) return json(200, { ok: true });
			if (await avisosPorCuenta(s.uid)) return json(429, { error: 'Demasiados intentos' });
			await avisoCambio(correo);
			return json(200, { ok: true });
		} catch (err) { console.error('Aviso de contraseña:', err.message); return json(503, { error: 'No se pudo enviar' }); }
	}
	const email = String(cuerpo?.email || '').trim().toLowerCase();
	if (!correoValido(email) || !/^[\x21-\x7e]+$/.test(email)) return json(400, { error: 'Correo inválido' });
	let admin = false;
	try { admin = Boolean((await staffUser(req))?.admin); } catch { /* sin sesión o token vencido: como cualquiera */ }
	if (!admin && ((await porIp(ipDe(req, context))) || (await porCorreo(email)))) return json(429, { error: 'Demasiados intentos: espera unos minutos.' });
	// true = enviado; false = esa cuenta no entra al panel (no se manda nada).
	const trabajo = async () => {
		const link = (await conAcceso(email)) ? await enlaceDe(email) : null;
		if (!link) return false;
		const { asunto, html, texto } = await correoContrasena({ link, email });
		await enviarCorreo({ para: email, asunto, html, texto });
		return true;
	};
	if (admin) {
		try { return (await trabajo()) ? json(200, { ok: true }) : json(404, { error: 'Ese correo no tiene acceso al panel.' }); }
		catch (err) { console.error('Contraseña:', err.message); return json(503, { error: 'No se pudo enviar' }); }
	}
	// Sin sesión de administrador: la misma respuesta y al instante, exista o no la cuenta (ni el tiempo lo delata);
	// la búsqueda y el envío siguen en segundo plano.
	const tarea = trabajo().catch((err) => console.error('Contraseña:', err.message));
	if (context?.waitUntil) context.waitUntil(tarea); else await tarea;
	return json(200, { ok: true });
};

export const config = { path: '/api/contrasena' };
