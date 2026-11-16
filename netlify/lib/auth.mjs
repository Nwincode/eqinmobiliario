// Verificación del usuario del panel: token de Firebase + documento activo en users/{uid}.
//  - staffUser: el equipo (administrador o asesor).
//  - socioUser: un dueño con acceso al panel (rol «socio», con su propietarioId).
import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import siteConfig from '../../site.config.json' with { type: 'json' };

const PROJECT_ID = siteConfig.firebase.projectId;
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;

// Solo en el entorno de pruebas local (scripts/entorno): el emulador de inicio de sesión da tokens sin firma. Hacen
// falta las dos cosas, que en Netlify no existen: el emulador encendido y un proyecto de mentira («demo-…»).
const enEmulador = () => Boolean(process.env.FIRESTORE_EMULATOR_HOST) && PROJECT_ID.startsWith('demo-');

async function verificar(token) {
	const p = enEmulador() ? decodeJwt(token) : (await jwtVerify(token, JWKS, { issuer: ISSUER, audience: PROJECT_ID, algorithms: ['RS256'] })).payload;
	if (p.iss !== ISSUER || p.aud !== PROJECT_ID) throw new Error('Token de otro proyecto');
	// Un token sin dueño o con una hora de entrada en el futuro no vale (como pide Firebase para verificarlos).
	if (typeof p.sub !== 'string' || !p.sub || p.sub.length > 128) throw new Error('Token sin usuario');
	if (Number(p.auth_time) > Date.now() / 1000 + 60) throw new Error('Token con hora inválida');
	return p;
}

// Quien llama, con su users/{uid} (leído con su propio token: las reglas le dejan leer el suyo). null sin token o
// sin usuario; un token inválido lanza un error.
async function usuario(req) {
	const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
	if (!token) return null;
	const payload = await verificar(token);
	const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${payload.sub}`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!res.ok) return null;
	const f = (await res.json()).fields || {};
	if (!f.activo?.booleanValue) return null;
	return { uid: payload.sub, nombre: f.nombre?.stringValue || '', rol: f.rol?.stringValue || '', propietarioId: f.propietarioId?.stringValue || '' };
}

// Quien llama según su token (sin mirar users/): uid, correo y cuándo entró. null sin token; un token inválido lanza.
export async function sesionDe(req) {
	const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
	if (!token) return null;
	const p = await verificar(token);
	return { uid: p.sub, email: String(p.email || '').toLowerCase(), entro: Number(p.auth_time) || 0 };
}

export async function staffUser(req) {
	const u = await usuario(req);
	if (!u || (u.rol !== 'admin' && u.rol !== 'asesor')) return null;
	return { uid: u.uid, nombre: u.nombre, admin: u.rol === 'admin' };
}

export async function socioUser(req) {
	const u = await usuario(req);
	if (!u || u.rol !== 'socio' || !u.propietarioId) return null;
	return { uid: u.uid, nombre: u.nombre, propietarioId: u.propietarioId };
}

export function json(status, body) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
