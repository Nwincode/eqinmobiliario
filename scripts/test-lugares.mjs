// Pruebas de admin/js/lugares.js: la tabla de municipios, el departamento de una casa y las opciones de la ficha.
import assert from 'node:assert/strict';
import {
	MUNICIPIOS, DEPARTAMENTOS, ZONAS_CAPITAL, municipioDe, departamentoDe, esCapital, opcionesMunicipio, opcionesZona,
	zonasDeCliente, opcionesZonasInteres, pideZona, sinTildes, mismoMunicipio, nombreRepetido
} from '../admin/js/lugares.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };

t('22 departamentos y 340 municipios, con el número de cada uno', () => {
	const esperado = { Guatemala: 17, 'El Progreso': 8, 'Sacatepéquez': 16, Chimaltenango: 16, Escuintla: 14, 'Santa Rosa': 14, 'Sololá': 19,
		'Totonicapán': 8, Quetzaltenango: 24, 'Suchitepéquez': 21, Retalhuleu: 9, 'San Marcos': 30, Huehuetenango: 33, 'Quiché': 21,
		'Baja Verapaz': 8, 'Alta Verapaz': 17, 'Petén': 14, Izabal: 5, Zacapa: 11, Chiquimula: 11, Jalapa: 7, Jutiapa: 17 };
	assert.deepEqual(DEPARTAMENTOS.slice().sort(), Object.keys(esperado).sort());
	for (const [dep, n] of Object.entries(esperado)) assert.equal(MUNICIPIOS[dep].length, n, dep);
	assert.equal(Object.values(MUNICIPIOS).flat().length, 340);
	// Ninguno repetido dentro de su departamento.
	for (const [dep, ms] of Object.entries(MUNICIPIOS)) assert.equal(new Set(ms.map(sinTildes)).size, ms.length, dep);
	assert.ok(MUNICIPIOS['Sacatepéquez'].includes('San Miguel Dueñas'));
});

t('zonas de la capital: 1 a 25 sin la 20, 22 ni 23', () => {
	assert.equal(ZONAS_CAPITAL.length, 22);
	for (const n of [20, 22, 23]) assert.ok(!ZONAS_CAPITAL.includes(`Zona ${n}`));
});

t('municipioDe: oficial, otros nombres y repetidos con su departamento', () => {
	assert.deepEqual(municipioDe('san miguel duenas'), { municipio: 'San Miguel Dueñas', departamento: 'Sacatepéquez' });
	assert.deepEqual(municipioDe('Ciudad de Guatemala'), { municipio: 'Guatemala', departamento: 'Guatemala' });
	assert.deepEqual(municipioDe('antigua'), { municipio: 'Antigua Guatemala', departamento: 'Sacatepéquez' });
	assert.deepEqual(municipioDe('Xela'), { municipio: 'Quetzaltenango', departamento: 'Quetzaltenango' });
	assert.equal(municipioDe('San José').departamento, 'Escuintla');
	assert.equal(municipioDe('San José', 'Petén').departamento, 'Petén');
	assert.equal(municipioDe('San Pedro Sacatepéquez').departamento, 'Guatemala');
	assert.equal(municipioDe('San Pedro Sacatepéquez', 'San Marcos').departamento, 'San Marcos');
	assert.equal(municipioDe('Narnia'), null);
});

t('departamentoDe: el guardado manda; sin él, lo de antes sigue igual', () => {
	assert.equal(departamentoDe({ ciudad: 'San José', departamento: 'Petén' }), 'Petén');
	assert.equal(departamentoDe({ ciudad: 'La Libertad', departamento: 'Huehuetenango' }), 'Huehuetenango');
	assert.equal(departamentoDe({ ciudad: 'San Miguel Dueñas' }), 'Sacatepéquez');
	assert.equal(departamentoDe({ ciudad: 'Cobán' }), 'Alta Verapaz');
	assert.equal(departamentoDe({ zona: 'Monterrico', ciudad: 'Guatemala' }), 'Santa Rosa');
	assert.equal(departamentoDe({ zona: 'Antigua Guatemala', ciudad: 'Guatemala' }), 'Sacatepéquez');
	// Una colonia de la capital con nombre de municipio no cambia el departamento.
	assert.equal(departamentoDe({ zona: 'La Libertad', ciudad: 'Guatemala' }), 'Guatemala');
	assert.equal(departamentoDe({ zona: 'Colonia Las Flores', ciudad: 'Guatemala' }), 'Guatemala');
	assert.equal(departamentoDe({ zona: 'Zona 4', ciudad: 'Narnia' }), '');
	assert.equal(departamentoDe({ zona: 'Santa Ana' }), 'Petén');
	assert.equal(departamentoDe({ departamento: 'Narnia', ciudad: 'Mixco' }), 'Guatemala');
});

t('mismo municipio: el de antes y el de la lista lo son (la zona no se borra al pasarlo)', () => {
	assert.ok(mismoMunicipio({ ciudad: 'Ciudad de Guatemala' }, { ciudad: 'Guatemala', departamento: 'Guatemala' }));
	assert.ok(mismoMunicipio({ ciudad: 'antigua' }, { ciudad: 'Antigua Guatemala', departamento: 'Sacatepéquez' }));
	assert.ok(!mismoMunicipio({ ciudad: 'Guatemala' }, { ciudad: 'Mixco', departamento: 'Guatemala' }));
	assert.ok(!mismoMunicipio({ ciudad: 'San José', departamento: 'Escuintla' }, { ciudad: 'San José', departamento: 'Petén' }));
	assert.ok(mismoMunicipio({ ciudad: 'Narnia' }, { ciudad: 'narnia' }));
	assert.ok(nombreRepetido('San José') && nombreRepetido('la libertad') && !nombreRepetido('Mixco'));
});

t('capital y zona obligatoria', () => {
	assert.ok(esCapital({ ciudad: 'Guatemala' }));
	assert.ok(esCapital({ ciudad: 'Guatemala', departamento: 'Guatemala' }));
	assert.ok(esCapital({ ciudad: 'Ciudad de Guatemala' }));
	assert.ok(!esCapital({ ciudad: 'Mixco', departamento: 'Guatemala' }));
	assert.ok(pideZona({ ciudad: 'Guatemala' }));
	assert.ok(!pideZona({ ciudad: 'San Miguel Dueñas', departamento: 'Sacatepéquez' }));
	assert.ok(pideZona({ ciudad: 'Mixco', departamento: 'Guatemala' }));
	assert.ok(!pideZona({ ciudad: 'Fraijanes', departamento: 'Guatemala' }));
});

t('opciones de municipio: por departamento; lo guardado de antes queda como opción', () => {
	const g = opcionesMunicipio({});
	assert.equal(g.length, 22);
	assert.equal(g.find(([d]) => d === 'Sacatepéquez')[1].find((o) => o.texto === 'San Miguel Dueñas, Sacatepéquez').valor.ciudad, 'San Miguel Dueñas');
	const viejo = opcionesMunicipio({ ciudad: 'Ciudad de Guatemala' });
	assert.deepEqual(viejo[0], ['Guardado', [{ texto: 'Ciudad de Guatemala', valor: { ciudad: 'Ciudad de Guatemala', departamento: '' } }]]);
	assert.equal(opcionesMunicipio({ ciudad: 'Mixco', departamento: 'Guatemala' }).length, 22);
});

t('opciones de zona: inventario con cuántas, zonas de la capital, sectores; lo guardado no se pierde', () => {
	const props = [{ zona: 'Zona 16', ciudad: 'Guatemala' }, { zona: 'Zona 16', ciudad: 'Guatemala' }, { zona: 'zona 15', ciudad: 'Guatemala' },
		{ zona: 'Aldea Los Llanos', ciudad: 'San Miguel Dueñas', departamento: 'Sacatepéquez' }];
	const cap = opcionesZona({ ciudad: 'Guatemala', departamento: 'Guatemala' }, props);
	assert.deepEqual(cap[0], ['En tu inventario', [{ texto: 'Zona 16', nota: '2 propiedades' }, { texto: 'zona 15', nota: '1 propiedad' }]]);
	assert.equal(cap[1][0], 'Las demás');
	assert.ok(!cap[1][1].some((o) => o.texto === 'Zona 16' || o.texto === 'Zona 15'));
	assert.ok(cap[1][1].some((o) => o.texto === 'Carretera a El Salvador'));
	const aldea = opcionesZona({ ciudad: 'San Miguel Dueñas', departamento: 'Sacatepéquez' }, props);
	assert.deepEqual(aldea, [['En tu inventario', [{ texto: 'Aldea Los Llanos', nota: '1 propiedad' }]]]);
	// Mixco: los sectores del departamento, no las zonas de la capital.
	const mixco = opcionesZona({ ciudad: 'Mixco', departamento: 'Guatemala' }, props);
	assert.ok(!mixco.flatMap(([, o]) => o).some((o) => o.texto === 'Zona 16'));
	assert.ok(mixco.flatMap(([, o]) => o).some((o) => o.texto === 'Carretera a Muxbal'));
	const guardada = opcionesZona({ ciudad: 'Guatemala', zona: 'Cayalá' }, props);
	assert.deepEqual(guardada[0], ['Guardada', [{ texto: 'Cayalá' }]]);
});

t('zonas de interés: de texto o lista; opciones con el municipio entero', () => {
	assert.deepEqual(zonasDeCliente('Zona 16, Carretera a El Salvador; Mixco'), ['Zona 16', 'Carretera a El Salvador', 'Mixco']);
	assert.deepEqual(zonasDeCliente(['Zona 15', ' ']), ['Zona 15']);
	assert.deepEqual(zonasDeCliente(undefined), []);
	const g = opcionesZonasInteres([{ zona: 'Zona 1', ciudad: 'Mixco', departamento: 'Guatemala' }]);
	const gua = g.find(([d]) => d === 'Guatemala')[1];
	assert.ok(gua.some((o) => o.texto === 'Zona 1 · Mixco'));
	assert.ok(gua.some((o) => o.texto === 'Mixco' && o.nota === 'todo el municipio'));
	assert.ok(gua.some((o) => o.texto === 'Zona 16'));
});

console.log(`${ok} pruebas de lugares correctas`);
