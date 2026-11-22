// Pruebas de la revisión diaria del respaldo (netlify/functions/respaldo-diario.mjs), con la base simulada
// (scripts/simulado/) y Google simulado: apagada sin REVISAR_RESPALDO, respaldo reciente, viejo, ninguno y sin permiso.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { S, limpiar, leer } from './simulado/base.mjs';

process.env.GOOGLE_SA_EMAIL = 'pruebas@demo.iam.gserviceaccount.com';
process.env.GOOGLE_SA_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const { default: respaldo } = await import('../netlify/functions/respaldo-diario.mjs');

let ok = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); ok++; console.log('✓', nombre); };
const BASE = 'projects/eqinmobiliariobd/databases/(default)';
let respaldos = [], estadoLista = 200;
globalThis.fetch = async (url) => {
	const u = String(url);
	if (u.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 't', expires_in: 3600 });
	if (u.endsWith('/locations/-/backups')) return Response.json(estadoLista === 200 ? { backups: respaldos } : { error: { message: 'denied' } }, { status: estadoLista });
	if (u.endsWith('/databases/(default)')) return Response.json({ pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED' });
	return new Response('no', { status: 404 });
};
const hace = (h) => new Date(S.reloj - h * 3600_000).toISOString();

await t('apagada sin REVISAR_RESPALDO=si: no anota nada', async () => {
	delete process.env.REVISAR_RESPALDO;
	await respaldo();
	assert.equal(leer('estado/respaldo'), null);
});

process.env.REVISAR_RESPALDO = 'si';
await t('respaldo de hace 20 h, con el número del proyecto en el nombre (y uno de otra base, más nuevo, que no cuenta): ok, con PITR', async () => {
	respaldos = [{ database: 'projects/123456789/databases/(default)', state: 'READY', snapshotTime: hace(20) }, { database: 'projects/eqinmobiliariobd/databases/otra', state: 'READY', snapshotTime: hace(1) }, { database: BASE, state: 'CREATING', snapshotTime: hace(2) }];
	await respaldo();
	const e = leer('estado/respaldo');
	assert.ok(e.ok instanceof Date);
	assert.equal(e.fallo, undefined);
});

await t('el último tiene 3 días: fallo con el motivo; sin ninguno, también', async () => {
	respaldos = [{ database: BASE, state: 'READY', snapshotTime: hace(72) }];
	await respaldo();
	assert.ok(leer('estado/respaldo').fallo instanceof Date);
	assert.match(leer('estado/respaldo').motivo, /72 horas/);
	respaldos = [];
	await respaldo();
	assert.match(leer('estado/respaldo').motivo, /ningún respaldo/);
});

await t('sin el rol para ver respaldos: fallo que dice qué rol falta', async () => {
	estadoLista = 403;
	await respaldo();
	assert.ok(leer('estado/respaldo').fallo instanceof Date);
	assert.match(leer('estado/respaldo').motivo, /Backups Viewer/);
	estadoLista = 200;
});

console.log(`\n${ok} pruebas del respaldo pasan.`);
