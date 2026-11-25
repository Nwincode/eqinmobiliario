// Enlace nuevo de una reserva (el token de su chat), al corregir el correo del cliente (/api/reenviar-enlace, desde
// admin/js/crm.js corregirCorreo): el enlace viejo pudo llegar a otra persona (un error de dedo), y con él se abre la
// reserva y el chat (y, pagada, la dirección). Se mueve todo lo que lleva el token a uno nuevo, con la cuenta de escritura:
//  1. Storage: las fotos de chats/{viejo}/ se copian a chats/{nuevo}/ (copiar otra vez la misma da lo mismo).
//  2. Una transacción: el chat, sus mensajes (las fotos, con su ruta nueva), las notas del equipo (notasEquipo/), el índice
//     (chatsPorSolicitud), la reserva (`chat`), las traducciones (traduccionesChat) y el aviso de contacto
//     (alertas/contacto-…): todo nace con el nuevo y se borra el viejo, o nada.
//  3. Se borran las fotos viejas (si falla, quedan sin nada que las nombre: ni la regla ni /api/foto las abren).
// Devuelve el token nuevo ('' si la solicitud no tiene chat). Si la transacción falla, lanza y el enlace viejo sigue (se
// puede repetir: lo copiado se vuelve a copiar).
import { randomBytes } from 'node:crypto';
import { leerPrivado } from './firestore.mjs';
import { transaccion } from './firestore-escritura.mjs';
import { listar, copiar, borrar } from './storage.mjs';
import { rutaDeFoto } from '../../admin/js/hilo.js';

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
	const fotos = await listar(`chats/${viejo}/`);
	const aNuevo = (ruta) => `chats/${nuevo}/${ruta.slice(`chats/${viejo}/`.length)}`;
	for (const f of fotos) await copiar(f.ruta, aNuevo(f.ruta));
	await transaccion(async ({ leer, consultar, leerCrudo, listarCrudo, crearCrudo, cambiar, borrar: quitar }) => {
		const [indice, chat, mensajes, notas, traducciones, alerta, reservas] = await Promise.all([
			leer(`chatsPorSolicitud/${leadId}`), leerCrudo(`chats/${viejo}`), listarCrudo(`chats/${viejo}`, 'mensajes'), listarCrudo(`notasEquipo/${viejo}`, 'notas'),
			leerCrudo(`traduccionesChat/${viejo}`), leerCrudo(`alertas/contacto-${viejo}`), consultar('reservas', 'chat', viejo)]);
		// Otro ya lo cambió mientras tanto: nada que hacer aquí.
		if (indice?.token !== viejo || !chat) throw Object.assign(new Error('El enlace ya cambió'), { codigo: 'ABORTED_ENLACE' });
		crearCrudo(`chats/${nuevo}`, chat.crudo);
		for (const m of mensajes) {
			// La foto, con su ruta en la carpeta nueva (la de antes, con el token de descarga, queda como ruta).
			const ruta = texto(m.crudo.tipo) === 'foto' ? rutaDeFoto(viejo, texto(m.crudo.texto)) : '';
			crearCrudo(`chats/${nuevo}/mensajes/${m.id}`, m.crudo, ruta ? { texto: aNuevo(ruta) } : {});
			quitar(`chats/${viejo}/mensajes/${m.id}`);
		}
		for (const n of notas) { crearCrudo(`notasEquipo/${nuevo}/notas/${n.id}`, n.crudo); quitar(`notasEquipo/${viejo}/notas/${n.id}`); }
		if (traducciones) { crearCrudo(`traduccionesChat/${nuevo}`, traducciones.crudo); quitar(`traduccionesChat/${viejo}`); }
		if (alerta) { crearCrudo(`alertas/contacto-${nuevo}`, alerta.crudo); quitar(`alertas/contacto-${viejo}`); }
		for (const r of reservas) cambiar(`reservas/${r.id}`, { chat: nuevo });
		cambiar(`chatsPorSolicitud/${leadId}`, { token: nuevo });
		quitar(`chats/${viejo}`);
		if (junto) await junto({ leer, cambiar });
	}, 3, 8000);
	for (const f of fotos) await borrar(f.ruta).catch((err) => console.warn('Foto vieja del chat:', err.message));
	return nuevo;
}
