// La carpeta de fotos de un pedido del dueño («Pedir un cambio» de su casa en venta o renta, admin/js/pedido-dueno.js),
// apartada por el servidor con la cuenta de escritura (pedidosDueno/{id}: propietarioId, uid, casa, cuando).
//   Authorization: Bearer <token de Firebase del socio>
//   POST /api/pedido-dueno { casa }  → { id, fotos }: el id del pedido (comentariosPropietarios/{id}) y de su carpeta
//        (pedidosDueno/{casa}/{id}/1…6). Si ya tiene uno sin enviar de esa casa al que le quedan al menos REUSO horas, se
//        le devuelve ese con las fotos que ya tiene (`fotos`: sus rutas; la ventana las vuelve a mostrar y las puede
//        quitar); si le queda menos, uno nuevo (el viejo vence y lo barre el control de cada hora).
// Solo su casa (la casa dice que es suya) y que no sea por noche; a lo más MAX_ABIERTOS a la vez. storage.rules deja subir
// y quitar fotos ahí mientras esté vigente (un día) y sin enviar; lo vencido lo barre cada hora barrerPedidosDueno.
// Errores en JSON { error }: 400, 401, 403, 404, 429, 503.
import { json, socioUser } from '../lib/auth.mjs';
import { transaccion, escrituraConfigurada, idNuevo } from '../lib/firestore-escritura.mjs';
import { limitador } from '../lib/limite.mjs';
import { reusable, MAX_ABIERTOS } from '../lib/pedidos-dueno.mjs';
import { listar as listarFotos } from '../lib/storage.mjs';
import { fecha } from '../lib/casas-nuevas.mjs';

const ID = /^[A-Za-z0-9_-]{1,60}$/;
const porApartar = limitador(30);
class Respuesta extends Error { constructor(status, error) { super(error); this.status = status; } }
const falla = (status, error) => { throw new Respuesta(status, error); };

export async function apartarPedido(tx, socio, casaId) {
	const casa = await tx.leer(`properties/${casaId}`);
	if (!casa) falla(404, 'Esa casa ya no existe.');
	if (!socio.propietarioId || casa.propietarioId !== socio.propietarioId) falla(403, 'Esta casa no está a tu nombre.');
	if (casa.operacion === 'vacacional') falla(403, 'Los cambios de tu casa por noche se hacen en «La casa».');
	// Los que están por vencer no cuentan (no se vuelven a dar); los ya enviados tampoco (su carpeta ya no recibe fotos).
	const suyos = (await tx.consultar('pedidosDueno', 'propietarioId', socio.propietarioId)).filter((x) => x.uid === socio.uid && reusable(x));
	const abiertos = [];
	for (const x of suyos) if (!(await tx.leer(`comentariosPropietarios/${x.id}`))) abiertos.push(x);
	const actual = abiertos.filter((x) => x.casa === casaId).sort((a, b) => fecha(b.cuando) - fecha(a.cuando))[0];
	if (actual) return { id: actual.id, casa: casaId, sigue: true };
	if (abiertos.length >= MAX_ABIERTOS) falla(429, 'Tienes varios pedidos sin enviar: envía o cierra uno y vuelve a intentar.');
	const id = idNuevo();
	tx.crear(`pedidosDueno/${id}`, { propietarioId: socio.propietarioId, uid: socio.uid, casa: casaId }, { ahora: ['cuando'] });
	return { id, casa: casaId, sigue: false };
}

export default async (req) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!escrituraConfigurada()) return json(503, { error: 'El servidor no está configurado' });
	let socio;
	try { socio = await socioUser(req); } catch { return json(401, { error: 'Sesión inválida: vuelve a entrar.' }); }
	if (!socio) return json(403, { error: 'Sin permiso.' });
	let cuerpo;
	try { cuerpo = await req.json(); } catch { return json(400, { error: 'Solicitud inválida' }); }
	const casa = String(cuerpo?.casa || '');
	if (!ID.test(casa)) return json(400, { error: 'Solicitud inválida' });
	if (porApartar(socio.uid)) return json(429, { error: 'Demasiados intentos seguidos: espera unos minutos.' });
	try {
		const r = await transaccion((tx) => apartarPedido(tx, socio, casa));
		// Las fotos que ya subió a esa carpeta (de 1 a 6, en orden): sin ellas, no las vería ni las podría quitar.
		const fotos = r.sigue ? (await listarFotos(`pedidosDueno/${casa}/${r.id}/`)).map((f) => f.ruta)
			.filter((x) => /\/[1-6]\.(webp|jpg|png)$/.test(x)).sort() : [];
		return json(200, { ok: true, id: r.id, fotos });
	} catch (err) {
		if (err instanceof Respuesta) return json(err.status, { error: err.message });
		console.error('Pedido del dueño (apartar):', err.message);
		return json(503, { error: 'No se pudo preparar el pedido. Vuelve a intentarlo.' });
	}
};

export const config = { path: '/api/pedido-dueno' };
