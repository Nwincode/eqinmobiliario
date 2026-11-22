// Escribe en firestore.rules la función tieneContacto desde la lista de js/calc-vacacional.js (FILTRO_CONTACTO): el
// filtro del chat es UNO, el del navegador, y la regla corre exactamente los mismos pasos (reemplazos y búsquedas).
//   node scripts/reglas-contacto.mjs           la pone al día
//   node scripts/reglas-contacto.mjs --revisar  falla si no está al día (lo corre scripts/test-reglas-contacto.mjs)
//
// Antes, escribe en js/calc-vacacional.js (entre <codigos-pais> y </codigos-pais>) el patrón de un teléfono con su
// código de país, seguido, desde admin/js/formato.js CODIGOS_PAIS (los largos de libphonenumber, con su versión): el
// filtro no lleva una lista de códigos escrita de memoria.
import { readFileSync, writeFileSync } from 'node:fs';
import { CODIGOS_PAIS } from '../admin/js/formato.js';

const CALC = new URL('../js/calc-vacacional.js', import.meta.url);
const ARCHIVO = new URL('../firestore.rules', import.meta.url);

// «502[0-9]{8}|1[0-9]{10}|…|49[0-9]{4,15}|…»: cada código con los largos de su país (un rango si son seguidos) y sus
// números especiales (gratuitos, de pago…), con \d como [0-9].
export function patronConCodigo() {
	const largos = (l) => (l.length > 1 && l.every((x, i) => !i || x === l[i - 1] + 1) ? `[0-9]{${l[0]},${l.at(-1)}}` : l.map((x) => `[0-9]{${x}}`).join('|'));
	return CODIGOS_PAIS.map(([c, , l, , especial]) => `${c}(${largos(l)}${especial ? `|${especial.replace(/\\d/g, '[0-9]').replace(/\(\?:/g, '(')}` : ''})`).join('|');
}
const I_COD = '	// <codigos-pais>', F_COD = '	// </codigos-pais>';
// Los códigos de 2 o más cifras («502|503|…|52|…»): delante de una fecha, la vuelven un teléfono («502 23-12-2015»).
export const patronCodigos = () => CODIGOS_PAIS.map(([c]) => c).filter((c) => c.length > 1).join('|');
// Los años de una fecha completa: del año pasado a dentro de 3 («23-12-2015» no es una fecha de reserva). Cambia cada
// año: el 1 de enero `npm test` falla hasta que se corre este guion y se publican las reglas.
export const patronAnios = (hoy = new Date()) => Array.from({ length: 5 }, (_, i) => hoy.getFullYear() - 1 + i).join('|');
// Dos años seguidos («2024-2025», «2019/2020», «2018, 2019»): una temporada o una lista, no un teléfono.
// (De 2010 a 2036, con un espacio a lo más: el compilador de reglas no acepta un patrón de más de 4096 letras.)
export const patronSeguidos = () => Array.from({ length: 26 }, (_, i) => 2010 + i).map((y) => `${y} ?[-/,] ?${y + 1}`).join('|');
export function calcAlDia(calc = readFileSync(CALC, 'utf8')) {
	const a = calc.indexOf(I_COD), b = calc.indexOf(F_COD);
	if (a < 0 || b < 0) throw new Error('js/calc-vacacional.js no tiene las marcas <codigos-pais>');
	const linea = calc.slice(a, calc.indexOf('\n', a));
	const js = (x) => x.replace(/\\/g, '\\\\');
	return `${calc.slice(0, a)}${linea}\n	var CON_CODIGO = '${js(patronConCodigo())}';\n	var CODIGOS = '${patronCodigos()}';\n	var ANIOS = '${patronAnios()}';\n	var SEGUIDOS = '${js(patronSeguidos())}';\n${calc.slice(b)}`;
}
{
	const antes = readFileSync(CALC, 'utf8'), despues = calcAlDia(antes);
	if (antes !== despues) {
		if (process.argv.includes('--revisar') && import.meta.url === `file://${process.argv[1]}`) { console.error('js/calc-vacacional.js: los códigos de país no están al día. Corre node scripts/reglas-contacto.mjs'); process.exit(1); }
		if (import.meta.url === `file://${process.argv[1]}`) writeFileSync(CALC, despues);
	}
}
await import('../js/calc-vacacional.js');
const INICIO = '    // <filtro-contacto>';
const FIN = '    // </filtro-contacto>';
const texto = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export function funcionDeReglas(pasos = globalThis.EQVacacional.FILTRO_CONTACTO) {
	const lineas = [`${INICIO} Lo escribe scripts/reglas-contacto.mjs desde js/calc-vacacional.js (FILTRO_CONTACTO): no se edita a mano.`,
		'    // Los mismos pasos que el navegador: reemplazos en orden y, entre ellos, las búsquedas («si»).', '    function tieneContacto(texto) {'];
	const condiciones = [];
	let actual = 'texto.lower()', n = 0, pendiente = false;
	for (const [tipo, patron, tercero] of pasos) {
		if (tipo === 'cambia') { actual = `${actual}.replace(${texto(patron)}, ${texto(tercero)})`; pendiente = true; continue; }
		if (tercero !== 'crudo' && pendiente) { lineas.push(`      let t${++n} = ${actual};`); actual = `t${n}`; pendiente = false; }
		condiciones.push(`${tercero === 'crudo' ? 'texto' : actual}.matches(${texto(`[\\s\\S]*(?:${patron})[\\s\\S]*`)})`);
	}
	lineas.push(`      return ${condiciones.join('\n        || ')};`, '    }', FIN);
	return lineas.join('\n');
}

export function reglasAlDia(reglas = readFileSync(ARCHIVO, 'utf8')) {
	const a = reglas.indexOf(INICIO), b = reglas.indexOf(FIN);
	if (a < 0 || b < 0) throw new Error('firestore.rules no tiene las marcas del filtro de contacto');
	return reglas.slice(0, a) + funcionDeReglas() + reglas.slice(b + FIN.length);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const antes = readFileSync(ARCHIVO, 'utf8'), despues = reglasAlDia(antes);
	if (process.argv.includes('--revisar')) {
		if (antes !== despues) { console.error('firestore.rules: el filtro de contacto no está al día. Corre node scripts/reglas-contacto.mjs'); process.exit(1); }
		console.log('Filtro de contacto de las reglas al día.');
	} else { writeFileSync(ARCHIVO, despues); console.log(antes === despues ? 'Ya estaba al día.' : 'firestore.rules al día.'); }
}
