// Datos de Google Search Console para el panel. POST /api/gsc { accion, datos }
// Solo usuarios activos del panel; enviar el sitemap requiere rol de administrador.
import siteConfig from '../../site.config.json' with { type: 'json' };
import { staffUser, json } from '../lib/auth.mjs';
import { gsc, googleToken, googleConfigurado, propiedadValida, rangoGSC as rango, filaGSC as fila, consultaGSC as consulta, inspeccionarGSC, sitioGSC } from '../lib/google.mjs';

const SITE_URL = siteConfig.siteUrl.replace(/\/$/, '');

// CTR esperado aproximado según la posición; por debajo de esto el título o la descripción no convencen.
const CTR_ESPERADO = [0, 0.28, 0.15, 0.10, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
const ctrEsperado = (pos) => CTR_ESPERADO[Math.min(10, Math.max(1, Math.round(pos)))];

async function resumen(prop, dias) {
	const actual = rango(dias);
	const anterior = rango(dias, dias);
	const usa = { dimensionFilterGroups: [{ filters: [{ dimension: 'country', operator: 'equals', expression: 'usa' }] }] };
	const [totales, previos, porDia, consultas, paginas, paises, dispositivos, pares, consultasUsa] = await Promise.all([
		consulta(prop, { ...actual }),
		consulta(prop, { ...anterior }),
		consulta(prop, { ...actual, dimensions: ['date'], rowLimit: 500 }),
		consulta(prop, { ...actual, dimensions: ['query'], rowLimit: 100 }),
		consulta(prop, { ...actual, dimensions: ['page'], rowLimit: 100 }),
		consulta(prop, { ...actual, dimensions: ['country'], rowLimit: 10 }),
		consulta(prop, { ...actual, dimensions: ['device'], rowLimit: 5 }),
		consulta(prop, { ...actual, dimensions: ['query', 'page'], rowLimit: 2000 }),
		consulta(prop, { ...actual, ...usa, dimensions: ['query'], rowLimit: 25 })
	]);

	// Oportunidades: búsquedas donde ya apareces cerca de la primera página (posición 4–20)
	// o donde estás arriba pero pocos hacen clic (título/descripción por mejorar).
	const oportunidades = pares
		.filter((r) => r.impresiones >= 10 && ((r.posicion >= 4 && r.posicion <= 20) || (r.posicion < 4 && r.ctr < ctrEsperado(r.posicion) * 0.5)))
		.map((r) => ({
			consulta: r.claves[0],
			pagina: r.claves[1],
			...r,
			motivo: r.posicion < 4 ? 'ctr' : r.posicion <= 10 ? 'top3' : 'pagina1',
			clicsPotenciales: Math.max(0, Math.round(r.impresiones * ctrEsperado(Math.min(r.posicion, 3)) - r.clics))
		}))
		.sort((a, b) => b.clicsPotenciales - a.clicsPotenciales)
		.slice(0, 40);

	return { propiedad: prop, rango: actual, totales: totales[0] || fila({}), previos: previos[0] || fila({}), porDia, consultas, paginas, paises, dispositivos, oportunidades, consultasUsa };
}

// Verificador de la conexión: recorre los pasos en orden y dice en cuál se detiene (`falta`).
const PASOS = ['variables', 'clave', 'api', 'permiso', 'sitemap'];
export async function estado(prop) {
	const base = { propiedad: prop, cuenta: process.env.GOOGLE_SA_EMAIL || '' };
	const hasta = (falta, detalle = '') => ({ ...base, falta, detalle, hechos: PASOS.slice(0, PASOS.indexOf(falta)) });
	if (!googleConfigurado()) {
		return hasta('variables', `Falta ${[!process.env.GOOGLE_SA_EMAIL && 'GOOGLE_SA_EMAIL', !process.env.GOOGLE_SA_KEY && 'GOOGLE_SA_KEY'].filter(Boolean).join(' y ')}.`);
	}
	try {
		await googleToken();
	} catch (err) {
		return hasta('clave', err.message);
	}
	let lista;
	try {
		lista = await gsc('GET', `${sitioGSC(prop)}/sitemaps`);
	} catch (err) {
		return hasta(err.falta || 'permiso', err.message);
	}
	const enviado = (lista.sitemap || []).some((s) => s.path === `${SITE_URL}/sitemap.xml`);
	return enviado ? { ...base, falta: '', detalle: '', hechos: PASOS } : hasta('sitemap');
}

export default async (req) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' });
	let usuario;
	try {
		usuario = await staffUser(req);
	} catch {
		usuario = null;
	}
	if (!usuario) return json(401, { error: 'Inicia sesión de nuevo.' });

	let entrada;
	try {
		entrada = await req.json();
	} catch {
		return json(400, { error: 'Solicitud inválida.' });
	}
	const { accion, datos = {} } = entrada || {};
	if (accion === 'estado') return json(200, await estado(propiedadValida(datos.propiedad)));
	if (!googleConfigurado()) {
		return json(200, { configurado: false, propiedad: propiedadValida(datos.propiedad) });
	}
	const prop = propiedadValida(datos.propiedad);

	try {
		switch (accion) {
			case 'resumen':
				return json(200, { configurado: true, ...(await resumen(prop, [7, 28, 90].includes(datos.dias) ? datos.dias : 28)) });
			case 'inspeccionar': {
				const url = String(datos.url || '');
				if (!url.startsWith(SITE_URL)) return json(400, { error: 'La URL debe ser de este sitio.' });
				return json(200, { configurado: true, ...(await inspeccionarGSC(prop, url)) });
			}
			case 'sitemaps': {
				const r = await gsc('GET', `${sitioGSC(prop)}/sitemaps`);
				return json(200, { configurado: true, sitemaps: r.sitemap || [] });
			}
			case 'enviarSitemap': {
				if (!usuario.admin) return json(403, { error: 'Solo un administrador puede enviar el sitemap.' });
				const feed = `${SITE_URL}/sitemap.xml`;
				await gsc('PUT', `${sitioGSC(prop)}/sitemaps/${encodeURIComponent(feed)}`);
				return json(200, { configurado: true, enviado: feed });
			}
			default:
				return json(400, { error: 'Acción desconocida.' });
		}
	} catch (err) {
		return json(502, { error: err.message || 'No se pudo consultar Search Console.' });
	}
};

export const config = { path: '/api/gsc' };
