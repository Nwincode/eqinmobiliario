// Textos fijos del sitio en español e inglés, y rutas de cada idioma.

export const RUTAS = {
	es: {
		inicio: '/', propiedades: '/propiedades/', venta: '/propiedades/venta/', renta: '/propiedades/renta/',
		vip: '/vip/', blog: '/blog/', contacto: '/#contacto', ficha: '/propiedad/', fichaVip: '/vip/'
	},
	en: {
		inicio: '/en/', propiedades: '/en/properties/', venta: '/en/properties/for-sale/', renta: '/en/properties/for-rent/',
		vip: '/en/luxury/', blog: '/en/blog/', contacto: '/en/#contact', ficha: '/en/property/', fichaVip: '/en/luxury/'
	}
};

const ES = {
	htmlLang: 'es', ogLocale: 'es_GT', dateLocale: 'es-GT',
	inicio: 'Inicio', propiedades: 'Propiedades', comprar: 'Comprar', rentar: 'Rentar', propiedadesVip: 'Propiedades VIP', verTodas: 'Ver todas',
	abrirMenu: 'Abrir menú', enlaces: 'Enlaces', siguenos: 'Síguenos', zonas: 'Zonas', derechos: 'Todos los derechos reservados.',
	plantilla: 'Diseño basado en una plantilla de', escribenos: 'Escríbenos por WhatsApp',
	buscarPropiedades: 'Buscar propiedades', buscar: 'Buscar', anterior: 'Anterior', siguiente: 'Siguiente', navCarrusel: 'Navegación del carrusel',
	masInfo: 'Más información', sobre: 'sobre', deEstrellas: 'de 5 estrellas', escribir: 'Escribir',
	enVenta: 'En venta', enRenta: 'En renta', verDetalles: 'Ver detalles', precioConsultar: 'Precio a consultar', mes: '/mes',
	habitacion: 'habitación', habitaciones: 'habitaciones', bano: 'baño', banos: 'baños',
	// Formulario
	nombre: 'Nombre', telefono: 'Teléfono / WhatsApp', telefonoPh: '', correo: 'Correo electrónico', mensaje: 'Mensaje',
	fechaVisita: 'Fecha preferida para visitar (opcional)', tipoVisita: 'Tipo de visita', presencial: 'Presencial', videollamada: 'Videollamada',
	enviar: 'Enviar', empresa: 'Empresa', msgInteres: (t) => `Hola, me interesa la propiedad "${t}". ¿Me pueden dar más información?`,
	// Asesor
	asesorInmobiliario: 'Asesor inmobiliario', correoBtn: 'Correo', msgAsesor: (n, t) => `Hola ${n}, me interesa la propiedad "${t}".`,
	// Listado
	filtrar: 'Filtrar propiedades', busquedaInteligente: 'Búsqueda inteligente',
	iaPh: 'Describe lo que buscas: casa de 3 habitaciones en zona 16 hasta US$ 300,000', buscarIA: 'Buscar con IA',
	buscarPh: 'Zona, residencial, tipo…', operacion: 'Operación', todas: 'Todas', todos: 'Todos', venta: 'Venta', renta: 'Renta',
	tipo: 'Tipo', zona: 'Zona', ordenar: 'Ordenar', recientes: 'Más recientes', precioAsc: 'Precio: menor a mayor', precioDesc: 'Precio: mayor a menor',
	precioMin: 'Precio mínimo', precioMax: 'Precio máximo', limpiar: 'Limpiar', propiedad: 'propiedad', propiedadesN: 'propiedades',
	sinResultados: 'No encontramos propiedades con esos filtros.', cuentanos: 'Cuéntanos qué buscas', teAyudamos: 'y te ayudamos.',
	paginacion: 'Paginación', noEncuentras: '¿No encuentras lo que buscas? Te ayudamos',
	// Ficha
	calcTitulo: 'Calcula tu cuota mensual', enganche: 'Enganche %', tasa: 'Tasa anual %', anios: 'Años',
	calcNota: 'Cálculo referencial; la cuota final depende del banco. Te ayudamos con el financiamiento.',
	fTipo: 'Tipo', fOperacion: 'Operación', fEstado: 'Estado', fHabitaciones: 'Habitaciones', fBanos: 'Baños', fParqueos: 'Parqueos',
	fConstruccion: 'Construcción', fTerreno: 'Terreno', fUbicacion: 'Ubicación', fPrecioM2: 'Precio por m²', fCodigo: 'Código',
	compartir: 'Compartir', compartirWa: 'Compartir por WhatsApp', compartirFb: 'Compartir en Facebook', copiarEnlace: 'Copiar enlace',
	descripcion: 'Descripción', amenidades: 'Amenidades', video: 'Video', ubicacion: 'Ubicación', videoDe: 'Video de', mapaDe: 'Mapa de',
	agendaVisita: 'Agenda una visita', quieroInfo: 'Quiero más información', similares: 'Propiedades similares',
	msgWaFicha: (t, u) => `Hola, me interesa la propiedad "${t}" (${u}).`,
	// VIP
	vipIntro: 'Una selección exclusiva de residencias y proyectos con atención personalizada de principio a fin.',
	vipPronto: 'Muy pronto publicaremos nuevas propiedades exclusivas.', contactanos: 'Contáctanos', paraConocerlas: 'para conocerlas antes.',
	vipTitulo: 'Propiedades VIP y exclusivas', vipDesc: 'Residencias exclusivas en Guatemala con atención personalizada. Conoce nuestra selección de propiedades VIP.',
	masVip: 'Más propiedades VIP', propiedadExclusiva: 'Propiedad exclusiva', hablarAsesor: 'Hablar con un asesor', agendarPrivada: 'Agendar visita privada',
	laPropiedad: 'La propiedad', unica: 'Lo que la hace única', galeria: 'Galería', recorre: 'Recorre cada espacio', verFoto: 'Ver foto',
	galeriaFotos: 'Galería de fotos', cerrar: 'Cerrar', enMovimiento: 'Conócela en movimiento', todoIncluye: 'Todo lo que incluye',
	visitaPrivada: 'Visita privada', vipContactoTexto: 'Déjanos tus datos y un asesor te contactará para coordinar una visita, presencial o por videollamada.',
	msgWaVip: (t, u) => `Hola, me interesa la propiedad exclusiva "${t}" (${u}).`,
	// Blog y páginas
	blog: 'Blog', leerMas: 'Leer más →', blogPronto: 'Pronto publicaremos artículos sobre el mercado inmobiliario en Guatemala.',
	blogTitulo: 'Blog inmobiliario', blogDesc: 'Consejos para comprar, vender y rentar propiedades en Guatemala: financiamiento, zonas, trámites y tendencias del mercado.',
	blogLead: '¿Buscas una propiedad? Te asesoramos sin costo', masArticulos: 'Más artículos',
	noEncontrada: 'Página no encontrada', noExiste: 'La página que buscas no existe o la propiedad ya no está disponible.', verPropiedades: 'Ver propiedades',
	otroIdioma: 'EN', otroIdiomaLabel: 'View this page in English'
};

const EN = {
	htmlLang: 'en', ogLocale: 'en_US', dateLocale: 'en-US',
	inicio: 'Home', propiedades: 'Properties', comprar: 'Buy', rentar: 'Rent', propiedadesVip: 'Luxury homes', verTodas: 'View all',
	abrirMenu: 'Open menu', enlaces: 'Links', siguenos: 'Follow us', zonas: 'Areas', derechos: 'All rights reserved.',
	plantilla: 'Design based on a template by', escribenos: 'Message us on WhatsApp',
	buscarPropiedades: 'Search properties', buscar: 'Search', anterior: 'Previous', siguiente: 'Next', navCarrusel: 'Carousel navigation',
	masInfo: 'Learn more', sobre: 'about', deEstrellas: 'out of 5 stars', escribir: 'Message',
	enVenta: 'For sale', enRenta: 'For rent', verDetalles: 'View details', precioConsultar: 'Price on request', mes: '/mo',
	habitacion: 'bed', habitaciones: 'beds', bano: 'bath', banos: 'baths',
	nombre: 'Full name', telefono: 'Phone / WhatsApp', telefonoPh: '+1 555 123 4567', correo: 'Email', mensaje: 'Message',
	fechaVisita: 'Preferred visit date (optional)', tipoVisita: 'Visit type', presencial: 'In person', videollamada: 'Video tour',
	enviar: 'Send', empresa: 'Company', msgInteres: (t) => `Hi, I'm interested in "${t}". Could you send me more information?`,
	asesorInmobiliario: 'Real estate advisor', correoBtn: 'Email', msgAsesor: (n, t) => `Hi ${n}, I'm interested in "${t}".`,
	filtrar: 'Filter properties', busquedaInteligente: 'Smart search',
	iaPh: 'Describe what you want: 3-bedroom house in Zona 16 under $300,000', buscarIA: 'Search with AI',
	buscarPh: 'Area, community, type…', operacion: 'Listing type', todas: 'All', todos: 'All', venta: 'For sale', renta: 'For rent',
	tipo: 'Property type', zona: 'Area', ordenar: 'Sort by', recientes: 'Newest', precioAsc: 'Price: low to high', precioDesc: 'Price: high to low',
	precioMin: 'Min price', precioMax: 'Max price', limpiar: 'Clear', propiedad: 'property', propiedadesN: 'properties',
	sinResultados: 'No properties match those filters.', cuentanos: 'Tell us what you are looking for', teAyudamos: 'and we will help.',
	paginacion: 'Pagination', noEncuentras: "Can't find what you need? We'll search for you",
	calcTitulo: 'Estimate your monthly payment', enganche: 'Down %', tasa: 'Interest %', anios: 'Years',
	calcNota: 'Estimate only; the final payment depends on the lender. We can help you explore financing options.',
	fTipo: 'Type', fOperacion: 'Listing', fEstado: 'Status', fHabitaciones: 'Bedrooms', fBanos: 'Bathrooms', fParqueos: 'Parking',
	fConstruccion: 'Interior', fTerreno: 'Lot size', fUbicacion: 'Location', fPrecioM2: 'Price per sq ft', fCodigo: 'Listing ID',
	compartir: 'Share', compartirWa: 'Share on WhatsApp', compartirFb: 'Share on Facebook', copiarEnlace: 'Copy link',
	descripcion: 'Overview', amenidades: 'Amenities', video: 'Video', ubicacion: 'Location', videoDe: 'Video of', mapaDe: 'Map of',
	agendaVisita: 'Schedule a tour (in person or video)', quieroInfo: 'Request information', similares: 'Similar properties',
	msgWaFicha: (t, u) => `Hi, I'm interested in "${t}" (${u}).`,
	vipIntro: 'A curated selection of exceptional homes in Guatemala, with personal attention from first call to closing.',
	vipPronto: 'New luxury listings are coming soon.', contactanos: 'Contact us', paraConocerlas: 'to see them first.',
	vipTitulo: 'Luxury homes for sale in Guatemala', vipDesc: 'Exclusive homes and estates in Guatemala with personalized service, video tours and remote buying support.',
	masVip: 'More luxury homes', propiedadExclusiva: 'Exclusive listing', hablarAsesor: 'Talk to an advisor', agendarPrivada: 'Book a private tour',
	laPropiedad: 'The home', unica: 'Why it stands out', galeria: 'Gallery', recorre: 'Explore every room', verFoto: 'View photo',
	galeriaFotos: 'Photo gallery', cerrar: 'Close', enMovimiento: 'See it in motion', todoIncluye: 'Everything included',
	visitaPrivada: 'Private tour', vipContactoTexto: 'Leave your details and an advisor will arrange an in-person or live video tour at a time that works for you, including from the US.',
	msgWaVip: (t, u) => `Hi, I'm interested in the luxury listing "${t}" (${u}).`,
	blog: 'Blog', leerMas: 'Read more →', blogPronto: 'Articles about buying property in Guatemala are coming soon.',
	blogTitulo: 'Guatemala real estate blog', blogDesc: 'Guides for US buyers: owning property in Guatemala as a foreigner, buying remotely, costs, areas and financing.',
	blogLead: 'Looking for a home in Guatemala? Get free advice', masArticulos: 'More articles',
	noEncontrada: 'Page not found', noExiste: "The page you're looking for doesn't exist or the property is no longer available.", verPropiedades: 'View properties',
	otroIdioma: 'ES', otroIdiomaLabel: 'Ver esta página en español'
};

export const TEXTOS = { es: ES, en: EN };

export const TIPOS_EN = {
	casa: 'House', apartamento: 'Condo / apartment', terreno: 'Land', oficina: 'Office', local: 'Retail space', bodega: 'Warehouse', finca: 'Farm / estate'
};

export const ESTADOS_EN = { disponible: 'Available', reservada: 'Under contract', vendida: 'Sold', rentada: 'Rented' };

export const M2_A_FT2 = 10.7639;
