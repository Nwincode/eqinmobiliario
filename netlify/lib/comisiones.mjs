// Socios con una comisión atrasada: { propietarioId: 2 (más de 24 h) | 3 (más de 72 h) }.
// La regla vive en js/calc-vacacional.js; aquí solo se leen las reservas con la cuenta de servicio.
import '../../js/calc-vacacional.js';
import { listar, leerPrivado } from './firestore.mjs';

const V = globalThis.EQVacacional;
// Solo castigan las comisiones cobrables (V.cobrable): las de antes sin la marca, su chat dice si se marcó el pago.
export async function sociosEnMora(ahora = Date.now()) {
	const reservas = await listar('reservas');
	await Promise.all(reservas.filter((r) => !V.cobrable(r) && V.nivelComision(r, ahora) >= 2 && /^[A-Za-z0-9]{20,60}$/.test(r.chat || ''))
		.map(async (r) => { r.chatPagado = (await leerPrivado(`chats/${r.chat}`).catch(() => null))?.estado === 'pagada'; }));
	return V.sociosEnMora(reservas, ahora);
}

// Socios con las casas fuera del sitio (más de 72 h), como texto: el sitio publica el suyo en /pausados.txt
// y comisiones-vencidas.mjs lo compara con el de ahora para saber si hay que volver a publicar.
export const pausados = (mora) => Object.keys(mora).filter((id) => mora[id] === 3).sort().join(',');
