// Servidor local para revisar dist/ antes de publicar: `npm run build && npm run serve`.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
	'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
	'.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.png': 'image/png',
	'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
	'.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject'
};

createServer(async (req, res) => {
	const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	let file = path.join(DIST, urlPath);
	if (!file.startsWith(DIST)) return res.writeHead(403).end();
	try {
		if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
		const body = await readFile(file);
		res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
	} catch {
		const body = await readFile(path.join(DIST, '404.html')).catch(() => 'No encontrado');
		res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
	}
}).listen(PORT, () => console.log(`Sirviendo dist/ en http://localhost:${PORT}`));
