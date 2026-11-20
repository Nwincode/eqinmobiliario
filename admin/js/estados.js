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
	if (p.en?.amenidades) p.en.amenidades = p.en.amenidades.filter((a) => !esMascota(a));
	p.vacacional = { ...(p.vacacional || {}), mascotas: p.vacacional?.mascotas || 'si' };
	return p;
}
// Casa de prueba: las del botón «Casas de prueba» (demo: true) o una con «prueba» en su título en español («Casa de
// PRUEBA Monterrico»; «a prueba de ruido» no cuenta). Su ficha se publica para probar, pero nunca se indexa ni va al
// sitemap, a llms.txt ni a los catálogos (scripts/build.mjs la marca `_prueba` antes de traducirla).
export const esDePrueba = (p) => Boolean(p && (p._prueba || p.demo === true || (/\bprueba\b/i.test(String(p.titulo || '')) && !/\ba prueba de\b/i.test(String(p.titulo || '')))));
// El precio que se muestra de una casa: 0 («Precio a consultar») cuando es VIP y su ficha lo oculta. Uno solo para el
// sitio (tarjetas, ficha, metadescripción, compartir, datos para ordenar, JSON-LD, catálogos, llms.txt), la difusión y
// el PDF del listado: el precio oculto no sale en ningún lado. Sin VIP la casilla no se ve, así que no cuenta.
export const precioVisible = (p) => (p && p.vip && p.vipLanding && p.vipLanding.ocultarPrecio ? 0 : Number(p?.precio) || 0);
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
// La lista en inglés guardada vale mientras corresponda a la de español (misma cantidad); si no, sale del diccionario.
export const amenidadesEnDe = (p) => {
	const es = (p && p.amenidades) || [], en = (p && p.en && p.en.amenidades) || [];
	return en.length && en.length === es.length ? en : amenidadesEn(es);
};
