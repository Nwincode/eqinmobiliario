// Ningún texto hace tardar el filtro de contacto (js/calc-vacacional.js): los patrones con cuantificadores anidados (una
// secuencia de días/mes y horas, grupos de cifras, usuarios) pueden tardar segundos con un texto armado a propósito
// («1/1-» × 24 tardaba 1,35 s). Se prueban los casos conocidos y un generador: cada par de piezas de los patrones,
// repetido hasta 1000 letras, con y sin una palabra delante. Falla si uno pasa de 50 ms.
import { readFileSync } from 'node:fs';
const g = {}; new Function('window', 'globalThis', 'self', readFileSync(new URL('../js/calc-vacacional.js', import.meta.url), 'utf8'))(g, g, g);
const V = g.EQVacacional;
const LARGO = 1000, TOPE = 50;
const rep = (u) => u.repeat(Math.ceil(LARGO / u.length)).slice(0, LARGO);
// Los de la revisión 11 y los de antes.
const conocidos = ['1/1-', 'a 1/1 ', '1/1 y ', '1/1 1:11 a ', '11:11-', '1:11 a ', '5', ' ', '5 ', '1,', '1.', 'a', 'a.', 'ig ', 'ig: ', '#', '#A# ',
	'2500 noches ', 'q5 ', 'las 1 ', 'at ', '20/1', '2026 ', '5a', ' x 5', '-5', '5+', '5٥', 'nit 1-', 'Ó', 'ÁÉÍÓÚ ñ '];
const casos = [...conocidos.map(rep), 'referencia ' + rep('5').slice(11), 'cel ' + rep('1/1 '), 'cel ' + rep('1:11 a '), 'x ' + rep('11:11-') + '/5', 'a ' + rep('1/1 1:11 a ') + ':', 'a ' + rep('1/1 y ') + '5', rep('a 1/1 ') + '/'];
// El generador: cada par de piezas (cifras, separadores, conectores, días/mes, horas, palabras de teléfono).
const PIEZAS = ['1/1', '12/31', '1:11', '23:59', '5', '55', '5555', ' ', '-', ',', '/', ':', '.', 'y ', 'a ', 'al ', 'a las ', '#', '@', 'x', '(', 'q', 'ig ', 'cel ', 'tel: ', 'referencia '];
for (const a of PIEZAS) for (const b of PIEZAS) for (const pre of ['', 'cel ', 'llámame ', 'mi correo es ']) casos.push(pre + rep(a + b));
V.tipoDeContacto('calentar');
const lentos = [];
for (const s of casos) {
	const t = performance.now();
	V.tipoDeContacto(s);
	const ms = performance.now() - t;
	if (ms > TOPE) lentos.push(`${ms.toFixed(0)} ms · ${JSON.stringify(s.slice(0, 40))}…`);
}
if (lentos.length) { console.error(`Filtro de contacto lento (más de ${TOPE} ms con ${LARGO} letras):\n${lentos.join('\n')}`); process.exit(1); }
console.log(`${casos.length} textos armados para hacer tardar el filtro: ninguno pasa de ${TOPE} ms.`);
