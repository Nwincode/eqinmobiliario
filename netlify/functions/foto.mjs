// POST /api/foto { token, mensaje }: la foto que el cliente subió al chat de su reserva, servida por el servidor (Storage
// ya no la abre a nadie: storage.rules cierra `fotosChat/` y `chats/`, y el mensaje guarda solo la ruta, sin token de
// descarga). Quién ve
// qué, con lo guardado (la ruta sale del mensaje, nunca de quien llama):
//  - el administrador (con su sesión): todas, también las ocultas (decide «Mostrar al socio» en Mensajes);
//  - el socio de la casa (con su sesión) y quien llega solo con el enlace del chat: las que la revisión dejó ver
//    (estadoDeFoto de admin/js/hilo.js: veredicto de netlify/lib/comprobantes.mjs y `chat.fotosVisibles`). El enlace no
//    distingue al cliente del socio (el socio lee el id del chat, que es la llave): sin sesión se sirve lo mismo que al
//    socio (decisión aceptada: el cliente ve la que acaba de subir desde su teléfono, js/reserva-chat.js la guarda al
//    subirla; al recargar, la oculta sale sin imagen).
//  - nadie más (un asesor, otro socio): 403.
// Lo que no se ve responde 403 con { ver: false, enRevision } (la tarjeta dice «en revisión» u «oculta»). El token va en
// el cuerpo, no en la dirección (no queda en registros). Sin guardar en caché: la decisión cambia («Mostrar al socio»).
// POST /api/foto { reserva }: el comprobante del pago a EQ que el socio subió a su reserva (`comision.comprobante`, la ruta
// en comprobantes/{reserva}/, que Storage tampoco abre): el administrador y el socio de esa reserva (`propietarioId`).
import '../../js/calc-vacacional.js';
import { usuario, esSocioDelChat, json } from '../lib/auth.mjs';
import { datosConfigurados, leerPrivado } from '../lib/firestore.mjs';
import { iaConfigurada } from '../lib/ia-cliente.mjs';
import { bajar } from '../lib/storage.mjs';
import { limitador, ipDe } from '../lib/limite.mjs';
import { estadoDeFoto, rutaDeFoto } from '../../admin/js/hilo.js';

const TOKEN = /^[A-Za-z0-9]{20,40}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
// Lo que un navegador muestra (las fotos se preparan en JPG, PNG o WebP antes de subirse).
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const porIp = limitador(300, 10 * 60_000);

// Lo que se decide para quien pide: { ruta } (se sirve), { estado: 403, ver: false, enRevision } o { estado: 404 }.
export async function decidirFoto(token, mensajeId, u, { ahora = Date.now() } = {}) {
	const [chat, m] = await Promise.all([leerPrivado(`chats/${token}`), leerPrivado(`chats/${token}/mensajes/${mensajeId}`)]);
	const ruta = m?.tipo === 'foto' && m.de === 'cliente' && chat ? rutaDeFoto({ token, leadId: chat.leadId }, m.texto) : '';
	if (!chat || !ruta) return { estado: 404 };
	if (u?.rol === 'admin') return { ruta };
	if (u && !esSocioDelChat(u, chat, chat.propertyId ? await leerPrivado(`properties/${chat.propertyId}`) : null)) return { estado: 403, ver: false, enRevision: false };
	const rv = chat.leadId ? await leerPrivado(`revisionesComprobante/${chat.leadId}`) : null;
	const f = estadoDeFoto({ id: mensajeId, createdAt: m.createdAt }, { chat, rv, ia: iaConfigurada(), ahora });
	return f.ver ? { ruta } : { estado: 403, ver: false, enRevision: Boolean(f.enRevision) };
}

// La ruta del comprobante de la comisión de una reserva (la de antes, con su dirección, se lee igual), o ''.
export const rutaDeComprobante = (reservaId, texto) => {
	const s = String(texto || '');
	const a = s.startsWith(`comprobantes/${reservaId}/`) ? s.slice(reservaId.length + 14)
		: (new RegExp(`^https://firebasestorage[.]googleapis[.]com/v0/b/[a-z0-9.-]+/o/comprobantes%2F${reservaId}%2F([A-Za-z0-9._-]+)[?]alt=media(&token=[a-z0-9-]+)?$`).exec(s) || [])[1] || '';
	return /^[A-Za-z0-9._-]{1,120}$/.test(a) && !a.startsWith('.') ? `comprobantes/${reservaId}/${a}` : '';
};
export async function decidirComprobante(reservaId, u) {
	const r = await leerPrivado(`reservas/${reservaId}`);
	const ruta = r ? rutaDeComprobante(reservaId, r.comision?.comprobante) : '';
	if (!ruta) return { estado: 404 };
	return u?.rol === 'admin' || (u?.rol === 'socio' && u.propietarioId && r.propietarioId === u.propietarioId) ? { ruta } : { estado: 403 };
}

export default async (req, context) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (porIp(ipDe(req, context))) return json(429, { error: 'Demasiadas fotos seguidas.' });
	let p;
	try { p = await req.json(); } catch { return json(400, { error: 'Pedido inválido' }); }
	const token = String(p?.token || ''), mensaje = String(p?.mensaje || ''), reserva = String(p?.reserva || '');
	if (reserva ? !ID.test(reserva) : !TOKEN.test(token) || !ID.test(mensaje)) return json(400, { error: 'Pedido inválido' });
	if (!datosConfigurados()) return json(503, { error: 'Sin conexión con la base' });
	let u = null;
	try { u = await usuario(req); } catch { return json(401, { error: 'Vuelve a entrar al panel.' }); }
	try {
		const d = reserva ? await decidirComprobante(reserva, u) : await decidirFoto(token, mensaje, u);
		if (!d.ruta) return json(d.estado, d.estado === 404 ? { error: 'No existe' } : { ver: false, enRevision: d.enRevision });
		const foto = await bajar(d.ruta);
		if (!TIPOS.includes(foto.tipo)) return json(404, { error: 'No existe' });
		return new Response(foto.datos, { status: 200, headers: { 'Content-Type': foto.tipo, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } });
	} catch (err) {
		if (err?.status === 404) return json(404, { error: 'No existe' });
		console.error('Foto del chat:', err.message);
		return json(503, { error: 'No se pudo leer la foto' });
	}
};

export const config = { path: '/api/foto' };
