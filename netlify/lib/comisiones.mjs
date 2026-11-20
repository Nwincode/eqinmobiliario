// Socios con una comisión atrasada: { propietarioId: 2 (más de 24 h) | 3 (más de 72 h) }.
// La regla vive en js/calc-vacacional.js; aquí solo se leen las reservas con la cuenta de servicio.
import '../../js/calc-vacacional.js';
import { listar, leerPrivado, donde } from './firestore.mjs';
import { conDatosDelChat } from '../../admin/js/reservas-calculo.js';

const V = globalThis.EQVacacional;
const CHAT = /^[A-Za-z0-9]{20,60}$/;
// Las que todavía no se sabe si castigan (V.cobrable) y ya castigarían: su chat dice si se marcó el pago o hay comprobante.
async function conSuChat(reservas, ahora) {
	return Promise.all(reservas.map(async (r) => (!V.cobrable(r, ahora) && V.nivelComision(r, ahora) >= 2 && CHAT.test(r.chat || '')
		? conDatosDelChat(r, await leerPrivado(`chats/${r.chat}`).catch(() => null)) : r)));
}
// Todos los socios (la publicación y el control de cada hora).
export async function sociosEnMora(ahora = Date.now()) {
	return V.sociosEnMora(await conSuChat(await listar('reservas'), ahora), ahora);
}
// Un socio (la ficha por noche, /api/disponibilidad): solo sus reservas, recordado 5 min en la función.
const RECORDADO = new Map();
export async function moraDe(propietarioId, ahora = Date.now()) {
	if (!propietarioId) return 0;
	const ya = RECORDADO.get(propietarioId);
	if (ya && ahora - ya.cuando < 5 * 60_000) return ya.nivel;
	const nivel = V.sociosEnMora(await conSuChat(await donde('reservas', 'propietarioId', propietarioId), ahora), ahora)[propietarioId] || 0;
	RECORDADO.set(propietarioId, { nivel, cuando: ahora });
	return nivel;
}

// Socios con las casas fuera del sitio (más de 72 h), como texto: el sitio publica el suyo en /pausados.txt
// y comisiones-vencidas.mjs lo compara con el de ahora para saber si hay que volver a publicar.
export const pausados = (mora) => Object.keys(mora).filter((id) => mora[id] === 3).sort().join(',');
