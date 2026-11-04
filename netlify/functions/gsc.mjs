// Datos de Google Search Console para el panel. POST /api/gsc { accion, datos }
// Solo usuarios activos del panel; enviar el sitemap requiere rol de administrador.
import siteConfig from '../../site.config.json' with { type: 'json' };
import { staffUser, json } from '../lib/auth.mjs';
import { gsc, googleConfigurado, propiedadPorDefecto } from '../lib/google.mjs';

const SITE_URL = siteConfig.siteUrl.replace(/\/$/, '');
const API = 'https://searchconsole.googleapis.com/webmasters/v3/sites';

const dia = (d) => d.toISOString().slice(0, 10);
function rango(dias, desplazamiento = 0) {
	// Search Console tarda ~2 días en consolidar los datos.
	const fin = new Date(Date.now() - (2 + desplazamiento) * 86400000);
	const inicio = new Date(fin.getTime() - (dias - 1) * 86400000);
	return { startDate: dia(inicio), endDate: dia(fin) };
}

function propiedadValida(p) {
	const v = String(p || '').trim();
	return /^sc-domain:[a-z0-9.-]+$/i.test(v) || /^https?:\/\/[^\s]+\/$/.test(v) ? v : propiedadPorDefecto();
}

const fila = (r) => ({
	claves: r.keys || [],
	clics: r.clicks || 0,
	impresiones: r.impressions || 0,
	ctr: r.ctr || 0,
	posicion: r.position || 0
});

async function consulta(prop, cuerpo) {
	const data = await gsc('POST', `${API}/${encodeURIComponent(prop)}/searchAnalytics/query`, { dataState: 'final', ...cuerpo });
	return (data.rows || []).map(fila);
}

// CTR esperado aproximado según la posición; por debajo de esto el título o la descripción no convencen.
const CTR_ESPERADO = [0, 0.28, 0.15, 0.10, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
const ctrEsperado = (pos) => CTR_ESPERADO[Math.min(10, Math.max(1, Math.round(pos)))];

export async function resumen(prop, dias) {
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

	// Páginas que pierden posiciones frente al periodo anterior.
	const paginasAntes = await consulta(prop, { ...anterior, dimensions: ['page'], rowLimit: 100 });
	const antes = new Map(paginasAntes.map((r) => [r.claves[0], r]));
	const caidas = paginas
		.map((r) => ({ pagina: r.claves[0], ahora: r, antes: antes.get(r.claves[0]) }))
		.filter((x) => x.antes && x.antes.clics >= 3 && x.ahora.clics < x.antes.clics * 0.7)
		.slice(0, 10);

	return { propiedad: prop, rango: actual, totales: totales[0] || fila({}), previos: previos[0] || fila({}), porDia, consultas, paginas, paises, dispositivos, oportunidades, caidas, consultasUsa };
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
				const r = await gsc('POST', 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: url, siteUrl: prop, languageCode: 'es' });
				const idx = r.inspectionResult?.indexStatusResult || {};
				return json(200, {
					configurado: true,
					veredicto: idx.verdict,
					cobertura: idx.coverageState,
					rastreo: idx.lastCrawlTime,
					canonicaGoogle: idx.googleCanonical,
					canonicaUsuario: idx.userCanonical,
					robots: idx.robotsTxtState,
					indexacion: idx.indexingState,
					movil: r.inspectionResult?.mobileUsabilityResult?.verdict,
					enriquecidos: (r.inspectionResult?.richResultsResult?.detectedItems || []).map((d) => d.richResultType),
					enlace: r.inspectionResult?.inspectionResultLink
				});
			}
			case 'sitemaps': {
				const r = await gsc('GET', `${API}/${encodeURIComponent(prop)}/sitemaps`);
				return json(200, { configurado: true, sitemaps: r.sitemap || [] });
			}
			case 'enviarSitemap': {
				if (!usuario.admin) return json(403, { error: 'Solo un administrador puede enviar el sitemap.' });
				const feed = `${SITE_URL}/sitemap.xml`;
				await gsc('PUT', `${API}/${encodeURIComponent(prop)}/sitemaps/${encodeURIComponent(feed)}`);
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
