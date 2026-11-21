// Estados de una propiedad y qué pasa en el sitio con cada uno.
// Lo usan el panel y la publicación (scripts/build.mjs): sin dependencias del navegador.
//
// visibilidad:
//   'visible' → aparece en portada, listados, buscador, destacadas, sitemap y catálogos.
//   'cerrada' → sale de todo lo anterior, pero su enlace sigue funcionando con el aviso
//               «Vendida» / «Rentada», un botón de contacto y propiedades parecidas.
//   'oculta'  → no aparece en ningún lado; su enlace muestra «Ya no está disponible»
//               (sin fotos ni datos) con propiedades parecidas, y Google no la indexa.
// «Visible en la página» (campo publicado) apagado oculta todo, como un borrador.
import { TIPO_CAMBIO } from './formato.js';
export const ESTADOS_PROPIEDAD = [
	{ valor: 'disponible', label: 'Disponible', es: 'Disponible', en: 'Available', visibilidad: 'visible',
		ayuda: 'Se muestra en todo el sitio.' },
	{ valor: 'proximamente', label: 'Próximamente', es: 'Próximamente', en: 'Coming soon', visibilidad: 'visible',
		ayuda: 'Pre-lanzamiento: se muestra con la etiqueta «Próximamente» para recibir interesados antes de salir.' },
	{ valor: 'reservada', label: 'Reservada / con oferta', es: 'Reservada', en: 'Under contract', visibilidad: 'visible',
		ayuda: 'Tiene oferta, arras o promesa firmada: se sigue mostrando con la etiqueta «Reservada».' },
	{ valor: 'vendida', label: 'Vendida', es: 'Vendida', en: 'Sold', visibilidad: 'cerrada',
		ayuda: 'Sale de portada, listados y buscador. Su enlace sigue abriendo con el aviso «Vendida» y propiedades parecidas.' },
	{ valor: 'rentada', label: 'Rentada', es: 'Rentada', en: 'Rented', visibilidad: 'cerrada',
		ayuda: 'Sale de portada, listados y buscador. Su enlace sigue abriendo con el aviso «Rentada» y propiedades parecidas.' },
	{ valor: 'pausada', label: 'Pausada', es: 'No disponible', en: 'Not available', visibilidad: 'oculta',
		ayuda: 'El dueño pidió pausar un tiempo (viaje, remodelación, inquilino actual). No aparece en ningún lado; vuelve a «Disponible» para mostrarla.' },
	{ valor: 'retirada', label: 'Retirada del mercado', es: 'No disponible', en: 'Not available', visibilidad: 'oculta',
		ayuda: 'El dueño ya no vende o renta, la vendió por su cuenta o venció la exclusiva. No aparece en ningún lado.' }
];

const POR_VALOR = Object.fromEntries(ESTADOS_PROPIEDAD.map((e) => [e.valor, e]));

// Estado de una propiedad (los valores desconocidos o vacíos cuentan como «disponible»).
export function estadoDe(p) {
	return POR_VALOR[(p && p.estado) || 'disponible'] || POR_VALOR.disponible;
}

// 'borrador' (visible apagado) · 'visible' · 'cerrada' · 'oculta'
export function visibilidadDe(p) {
	if (!p || !p.publicado) return 'borrador';
	return estadoDe(p).visibilidad;
}

// Se puede ofrecer (sitio, catálogos, portales, IA): visible y no vendida/rentada/pausada/retirada.
export const seOfrece = (p) => visibilidadDe(p) === 'visible';

// Operación de una propiedad: la lista y cómo se nombra en todo el sistema (panel, difusión, PDF, SEO).
export const OPERACIONES = [['venta', 'Venta'], ['renta', 'Renta'], ['vacacional', 'Renta vacacional']];
const OPERACION_LABEL = Object.fromEntries(OPERACIONES);
const OPERACION_EN = { venta: 'for sale', renta: 'for rent', vacacional: 'for vacation rental' };
// «Venta» · «Renta» · «Renta vacacional» (lo desconocido o vacío cuenta como venta).
export const operacionDe = (p) => OPERACION_LABEL[p && p.operacion] || OPERACION_LABEL.venta;
// «en venta» · «en renta» · «en renta vacacional» (en inglés: «for sale» · «for rent» · «for vacation rental»).
export const enOperacion = (p, lang = 'es') => (lang === 'en'
	? OPERACION_EN[p && p.operacion] || OPERACION_EN.venta
	: `en ${operacionDe(p).toLowerCase()}`);
// Para un hashtag: «EnVenta» · «EnRenta» · «EnRentaVacacional» (en inglés: «ForSale» · «ForRent» · «ForVacationRental»).
export const operacionHashtag = (p, lang = 'es') => enOperacion(p, lang).replace(/(?:^|\s+)(\S)/g, (_, c) => c.toUpperCase());

// Amenidades frecuentes: el panel las ofrece de un toque y la ficha en inglés las traduce sola
// cuando la propiedad no trae su lista en inglés.
export const AMENIDADES_COMUNES = [
	['Piscina', 'Pool'], ['Jardín', 'Garden'], ['Garita de seguridad', 'Gated security'], ['Amueblado', 'Furnished'],
	['Cuarto de servicio', 'Service quarters'], ['Estudio', 'Study'], ['Terraza', 'Terrace'], ['Churrasquera', 'BBQ grill'],
	['Gimnasio', 'Gym'], ['Área social', 'Social area'], ['Juegos infantiles', 'Playground'], ['Acepta mascotas', 'Pets allowed'],
	['Aire acondicionado', 'Air conditioning'], ['Bodega', 'Storage room'], ['Cisterna', 'Water cistern'], ['Paneles solares', 'Solar panels']
];
// Qué estados y qué tipos de inmueble aplican a cada operación: una venta no queda «Rentada», una renta no queda
// «Vendida», y una casa por noche ni se vende ni recibe ofertas (sus fechas se reservan una por una) ni es un
// terreno, una oficina, un local o una bodega.
const ESTADOS_FUERA = { venta: ['rentada'], renta: ['vendida'], vacacional: ['reservada', 'vendida', 'rentada'] };
export const estadosPara = (operacion) => ESTADOS_PROPIEDAD.filter((e) => !(ESTADOS_FUERA[operacion] || []).includes(e.valor));
const TIPOS_POR_NOCHE = ['casa', 'apartamento', 'finca'];
export const tipoAplica = (tipo, operacion) => operacion !== 'vacacional' || TIPOS_POR_NOCHE.includes(tipo);
// Qué no cuadra entre la operación, el estado y el tipo de una casa ('' si todo cuadra). Lo usan el formulario
// (que ya ni lo ofrece), el cambio de estado en lote y la importación, con el mismo texto.
const NOMBRE_OP = { venta: 'una casa en venta', renta: 'una casa en renta', vacacional: 'una casa por noche' };
export function incoherencia({ operacion = 'venta', estado, tipo } = {}) {
	if (estado && !estadosPara(operacion).some((e) => e.valor === estado)) return `«${estadoDe({ estado }).label}» no aplica a ${NOMBRE_OP[operacion] || 'esta operación'}`;
	if (tipo && !tipoAplica(tipo, operacion)) return `Ese tipo de inmueble no se renta por noche`;
	return '';
}

// Mascotas en una casa por noche: se dice una sola vez, en su selector (sí / no / sin indicar), no también como
// amenidad. Quita esa amenidad de la lista y, si el selector estaba sin indicar, lo deja en «sí». Devuelve la casa.
const esMascota = (a) => /mascota|\bpets?\b/i.test(String(a));
export const amenidadesPara = (operacion) => AMENIDADES_COMUNES.map(([es]) => es).filter((a) => operacion !== 'vacacional' || !esMascota(a));
export function mascotasUnaVez(p) {
	if (p.operacion !== 'vacacional' || !(p.amenidades || []).some(esMascota)) return p;
	p.amenidades = p.amenidades.filter((a) => !esMascota(a));
	if (p.en?.amenidades && p.en.amenidadesDe?.length === p.en.amenidades.length) {
		// Con pares guardados, se quita el par entero (la inglesa con su española).
		const quedan = p.en.amenidadesDe.map((a, i) => !esMascota(a) && !esMascota(p.en.amenidades[i]));
		p.en.amenidades = p.en.amenidades.filter((a, i) => quedan[i]);
		p.en.amenidadesDe = p.en.amenidadesDe.filter((a, i) => quedan[i]);
	} else if (p.en?.amenidades) p.en.amenidades = p.en.amenidades.filter((a) => !esMascota(a));
	p.vacacional = { ...(p.vacacional || {}), mascotas: p.vacacional?.mascotas || 'si' };
	return p;
}
// Casa de prueba: las del botón «Casas de prueba» (demo: true) o una con «prueba» en su título en español («Casa de
// PRUEBA Monterrico»; «a prueba de ruido» no cuenta). Su ficha se publica para probar, pero nunca se indexa ni va al
// sitemap, a llms.txt ni a los catálogos (scripts/build.mjs la marca `_prueba` antes de traducirla).
export const esDePrueba = (p) => Boolean(p && (p._prueba || p.demo === true || (/\bprueba\b/i.test(String(p.titulo || '')) && !/\ba prueba de\b/i.test(String(p.titulo || '')))));
// El precio que se muestra de una casa: 0 («Precio a consultar») cuando es VIP y su ficha lo oculta. Uno solo para el
// sitio (tarjetas, ficha, metadescripción, compartir, datos para ordenar, JSON-LD, catálogos, llms.txt), la difusión y
// el PDF del listado: el precio oculto no sale en ningún lado. Vale aunque la casa ya no sea VIP (la ficha sigue
// mostrando la casilla mientras esté marcada). Una casa por noche no lo oculta: su calendario muestra el precio de cada noche.
export const precioOculto = (p) => Boolean(p && p.operacion !== 'vacacional' && p.vipLanding && p.vipLanding.ocultarPrecio);
export const precioVisible = (p) => (precioOculto(p) ? 0 : Number(p?.precio) || 0);
// El precio escrito en un texto, en cualquier forma: con cifras (987,654 · 987.654 · 987654, con o sin moneda y
// centavos), en miles («987k», «988 mil») o en millones («Q 1.2 millones», «1,2 MM», «US$ 1.25M»), también pasado a la
// otra moneda (US$ 987,654 ≈ «Q 7.6 millones», con TIPO_CAMBIO de admin/js/formato.js). Solo el precio de ESTA casa:
// otro monto («cuotas de Q 1.5 millones», «enganche de US$ 50 mil») no cuenta. null sin precio.
function patronPrecio(precio, moneda = 'USD') {
	const n = Math.round(Number(precio));
	if (!n) return null;
	const esc = (f) => f.replace(/[.]/g, '\\.');
	const otra = moneda === 'GTQ' ? n / TIPO_CAMBIO : n * TIPO_CAMBIO;
	const cifras = [...new Set([n.toLocaleString('en-US'), n.toLocaleString('de-DE'), String(n)])];
	const enMiles = (x) => [Math.floor(x / 1000), Math.round(x / 1000), Number((x / 1000).toFixed(1))].filter((y) => y > 0).map(String);
	const enMillones = (x) => (x >= 1e6 ? [1, 2].map((d) => String(Number((x / 1e6).toFixed(d)))).concat(Number.isInteger(x / 1e6) ? [String(x / 1e6)] : []) : []);
	const miles = [...new Set([...enMiles(n), ...enMiles(otra)])];
	const millones = [...new Set([...enMillones(n), ...enMillones(otra)])];
	const conComa = (x) => [x, x.replace('.', ',')];
	const formas = [
		...cifras.map((f) => `${esc(f)}(?:[.,]\\d{2})?`),
		...miles.flatMap(conComa).map((f) => `${esc(f)}\\s?(?:k\\b|mil\\b)`),
		...millones.flatMap(conComa).map((f) => `${esc(f)}\\s?(?:millones\\b|mill[oó]n\\b|mm\\b|m\\b)`)
	].sort((a, b) => b.length - a.length);
	return new RegExp(`(^|[^\\d.,])(?:(?:US\\$|USD|GTQ|Q\\.?|\\$)\\s?)?(?:${formas.join('|')})(?!\\d)(?![.,]\\d)`, 'gi');
}
// ¿El texto dice el precio? Con «Ocultar precio» no se guarda un título, descripción o texto VIP (ni en inglés) que lo
// diga: lo revisan la ficha (views/properties.js), «Mi casa» del dueño (mi-casa.js) y el importador.
export const mencionaPrecio = (texto, precio, moneda) => { const re = patronPrecio(precio, moneda); return Boolean(re && texto && re.test(String(texto))); };
// El mismo texto con ese monto cambiado por `consultar` («precio a consultar»): la red de seguridad del build.
export function sinPrecioOculto(texto, precio, consultar, moneda) {
	const re = patronPrecio(precio, moneda);
	if (!re || !texto) return texto;
	return String(texto).replace(re, (m, antes) => `${antes}${consultar}`);
}
// Un texto de una casa con el precio oculto, listo para salir (difusión, PDF del listado): sin el monto.
export const textoSinPrecio = (p, texto, lang = 'es') => (precioOculto(p) ? sinPrecioOculto(texto, p.precio, lang === 'en' ? 'price on request' : 'precio a consultar', p.moneda) : texto);
// Los textos de una casa que no pueden decir el precio oculto: [etiqueta, texto]. Vacío si el precio no va oculto.
export function textosConPrecioOculto(p) {
	if (!precioOculto(p) || !Number(p.precio)) return [];
	const v = p.vipLanding || {}, e = p.en || {}, ev = e.vipLanding || {};
	return [['Título', p.titulo], ['Descripción', p.descripcion], ['Titular VIP', v.titular], ['Subtítulo VIP', v.subtitular], ['Botón VIP', v.ctaTexto],
		['Puntos clave VIP', (v.puntosClave || []).join(' · ')], ['Título en inglés', e.titulo], ['Descripción en inglés', e.descripcion],
		['Titular VIP en inglés', ev.titular], ['Subtítulo VIP en inglés', ev.subtitular], ['Puntos clave VIP en inglés', (ev.puntosClave || []).join(' · ')],
		['URL', p.slug], ['Título para Google', p.seo?.titulo], ['Descripción para Google', p.seo?.descripcion]]
		.filter(([, t]) => mencionaPrecio(String(t || '').replace(/-/g, ' '), p.precio, p.moneda) || mencionaPrecio(t, p.precio, p.moneda));
}
// Amenidades en inglés: un solo diccionario para el sitio (ficha en inglés), el traductor sin IA (reglas.js) y lo que se
// guarda al traducir. La que no está en ninguno queda como se escribió: nunca se pierde una (el inglés también la muestra).
// Más amenidades y frases comunes en anuncios (sin tildes ni mayúsculas), para las que no están en la lista de arriba.
const DICCIONARIO_EN = {
	piscina: 'Swimming pool', jardin: 'Garden', 'garita de seguridad': '24/7 gated security', garita: 'Gated security', seguridad: 'Security',
	'seguridad 24 horas': '24/7 security', gimnasio: 'Gym', terraza: 'Terrace', balcon: 'Balcony', estudio: 'Study', bodega: 'Storage room',
	'area de lavanderia': 'Laundry area', lavanderia: 'Laundry room', 'cuarto de servicio': "Maid's quarters", 'dormitorio de servicio': "Maid's quarters",
	chimenea: 'Fireplace', elevador: 'Elevator', ascensor: 'Elevator', 'area social': 'Clubhouse', 'salon social': 'Event room', 'casa club': 'Clubhouse',
	'area de juegos infantiles': "Children's play area", 'juegos infantiles': 'Playground', 'planta electrica': 'Backup generator', generador: 'Backup generator',
	cisterna: 'Water cistern', 'paneles solares': 'Solar panels', amueblado: 'Furnished', 'semi amueblado': 'Semi-furnished', 'cocina equipada': 'Equipped kitchen',
	'cocina integral': 'Fitted kitchen', 'walk in closet': 'Walk-in closet', 'vestidor': 'Walk-in closet', 'sala familiar': 'Family room', 'sala de estar': 'Living room',
	comedor: 'Dining room', parqueo: 'Parking', 'parqueo de visitas': 'Guest parking', 'area de bbq': 'BBQ area', bbq: 'BBQ area', rancho: 'Gazebo',
	'cancha de tenis': 'Tennis court', 'cancha deportiva': 'Sports court', 'sendero': 'Walking trail', 'vista': 'View', 'vista panoramica': 'Panoramic view',
	'acepta mascotas': 'Pet friendly', 'pet friendly': 'Pet friendly', 'calentador solar': 'Solar water heater', 'agua caliente': 'Hot water',
	'aire acondicionado': 'Air conditioning', 'pozo': 'Private well', 'area verde': 'Green area', 'areas verdes': 'Green areas', 'jacuzzi': 'Jacuzzi',
	'sauna': 'Sauna', 'business center': 'Business center', 'cowork': 'Coworking space', 'roof top': 'Rooftop', 'rooftop': 'Rooftop', 'azotea': 'Rooftop'
};
const llaveAmenidad = (a) => String(a ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const AMENIDAD_EN = new Map(AMENIDADES_COMUNES.map(([es, en]) => [llaveAmenidad(es), en]));
export const amenidadEn = (a) => AMENIDAD_EN.get(llaveAmenidad(a)) || DICCIONARIO_EN[llaveAmenidad(a)] || String(a ?? '').trim();
export const amenidadesEn = (lista) => (lista || []).map(amenidadEn).filter(Boolean);
// La lista en inglés, una por cada amenidad en español y nunca una que ya no esté:
//  - con los pares guardados (`en.amenidadesDe`: la lista en español a la que corresponde, al traducir o al corregirla a
//    mano), cada amenidad toma su traducción guardada, y la que no tiene par sale del diccionario;
//  - sin pares (datos de antes): con las dos listas del mismo largo se toman en orden; si no, se quedan las inglesas que
//    corresponden a una española (por el diccionario o escrita igual) y las que faltan salen del diccionario.
export const amenidadesEnDe = (p) => {
	const es = (p && p.amenidades) || [], en = (p && p.en && p.en.amenidades) || [], de = (p && p.en && p.en.amenidadesDe) || null;
	if (!en.length) return amenidadesEn(es);
	if (de && de.length === en.length) {
		const par = new Map(de.map((a, i) => [llaveAmenidad(a), en[i]]));
		return es.map((a) => par.get(llaveAmenidad(a)) || amenidadEn(a)).filter(Boolean);
	}
	if (en.length === es.length) return en;
	const usadas = new Set();
	return es.map((a) => {
		// Sus formas en inglés: la de la lista común, la del diccionario de frases y la española tal cual.
		const formas = [AMENIDAD_EN.get(llaveAmenidad(a)), DICCIONARIO_EN[llaveAmenidad(a)], a].filter(Boolean).map(llaveAmenidad);
		const i = en.findIndex((e, k) => !usadas.has(k) && formas.includes(llaveAmenidad(e)));
		if (i < 0) return amenidadEn(a);
		usadas.add(i);
		return en[i];
	}).filter(Boolean);
};
