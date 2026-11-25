// POST /api/reenviar-enlace { leadId, correo? }: el panel, al corregir el correo de una solicitud de reserva
// (admin/js/crm.js corregirCorreo). Con `correo`, lo guarda aquí (en minúsculas, sin la marca de rebote y con su renglón
// «Correo corregido: antes → ahora» en el historial). Si la reserva sigue abierta (sin responder o confirmada) y su salida
// no ha pasado, además le cambia el enlace (netlify/lib/rotar-enlace.mjs: el token del chat; el viejo pudo llegar a otra
// persona y deja de servir) en la MISMA transacción que el correo, y le manda el nuevo (netlify/lib/aviso-chat-envio.mjs
// reenviarEnlace, la misma pieza del 409 de /api/solicitud) al correo corregido, con «Se reenvió el enlace a …». Sin
// `correo` (un panel de antes, que ya lo guardó): lo mismo con el correo guardado. Una solicitud de reserva, solo el
// administrador: un asesor no se manda a sí mismo el enlace (el token) de la reserva de un cliente. Lo demás, el
// administrador o el asesor de esa solicitud (como las reglas de /leads: myAgentId). Un lead de contacto, sin reserva, no
// recibe nada. Límites: los del reenvío por solicitud y correo (si ya se le mandó hace poco, se guarda el correo y el
// enlace no cambia), y 30 por hora por usuario del equipo.
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
	if (lead.reserva?.codigo && !usuario.admin) return json(403, { error: 'Solo el administrador reenvía el enlace de una reserva.' });
	if (correo && !lead.reserva?.codigo) return json(400, { error: 'El correo de un lead de contacto se corrige en el panel.' });
	// El correo corregido, con su renglón de quien corrige (dentro de la transacción que se le pase).
	const cambia = Boolean(correo) && correo !== limpio(lead.email);
	const guardarCorreo = async ({ leer, cambiar }) => {
		const antes = limpio((await leer(`leads/${leadId}`))?.email);
		if (antes === correo) return;
		cambiar(`leads/${leadId}`, { email: correo, reboteCorreo: undefined }, { ahora: ['updatedAt'],
			agregar: { 'solicitud.historial': [renglon(usuario, queCorreoCorregido(antes, correo))] } });
	};
	const soloCorreo = async () => { if (cambia) await transaccion(guardarCorreo); };
	const estado = lead.solicitud?.estado || 'pendiente';
	if (!lead.reserva?.codigo || !['pendiente', 'confirmada'].includes(estado) || !(String(lead.reserva.salida || '') >= V.hoy())) {
		try { await soloCorreo(); } catch (err) { console.error('Corregir correo:', err.message); return json(503, { error: 'No se pudo guardar el correo. Vuelve a intentarlo.' }); }
		return json(200, { cambio: cambia, enviado: false, motivo: 'Sin reserva abierta' });
	}
	if (await porUsuario(usuario.uid)) return json(429, { error: 'Demasiados reenvíos seguidos.' });
	let para = '', rotado = false;
	try {
		para = await reenviarEnlace(leadId, { motivo: 'correo', para: correo, antes: async () => { const t = await rotarEnlace(leadId, { junto: cambia ? guardarCorreo : null }); rotado = true; return t; } });
		if (!para) await soloCorreo();
	} catch (err) {
		console.error('Reenviar enlace:', err.message);
		return json(502, { error: rotado ? 'El correo y el enlace cambiaron, pero el correo con el enlace no salió.' : 'No se pudo cambiar el enlace: el correo sigue como estaba. Vuelve a intentarlo.', cambio: rotado && cambia });
	}
	if (!para) return json(200, { cambio: cambia, enviado: false, motivo: 'Ya se le mandó hace poco' });
	await transaccion(({ cambiar }) => cambiar(`leads/${leadId}`, {}, { agregar: { 'solicitud.historial': [renglon(usuario, queEnlaceReenviado(para))] } }))
		.catch((err) => console.warn('Historial del reenvío:', err.message));
	return json(200, { cambio: cambia, enviado: true, para });
};

const renglon = (u, que) => ({ que, quien: u.uid, nombre: u.nombre || '', cuando: new Date().toISOString() });

export const config = { path: '/api/reenviar-enlace' };
