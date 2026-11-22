// Cada día: revisa que la base tenga un respaldo reciente (la copia diaria programada de Firestore) y si está prendida la
// recuperación a un punto en el tiempo (PITR), y lo anota en estado/respaldo para «Estado del sistema» (solo lo lee el
// administrador). Cómo se activan y cómo se restaura: docs/respaldo-y-restauracion.md.
// Lee con la cuenta de solo lectura (GOOGLE_SA_*), que para ver los respaldos necesita además el rol «Cloud Datastore
// Backups Viewer» (roles/datastore.backupsViewer); escribe con la de escritura. Apagada hasta que el dueño dé ese rol y
// ponga REVISAR_RESPALDO=si en Netlify: sin el rol, anotaría un fallo todos los días.
import siteConfig from '../../site.config.json' with { type: 'json' };
import { googleToken, googleConfigurado } from '../lib/google.mjs';
import { SCOPE_DATOS } from '../lib/firestore.mjs';
import { escrituraConfigurada } from '../lib/firestore-escritura.mjs';
import { anotarOk, anotarFallo } from '../lib/estado.mjs';

const PROYECTO = siteConfig.firebase.projectId;
const ADMIN = `https://firestore.googleapis.com/v1/projects/${PROYECTO}`;
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
	// La base se reconoce por el final del nombre: Google puede responder con el número del proyecto en vez de su id.
	const listos = backups.filter((b) => b.database?.endsWith('/databases/(default)') && b.state === 'READY' && b.snapshotTime).sort((a, b) => Date.parse(b.snapshotTime) - Date.parse(a.snapshotTime));
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

// Lo anota con la misma forma que el resto de «Estado del sistema» (netlify/lib/estado.mjs: { ok, fallo, falloDesde, motivo }).
export default async () => {
	if (process.env.REVISAR_RESPALDO !== 'si' || !googleConfigurado() || !escrituraConfigurada()) return;
	const r = await revisarRespaldo().catch((err) => ({ ok: false, motivo: `No se pudo revisar: ${err.message}` }));
	if (r.ok) await anotarOk('respaldo', { cada: 0 });
	else {
		console.error('respaldo-diario:', r.motivo);
		await anotarFallo('respaldo', r.motivo, { cada: 0 });
	}
};

// Cada día a las 14:41 UTC (8:41 en Guatemala).
export const config = { schedule: '41 14 * * *' };
