// Resumen de cada mañana por correo (≈ 6:10 a. m. en Guatemala).
// Netlify la ejecuta sola; si el correo no está configurado, no hace nada.
import { correoConfigurado } from '../lib/correo.mjs';
import { datosConfigurados } from '../lib/firestore.mjs';
import { enviarResumen } from '../lib/resumen.mjs';

export default async () => {
	if (!correoConfigurado() || !datosConfigurados()) {
		console.log('Resumen diario: falta configurar el correo o la cuenta de servicio.');
		return;
	}
	try {
		const r = await enviarResumen();
		console.log(`Resumen diario enviado a: ${r.enviados.join(', ') || 'nadie (sin pendientes)'}`);
	} catch (err) {
		console.error('Resumen diario:', err.message);
	}
};

export const config = { schedule: '10 12 * * *' };
