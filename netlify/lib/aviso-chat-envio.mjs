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
import { enviarCorreo, servicioCorreo, destinatariosEquipo, plantilla, boton, datos, pasos, esc, conUrgente, coloresCorreo, SITE_URL } from './correo.mjs';
import '../../js/calc-vacacional.js';
import { avisosChat, contactoPartido } from './avisos-chat.mjs';
import { quitarRebote } from './rebotes.mjs';
import { limitadorDurable } from './limite.mjs';
import { bajoElPlan, TEXTO_CONFIRMA_EQUIPO } from '../../admin/js/reservas-calculo.js';
import { prefijoMoneda, miles } from '../../admin/js/formato.js';
import { PARECE } from '../../admin/js/mi-casa.js';
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
	// El cliente volvió a escribir después de que su correo rebotara: ya se le alcanza, la marca se quita (rebotes.mjs).
	// Aparte: si falla, los avisos salen igual.
	const delCliente = mensajes.filter((m) => m.de === 'cliente').at(-1);
	if (lead?.reboteCorreo && delCliente) await quitarRebote(chat.leadId, delCliente.createdAt).catch((err) => console.error('Rebote (quitar):', err.message));
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
				titulo: a.titulo, intro: a.urgente ? conUrgente(await coloresCorreo(), a.intro, a.urgente) : esc(a.intro), preheader: a.intro, lang: a.lang, ayuda: a.rol === 'cliente',
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

// Un contacto partido en varios mensajes (avisos-chat.mjs contactoPartido): un correo al equipo para que revise la
// conversación; no se bloquea nada después. Se aparta en alertas/contacto-{token} (solo la cuenta de escritura: sin `match`
// en las reglas) por el id del último mensaje: dos llamadas a /api/aviso-chat no lo mandan dos veces; a lo más
// TOPE_CONTACTO por chat. Lo llama /api/aviso-chat después de responder; si falla, solo se anota en el registro.
const V = globalThis.EQVacacional;
export const TOPE_CONTACTO = 10;
export async function avisarContactoPartido(token) {
	if (!servicioCorreo() || !destinatariosEquipo().length || !escrituraConfigurada()) return false;
	const [chat, mensajes] = await Promise.all([leerPublico(`chats/${token}`), listar(`chats/${token}/mensajes`)]);
	const hallado = chat && contactoPartido(mensajes, V.tieneContacto, V.tipoDeContacto);
	if (!hallado) return false;
	const ruta = `alertas/contacto-${token}`, ultimo = hallado.ids.at(-1);
	const toca = await transaccion(async ({ leer, crear, cambiar }) => {
		const prev = await leer(ruta);
		if (prev?.ultimo === ultimo || (Number(prev?.n) || 0) >= TOPE_CONTACTO) return false;
		const datosAlerta = { ultimo, n: (Number(prev?.n) || 0) + 1, de: hallado.de, codigo: String(chat.codigo || '') };
		if (prev) cambiar(ruta, datosAlerta, { ahora: ['cuando'] }); else crear(ruta, datosAlerta, { ahora: ['cuando'] });
		return true;
	// Chocó con otra llamada a la vez: la que ganó lo manda. Otra falla, al registro.
	}).catch((err) => { if (err.codigo !== 'ALREADY_EXISTS') console.error('Contacto partido (apartar):', err.message); return false; });
	if (!toca) return false;
	// El código y la casa, de la solicitud guardada (como «Te toca confirmar»).
	const lead = chat.leadId ? await leerPrivado(`leads/${chat.leadId}`).catch(() => null) : null;
	const codigo = String(lead?.reserva?.codigo || chat.codigo || '');
	const quien = hallado.de === 'cliente' ? 'El cliente' : 'El socio';
	const intro = `${quien} escribió en ${hallado.ids.length} mensajes seguidos algo que, junto, ${PARECE[hallado.tipo] || 'parece un contacto'}. Ya se enviaron: revisa la conversación.`;
	const url = `${SITE_URL}/admin/#/mensajes/${encodeURIComponent(codigo)}`;
	const filas = [['Solicitud', codigo], ['Casa', lead?.propertyTitulo || '']].filter((f) => f[1]);
	const html = await plantilla({ titulo: 'Posible contacto en el chat', intro: esc(intro), preheader: intro, lang: 'es',
		bloques: (c) => datos(c, filas) + boton(c, 'Abrir la conversación', url, c.primary, { ancho: true }) });
	await enviarCorreo({ para: destinatariosEquipo(), asunto: `Posible contacto en el chat: ${codigo}`.trim(), html, texto: [intro, '', ...filas.map(([k, v]) => `${k}: ${v}`), '', url].join('\n') });
	return true;
}

// El enlace de su reserva, otra vez, al correo GUARDADO en la solicitud (nunca a quien lo pide). Dos casos:
//  - 'repetida': quien pide las mismas fechas con el mismo correo desde otro navegador (/api/solicitud no le devuelve el
//    token: el correo, la casa y las fechas los puede conocer otra persona). A lo más 1 cada 10 min y 3 al día por solicitud.
//  - 'correo': el equipo corrigió su correo (/api/reenviar-enlace, desde admin/js/crm.js corregirCorreo): le llega lo que
//    se perdió (su reserva, su estado y el chat). Su límite va por solicitud y correo (1 cada 10 min a cada correo): si se
//    corrige un error de dedo un minuto después, el correo bueno también lo recibe; y 6 al día por solicitud.
// Devuelve el correo al que salió ('' si no salió).
const LIMITES = {
	repetida: [limitadorDurable('enlace-reserva-10min', 1, 10 * 60_000), limitadorDurable('enlace-reserva-dia', 3, 24 * 3_600_000)],
	correo: [limitadorDurable('enlace-correo-10min', 1, 10 * 60_000), limitadorDurable('enlace-correo-dia', 6, 24 * 3_600_000)]
};
const INTRO = {
	repetida: ['Alguien (seguramente tú) volvió a pedir las mismas fechas con este correo. Esta es tu reserva: no hace falta pedirla otra vez.',
		'Someone (probably you) asked again for the same dates with this email. This is your booking: you do not need to request it again.'],
	correo: ['Corregimos tu correo: por eso no te llegaban nuestros avisos. Aquí ves tu reserva, cómo va y el chat.',
		'We corrected your email address, so our updates had not reached you. Here you can see your booking, its status and the chat.']
};
// `para`: el correo que queda guardado con `antes` (el corregido, que se guarda en esa misma transacción). `antes(token)`:
// lo que se hace pasados los límites y antes de mandar; devuelve el token del enlace que sale (/api/reenviar-enlace: el
// nuevo, netlify/lib/rotar-enlace.mjs). Si lanza, no sale nada.
export async function reenviarEnlace(leadId, { motivo = 'repetida', para: corregido = '', antes = null } = {}) {
	const [lead, indice] = await Promise.all([leerPrivado(`leads/${leadId}`), leerPrivado(`chatsPorSolicitud/${leadId}`)]);
	let token = indice?.token;
	const para = String(corregido || lead?.email || '').trim().toLowerCase();
	if (!para || !LIMITES[motivo] || !/^[A-Za-z0-9]{20,40}$/.test(token || '') || !servicioCorreo()) return '';
	const [corto, dia] = LIMITES[motivo];
	if (await corto(motivo === 'correo' ? `${leadId}:${para}` : leadId) || await dia(leadId)) return '';
	if (antes) token = (await antes(token)) || token;
	const en = lead.idioma === 'en', codigo = lead.reserva?.codigo || '';
	const url = `${SITE_URL}${en ? '/en/reservation/' : '/reserva/'}#${token}`;
	const titulo = en ? 'The link to your booking' : 'El enlace de tu reserva';
	const intro = INTRO[motivo][en ? 1 : 0];
	const html = await plantilla({ titulo, intro: esc(intro), preheader: intro, lang: en ? 'en' : 'es', ayuda: true, etiqueta: `${en ? 'Booking' : 'Solicitud'} ${codigo}`,
		pie: en ? 'You get this because you requested a booking on eqinmobiliario.gt.' : 'Lo recibes porque pediste una reserva en eqinmobiliario.gt.',
		bloques: (c) => boton(c, en ? 'See my booking and chat' : 'Ver mi reserva y el chat', url, c.primary, { ancho: true }) });
	await enviarCorreo({ para: [para], asunto: `${titulo} ${codigo}`.trim(), html, texto: [titulo, intro, '', url].join('\n') });
	return para;
}
