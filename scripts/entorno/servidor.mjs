// Entorno de pruebas local: sirve dist/ y atiende /api/* con las mismas funciones de Netlify.
//   PORT=8090 node --import ./scripts/entorno/red-local.mjs scripts/entorno/servidor.mjs
import http from 'node:http';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encabezadosPara, leerEncabezados } from '../lib/encabezados.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(RAIZ, 'dist');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
	'.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

// Los encabezados de netlify.toml, como en Netlify (también la regla de seguridad del panel, CSP). Lo único que se le
// agrega aquí: los emuladores de Firebase de esta máquina (site.config.json → emuladores), a donde el panel se conecta
// en vez de a Google. Nada más se abre.
const REGLAS = leerEncabezados(path.join(RAIZ, 'netlify.toml'));
const config = JSON.parse(await readFile(path.join(RAIZ, 'site.config.json'), 'utf8').catch(() => '{}'));
const EMULADORES = Object.values(config.emuladores || {}).map((x) => `http://${x}`).join(' ');
function encabezados(ruta) {
	const e = encabezadosPara(ruta, REGLAS);
	if (EMULADORES && e['Content-Security-Policy']) {
		e['Content-Security-Policy'] = e['Content-Security-Policy'].replace(/((?:^|[;,]\s*)(?:connect-src|img-src)[^;,]*)/g, `$1 ${EMULADORES}`);
	}
	return e;
}

// Cada función dice su ruta en `config.path`; las programadas (sin ruta) no se sirven.
const funciones = new Map();
for (const archivo of await readdir(path.join(RAIZ, 'netlify/functions'))) {
	const m = await import(pathToFileURL(path.join(RAIZ, 'netlify/functions', archivo)));
	for (const ruta of [].concat(m.config?.path || [])) funciones.set(ruta, m.default);
}

// Solo aquí (este servidor no se publica): apagar y prender la cuenta de escritura de las reservas, para probar que el
// panel sigue por el camino de antes cuando la función responde 503 (scripts/entorno/recorrido.mjs).
const ESCRITURA = ['GOOGLE_SA_ESCRITURA_EMAIL', 'GOOGLE_SA_ESCRITURA_KEY'];
const guardada = Object.fromEntries(ESCRITURA.map((k) => [k, process.env[k]]));

http.createServer(async (req, res) => {
	const url = new URL(req.url, 'http://localhost');
	try {
		if (url.pathname === '/__entorno/escritura' && req.method === 'POST') {
			const prender = url.searchParams.get('activa') === '1';
			for (const k of ESCRITURA) { if (prender) process.env[k] = guardada[k]; else delete process.env[k]; }
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			return res.end(prender ? 'prendida' : 'apagada');
		}
		const funcion = funciones.get(url.pathname);
		if (funcion) {
			const cuerpo = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(await Array.fromAsync(req));
			const r = await funcion(new Request(url, { method: req.method, headers: req.headers, body: cuerpo }), { ip: '127.0.0.1' });
			res.writeHead(r.status, Object.fromEntries(r.headers));
			return res.end(Buffer.from(await r.arrayBuffer()));
		}
		// Como Netlify: el CDN de imágenes entrega la foto original (aquí sin recortar) y lo que no existe muestra 404.html.
		if (url.pathname === '/.netlify/images') {
			res.writeHead(302, { Location: url.searchParams.get('url') || '/' });
			return res.end();
		}
		let archivo = path.join(DIST, decodeURIComponent(url.pathname));
		if (url.pathname.endsWith('/')) archivo = path.join(archivo, 'index.html');
		if (!archivo.startsWith(DIST)) throw Object.assign(new Error('fuera'), { code: 'ENOENT' });
		const datos = await readFile(archivo).catch(async (e) => { if (e.code !== 'EISDIR') throw e; archivo = path.join(archivo, 'index.html'); return readFile(archivo); });
		res.writeHead(200, { 'Cache-Control': 'no-store', ...encabezados(url.pathname), 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
		res.end(datos);
	} catch (err) {
		const pagina404 = err.code === 'ENOENT' ? await readFile(path.join(DIST, '404.html')).catch(() => null) : null;
		res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': pagina404 ? TIPOS['.html'] : 'text/plain; charset=utf-8' });
		res.end(pagina404 || (err.code === 'ENOENT' ? 'No existe' : `Error: ${err.message}`));
	}
}).listen(Number(process.env.PORT) || 8090, () => console.log(`Entorno de pruebas en http://localhost:${Number(process.env.PORT) || 8090} (${funciones.size} funciones)`));
