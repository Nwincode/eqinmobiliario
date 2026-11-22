// Resumen de cada mañana por correo (≈ 6:10 a. m. en Guatemala), y aparte, lo que sigue roto (estado-sistema.mjs).
// Netlify la ejecuta sola; si el correo no está configurado, no hace nada.
import { correoConfigurado } from '../lib/correo.mjs';
import { datosConfigurados } from '../lib/firestore.mjs';
import { enviarResumen } from '../lib/resumen.mjs';
import { conReloj } from '../lib/estado.mjs';
import { avisarSiSigueRoto } from '../lib/estado-sistema.mjs';

// La última vuelta buena queda en estado/resumen-diario (la tarjeta «Estado del sistema» avisa si deja de correr).
export default conReloj('resumen-diario', async () => {
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
	// Lo que sigue roto después de 24 h (Inicio → Estado del sistema), en su propio correo al equipo.
	try {
		const n = await avisarSiSigueRoto();
		if (n) console.log(`Estado del sistema: ${n} cosa(s) siguen sin funcionar; correo al equipo.`);
	} catch (err) {
		console.error('Estado del sistema (correo):', err.message);
	}
});

export const config = { schedule: '10 12 * * *' };
