// La huella del panel: cambia solo cuando cambia el código que carga el panel (admin/ y lo del sitio que usa), no con una
// publicación de contenido. El build la escribe en dist/admin/version.json; el panel abierto la compara para avisar
// «Hay una versión nueva» (admin/js/version.js).
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const ARCHIVOS_DEL_PANEL = ['admin', 'js/calc-vacacional.js', 'js/calc-renta.js', 'css/tema.css', 'css/calendario.css', 'css/botones.css', 'css/hilo.css'];

async function archivos(root, rel) {
	const lleno = path.join(root, rel);
	try {
		const hijos = await readdir(lleno, { withFileTypes: true });
		return (await Promise.all(hijos.map((h) => archivos(root, path.join(rel, h.name))))).flat();
	} catch (err) {
		if (err.code === 'ENOTDIR') return [rel];
		if (err.code === 'ENOENT') return [];
		throw err;
	}
}

export async function huellaDelPanel(root, lista = ARCHIVOS_DEL_PANEL) {
	const todos = (await Promise.all(lista.map((rel) => archivos(root, rel)))).flat().map((f) => f.split(path.sep).join('/')).sort();
	const hash = createHash('sha256');
	for (const f of todos) hash.update(`${f}\0`).update(await readFile(path.join(root, f))).update('\0');
	return hash.digest('hex').slice(0, 16);
}
