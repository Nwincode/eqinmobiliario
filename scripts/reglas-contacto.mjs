// Escribe en firestore.rules la función tieneContacto desde la lista de js/calc-vacacional.js (FILTRO_CONTACTO): el
// filtro del chat es UNO, el del navegador, y la regla corre exactamente los mismos pasos (reemplazos y búsquedas).
//   node scripts/reglas-contacto.mjs           la pone al día
//   node scripts/reglas-contacto.mjs --revisar  falla si no está al día (lo corre scripts/test-reglas-contacto.mjs)
import { readFileSync, writeFileSync } from 'node:fs';
import '../js/calc-vacacional.js';

const ARCHIVO = new URL('../firestore.rules', import.meta.url);
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
