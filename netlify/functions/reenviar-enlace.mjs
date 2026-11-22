// POST /api/reenviar-enlace { leadId }: el panel, después de corregir el correo de una solicitud de reserva
// (admin/js/crm.js corregirCorreo). Le manda al cliente el enlace de su reserva (netlify/lib/aviso-chat-envio.mjs
// reenviarEnlace, la misma pieza del 409 de /api/solicitud) al correo GUARDADO, no a uno que mande quien llama: así ve lo
// que se perdió (su reserva, cómo va y el chat). Solo el administrador o el asesor de esa solicitud (como las reglas de
// /leads: myAgentId), solo si sigue abierta (sin responder o confirmada) y su salida no ha pasado. Un lead de contacto, sin
// reserva, no recibe nada. Límites: los del reenvío por solicitud y correo, y 30 por hora por usuario del equipo.
import '../../js/calc-vacacional.js';
import { staffUser, json } from '../lib/auth.mjs';
import { datosConfigurados, leerPrivado } from '../lib/firestore.mjs';
import { reenviarEnlace } from '../lib/aviso-chat-envio.mjs';
import { limitadorDurable } from '../lib/limite.mjs';

const V = globalThis.EQVacacional;
const porUsuario = limitadorDurable('reenviar-enlace-usuario', 30, 3_600_000);

export default async (req) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	let usuario = null;
	try { usuario = await staffUser(req); } catch { /* sesión inválida */ }
	if (!usuario) return json(403, { error: 'Solo el equipo.' });
	let leadId = '';
	try { leadId = String((await req.json()).leadId || ''); } catch { return json(400, { error: 'Solicitud inválida' }); }
	if (!/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) return json(400, { error: 'Solicitud inválida' });
	if (!datosConfigurados()) return json(200, { enviado: false, motivo: 'Correo no configurado' });
	const lead = await leerPrivado(`leads/${leadId}`).catch(() => null);
	if (!lead) return json(404, { error: 'No existe' });
	if (!usuario.admin && !(usuario.agentId && lead.agentId === usuario.agentId)) return json(403, { error: 'Esta solicitud no es tuya.' });
	const estado = lead.solicitud?.estado || 'pendiente';
	if (!lead.reserva?.codigo || !['pendiente', 'confirmada'].includes(estado) || !(String(lead.reserva.salida || '') >= V.hoy())) return json(200, { enviado: false, motivo: 'Sin reserva abierta' });
	if (await porUsuario(usuario.uid)) return json(429, { error: 'Demasiados reenvíos seguidos.' });
	try {
		const para = await reenviarEnlace(leadId, { motivo: 'correo' });
		return json(200, para ? { enviado: true, para } : { enviado: false, motivo: 'Ya se le mandó hace poco' });
	} catch (err) {
		console.error('Reenviar enlace:', err.message);
		return json(502, { error: 'No se pudo enviar el correo' });
	}
};

export const config = { path: '/api/reenviar-enlace' };
