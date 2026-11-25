// Fotos de Storage desde el servidor (API JSON de Cloud Storage, con una cuenta de servicio: no pasa por storage.rules).
// - bajar(ruta): la foto (lo usan /api/foto y la revisión del comprobante con la IA). Cuenta de lectura (GOOGLE_SA_*),
//   que necesita el rol «Storage Object Viewer» del bucket.
// - copiar, borrar, listar, quitarLlave: cuenta de escritura (GOOGLE_SA_ESCRITURA_*), con «Storage Object Admin». Las usan
//   el cambio de enlace al corregir el correo (netlify/lib/rotar-enlace.mjs) y la migración (scripts/migrar-chats.mjs).
// En el entorno local, scripts/entorno/red-local.mjs manda storage.googleapis.com al emulador («Bearer owner»).
import siteConfig from '../../site.config.json' with { type: 'json' };
import { googleToken, cuentaLectura, cuentaEscritura } from './google.mjs';

export const BUCKET = siteConfig.firebase.storageBucket;
const API = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`;
const SUBIR = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o`;
const LECTURA = 'https://www.googleapis.com/auth/devstorage.read_only';
const ESCRITURA = 'https://www.googleapis.com/auth/devstorage.read_write';
const objeto = (ruta) => `${API}/${encodeURIComponent(ruta)}`;
const conLlave = async (escribe) => ({ Authorization: `Bearer ${await googleToken(escribe ? ESCRITURA : LECTURA, escribe ? cuentaEscritura() : cuentaLectura())}` });

async function revisar(res, que) {
	if (res.ok) return res;
	throw Object.assign(new Error(`Storage ${res.status} al ${que}`), { status: res.status });
}

// La foto: { tipo, datos (Buffer) }. Lanza con `status` 404 si no existe. `max`: bytes como mucho.
export async function bajar(ruta, { max = 5 * 1024 * 1024, plazo = 8000 } = {}) {
	const res = await revisar(await fetch(`${objeto(ruta)}?alt=media`, { headers: await conLlave(false), signal: AbortSignal.timeout(plazo) }), 'bajar');
	const datos = Buffer.from(await res.arrayBuffer());
	if (datos.length > max) throw new Error('Storage: foto demasiado grande');
	return { tipo: String(res.headers.get('content-type') || '').split(';')[0].trim(), datos };
}

// Los archivos de una carpeta (`prefijo` con «/» al final): [{ ruta, tipo, llave }]. `llave`: el token de descarga de
// Firebase (la dirección con `token=` abre el archivo sin pasar por las reglas).
export async function listar(prefijo) {
	const out = [];
	let pagina = '';
	do {
		const q = new URLSearchParams({ prefix: prefijo, maxResults: '1000', ...(pagina ? { pageToken: pagina } : {}) });
		const r = await (await revisar(await fetch(`${API}?${q}`, { headers: await conLlave(true) }), 'listar')).json();
		for (const o of r.items || []) out.push({ ruta: o.name, tipo: o.contentType || '', llave: o.metadata?.firebaseStorageDownloadTokens || '' });
		pagina = r.nextPageToken || '';
	} while (pagina);
	return out;
}

// Copia un archivo a otra ruta (bajar y volver a subir: lo mismo en el emulador y en producción). Sin token de descarga:
// la copia solo se abre con la cuenta de servicio (/api/foto).
export async function copiar(de, a) {
	const res = await revisar(await fetch(`${objeto(de)}?alt=media`, { headers: await conLlave(true) }), 'copiar');
	const tipo = String(res.headers.get('content-type') || 'application/octet-stream').split(';')[0];
	await revisar(await fetch(`${SUBIR}?uploadType=media&name=${encodeURIComponent(a)}`, { method: 'POST', headers: { ...(await conLlave(true)), 'Content-Type': tipo }, body: Buffer.from(await res.arrayBuffer()) }), 'copiar');
}

// Borra un archivo (si ya no existe, nada).
export async function borrar(ruta) {
	const res = await fetch(objeto(ruta), { method: 'DELETE', headers: await conLlave(true) });
	if (!res.ok && res.status !== 404) await revisar(res, 'borrar');
}

// Quita el token de descarga: la dirección con `token=` deja de abrir el archivo (solo queda la cuenta de servicio,
// /api/foto). Se vuelve a escribir el mismo archivo por la API de Cloud Storage, que no le pone token (cambiar sus datos no
// sirve: el emulador solo agrega tokens). Sin token, no hace falta (se puede repetir).
export const quitarLlave = (ruta) => copiar(ruta, ruta);
