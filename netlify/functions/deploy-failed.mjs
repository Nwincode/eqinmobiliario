// Se ejecuta sola cuando una publicación falla en Netlify (función de evento). El panel y la publicación automática
// marcan «publicado» apenas Netlify recibe el pedido, no cuando termina; si el build falla (p. ej. Firestore no
// respondió: scripts/build.mjs no publica el ejemplo), el sitio anterior sigue en línea y aquí se vuelve a marcar
// «cambios sin publicar», con el motivo, para que el panel lo diga. La publicación automática no reintenta sola
// (publicar-pendiente.mjs y comisiones-vencidas.mjs saltan mientras `fallo` esté puesto); lo quitan «Publicar» en el
// panel y la siguiente publicación que sale bien (deploy-succeeded.mjs). Si el build se frenó por el catálogo
// (scripts/lib/antes-de-publicar.mjs), el motivo ya lo dejó el build en `freno`.
// La primera vez que falla (no en cada reintento) se avisa al equipo por correo: con el panel cerrado nadie lo vería, y
// lo que cambian los dueños no saldría en la página.
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { correoConfigurado, destinatariosEquipo, enviarCorreo, plantilla, boton, esc, SITE_URL } from '../lib/correo.mjs';
import { DESC_FALLO, DESC_FRENO } from '../lib/publicar.mjs';

async function avisarEquipo(motivo, frenada) {
	if (!correoConfigurado()) return;
	const texto = frenada
		? 'La publicación del sitio se frenó para no quitar casas del sitio por error. El sitio anterior sigue en línea. Abre Publicar en el panel: si está bien así, toca «Publicar aunque baje».'
		: 'La última publicación del sitio falló en Netlify. El sitio anterior sigue en línea; lo que se cambió desde entonces todavía no sale. Abre el panel y pulsa «Publicar».';
	const html = await plantilla({
		titulo: frenada ? 'La publicación del sitio se frenó' : 'La publicación del sitio falló',
		intro: esc(texto),
		bloques: (c) => `${motivo ? `<p style="font-size:14px;margin:0 0 18px;color:${c.ink}">${frenada ? 'Motivo' : 'Motivo que dio Netlify'}: ${esc(motivo)}</p>` : ''}${boton(c, 'Abrir Publicar', `${SITE_URL}/admin/#/publicar`)}`
	});
	await enviarCorreo({ para: destinatariosEquipo(), asunto: `${frenada ? 'La publicación del sitio se frenó' : 'La publicación del sitio falló'} · Equipo Inmobiliario`, html, texto });
}

export default async (req) => {
	let deploy = {};
	try { deploy = (await req.json()).payload || {}; } catch { /* sin datos: se asume producción */ }
	if (deploy.context && deploy.context !== 'production') return new Response('Vista previa: nada que marcar.');
	if (!escrituraConfigurada()) return new Response('Sin cuenta de escritura.');
	let primera = false, frenada = false, freno = '';
	try {
		primera = await transaccion(async ({ leer, cambiar }) => {
			const estado = await leer('meta/publish');
			if (!estado) return false;
			// El build la frenó a propósito (catálogo vacío o que bajó de golpe): dejó el motivo en `freno` hace un momento;
			// Publicar lo muestra con «Publicar aunque baje». Un freno de otra publicación no cuenta.
			frenada = Boolean(estado.freno) && Date.now() - new Date(estado.frenoCuando || 0).getTime() < 2 * 3600_000;
			freno = String(estado.freno || '');
			cambiar('meta/publish', { pendiente: true, fallo: true, ultimoCambioDesc: frenada ? DESC_FRENO : DESC_FALLO }, { ahora: ['ultimoCambio'] });
			return !estado.fallo;
		});
	} catch (e) {
		console.error('deploy-failed:', e.message);
	}
	// El correo va por su lado: si falla, la marca ya quedó.
	if (primera) {
		try { await avisarEquipo((frenada ? freno : String(deploy.error_message || '')).slice(0, 300), frenada); } catch (e) { console.error('deploy-failed (correo):', e.message); }
	}
	return new Response('ok');
};
