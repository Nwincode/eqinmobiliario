// Rebotes de correo (ZeptoMail → POST /api/rebote-correo): a qué direcciones no llegó y por qué, y la marca en la
// solicitud o el lead de esa dirección (`reboteCorreo`: { cuando, motivo }), que Solicitudes muestra como «El correo no
// llegó» junto al WhatsApp del cliente. Lo que no es de ningún lead (un dueño, el equipo) va a estado/rebotes («Estado
// del sistema»). La forma exacta del aviso de ZeptoMail no se pudo leer de su documentación desde aquí (sin comprobar):
// se buscan las direcciones en los campos de destinatario, a cualquier profundidad, y el motivo en «reason»/«diagnostic».
import { correoValido } from '../../admin/js/formato.js';
import { donde } from './firestore.mjs';
import { escrituraConfigurada, transaccion } from './firestore-escritura.mjs';
import { anotarFallo } from './estado.mjs';

const CAMPOS_DESTINO = /^(email_address|address|recipient|recipients|to|email|bounced_recipient|bounce_address)$/i;
const CAMPOS_MOTIVO = /^(reason|diagnostic_message|diagnostic|bounce_reason|description|message)$/i;

// Del aviso (JSON) a { correos: [...], motivo }. Sin el remitente propio (también puede venir en el aviso).
export function leerRebote(aviso, { propios = [] } = {}) {
	const correos = new Set(), motivos = [];
	const fuera = new Set(propios.map((x) => String(x).toLowerCase()));
	const recorrer = (v, campo = '', prof = 0) => {
		if (prof > 8 || v == null) return;
		if (Array.isArray(v)) return v.slice(0, 50).forEach((x) => recorrer(x, campo, prof + 1));
		if (typeof v === 'object') return Object.entries(v).slice(0, 80).forEach(([k, x]) => recorrer(x, k, prof + 1));
		const s = String(v).trim();
		if (CAMPOS_DESTINO.test(campo) && correoValido(s) && !fuera.has(s.toLowerCase())) correos.add(s.toLowerCase());
		if (CAMPOS_MOTIVO.test(campo) && s && !correoValido(s) && motivos.length < 3) motivos.push(s.slice(0, 200));
	};
	recorrer(aviso);
	return { correos: [...correos].slice(0, 20), motivo: motivos[0] || 'No se pudo entregar' };
}

// Marca cada lead con ese correo (solicitudes de reserva y formularios). Devuelve cuántos marcó; si ninguno, lo anota en
// estado/rebotes para el administrador.
export async function marcarRebote({ correos, motivo }, ahora = Date.now()) {
	if (!escrituraConfigurada()) return 0;
	let marcados = 0;
	const sinLead = [];
	for (const correo of correos) {
		const leads = await donde('leads', 'email', correo);
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
