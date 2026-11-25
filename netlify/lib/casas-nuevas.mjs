// Las carpetas de fotos que el servidor le aparta al socio para su casa nueva (casasNuevas/{id}: netlify/functions/
// mi-casa-nueva.mjs). Sirven 7 días, lo mismo que storage.rules; las vencidas sin casa se barren cada hora con sus fotos.
import { listar } from './firestore.mjs';
import { transaccion } from './firestore-escritura.mjs';
import { listar as listarFotos, borrar as borrarFoto } from './storage.mjs';

export const VIGENCIA = 7 * 86400_000;
export const fecha = (d) => (d instanceof Date ? d.getTime() : Date.parse(d) || 0);
export const vigente = (x, ahora = Date.now()) => ahora - fecha(x?.cuando) < VIGENCIA;

// Cada hora (netlify/functions/comisiones-vencidas.mjs): las carpetas apartadas que vencieron sin casa se borran con sus fotos (un día de
// gracia sobre los 7, para no cruzarse con quien publica justo al final). Devuelve cuántas se barrieron.
export async function barrerCasasNuevas(ahora = Date.now()) {
	let n = 0;
	for (const x of await listar('casasNuevas')) {
		if (ahora - fecha(x.cuando) < VIGENCIA + 86400_000) continue;
		const casa = await transaccion(async ({ leer, borrar }) => {
			if (await leer(`properties/${x.id}`)) { borrar(`casasNuevas/${x.id}`); return true; }
			return false;
		});
		if (!casa) {
			for (const f of await listarFotos(`properties/${x.id}/`)) await borrarFoto(f.ruta);
			await transaccion(async ({ borrar }) => { borrar(`casasNuevas/${x.id}`); });
		}
		n++;
	}
	return n;
}

