// Lectura de Firestore desde las funciones de Netlify (REST, sin SDK).
// - leerPublico(): documentos que cualquiera puede leer (settings/site, asesores activos).
// - listar(): colecciones internas (clientes, agenda…). Usa la cuenta de servicio de Google
//   (GOOGLE_SA_EMAIL y GOOGLE_SA_KEY), que necesita el rol "Cloud Datastore Viewer"
//   en el proyecto de Firebase.
import siteConfig from '../../site.config.json' with { type: 'json' };
import { googleToken, googleConfigurado } from './google.mjs';

const { projectId: PROJECT_ID, apiKey: API_KEY } = siteConfig.firebase;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const SCOPE_DATOS = 'https://www.googleapis.com/auth/datastore';

export const datosConfigurados = googleConfigurado;

function valor(v) {
	if (!v || typeof v !== 'object') return null;
	if ('stringValue' in v) return v.stringValue;
	if ('booleanValue' in v) return v.booleanValue;
	if ('integerValue' in v) return Number(v.integerValue);
	if ('doubleValue' in v) return v.doubleValue;
	if ('timestampValue' in v) return new Date(v.timestampValue);
	if ('nullValue' in v) return null;
	if ('arrayValue' in v) return (v.arrayValue.values || []).map(valor);
	if ('mapValue' in v) return campos(v.mapValue.fields);
	return null;
}

function campos(fields = {}) {
	const out = {};
	for (const [k, v] of Object.entries(fields)) out[k] = valor(v);
	return out;
}

const documento = (d) => ({ id: d.name.split('/').pop(), ...campos(d.fields) });

// Documento público (o null si no existe o no se puede leer).
export async function leerPublico(ruta) {
	try {
		const res = await fetch(`${BASE}/${ruta}${API_KEY ? `?key=${API_KEY}` : ''}`);
		return res.ok ? documento(await res.json()) : null;
	} catch {
		return null;
	}
}

// Todos los documentos de una colección interna (hasta 3,000).
export async function listar(coleccion) {
	const token = await googleToken(SCOPE_DATOS);
	const docs = [];
	let pagina = '';
	for (let i = 0; i < 10; i++) {
		const url = `${BASE}/${coleccion}?pageSize=300${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''}`;
		const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			const msg = body.error?.message || `Error ${res.status}`;
			throw new Error(res.status === 403
				? `La cuenta de servicio no tiene permiso para leer la base de datos (agrega el rol "Cloud Datastore Viewer" en Google Cloud). ${msg}`
				: msg);
		}
		docs.push(...(body.documents || []).map(documento));
		if (!body.nextPageToken) break;
		pagina = body.nextPageToken;
	}
	return docs;
}
