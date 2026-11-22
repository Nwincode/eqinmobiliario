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
		{ clave: 'propietarioId', campo: 'Dueño', antes: 'Ana', despues: 'Luis' },
		{ clave: 'precioBase', campo: 'Precio del dueño por noche', antes: 'US$ 100', despues: 'US$ 120' },
		{ clave: 'margen', campo: 'Margen de EQ', antes: '20 %', despues: '25 %' }]);
});

await t('permisos de un socio: con el nombre de su interruptor (no «para todos») y «Devueltos hasta que pague»', () => {
	const d = diferencias({ antes: fotoPropietario({}), despues: fotoPropietario({ permisos: { precios: false, devolver: true } }) });
	assert.deepEqual(d, [{ clave: 'permisos', campo: 'Permisos', antes: 'los de todos', despues: 'Precios y temporadas no, Devueltos hasta que pague' }]);
	assert.equal(diferencias({ antes: fotoPropietario({ permisos: { devolver: true } }), despues: fotoPropietario({ permisos: { devolver: false } }) })[0].despues, 'los de todos');
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

await t('quién cambió: el nombre de su usuario, no el que escribió en el renglón (las reglas solo atan «quien»)', async () => {
	const { firma } = await import('../admin/js/bitacora.js');
	assert.equal(firma({ quien: 'u1', nombre: 'Otro administrador' }, { u1: { nombre: 'Ana López' } }), 'Ana López');
	assert.equal(firma({ quien: 'servidor', nombre: 'Servidor' }, {}), 'Servidor');
	// Un usuario sin nombre (un socio con acceso sin nombre): su correo, nunca lo que escribió en el renglón.
	assert.equal(firma({ quien: 'u2', nombre: 'Administrador' }, { u2: { nombre: '', email: 'socio@correo.com' } }), 'socio@correo.com');
	poner('users/u1', { nombre: 'Ana López', rol: 'admin' });
	poner('propietarios/p1', { nombre: 'Socio' });
	poner('bitacora/b9', { tipo: 'propietario', objeto: 'p1', antes: { datosPago: 'Banco A', permisos: {} }, despues: { datosPago: 'Banco Z', permisos: {} }, quien: 'u1', nombre: 'Luis (otro admin)', cuando: new Date(S.reloj), avisado: false });
	assert.equal(await avisarCambiosDePago(), 1);
	assert.match(S.salida[0].texto, /Cambió: Ana López/);
	assert.doesNotMatch(S.salida[0].texto, /Luis/);
});

await t('lo que resulta para un socio (permisosSocios/{id}) cambia con su renglón, también desde el servidor', async () => {
	const { recalcularPermisos } = await import('../netlify/lib/permisos.mjs');
	poner('propietarios/p1', { nombre: 'Socio', porNoche: true });
	poner('settings/permisosSocios', { precios: false });
	assert.equal(await recalcularPermisos(S.reloj), 1);
	const d = leer('permisosSocios/p1');
	assert.equal(d.precios, false);
	const r = leer(`bitacora/${d.bitacoraId}`);
	assert.equal(r.tipo, 'permisosSocio');
	assert.equal(r.objeto, 'p1');
	assert.deepEqual([r.antes.precios, r.despues.precios], [true, false]);
	// Sin cambio, ni escritura ni renglón.
	const antes = [...S.docs.keys()].filter((k) => k.startsWith('bitacora/')).length;
	assert.equal(await recalcularPermisos(S.reloj), 0);
	assert.equal([...S.docs.keys()].filter((k) => k.startsWith('bitacora/')).length, antes);
	assert.equal(diferencias(r)[0].campo, 'Precios y temporadas');
});

await t('la bitácora de la casa: el dueño solo escribe los textos de «Mis propiedades» (las reglas tienen la misma expresión)', async () => {
	await import('../js/calc-vacacional.js');
	const { textoDueno: T, TEXTO_DUENO, MOTIVOS_BLOQUEO, QUE_CADA, sinValores } = await import('../admin/js/texto-dueno.js');
	const { readFileSync } = await import('node:fs');
	assert.ok(readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').includes(`.matches('${TEXTO_DUENO}')`), 'la misma expresión en firestore.rules');
	const re = new RegExp(`^(?:${TEXTO_DUENO})$`);
	const rangos = [{ desde: '2026-11-16', hasta: '2026-11-20' }, { desde: '2026-11-30', hasta: '2026-12-02' }, { desde: '2026-12-28', hasta: '2027-01-03' },
		{ desde: '2027-09-16', hasta: '2027-09-16' }, { desde: '2027-04-01', hasta: '2027-05-31' }];
	// Con el valor de antes y el de ahora, en las dos monedas, con decimales, hasta el tope y sin precio de fin de semana;
	// también los textos sin valor que escribe una pestaña abierta antes de este cambio.
	const precios = [[900, 1000, 'GTQ'], [0, 120, 'USD'], [120.5, 99.99, 'USD'], [50000, 49999.99, 'GTQ']];
	const textos = [...precios.flatMap(([a, b, m]) => [T.precio('Entre semana', a, b, m), T.precio('Fin de semana', a, b, m), T.precio('Fin de semana', b, 0, m)]),
		'precio entre semana', 'precio fin de semana', 'personas máximo 12', T.temporadas(2027), T.personas(12), T.personas(12, 8), T.personas(1, 50),
		...rangos.flatMap((r) => [...MOTIVOS_BLOQUEO.map((m) => T.calendario('bloquear', r, m)), T.calendario('habilitar', r),
			...['', ...Object.keys(QUE_CADA)].flatMap((c) => [T.calendario('precio', r, 250, c), T.calendario('precio', r, 12500.5, c, 'GTQ'), T.calendario('minimo', r, 3, c), T.calendario('minimo', r, 1, c)]),
			T.quito('Precios especiales', r), T.quito('Mínimos de noches', r, true)])];
	for (const x of textos) assert.match(x, re);
	// Sin los valores: lo que aceptan las reglas de antes (la expresión de antes de los valores, copiada tal cual; el sitio
	// se publica antes que las reglas y mis-casas.js reintenta así) y lo que va al aviso que lee todo el equipo (sin montos).
	const D = '[1-3]?[0-9]( (ene|feb|mar|abr|may|jun|jul|ago|sept|oct|nov|dic)( 20[0-9]{2})?)?', R = `${D}( – ${D})?`;
	const antes = new RegExp(`^(?:(precio (entre semana|fin de semana)|personas máximo [0-9]{1,2}|puso las temporadas de [0-9]{4}|(bloqueó|habilitó|precio especial|mínimo de noches) ${R}( [(](Otra reserva|Mantenimiento|Uso propio)[)])?( [(](cada año en estas fechas|cada año en Semana Santa)[)])?|quitó (precios especiales|mínimos de noches) ${R}( [(]todos los años[)])?))$`);
	for (const x of textos) { assert.match(sinValores(x), antes, x); assert.match(sinValores(x), re, x); assert.doesNotMatch(sinValores(x), /US[$]|Q [0-9]|→/, x); }
	assert.equal(sinValores(T.personas(12, 8)), 'personas máximo 12');
	assert.equal(T.precio('Entre semana', 900, 1000, 'GTQ'), 'precio entre semana: Q 900 → Q 1,000');
	assert.equal(T.precio('Fin de semana', 150, 0), 'precio fin de semana: US$ 150 → igual que entre semana');
	assert.equal(T.calendario('minimo', rangos[0], 1), 'mínimo de noches 16 – 20 nov: 1 noche');
	for (const x of ['cambio', 'el administrador aprobó bajar la comisión', 'bloqueó 16 – 20 nov (llámame 55551234)', 'precio entre semana, llama al 5555 1234', 'bloqueó 5555 1234',
		'precio entre semana: Q 5555 1234', 'precio entre semana: Q 5,5551,234', 'precio especial 16 – 20 nov: Q 55551234', 'precio entre semana: US$ 1 → llámame', 'personas máximo: 5555 → 1234'])
		assert.doesNotMatch(x, re, x);
});

console.log(`${n} pruebas de la bitácora pasan.`);
