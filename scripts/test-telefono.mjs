// Pruebas del formato único de teléfonos (admin/js/formato.js). Sin dependencias.
import assert from 'node:assert/strict';
import { partirTelefono, unirTelefono, telefonoValido, telefonoWa, sugerenciaCorreo, correoValido, CODIGOS_PAIS } from '../admin/js/formato.js';

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
test('Guatemala: exactamente 8 dígitos después del +502', () => {
	assert.equal(telefonoValido('+502 1234'), false);
	assert.equal(telefonoValido('+502 5555 12345'), false);
	assert.equal(telefonoValido('+502 5555-1234'), true);
	assert.equal(telefonoValido('+52 55 1234 5678'), true);
});
test('cada país con su largo: «+1 555 1234» o «+52 1234567» no pasan; un número con «+» nunca cambia de país', () => {
	for (const t of ['+1 555 1234', '+52 1234567', '+34 61234567', '+503 7123 45']) assert.equal(telefonoValido(t), false, t);
	for (const t of ['+1 305 555 1234', '+52 55 1234 5678', '+34 612 345 678', '+39 392 123 4567', '+55 11 91234 5678', '+995 555 123 456']) assert.equal(telefonoValido(t), true, t);
	assert.equal(telefonoWa('+1 555 1234'), '15551234');
	assert.equal(telefonoWa('5555 1234'), '50255551234');
	assert.equal(telefonoWa('+502 5555 1234'), '50255551234');
	assert.ok(CODIGOS_PAIS.every(([c, , largos, celular]) => /^\d+$/.test(c) && largos.includes(celular)));
});
test('un número válido de cada país de la lista pasa (celulares de ejemplo de libphonenumber), y su WhatsApp lleva su código', () => {
	const validos = ['+1 201 555 0123', '+1 506 234 5678', '+31 6 12345678', '+33 6 12 34 56 78', '+34 612 34 56 78', '+39 312 345 6789', '+44 7400 123456',
		'+49 1512 3456789', '+52 222 123 4567', '+54 9 11 2345 6789', '+55 11 96123 4567', '+56 2 2123 4567', '+57 321 1234567', '+61 412 345 678',
		'+501 622 1234', '+502 5123 4567', '+503 7012 3456', '+504 9123 4567', '+505 8123 4567', '+506 8312 3456', '+507 6123 4567', '+972 50 234 5678',
		// Otros largos del plan de cada país: fijo de Alemania, 1-800 de Guatemala, fijo de Brasil sin el 9.
		'+49 30 123456', '+502 1801 2345678', '+55 11 2345 6789'];
	for (const t of validos) assert.equal(telefonoValido(t), true, t);
	// Cada código de la lista tiene su ejemplo.
	for (const [c] of CODIGOS_PAIS) assert.ok(validos.some((t) => partirTelefono(t).codigo === c), `falta un ejemplo de +${c}`);
	for (const t of validos) assert.equal(telefonoWa(t), t.replace(/\D/g, ''), t);
	// Comprobado aparte contra libphonenumber 1.11.12 con 60 000 números al azar por país: ninguno válido allá se rechaza aquí.
});
test('largos raros solo con el patrón de su país; no se rechaza lo que antes pasaba (0 de larga distancia, «1» de México, extensión)', () => {
	assert.equal(telefonoValido('+502 1 305 555 1234'), false);
	assert.equal(telefonoValido('+502 1801 2345678'), true);
	for (const [t, wa] of [['+44 07911 123456', '447911123456'], ['+52 1 55 1234 5678', '525512345678'], ['+1 1 305 555 1234', '13055551234'],
		['+502 5555 1234 ext. 12', '50255551234'], ['+502 5555-1234 x3', '50255551234'], ['+39 06 1234 5678', '390612345678']]) {
		assert.equal(telefonoValido(t), true, t);
		assert.equal(telefonoWa(t), wa, t);
	}
});
test('código pegado por el autollenado: se quita solo si así queda el largo de ese país', () => {
	assert.equal(unirTelefono('502', '50255551234'), '+502 55551234');
	assert.equal(unirTelefono('1', '13055551234'), '+1 3055551234');
	assert.equal(unirTelefono('502', '00502 5555 1234'), '+502 55551234');
	// Un número que empieza igual que su código no se corta (Italia +39, Brasil +55 con código de área 55).
	assert.equal(unirTelefono('39', '392 123 4567'), '+39 392 123 4567');
	assert.equal(unirTelefono('55', '55 91234 5678'), '+55 55 91234 5678');
});
test('«+(502) 5555-1234»: el código se corta por dígitos, no por letras', () => {
	assert.deepEqual(partirTelefono('+(502) 5555-1234'), { codigo: '502', numero: '5555-1234' });
	assert.equal(unirTelefono('502', partirTelefono('+(502) 5555-1234').numero), '+502 5555-1234');
});
test('correo: sin puntos al inicio, al final o seguidos antes de la @, ni guion al borde del dominio', () => {
	for (const c of ['.ana@gmail.com', 'ana..x@gmail.com', 'ana.@gmail.com', 'ana@-gmail.com', 'ana@gmail-.com', 'ana@correo']) assert.equal(correoValido(c), false, c);
	for (const c of ['ana@gmail.com', 'ana.p+x@empresa.com.gt', 'a@b.co', 'ana@mi-empresa.gt']) assert.equal(correoValido(c), true, c);
});
test('Correo con el dominio mal escrito: se sugiere el bueno; uno bien escrito o propio no se toca', () => {
	assert.equal(sugerenciaCorreo('roberto@gmial.com'), 'roberto@gmail.com');
	assert.equal(sugerenciaCorreo('Ana.P@Hotmail.con'), 'Ana.P@hotmail.com');
	assert.equal(sugerenciaCorreo('x@outlok.com'), 'x@outlook.com');
	assert.equal(sugerenciaCorreo('x@gmail.com'), '');
	assert.equal(sugerenciaCorreo('x@empresa.com.gt'), '');
	assert.equal(sugerenciaCorreo('x@eqinmobiliario.gt'), '');
	assert.equal(sugerenciaCorreo('sin-arroba'), '');
});
test('WhatsApp: mismo número con o sin código guardado', () => {
	assert.equal(telefonoWa('+502 5555 1234'), '50255551234');
	assert.equal(telefonoWa('5555 1234'), '50255551234');
	assert.equal(telefonoWa('+1 305 555 1234'), '13055551234');
});

console.log(`\n${ok} pruebas correctas${process.exitCode ? ' (con fallas)' : ''}.`);
