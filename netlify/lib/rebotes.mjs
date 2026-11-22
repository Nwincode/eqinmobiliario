// Rebotes de correo (ZeptoMail → POST /api/rebote-correo): a qué direcciones no llegó y por qué, y la marca en la
// solicitud o el lead de esa dirección (`reboteCorreo`: { cuando, motivo }), que Solicitudes y Leads muestran como «El
// correo no llegó» junto al WhatsApp del cliente. Solo en los leads vigentes (vigente: de los últimos DIAS_VIGENTE días,
// o una reserva que aún no termina): el correo que rebotó salió por uno de esos, no por uno de hace un año. Lo que no es de
// ningún lead vigente (un dueño, el equipo, un cliente de antes) va a estado/rebotes («Estado del sistema»). La marca se
// quita cuando el cliente vuelve a escribir en su chat (quitarRebote, desde aviso-chat-envio.mjs) o cuando el equipo le
// corrige el correo en su ficha de cliente (admin/js/views/clientes.js). La forma exacta del aviso de ZeptoMail no se pudo leer de su documentación desde aquí (sin comprobar):
// se buscan las direcciones en los campos de destinatario, a cualquier profundidad, y el motivo en «reason»/«diagnostic».
import { correoValido } from '../../admin/js/formato.js';
import { donde } from './firestore.mjs';
import { escrituraConfigurada, transaccion } from './firestore-escritura.mjs';
import { anotarFallo } from './estado.mjs';
import '../../js/calc-vacacional.js';

export const DIAS_VIGENTE = 30;
const ms = (v) => (v instanceof Date ? v.getTime() : v?.toMillis ? v.toMillis() : Number(v) || 0);
export const leadVigente = (l, ahora = Date.now()) => ahora - ms(l?.createdAt) <= DIAS_VIGENTE * 86_400_000
	|| (typeof l?.reserva?.salida === 'string' && l.reserva.salida >= globalThis.EQVacacional.hoy(ahora));

const CAMPOS_DESTINO = /^(email_address|address|recipient|recipients|to|email|bounced_recipient|bounce_address)$/i;
const CAMPOS_MOTIVO = /^(reason|diagnostic_message|diagnostic|bounce_reason|description|message)$/i;

const CAMPOS_REMITENTE = /^(from|reply_to|sender|mail_from|return_path)$/i;

// Del aviso (JSON) a { correos: [...], motivo }. Solo si es un rebote (la palabra «bounce» en el aviso) y sin lo que va
// bajo el remitente (from, reply_to: nuestras propias direcciones, también reservas@), ni las de `propios`.
export function leerRebote(aviso, { propios = [] } = {}) {
	const correos = new Set(), motivos = [];
	if (!/bounce/i.test(JSON.stringify(aviso ?? '').slice(0, 65536))) return { correos: [], motivo: '' };
	const fuera = new Set(propios.map((x) => String(x).toLowerCase()));
	const recorrer = (v, campo = '', prof = 0) => {
		if (prof > 8 || v == null || CAMPOS_REMITENTE.test(campo)) return;
		if (Array.isArray(v)) return v.slice(0, 50).forEach((x) => recorrer(x, campo, prof + 1));
		if (typeof v === 'object') return Object.entries(v).slice(0, 80).forEach(([k, x]) => recorrer(x, k, prof + 1));
		const s = String(v).trim();
		if (CAMPOS_DESTINO.test(campo) && correoValido(s) && !fuera.has(s.toLowerCase())) correos.add(s.toLowerCase());
		if (CAMPOS_MOTIVO.test(campo) && s && !correoValido(s) && motivos.length < 3) motivos.push(s.slice(0, 200));
	};
	recorrer(aviso);
	return { correos: [...correos].slice(0, 20), motivo: motivos[0] || 'No se pudo entregar' };
}

// Marca cada lead vigente con ese correo (solicitudes de reserva y formularios). Devuelve cuántos marcó; lo que no marcó
// ninguno lo anota en estado/rebotes para el administrador.
export async function marcarRebote({ correos, motivo }, ahora = Date.now()) {
	if (!escrituraConfigurada()) return 0;
	let marcados = 0;
	const sinLead = [];
	for (const correo of correos) {
		const leads = (await donde('leads', 'email', correo)).filter((l) => leadVigente(l, ahora));
		if (!leads.length) { sinLead.push(correo); continue; }
		for (const l of leads.slice(0, 20)) {
			await transaccion(async ({ leer, cambiar }) => {
				if (await leer(`leads/${l.id}`)) cambiar(`leads/${l.id}`, { reboteCorreo: { cuando: new Date(ahora), motivo } });
			});
			marcados++;
		}
	}
	if (sinLead.length) await anotarFallo('rebotes', `No llegó a ${sinLead.slice(0, 3).join(', ')}: ${motivo}`, { cada: 0 });
	return marcados;
}

// El cliente volvió a escribir en su chat después del rebote: ya se le alcanza, la marca se quita. `escribio`: la hora de
// su último mensaje. Devuelve si la quitó.
export async function quitarRebote(leadId, escribio) {
	if (!escrituraConfigurada() || !leadId) return false;
	return transaccion(async ({ leer, cambiar }) => {
		const l = await leer(`leads/${leadId}`);
		if (!l?.reboteCorreo || !(ms(escribio) > ms(l.reboteCorreo.cuando))) return false;
		cambiar(`leads/${leadId}`, { reboteCorreo: undefined });
		return true;
	});
}
