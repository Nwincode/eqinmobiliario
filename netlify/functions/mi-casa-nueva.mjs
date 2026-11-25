// La casa nueva que el socio (propietario o colaborador) sube él solo desde «Mis propiedades», escrita en el servidor con
// la cuenta de escritura (las reglas no le dejan crear `properties`). Se publica al momento, sin aprobación; el equipo la
// ve después en «Cambios de los dueños» y en la campana (cambiosDueno/{id} con `nueva: true`).
//   Authorization: Bearer <token de Firebase del socio>
//   POST /api/mi-casa-nueva { accion: 'apartar' }       → { id } la carpeta de fotos de su casa nueva (casasNuevas/{id}):
//        storage.rules deja al socio subir fotos solo ahí, antes de que la casa exista. Si ya tiene una apartada de los
//        últimos días, se le devuelve esa (las fotos que subió no quedan sueltas en otra carpeta).
//   POST /api/mi-casa-nueva { casa: id, datos }        → la revisa (admin/js/casa-nueva.js, lo mismo que la ficha) y la
//        crea con su privado, la pone en la lista del dueño, deja su renglón en la bitácora de la casa, el aviso para el
//        equipo y «hay cambios por publicar» (meta/publish). Responde { ok, id, publicaSola }.
// Lo que pone el servidor: dueño (el socio), asesor (el que elige el colaborador, el que atiende al dueño o ninguno si es
// por noche), publicada y disponible, URL única, código del equipo y margen de siempre.
// Errores en JSON { error }: 400, 401, 403 (sin permiso «Ingresar inmuebles», o la carpeta es de otro socio), 409 (esa casa
// ya existe), 422 (lo que falta o no va, todo junto, con `errores` por campo), 429 (límite), 503 sin cuenta de escritura.
import '../../js/calc-vacacional.js';
import siteConfig from '../../site.config.json' with { type: 'json' };
import { json, socioUser } from '../lib/auth.mjs';
import { transaccion, escrituraConfigurada, idNuevo } from '../lib/firestore-escritura.mjs';
import { marcarPorPublicar } from '../lib/publicar.mjs';
import { listar } from '../lib/firestore.mjs';
import { limitador, limitadorDurable } from '../lib/limite.mjs';
import { revisarCasaNueva, armarCasaNueva } from '../../admin/js/casa-nueva.js';
import { casaQueNace } from '../../admin/js/cambios-casa.js';
import { generarCodigo } from '../../admin/js/importar.js';
import { slugLibre } from '../../admin/js/formato.js';
import { puede } from '../../admin/js/permisos-socio.js';

const BUCKET = siteConfig.firebase.storageBucket;
// En el entorno de pruebas local (emulador y proyecto «demo-…», que en Netlify no existen) las fotos salen del emulador.
const ORIGENES = ['https://firebasestorage.googleapis.com',
	...(process.env.FIRESTORE_EMULATOR_HOST && siteConfig.firebase.projectId.startsWith('demo-') ? ['http://127.0.0.1:9199'] : [])];
const ID = /^[A-Za-z0-9_-]{1,60}$/;
// Apartar una carpeta: 30 en 10 minutos (en memoria). Crear casas: 10 al día por socio (en la base: lo comparten todas
// las instancias), contado en la misma transacción que la crea (si se rechaza, no cuenta).
const porApartar = limitador(30);
const porCrear = limitadorDurable('casaNueva', 10, 24 * 3600_000);
// Una carpeta apartada sirve 7 días; después se aparta otra.
const VIGENCIA = 7 * 86400_000;
const OPERACION = { venta: 'en venta', renta: 'en renta', vacacional: 'por noche' };

class Respuesta extends Error { constructor(status, error, extra = {}) { super(error); this.status = status; this.extra = extra; } }
const falla = (status, error, extra) => { throw new Respuesta(status, error, extra); };
const sinCuenta = (err) => err?.rechazo || err?.codigo === 'PERMISSION_DENIED' || err?.status === 401 || err?.status === 403;
const SIN_PERMISO = 'Por ahora no puedes ingresar inmuebles: está en pausa. Escríbenos y lo vemos. Las solicitudes y el chat siguen igual.';
const fecha = (d) => (d instanceof Date ? d.getTime() : Date.parse(d) || 0);

// «Ingresar inmuebles»: lo que resulta para él (permisosSocios, con el corte por atraso) y, por si todavía no se calculó
// (quien no tiene casas por noche no tiene ese documento), lo apagado para todos y lo apagado solo para él.
async function puedeIngresar(tx, propietarioId, dueno) {
	const [resultado, global] = await Promise.all([tx.leer(`permisosSocios/${propietarioId}`), tx.leer('settings/permisosSocios')]);
	return puede(resultado, 'inmuebles') && puede(global, 'inmuebles') && puede(dueno?.permisos, 'inmuebles');
}

async function apartar(tx, socio) {
	if (!(await puedeIngresar(tx, socio.propietarioId, await tx.leer(`propietarios/${socio.propietarioId}`)))) falla(403, SIN_PERMISO);
	const ahora = Date.now();
	const suyas = (await tx.consultar('casasNuevas', 'propietarioId', socio.propietarioId)).filter((x) => x.uid === socio.uid);
	const vigente = suyas.filter((x) => ahora - fecha(x.cuando) < VIGENCIA).sort((a, b) => fecha(b.cuando) - fecha(a.cuando))[0];
	if (vigente) return vigente.id;
	// Las vencidas se van (su carpeta queda sin uso).
	for (const x of suyas) tx.borrar(`casasNuevas/${x.id}`);
	const id = idNuevo();
	tx.crear(`casasNuevas/${id}`, { propietarioId: socio.propietarioId, uid: socio.uid }, { ahora: ['cuando'] });
	return id;
}

async function crear(tx, socio, id, datos, { slugs, codigos }) {
	if (await porCrear.enTransaccion(tx, socio.uid)) falla(429, 'Ya subiste muchas casas hoy: sigue mañana o escríbenos.');
	const [apartada, existe, dueno] = await Promise.all([tx.leer(`casasNuevas/${id}`), tx.leer(`properties/${id}`), tx.leer(`propietarios/${socio.propietarioId}`)]);
	if (existe) falla(409, 'Esa casa ya está publicada.');
	if (!apartada || apartada.propietarioId !== socio.propietarioId) falla(403, 'Esta casa nueva no es tuya: vuelve a abrir «Agregar casa».');
	if (!(await puedeIngresar(tx, socio.propietarioId, dueno))) falla(403, SIN_PERMISO);
	if (!dueno) falla(403, 'Tu ficha no está lista: escríbele al equipo.');
	const activos = await tx.consultar('agents', 'activo', true);
	const agentes = activos.map((a) => a.id);
	const r = revisarCasaNueva({ datos, casaId: id, bucket: BUCKET, origenes: ORIGENES, dueno, agentes });
	if (r.errores.length) falla(422, r.errores.length === 1 ? r.errores[0].msg : `Revisa ${r.errores.length} datos: ${r.errores.map((e) => e.msg).join(' ')}`, { errores: r.errores });
	const quien = { fecha: new Date(), por: socio.nombre || 'Dueño', porUid: socio.uid };
	const listos = armarCasaNueva(r, {
		propietarioId: socio.propietarioId,
		slug: slugLibre(r.casa.titulo, slugs),
		codigo: generarCodigo(r.casa, { agentes: activos, codigos }),
		createdBy: socio.uid, updatedBy: socio.uid
	});
	const casa = casaQueNace(listos.casa, quien);
	const ahora = ['createdAt', 'updatedAt', 'estadoFecha'];
	tx.crear(`properties/${id}`, casa, { ahora });
	const sello = { updatedBy: socio.uid };
	if (listos.socio) tx.crear(`properties/${id}/privado/socio`, { ...listos.socio, ...sello }, { ahora: ['updatedAt'] });
	if (listos.llegada) tx.crear(`properties/${id}/privado/llegada`, { direccion: listos.llegada.direccion || '', mapa: listos.llegada.mapa || '', ...sello }, { ahora: ['updatedAt'] });
	// En la lista de casas de su dueño (como asignarDueno); con una casa por noche, `porNoche` (Solicitudes y el corte).
	const lista = (dueno.propiedades || []).filter((x) => x?.propertyId && x.propertyId !== id).map((x) => ({ propertyId: x.propertyId }));
	tx.cambiar(`propietarios/${socio.propietarioId}`, { propiedades: [...lista, { propertyId: id }], porNoche: Boolean(dueno.porNoche) || casa.operacion === 'vacacional' });
	tx.crear(`properties/${id}/bitacora/${idNuevo()}`, { que: `el dueño subió la casa (${OPERACION[casa.operacion]})`, quien: socio.uid, nombre: socio.nombre || '' }, { ahora: ['cuando'] });
	tx.crear(`cambiosDueno/${idNuevo()}`, {
		propertyId: id, titulo: casa.titulo, propietarioId: socio.propietarioId, uid: socio.uid, nombre: socio.nombre || '',
		nueva: true, operacion: casa.operacion, fotos: casa.fotos.slice(0, 6).map((f) => ({ url: f.url, path: f.path })), cambios: [], ingles: true, estado: 'nuevo'
	}, { ahora: ['cuando'] });
	tx.borrar(`casasNuevas/${id}`);
	const publicaSola = await marcarPorPublicar(tx, `${casa.titulo}: el dueño subió una casa nueva`, socio.nombre || 'Dueño');
	return { id, publicaSola };
}

export default async (req) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!escrituraConfigurada()) return json(503, { error: 'El servidor no está configurado' });
	let socio;
	try { socio = await socioUser(req); } catch { return json(401, { error: 'Sesión inválida: vuelve a entrar.' }); }
	if (!socio) return json(403, { error: 'Sin permiso.' });
	let cuerpo;
	try { cuerpo = await req.json(); } catch { return json(400, { error: 'Solicitud inválida' }); }
	try {
		if (cuerpo?.accion === 'apartar') {
			if (porApartar(socio.uid)) return json(429, { error: 'Demasiados intentos seguidos: espera unos minutos.' });
			return json(200, { ok: true, id: await transaccion((tx) => apartar(tx, socio)) });
		}
		const id = String(cuerpo?.casa || '');
		const datos = cuerpo?.datos;
		if (!ID.test(id) || !datos || typeof datos !== 'object' || Array.isArray(datos)) return json(400, { error: 'Solicitud inválida' });
		// URL y código únicos entre todas las casas (con la cuenta de lectura, antes de la transacción).
		const todas = await listar('properties');
		const usados = { slugs: new Set(todas.map((p) => p.slug).filter(Boolean)), codigos: todas.map((p) => p.codigo).filter(Boolean) };
		const hecho = await transaccion((tx) => crear(tx, socio, id, datos, { slugs: new Set(usados.slugs), codigos: usados.codigos }));
		return json(200, { ok: true, ...hecho });
	} catch (err) {
		if (err instanceof Respuesta) return json(err.status, { error: err.message, ...err.extra });
		if (sinCuenta(err)) { console.error('Casa nueva: cuenta de escritura', err.message); return json(503, { error: 'La cuenta de escritura no funciona' }); }
		console.error('Casa nueva:', err.message);
		return json(500, { error: 'No se pudo publicar. Vuelve a intentarlo.' });
	}
};

export const config = { path: '/api/mi-casa-nueva' };
