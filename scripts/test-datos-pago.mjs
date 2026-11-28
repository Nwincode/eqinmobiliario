// Pruebas de admin/js/datos-pago.js: el texto de los datos de pago sale de las partes (una sola cuenta), los de antes en
// texto libre se quedan como están, y el mensaje de pago del chat no lo frena el filtro de contacto.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../js/calc-vacacional.js';
import { textoPago, limpiarPago, faltaEnPago, pagoVacio, pagoPorGuardar, BANCOS } from '../admin/js/datos-pago.js';
import { contactoPartido } from '../netlify/lib/avisos-chat.mjs';
import { porTraducir } from '../netlify/lib/traducciones.mjs';

const V = globalThis.EQVacacional;
let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };
const BI = { banco: 'Banco Industrial', tipoCuenta: 'Monetaria', moneda: 'GTQ', cuenta: '123-456789-0', titular: 'María José Castillo Pérez' };
const TEXTO_BI = 'Banco Industrial\nCuenta monetaria en quetzales: 123-456789-0\nA nombre de María José Castillo Pérez';

t('El texto sale de las partes, en tres renglones (como lo ve el cliente en el chat)', () => {
	assert.equal(textoPago(BI), TEXTO_BI);
	assert.equal(textoPago({ ...BI, tipoCuenta: 'Ahorro', moneda: 'USD' }), 'Banco Industrial\nCuenta de ahorro en dólares: 123-456789-0\nA nombre de María José Castillo Pérez');
});
t('«Otro» usa el nombre escrito; un banco de la lista no guarda nombre aparte', () => {
	assert.equal(textoPago({ ...BI, banco: 'Otro', bancoOtro: 'Banco de Antigua' }).split('\n')[0], 'Banco de Antigua');
	assert.equal(limpiarPago({ ...BI, bancoOtro: 'Banco de Antigua' }).bancoOtro, '');
	assert.equal(BANCOS.at(-1), 'Otro');
});
t('Un salto de línea o espacios de más no rompen los tres renglones; un banco inventado no entra', () => {
	assert.equal(textoPago({ ...BI, titular: '  María José\nCastillo  Pérez ' }), TEXTO_BI);
	assert.equal(limpiarPago({ ...BI, banco: 'Mi banco' }).banco, '');
	assert.equal(limpiarPago({ ...BI, moneda: 'US$', tipoCuenta: 'x' }).moneda, 'GTQ');
});
t('Todo o nada: una cuenta a medias no se guarda', () => {
	assert.equal(faltaEnPago(BI), '');
	assert.match(faltaEnPago({ ...BI, banco: '' }), /banco/);
	assert.match(faltaEnPago({ ...BI, banco: 'Otro' }), /nombre del banco/);
	assert.match(faltaEnPago({ ...BI, cuenta: '' }), /número de cuenta/);
	assert.match(faltaEnPago({ ...BI, cuenta: '12/34' }), /números, letras y guiones/);
	assert.match(faltaEnPago({ ...BI, titular: ' ' }), /a nombre de/);
	assert.ok(pagoPorGuardar({ ...BI, cuenta: '' }).error);
});
t('Guardar: partes completas dan las partes y su texto', () => {
	const r = pagoPorGuardar(BI, { textoAntes: 'Banrural 9988' });
	assert.equal(r.datosPago, TEXTO_BI);
	assert.deepEqual(r.pago, { ...BI, bancoOtro: '' });
});
t('Los datos de antes (texto libre) se quedan como están mientras no se llenen los campos', () => {
	const vacias = { banco: '', tipoCuenta: 'Monetaria', moneda: 'GTQ' };
	assert.ok(pagoVacio(vacias) && pagoVacio(undefined));
	assert.deepEqual(pagoPorGuardar(vacias, { textoAntes: 'Banrural 9988776655, a nombre de Ana' }), { pago: null, datosPago: 'Banrural 9988776655, a nombre de Ana' });
	// Si ya tenía su cuenta por partes y se vacían los campos, se quitan (el texto también).
	assert.deepEqual(pagoPorGuardar(vacias, { pagoAntes: BI, textoAntes: TEXTO_BI }), { pago: null, datosPago: '' });
});
t('El texto cabe en el mensaje del chat (las reglas: hasta 1000 letras)', () => {
	const largo = textoPago({ banco: 'Otro', bancoOtro: 'x'.repeat(500), cuenta: '1'.repeat(500), titular: 'y'.repeat(500), tipoCuenta: 'Ahorro', moneda: 'USD' });
	assert.ok(largo.length <= 1000, String(largo.length));
});
t('El número de cuenta parece un teléfono para el filtro de contacto: por eso el pago va con su tipo, que no se filtra', () => {
	assert.equal(V.tieneContacto(TEXTO_BI), true);
	const pago = { id: 'p', de: 'socio', tipo: 'pago', texto: TEXTO_BI, createdAt: 2 };
	// Ni el aviso de contacto partido ni el traductor toman un mensaje con tipo.
	assert.equal(contactoPartido([{ id: 'a', de: 'socio', texto: 'Hola, ya confirmé', createdAt: 1 }, pago], V.tieneContacto, V.tipoDeContacto), null);
	assert.equal(porTraducir(pago, { idioma: 'en' }, []), false);
	// Las reglas: el mensaje con tipo «pago» se compara con lo guardado, sin pasar por tieneContacto.
	const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
	assert.match(reglas, /request\.resource\.data\.tipo == 'pago'[\s\S]{0,300}request\.resource\.data\.texto == get\([\s\S]{0,120}\/propietarios\/[\s\S]{0,60}\.data\.datosPago\)/);
	assert.match(reglas, /: \(sinLlegada\(\) && !tieneContacto\(request\.resource\.data\.texto\)\)\)/);
});
t('La ficha: las partes de la cuenta las cambia solo el administrador (reglas y panel)', () => {
	const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
	assert.equal((reglas.match(/hasAny\(\['permisos', 'datosPago', 'pago', 'datosPagoCambio', 'bitacoraId'\]\)/g) || []).length, 2);
	const ficha = readFileSync(new URL('../admin/js/views/propietarios.js', import.meta.url), 'utf8');
	assert.match(ficha, /session\.isAdmin \? camposPago\(conNoche\) : \[\]/);
	assert.match(ficha, /else d\.pago = ahora\.pago;/);
});
t('El chat del cliente: datos en renglones, total en negrita y «Copiar datos» como ícono de 44 px en la fila del título', () => {
	const js = readFileSync(new URL('../js/reserva-chat.js', import.meta.url), 'utf8');
	assert.match(js, /el\('span', 'icon-copy'\)/);
	assert.match(js, /el\('button', 'hilo-ib'\)/);
	assert.match(js, /navigator\.clipboard\.writeText\(m\.texto \+ '\\n' \+ totalTxt\)/);
	const css = readFileSync(new URL('../css/hilo.css', import.meta.url), 'utf8');
	assert.match(css, /\.hilo-ib \{ width: 44px; height: 44px;/);
	assert.match(css, /\.hilo-tarj p \{[^}]*white-space: pre-wrap/);
});
console.log(`\n${ok} pruebas de datos de pago pasan.`);
