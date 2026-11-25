// La huella del panel (scripts/lib/huella-panel.mjs): cambia con el código del panel, no con lo demás.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { huellaDelPanel } from './lib/huella-panel.mjs';

const raiz = await mkdtemp(path.join(tmpdir(), 'eq-huella-'));
try {
	await mkdir(path.join(raiz, 'admin/js'), { recursive: true });
	await mkdir(path.join(raiz, 'css'), { recursive: true });
	await writeFile(path.join(raiz, 'admin/js/app.js'), 'uno');
	await writeFile(path.join(raiz, 'css/tema.css'), ':root{}');
	await writeFile(path.join(raiz, 'datos.json'), '{}');
	const a = await huellaDelPanel(raiz);
	assert.match(a, /^[0-9a-f]{16}$/);
	assert.equal(await huellaDelPanel(raiz), a, 'la misma con los mismos archivos');
	await writeFile(path.join(raiz, 'datos.json'), '{"otra":1}');
	assert.equal(await huellaDelPanel(raiz), a, 'lo que no es del panel no la cambia');
	await writeFile(path.join(raiz, 'admin/js/app.js'), 'dos');
	assert.notEqual(await huellaDelPanel(raiz), a, 'el código del panel sí');
	const b = await huellaDelPanel(raiz);
	await writeFile(path.join(raiz, 'css/tema.css'), ':root{--x:1}');
	assert.notEqual(await huellaDelPanel(raiz), b, 'los colores que usa el panel también');
	console.log('Huella del panel: ok');
} finally { await rm(raiz, { recursive: true, force: true }); }
