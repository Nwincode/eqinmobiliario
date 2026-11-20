// Se ejecuta sola cuando una publicación falla en Netlify (función de evento). El panel y la publicación automática
// marcan «publicado» apenas Netlify recibe el pedido, no cuando termina; si el build falla (p. ej. Firestore no
// respondió: scripts/build.mjs no publica el ejemplo), el sitio anterior sigue en línea y aquí se vuelve a marcar
// «cambios sin publicar», con el motivo, para que el panel lo diga. La publicación automática no reintenta sola
// (publicar-pendiente.mjs y comisiones-vencidas.mjs saltan mientras `fallo` esté puesto); lo quitan «Publicar» en el
// panel y la siguiente publicación que sale bien (deploy-succeeded.mjs).
// La primera vez que falla (no en cada reintento) se avisa al equipo por correo (AVISO_CORREO): con el panel cerrado
// nadie lo vería, y lo que cambian los dueños no saldría en la página.
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { correoConfigurado, destinatariosEquipo, enviarCorreo, plantilla, boton, esc, SITE_URL } from '../lib/correo.mjs';
import { DESC_FALLO } from '../lib/publicar.mjs';

async function avisarEquipo(motivo) {
	if (!correoConfigurado()) return;
	const texto = 'La última publicación del sitio falló en Netlify. El sitio anterior sigue en línea; lo que se cambió desde entonces todavía no sale. Abre el panel y pulsa «Publicar».';
	const html = await plantilla({
		titulo: 'La publicación del sitio falló',
		intro: esc(texto),
		bloques: (c) => `${motivo ? `<p style="font-size:14px;margin:0 0 18px;color:${c.ink}">Motivo que dio Netlify: ${esc(motivo)}</p>` : ''}${boton(c, 'Abrir Publicar', `${SITE_URL}/admin/#/publicar`)}`
	});
	await enviarCorreo({ para: destinatariosEquipo(), asunto: 'La publicación del sitio falló · Equipo Inmobiliario', html, texto });
}

export default async (req) => {
	let deploy = {};
	try { deploy = (await req.json()).payload || {}; } catch { /* sin datos: se asume producción */ }
	if (deploy.context && deploy.context !== 'production') return new Response('Vista previa: nada que marcar.');
	if (!escrituraConfigurada()) return new Response('Sin cuenta de escritura.');
	let primera = false;
	try {
		primera = await transaccion(async ({ leer, cambiar }) => {
			const estado = await leer('meta/publish');
			if (!estado) return false;
			cambiar('meta/publish', { pendiente: true, fallo: true, ultimoCambioDesc: DESC_FALLO }, { ahora: ['ultimoCambio'] });
			return !estado.fallo;
		});
	} catch (e) {
		console.error('deploy-failed:', e.message);
	}
	// El correo va por su lado: si falla, la marca ya quedó.
	if (primera) {
		try { await avisarEquipo(String(deploy.error_message || '').slice(0, 300)); } catch (e) { console.error('deploy-failed (correo):', e.message); }
	}
	return new Response('ok');
};
