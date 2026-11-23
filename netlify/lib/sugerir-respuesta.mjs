// Lo que ve la IA para «Sugerir respuesta» (tarea `respuestaChat` de netlify/lib/tareas.mjs, por /api/ia): lo arma el
// servidor con lo guardado, nunca con lo que mande el navegador. Solo para el administrador o el socio de la casa del
// chat (la casa de hoy; una que ya no es suya, no). Va: la reserva (fechas, noches, personas, estado), lo público de la
// casa (sin dirección, mapa, precios del socio ni nada privado), el primer nombre del cliente y los últimos mensajes
// (los de tipo pago, llegada o foto, solo por su nombre: ni datos de pago ni dirección).
import { leerPublico, listar } from './firestore.mjs';
import { acotado } from './tareas.mjs';

const TOKEN = /^[A-Za-z0-9]{20,40}$/;
const NOMBRE_TIPO = { pago: '(se le mostraron los datos de pago)', llegada: '(se le mostraron la dirección y cómo llegar)', foto: '(subió la foto de su comprobante de pago)', reabierto: '(se le pidió otro comprobante)' };
const QUIEN = { cliente: 'Cliente', socio: 'Anfitrión', equipo: 'Equipo Inmobiliario' };

// El texto para la IA, o null si quien pide no puede ver este chat.
export async function contextoDelChat(token, u) {
	if (!TOKEN.test(token)) return null;
	const chat = await leerPublico(`chats/${token}`);
	if (!chat?.propertyId) return null;
	const casa = await leerPublico(`properties/${chat.propertyId}`);
	const esDelSocio = u.rol === 'socio' && u.propietarioId && chat.propietarioId === u.propietarioId && casa?.propietarioId === u.propietarioId && casa?.operacion === 'vacacional';
	if (u.rol !== 'admin' && !esDelSocio) return null;
	const mensajes = (await listar(`chats/${token}/mensajes`)).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)).slice(-12)
		.map((m) => `${QUIEN[m.de] || 'Equipo Inmobiliario'}: ${m.tipo ? NOMBRE_TIPO[m.tipo] || '' : String(m.texto || '').slice(0, 1000)}`);
	const v = casa?.vacacional || {};
	const deLaCasa = acotado({
		titulo: casa?.titulo, zona: casa?.zona, ciudad: casa?.ciudad, tipo: casa?.tipo, habitaciones: casa?.habitaciones, banos: casa?.banos, parqueos: casa?.parqueos,
		descripcion: String(casa?.descripcion || '').slice(0, 2000), amenidades: casa?.amenidades,
		huespedesMax: v.huespedesMax, entrada: v.checkIn, salida: v.checkOut, mascotas: v.mascotas, reglas: v.reglas, cancelacion: v.cancelacion
	}, { texto: 2000, lista: 40 });
	const reserva = { llegada: chat.llegada, salida: chat.salida, noches: chat.noches, personas: chat.huespedes, estado: chat.estado || 'sin responder', idiomaDelCliente: chat.idioma === 'en' ? 'inglés' : 'español',
		cliente: String(chat.nombre || '').trim().split(/\s+/)[0] || '' };
	return [`<casa>\n${JSON.stringify(deLaCasa)}\n</casa>`, `<reserva>\n${JSON.stringify(reserva)}\n</reserva>`, `<mensajes>\n${mensajes.join('\n')}\n</mensajes>`].join('\n\n');
}
