// Entorno de pruebas local: sirve dist/ y atiende /api/* con las mismas funciones de Netlify.
//   PORT=8090 node --import ./scripts/entorno/red-local.mjs scripts/entorno/servidor.mjs
import http from 'node:http';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(RAIZ, 'dist');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
	'.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

// Cada función dice su ruta en `config.path`; las programadas (sin ruta) no se sirven.
const funciones = new Map();
for (const archivo of await readdir(path.join(RAIZ, 'netlify/functions'))) {
	const m = await import(pathToFileURL(path.join(RAIZ, 'netlify/functions', archivo)));
	if (m.config?.path) funciones.set(m.config.path, m.default);
}

http.createServer(async (req, res) => {
	const url = new URL(req.url, 'http://localhost');
	try {
		const funcion = funciones.get(url.pathname);
		if (funcion) {
			const cuerpo = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(await Array.fromAsync(req));
			const r = await funcion(new Request(url, { method: req.method, headers: req.headers, body: cuerpo }), { ip: '127.0.0.1' });
			res.writeHead(r.status, Object.fromEntries(r.headers));
			return res.end(Buffer.from(await r.arrayBuffer()));
		}
		let archivo = path.join(DIST, decodeURIComponent(url.pathname));
		if (url.pathname.endsWith('/')) archivo = path.join(archivo, 'index.html');
		if (!archivo.startsWith(DIST)) throw Object.assign(new Error('fuera'), { code: 'ENOENT' });
		const datos = await readFile(archivo).catch(async (e) => { if (e.code !== 'EISDIR') throw e; archivo = path.join(archivo, 'index.html'); return readFile(archivo); });
		res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
		res.end(datos);
	} catch (err) {
		res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end(err.code === 'ENOENT' ? 'No existe' : `Error: ${err.message}`);
	}
}).listen(Number(process.env.PORT) || 8090, () => console.log(`Entorno de pruebas en http://localhost:${Number(process.env.PORT) || 8090} (${funciones.size} funciones)`));
