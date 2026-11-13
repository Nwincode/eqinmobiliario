// Pruebas del formato único de teléfonos (admin/js/formato.js). Sin dependencias.
import assert from 'node:assert/strict';
import { partirTelefono, unirTelefono, telefonoValido, telefonoWa } from '../admin/js/formato.js';

let ok = 0;
function test(nombre, fn) {
	try { fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${err.stack}`); process.exitCode = 1; }
}

test('guardado con código: se separa en código y número', () => {
	assert.deepEqual(partirTelefono('+502 5555 1234'), { codigo: '502', numero: '5555 1234' });
	assert.deepEqual(partirTelefono('+1 305 555 1234'), { codigo: '1', numero: '305 555 1234' });
	assert.deepEqual(partirTelefono('+50255551234'), { codigo: '502', numero: '55551234' });
	assert.deepEqual(partirTelefono('+503 7123 4567'), { codigo: '503', numero: '7123 4567' });
});
test('guardado sin código (como antes): código por defecto, número intacto', () => {
	assert.deepEqual(partirTelefono('5555 1234'), { codigo: '502', numero: '5555 1234' });
	assert.deepEqual(partirTelefono('305 555 1234', '1'), { codigo: '1', numero: '305 555 1234' });
	assert.deepEqual(partirTelefono(''), { codigo: '502', numero: '' });
});
test('11 dígitos con el código pegado: se separa', () => {
	assert.deepEqual(partirTelefono('50255551234'), { codigo: '502', numero: '55551234' });
	assert.deepEqual(partirTelefono('13055551234'), { codigo: '1', numero: '3055551234' });
});
test('código que no está en la lista: se conserva completo', () => {
	assert.deepEqual(partirTelefono('+995 555 123 456'), { codigo: '', numero: '+995 555 123 456' });
	assert.equal(unirTelefono('', '+995 555 123 456'), '+995 555 123 456');
});
test('unir: código + número; el «+» escrito a mano manda; vacío queda vacío', () => {
	assert.equal(unirTelefono('502', ' 5555 1234 '), '+502 5555 1234');
	assert.equal(unirTelefono('502', '+1 305 555 1234'), '+1 305 555 1234');
	assert.equal(unirTelefono('502', ''), '');
});
test('partir y unir no cambian un teléfono ya guardado con código', () => {
	for (const t of ['+502 5555 1234', '+1 305 555 1234', '+34 612 345 678', '+995 555 123 456']) {
		const p = partirTelefono(t);
		assert.equal(unirTelefono(p.codigo, p.numero), t);
	}
});
test('válido: de 7 a 15 dígitos contando el código', () => {
	assert.equal(telefonoValido('+502 5555 1234'), true);
	assert.equal(telefonoValido('+502 555'), false);
	assert.equal(telefonoValido('+1 305 555 1234 99999'), false);
	assert.equal(telefonoValido(''), false);
});
test('WhatsApp: mismo número con o sin código guardado', () => {
	assert.equal(telefonoWa('+502 5555 1234'), '50255551234');
	assert.equal(telefonoWa('5555 1234'), '50255551234');
	assert.equal(telefonoWa('+1 305 555 1234'), '13055551234');
});

console.log(`\n${ok} pruebas correctas${process.exitCode ? ' (con fallas)' : ''}.`);
