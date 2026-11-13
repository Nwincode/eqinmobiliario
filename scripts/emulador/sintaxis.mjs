// Revisa que ningún archivo de código tenga un error de sintaxis (lo que rompería el panel o el sitio al publicarlo).
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const CARPETAS = ['admin/js', 'js', 'scripts', 'netlify'];
// Bibliotecas de terceros ya minificadas: no son nuestras.
const AJENOS = /(^|\/)(bootstrap|tiny-slider|aos|navbar|counter|custom)[\w.-]*\.js$/;
const archivos = [];
const recorrer = (dir) => {
	for (const n of readdirSync(dir)) {
		const f = path.join(dir, n);
		if (statSync(f).isDirectory()) recorrer(f);
		else if (/\.(m?js)$/.test(n) && !AJENOS.test(f)) archivos.push(f);
	}
};
CARPETAS.forEach(recorrer);
let fallas = 0;
for (const f of archivos) {
	try {
		execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
	} catch (err) {
		fallas++;
		console.error(`Error de sintaxis en ${f}\n${String(err.stderr).split('\n').slice(0, 6).join('\n')}`);
	}
}
console.log(`Sintaxis: ${archivos.length - fallas} de ${archivos.length} archivos bien.`);
if (fallas) process.exit(1);
