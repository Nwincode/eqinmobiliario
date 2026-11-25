// Enlace nuevo de una reserva (el token de su chat), al corregir el correo del cliente (/api/reenviar-enlace, desde
// admin/js/crm.js corregirCorreo): el enlace viejo pudo llegar a otra persona (un error de dedo), y con él se abre la
// reserva y el chat (y, pagada, la dirección). Se mueve todo lo que lleva el token a uno nuevo, con la cuenta de escritura.
// Las fotos de hoy viven en fotosChat/{solicitud}/, que no cambia: no se mueve ningún archivo (solo las de antes, de
// chats/{viejo}/, que ya nadie puede agregar, pasan a esa carpeta). El chat tiene un tope de mensajes del cliente
// (firestore.rules, `nCliente`), así que esto siempre alcanza:
//  1. Las fotos de antes (si quedan) se copian a fotosChat/{solicitud}/ (copiar otra vez da lo mismo).
//  2. Los mensajes y las notas del equipo (también las de antes, de chats/{viejo}/notas) se copian al token nuevo, de 400 en 400, fuera de la transacción (el chat nuevo
//     todavía no existe: nadie los ve ni los puede tocar).
//  3. Una transacción cambia el enlace de una vez: crea el chat nuevo, mueve el índice (chatsPorSolicitud), la reserva
//     (`chat`), las traducciones (traduccionesChat) y el aviso de contacto (alertas/contacto-…), borra el chat viejo y
//     escribe lo que se le pase (`junto`: el correo corregido; o los dos o ninguno).
//  4. Todo lo del viejo se copia otra vez (lo que llegó entre 2 y 3 y lo que cambió, como una traducción; después de 3
//     ya no se puede escribir ahí: las reglas piden que el chat exista), y se borra lo viejo. Si falla, queda anotado
//     (rotaciones/{viejo}) y lo termina el control de cada hora.
// Si algo falla antes de 3, el enlace viejo sigue y lo copiado queda sin chat que lo nombre (se limpia al momento); se
// puede repetir. Si el commit de 3 llegó pero su respuesta no, se relee el índice y se sigue. Devuelve el token nuevo ('' si la solicitud no tiene chat).
import { randomBytes } from 'node:crypto';
import { leerPrivado, listar as listarTodo } from './firestore.mjs';
import { transaccion, listarCrudo, escribirLote } from './firestore-escritura.mjs';
import { listar, copiar, borrar } from './storage.mjs';
import { rutaDeFoto, carpetaFotos } from '../../admin/js/hilo.js';

const TOKEN = /^[A-Za-z0-9]{20,40}$/;
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
// Como los que pone la página al pedir la reserva (js/site.js, 28 letras y cifras al azar).
export const tokenNuevo = () => [...randomBytes(28)].map((b) => LETRAS[b % LETRAS.length]).join('');
// Un texto de un documento crudo ({ stringValue }; en las pruebas simuladas, el texto tal cual).
const texto = (v) => (typeof v === 'string' ? v : v?.stringValue ?? '');

// `junto(tx)`: lo que se escribe en la misma transacción (el correo corregido: o cambian los dos o ninguno).
export async function rotarEnlace(leadId, { nuevo = tokenNuevo(), junto = null } = {}) {
	const viejo = (await leerPrivado(`chatsPorSolicitud/${leadId}`))?.token || '';
	if (!TOKEN.test(viejo) || !TOKEN.test(nuevo) || viejo === nuevo) return '';
	// Un índice que apunta a un chat que ya no existe: no hay nada que mover (quien llama guarda solo el correo).
	if (!(await leerPrivado(`chats/${viejo}`))) return '';
	// 1. Las fotos de antes, a la carpeta de la solicitud (con el mismo nombre).
	const deAntes = await listar(`chats/${viejo}/`);
	const aCarpeta = (ruta) => `${carpetaFotos(leadId)}${ruta.slice(`chats/${viejo}/`.length)}`;
	for (const f of deAntes) await copiar(f.ruta, aCarpeta(f.ruta));
	// 2. Mensajes y notas, al token nuevo.
	const primera = await copiarAlNuevo(viejo, nuevo, leadId);
	// 3. El cambio de enlace, de una vez.
	try {
		await transaccion(async ({ leer, consultar, leerCrudo, crearCrudo, cambiar, borrar: quitar }) => {
			const [indice, chat, traducciones, alerta, reservas] = await Promise.all([
				leer(`chatsPorSolicitud/${leadId}`), leerCrudo(`chats/${viejo}`), leerCrudo(`traduccionesChat/${viejo}`), leerCrudo(`alertas/contacto-${viejo}`), consultar('reservas', 'chat', viejo)]);
			// Otro ya lo cambió mientras tanto: nada que hacer aquí.
			if (indice?.token !== viejo || !chat) throw Object.assign(new Error('El enlace ya cambió'), { codigo: 'ABORTED_ENLACE' });
			// `gen`: los topes del cliente (mensajes y fotos) vuelven a empezar con el enlace nuevo (firestore.rules, storage.rules).
			const gen = Number(chat.crudo.gen?.integerValue ?? chat.crudo.gen ?? 0) + 1;
			crearCrudo(`chats/${nuevo}`, chat.crudo, { gen });
			if (traducciones) { crearCrudo(`traduccionesChat/${nuevo}`, traducciones.crudo); quitar(`traduccionesChat/${viejo}`); }
			if (alerta) { crearCrudo(`alertas/contacto-${nuevo}`, alerta.crudo); quitar(`alertas/contacto-${viejo}`); }
			for (const r of reservas) cambiar(`reservas/${r.id}`, { chat: nuevo });
			cambiar(`chatsPorSolicitud/${leadId}`, { token: nuevo });
			quitar(`chats/${viejo}`);
			if (junto) await junto({ leer, cambiar });
		}, 3, 6000);
	} catch (err) {
		// El commit pudo llegar aunque su respuesta se perdiera: si el índice ya dice el nuevo, el enlace cambió y se sigue.
		const ahora = await leerPrivado(`chatsPorSolicitud/${leadId}`).catch(() => null);
		if (ahora?.token !== nuevo) {
			// Lo copiado no lo nombra ningún chat: se borra (si esto también falla, queda sin uso: nadie conoce ese token).
			await escribirLote([...primera.mensajes.map((m) => ({ borrar: `chats/${nuevo}/mensajes/${m.id}` })), ...[...primera.notasDeAntes, ...primera.notas].map((n) => ({ borrar: `notasEquipo/${nuevo}/notas/${n.id}` }))]).catch(() => {});
			throw err;
		}
	}
	// 4. Lo que llegó en medio (y lo que cambió, como una traducción), y se borra lo viejo. Si no se puede, queda anotado
	// en rotaciones/{viejo} y lo termina el control de cada hora (terminarRotaciones).
	try {
		await terminarRotacion(viejo, nuevo, leadId);
	} catch (err) {
		console.error('Enlace nuevo (terminar):', err.message);
		await transaccion(({ leer, crear }) => leer(`rotaciones/${viejo}`).then((r) => { if (!r) crear(`rotaciones/${viejo}`, { nuevo, leadId }, { ahora: ['cuando'] }); })).catch(() => {});
	}
	return nuevo;
}

// Copia los mensajes y las notas del token viejo al nuevo (las fotos de antes, con su ruta en la carpeta de la solicitud).
async function copiarAlNuevo(viejo, nuevo, leadId) {
	const chatVar = { token: viejo, leadId };
	const aCarpeta = (ruta) => `${carpetaFotos(leadId)}${ruta.slice(`chats/${viejo}/`.length)}`;
	// Las notas de antes que la migración todavía no pasó (chats/{viejo}/notas) también van a notasEquipo/{nuevo}: si se
	// quedaran, al borrar el chat viejo nadie las vería.
	const [mensajes, notas, notasDeAntes] = await Promise.all([listarCrudo(`chats/${viejo}`, 'mensajes'), listarCrudo(`notasEquipo/${viejo}`, 'notas'), listarCrudo(`chats/${viejo}`, 'notas')]);
	await escribirLote([...mensajes.map((m) => {
		const ruta = texto(m.crudo.tipo) === 'foto' ? rutaDeFoto(chatVar, texto(m.crudo.texto)) : '';
		return { poner: `chats/${nuevo}/mensajes/${m.id}`, crudo: m.crudo, cambios: ruta.startsWith('chats/') ? { texto: aCarpeta(ruta) } : {} };
	}), ...[...notasDeAntes, ...notas].map((n) => ({ poner: `notasEquipo/${nuevo}/notas/${n.id}`, crudo: n.crudo }))]);
	return { mensajes, notas, notasDeAntes };
}

// Termina un cambio de enlace ya hecho: copia otra vez todo lo del viejo al nuevo (lo que llegó en medio y lo que cambió
// después de la primera copia) y lo borra; borra las fotos de antes ya copiadas. Se puede repetir.
export async function terminarRotacion(viejo, nuevo, leadId) {
	const copia = await copiarAlNuevo(viejo, nuevo, leadId);
	await escribirLote([...copia.mensajes.map((m) => ({ borrar: `chats/${viejo}/mensajes/${m.id}` })), ...copia.notas.map((n) => ({ borrar: `notasEquipo/${viejo}/notas/${n.id}` })),
		...copia.notasDeAntes.map((n) => ({ borrar: `chats/${viejo}/notas/${n.id}` }))]);
	for (const f of await listar(`chats/${viejo}/`)) await borrar(f.ruta).catch((err) => console.warn('Foto vieja del chat:', err.message));
}

// Lo que quedó sin terminar (rotaciones/{viejo}): lo llama el control de cada hora (solicitudes-sin-respuesta.mjs).
export async function terminarRotaciones() {
	let hechas = 0;
	for (const r of await listarTodo('rotaciones')) {
		try {
			await terminarRotacion(r.id, r.nuevo, r.leadId);
			await escribirLote([{ borrar: `rotaciones/${r.id}` }]);
			hechas++;
		} catch (err) { console.error('Enlace nuevo pendiente:', err.message); }
	}
	return hechas;
}
