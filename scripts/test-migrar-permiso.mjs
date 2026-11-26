// El aviso de «Pasar datos al formato nuevo» cuando falta un permiso: dice qué cuenta y qué rol (netlify/functions/migrar-chats.mjs).
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
console.log('ok');
