// «Pasar datos al formato nuevo» (Publicar, solo el administrador): la migración de los chats de antes
// (netlify/lib/migrar-chats.mjs) con las llaves que ya están en Netlify, sin que nadie tenga que manejarlas.
// POST /api/migrar-chats { aplicar, cursor, porTanda } (Authorization: Bearer <token del administrador>)
//  - aplicar false: dice qué cambiaría, sin escribir nada; true: lo hace.
//  - Por tandas: cada pedido hace lo que cabe en unos 6 s y responde { cuenta, cursor, fase, fases }; el panel repite con
//    el `cursor` hasta que vuelve null y suma las cuentas. Repetir una tanda no cambia nada (la migración solo toca lo que
//    sigue con la forma de antes). `porTanda` (opcional, para las pruebas) solo achica la tanda.
//  - Aplicar guarda el avance en el servidor (estado/migracion-chats): cada tanda tiene que traer el cursor guardado, y
//    solo una pasada completa desde el principio deja `hecha` con sus `fases` (el panel ya no ofrece el botón hasta que
//    haya una fase nueva: `FASES_MIGRACION`).
// Respuestas: 200, 400 (cursor mal formado), 401/403, 409 (el cursor no es el guardado: empezar otra vez), 429,
// 502 { error } (seguir con el mismo cursor), 503 sin las cuentas.
import { staffUser, json } from '../lib/auth.mjs';
import { datosConfigurados } from '../lib/firestore.mjs';
import { escrituraConfigurada } from '../lib/firestore-escritura.mjs';
import { limitadorDurable } from '../lib/limite.mjs';
import { tanda, tandaAplicando, cursorValido, FASES_TOTAL } from '../lib/migrar-chats.mjs';

// Lo que se deja empezar en una tanda: Netlify corta la función a los 10 s, y la última pieza (un chat con sus fotos)
// tiene que caber después.
const PLAZO_MS = 6000;
// Un administrador repitiendo tandas: holgado (una migración de verdad son pocas), pero con fin.
const porUsuario = limitadorDurable('migrar-chats', 300, 10 * 60_000);

export default async (req) => {
	const inicio = Date.now();
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	let staff = null;
	try { staff = await staffUser(req); } catch { return json(401, { error: 'Sesión inválida: vuelve a entrar.' }); }
	if (!staff?.admin) return json(403, { error: 'Solo para administradores.' });
	if (!datosConfigurados() || !escrituraConfigurada()) return json(503, { error: 'Faltan en Netlify las cuentas de servicio de Google: no se puede desde el panel.' });
	const leido = await req.json().catch(() => null);
	const cuerpo = leido && typeof leido === 'object' ? leido : {};
	const cursor = cuerpo.cursor ?? null;
	const porTanda = cuerpo.porTanda === undefined ? Infinity : Number(cuerpo.porTanda);
	if (!cursorValido(cursor) || !(Number.isInteger(porTanda) ? porTanda >= 1 : porTanda === Infinity)) return json(400, { error: 'Pedido mal formado.' });
	if (await porUsuario(staff.uid)) return json(429, { error: 'Demasiados pedidos seguidos. Espera unos minutos y vuelve a tocar el botón: sigue donde quedó.' });
	const aplicar = cuerpo.aplicar === true;
	let r;
	try {
		const opciones = { cursor, hasta: inicio + PLAZO_MS, porTanda };
		r = aplicar ? await tandaAplicando({ ...opciones, por: staff.nombre || '' }) : await tanda(opciones);
	} catch (err) {
		if (err.codigo === 'AVANCE') return json(409, { error: 'Otra pasada cambió el avance. Toca «Seguir»: empieza otra vez, sin repetir lo ya pasado.' });
		console.error('migrar-chats:', err.message);
		const falta = rolQueFalta(err);
		return json(502, { error: falta ? `Falta un permiso en Google Cloud (IAM): a la cuenta ${falta.cuenta || '(sin correo en Netlify)'} dale el rol «${falta.rol}». Luego espera 5 minutos y vuelve a tocar el botón.` : 'No se pudo terminar. Vuelve a intentarlo: sigue donde quedó.' });
	}
	return json(200, { ok: true, cuenta: r.cuenta, cursor: r.cursor, fase: r.cursor ? r.cursor.fase + 1 : FASES_TOTAL, fases: FASES_TOTAL });
};

// Qué cuenta y qué rol faltan, según dónde falló: bajar una foto (lectura), lo demás de Storage (escritura), leer la base
// (lectura) o escribirla (escritura). null si no fue un permiso.
export function rolQueFalta(err) {
	const msg = String(err?.message || '');
	const sinPermiso = err?.status === 401 || err?.status === 403 || /\b40[13]\b|permiso|PERMISSION_DENIED/i.test(msg);
	if (!sinPermiso) return null;
	const lectura = process.env.GOOGLE_SA_EMAIL || '';
	const escritura = process.env.GOOGLE_SA_ESCRITURA_EMAIL || '';
	if (/^Storage .* al bajar/.test(msg)) return { cuenta: lectura, rol: 'Storage Object Viewer' };
	if (/^Storage /.test(msg)) return { cuenta: escritura, rol: 'Storage Object Admin' };
	if (/leer la base|al leer|al consultar/.test(msg)) return { cuenta: lectura, rol: 'Cloud Datastore Viewer' };
	return { cuenta: escritura, rol: 'Cloud Datastore User' };
}

export const config = { path: '/api/migrar-chats' };
