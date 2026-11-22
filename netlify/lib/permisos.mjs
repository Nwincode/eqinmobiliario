// Permisos de los socios, recalculados en el servidor (cada hora, desde comisiones-vencidas.mjs): con el atraso de la
// comisión se apagan solos a los 7 días y se encienden al pagar. La cuenta vive en admin/js/permisos-socio.js; aquí se
// lee con la cuenta de escritura y se escribe lo que cambió (permisosSocios/{propietarioId}).
// El panel hace lo mismo para un socio al cambiar sus interruptores o marcar su comisión pagada (admin/js/permisos-panel.js).
// Cada socio va en su transacción, leyendo ahí su ficha, lo de todos y sus reservas: si el administrador cambia algo
// mientras tanto (marca pagada, «Devolver»), la transacción se repite con lo nuevo y no escribe un corte viejo.
import { conDatosDelChat } from '../../admin/js/reservas-calculo.js';
import { deudaDe, faltaSaberSiPago, permisosDe, documentoPermisos, mismosPermisos, limpiarDevolver, CLAVES } from '../../admin/js/permisos-socio.js';
import { listar } from './firestore.mjs';
import { transaccion } from './firestore-escritura.mjs';
import { anotarEnTx } from './bitacora.mjs';
import { fotoPropietario, fotoPermisos, igual } from '../../admin/js/bitacora.js';

// Sin documento guardado, todo está permitido: no hace falta crear uno que diga lo mismo.
const todoPermitido = (d) => CLAVES.every((k) => d[k]) && !d.deuda && !d.motivo;
// A quién se le revisa: dueños de casas por noche, o quien ya tiene un documento de permisos.
const esSocio = (p) => Boolean(p.porNoche) || p.tipo === 'socio';

export async function recalcularPermisos(ahora = Date.now()) {
	// Una lectura que falla no es «nadie debe»: si falla, se lanza y no se escribe nada.
	const [propietarios, guardados] = await Promise.all([listar('propietarios'), listar('permisosSocios')]);
	const conDoc = new Set(guardados.map((g) => g.id));
	let cambiados = 0;
	for (const { id } of propietarios.filter((p) => esSocio(p) || conDoc.has(p.id))) {
		const cambio = await transaccion(async ({ leer, consultar, crear, cambiar }) => {
			const ruta = `permisosSocios/${id}`;
			const [prop, global, guardado, reservas] = await Promise.all([
				leer(`propietarios/${id}`), leer('settings/permisosSocios'), leer(ruta), consultar('reservas', 'propietarioId', id)
			]);
			if (!prop) return false;
			// Las de antes sin la marca: su chat dice si el socio marcó «Pago recibido».
			for (const [i, r] of reservas.entries()) if (faltaSaberSiPago(r, id, ahora)) reservas[i] = conDatosDelChat(r, await leer(`chats/${r.chat}`));
			const deuda = deudaDe(reservas, id, ahora);
			const nuevo = documentoPermisos(permisosDe({ global, propio: prop.permisos, deuda }), deuda);
			const limpiar = limpiarDevolver(prop.permisos, deuda);
			if (!limpiar && (mismosPermisos(guardado, nuevo) || (!guardado && todoPermitido(nuevo)))) return false;
			// «Devolver hasta que pague» se apaga solo al pagar: con su renglón en la bitácora (quien: el servidor).
			if (limpiar) {
				const bitacoraId = anotarEnTx({ crear }, { tipo: 'propietario', objeto: id, antes: fotoPropietario(prop), despues: fotoPropietario({ ...prop, permisos: { ...prop.permisos, devolver: false } }) }, { nombre: 'Servidor (pagó lo que debía)' });
				cambiar(`propietarios/${id}`, { 'permisos.devolver': false, ...(bitacoraId ? { bitacoraId } : {}) });
			}
			// Si se apaga o enciende un interruptor (el atraso de la comisión, el pago, o lo que el panel no alcanzó a poner): su
			// renglón en la bitácora (quien: el servidor).
			const antes = fotoPermisos(guardado || {}), despues = fotoPermisos(nuevo);
			const bitacoraId = igual(antes, despues) ? null : anotarEnTx({ crear }, { tipo: 'permisosSocio', objeto: id, antes, despues }, { nombre: 'Servidor (permisos de cada hora)' });
			const datos = { ...nuevo, ...(bitacoraId ? { bitacoraId } : {}) };
			if (guardado) cambiar(ruta, datos, { ahora: ['actualizado'] });
			else crear(ruta, datos, { ahora: ['actualizado'] });
			return true;
		});
		if (cambio) cambiados++;
	}
	return cambiados;
}
