// Se ejecuta sola cuando una publicación falla en Netlify (función de evento). El panel y la publicación automática
// marcan «publicado» apenas Netlify recibe el pedido, no cuando termina; si el build falla (p. ej. Firestore no
// respondió: scripts/build.mjs no publica el ejemplo), el sitio anterior sigue en línea y aquí se vuelve a marcar
// «cambios sin publicar», con el motivo, para que el panel lo diga. La publicación automática no reintenta sola
// (publicar-pendiente.mjs salta mientras `fallo` esté puesto); «Publicar» en el panel lo quita.
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';

export default async (req) => {
	let deploy = {};
	try { deploy = (await req.json()).payload || {}; } catch { /* sin datos: se asume producción */ }
	if (deploy.context && deploy.context !== 'production') return new Response('Vista previa: nada que marcar.');
	if (!escrituraConfigurada()) return new Response('Sin cuenta de escritura.');
	try {
		await transaccion(async ({ leer, cambiar }) => {
			if (!(await leer('meta/publish'))) return;
			cambiar('meta/publish', { pendiente: true, fallo: true, ultimoCambioDesc: 'La última publicación falló; el sitio anterior sigue en línea' }, { ahora: ['ultimoCambio'] });
		});
	} catch (e) {
		console.error('deploy-failed:', e.message);
	}
	return new Response('ok');
};
