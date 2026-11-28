// El aviso de «Pasar datos al formato nuevo» cuando falta un permiso: dice qué cuenta y qué rol (netlify/functions/migrar-chats.mjs).
// Y la fase del historial de estados: lo que escribe vuelve con los mismos tipos que leyó.
import assert from 'node:assert/strict';
process.env.GOOGLE_SA_EMAIL = 'lector@demo-eq.iam.gserviceaccount.com';
process.env.GOOGLE_SA_ESCRITURA_EMAIL = 'escritura@demo-eq.iam.gserviceaccount.com';
const { rolQueFalta } = await import('../netlify/functions/migrar-chats.mjs');
const e = (m, status) => Object.assign(new Error(m), { status });
assert.deepEqual(rolQueFalta(e('Storage 403 al listar', 403)), { cuenta: process.env.GOOGLE_SA_ESCRITURA_EMAIL, rol: 'Storage Object Admin' });
assert.deepEqual(rolQueFalta(e('Storage 403 al bajar', 403)), { cuenta: process.env.GOOGLE_SA_EMAIL, rol: 'Storage Object Viewer' });
assert.deepEqual(rolQueFalta(e('La cuenta de servicio no tiene permiso para leer la base de datos')), { cuenta: process.env.GOOGLE_SA_EMAIL, rol: 'Cloud Datastore Viewer' });
assert.deepEqual(rolQueFalta(e('Missing or insufficient permissions.', 403)), { cuenta: process.env.GOOGLE_SA_ESCRITURA_EMAIL, rol: 'Cloud Datastore User' });
assert.equal(rolQueFalta(e('Error 500 al consultar chats', 500)), null);

// La fase que borra el nombre del historial de estados lee la casa (documento) y escribe solo historialEstado
// (aCampos): cada tipo vuelve como estaba (fecha con sus milisegundos, texto, nada), sin `por`.
const { documento } = await import('../netlify/lib/firestore.mjs');
const { aCampos } = await import('../netlify/lib/firestore-escritura.mjs');
const { historialSinNombres } = await import('../admin/js/cambios-casa.js');
const entrada = (fecha, extra = {}) => ({ mapValue: { fields: { estado: { stringValue: 'disponible' }, fecha, porUid: { stringValue: 'u1' }, ...extra } } });
const guardado = [entrada({ timestampValue: '2026-03-01T10:00:00.123Z' }, { por: { stringValue: 'Ana López' } }), entrada({ stringValue: '2026-03-05T10:00:00.000Z' }, { por: { stringValue: 'Dueño' } }), entrada({ nullValue: null })];
const casa = documento({ name: 'projects/p/databases/(default)/documents/properties/c1', fields: { historialEstado: { arrayValue: { values: guardado } } } });
const escrito = aCampos({ historialEstado: historialSinNombres(casa.historialEstado) }).historialEstado.arrayValue.values;
assert.deepEqual(escrito, guardado.map((x) => { const { por, ...f } = x.mapValue.fields; return { mapValue: { fields: f } }; }));
console.log('ok');
