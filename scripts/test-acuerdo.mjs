// Acuerdo con el dueño por inmueble (admin/js/acuerdo.js): qué aplica a cada operación, la herencia de los datos
// que antes vivían en la persona, las exclusivas por vencer y qué campos viejos ya se pueden borrar.
import assert from 'node:assert/strict';
import { camposDelAcuerdo, acuerdoHeredado, acuerdoDe, diasExclusiva, exclusivasPorVencer, legadoSobrante } from '../admin/js/acuerdo.js';

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

// Qué se puede borrar de la persona: solo lo ya copiado en todos los inmuebles donde aplica
const dosCasas = [{ id: 'v1', operacion: 'venta' }, { id: 'r1', operacion: 'renta' }];
assert.deepEqual(legadoSobrante(dueno, dosCasas, []), []);
assert.deepEqual(legadoSobrante(dueno, dosCasas, ['v1']).sort(), ['comisionPct', 'impuestoVenta']); // la exclusiva aún falta en r1
assert.deepEqual(legadoSobrante(dueno, dosCasas, ['v1', 'r1']).sort(), ['comisionPct', 'comisionRegimen', 'comisionRentaMeses', 'exclusiva', 'exclusivaFin', 'impuestoVenta']);
// Sin casa en venta, la comisión de venta y los impuestos no tienen dónde caer: se quedan en la persona
assert.deepEqual(legadoSobrante(dueno, [{ id: 'n1', operacion: 'vacacional' }], ['n1']).sort(), ['exclusiva', 'exclusivaFin']);
assert.deepEqual(legadoSobrante(dueno, [], []), []);

console.log('Acuerdo por inmueble: todo bien.');
