// Socios con una comisión atrasada: { propietarioId: 2 (más de 24 h) | 3 (más de 72 h) }.
// La regla vive en js/calc-vacacional.js; aquí solo se leen las reservas con la cuenta de servicio.
import '../../js/calc-vacacional.js';
import { listar } from './firestore.mjs';

export const sociosEnMora = async () => globalThis.EQVacacional.sociosEnMora(await listar('reservas'), Date.now());

// Socios con las casas fuera del sitio (más de 72 h), como texto: el sitio publica el suyo en /pausados.txt
// y comisiones-vencidas.mjs lo compara con el de ahora para saber si hay que volver a publicar.
export const pausados = (mora) => Object.keys(mora).filter((id) => mora[id] === 3).sort().join(',');
