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

// `plazo`: hasta qué hora (ms) se espera la respuesta; pasada, DEADLINE_EXCEEDED (la función no se queda colgada).
async function pedir(token, url, cuerpo, plazo = 0) {
	const espera = plazo ? Math.max(300, plazo - Date.now()) : 0;
	let res;
	try {
		res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
			...(espera ? { signal: AbortSignal.timeout(espera) } : {}) });
	} catch (err) {
		if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new ErrorBase(504, { error: { status: 'DEADLINE_EXCEEDED', message: 'La base no respondió a tiempo' } });
		throw err;
	}
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
// se escribe; al terminar se escribe todo junto. Si otro escribió lo leído mientras tanto (ABORTED), se repite (hasta 5),
// pero todo junto no pasa de `plazoMs` (7 s): una función de Netlify se corta a los 10 s, y es mejor responder «vuelve a
// intentarlo» (DEADLINE_EXCEEDED o el ABORTED) que quedarse sin respuesta.
// leer(ruta) → documento o null; consultar(coleccion, campo, valor, padre?) → documentos con campo == valor.
// crear(ruta, datos, transforma): solo si no existe; cambiar(ruta, campos, transforma): solo esos campos, si existe.
export async function transaccion(trabajo, intentos = 5, plazoMs = 7000) {
	const hasta = Date.now() + plazoMs;
	const token = await googleToken(SCOPE_DATOS, cuentaEscritura());
	for (let i = 1; ; i++) {
		const { transaction } = await pedir(token, `${BASE}:beginTransaction`, { options: { readWrite: {} } }, hasta);
		const writes = [];
		const leer = async (ruta) => {
			const [r] = await pedir(token, `${BASE}:batchGet`, { transaction, documents: [`${RAIZ}/${ruta}`] }, hasta);
			return r?.found ? documento(r.found) : null;
		};
		const consultar = async (coleccion, campo, valor, padre = '') => (await pedir(token, `${BASE}${padre ? `/${padre}` : ''}:runQuery`, { transaction, structuredQuery: {
			from: [{ collectionId: coleccion }], where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: aValor(valor) } } } }, hasta))
			.filter((r) => r.document).map((r) => documento(r.document));
		const crear = (ruta, datos, transforma) => writes.push({ update: { name: `${RAIZ}/${ruta}`, fields: aCampos(datos) }, currentDocument: { exists: false }, updateTransforms: transformaciones(transforma) });
		const cambiar = (ruta, campos, transforma) => writes.push({ update: { name: `${RAIZ}/${ruta}`, fields: aCampos(anidar(campos)) }, updateMask: { fieldPaths: Object.keys(campos) },
			currentDocument: { exists: true }, updateTransforms: transformaciones(transforma) });
		// Para mover documentos tal cual (el enlace nuevo de un chat: netlify/lib/rotar-enlace.mjs): leer los campos como
		// los guarda la base (`crudo`, sin pasar por JavaScript: ni un tipo cambia), los de una subcolección entera, crear
		// con ellos y borrar.
		const leerCrudo = async (ruta) => { const [r] = await pedir(token, `${BASE}:batchGet`, { transaction, documents: [`${RAIZ}/${ruta}`] }, hasta); return r?.found ? { id: ruta.split('/').pop(), crudo: r.found.fields || {} } : null; };
		const listarCrudo = async (padre, coleccion) => (await pedir(token, `${BASE}/${padre}:runQuery`, { transaction, structuredQuery: { from: [{ collectionId: coleccion }] } }, hasta))
			.filter((r) => r.document).map((r) => ({ id: r.document.name.split('/').pop(), crudo: r.document.fields || {} }));
		const crearCrudo = (ruta, crudo, cambios = {}) => writes.push({ update: { name: `${RAIZ}/${ruta}`, fields: { ...crudo, ...aCampos(cambios) } }, currentDocument: { exists: false } });
		const borrar = (ruta) => writes.push({ delete: `${RAIZ}/${ruta}` });
		let resultado, enCommit = false;
		try {
			resultado = await trabajo({ leer, consultar, crear, cambiar, leerCrudo, listarCrudo, crearCrudo, borrar });
			enCommit = true;
			await pedir(token, `${BASE}:commit`, { transaction, writes }, hasta);
			return resultado;
		} catch (err) {
			// El commit pudo llegar aunque su respuesta no (se cortó el plazo o la red): si todo lo que esta transacción crea
			// ya existe, quedó escrito, y quien llama sigue (correos, cierre de las cruzadas, purga) en vez de decir «error».
			if (enCommit && (!(err instanceof ErrorBase) || err.codigo === 'DEADLINE_EXCEEDED') && await quedoEscrito(token, writes)) return resultado;
			// Lo que no llegó al commit se suelta (si no, la base lo tiene bloqueado hasta que venza).
			await pedir(token, `${BASE}:rollback`, { transaction }, Date.now() + 1000).catch(() => {});
			// Con una espera al azar que crece: muchos a la vez sobre el mismo documento (un límite, una casa) no vuelven a
			// chocar todos juntos.
			const pausa = Math.random() * 300 * i;
			if (err instanceof ErrorBase && err.codigo === 'ABORTED' && i < intentos && Date.now() + pausa + 500 < hasta) { await new Promise((r) => setTimeout(r, pausa)); continue; }
			throw err;
		}
	}
}

// ¿Quedó escrito un commit cuya respuesta se perdió? Solo se puede saber si crea documentos: todos existen ahora y con
// lo que este commit escribió en ellos (campo por campo; otro pudo crear el mismo id con otra cosa: eso es un error real).
// Sin documentos nuevos, no se adivina (se responde el error).
const mismoValor = (a, b) => {
	if (!a || !b) return false;
	if ('timestampValue' in a) return Date.parse(a.timestampValue) === Date.parse(b.timestampValue);
	if ('integerValue' in a || 'doubleValue' in a) return Number(a.integerValue ?? a.doubleValue) === Number(b.integerValue ?? b.doubleValue);
	if ('mapValue' in a) return mismosCampos(a.mapValue.fields || {}, b.mapValue?.fields || {});
	if ('arrayValue' in a) { const x = a.arrayValue.values || [], y = b.arrayValue?.values || []; return x.length === y.length && x.every((v, i) => mismoValor(v, y[i])); }
	return JSON.stringify(a) === JSON.stringify(b);
};
const mismosCampos = (escritos, guardados) => Object.keys(escritos).every((k) => mismoValor(escritos[k], guardados[k]));
async function quedoEscrito(token, writes) {
	const nuevos = writes.filter((w) => w.update && w.currentDocument?.exists === false).map((w) => w.update);
	if (!nuevos.length) return false;
	try {
		const r = await pedir(token, `${BASE}:batchGet`, { documents: nuevos.map((d) => d.name) }, Date.now() + 1500);
		const porNombre = Object.fromEntries(r.filter((x) => x.found).map((x) => [x.found.name, x.found.fields || {}]));
		return nuevos.every((d) => porNombre[d.name] && mismosCampos(d.fields || {}, porNombre[d.name]));
	} catch { return false; }
}

// Mover muchos documentos tal cual, fuera de una transacción (el cambio de enlace: netlify/lib/rotar-enlace.mjs).
// listarCrudo(padre, coleccion): todos, con sus campos como los guarda la base. escribirLote(ops): de 400 en 400 commits;
// ops = [{ poner: ruta, crudo, cambios }] (crea o reemplaza: repetirlo da lo mismo) o [{ borrar: ruta }].
export async function listarCrudo(padre, coleccion) {
	const token = await googleToken(SCOPE_DATOS, cuentaEscritura());
	return (await pedir(token, `${BASE}/${padre}:runQuery`, { structuredQuery: { from: [{ collectionId: coleccion }] } }, Date.now() + 5000))
		.filter((r) => r.document).map((r) => ({ id: r.document.name.split('/').pop(), crudo: r.document.fields || {} }));
}
export async function escribirLote(ops) {
	const token = await googleToken(SCOPE_DATOS, cuentaEscritura());
	for (let i = 0; i < ops.length; i += 400) {
		const writes = ops.slice(i, i + 400).map((o) => (o.borrar ? { delete: `${RAIZ}/${o.borrar}` } : { update: { name: `${RAIZ}/${o.poner}`, fields: { ...o.crudo, ...aCampos(o.cambios || {}) } } }));
		await pedir(token, `${BASE}:commit`, { writes }, Date.now() + 5000);
	}
}

// Contar sin transacción: un solo commit (no choca con otros a la vez) que suma a cada contador de `sumas` ({ ruta, n };
// n = 0 solo lee) y deja su `vence` (fecha: la política de vida de Firestore borra el documento después); con `marca`,
// también crea ese documento solo si no existe (contar cosas distintas: si ya existía, no se suma nada y devuelve null).
// Devuelve los valores después de sumar, en el orden de `sumas`. Si la base falla, lanza.
export async function sumar(sumas, vence, marca = '') {
	const token = await googleToken(SCOPE_DATOS, cuentaEscritura());
	const writes = [
		...(marca ? [{ update: { name: `${RAIZ}/${marca}`, fields: aCampos({ vence }) }, currentDocument: { exists: false } }] : []),
		...sumas.map(({ ruta, n }) => ({ update: { name: `${RAIZ}/${ruta}`, fields: aCampos({ vence }) }, updateMask: { fieldPaths: ['vence'] }, updateTransforms: [{ fieldPath: 'n', increment: { integerValue: String(n) } }] }))
	];
	try {
		const r = await pedir(token, `${BASE}:commit`, { writes }, Date.now() + 3000);
		return (r.writeResults || []).slice(marca ? 1 : 0).map((w) => { const t = w.transformResults?.[0]; return Number(t?.integerValue ?? t?.doubleValue ?? 0); });
	} catch (err) {
		if (marca && err instanceof ErrorBase && err.codigo === 'ALREADY_EXISTS') return null;
		throw err;
	}
}

// Prueba de la cuenta de escritura (el indicador de Solicitudes): escribe la hora en un documento que solo ella toca
// (meta/servidorReservas: las reglas no dejan a nadie del panel). Lanza el error si Google o la base la rechazan.
export const probarEscritura = () => transaccion(async ({ crear, leer, cambiar }) => {
	const ruta = 'meta/servidorReservas';
	if (await leer(ruta)) cambiar(ruta, { probado: true }, { ahora: ['cuando'] });
	else crear(ruta, { probado: true }, { ahora: ['cuando'] });
});

