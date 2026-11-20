// Rutas del sitio en cada idioma y las direcciones que una página de contenido (Contenido → Páginas) no puede usar.
// Una sola lista para el panel (admin/js/views/pages.js) y el generador (scripts/build.mjs, scripts/lib/i18n.mjs):
// sin DOM ni Firebase, corre en Node y en el navegador.

export const RUTAS = {
	es: {
		inicio: '/', propiedades: '/propiedades/', venta: '/propiedades/venta/', renta: '/propiedades/renta/', vacacional: '/propiedades/vacacional/',
		vip: '/vip/', blog: '/blog/', contacto: '/#contacto', ficha: '/propiedad/', fichaVip: '/vip/', calculadora: '/calculadora-de-renta/',
		portal: '/propietarios/', reserva: '/reserva/'
	},
	en: {
		inicio: '/en/', propiedades: '/en/properties/', venta: '/en/properties/for-sale/', renta: '/en/properties/for-rent/', vacacional: '/en/properties/vacation-rentals/',
		vip: '/en/luxury/', blog: '/en/blog/', contacto: '/en/#contact', ficha: '/en/property/', fichaVip: '/en/luxury/', calculadora: '/en/rental-calculator/',
		portal: '/en/owners/'
	}
};

// Primera carpeta de cada ruta del idioma (/en/properties/… → «properties»).
const carpetas = (lang) => Object.values(RUTAS[lang]).map((r) => r.replace(lang === 'en' ? /^\/en\// : /^\//, '').split(/[/#]/)[0]).filter(Boolean);
// Lo que el sitio sirve en la raíz además de sus páginas: carpetas de archivos (assets: el CSS y JS del build), el panel, las funciones (/api/), el sitio
// en inglés (/en/), los catálogos (/feeds/), el logo (/docs/) y el lugar de las páginas con nombre reservado (/pagina/).
const FIJAS = ['admin', 'api', 'assets', 'css', 'js', 'images', 'fonts', 'data', 'scripts', 'docs', 'feeds', 'pagina', '404'];
export const RESERVADAS = {
	es: new Set([...carpetas('es'), ...FIJAS, 'en']),
	en: new Set([...carpetas('en'), 'pagina', '404'])
};
export const reservada = (slug, idioma = 'es') => RESERVADAS[idioma === 'en' ? 'en' : 'es'].has(slug);

// Dirección de una página de contenido. Una de antes con nombre reservado sale en /pagina/{slug}/ (nunca encima de una
// página del sitio); el panel ya no deja guardar una nueva así.
export const urlPagina = (slug, idioma = 'es') => `${idioma === 'en' ? '/en' : ''}${reservada(slug, idioma) ? `/pagina/${slug}` : `/${slug}`}/`;
