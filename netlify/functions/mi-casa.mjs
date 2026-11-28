// Lo que el dueño cambia él solo de su casa por noche, escrito en el servidor: POST /api/mi-casa
//   Authorization: Bearer <token de Firebase del dueño>   { casa, cambios: { campo: valor, … } }
// Se publica sin esperar al administrador: se escribe la casa (y su privado/socio o privado/llegada), la bitácora y un
// aviso en cambiosDueno/{id} con lo de antes y lo de ahora, y queda marcado «hay cambios por publicar»
// (netlify/functions/publicar-pendiente.mjs publica a los 10 minutos si la publicación automática está encendida).
// Qué puede cambiar y cómo se revisa: admin/js/mi-casa.js (lo mismo que usa la pantalla). La casa decide de quién es.
// El administrador:
//   GET  /api/mi-casa                                → { cambios: [...] } los avisos sin atender (30 días).
//   POST /api/mi-casa { accion: 'deshacer', id, campos? } → vuelve a poner lo de antes donde sigue lo del dueño.
//   POST /api/mi-casa { accion: 'listo', id }        → el aviso se va (el cambio se queda).
// Los avisos de una casa nueva que subió el socio (netlify/functions/mi-casa-nueva.mjs, `nueva: true`) salen en la misma
// lista; no se deshacen (409): se corrigen en la ficha o se elimina la casa.
// Errores en JSON { error }: 400, 401, 403 no es suya, 404, 409 (no se puede pausar con huéspedes por venir),
// 422 un dato que no va, 429 (solo lo que guarda el dueño: 40 en 10 minutos), 503 sin cuenta de escritura.
// Lo que guarda el dueño responde { ok, cambios, publicaSola } (publicaSola: el sitio se publica solo en unos 20 minutos).
import '../../js/calc-vacacional.js';
import siteConfig from '../../site.config.json' with { type: 'json' };
import { json, socioUser, staffUser } from '../lib/auth.mjs';
import { transaccion, escrituraConfigurada, idNuevo } from '../lib/firestore-escritura.mjs';
import { marcarPorPublicar } from '../lib/publicar.mjs';
import { desde } from '../lib/firestore.mjs';
import { purgarCasa } from '../lib/ocupacion.mjs';
import { limitador } from '../lib/limite.mjs';
import { revisarCambiosDueno, valoresDueno, paraDeshacer, CAMPOS_CON_INGLES } from '../../admin/js/mi-casa.js';
import { historialCon } from '../../admin/js/cambios-casa.js';
import { puede } from '../../admin/js/permisos-socio.js';

const V = globalThis.EQVacacional;
const BUCKET = siteConfig.firebase.storageBucket;
// En el entorno de pruebas local (emulador y proyecto «demo-…», que en Netlify no existen) las fotos salen del emulador.
const ORIGENES = ['https://firebasestorage.googleapis.com',
	...(process.env.FIRESTORE_EMULATOR_HOST && siteConfig.firebase.projectId.startsWith('demo-') ? ['http://127.0.0.1:9199'] : [])];
const porUsuario = limitador(40);
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const DIAS_AVISO = 30;

class Respuesta extends Error { constructor(status, error) { super(error); this.status = status; } }
const falla = (status, error) => { throw new Respuesta(status, error); };
const sinCuenta = (err) => err?.rechazo || err?.codigo === 'PERMISSION_DENIED' || err?.status === 401 || err?.status === 403;

// La casa con su privado/socio y privado/llegada, leídos en la transacción.
async function leerCasa({ leer }, id) {
	const [casa, socio, llegada] = await Promise.all([leer(`properties/${id}`), leer(`properties/${id}/privado/socio`), leer(`properties/${id}/privado/llegada`)]);
	return { casa, socio, llegada };
}

// Escribe lo revisado en cada documento (privado/… se crea si no existe).
function escribirEn(tx, id, docs, escribir, extraCasa = {}) {
	const casa = { ...escribir.casa, ...extraCasa };
	if (Object.keys(casa).length) tx.cambiar(`properties/${id}`, casa, { ahora: ['updatedAt'] });
	for (const [donde, ruta] of [['socio', 'privado/socio'], ['llegada', 'privado/llegada']]) {
		const campos = escribir[donde];
		if (!Object.keys(campos).length) continue;
		if (docs[donde]) tx.cambiar(`properties/${id}/${ruta}`, campos, { ahora: ['updatedAt'] });
		else tx.crear(`properties/${id}/${ruta}`, campos, { ahora: ['updatedAt'] });
	}
}

async function guardarDelDueno(tx, socio, id, pedido) {
	const docs = await leerCasa(tx, id);
	const { casa } = docs;
	if (!casa) falla(404, 'No encontramos esa casa.');
	if (casa.operacion !== 'vacacional' || !casa.propietarioId || casa.propietarioId !== socio.propietarioId) falla(403, 'Esta casa no es una casa por noche tuya.');
	// «La casa» apagada por el administrador o por atraso en la comisión (permisosSocios, admin/js/permisos-socio.js).
	const permisos = await tx.leer(`permisosSocios/${socio.propietarioId}`);
	if (!puede(permisos, 'casa')) falla(403, 'Por ahora no puedes cambiar «La casa»: está en pausa. Las solicitudes y el chat siguen igual.');
	// Los calendarios de otras plataformas bloquean días: van con «Bloquear fechas».
	if (!puede(permisos, 'fechas') && ['icalUrl', 'icalBooking', 'icalVrbo'].some((k) => k in pedido)) falla(403, 'Por ahora no puedes cambiar tus calendarios: bloquear fechas está en pausa.');
	const actual = valoresDueno({ casa, socio: docs.socio || {}, llegada: docs.llegada || {} });
	let r;
	try { r = revisarCambiosDueno({ casaId: id, bucket: BUCKET, actual, pedido, origenes: ORIGENES, pausaPropia: (casa.historialEstado || []).at(-1)?.porUid === socio.uid }); } catch (err) { falla(422, err.message); }
	if (!r.cambios.length) return { cambios: [] };
	// Pausar con huéspedes por venir no: la reserva ya está hecha (el administrador decide).
	const extra = {};
	if (r.escribir.casa.estado) {
		if (r.escribir.casa.estado === 'pausada') {
			const hoy = V.hoy();
			const vienen = (await tx.consultar('reservas', 'propertyId', id)).some((x) => x.estado !== 'cancelada' && String(x.salida || '') > hoy);
			if (vienen) falla(409, 'Tienes huéspedes por venir en esta casa: no se puede pausar. Bloquea los días en el calendario.');
		}
		const quien = { fecha: new Date().toISOString(), por: socio.nombre || 'Dueño', porUid: socio.uid };
		extra.historialEstado = historialCon(casa, { ...casa, estado: r.escribir.casa.estado }, quien).historialEstado;
	}
	escribirEn(tx, id, docs, r.escribir, extra);
	const lista = r.cambios.map((c) => c.etiqueta.toLowerCase()).join(', ');
	tx.crear(`properties/${id}/bitacora/${idNuevo()}`, { que: `el dueño cambió ${lista}`, quien: socio.uid, nombre: socio.nombre || '' }, { ahora: ['cuando'] });
	tx.crear(`cambiosDueno/${idNuevo()}`, {
		propertyId: id, titulo: r.escribir.casa.titulo || casa.titulo || '', propietarioId: socio.propietarioId, uid: socio.uid, nombre: socio.nombre || '',
		cambios: r.cambios, ingles: r.cambios.some((c) => CAMPOS_CON_INGLES.includes(c.campo)), estado: 'nuevo'
	}, { ahora: ['cuando'] });
	const publicaSola = await marcarPorPublicar(tx, `${casa.titulo}: el dueño cambió ${lista}`, socio.nombre || 'Dueño');
	return { cambios: r.cambios.map((c) => c.campo), publicaSola };
}

async function deshacer(tx, admin, avisoId, campos) {
	const aviso = await tx.leer(`cambiosDueno/${avisoId}`);
	if (!aviso) falla(404, 'Ese aviso ya no existe.');
	// Una casa nueva del socio (netlify/functions/mi-casa-nueva.mjs) no tiene «lo de antes»: se corrige en su ficha o se elimina.
	if (aviso.nueva) falla(409, 'Una casa nueva no se deshace: corrígela en su ficha o elimínala.');
	const id = aviso.propertyId;
	const docs = await leerCasa(tx, id);
	if (!docs.casa) falla(404, 'La casa ya no existe.');
	const actual = valoresDueno({ casa: docs.casa, socio: docs.socio || {}, llegada: docs.llegada || {} });
	const r = paraDeshacer(aviso.cambios || [], actual, campos);
	const extra = {};
	if (r.escribir.casa.estado) extra.historialEstado = historialCon(docs.casa, { ...docs.casa, estado: r.escribir.casa.estado }, { fecha: new Date().toISOString(), por: admin.nombre || 'Administrador', porUid: admin.uid }).historialEstado;
	if (r.hechos.length) {
		escribirEn(tx, id, docs, r.escribir, extra);
		tx.crear(`properties/${id}/bitacora/${idNuevo()}`, { que: `el administrador deshizo el cambio del dueño (${r.hechos.join(', ')})`, quien: admin.uid, nombre: admin.nombre || '' }, { ahora: ['cuando'] });
		await marcarPorPublicar(tx, `${docs.casa.titulo}: se deshizo un cambio del dueño`, admin.nombre || 'Administrador');
	}
	// Deshacer todo cierra el aviso; uno por uno, se cierra cuando ya no queda ninguno por deshacer.
	const deshechos = [...new Set([...(aviso.deshechos || []), ...r.hechos])];
	const cerrar = campos === null || (aviso.cambios || []).every((c) => deshechos.includes(c.campo));
	tx.cambiar(`cambiosDueno/${avisoId}`, { estado: cerrar ? 'deshecho' : 'nuevo', deshechos, por: admin.uid }, { ahora: ['atendido'] });
	return { hechos: r.hechos, saltados: r.saltados };
}

export default async (req) => {
	if (req.method !== 'GET' && req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!escrituraConfigurada()) return json(503, { error: 'El servidor no está configurado' });
	let socio = null, staff = null;
	try { [socio, staff] = await Promise.all([socioUser(req), staffUser(req)]); } catch { return json(401, { error: 'Sesión inválida: vuelve a entrar.' }); }
	const admin = staff?.admin ? staff : null;
	if (!socio && !admin) return json(403, { error: 'Sin permiso.' });

	if (req.method === 'GET') {
		if (!admin) return json(403, { error: 'Solo el administrador.' });
		try {
			const docs = await desde('cambiosDueno', 'cuando', new Date(Date.now() - DIAS_AVISO * 86400000));
			return json(200, { cambios: docs.filter((d) => d.estado === 'nuevo').map((d) => ({ ...d, cuando: d.cuando instanceof Date ? d.cuando.getTime() : null })) });
		} catch (err) {
			console.error('Mi casa (lista):', err.message);
			return json(500, { error: 'No se pudieron leer los cambios.' });
		}
	}

	let cuerpo;
	try { cuerpo = await req.json(); } catch { return json(400, { error: 'Solicitud inválida' }); }
	try {
		if (socio) {
			// El límite es para lo que guarda el dueño. El administrador (la campana, «Deshacer», «Listo») no lo gasta:
			// cada «Deshacer» vuelve a leer la campana y la pantalla, y con un solo límite la campana se quedaba sin avisos.
			if (porUsuario(socio.uid)) return json(429, { error: 'Demasiados cambios seguidos: espera unos minutos.' });
			const id = String(cuerpo?.casa || '');
			const pedido = cuerpo?.cambios;
			if (!ID.test(id) || !pedido || typeof pedido !== 'object' || Array.isArray(pedido)) return json(400, { error: 'Solicitud inválida' });
			const hecho = await transaccion((tx) => guardarDelDueno(tx, socio, id, pedido));
			// Pausar o cambiar un calendario cambia lo que responde /api/disponibilidad: su copia del CDN se borra.
			await purgarCasa(id);
			return json(200, { ok: true, ...hecho });
		}
		const avisoId = String(cuerpo?.id || '');
		if (!ID.test(avisoId)) return json(400, { error: 'Solicitud inválida' });
		if (cuerpo.accion === 'listo') {
			await transaccion(async (tx) => {
				if (!(await tx.leer(`cambiosDueno/${avisoId}`))) falla(404, 'Ese aviso ya no existe.');
				tx.cambiar(`cambiosDueno/${avisoId}`, { estado: 'visto', por: admin.uid }, { ahora: ['atendido'] });
			});
			return json(200, { ok: true });
		}
		if (cuerpo.accion === 'deshacer') {
			const campos = Array.isArray(cuerpo.campos) ? cuerpo.campos.map(String).slice(0, 40) : null;
			return json(200, { ok: true, ...(await transaccion((tx) => deshacer(tx, admin, avisoId, campos))) });
		}
		return json(400, { error: 'Solicitud inválida' });
	} catch (err) {
		if (err instanceof Respuesta) return json(err.status, { error: err.message });
		if (sinCuenta(err)) { console.error('Mi casa: cuenta de escritura', err.message); return json(503, { error: 'La cuenta de escritura no funciona' }); }
		console.error('Mi casa:', err.message);
		return json(500, { error: 'No se pudo guardar. Vuelve a intentarlo.' });
	}
};

export const config = { path: '/api/mi-casa' };
