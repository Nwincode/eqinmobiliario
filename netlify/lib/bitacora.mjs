// La bitácora de cambios sensibles desde el servidor (lo que el panel anota con admin/js/bitacora-panel.js): el renglón va
// en la MISMA transacción que el cambio (firestore-escritura.mjs `transaccion`), con las mismas fotos de
// admin/js/bitacora.js. La cuenta de escritura no pasa por las reglas: aquí se arma igual que lo exigen.
import { idNuevo } from './firestore-escritura.mjs';
import { renglon } from '../../admin/js/bitacora.js';

// tx: { crear } de la transacción. Devuelve el id para el `bitacoraId` del documento que cambia, o null si no cambió nada.
export function anotarEnTx(tx, datos, { quien = 'servidor', nombre = 'Servidor' } = {}) {
	const r = renglon(datos);
	if (!r) return null;
	const id = idNuevo();
	tx.crear(`bitacora/${id}`, { ...r, quien, nombre: String(nombre || '').slice(0, 120) }, { ahora: ['cuando'] });
	return id;
}
