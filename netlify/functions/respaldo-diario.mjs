// Cada día: revisa que la base tenga un respaldo reciente (la copia diaria programada de Firestore) y si está prendida la
// recuperación a un punto en el tiempo (PITR), y lo anota en estado/respaldo para «Estado del sistema» (solo lo lee el
// administrador). Cómo se activan y cómo se restaura: docs/respaldo-y-restauracion.md.
// Lee con la cuenta de solo lectura (GOOGLE_SA_*), que para ver los respaldos necesita además el rol «Cloud Datastore
// Backups Viewer» (roles/datastore.backupsViewer); escribe con la de escritura. Apagada hasta que el dueño dé ese rol y
// ponga REVISAR_RESPALDO=si en Netlify: sin el rol, anotaría un fallo todos los días.
import siteConfig from '../../site.config.json' with { type: 'json' };
import { googleToken, googleConfigurado } from '../lib/google.mjs';
import { SCOPE_DATOS } from '../lib/firestore.mjs';
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';

const PROYECTO = siteConfig.firebase.projectId;
const ADMIN = `https://firestore.googleapis.com/v1/projects/${PROYECTO}`;
const BASE = `projects/${PROYECTO}/databases/(default)`;
// La copia diaria no sale a la misma hora cada día: con 48 h no hay falsas alarmas y un día sin copia sí se ve.
export const HORAS_MAXIMAS = 48;

async function pedir(token, url) {
	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	const datos = await res.json().catch(() => ({}));
	if (!res.ok) throw Object.assign(new Error(res.status === 403 ? 'La cuenta de servicio no tiene el rol «Cloud Datastore Backups Viewer».' : datos.error?.message || `Error ${res.status}`), { status: res.status });
	return datos;
}

// El estado del respaldo: el último listo de la base, cuántos hay y si PITR está prendido (null si no se pudo saber).
export async function revisarRespaldo() {
	const token = await googleToken(SCOPE_DATOS);
	const { backups = [] } = await pedir(token, `${ADMIN}/locations/-/backups`);
	const listos = backups.filter((b) => b.database === BASE && b.state === 'READY' && b.snapshotTime).sort((a, b) => Date.parse(b.snapshotTime) - Date.parse(a.snapshotTime));
	const ultimo = listos[0] ? new Date(listos[0].snapshotTime) : null;
	const pitr = await pedir(token, `${ADMIN}/databases/(default)`).then((d) => d.pointInTimeRecoveryEnablement === 'POINT_IN_TIME_RECOVERY_ENABLED').catch(() => null);
	const horas = ultimo ? (Date.now() - ultimo.getTime()) / 3600_000 : Infinity;
	return {
		ok: horas <= HORAS_MAXIMAS,
		ultimo,
		respaldos: listos.length,
		pitr,
		motivo: !ultimo ? 'No hay ningún respaldo de la base.' : horas > HORAS_MAXIMAS ? `El último respaldo tiene ${Math.floor(horas)} horas.` : ''
	};
}

export default async () => {
	if (process.env.REVISAR_RESPALDO !== 'si' || !googleConfigurado() || !escrituraConfigurada()) return;
	let estado;
	try {
		estado = await revisarRespaldo();
	} catch (err) {
		estado = { ok: false, ultimo: null, respaldos: 0, pitr: null, motivo: `No se pudo revisar: ${err.message}` };
	}
	try {
		await transaccion(async ({ leer, crear, cambiar }) => {
			if (await leer('estado/respaldo')) cambiar('estado/respaldo', estado, { ahora: ['revisado'] });
			else crear('estado/respaldo', estado, { ahora: ['revisado'] });
		});
		if (!estado.ok) console.error('respaldo-diario:', estado.motivo);
	} catch (err) {
		console.error('respaldo-diario (guardar):', err.message);
	}
};

// Cada día a las 14:41 UTC (8:41 en Guatemala).
export const config = { schedule: '41 14 * * *' };
