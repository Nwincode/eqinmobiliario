// Manda los correos que tocan por el chat de una reserva (los decide avisos-chat.mjs con lo guardado, no con lo que
// mande quien llama). Lo usan netlify/functions/aviso-chat.mjs (el sitio y el panel, después de guardar) y
// netlify/functions/reservas.mjs (después de confirmar, cancelar o cobrar por el socio).
// El correo del cliente sale de su solicitud y el del socio de su ficha, ambos leídos con la cuenta de servicio, y el
// título de la casa, de la casa guardada. Devuelve cuántos salieron (0 sin correo o base configurados), o null si el chat no existe.
// Con la cuenta de escritura, cada aviso queda anotado en el chat (avisoEnviado = el id del mensaje, o 'nueva'):
//  - el mismo aviso no sale dos veces aunque alguien llame /api/aviso-chat muchas veces;
//  - el que no salió (el servicio falló o la función se cortó) queda en avisoPendiente, que ponen también el servidor y
//    el cron en el mismo cambio del chat; el control de cada hora (solicitudes-sin-respuesta.mjs) lo reintenta una vez
//    (`reintento`) y, salga o no, lo quita.
import { leerPublico, leerPrivado, listar, datosConfigurados } from './firestore.mjs';
import { escrituraConfigurada, transaccion } from './firestore-escritura.mjs';
import { enviarCorreo, servicioCorreo, destinatariosEquipo, plantilla, boton, datos, pasos, esc, SITE_URL } from './correo.mjs';
import { avisosChat } from './avisos-chat.mjs';
import { bajoElPlan, TEXTO_CONFIRMA_EQUIPO } from '../../admin/js/reservas-calculo.js';
import { prefijoMoneda, miles } from '../../admin/js/formato.js';
import { fotoCdn, pasaPorCdn } from '../../scripts/lib/foto-cdn.mjs';

export async function enviarAvisosChat(token, { repaso = false, reintento = false } = {}) {
	// Basta el servicio de correo: el cliente y el socio reciben lo suyo aunque falten los correos del equipo (AVISO_CORREO).
	if (!servicioCorreo() || !datosConfigurados()) return 0;
	const chat = await leerPublico(`chats/${token}`);
	if (!chat) return null;
	const conCasa = /^[\w-]{1,60}$/.test(chat.propertyId || '');
	const [mensajes, lead, socio, publica, privada] = await Promise.all([
		listar(`chats/${token}/mensajes`),
		chat.leadId ? leerPrivado(`leads/${chat.leadId}`) : null,
		chat.propietarioId ? leerPrivado(`propietarios/${chat.propietarioId}`) : null,
		conCasa ? leerPrivado(`properties/${chat.propertyId}`) : null,
		// El código que el socio usa para la casa (privado): va en sus correos, nunca en el del cliente.
		conCasa ? leerPrivado(`properties/${chat.propertyId}/privado/socio`).catch(() => null) : null
	]);
	const casa = publica && { ...publica, codigoSocio: String(privada?.codigoSocio || '').slice(0, 30) };
	mensajes.sort((a, b) => a.createdAt - b.createdAt);
	const clave = reintento ? String(chat.avisoPendiente || '') : mensajes.at(-1)?.id || 'nueva';
	if (reintento && !clave) return 0;
	const avisos = avisosChat({ chat, casa, mensajes, sitio: SITE_URL, repaso, mensaje: reintento ? clave : '', correos: { cliente: lead?.email || '', nombre: lead?.nombre ?? chat.nombre, socio: socio?.email || '', equipo: destinatariosEquipo() } });
	let anotar = escrituraConfigurada();
	// Nada que mandar: si era un pendiente, se quita.
	if (!avisos.length) { if (anotar && chat.avisoPendiente === clave) await marcar(token, clave, { listo: true }).catch(() => {}); return 0; }
	// Se aparta antes de mandar: otra llamada con el mismo aviso ya no lo manda. Si la base no responde, el correo sale
	// igual (sin anotar): mejor uno repetido que ninguno.
	if (anotar) {
		const libre = await apartar(token, clave, reintento).catch((err) => { console.error('Aviso de chat (apartar):', err.message); anotar = false; return true; });
		if (!libre) return 0;
	}
	// Cada correo por su lado: si falla el del socio, el del cliente igual sale (y al revés).
	let fallas = 0;
	for (const a of avisos) {
		try {
			const en = a.lang === 'en';
			const filas = (a.datos || []).filter((f) => f[1]);
			const html = await plantilla({
				titulo: a.titulo, intro: esc(a.intro), preheader: a.intro, lang: a.lang, ayuda: a.rol === 'cliente',
				// La foto de la casa guardada (su primera foto, por el CDN a 1200×630), nunca la del chat (la escribe el navegador).
				foto: pasaPorCdn(casa?.fotos?.[0]?.url) ? new URL(fotoCdn(casa.fotos[0].url, 1200, '&h=630&fit=cover&fm=jpg'), SITE_URL).href : '', etiqueta: `${en ? 'Booking' : 'Solicitud'} ${chat.codigo}`,
				pie: a.rol === 'cliente' ? (en ? 'You get this because you requested a booking on eqinmobiliario.gt.' : 'Lo recibes porque pediste una reserva en eqinmobiliario.gt.')
					: a.rol === 'casa' ? 'Lo recibes porque tu casa está publicada en eqinmobiliario.gt.' : '',
				bloques: (c) => datos(c, filas) + boton(c, a.boton, a.url, c.primary, { ancho: true })
					+ (a.nota ? `<p style="margin:4px 0 0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:${c.ink}">${esc(a.nota)}</p>` : '')
					+ (a.pasos?.length ? pasos(c, en ? 'What\'s next' : 'Qué sigue', a.pasos) : '')
			});
			const texto = [a.titulo, a.intro, '', ...filas.map(([k, v]) => `${k}: ${v}`), '', `${a.boton}: ${a.url}`, a.nota || '', ...(a.pasos || []).map((t, i) => `${i + 1}. ${t}`)].join('\n');
			await enviarCorreo({ responder: true, para: a.para, asunto: a.asunto, html, texto });
		} catch (err) { fallas++; console.error('Aviso de chat a', a.para.length, 'correo(s):', err.message); }
	}
	if (anotar) await marcar(token, clave, { listo: !fallas || reintento }).catch((err) => console.error('Aviso de chat (anotar):', err.message));
	if (fallas && fallas === avisos.length) throw new Error('No salió ningún aviso');
	return avisos.length - fallas;
}

// ¿Este aviso todavía no salió? Lo aparta (avisoEnviado = clave, con la hora: avisoApartado) en una transacción.
// Un reintento solo si sigue pendiente y nadie lo está mandando ahora: apartado por otra llamada hace menos de
// EN_CURSO, todavía va en camino (no se manda dos veces); más viejo, esa llamada se cortó y se reintenta.
export const EN_CURSO = 15 * 60_000;
export const puedeApartar = (c, clave, reintento, ahora = Date.now()) => Boolean(c) && (reintento
	? c.avisoPendiente === clave && (c.avisoEnviado !== clave || !(ahora - (Number(c.avisoApartado) || 0) < EN_CURSO))
	: c.avisoEnviado !== clave);
const apartar = (token, clave, reintento) => transaccion(async ({ leer, cambiar }) => {
	const c = await leer(`chats/${token}`);
	if (!puedeApartar(c, clave, reintento)) return false;
	cambiar(`chats/${token}`, { avisoEnviado: clave, avisoApartado: Date.now() });
	return true;
});
// Salió (o ya se reintentó): se quita el pendiente; si falló, queda pendiente para el control de cada hora.
const marcar = (token, clave, { listo }) => transaccion(async ({ leer, cambiar }) => {
	const c = await leer(`chats/${token}`);
	if (!c) return;
	if (listo) { if (c.avisoPendiente === clave) cambiar(`chats/${token}`, { avisoPendiente: '' }); }
	else cambiar(`chats/${token}`, { avisoPendiente: clave, avisoEnviado: '' });
});

// Una solicitud cotizada por debajo del precio de la casa (bajoElPlan): el socio no la puede confirmar, le toca al
// administrador. congelarMontos deja `teTocaPendiente` en el chat en el mismo cambio en que crea los montos (una sola
// vez); aquí se aparta en una transacción (dos llamadas a la vez no lo mandan dos veces), se manda al equipo y, si
// falla, vuelve a quedar pendiente: el control de cada hora (solicitudes-sin-respuesta.mjs) lo reintenta.
export async function avisarQueTocaConfirmar(token) {
	if (!servicioCorreo() || !destinatariosEquipo().length || !escrituraConfigurada()) return false;
	const tomado = await transaccion(async ({ leer, cambiar }) => {
		const c = await leer(`chats/${token}`);
		if (!c?.teTocaPendiente) return null;
		cambiar(`chats/${token}`, { teTocaPendiente: false });
		return c;
	}).catch((err) => { console.error('Te toca confirmar (apartar):', err.message); return null; });
	if (!tomado?.leadId) return false;
	try {
		const [lead, montos] = await Promise.all([leerPrivado(`leads/${tomado.leadId}`), leerPrivado(`montosSolicitud/${tomado.leadId}`)]);
		const r = lead?.reserva;
		if (!r?.codigo || !bajoElPlan(montos)) return false;
		const dinero = (n) => `${prefijoMoneda(montos.moneda)} ${miles(n)}`;
		const url = `${SITE_URL}/admin/#/solicitudes/${encodeURIComponent(r.codigo)}`;
		const intro = `${TEXTO_CONFIRMA_EQUIPO}: se le cotizaron ${dinero(montos.alojamiento)} de alojamiento y con los precios de la casa son ${dinero(montos.delPlan)}. El socio no la puede confirmar: confírmala o ciérrala en las próximas 24 h (después se cierra sola).`;
		const filas = [['Solicitud', r.codigo], ['Casa', lead.propertyTitulo || ''], ['Fechas', `${r.llegada} → ${r.salida}`]];
		const html = await plantilla({ titulo: 'Te toca confirmar esta solicitud', intro: esc(intro), preheader: intro, lang: 'es',
			bloques: (c) => datos(c, filas) + boton(c, 'Abrir la solicitud', url, c.primary, { ancho: true }) });
		await enviarCorreo({ para: destinatariosEquipo(), asunto: `Te toca confirmar esta solicitud: ${r.codigo}`, html, texto: [intro, '', ...filas.map(([k, v]) => `${k}: ${v}`), '', url].join('\n') });
		return true;
	} catch (err) {
		await transaccion(async ({ cambiar }) => cambiar(`chats/${token}`, { teTocaPendiente: true })).catch(() => {});
		throw err;
	}
}
