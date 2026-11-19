// Permisos de los socios, recalculados en el servidor (cada hora, desde comisiones-vencidas.mjs): con el atraso de la
// comisión se apagan solos a los 7 días y se encienden al pagar. La cuenta vive en admin/js/permisos-socio.js; aquí solo
// se lee todo con la cuenta de servicio y se escribe lo que cambió (permisosSocios/{propietarioId}).
// El panel hace lo mismo para un socio al cambiar sus interruptores o marcar su comisión pagada (admin/js/permisos-panel.js).
import { deudaDe, permisosDe, documentoPermisos, mismosPermisos, limpiarDevolver, CLAVES } from '../../admin/js/permisos-socio.js';
import { listar, leerPrivado } from './firestore.mjs';
import { transaccion } from './firestore-escritura.mjs';

// Sin documento guardado, todo está permitido: no hace falta crear uno que diga lo mismo.
const todoPermitido = (d) => CLAVES.every((k) => d[k]) && !d.deuda && !d.motivo;

export async function recalcularPermisos(ahora = Date.now()) {
	// Una lectura que falla no es «nadie debe»: si falla, se lanza y no se escribe nada.
	const [reservas, propietarios, guardados, global] = await Promise.all([
		listar('reservas'), listar('propietarios'), listar('permisosSocios'), leerPrivado('settings/permisosSocios')
	]);
	const porId = new Map(guardados.map((g) => [g.id, g]));
	let cambiados = 0;
	for (const p of propietarios) {
		const deuda = deudaDe(reservas, p.id, ahora);
		const nuevo = documentoPermisos(permisosDe({ global, propio: p.permisos, deuda }), deuda);
		const guardado = porId.get(p.id) || null;
		const limpiar = limpiarDevolver(p.permisos, deuda);
		if (!limpiar && (mismosPermisos(guardado, nuevo) || (!guardado && todoPermitido(nuevo)))) continue;
		await transaccion(async ({ leer, crear, cambiar }) => {
			if (limpiar) cambiar(`propietarios/${p.id}`, { 'permisos.devolver': false });
			const ruta = `permisosSocios/${p.id}`;
			if (await leer(ruta)) cambiar(ruta, nuevo, { ahora: ['actualizado'] });
			else crear(ruta, nuevo, { ahora: ['actualizado'] });
		});
		cambiados++;
	}
	return cambiados;
}
