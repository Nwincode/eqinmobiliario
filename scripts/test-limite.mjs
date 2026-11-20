// El límite de pedidos guardado en la base (netlify/lib/limite.mjs limitadorDurable), con la base simulada
// (scripts/simulado/): cuenta entre llamadas, y si la base falla frena o, donde se pidió, sigue con el de memoria.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar } from './simulado/base.mjs';

let ok = 0;
const t = async (nombre, fn) => { limpiar(); S.escrituraFalla = false; await fn(); ok++; console.log('✓', nombre); };
const { limitadorDurable } = await import('../netlify/lib/limite.mjs');
const veces = async (f, n, clave = '1.2.3.4') => { const r = []; for (let i = 0; i < n; i++) r.push(await f(clave)); return r; };

await t('cuenta en la base: el pedido 4 de 3 se frena', async () => {
	assert.deepEqual(await veces(limitadorDurable('x', 3, 60_000), 4), [false, false, false, true]);
});
await t('con la base caída, frena por defecto (contraseña: justo en un ataque, no se deja pasar)', async () => {
	S.escrituraFalla = true;
	assert.deepEqual(await veces(limitadorDurable('contrasena', 3, 60_000), 2), [true, true]);
});
await t('con la base caída y siFalla «memoria» (/al-dia), deja pasar con el límite de memoria', async () => {
	S.escrituraFalla = true;
	const f = limitadorDurable('al-dia', 3, 60_000, { siFalla: 'memoria' });
	assert.deepEqual(await veces(f, 4), [false, false, false, true]);
	assert.equal(await f('5.6.7.8'), false, 'otra IP sigue pasando');
});
await t('/api/disponibilidad/al-dia usa el límite que sigue con el de memoria', async () => {
	const { readFileSync } = await import('node:fs');
	assert.match(readFileSync(new URL('../netlify/functions/disponibilidad.mjs', import.meta.url), 'utf8'), /limitadorDurable\('al-dia', \d+, [^)]*\{ siFalla: 'memoria' \}\)/);
});

console.log(`${ok} pruebas del límite pasan.`);
