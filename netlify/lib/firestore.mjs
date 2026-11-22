// Lectura de Firestore desde las funciones de Netlify (REST, sin SDK).
// - leerPublico(): documentos que cualquiera puede leer (settings/site, asesores activos).
// - leerPrivado(): un documento interno (p. ej. properties/{id}/privado/socio).
// - listar(): colecciones internas (clientes, agenda…).
// - desde(): los documentos de una colección con una fecha posterior a la dada.
//   Las tres internas usan la cuenta de servicio de Google
//   (GOOGLE_SA_EMAIL y GOOGLE_SA_KEY), que necesita el rol "Cloud Datastore Viewer"
//   en el proyecto de Firebase.
// Lo que escribe (solo las reservas del socio) está en firestore-escritura.mjs, con otra cuenta.
import siteConfig from '../../site.config.json' with { type: 'json' };
import { googleToken, googleConfigurado } from './google.mjs';

const { projectId: PROJECT_ID, apiKey: API_KEY } = siteConfig.firebase;
export const RAIZ = `projects/${PROJECT_ID}/databases/(default)/documents`;
export const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
export const SCOPE_DATOS = 'https://www.googleapis.com/auth/datastore';

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

export const documento = (d) => ({ id: d.name.split('/').pop(), ...campos(d.fields) });

// Documento público (o null si no existe o no se puede leer).
export async function leerPublico(ruta) {
	try {
		const res = await fetch(`${BASE}/${ruta}${API_KEY ? `?key=${API_KEY}` : ''}`);
		return res.ok ? documento(await res.json()) : null;
	} catch {
		return null;
	}
}

// Un documento interno con la cuenta de servicio (solo lectura). null si no existe.
export async function leerPrivado(ruta) {
	const token = await googleToken(SCOPE_DATOS);
	const res = await fetch(`${BASE}/${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`Error ${res.status} al leer ${ruta.split('/')[0]}`);
	return documento(await res.json());
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

// Documentos de una colección con `campo` desde `valor` (incluido; un texto, como una fecha 'AAAA-MM-DD', o un número), del menor
// al mayor, de 300 en 300 hasta `tope`. Un solo filtro de rango: usa el índice que Firestore crea solo para cada campo.
export async function consultar(coleccion, campo, valor, { tope = 3000 } = {}) {
	const token = await googleToken(SCOPE_DATOS);
	const docs = [];
	let despues = null;
	while (docs.length < tope) {
		const res = await fetch(`${BASE}:runQuery`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ structuredQuery: {
				from: [{ collectionId: coleccion }],
				where: { fieldFilter: { field: { fieldPath: campo }, op: 'GREATER_THAN_OR_EQUAL', value: typeof valor === 'number' ? { integerValue: String(valor) } : { stringValue: String(valor) } } },
				orderBy: [{ field: { fieldPath: campo }, direction: 'ASCENDING' }, { field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
				...(despues ? { startAt: { values: despues, before: false } } : {}),
				limit: Math.min(300, tope - docs.length)
			} })
		});
		if (!res.ok) throw new Error(`Error ${res.status} al consultar ${coleccion}`);
		const pagina = (await res.json()).filter((r) => r.document).map((r) => r.document);
		docs.push(...pagina.map(documento));
		if (pagina.length < 300) break;
		const ultimo = pagina.at(-1);
		despues = [ultimo.fields?.[campo] || { nullValue: null }, { referenceValue: ultimo.name }];
	}
	// Con el tope lleno, lo que sigue no se leyó: queda en el registro de la función.
	if (docs.length >= tope) console.warn(`consultar: ${coleccion} llegó al tope de ${tope} (${campo} desde ${valor}); los siguientes no se leyeron.`);
	return docs;
}

// Documentos de una colección cuyo campo de fecha es posterior a `fecha` (hasta 500).
export async function desde(coleccion, campo, fecha) {
	const token = await googleToken(SCOPE_DATOS);
	const res = await fetch(`${BASE}:runQuery`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ structuredQuery: {
			from: [{ collectionId: coleccion }],
			where: { fieldFilter: { field: { fieldPath: campo }, op: 'GREATER_THAN', value: { timestampValue: fecha.toISOString() } } },
			limit: 500
		} })
	});
	if (!res.ok) throw new Error(`Error ${res.status} al consultar ${coleccion}`);
	return (await res.json()).filter((r) => r.document).map((r) => documento(r.document));
}

// Documentos de una colección interna con `campo` == `valor` (un texto o un sí/no; hasta 1,000). `campo` puede ir anidado
// ('comision.vence'): usa el índice que Firestore crea solo para cada campo.
export async function donde(coleccion, campo, valor) {
	const token = await googleToken(SCOPE_DATOS);
	const res = await fetch(`${BASE}:runQuery`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ structuredQuery: {
			from: [{ collectionId: coleccion }],
			where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: typeof valor === 'boolean' ? { booleanValue: valor } : { stringValue: String(valor) } } },
			limit: 1000
		} })
	});
	if (!res.ok) throw new Error(`Error ${res.status} al consultar ${coleccion}`);
	const docs = (await res.json()).filter((r) => r.document).map((r) => documento(r.document));
	// Con el tope lleno, lo que sigue no se leyó: queda en el registro de la función (como en `consultar`).
	if (docs.length >= 1000) console.warn(`donde: ${coleccion} llegó al tope de 1,000 (${campo} = ${valor}); los siguientes no se leyeron.`);
	return docs;
}
