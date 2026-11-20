// Pruebas de robustez sin red ni base: la consulta de chats abiertos del control de cada hora, «Importar datos
// iniciales» solo con la base vacía y sin pisar nada, y el «hoy» del cuadro de reserva al enviar.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';

let ok = 0;
const t = async (nombre, fn) => { try { await fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${err.stack}`); process.exitCode = 1; } };
const leer = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// Cuenta de servicio de mentira (la clave se crea aquí) y fetch simulado: Google da un token y Firestore responde
// la consulta como lo hace la de verdad (filtro de rango, orden por el campo y luego por id, páginas con cursor).
process.env.GOOGLE_SA_EMAIL = 'lector@demo-eq.iam.gserviceaccount.com';
process.env.GOOGLE_SA_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const chats = [];
for (let i = 0; i < 4000; i++) chats.push({ id: `A${String(i).padStart(5, '0')}`, salida: '2026-01-02', estado: 'confirmada' }); // viejos
for (let i = 0; i < 650; i++) chats.push({ id: `B${String(i).padStart(5, '0')}`, salida: `2026-12-${String(10 + (i % 20)).padStart(2, '0')}`, estado: i % 7 ? 'confirmada' : 'cancelada' });
const pedidos = [];
globalThis.fetch = async (url, op = {}) => {
	if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tk', expires_in: 3600 }));
	const q = JSON.parse(op.body).structuredQuery;
	pedidos.push(q);
	const f = q.where.fieldFilter, campo = f.field.fieldPath, desde = f.value.stringValue;
	let lista = chats.filter((c) => c[campo] >= desde).sort((a, b) => (a[campo] < b[campo] ? -1 : a[campo] > b[campo] ? 1 : a.id < b.id ? -1 : 1));
	if (q.startAt) {
		const [v, ref] = q.startAt.values;
		lista = lista.filter((c) => c[campo] > v.stringValue || (c[campo] === v.stringValue && c.id > ref.referenceValue.split('/').pop()));
	}
	const nombre = (c) => `projects/x/databases/(default)/documents/chats/${c.id}`;
	return new Response(JSON.stringify(lista.slice(0, q.limit).map((c) => ({ document: { name: nombre(c), fields: { salida: { stringValue: c.salida }, estado: { stringValue: c.estado } } } }))));
};
const { consultar } = await import('../netlify/lib/firestore.mjs');

await t('chats abiertos: solo los que salen desde hoy, todos (de 300 en 300), sin leer los viejos', async () => {
	const docs = await consultar('chats', 'salida', '2026-11-20');
	assert.equal(docs.length, 650);
	assert.ok(docs.every((d) => d.id.startsWith('B')));
	assert.equal(new Set(docs.map((d) => d.id)).size, 650, 'sin repetidos entre páginas');
	assert.equal(pedidos.length, 3);
	// Un solo filtro de rango, ordenado por ese campo: lo cubre el índice que Firestore crea solo (nada que desplegar).
	for (const q of pedidos) {
		assert.equal(q.where.fieldFilter.op, 'GREATER_THAN_OR_EQUAL');
		assert.equal(q.orderBy[0].field.fieldPath, 'salida');
		assert.ok(q.limit <= 300);
	}
	const avisos = [], warn = console.warn;
	console.warn = (m) => avisos.push(m);
	try {
		assert.equal((await consultar('chats', 'salida', '2026-11-20', { tope: 100 })).length, 100);
		assert.equal(avisos.length, 1, 'al llenar el tope queda en el registro');
		assert.match(avisos[0], /chats llegó al tope de 100/);
		await consultar('chats', 'salida', '2026-11-20');
		assert.equal(avisos.length, 1, 'sin llegar al tope no se avisa');
	} finally { console.warn = warn; }
});

await t('el control de cada hora consulta los chats abiertos (no lista todos los chats)', () => {
	const f = leer('netlify/functions/solicitudes-sin-respuesta.mjs');
	assert.doesNotMatch(f, /listar\('chats'\)/);
	assert.match(f, /consultar\('chats', 'salida', hoy\)/);
	assert.deepEqual(JSON.parse(leer('firestore.indexes.json')).indexes, [], 'no necesita índice compuesto');
});

await t('«Importar datos iniciales»: solo sin propiedades, revisado al tocar, y solo crea lo que falta', () => {
	const f = leer('admin/js/views/publish.js');
	const importar = f.slice(f.indexOf('async function importSeed'), f.indexOf('export async function render'));
	assert.doesNotMatch(importar, /writeBatch|batch\.set/);
	assert.match(importar, /if \(await hayPropiedades\(\)\) throw/);
	assert.match(importar, /runTransaction[\s\S]*tx\.get\(ref\)[\s\S]*!existe\[i\][\s\S]*tx\.set\(ref, datos\)/);
	assert.match(f, /const baseVacia = session\.isAdmin && !site\.exists\(\) && !\(await hayPropiedades\(\)/);
	assert.match(f, /baseVacia \? h\('div'/);
});

await t('Publicar muestra el freno en una línea con «Publicar aunque baje» (una vez) y las casas que no se ven', () => {
	const f = leer('admin/js/views/publish.js');
	assert.match(f, /const frenada = state\.fallo && state\.freno/);
	assert.match(f, /setDoc\(doc\(db, 'meta', 'publish'\), \{ forzarCatalogo: true \}, \{ merge: true \}\)/);
	assert.match(f, /fetch\('\/feeds\/omitidas\.json'/);
	const b = leer('scripts/build.mjs');
	// El build gasta la marca y deja el motivo; deploy-failed lo reconoce.
	assert.match(b, /cambiar\('meta\/publish', \{ freno, forzarCatalogo: false \}, \{ ahora: \['frenoCuando'\] \}\)/);
	assert.match(leer('netlify/functions/deploy-failed.mjs'), /estado\.freno[\s\S]*frenoCuando/);
});

await t('cuadro de reserva: «hoy» se calcula al enviar, no al abrir la página', () => {
	const f = leer('js/vacacional.js');
	const enviar = f.slice(f.indexOf('form.eqReserva = function'), f.indexOf('var v = V.validarEstancia', f.indexOf('form.eqReserva = function')));
	assert.match(enviar, /var ahora = V\.hoy\(\);\s*if \(ahora !== hoy\) \{ hoy = ahora;/);
	assert.doesNotMatch(f, /var hoyB = V\.hoy\(\);\n\t\tbuscar/);
});

await t('eliminar una casa borra todo su privado, también lo que escribe el servidor (calendario de EQ, lo último leído de los iCal)', () => {
	const f = leer('admin/js/views/properties.js');
	const borra = f.slice(f.indexOf('export async function eliminarPropiedad'), f.indexOf('export function slugLibre'));
	for (const d of ['socio', 'llegada', 'acuerdo', 'calendario', 'icalLeido']) assert.match(borra, new RegExp(`'${d}'`));
	// Todo lo que el servidor guarda en privado/… lo nombra este borrado.
	const delServidor = new Set([...readdirSync(new URL('../netlify', import.meta.url), { recursive: true }).filter((x) => /\.mjs$/.test(x))
		.flatMap((x) => [...leer(`netlify/${x}`).matchAll(/privado\/([a-zA-Z]+)/g)].map((m) => m[1]))]);
	for (const d of delServidor) assert.match(borra, new RegExp(`'${d}'`), `privado/${d} queda huérfano`);
});

console.log(`${ok} pruebas de robustez pasan${process.exitCode ? ' (con fallas)' : ''}.`);
