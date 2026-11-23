// Pruebas de «Sugerir respuesta» (POST /api/ia, tarea respuestaChat; netlify/lib/sugerir-respuesta.mjs): quién puede
// pedirla (el administrador y el socio de la casa del chat; nadie más), que lo que ve la IA lo arma el servidor con lo
// guardado (sin contactos, sin datos de pago ni dirección) y que devuelve un borrador. La IA se simula.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner } from './simulado/base.mjs';

process.env.ANTHROPIC_API_KEY = 'prueba';
const { default: ia } = await import('../netlify/functions/ia.mjs');

let n = 0;
const t = async (nombre, fn) => { limpiar(); S.usuario = null; S.pedidosIA = []; S.ia = null; await fn(); n++; console.log('✓', nombre); };
const T = 'TokenDePruebaLargoYAlAzar2345';
const pedir = (datos = { chat: T }) => ia(new Request('http://x/api/ia', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' }, body: JSON.stringify({ tarea: 'respuestaChat', datos }) }));
const preparar = () => {
	poner(`chats/${T}`, { propertyId: 'c1', propietarioId: 'o1', nombre: 'Ana Morales', llegada: '2026-11-25', salida: '2026-11-28', noches: 3, huespedes: 4, idioma: 'es' });
	poner('properties/c1', { titulo: 'Casa del Lago', operacion: 'vacacional', propietarioId: 'o1', zona: 'Panajachel', descripcion: 'Casa frente al lago.', direccion: 'Calle Secreta 12', vacacional: { checkIn: '15:00', huespedesMax: 6, mascotas: 'pequeñas' } });
	poner(`chats/${T}/mensajes/m1`, { de: 'socio', tipo: 'pago', texto: 'Banco Industrial 123-456789-0', createdAt: new Date('2026-11-20T10:00:00Z') });
	poner(`chats/${T}/mensajes/m2`, { de: 'cliente', texto: '¿Aceptan 2 perros pequeños?', createdAt: new Date('2026-11-20T11:00:00Z') });
};

await t('el socio de la casa recibe un borrador; la IA ve la casa, la reserva y los mensajes, sin datos de pago ni dirección', async () => {
	preparar();
	S.usuario = { uid: 'u1', rol: 'socio', propietarioId: 'o1', nombre: 'Pedro' };
	S.ia = () => ({ respuesta: 'Hola Ana, sí: se aceptan mascotas pequeñas.' });
	const r = await pedir();
	assert.equal(r.status, 200);
	assert.equal((await r.json()).respuesta, 'Hola Ana, sí: se aceptan mascotas pequeñas.');
	const visto = JSON.stringify(S.pedidosIA[0].messages);
	assert.match(visto, /Aceptan 2 perros/);
	assert.match(visto, /Casa del Lago/);
	assert.match(visto, /se le mostraron los datos de pago/);
	assert.doesNotMatch(visto, /123-456789-0|Calle Secreta|Morales/);
});
await t('el administrador también', async () => {
	preparar();
	S.usuario = { uid: 'a1', rol: 'admin', nombre: 'Admin' };
	S.ia = () => ({ respuesta: 'Hola' });
	assert.equal((await pedir()).status, 200);
});
await t('otro socio, un asesor o sin sesión: no (y no se llama a la IA)', async () => {
	preparar();
	S.ia = () => ({ respuesta: 'x' });
	S.usuario = { uid: 'u2', rol: 'socio', propietarioId: 'o2' };
	assert.equal((await pedir()).status, 403);
	S.usuario = { uid: 'u3', rol: 'asesor', agentId: 'a1' };
	assert.equal((await pedir()).status, 401);
	S.usuario = null;
	assert.equal((await pedir()).status, 401);
	assert.equal(S.pedidosIA.length, 0);
});
await t('el socio de un chat cuya casa ya no es suya: no', async () => {
	preparar();
	poner('properties/c1', { titulo: 'Casa del Lago', operacion: 'vacacional', propietarioId: 'o9' });
	S.usuario = { uid: 'u1', rol: 'socio', propietarioId: 'o1' };
	S.ia = () => ({ respuesta: 'x' });
	assert.equal((await pedir()).status, 403);
});
await t('un chat inventado o sin token: no', async () => {
	S.usuario = { uid: 'a1', rol: 'admin' };
	S.ia = () => ({ respuesta: 'x' });
	assert.equal((await pedir({ chat: '../leads/x' })).status, 403);
	assert.equal((await pedir({})).status, 403);
});
await t('sin la IA configurada: 503', async () => {
	preparar();
	delete process.env.ANTHROPIC_API_KEY;
	S.usuario = { uid: 'u1', rol: 'socio', propietarioId: 'o1' };
	assert.equal((await pedir()).status, 503);
	process.env.ANTHROPIC_API_KEY = 'prueba';
});

console.log(`\n${n} pruebas de «Sugerir respuesta» pasan.`);
