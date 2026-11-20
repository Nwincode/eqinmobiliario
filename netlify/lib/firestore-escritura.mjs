// Escritura en Firestore desde una función de Netlify (REST, sin SDK), en una transacción: se lee lo que hace falta y
// se escribe todo junto, o nada. La usan netlify/functions/reservas.mjs (lo que el socio confirma, cancela o cobra) y
// netlify/lib/limite.mjs (`limitadorDurable`).
// Cuenta de servicio aparte, con el rol «Cloud Datastore User»: GOOGLE_SA_ESCRITURA_EMAIL y GOOGLE_SA_ESCRITURA_KEY
// (la de solo lectura, GOOGLE_SA_EMAIL, no cambia). Esta cuenta no pasa por las reglas: lo que se revisa, se revisa aquí.
import { randomBytes } from 'node:crypto';
import { googleToken, cuentaEscritura } from './google.mjs';
import { BASE, RAIZ, SCOPE_DATOS, documento } from './firestore.mjs';

export const escrituraConfigurada = () => Boolean(cuentaEscritura());

// Un valor de JavaScript como lo guarda el SDK del panel (los enteros como enteros).
export function aValor(v) {
	if (v === null || v === undefined) return { nullValue: null };
	if (typeof v === 'string') return { stringValue: v };
	if (typeof v === 'boolean') return { booleanValue: v };
	if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
	if (v instanceof Date) return { timestampValue: v.toISOString() };
	if (Array.isArray(v)) return { arrayValue: { values: v.map(aValor) } };
	return { mapValue: { fields: aCampos(v) } };
}
export const aCampos = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, aValor(v)]));

// Id al azar como los del SDK (20 letras y números).
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const idNuevo = () => [...randomBytes(20)].map((b) => LETRAS[b % LETRAS.length]).join('');

// Error de la base con su código de Google (ABORTED, ALREADY_EXISTS, PERMISSION_DENIED…).
class ErrorBase extends Error {
	constructor(status, cuerpo) { super(cuerpo?.error?.message || `Error ${status} de la base`); this.status = status; this.codigo = cuerpo?.error?.status || ''; }
}

async function pedir(token, url, cuerpo) {
	const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
	const datos = await res.json().catch(() => ({}));
	if (!res.ok) throw new ErrorBase(res.status, datos);
	return datos;
}

// Cambios que se juntan para el commit. `transforma`: la hora del servidor (`ahora`) y agregar a una lista (`agregar`).
const transformaciones = ({ ahora = [], agregar = {} } = {}) => [
	...ahora.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })),
	...Object.entries(agregar).map(([fieldPath, lista]) => ({ fieldPath, appendMissingElements: { values: lista.map(aValor) } }))
];
// Las rutas de los campos ('solicitud.estado') se arman como mapas anidados para `fields`.
function anidar(campos) {
	const out = {};
	for (const [ruta, v] of Object.entries(campos)) {
		const partes = ruta.split('.');
		let o = out;
		partes.slice(0, -1).forEach((p) => { o = o[p] ||= {}; });
		o[partes.at(-1)] = v;
	}
	return out;
}

// Una transacción: `trabajo({ leer, consultar, crear, cambiar })` lee (dentro de la transacción) y deja anotado lo que
// se escribe; al terminar se escribe todo junto. Si otro escribió lo leído mientras tanto (ABORTED), se repite.
// leer(ruta) → documento o null; consultar(coleccion, campo, valor, padre?) → documentos con campo == valor.
// crear(ruta, datos, transforma): solo si no existe; cambiar(ruta, campos, transforma): solo esos campos, si existe.
export async function transaccion(trabajo, intentos = 3) {
	const token = await googleToken(SCOPE_DATOS, cuentaEscritura());
	for (let i = 1; ; i++) {
		const { transaction } = await pedir(token, `${BASE}:beginTransaction`, { options: { readWrite: {} } });
		const writes = [];
		const leer = async (ruta) => {
			const [r] = await pedir(token, `${BASE}:batchGet`, { transaction, documents: [`${RAIZ}/${ruta}`] });
			return r?.found ? documento(r.found) : null;
		};
		const consultar = async (coleccion, campo, valor, padre = '') => (await pedir(token, `${BASE}${padre ? `/${padre}` : ''}:runQuery`, { transaction, structuredQuery: {
			from: [{ collectionId: coleccion }], where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: aValor(valor) } } } }))
			.filter((r) => r.document).map((r) => documento(r.document));
		const crear = (ruta, datos, transforma) => writes.push({ update: { name: `${RAIZ}/${ruta}`, fields: aCampos(datos) }, currentDocument: { exists: false }, updateTransforms: transformaciones(transforma) });
		const cambiar = (ruta, campos, transforma) => writes.push({ update: { name: `${RAIZ}/${ruta}`, fields: aCampos(anidar(campos)) }, updateMask: { fieldPaths: Object.keys(campos) },
			currentDocument: { exists: true }, updateTransforms: transformaciones(transforma) });
		let resultado;
		try {
			resultado = await trabajo({ leer, consultar, crear, cambiar });
			await pedir(token, `${BASE}:commit`, { transaction, writes });
			return resultado;
		} catch (err) {
			// Lo que no llegó al commit se suelta (si no, la base lo tiene bloqueado hasta que venza).
			await pedir(token, `${BASE}:rollback`, { transaction }).catch(() => {});
			if (err instanceof ErrorBase && err.codigo === 'ABORTED' && i < intentos) continue;
			throw err;
		}
	}
}

// Prueba de la cuenta de escritura (el indicador de Solicitudes): escribe la hora en un documento que solo ella toca
// (meta/servidorReservas: las reglas no dejan a nadie del panel). Lanza el error si Google o la base la rechazan.
export const probarEscritura = () => transaccion(async ({ crear, leer, cambiar }) => {
	const ruta = 'meta/servidorReservas';
	if (await leer(ruta)) cambiar(ruta, { probado: true }, { ahora: ['cuando'] });
	else crear(ruta, { probado: true }, { ahora: ['cuando'] });
});

// «Hay cambios sin publicar» (meta/publish), dentro de una transacción: lo que la publicación automática
// (netlify/functions/publicar-pendiente.mjs) publica cuando nadie cambió nada en 12 minutos. Lo usan mi-casa.mjs y
// las fechas de una casa que cambia el servidor (reservas-servidor.mjs fechasDeLaCasa).
export async function marcarPorPublicar(tx, desc, por) {
	const datos = { pendiente: true, ultimoCambioDesc: String(desc).slice(0, 200), ultimoCambioPor: por };
	if (await tx.leer('meta/publish')) tx.cambiar('meta/publish', datos, { ahora: ['ultimoCambio'] });
	else tx.crear('meta/publish', datos, { ahora: ['ultimoCambio'] });
}
