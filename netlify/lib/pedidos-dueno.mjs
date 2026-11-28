// Las carpetas de fotos de los pedidos del dueño («Pedir un cambio» de su casa en venta o renta, admin/js/pedido-dueno.js).
// El servidor aparta cada una (pedidosDueno/{id}: de quién, de qué casa y cuándo; /api/pedido-dueno), y storage.rules
// deja subir ahí hasta 6 fotos, y quitarlas, solo mientras esté vigente (VIGENCIA) y el pedido no se haya enviado
// (comentariosPropietarios/{id}, el mismo id). Cada hora (netlify/functions/comisiones-vencidas.mjs) se barren las
// vencidas: sin pedido, con todas sus fotos; con pedido, solo las fotos que el pedido no lleva (las que quitó antes de
// enviarlo) y el apartado.
import { transaccion } from './firestore-escritura.mjs';
import { listar } from './firestore.mjs';
import { listar as listarFotos, borrar as borrarFoto } from './storage.mjs';
import { fecha } from './casas-nuevas.mjs';

export const VIGENCIA = 86400_000;
// Pedidos abiertos a la vez por dueño (cada uno con su carpeta de 6 fotos a lo más).
export const MAX_ABIERTOS = 5;
export const vigente = (x, ahora = Date.now()) => ahora - fecha(x?.cuando) < VIGENCIA;
const GRACIA = 2 * 3600_000;

export async function barrerPedidosDueno(ahora = Date.now()) {
	let n = 0;
	for (const x of await listar('pedidosDueno')) {
		if (ahora - fecha(x.cuando) < VIGENCIA + GRACIA) continue;
		const pedido = await transaccion(async ({ leer }) => leer(`comentariosPropietarios/${x.id}`));
		const lleva = new Set(Array.isArray(pedido?.fotos) ? pedido.fotos : []);
		for (const f of await listarFotos(`pedidosDueno/${x.casa}/${x.id}/`)) if (!lleva.has(f.ruta)) await borrarFoto(f.ruta);
		await transaccion(async ({ borrar }) => { borrar(`pedidosDueno/${x.id}`); });
		n++;
	}
	return n;
}
