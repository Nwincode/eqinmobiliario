// POST /api/reenviar-enlace { leadId, correo? }: corregir el correo de una solicitud de reserva (admin/js/crm.js
// corregirCorreo; las reglas no dejan cambiarlo desde el navegador). Solo el administrador: un asesor no se manda a sí
// mismo el enlace (el token) de la reserva de un cliente. Lo que hace:
//  - Si la solicitud tiene chat, SIEMPRE le cambia el enlace (netlify/lib/rotar-enlace.mjs: el viejo pudo llegar a otra
//    persona y deja de servir), en cualquier estado (también pagada, que abre la dirección, y ya pasada), en la misma
//    transacción que el correo corregido (en minúsculas, sin la marca de rebote, con «Correo corregido: antes → ahora»).
//    Sin chat, solo el correo.
//  - Si la reserva sigue abierta (sin responder o confirmada) y su salida no ha pasado, le manda el enlace nuevo
//    (netlify/lib/aviso-chat-envio.mjs reenviarEnlace) con «Se reenvió el enlace a …». Sus límites (1 cada 10 min por
//    enlace y correo, 6 al día por solicitud) solo deciden si sale el correo, nunca si el enlace cambia.
// Sin `correo` (un panel de antes, que ya lo guardó): lo mismo con el correo guardado. Un lead de contacto, sin reserva, no
// recibe nada. 30 por hora por usuario del equipo.
import '../../js/calc-vacacional.js';
import { staffUser, json } from '../lib/auth.mjs';
import { datosConfigurados, leerPrivado } from '../lib/firestore.mjs';
import { transaccion } from '../lib/firestore-escritura.mjs';
import { reenviarEnlace } from '../lib/aviso-chat-envio.mjs';
import { rotarEnlace } from '../lib/rotar-enlace.mjs';
import { limitadorDurable } from '../lib/limite.mjs';
import { correoValido } from '../../admin/js/formato.js';
import { queCorreoCorregido, queEnlaceReenviado } from '../../admin/js/reservas-calculo.js';

const V = globalThis.EQVacacional;
const porUsuario = limitadorDurable('reenviar-enlace-usuario', 30, 3_600_000);
const limpio = (c) => String(c || '').trim().toLowerCase();
const renglon = (u, que) => ({ que, quien: u.uid, nombre: u.nombre || '', cuando: new Date().toISOString() });

export default async (req) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	let usuario = null;
	try { usuario = await staffUser(req); } catch { /* sesión inválida */ }
	if (!usuario) return json(403, { error: 'Solo el equipo.' });
	let leadId = '', correo = '';
	try { const p = await req.json(); leadId = String(p.leadId || ''); correo = p.correo == null ? '' : limpio(p.correo); } catch { return json(400, { error: 'Solicitud inválida' }); }
	if (!/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) return json(400, { error: 'Solicitud inválida' });
	if (correo && !correoValido(correo)) return json(400, { error: 'Revisa el correo (p. ej. nombre@correo.com).' });
	if (!datosConfigurados()) return json(200, { enviado: false, motivo: 'Correo no configurado' });
	const lead = await leerPrivado(`leads/${leadId}`).catch(() => null);
	if (!lead) return json(404, { error: 'No existe' });
	if (!usuario.admin && !(usuario.agentId && lead.agentId === usuario.agentId)) return json(403, { error: 'Esta solicitud no es tuya.' });
	if (lead.reserva?.codigo && !usuario.admin) return json(403, { error: 'Solo el administrador corrige el correo de una reserva.' });
	if (!lead.reserva?.codigo) return correo ? json(400, { error: 'El correo de un lead de contacto se corrige en el panel.' }) : json(200, { cambio: false, enviado: false, motivo: 'Sin reserva abierta' });
	if (await porUsuario(usuario.uid)) return json(429, { error: 'Demasiados reenvíos seguidos.' });
	const cambia = Boolean(correo) && correo !== limpio(lead.email);
	// El correo corregido, con su renglón de quien corrige (dentro de la transacción que se le pase).
	const guardarCorreo = async ({ leer, cambiar }) => {
		const antes = limpio((await leer(`leads/${leadId}`))?.email);
		if (antes === correo) return;
		cambiar(`leads/${leadId}`, { email: correo, reboteCorreo: undefined }, { ahora: ['updatedAt'], agregar: { 'solicitud.historial': [renglon(usuario, queCorreoCorregido(antes, correo))] } });
	};
	// 1. El enlace nuevo (con el correo), siempre que haya chat; sin chat, solo el correo.
	let rotado = false;
	try {
		rotado = Boolean(await rotarEnlace(leadId, { junto: cambia ? guardarCorreo : null }));
		if (!rotado && cambia) await transaccion(guardarCorreo);
	} catch (err) {
		console.error('Enlace nuevo:', err.message);
		return json(502, { error: 'No se pudo cambiar el enlace: el correo sigue como estaba. Vuelve a intentarlo.' });
	}
	// 2. El correo con el enlace nuevo, si la reserva sigue abierta y por venir.
	const estado = lead.solicitud?.estado || 'pendiente';
	if (!['pendiente', 'confirmada'].includes(estado) || !(String(lead.reserva.salida || '') >= V.hoy())) return json(200, { cambio: cambia, rotado, enviado: false, motivo: 'Sin reserva abierta' });
	let para = '';
	try { para = await reenviarEnlace(leadId, { motivo: 'correo' }); } catch (err) {
		console.error('Reenviar enlace:', err.message);
		return json(200, { cambio: cambia, rotado, enviado: false, motivo: 'El correo con el enlace no salió: vuelve a intentarlo' });
	}
	if (!para) return json(200, { cambio: cambia, rotado, enviado: false, motivo: 'Ya se le mandó muchas veces hoy' });
	await transaccion(({ cambiar }) => cambiar(`leads/${leadId}`, {}, { agregar: { 'solicitud.historial': [renglon(usuario, queEnlaceReenviado(para))] } }))
		.catch((err) => console.warn('Historial del reenvío:', err.message));
	return json(200, { cambio: cambia, rotado, enviado: true, para });
};

export const config = { path: '/api/reenviar-enlace' };
