// POST /api/aviso-pago: el panel, después de guardar un cambio en los datos de pago de un socio. Manda los correos
// pendientes al equipo (netlify/lib/avisos-pago.mjs: decide con lo guardado, no con lo que mande quien llama).
import { staffUser, json } from '../lib/auth.mjs';
import { avisarCambiosDePago } from '../lib/avisos-pago.mjs';

export default async (req) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	let usuario = null;
	try { usuario = await staffUser(req); } catch { /* sesión inválida */ }
	if (!usuario?.admin) return json(403, { error: 'Solo el administrador.' });
	try {
		return json(200, { enviados: await avisarCambiosDePago() });
	} catch (err) {
		console.error('Aviso de datos de pago:', err.message);
		return json(502, { error: 'No se pudo enviar el aviso' });
	}
};

export const config = { path: '/api/aviso-pago' };
