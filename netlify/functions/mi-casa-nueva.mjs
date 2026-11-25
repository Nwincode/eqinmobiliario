// La casa nueva que el socio (propietario o colaborador) sube él solo desde «Mis propiedades», escrita en el servidor con
// la cuenta de escritura (las reglas no le dejan crear `properties`). Se publica al momento, sin aprobación; el equipo la
// ve después en «Cambios de los dueños» y en la campana (cambiosDueno/{id} con `nueva: true`).
//   Authorization: Bearer <token de Firebase del socio>
//   POST /api/mi-casa-nueva { accion: 'apartar' }       → { id } la carpeta de fotos de su casa nueva (casasNuevas/{id}, netlify/lib/casas-nuevas.mjs):
//        storage.rules deja al socio subir ahí, antes de que la casa exista, hasta 40 fotos (1 a 40), mientras la carpeta
//        esté vigente (7 días) y tenga «Ingresar inmuebles». Si ya tiene una vigente, se le devuelve esa. Las vencidas sin
//        casa las barre el control de cada hora (barrerCasasNuevas, en comisiones-vencidas.mjs), con sus fotos.
//   POST /api/mi-casa-nueva { casa: id, datos }        → la revisa (admin/js/casa-nueva.js, lo mismo que la ficha) y la
//        crea con su privado, la pone en la lista del dueño, deja su renglón en la bitácora de la casa, el aviso para el
//        equipo y «hay cambios por publicar» (meta/publish). Responde { ok, id, publicaSola }.
// Orden de lo que se revisa (lo barato primero): límite de intentos por socio → carpeta suya, casa que no existe, permiso y
// datos (una transacción que solo lee) → que cada foto exista en su carpeta → recién entonces se leen todas las casas (para
// el código) y se crea, con la URL y el código apartados en la misma transacción (urlsCasas/{url}, codigosCasas/{código}:
// dos casas a la vez no se quedan con la misma URL).
// Lo que pone el servidor: dueño (el socio), asesor (el que elige el colaborador, el que atiende al dueño o ninguno si es
// por noche), publicada y disponible, URL única, código del equipo y margen de siempre.
// Errores en JSON { error }: 400, 401, 403 (sin permiso «Ingresar inmuebles», o la carpeta es de otro socio o venció), 409
// (esa casa ya existe), 422 (lo que falta o no va, todo junto, con `errores` por campo), 429 (límite), 503.
import '../../js/calc-vacacional.js';
import siteConfig from '../../site.config.json' with { type: 'json' };
import { json, socioUser } from '../lib/auth.mjs';
import { transaccion, escrituraConfigurada, idNuevo } from '../lib/firestore-escritura.mjs';
import { marcarPorPublicar } from '../lib/publicar.mjs';
import { listar } from '../lib/firestore.mjs';
import { listar as listarFotos } from '../lib/storage.mjs';
import { vigente, fecha } from '../lib/casas-nuevas.mjs';
import { limitador, limitadorDurable } from '../lib/limite.mjs';
import { revisarCasaNueva, armarCasaNueva } from '../../admin/js/casa-nueva.js';
import { casaQueNace } from '../../admin/js/cambios-casa.js';
import { generarCodigo } from '../../admin/js/importar.js';
import { slugify } from '../../admin/js/formato.js';
import { puede } from '../../admin/js/permisos-socio.js';

const BUCKET = siteConfig.firebase.storageBucket;
// En el entorno de pruebas local (emulador y proyecto «demo-…», que en Netlify no existen) las fotos salen del emulador.
const ORIGENES = ['https://firebasestorage.googleapis.com',
	...(process.env.FIRESTORE_EMULATOR_HOST && siteConfig.firebase.projectId.startsWith('demo-') ? ['http://127.0.0.1:9199'] : [])];
const ID = /^[A-Za-z0-9_-]{1,60}$/;
// Apartar una carpeta: 30 en 10 minutos. Publicar: 20 intentos en 10 minutos (en memoria) y 60 por hora (en la base),
// también los que no pasan la revisión, antes de leer nada. Crear casas: 10 al día por socio, contado en la misma
// transacción que la crea (si se rechaza, no cuenta).
const porApartar = limitador(30);
const porIntento = limitador(20);
const porIntentoHora = limitadorDurable('casaNuevaIntento', 60, 3600_000, { siFalla: 'memoria' });
const porCrear = limitadorDurable('casaNueva', 10, 24 * 3600_000);
const OPERACION = { venta: 'en venta', renta: 'en renta', vacacional: 'por noche' };

class Respuesta extends Error { constructor(status, error, extra = {}) { super(error); this.status = status; this.extra = extra; } }
const falla = (status, error, extra) => { throw new Respuesta(status, error, extra); };
const sinCuenta = (err) => err?.rechazo || err?.codigo === 'PERMISSION_DENIED' || err?.status === 401 || err?.status === 403;
const SIN_PERMISO = 'Por ahora no puedes ingresar inmuebles: está en pausa. Escríbenos y lo vemos. Las solicitudes y el chat siguen igual.';
const malos = (errores) => falla(422, errores.length === 1 ? errores[0].msg : `Revisa ${errores.length} datos: ${errores.map((e) => e.msg).join(' ')}`, { errores });

// «Ingresar inmuebles»: lo que resulta para él (permisosSocios, con el corte por atraso) y, por si todavía no se calculó
// (quien no tiene casas por noche no tiene ese documento), lo apagado para todos y lo apagado solo para él.
async function puedeIngresar(tx, propietarioId, dueno) {
	const [resultado, global] = await Promise.all([tx.leer(`permisosSocios/${propietarioId}`), tx.leer('settings/permisosSocios')]);
	return puede(resultado, 'inmuebles') && puede(global, 'inmuebles') && puede(dueno?.permisos, 'inmuebles');
}

async function apartar(tx, socio) {
	if (!(await puedeIngresar(tx, socio.propietarioId, await tx.leer(`propietarios/${socio.propietarioId}`)))) falla(403, SIN_PERMISO);
	const suyas = (await tx.consultar('casasNuevas', 'propietarioId', socio.propietarioId)).filter((x) => x.uid === socio.uid);
	const actual = suyas.filter((x) => vigente(x)).sort((a, b) => fecha(b.cuando) - fecha(a.cuando))[0];
	if (actual) return actual.id;
	// Las vencidas (con sus fotos) las barre el control de cada hora.
	const id = idNuevo();
	tx.crear(`casasNuevas/${id}`, { propietarioId: socio.propietarioId, uid: socio.uid }, { ahora: ['cuando'] });
	return id;
}

// Todo lo que se revisa antes de crear, dentro de una transacción (la que solo lee, y otra vez en la que crea).
async function revisar(tx, socio, id, datos) {
	const [apartada, existe, dueno] = await Promise.all([tx.leer(`casasNuevas/${id}`), tx.leer(`properties/${id}`), tx.leer(`propietarios/${socio.propietarioId}`)]);
	if (existe) falla(409, 'Esa casa ya está publicada.');
	if (!apartada || apartada.propietarioId !== socio.propietarioId) falla(403, 'Esta casa nueva no es tuya: vuelve a abrir «Agregar casa».');
	if (!vigente(apartada)) falla(403, 'Pasaron más de 7 días desde que abriste «Agregar casa»: vuelve a abrirla y sube las fotos otra vez.');
	if (!(await puedeIngresar(tx, socio.propietarioId, dueno))) falla(403, SIN_PERMISO);
	if (!dueno) falla(403, 'Tu ficha no está lista: escríbele al equipo.');
	const activos = await tx.consultar('agents', 'activo', true);
	const r = revisarCasaNueva({ datos, casaId: id, bucket: BUCKET, origenes: ORIGENES, dueno, agentes: activos.map((a) => a.id) });
	if (r.errores.length) malos(r.errores);
	return { r, dueno, activos };
}

// La URL y el código, apartados en esta transacción: el primero libre entre las casas leídas antes, las de la base con esa
// misma URL o código y lo ya apartado (urlsCasas, codigosCasas). Dos casas a la vez: la base repite la transacción de una.
async function urlLibre(tx, id, titulo, usadas) {
	const base = slugify(titulo) || 'propiedad';
	for (let n = 1; n <= 50; n++) {
		const s = n === 1 ? base : `${base}-${n}`;
		if (usadas.has(s) || await tx.leer(`urlsCasas/${s}`) || (await tx.consultar('properties', 'slug', s)).length) continue;
		tx.crear(`urlsCasas/${s}`, { propertyId: id }, { ahora: ['cuando'] });
		return s;
	}
	return falla(409, 'No encontramos una dirección libre para ese título: cámbialo un poco.');
}
async function codigoLibre(tx, id, casa, activos, codigos) {
	const vistos = [...codigos];
	for (let n = 0; n < 30; n++) {
		const c = generarCodigo(casa, { agentes: activos, codigos: vistos });
		if (!await tx.leer(`codigosCasas/${c}`) && !(await tx.consultar('properties', 'codigo', c)).length) {
			tx.crear(`codigosCasas/${c}`, { propertyId: id }, { ahora: ['cuando'] });
			return c;
		}
		vistos.push(c);
	}
	return falla(409, 'No se pudo darle un código: vuelve a intentarlo.');
}

async function crear(tx, socio, id, datos, { slugs, codigos }) {
	if (await porCrear.enTransaccion(tx, socio.uid)) falla(429, 'Ya subiste muchas casas hoy: sigue mañana o escríbenos.');
	const { r, dueno, activos } = await revisar(tx, socio, id, datos);
	const quien = { fecha: new Date(), por: socio.nombre || 'Dueño', porUid: socio.uid };
	const listos = armarCasaNueva(r, {
		propietarioId: socio.propietarioId,
		slug: await urlLibre(tx, id, r.casa.titulo, slugs),
		codigo: await codigoLibre(tx, id, r.casa, activos, codigos),
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
		if (porIntento(socio.uid) || await porIntentoHora(socio.uid)) return json(429, { error: 'Demasiados intentos seguidos: espera unos minutos.' });
		// 1) Lo barato: carpeta, permiso y datos, sin escribir nada.
		const { r } = await transaccion((tx) => revisar(tx, socio, id, datos));
		// 2) Cada foto existe en su carpeta (una ruta inventada no cuenta para las 5).
		const subidas = new Set((await listarFotos(`properties/${id}/`)).map((f) => f.ruta));
		if (r.casa.fotos.some((f) => !subidas.has(f.path))) malos([{ campo: 'fotos', msg: 'Fotos: una de las fotos no se subió bien. Quítala y súbela de nuevo.' }]);
		// 3) Los códigos de todas las casas (para el siguiente número) y la creación, con la URL y el código apartados.
		const todas = await listar('properties');
		const usados = { slugs: new Set(todas.map((p) => p.slug).filter(Boolean)), codigos: todas.map((p) => p.codigo).filter(Boolean) };
		const hecho = await transaccion((tx) => crear(tx, socio, id, datos, usados));
		return json(200, { ok: true, ...hecho });
	} catch (err) {
		if (err instanceof Respuesta) return json(err.status, { error: err.message, ...err.extra });
		if (sinCuenta(err)) { console.error('Casa nueva: cuenta de escritura', err.message); return json(503, { error: 'La cuenta de escritura no funciona' }); }
		console.error('Casa nueva:', err.message);
		return json(500, { error: 'No se pudo publicar. Vuelve a intentarlo.' });
	}
};

export const config = { path: '/api/mi-casa-nueva' };
