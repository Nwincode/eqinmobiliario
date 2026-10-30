// Verificación del usuario del panel: token de Firebase + documento activo en users/{uid}.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import siteConfig from '../../site.config.json' with { type: 'json' };

const PROJECT_ID = siteConfig.firebase.projectId;
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

export async function staffUser(req) {
	const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
	if (!token) return null;
	const { payload } = await jwtVerify(token, JWKS, {
		issuer: `https://securetoken.google.com/${PROJECT_ID}`,
		audience: PROJECT_ID
	});
	const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${payload.sub}`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!res.ok) return null;
	const doc = await res.json();
	if (!doc.fields?.activo?.booleanValue) return null;
	return { uid: payload.sub, nombre: doc.fields?.nombre?.stringValue || '', admin: doc.fields?.rol?.stringValue === 'admin' };
}

export function json(status, body) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
