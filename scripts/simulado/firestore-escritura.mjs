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
		cambiar: (ruta, datos, t) => ops.push([ruta, datos, t, false])
	});
	for (const [ruta, datos, t, crear] of ops) escribir(ruta, datos, t, crear);
	return r;
}
export const probarEscritura = async () => true;
// Como el real: suma 1 a `ruta`.n (y crea `marca` si no existe; si ya existía, no suma y devuelve null).
export async function sumarUno(ruta, vence, marca = '') {
	if (S.escrituraFalla) throw new Error('Error 503 al escribir');
	if (marca) { if (S.docs.has(marca)) return null; S.docs.set(marca, { vence }); }
	const d = S.docs.get(ruta) || {};
	S.docs.set(ruta, { ...d, vence, n: (d.n || 0) + 1 });
	return S.docs.get(ruta).n;
}
