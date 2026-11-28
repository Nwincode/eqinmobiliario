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
// Y 1,200 solicitudes de los últimos días (createdAt como fecha de Firestore) para `desde`.
const leads = [];
for (let i = 0; i < 1200; i++) leads.push({ id: `L${String(i).padStart(5, '0')}`, createdAt: new Date(Date.parse('2026-11-19T00:00:00Z') + i * 60_000).toISOString() });
const pedidos = [];
globalThis.fetch = async (url, op = {}) => {
	if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tk', expires_in: 3600 }));
	const q = JSON.parse(op.body).structuredQuery;
	pedidos.push(q);
	const col = q.from[0].collectionId, docs = col === 'leads' ? leads : chats;
	const f = q.where.fieldFilter, campo = f.field.fieldPath, tipo = 'timestampValue' in f.value ? 'timestampValue' : 'stringValue', desde = f.value[tipo];
	let lista = docs.filter((c) => (f.op === 'GREATER_THAN' ? c[campo] > desde : c[campo] >= desde)).sort((a, b) => (a[campo] < b[campo] ? -1 : a[campo] > b[campo] ? 1 : a.id < b.id ? -1 : 1));
	if (q.startAt) {
		const [v, ref] = q.startAt.values;
		lista = lista.filter((c) => c[campo] > v[tipo] || (c[campo] === v[tipo] && c.id > ref.referenceValue.split('/').pop()));
	}
	const nombre = (c) => `projects/x/databases/(default)/documents/${col}/${c.id}`;
	const campos = (c) => (col === 'leads' ? { createdAt: { timestampValue: c.createdAt } } : { salida: { stringValue: c.salida }, estado: { stringValue: c.estado } });
	return new Response(JSON.stringify(lista.slice(0, q.limit).map((c) => ({ document: { name: nombre(c), fields: campos(c) } }))));
};
const { consultar, desde } = await import('../netlify/lib/firestore.mjs');

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

await t('`desde` (plazos-reservas, apartadasDe) lee todos de 300 en 300: antes cortaba en 500 sin aviso', async () => {
	pedidos.length = 0;
	const docs = await desde('leads', 'createdAt', new Date('2026-11-19T00:00:00Z'));
	assert.equal(docs.length, 1199, 'todas menos la del mismo instante (posterior, no igual)');
	assert.equal(new Set(docs.map((d) => d.id)).size, 1199, 'sin repetidos entre páginas');
	assert.ok(docs.every((d) => d.createdAt instanceof Date));
	assert.equal(pedidos.length, 4);
	for (const q of pedidos) { assert.equal(q.where.fieldFilter.op, 'GREATER_THAN'); assert.equal(q.orderBy[0].field.fieldPath, 'createdAt'); assert.ok(q.limit <= 300); }
	const avisos = [], warn = console.warn;
	console.warn = (m) => avisos.push(m);
	try {
		assert.equal((await desde('leads', 'createdAt', new Date('2026-11-19T00:00:00Z'), { tope: 400 })).length, 400);
		assert.match(avisos[0] || '', /desde: leads llegó al tope de 400/);
	} finally { console.warn = warn; }
});

await t('el control de cada hora consulta los chats abiertos (no lista todos los chats)', () => {
	const f = leer('netlify/functions/solicitudes-sin-respuesta.mjs');
	assert.doesNotMatch(f, /listar\('chats'\)/);
	assert.match(f, /consultar\('chats', 'salida', hoy\)/);
	assert.deepEqual(JSON.parse(leer('firestore.indexes.json')).indexes, [], 'no necesita índice compuesto');
});

await t('«No se dio» con fechas ocupadas, el recordatorio de comisiones y las confirmadas sin pago: consultan lo que necesitan (no listan todas las reservas, con tope de 3,000)', () => {
	const f = leer('netlify/functions/solicitudes-sin-respuesta.mjs');
	assert.doesNotMatch(f, /listar\('reservas'\)/);
	assert.match(f, /donde\('reservas', 'propertyId', l\.propertyId\)/);
	assert.match(f, /donde\('reservas', 'comision\.vence', hoy\)/);
	assert.match(f, /donde\('reservas', 'comision\.pagada', false\)/);
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

await t('justo antes de enviar: precios al día (si cambió el total, no se envía y se dice), casa en pausa no reserva', () => {
	const v = leer('js/vacacional.js');
	const revisar = v.slice(v.indexOf('form.eqRevisar = function'), v.indexOf('if (id && window.fetch) {', v.indexOf('form.eqRevisar = function')));
	assert.match(revisar, /if \(res\.pausada\) \{[^}]*vacPausada[^}]*return false; \}/);
	assert.match(revisar, /D\.plan = res\.plan;/);
	assert.match(revisar, /t\.vacPrecioCambio[\s\S]*return false;/);
	assert.match(leer('scripts/lib/i18n.mjs'), /vacPrecioCambio: 'El precio cambió: revisa el total y vuelve a enviar\.'/);
	// La limpieza, el depósito y el mínimo de noches también al día (lo que revisa /api/solicitud), y entran en lo comparado.
	assert.match(revisar, /var antes = [^;]*cotizar\(\)[\s\S]*condicionesAlDia\(res\);[\s\S]*cotizar\(\) !== antes/);
	assert.match(v, /typeof res\.limpieza === 'number'\) D\.limpieza = res\.limpieza/);
	assert.match(v, /typeof res\.nochesMin === 'number'/);
	// Un 409 con `recargar` del servidor pone el precio al día en la página.
	assert.match(leer('js/site.js'), /err\.datos\.recargar && typeof form\.eqRevisar === 'function'\) form\.eqRevisar\(\)/);
});

await t('confirmar cabe en los 10 s de Netlify con 5 s por plataforma: calendarios hasta los 5,5 s, transacción ≥ 2 s, revisión 1,5 s', () => {
	const f = leer('netlify/functions/reservas.mjs');
	const plazo = Number(/const PLAZO_MS = (\d+);/.exec(f)[1]), espera = Number(/const ESPERA_ICAL = (\d+);/.exec(f)[1]);
	const margen = Number(/nochesExternas\(leadId, hasta - (\d+)\)/.exec(f)[1]);
	assert.equal(espera, 5000);
	assert.match(f, /Math\.max\(2000, hasta - Date\.now\(\) - 1500\)/);
	// Lo peor: calendarios hasta `plazo - margen`, transacción al menos 2 s, y 1,5 s para ver si quedó escrito.
	assert.ok(plazo - margen + Math.max(2000, margen - 1500) + 1500 <= 9000, 'bajo los 10 s con 1 s de holgura');
	assert.ok(plazo - margen >= espera + 400, 'leer la solicitud y privado/socio antes de las plataformas cabe');
	assert.match(leer('netlify/functions/disponibilidad.mjs'), /para'\) === 'confirmar' \? 5000 : 3000/);
});

await t('el código de la reserva lo pone el servidor: la página no lo inventa y el «¡Solicitud enviada!» usa el de la respuesta', () => {
	assert.doesNotMatch(leer('js/vacacional.js'), /codigoReserva|getRandomValues/);
	assert.match(leer('js/reserva-chat.js'), /return \{ token: d\.token, codigo: d\.codigo \|\| '' \};/);
	assert.match(leer('js/site.js'), /done\(hecho\.token, hecho\.codigo\)/);
	assert.match(leer('js/site.js'), /String\(reserva\.gracias\)\.replace\('\{codigo\}'/);
});

await t('el freno del catálogo: solo el build de producción lee y escribe meta/publish (una vista previa no gasta «Publicar aunque baje»)', () => {
	const b = leer('scripts/build.mjs');
	assert.match(b, /if \(fuente !== 'firestore' \|\| !produccion \|\| !escrituraConfigurada\(\)\) return revisarCatalogo\(/);
	assert.match(b, /frenoDelCatalogo\(data\.source, deCatalogo, \{ produccion: isProduction \}\)/);
	assert.match(b, /const isProduction = !process\.env\.CONTEXT \|\| process\.env\.CONTEXT === 'production';/);
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
