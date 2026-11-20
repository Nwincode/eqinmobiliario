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
