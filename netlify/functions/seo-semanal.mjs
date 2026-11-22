// Cada lunes: informe de Search Console de la semana (los últimos 7 días contra los 7 anteriores) en seoSemanal/{fecha},
// que solo lee el administrador (firestore.rules) y se ve en el panel, en Visibilidad (admin/js/views/google.js):
// páginas que bajaron, búsquedas nuevas y las páginas del sitemap que no están en Google con su motivo.
// Lee con la cuenta de Search Console (GOOGLE_SA_*) y escribe con la de escritura (GOOGLE_SA_ESCRITURA_*).
// La indexación se revisa con la URL Inspection API (cuota: 2,000 por día por propiedad, compartida con «¿Está esta
// página en Google?» del panel) y una función programada se corta a los 30 s: cada semana se revisan las que alcanzan
// (primero las nunca revisadas y las que no estaban en Google); de las demás queda lo de la última vez, con su fecha.
import '../../js/calc-vacacional.js';
import siteConfig from '../../site.config.json' with { type: 'json' };
import { googleConfigurado, propiedadValida, rangoGSC, consultaGSC, inspeccionarGSC } from '../lib/google.mjs';
import { leerPublico, consultar } from '../lib/firestore.mjs';
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { urlsDelSitemap } from '../lib/indexnow.mjs';
import { bajaron, nuevas, porRevisar, indexacionAlDia } from '../lib/seo-semanal.mjs';

const V = globalThis.EQVacacional;
const SITE_URL = siteConfig.siteUrl.replace(/\/$/, '');
const PLAZO_REVISION = 18_000; // lo que se dedica a la indexación; lo demás (consultas, guardar) cabe en los 30 s
const A_LA_VEZ = 5;
const TOPE_REVISION = 400; // por semana: deja cuota de sobra al panel
const TOPE_SITEMAP = 2000; // el informe no se acerca al límite de 1 MiB de un documento

// Revisa en Google las páginas en orden, de A_LA_VEZ en A_LA_VEZ, hasta `hasta` (ms). Si Google dice que no hay cuota
// o permiso, para y lo deja dicho en `error`.
async function revisar(prop, urls, hasta, hoy) {
	const revisadas = [];
	let error = '';
	for (let i = 0; i < urls.length && Date.now() < hasta && !error; i += A_LA_VEZ) {
		await Promise.all(urls.slice(i, i + A_LA_VEZ).map(async (url) => {
			try {
				const r = await inspeccionarGSC(prop, url);
				revisadas.push({ url, veredicto: r.veredicto || '', cobertura: r.cobertura || '', cuando: hoy });
			} catch (err) {
				if (err.status === 429 || err.falta) error ||= err.message;
			}
		}));
	}
	return { revisadas, error };
}

export async function informeSemanal() {
	const inicio = Date.now();
	const hoy = V.hoy();
	const prop = propiedadValida((await leerPublico('settings/site'))?.seo?.searchConsolePropiedad);
	const actual = rangoGSC(7), anterior = rangoGSC(7, 7);
	const [totales, previos, paginas, paginasAntes, consultas, consultasAntes] = await Promise.all([
		consultaGSC(prop, { ...actual }),
		consultaGSC(prop, { ...anterior }),
		consultaGSC(prop, { ...actual, dimensions: ['page'], rowLimit: 1000 }),
		consultaGSC(prop, { ...anterior, dimensions: ['page'], rowLimit: 1000 }),
		consultaGSC(prop, { ...actual, dimensions: ['query'], rowLimit: 1000 }),
		consultaGSC(prop, { ...anterior, dimensions: ['query'], rowLimit: 5000 })
	]);

	// La indexación de la última vez (informes de las últimas 5 semanas: no se lista la colección entera).
	const ultimo = (await consultar('seoSemanal', 'fecha', V.sumarDias(hoy, -35), { tope: 10 })).filter((d) => d.fecha < hoy).at(-1);
	const anteriores = ultimo?.indexacion || [];
	const sitemap = await fetch(`${SITE_URL}/sitemap.xml`).then((r) => (r.ok ? r.text() : '')).catch(() => '');
	const urls = urlsDelSitemap(sitemap, SITE_URL).slice(0, TOPE_SITEMAP);
	const { revisadas, error } = await revisar(prop, porRevisar(urls, anteriores).slice(0, TOPE_REVISION), inicio + PLAZO_REVISION, hoy);
	const indexacion = indexacionAlDia(urls, anteriores, revisadas);

	const vacio = { clics: 0, impresiones: 0, ctr: 0, posicion: 0 };
	const sinClaves = (r) => ({ clics: r.clics, impresiones: r.impresiones, ctr: r.ctr, posicion: r.posicion });
	return {
		fecha: hoy,
		propiedad: prop,
		rango: actual,
		totales: sinClaves(totales[0] || vacio),
		previos: sinClaves(previos[0] || vacio),
		bajaron: bajaron(paginas, paginasAntes).map((x) => ({ pagina: x.pagina, antes: sinClaves(x.antes), ahora: sinClaves(x.ahora) })),
		nuevas: nuevas(consultas, consultasAntes),
		indexacion,
		revisadasHoy: revisadas.length,
		paginasSitemap: urls.length,
		sinRevisar: urls.length - indexacion.length,
		errorIndexacion: error,
		error: ''
	};
}

export default async () => {
	if (!googleConfigurado() || !escrituraConfigurada()) return;
	let informe;
	try {
		informe = await informeSemanal();
	} catch (err) {
		// Sin datos de Search Console también queda el informe, con el motivo: el panel lo muestra.
		informe = { fecha: V.hoy(), error: err.message || 'No se pudo consultar Search Console.' };
	}
	const ruta = `seoSemanal/${informe.fecha}`;
	try {
		// Si ya corrió hoy (un reintento), se reemplaza.
		await transaccion(async ({ leer, crear, cambiar }) => {
			if (await leer(ruta)) cambiar(ruta, informe, { ahora: ['creado'] });
			else crear(ruta, informe, { ahora: ['creado'] });
		});
		console.log(`seo-semanal: ${ruta}${informe.error ? ` con error: ${informe.error}` : ` · ${informe.revisadasHoy} páginas revisadas en Google`}`);
	} catch (err) {
		console.error('seo-semanal (guardar):', err.message);
	}
};

// Lunes 13:17 UTC (7:17 en Guatemala).
export const config = { schedule: '17 13 * * 1' };
