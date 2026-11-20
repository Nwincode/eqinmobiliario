// Cargador de Node para probar las funciones de Netlify sin red ni base: cambia las piezas de netlify/lib que hablan con
// afuera (Firestore, sesión, correo, resumen) por las de esta carpeta, que guardan todo en memoria (base.mjs).
// Se activa con simulado/activar.mjs antes de importar la función (scripts/test-funciones.mjs).
const AQUI = new URL('./', import.meta.url).href;
const RAIZ = new URL('../../', import.meta.url).href;
const CAMBIOS = {
	'netlify/lib/firestore.mjs': 'firestore.mjs',
	'netlify/lib/firestore-escritura.mjs': 'firestore-escritura.mjs',
	'netlify/lib/auth.mjs': 'auth.mjs',
	'netlify/lib/correo.mjs': 'correo.mjs',
	'netlify/lib/resumen.mjs': 'resumen.mjs'
};
export async function resolve(especificador, contexto, siguiente) {
	const r = await siguiente(especificador, contexto);
	const ruta = r.url.startsWith(RAIZ) ? r.url.slice(RAIZ.length) : '';
	return CAMBIOS[ruta] && !contexto.parentURL?.startsWith(AQUI) ? { ...r, url: AQUI + CAMBIOS[ruta] } : r;
}
