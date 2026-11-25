// netlify/lib/firestore-escritura.mjs simulado (scripts/simulado/cargador.mjs): todo se escribe junto al terminar.
import { S, leer, hijos, escribir } from './base.mjs';
export const escrituraConfigurada = () => true;
export const idNuevo = () => `id${String(++S.ids).padStart(6, '0')}`;
export async function transaccion(trabajo) {
	if (S.escrituraFalla) throw new Error('Error 503 al escribir');
	const ops = [];
	const r = await trabajo({
		leer: async (ruta) => leer(ruta),
		consultar: async (col, campo, valor, padre = '') => hijos(padre ? `${padre}/${col}` : col).filter((d) => d[campo] === valor),
		crear: (ruta, datos, t) => ops.push([ruta, datos, t, true]),
		cambiar: (ruta, datos, t) => ops.push([ruta, datos, t, false]),
		// «crudo»: el documento tal cual (aquí, el objeto guardado).
		leerCrudo: async (ruta) => (S.docs.has(ruta) ? { id: ruta.split('/').pop(), crudo: structuredClone(S.docs.get(ruta)) } : null),
		listarCrudo: async (padre, col) => hijos(`${padre}/${col}`).map(({ id }) => ({ id, crudo: structuredClone(S.docs.get(`${padre}/${col}/${id}`)) })),
		crearCrudo: (ruta, crudo, cambios = {}) => ops.push([ruta, { ...crudo, ...cambios }, undefined, true]),
		borrar: (ruta) => ops.push([ruta, null, undefined, 'borrar'])
	});
	for (const [ruta, datos, t, crear] of ops) { if (crear === 'borrar') S.docs.delete(ruta); else escribir(ruta, datos, t, crear); }
	return r;
}
export const probarEscritura = async () => true;
// Como el real: suma a cada `ruta`.n (y crea `marca` si no existe; si ya existía, no suma y devuelve null).
export async function sumar(sumas, vence, marca = '') {
	if (S.escrituraFalla) throw new Error('Error 503 al escribir');
	if (marca) { if (S.docs.has(marca)) return null; S.docs.set(marca, { vence }); }
	return sumas.map(({ ruta, n }) => { const d = S.docs.get(ruta) || {}; S.docs.set(ruta, { ...d, vence, n: (d.n || 0) + n }); return S.docs.get(ruta).n; });
}
// Mover documentos tal cual fuera de una transacción (como el real).
export const listarCrudo = async (padre, col) => hijos(`${padre}/${col}`).map(({ id }) => ({ id, crudo: structuredClone(S.docs.get(`${padre}/${col}/${id}`)) }));
export async function escribirLote(ops) {
	if (S.escrituraFalla) throw new Error('Error 503 al escribir');
	for (const o of ops) { if (o.borrar) S.docs.delete(o.borrar); else S.docs.set(o.poner, { ...structuredClone(o.crudo), ...(o.cambios || {}) }); }
}
