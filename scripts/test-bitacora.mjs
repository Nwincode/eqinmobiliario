// Pruebas de la bitácora de cambios sensibles: las fotos (admin/js/bitacora.js, las mismas que firestore.rules), el
// renglón, lo que se muestra en la ficha y lo que anota el servidor (netlify/lib/bitacora.mjs) y el correo de datos de
// pago que sale de ella (netlify/lib/avisos-pago.mjs), con la base y el correo simulados.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer, hijos } from './simulado/base.mjs';

const { fotoCasa, fotoPropietario, fotoPermisos, igual, renglon, diferencias } = await import('../admin/js/bitacora.js');
const { anotarEnTx } = await import('../netlify/lib/bitacora.mjs');
const { transaccion } = await import('../netlify/lib/firestore-escritura.mjs');
const { avisarCambiosDePago } = await import('../netlify/lib/avisos-pago.mjs');

let n = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); n++; console.log('✓', nombre); };

await t('las fotos llevan los valores por omisión de las reglas (sin privado/socio: 0, [] y margen 20)', () => {
	assert.deepEqual(fotoCasa({ moneda: 'USD' }), { moneda: 'USD', propietarioId: '', limpieza: 0, precioBase: 0, precioFinde: 0, tarifas: [], margen: 20 });
	assert.deepEqual(fotoCasa({ vacacional: { limpieza: 35 } }, { precioBase: 100, margen: 25 }).limpieza, 35);
	assert.deepEqual(fotoPropietario({}), { datosPago: '', permisos: {} });
	assert.deepEqual(fotoPermisos({ precios: false }), { precios: false, fechas: true, casa: true });
	// Un campo guardado vacío (null) no es lo mismo que uno que no está (las reglas: get devuelve el null).
	assert.equal(fotoCasa({ moneda: null }).moneda, null);
});

await t('igual: mapas sin importar el orden de sus llaves; listas en orden', () => {
	assert.ok(igual({ a: 1, b: [{ x: 1, y: 2 }] }, { b: [{ y: 2, x: 1 }], a: 1 }));
	assert.ok(!igual([1, 2], [2, 1]));
	assert.ok(!igual({ a: 1 }, { a: 1, b: 2 }));
});

await t('renglón: null sin cambio; «avisado» solo si cambian los datos de pago', () => {
	assert.equal(renglon({ tipo: 'casa', objeto: 'c1', casa: 'c1', antes: fotoCasa({}), despues: fotoCasa({}) }), null);
	const r = renglon({ tipo: 'propietario', objeto: 'p1', antes: fotoPropietario({ datosPago: 'A' }), despues: fotoPropietario({ datosPago: 'B' }) });
	assert.equal(r.avisado, false);
	assert.ok(!('avisado' in renglon({ tipo: 'propietario', objeto: 'p1', antes: fotoPropietario({}), despues: fotoPropietario({ permisos: { precios: false } }) })));
	assert.ok(!('casa' in r));
});

await t('en la ficha: solo lo que cambió, en palabras, con el dueño por su nombre y el dinero con su formato', () => {
	const d = diferencias({ antes: fotoCasa({ propietarioId: 'p1' }, { precioBase: 100 }), despues: fotoCasa({ propietarioId: 'p2' }, { precioBase: 120, margen: 25 }) },
		{ nombreDe: (x) => ({ p1: 'Ana', p2: 'Luis' })[x], dinero: (n) => `US$ ${n}` });
	assert.deepEqual(d, [
		{ campo: 'Dueño', antes: 'Ana', despues: 'Luis' },
		{ campo: 'Precio del dueño por noche', antes: 'US$ 100', despues: 'US$ 120' },
		{ campo: 'Margen de EQ', antes: '20 %', despues: '25 %' }]);
});

await t('el servidor anota en la misma transacción, con la hora del servidor; sin cambio, nada', async () => {
	await transaccion(async (tx) => {
		assert.equal(anotarEnTx(tx, { tipo: 'reserva', objeto: 'r1', casa: 'c1', antes: { revisadoAMano: [] }, despues: { revisadoAMano: [] } }), null);
		const id = anotarEnTx(tx, { tipo: 'reserva', objeto: 'r1', casa: 'c1', antes: { revisadoAMano: [] }, despues: { revisadoAMano: ['Airbnb'] } }, { quien: 'u-socio', nombre: 'Rodrigo' });
		tx.crear('reservas/r1', { bitacoraId: id });
	});
	const [e] = hijos('bitacora');
	assert.equal(e.quien, 'u-socio');
	assert.equal(e.cuando.getTime(), S.reloj);
	assert.equal(leer('reservas/r1').bitacoraId, e.id);
});

await t('datos de pago: el correo al equipo sale de la bitácora y de cambiosDatosPago (los de antes), una vez cada uno', async () => {
	poner('propietarios/p1', { nombre: 'Ana' });
	poner('bitacora/b1', { tipo: 'propietario', objeto: 'p1', antes: { datosPago: 'Banco A', permisos: {} }, despues: { datosPago: 'Banco B', permisos: {} }, nombre: 'Admin', cuando: new Date(S.reloj), avisado: false });
	poner('cambiosDatosPago/c1', { propietarioId: 'p1', antes: 'Banco 0', despues: 'Banco A', nombre: 'Admin', cuando: new Date(S.reloj), avisado: false });
	assert.equal(await avisarCambiosDePago(), 2);
	assert.equal(leer('bitacora/b1').avisado, true);
	assert.equal(leer('cambiosDatosPago/c1').avisado, true);
	assert.equal(await avisarCambiosDePago(), 0);
	assert.ok(S.salida.some((m) => m.texto.includes('Banco B')));
});

console.log(`${n} pruebas de la bitácora pasan.`);
