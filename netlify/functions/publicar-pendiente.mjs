// Cada 10 minutos: si quedaron cambios sin publicar (p. ej. lo que el dueño cambió de su casa desde su panel, o un
// cambio del equipo con el panel ya cerrado) y la publicación automática está encendida (Publicar → «Publicar
// automáticamente»), publica el sitio. Espera 12 minutos sin cambios nuevos: el panel abierto publica a los 10
// (admin/js/session.js) y así no salen dos publicaciones por lo mismo.
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { datosConfigurados } from '../lib/firestore.mjs';
import { publicarSitio, estadoPublicacion } from '../lib/publicar.mjs';

const QUIETO_MS = 12 * 60_000;

export default async () => {
	if (!datosConfigurados() || !escrituraConfigurada()) return;
	try {
		const { estado, hook, auto } = await estadoPublicacion();
		// Si la última falló (deploy-failed.mjs), no se reintenta sola cada 10 minutos: espera a «Publicar» en el panel.
		if (!estado.pendiente || estado.fallo || !auto || !hook) return;
		const ms = (d) => (d instanceof Date ? d.getTime() : 0);
		const ultimo = ms(estado.ultimoCambio);
		if (Date.now() - ultimo < QUIETO_MS) return;
		await publicarSitio(hook);
		// Se marca publicado solo si nadie cambió nada mientras tanto (si cambió, lo publica la próxima vuelta).
		await transaccion(async ({ leer, cambiar }) => {
			const ahora = await leer('meta/publish');
			if (!ahora?.pendiente || ms(ahora.ultimoCambio) !== ultimo) return;
			cambiar('meta/publish', { pendiente: false, ultimaPublicacionPor: 'Publicación automática', ultimaPublicacionAuto: true }, { ahora: ['ultimaPublicacion'] });
		});
	} catch (e) {
		console.error('publicar-pendiente:', e.message);
	}
};

export const config = { schedule: '*/10 * * * *' };
