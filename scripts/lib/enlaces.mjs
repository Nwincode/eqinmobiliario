// Revisa los enlaces internos de un sitio ya generado: cada href="/…" de cada página tiene que llevar a un
// archivo que existe en la carpeta. No cuenta las reglas de _redirects (un /propiedades/* que cae al listado
// no es una página: es un enlace mal escrito). Se salta /admin/ (el panel no es parte del sitio público).
import { readdir, readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const SALTAR = /^\/(admin\/|\.netlify\/)/;

async function paginas(dir, base = dir) {
	const out = [];
	for (const e of await readdir(dir, { withFileTypes: true })) {
		const f = path.join(dir, e.name);
		if (e.isDirectory()) {
			if (path.relative(base, f) === 'admin') continue;
			out.push(...await paginas(f, base));
		} else if (e.name.endsWith('.html')) out.push(f);
	}
	return out;
}

// ¿Existe en `dist` lo que pide este camino? «/x/» es «/x/index.html»; «/x» puede ser archivo o carpeta.
export function existe(dist, ruta) {
	const limpio = decodeURI(ruta.split(/[?#]/)[0]);
	const f = path.join(dist, limpio);
	if (limpio.endsWith('/')) return existsSync(path.join(f, 'index.html'));
	return existsSync(f) && (statSync(f).isFile() || existsSync(path.join(f, 'index.html')));
}

// Enlaces internos de un HTML (href="/…", sin los de otro sitio «//…» ni los que solo cambian de sección «#…»).
export function enlacesDe(html) {
	return [...String(html).matchAll(/\shref="(\/(?!\/)[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

// Devuelve [{ pagina, href }] de cada enlace que no lleva a nada.
export async function revisarEnlaces(dist) {
	const rotos = [];
	for (const f of await paginas(dist)) {
		const html = await readFile(f, 'utf8');
		const pagina = `/${path.relative(dist, f).replace(/index\.html$/, '')}`;
		for (const href of new Set(enlacesDe(html))) {
			if (SALTAR.test(href) || href.split(/[?#]/)[0] === '') continue;
			if (!existe(dist, href)) rotos.push({ pagina, href });
		}
	}
	return rotos;
}
