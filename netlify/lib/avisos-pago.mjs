// Correo al equipo cuando cambian los datos de pago de un socio (lo que el cliente recibe en el chat al confirmar).
// Cada cambio lo deja el panel en la bitácora de cambios sensibles (bitacora/{id}, tipo «propietario», con quién, cuándo,
// antes y después; los de antes, en cambiosDatosPago/{id}) con `avisado: false`; aquí se manda uno por cambio y se marca
// avisado (cuenta de escritura).
// Lo llaman /api/aviso-pago (el panel, al guardar) y el control de cada hora (lo que no salió).
import { donde, leerPrivado } from './firestore.mjs';
import { escrituraConfigurada, transaccion } from './firestore-escritura.mjs';
import { firma } from '../../admin/js/bitacora.js';
import { servicioCorreo, destinatariosEquipo, enviarCorreo, plantilla, datos, boton, SITE_URL } from './correo.mjs';

const fecha = (v) => new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(v));

// Devuelve cuántos correos salieron (null si no hay correo o cuenta de escritura: queda pendiente).
export async function avisarCambiosDePago() {
	if (!servicioCorreo() || !destinatariosEquipo().length || !escrituraConfigurada()) return null;
	let enviados = 0;
	// Los dos lugares, con la misma forma: { col, id, propietarioId, antes, despues, nombre, cuando }.
	const [nuevos, deAntes] = await Promise.all([donde('bitacora', 'avisado', false), donde('cambiosDatosPago', 'avisado', false)]);
	const lista = [
		...nuevos.filter((b) => b.tipo === 'propietario').map((b) => ({ col: 'bitacora', id: b.id, propietarioId: b.objeto, antes: b.antes?.datosPago, despues: b.despues?.datosPago, quien: b.quien, nombre: b.nombre, cuando: b.cuando })),
		...deAntes.map((c) => ({ col: 'cambiosDatosPago', ...c }))
	];
	for (const c of lista) {
		// Se aparta en una transacción: dos llamadas a la vez no mandan el mismo correo dos veces.
		const mio = await transaccion(async ({ leer, cambiar }) => {
			const ahora = await leer(`${c.col}/${c.id}`);
			if (!ahora || ahora.avisado !== false) return false;
			cambiar(`${c.col}/${c.id}`, { avisado: true });
			return true;
		}).catch((err) => { console.error('Datos de pago (apartar):', err.message); return false; });
		if (!mio) continue;
		// Los datos por partes vienen en renglones (admin/js/datos-pago.js): en el correo, en una línea con «·».
		const enLinea = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean).join(' · ');
		const socio = (await leerPrivado(`propietarios/${c.propietarioId}`).catch(() => null))?.nombre || c.propietarioId;
		// Quién: el nombre de su usuario (el `nombre` del renglón lo escribe quien anota; las reglas solo atan `quien`).
		const usuario = /^[A-Za-z0-9_-]{1,128}$/.test(String(c.quien || '')) ? await leerPrivado(`users/${c.quien}`).catch(() => null) : null;
		const filas = [['Socio', socio], ['Cambió', `${firma(c, { [c.quien]: usuario }) || 'Administrador'} · ${fecha(c.cuando)}`], ['Antes', enLinea(c.antes) || '(sin datos)'], ['Ahora', enLinea(c.despues) || '(sin datos)']];
		const html = await plantilla({
			titulo: 'Cambiaron los datos de pago de un socio',
			intro: 'Es la cuenta a la que el cliente paga al confirmar su reserva. Si no lo reconoces, revísalo ya en su ficha.',
			bloques: (col) => datos(col, filas) + boton(col, 'Abrir su ficha', `${SITE_URL}/admin/#/propietarios/${c.propietarioId}`, col.primary, { ancho: true })
		});
		try {
			await enviarCorreo({ para: destinatariosEquipo(), asunto: `Datos de pago cambiados: ${socio}`, html, texto: [...filas.map(([k, v]) => `${k}: ${v}`), `${SITE_URL}/admin/#/propietarios/${c.propietarioId}`].join('\n') });
			enviados++;
		} catch (err) {
			// No salió: vuelve a quedar pendiente para la siguiente vuelta.
			console.error('Datos de pago (correo):', err.message);
			await transaccion(({ cambiar }) => cambiar(`${c.col}/${c.id}`, { avisado: false })).catch(() => {});
		}
	}
	return enviados;
}
