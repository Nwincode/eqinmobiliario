// Enlace nuevo de una reserva (el token de su chat), al corregir el correo del cliente (/api/reenviar-enlace, desde
// admin/js/crm.js corregirCorreo): el enlace viejo pudo llegar a otra persona (un error de dedo), y con él se abre la
// reserva y el chat (y, pagada, la dirección). Se mueve todo lo que lleva el token a uno nuevo, con la cuenta de escritura.
// Las fotos de hoy viven en fotosChat/{solicitud}/, que no cambia: no se mueve ningún archivo (solo las de antes, de
// chats/{viejo}/, que ya nadie puede agregar, pasan a esa carpeta). El chat tiene un tope de mensajes del cliente
// (firestore.rules, `nCliente`), así que esto siempre alcanza:
//  1. Las fotos de antes (si quedan) se copian a fotosChat/{solicitud}/ (copiar otra vez da lo mismo).
//  2. Los mensajes y las notas del equipo se copian al token nuevo, de 400 en 400, fuera de la transacción (el chat nuevo
//     todavía no existe: nadie los ve ni los puede tocar).
//  3. Una transacción cambia el enlace de una vez: crea el chat nuevo, mueve el índice (chatsPorSolicitud), la reserva
//     (`chat`), las traducciones (traduccionesChat) y el aviso de contacto (alertas/contacto-…), borra el chat viejo y
//     escribe lo que se le pase (`junto`: el correo corregido; o los dos o ninguno).
//  4. Lo que llegó al chat viejo entre 2 y 3 se copia también (después de 3 ya no se puede escribir ahí: las reglas piden
//     que el chat exista), y se borra lo viejo (mensajes, notas y fotos de antes).
// Si algo falla antes de 3, el enlace viejo sigue y lo copiado queda sin chat que lo nombre (se limpia al momento); se
// puede repetir. Devuelve el token nuevo ('' si la solicitud no tiene chat).
import { randomBytes } from 'node:crypto';
import { leerPrivado } from './firestore.mjs';
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
	const chatVar = { token: viejo, leadId };
	// 1. Las fotos de antes, a la carpeta de la solicitud (con el mismo nombre).
	const deAntes = await listar(`chats/${viejo}/`);
	const aCarpeta = (ruta) => `${carpetaFotos(leadId)}${ruta.slice(`chats/${viejo}/`.length)}`;
	for (const f of deAntes) await copiar(f.ruta, aCarpeta(f.ruta));
	// 2. Mensajes (la foto de antes, con su ruta nueva) y notas, al token nuevo.
	const copia = (m, base) => {
		const ruta = texto(m.crudo.tipo) === 'foto' ? rutaDeFoto(chatVar, texto(m.crudo.texto)) : '';
		return { poner: `${base}/${m.id}`, crudo: m.crudo, cambios: ruta.startsWith('chats/') ? { texto: aCarpeta(ruta) } : {} };
	};
	const copiarTodo = async (ya = new Set()) => {
		const [mensajes, notas] = await Promise.all([listarCrudo(`chats/${viejo}`, 'mensajes'), listarCrudo(`notasEquipo/${viejo}`, 'notas')]);
		await escribirLote([...mensajes.filter((m) => !ya.has(`m${m.id}`)).map((m) => copia(m, `chats/${nuevo}/mensajes`)),
			...notas.filter((n) => !ya.has(`n${n.id}`)).map((n) => ({ poner: `notasEquipo/${nuevo}/notas/${n.id}`, crudo: n.crudo }))]);
		return { mensajes, notas, ids: new Set([...mensajes.map((m) => `m${m.id}`), ...notas.map((n) => `n${n.id}`)]) };
	};
	const primera = await copiarTodo();
	// 3. El cambio de enlace, de una vez.
	try {
		await transaccion(async ({ leer, consultar, leerCrudo, crearCrudo, cambiar, borrar: quitar }) => {
			const [indice, chat, traducciones, alerta, reservas] = await Promise.all([
				leer(`chatsPorSolicitud/${leadId}`), leerCrudo(`chats/${viejo}`), leerCrudo(`traduccionesChat/${viejo}`), leerCrudo(`alertas/contacto-${viejo}`), consultar('reservas', 'chat', viejo)]);
			// Otro ya lo cambió mientras tanto: nada que hacer aquí.
			if (indice?.token !== viejo || !chat) throw Object.assign(new Error('El enlace ya cambió'), { codigo: 'ABORTED_ENLACE' });
			crearCrudo(`chats/${nuevo}`, chat.crudo);
			if (traducciones) { crearCrudo(`traduccionesChat/${nuevo}`, traducciones.crudo); quitar(`traduccionesChat/${viejo}`); }
			if (alerta) { crearCrudo(`alertas/contacto-${nuevo}`, alerta.crudo); quitar(`alertas/contacto-${viejo}`); }
			for (const r of reservas) cambiar(`reservas/${r.id}`, { chat: nuevo });
			cambiar(`chatsPorSolicitud/${leadId}`, { token: nuevo });
			quitar(`chats/${viejo}`);
			if (junto) await junto({ leer, cambiar });
		}, 3, 6000);
	} catch (err) {
		// Lo copiado no lo nombra ningún chat: se borra (si esto también falla, queda sin uso: nadie conoce ese token).
		await escribirLote([...primera.mensajes.map((m) => ({ borrar: `chats/${nuevo}/mensajes/${m.id}` })), ...primera.notas.map((n) => ({ borrar: `notasEquipo/${nuevo}/notas/${n.id}` }))]).catch(() => {});
		throw err;
	}
	// 4. Lo que llegó en medio, y se borra lo viejo.
	const final = await copiarTodo(primera.ids).catch((err) => { console.error('Enlace nuevo (lo último):', err.message); return primera; });
	await escribirLote([...final.mensajes.map((m) => ({ borrar: `chats/${viejo}/mensajes/${m.id}` })), ...final.notas.map((n) => ({ borrar: `notasEquipo/${viejo}/notas/${n.id}` }))])
		.catch((err) => console.warn('Enlace viejo (borrar):', err.message));
	for (const f of deAntes) await borrar(f.ruta).catch((err) => console.warn('Foto vieja del chat:', err.message));
	return nuevo;
}
