// Acuerdo con el dueño por inmueble (admin/js/acuerdo.js): qué aplica a cada operación, la herencia de los datos
// que antes vivían en la persona, las exclusivas por vencer y qué campos viejos ya se pueden borrar.
import assert from 'node:assert/strict';
import { camposDelAcuerdo, acuerdoHeredado, acuerdoDe, diasExclusiva, exclusivasPorVencer, legadoSobrante, comisionDe, montoComision, textoComision, REGLAS_POR_DEFECTO } from '../admin/js/acuerdo.js';
import { calcularLinea, mesesArrendamiento, lineaVacia } from '../admin/js/cotizacion.js';
import { duenoDe, casasDe } from '../admin/js/duenos.js';

// Cada operación con lo suyo
assert.ok(camposDelAcuerdo('venta').includes('impuestoVenta') && camposDelAcuerdo('venta').includes('comisionPct'));
assert.ok(camposDelAcuerdo('renta').includes('comisionRentaMeses') && !camposDelAcuerdo('renta').includes('comisionPct') && !camposDelAcuerdo('renta').includes('impuestoVenta'));
assert.deepEqual(camposDelAcuerdo('vacacional'), ['exclusiva', 'exclusivaInicio', 'exclusivaFin', 'contrato']);

// Herencia: solo lo que aplica y solo lo que tiene valor
const dueno = { id: 'd1', nombre: 'Ana', exclusiva: true, exclusivaFin: '2026-12-01', comisionPct: 4, comisionRentaMeses: '', impuestoVenta: 'iva', comisionRegimen: 'pequeno', telefono: '+502 5555 0001', propiedades: [{ propertyId: 'v1' }, { propertyId: 'r1' }] };
assert.deepEqual(acuerdoHeredado(dueno, 'venta'), { exclusiva: true, exclusivaFin: '2026-12-01', comisionPct: 4, impuestoVenta: 'iva', comisionRegimen: 'pequeno' });
assert.deepEqual(acuerdoHeredado(dueno, 'renta'), { exclusiva: true, exclusivaFin: '2026-12-01', comisionRegimen: 'pequeno' });
assert.deepEqual(acuerdoHeredado(dueno, 'vacacional'), { exclusiva: true, exclusivaFin: '2026-12-01' });
assert.deepEqual(acuerdoHeredado(null, 'venta'), {});

// El acuerdo propio manda, aunque esté vacío (ese inmueble ya se revisó y no tiene exclusiva)
assert.deepEqual(acuerdoDe({ exclusiva: false, comisionPct: 3 }, dueno, 'venta'), { comisionPct: 3 });
assert.deepEqual(acuerdoDe({}, dueno, 'venta'), {});
assert.deepEqual(acuerdoDe(null, dueno, 'vacacional'), { exclusiva: true, exclusivaFin: '2026-12-01' });

// Días para vencer
const AHORA = new Date('2026-11-13T12:00:00-06:00').getTime();
assert.equal(diasExclusiva({ exclusiva: true, exclusivaFin: '2026-11-23' }, AHORA, '-06:00'), 11);
assert.equal(diasExclusiva({ exclusiva: true, exclusivaFin: '2026-11-01' }, AHORA, '-06:00') < 0, true);
assert.equal(diasExclusiva({ exclusiva: false, exclusivaFin: '2026-11-23' }, AHORA), null);
assert.equal(diasExclusiva({ exclusiva: true }, AHORA), null);
assert.equal(diasExclusiva({ exclusiva: true, exclusivaFin: 'mañana' }, AHORA), null);

// Por vencer: una por inmueble; el acuerdo propio manda sobre lo heredado
const casas = [{ id: 'v1', titulo: 'Casa en venta', operacion: 'venta', propietarioId: 'd1' }, { id: 'r1', titulo: 'Apto en renta', operacion: 'renta' }, { id: 'x', titulo: 'Sin dueño', operacion: 'venta' }];
const porVencer = exclusivasPorVencer(casas, { v1: { exclusiva: true, exclusivaFin: '2027-06-01' }, r1: null }, [dueno], { ahora: AHORA, zona: '-06:00' });
assert.deepEqual(porVencer.map((x) => [x.casa.id, x.dueno.id, x.dias]), [['r1', 'd1', 19]]);
assert.equal(exclusivasPorVencer(casas, { v1: { exclusiva: true, exclusivaFin: '2026-11-20' }, r1: {} }, [dueno], { ahora: AHORA, zona: '-06:00' }).length, 1);

// Un acuerdo que no se pudo leer (undefined) usa lo heredado, igual que uno que no existe (null); 0 % es un acuerdo, no un vacío
assert.equal(exclusivasPorVencer(casas, { v1: undefined, r1: undefined }, [dueno], { ahora: AHORA, zona: '-06:00' }).length, 2);
assert.deepEqual(acuerdoDe({ comisionPct: 0 }, dueno, 'venta'), { comisionPct: 0 });
// El dueño que la casa dice tener manda sobre quien solo la tiene en su lista
const otro = { id: 'd2', nombre: 'Otro', exclusiva: true, exclusivaFin: '2026-11-20', propiedades: [{ propertyId: 'v1' }] };
assert.equal(exclusivasPorVencer([casas[0]], { v1: null }, [otro, dueno], { ahora: AHORA, zona: '-06:00' })[0].dueno.id, 'd1');

// Qué se puede borrar de la persona: solo lo ya copiado en todos los inmuebles donde aplica
const dosCasas = [{ id: 'v1', operacion: 'venta' }, { id: 'r1', operacion: 'renta' }];
assert.deepEqual(legadoSobrante(dueno, dosCasas, []), []);
assert.deepEqual(legadoSobrante(dueno, dosCasas, ['v1']).sort(), ['comisionPct', 'impuestoVenta']); // la exclusiva aún falta en r1
assert.deepEqual(legadoSobrante(dueno, dosCasas, ['v1', 'r1']).sort(), ['comisionPct', 'comisionRegimen', 'comisionRentaMeses', 'exclusiva', 'exclusivaFin', 'impuestoVenta']);
// Sin casa en venta, la comisión de venta y los impuestos no tienen dónde caer: se quedan en la persona
assert.deepEqual(legadoSobrante(dueno, [{ id: 'n1', operacion: 'vacacional' }], ['n1']).sort(), ['exclusiva', 'exclusivaFin']);
assert.deepEqual(legadoSobrante(dueno, [], []), []);

// Comisión de un inmueble: acuerdo → regla general → la de siempre; un 0 acordado vale 0
const general = { comisionVentaPct: 6, comisionRentaMeses: 2 };
assert.deepEqual([comisionDe('venta', { comisionPct: 4 }, general).valor, comisionDe('venta', { comisionPct: 4 }, general).fuente], [4, 'acuerdo']);
assert.deepEqual([comisionDe('venta', {}, general).valor, comisionDe('venta', {}, general).fuente], [6, 'general']);
assert.equal(comisionDe('venta', { comisionPct: '' }, null).valor, REGLAS_POR_DEFECTO.comisionVentaPct);
assert.equal(comisionDe('venta', { comisionPct: 0 }, general).valor, 0);
assert.deepEqual([comisionDe('renta', { comisionRentaMeses: 1.5 }, general).tipo, comisionDe('renta', { comisionRentaMeses: 1.5 }, general).valor], ['meses', 1.5]);
assert.equal(comisionDe('renta', null, general).valor, 2);
assert.equal(comisionDe('renta', null, undefined).valor, 1);
assert.equal(comisionDe('vacacional', { comisionPct: 4 }, general), null); // por noche: margen, no comisión
assert.deepEqual([comisionDe('venta', { comisionRegimen: 'general', comisionModo: 'separado' }).regimen, comisionDe('venta', { comisionModo: 'separado' }).modo], ['general', 'separado']);
assert.equal(montoComision(comisionDe('venta', { comisionPct: 4 }), 100000), 4000);
assert.equal(montoComision(comisionDe('renta', { comisionRentaMeses: 1.5 }), 1000), 1500);
assert.equal(montoComision(comisionDe('renta', null), 1000, mesesArrendamiento(7)), 6000); // 7 años = 6 rentas
assert.equal(montoComision(null, 1000), 0);
assert.deepEqual([textoComision(comisionDe('venta')), textoComision(comisionDe('renta'))], ['5 %', '1 mes de renta']);
// La cotización usa la misma cuenta: con lo de siempre no cambia ningún número
assert.equal(calcularLinea({ ...lineaVacia('compraventa'), precio: 100000 }, 'general', 'separado').honorario, 5000);
assert.equal(calcularLinea({ ...lineaVacia('compraventa', 'USD', general), precio: 100000 }, 'general', 'separado').honorario, 6000);
assert.equal(calcularLinea({ ...lineaVacia('arrendamiento'), renta: 1000, anios: 7 }, 'general', 'separado').honorario, 6000);
assert.equal(calcularLinea({ ...lineaVacia('arrendamiento'), renta: 1000, anios: 2, mesesPorAnio: 1.5 }, 'general', 'separado').honorario, 3000);
assert.equal(calcularLinea({ tipo: 'arrendamiento', renta: 1000, anios: 1 }, 'general', 'separado').honorario, 1000); // cotización de antes, sin mesesPorAnio

// Dueño de una casa: manda la casa; la lista solo para las que no dicen de quién son
const ana = { id: 'ana', propiedades: [{ propertyId: 'c1' }, { propertyId: 'c2' }] }, beto = { id: 'beto', propiedades: [] };
const c1 = { id: 'c1', propietarioId: 'beto' }, c2 = { id: 'c2' };
assert.equal(duenoDe(c1, [ana, beto]).id, 'beto');
assert.equal(duenoDe(c2, [ana, beto]).id, 'ana');
assert.equal(duenoDe({ id: 'c3' }, [ana, beto]), null);
assert.deepEqual(casasDe(ana, [c1, c2]).map((c) => c.id), ['c2']);

console.log('Acuerdo por inmueble: todo bien.');
