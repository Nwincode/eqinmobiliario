// La carpeta de fotos de un pedido del dueño («Pedir un cambio» de su casa en venta o renta, admin/js/pedido-dueno.js),
// apartada por el servidor con la cuenta de escritura (pedidosDueno/{id}: propietarioId, uid, casa, cuando).
//   Authorization: Bearer <token de Firebase del socio>
//   POST /api/pedido-dueno { casa }  → { id }: el id del pedido (comentariosPropietarios/{id}) y de su carpeta
//        (pedidosDueno/{casa}/{id}/1…6). Si ya tiene uno vigente sin enviar de esa casa, se le devuelve ese.
// Solo su casa (la casa dice que es suya) y que no sea por noche; a lo más MAX_ABIERTOS a la vez. storage.rules deja subir
// y quitar fotos ahí mientras esté vigente (un día) y sin enviar; lo vencido lo barre cada hora barrerPedidosDueno.
// Errores en JSON { error }: 400, 401, 403, 404, 429, 503.
import { json, socioUser } from '../lib/auth.mjs';
import { transaccion, escrituraConfigurada, idNuevo } from '../lib/firestore-escritura.mjs';
import { limitador } from '../lib/limite.mjs';
import { vigente, MAX_ABIERTOS } from '../lib/pedidos-dueno.mjs';
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
	const suyos = (await tx.consultar('pedidosDueno', 'propietarioId', socio.propietarioId)).filter((x) => x.uid === socio.uid && vigente(x));
	// Los ya enviados no cuentan como abiertos (su carpeta ya no recibe fotos).
	const abiertos = [];
	for (const x of suyos) if (!(await tx.leer(`comentariosPropietarios/${x.id}`))) abiertos.push(x);
	const actual = abiertos.filter((x) => x.casa === casaId).sort((a, b) => fecha(b.cuando) - fecha(a.cuando))[0];
	if (actual) return actual.id;
	if (abiertos.length >= MAX_ABIERTOS) falla(429, 'Tienes varios pedidos sin enviar: envía o cierra uno y vuelve a intentar.');
	const id = idNuevo();
	tx.crear(`pedidosDueno/${id}`, { propietarioId: socio.propietarioId, uid: socio.uid, casa: casaId }, { ahora: ['cuando'] });
	return id;
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
		return json(200, { ok: true, id: await transaccion((tx) => apartarPedido(tx, socio, casa)) });
	} catch (err) {
		if (err instanceof Respuesta) return json(err.status, { error: err.message });
		console.error('Pedido del dueño (apartar):', err.message);
		return json(503, { error: 'No se pudo preparar el pedido. Vuelve a intentarlo.' });
	}
};

export const config = { path: '/api/pedido-dueno' };
