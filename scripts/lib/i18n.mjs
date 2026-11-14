import { ESTADOS_PROPIEDAD } from '../../admin/js/estados.js';
// Textos fijos del sitio en español e inglés, y rutas de cada idioma.

export const RUTAS = {
	es: {
		inicio: '/', propiedades: '/propiedades/', venta: '/propiedades/venta/', renta: '/propiedades/renta/', vacacional: '/propiedades/vacacional/',
		vip: '/vip/', blog: '/blog/', contacto: '/#contacto', ficha: '/propiedad/', fichaVip: '/vip/', calculadora: '/calculadora-de-renta/'
	},
	en: {
		inicio: '/en/', propiedades: '/en/properties/', venta: '/en/properties/for-sale/', renta: '/en/properties/for-rent/', vacacional: '/en/properties/vacation-rentals/',
		vip: '/en/luxury/', blog: '/en/blog/', contacto: '/en/#contact', ficha: '/en/property/', fichaVip: '/en/luxury/', calculadora: '/en/rental-calculator/'
	}
};

const ES = {
	htmlLang: 'es', ogLocale: 'es_GT', dateLocale: 'es-GT',
	// Renta vacacional (cuadro de reserva de la ficha)
	vacTitulo: 'Reserva tu estancia', vacPorNoche: 'por noche', vacImpuestos: '+ impuestos (IVA 12 % e INGUAT 10 %)',
	vacCalendario: 'Calendario de disponibilidad', vacMesAnterior: 'Mes anterior', vacMesSiguiente: 'Mes siguiente',
	vlBuscar: 'Buscar casas disponibles', vlComo: 'Cómo reservar', vlPaso1: 'Elige fechas y huéspedes', vlPaso2: 'Ves el total y envías la solicitud', vlPaso3: 'Te confirmamos con un código de reserva', vlTotal1: '{total} · 1 noche, con impuestos', vlTotalN: '{total} · {n} noches, con impuestos', vlSinCasas: 'No hay casas libres para esas fechas y huéspedes.',
	vacLlegada: 'Llegada', vacSalida: 'Salida', vacCheckIn: 'desde las {hora}', vacCheckOut: 'hasta las {hora}', vacSinFecha: 'Elige una fecha',
	vacHuespedes: 'Huéspedes', vacHuesped1: '1 huésped', vacHuespedesN: '{n} huéspedes', vacMinimo: 'Estancia mínima: {n} noches.',
	vacOcupado: 'ocupado', vacLlegadaElegida: 'llegada', vacSalidaElegida: 'salida', vacNoDisponible: 'no disponible',
	vacEligeLlegada: 'Toca el día de llegada en el calendario.', vacEligeSalida: 'Ahora toca el día de salida.',
	vacNoche1: '1 noche', vacNochesN: '{n} noches', vacLimpieza: 'Limpieza', vacIva: 'IVA (12 %)', vacInguat: 'INGUAT (10 %)', vacTotal: 'Total',
	vacDeposito: 'Depósito reembolsable', vacDepositoNota: 'Se paga aparte y se devuelve al salir; no lleva impuestos.',
	vacVerNoches: 'Ver el precio de cada noche', vacBorrar: 'Borrar fechas', vacPausada: 'Esta casa no está disponible por ahora.', vacSolicitar: 'Solicitar reserva', vacReservar: 'Reservar',
	vacSinCobro: 'Te respondemos en menos de 2 horas. Todavía no se cobra nada.',
	vacErrFechas: 'Elige la llegada y la salida en el calendario.', vacErrOcupada: 'Hay noches ocupadas entre esas fechas. Elige otras.',
	vacErrMinimo: 'La estancia mínima es de {n} noches.', vacErrPasado: 'La llegada no puede ser antes de hoy.',
	vacCodigo: '¡Solicitud enviada! Tu código de reserva es {codigo}. Te respondemos en menos de 2 horas.',
	
	vacResumen: 'Solicitud de reserva: llegada {llegada}, salida {salida} ({noches}), {huespedes}. Total aprox. {total} con impuestos.',
	fHuespedesMax: 'Huéspedes máximo', fNochesMin: 'Estancia mínima', fCamas: 'Camas', fMascotas: 'Mascotas', fLimpieza: 'Limpieza (por estancia)',
	vacAntes: 'Antes de reservar', vacMascotasSi: 'Se aceptan', vacMascotasNo: 'No se aceptan', vacComoLlegar: 'Cómo llegar',
	// Chat de la reserva (/reserva/)
	vacChatTitulo: 'Tu reserva', vacChatCargando: 'Cargando tu reserva…', vacChatVer: 'Ver mi reserva y chatear', vacCorreo: 'Correo (te avisamos ahí cuando te respondan)',
	vacChatSin: 'No encontramos esta reserva. Abre el enlace que recibiste al reservar.',
	vacChatVacio: 'Escribe tu duda: te responde el anfitrión o nuestro equipo.', vacChatPh: 'Escribe un mensaje…', vacChatEnviar: 'Enviar',
	vacChatBloqueo: 'Por seguridad, aquí no se comparten teléfonos, correos ni enlaces. Todo se coordina aquí, en tu reserva.',
	vacChatFallo: 'No se pudo enviar. Inténtalo de nuevo.', vacChatTu: 'Tú', vacChatSocio: 'Anfitrión', vacChatEquipo: 'Equipo Inmobiliario',
	vacChatEstadoPendiente: 'Esperando confirmación', vacChatEstadoConfirmada: 'Reserva confirmada', vacChatEstadoNo: 'No disponible en esas fechas', vacChatEstadoCancelada: 'Reserva cancelada',
	vacChatVerCasa: 'Ver la casa', vacChatPago: 'Datos para pagar tu reserva', vacChatEstadoPagada: 'Pago recibido',
	vacChatSiguePendiente: 'El anfitrión responde en menos de 2 horas. Te avisamos por correo.',
	vacChatSigueTarde: 'El anfitrión todavía no responde; ya avisamos a nuestro equipo.',
	vacChatSigueVencida: 'Esta solicitud venció sin respuesta. Puedes elegir otras fechas en la ficha de la casa.',
	vacChatSigueConfirmada: 'Paga con los datos de abajo y adjunta la foto de tu comprobante con el botón de la cámara.',
	vacChatSiguePagada: '¡Todo listo! Abajo están la dirección, el mapa y cómo llegar.',
	vacChatSigueNo: 'Puedes elegir otras fechas en la ficha de la casa.', vacChatSigueCancelada: 'Si tienes dudas, escríbenos aquí.',
	vacChatLlegada: 'Datos de llegada', vacChatMapa: 'Abrir el mapa', vacChatHorario: 'Entrada desde las {entrada} · Salida hasta las {salida}', vacChatVisto: 'Visto',
	vacChatFoto: 'Adjuntar foto del comprobante', vacChatFotoGrande: 'La foto debe ser JPG, PNG o WebP de hasta 5 MB.', vacChatComprobante: 'Comprobante de pago',
	vacChatNota: 'Guarda este enlace: con él vuelves a tu reserva. La dirección aparece aquí cuando se recibe tu pago.',
	vacReglas: 'Reglas de la casa', vacReglasGenerales: '', vacCancelacion: 'Cancelación', vacCancelacionGeneral: '',
	inicio: 'Inicio', propiedades: 'Propiedades', comprar: 'Comprar', rentar: 'Rentar', propiedadesVip: 'Propiedades VIP', verTodas: 'Ver todas', porZona: 'Buscar por zona', porZonaTipo: 'Buscar por zona y tipo',
	abrirMenu: 'Abrir menú', enlaces: 'Enlaces', zonas: 'Zonas',
	vendeBoton: 'Vende tu propiedad', vendeQue: '¿Qué quieres vender o rentar?', vendeQuePh: 'Casa en zona 15, 3 habitaciones…', cerrarAviso: 'Cerrar aviso de idioma',
	plantilla: 'Diseño basado en una plantilla de', escribenos: 'Escríbenos por WhatsApp',
	buscarPropiedades: 'Buscar propiedades', buscar: 'Buscar', anterior: 'Anterior', siguiente: 'Siguiente', navCarrusel: 'Navegación del carrusel',
	masInfo: 'Más información', sobre: 'sobre', deEstrellas: 'de 5 estrellas', escribir: 'Escribir',
	resenasGoogle: 'Reseñas en Google', verEnGoogle: 'Ver todas en Google', dejarResena: 'Dejar una reseña', resenasTotal: 'reseñas',
	basadoEn: 'Basado en', leerMas: 'Leer más', leerMenos: 'Leer menos', verResena: 'Ver reseña', publicadaEn: 'Publicada en', anonimo: 'Usuario de Google',
	enVenta: 'En venta', enRenta: 'En renta', enVacacional: 'Renta vacacional', verDetalles: 'Ver detalles', precioRebajado: 'Precio rebajado', antes: 'Antes', precioConsultar: 'Precio a consultar', mes: '/mes',
	habitacion: 'habitación', habitaciones: 'habitaciones', bano: 'baño', banos: 'baños',
	// Formulario
	nombre: 'Nombre', telefono: 'Teléfono / WhatsApp', codigoPais: 'Código de país', telefonoPh: '', correo: 'Correo electrónico', mensaje: 'Mensaje',
	fechaVisita: 'Fecha (opcional)', tipoVisita: 'Tipo de visita', presencial: 'Presencial', videollamada: 'Videollamada',
	enviar: 'Enviar', empresa: 'Empresa', msgInteres: 'Hola, me interesa la propiedad "{titulo}". ¿Me pueden dar más información?',
	// Asesor
	asesorInmobiliario: 'Asesor inmobiliario', correoBtn: 'Correo', msgAsesor: 'Hola {nombre}, me interesa la propiedad "{titulo}".',
	// Listado
	filtrar: 'Filtrar propiedades', busquedaInteligente: 'Búsqueda inteligente',
	iaPh: 'Describe lo que buscas: casa de 3 habitaciones en zona 16 hasta US$ 300,000', buscarIA: 'Buscar',
	buscarPh: 'Zona, residencial, tipo…', operacion: 'Operación', todas: 'Todas', todos: 'Todos', venta: 'Venta', renta: 'Renta', vacacional: 'Renta vacacional',
	tipo: 'Tipo', zona: 'Zona', ordenar: 'Ordenar', recientes: 'Más recientes', precioAsc: 'Precio: menor a mayor', precioDesc: 'Precio: mayor a menor',
	precioMin: 'Precio mínimo', precioMax: 'Precio máximo', limpiar: 'Limpiar', propiedad: 'propiedad', propiedadesN: 'propiedades',
	sinResultados: 'No encontramos propiedades con esos filtros.', cuentanos: 'Cuéntanos qué buscas', teAyudamos: 'y te ayudamos.',
	paginacion: 'Paginación', noEncuentras: '¿No encuentras lo que buscas? Te ayudamos',
	// Ficha
	calcTitulo: 'Calcula tu cuota mensual', enganche: 'Enganche %', tasa: 'Tasa anual %', anios: 'Años',
	calcNota: 'Cálculo referencial; la cuota final depende del banco. Te ayudamos con el financiamiento.',
	// Calculadora de renta
	rentaTitulo: '¿Cuánto te puede rentar?', rentaIntro: 'Estima cuánto te quedaría al mes si la compras para alquilarla.',
	rentaPrecio: 'Precio de compra', rentaMensual: 'Renta mensual', rentaMoneda: 'Moneda', rentaUso: 'Uso',
	rentaHabitacional: 'Habitacional', rentaMixto: 'Mixto', rentaComercial: 'Comercial',
	rentaSugerida: 'Renta sugerida con un rendimiento típico del mercado. Cámbiala si ya sabes cuánto cobrarías.',
	rentaSupuestos: 'Ajustar supuestos', rentaVacancia: 'Vacancia (% del año sin inquilino)', rentaGastos: 'Gastos de operación (% de lo cobrado)',
	rentaPlazoContrato: 'Plazo del contrato de arrendamiento', rentaPlazoAnio: '1 año', rentaPlazoAnios: '{n} años',
	rentaNetoMensual: 'Ingreso neto mensual estimado', rentaRendNeto: 'Rendimiento anual neto', rentaRendBruto: 'Rendimiento bruto',
	rentaEscenarios: 'Si la renta cambia', rentaEscRenta: 'Renta', rentaEscNeto: 'Neto al mes', rentaEscRend: 'Rendimiento',
	rentaMenos10: '−10 %', rentaActual: 'Actual', rentaMas10: '+10 %',
	rentaVacio: 'Escribe el precio y la renta mensual para ver el cálculo.',
	rentaDesgloseTitulo: 'Así se calcula (primer año)', rentaDBruta: 'Renta del año', rentaDEfectivo: 'Ingreso efectivo', rentaDVacancia: 'Vacancia', rentaDGastos: 'Gastos de operación',
	rentaDIusi: 'IUSI', rentaDComision: 'Comisión de arrendamiento (prorrateada)', rentaDExento: 'Exento', rentaDIsr: 'ISR (7 % de lo cobrado)', rentaDIvaPeq: 'IVA pequeño contribuyente 5 %', rentaDIvaGen: 'IVA 12 % lo cobras aparte al inquilino', rentaDNeto: 'Te queda al año', rentaDNetoMes: 'Al mes',
	rentaIva: 'IVA 12 %: lo paga el inquilino encima de la renta (unos {monto} al mes). No es un costo tuyo.',
	rentaNota: 'Cálculo para persona individual: ISR rentas de capital 7 % e IVA según tu monto de renta. Incluye la comisión de arrendamiento (rentas según el plazo del contrato, más IVA), que se paga al firmar y aquí se reparte en los años del contrato. Tu régimen fiscal puede cambiar el resultado.',
	rentaAviso: 'Estimación de referencia, no es asesoría financiera ni fiscal.',
	rentaCta: 'Pide un análisis completo con un asesor',
	rentaListo: 'Listo: pusimos el cálculo en tu mensaje. Completa tus datos y envíalo.',
	rentaResumen: 'Hola, quiero un análisis completo de inversión para alquilar.\nPrecio: {precio}\nRenta: {renta} al mes\nUso: {uso}\nIngreso neto estimado: {neto} al mes\nRendimiento neto: {rend} al año (bruto {bruto})\nSupuestos: vacancia {vacancia} %, gastos {gastos} %\nPrimer año: renta {bruta} − vacancia {vacMonto} = ingreso efectivo {efectivo} − gastos {gastosMonto} − IUSI {iusi}{comisionResta} − ISR {isr}{ivaResta} = te queda {netoAnual}{ivaNota}',
	rentaPagTitulo: 'Calculadora de renta', rentaPagMeta: 'Calculadora de renta: cuánto deja un inmueble en alquiler',
	rentaPagDesc: 'Calcula el ingreso neto mensual y el rendimiento de una propiedad en alquiler en Guatemala, con vacancia, gastos, IUSI e ISR.',
	rentaPagLead: 'Escribe el precio de la propiedad y la renta que esperas cobrar. Te mostramos cuánto te queda al mes después de vacancia, gastos e impuestos.',
	rentaPagForm: 'Pide tu análisis completo', rentaPagFormTexto: 'Un asesor revisa contigo los números, el régimen fiscal y propiedades que encajan con tu meta.',
	rentaLink: 'Calculadora de renta',
	fTipo: 'Tipo', fOperacion: 'Operación', fEstado: 'Estado', fHabitaciones: 'Habitaciones', fBanos: 'Baños', fParqueos: 'Parqueos',
	fConstruccion: 'Construcción', fTerreno: 'Terreno', fNiveles: 'Niveles', fAnio: 'Año de construcción', fMantenimiento: 'Mantenimiento', fUbicacion: 'Ubicación', fPrecioM2: 'Precio por m²', fCodigo: 'Código',
	compartir: 'Compartir', compartirWa: 'Compartir por WhatsApp', compartirFb: 'Compartir en Facebook', copiarEnlace: 'Copiar enlace',
	verFotosN: 'Ver las {n} fotos', caracteristicas: 'Características', anteriorFoto: 'Foto anterior', siguienteFoto: 'Foto siguiente',
	descripcion: 'Descripción', amenidades: 'Amenidades', video: 'Video', ubicacion: 'Ubicación', videoDe: 'Video de', mapaDe: 'Mapa de',
	agendaVisita: 'Agenda una visita', agendarVisita: 'Agendar visita', llamar: 'Llamar', quieroInfo: 'Quiero más información', similares: 'Propiedades similares',
	msgWaFicha: 'Hola, me interesa la propiedad "{titulo}" ({url}).',
	// Propiedad vendida, rentada o que ya no está disponible
	avisoVendida: 'Esta propiedad ya se vendió', avisoRentada: 'Esta propiedad ya se rentó',
	avisoCerradaTexto: 'Ya no está en el mercado, pero tenemos opciones parecidas. Cuéntanos qué buscas y te las enviamos.',
	verSimilares: 'Ver propiedades similares', buscasParecida: '¿Buscas algo parecido?',
	noDisponibleTitulo: 'Esta propiedad ya no está disponible',
	noDisponibleTexto: 'Por ahora no está a la venta ni en renta. Mira otras opciones o escríbenos y te ayudamos a encontrar algo parecido.',
	msgWaCerrada: 'Hola, vi la propiedad "{titulo}" ({url}), que ya no está disponible. ¿Tienen algo parecido?',
	// VIP
	vipIntro: 'Una selección exclusiva de residencias y proyectos con atención personalizada de principio a fin.',
	vipPronto: 'Muy pronto publicaremos nuevas propiedades exclusivas.', contactanos: 'Contáctanos', paraConocerlas: 'para conocerlas antes.',
	vipTitulo: 'Propiedades VIP y exclusivas', vipDesc: 'Residencias exclusivas en Guatemala con atención personalizada. Conoce nuestra selección de propiedades VIP.',
	masVip: 'Más propiedades VIP', propiedadExclusiva: 'Propiedad exclusiva', hablarAsesor: 'Hablar con un asesor', agendarPrivada: 'Agendar visita privada',
	laPropiedad: 'La propiedad', unica: 'Lo que la hace única', galeria: 'Galería', recorre: 'Recorre cada espacio', verFoto: 'Ver foto',
	galeriaFotos: 'Galería de fotos', cerrar: 'Cerrar', enMovimiento: 'Conócela en movimiento', todoIncluye: 'Todo lo que incluye',
	visitaPrivada: 'Visita privada', vipContactoTexto: 'Déjanos tus datos y un asesor te contactará para coordinar una visita, presencial o por videollamada.',
	msgWaVip: 'Hola, me interesa la propiedad exclusiva "{titulo}" ({url}).',
	// Blog y páginas
	blog: 'Blog', blogPronto: 'Pronto publicaremos artículos sobre el mercado inmobiliario en Guatemala.',
	blogTitulo: 'Blog inmobiliario', blogDesc: 'Consejos para comprar, vender y rentar propiedades en Guatemala: financiamiento, zonas, trámites y tendencias del mercado.',
	blogLead: '¿Buscas una propiedad? Te asesoramos sin costo', masArticulos: 'Más artículos',
	noEncontrada: 'Página no encontrada', noExiste: 'La página que buscas no existe o la propiedad ya no está disponible.', verPropiedades: 'Ver propiedades',
	duenosTitulo: 'Propietarios y colaboradores', duenosLead: 'Tu portal ahora es tu panel',
	duenosTexto: 'Lo que veías aquí (cómo va tu propiedad, consultas, visitas y ofertas) ahora está en tu panel, junto con todas tus propiedades. Entrás con tu correo y tu contraseña.',
	duenosEntrar: 'Entrar a mi panel', duenosPrimeraVez: '¿Primera vez? Pedile el acceso a tu asesor: te llega un correo para poner tu contraseña.',
	duenosPedir: 'Pedir mi acceso', duenosMsgWa: 'Hola, quiero el acceso a mi panel de propietario.',
	otroIdioma: 'EN', otroIdiomaLabel: 'View this page in English',
	// Mensajes que muestra el navegador (formularios, búsqueda, calculadora)
	jsErrorDatos: 'Escribe tu nombre y un teléfono válido.',
	jsGracias: '¡Gracias! Recibimos tus datos y un asesor te contactará pronto.',
	jsFallo: 'No pudimos enviar el formulario.', jsSoy: 'Hola, soy ', jsVisita: ' Me gustaría visitarla el ', jsTel: ' Mi teléfono: ',
	buscarFiltrar: 'Buscar y filtrar', cerrarFiltros: 'Cerrar filtros', jsVer: 'Ver',
	jsUna: '1 propiedad', jsVarias: ' propiedades', jsEscribe: 'Escribe qué estás buscando.', jsBuscando: 'Buscando…',
	jsSinConexion: 'No pudimos conectar. Usa los filtros de abajo.',
	jsCuota: 'Cuota aproximada: ', jsAlMes: ' al mes', jsEnganche: 'Enganche ', jsPrestamo: ' · Préstamo '
};

const EN = {
	htmlLang: 'en', ogLocale: 'en_US', dateLocale: 'en-US',
	vacTitulo: 'Book your stay', vacPorNoche: 'per night', vacImpuestos: '+ taxes (12% VAT and 10% INGUAT tourism tax)',
	vacCalendario: 'Availability calendar', vacMesAnterior: 'Previous month', vacMesSiguiente: 'Next month',
	vlBuscar: 'Search available homes', vlComo: 'How to book', vlPaso1: 'Pick dates and guests', vlPaso2: 'See the total and send your request', vlPaso3: 'We confirm with a booking code', vlTotal1: '{total} · 1 night, taxes included', vlTotalN: '{total} · {n} nights, taxes included', vlSinCasas: 'No homes are free for those dates and guests.',
	vacLlegada: 'Check-in', vacSalida: 'Check-out', vacCheckIn: 'from {hora}', vacCheckOut: 'by {hora}', vacSinFecha: 'Pick a date',
	vacHuespedes: 'Guests', vacHuesped1: '1 guest', vacHuespedesN: '{n} guests', vacMinimo: 'Minimum stay: {n} nights.',
	vacOcupado: 'booked', vacLlegadaElegida: 'check-in', vacSalidaElegida: 'check-out', vacNoDisponible: 'unavailable',
	vacEligeLlegada: 'Tap your check-in day on the calendar.', vacEligeSalida: 'Now tap your check-out day.',
	vacNoche1: '1 night', vacNochesN: '{n} nights', vacLimpieza: 'Cleaning fee', vacIva: 'VAT (12%)', vacInguat: 'INGUAT (10%)', vacTotal: 'Total',
	vacDeposito: 'Refundable deposit', vacDepositoNota: 'Paid separately and returned after check-out; no taxes apply.',
	vacVerNoches: 'See the price of each night', vacBorrar: 'Clear dates', vacPausada: 'This home is not available right now.', vacSolicitar: 'Request booking', vacReservar: 'Book',
	vacSinCobro: 'We reply in under 2 hours. You won\'t be charged yet.',
	vacErrFechas: 'Pick your check-in and check-out dates on the calendar.', vacErrOcupada: 'Some nights in those dates are booked. Please pick others.',
	vacErrMinimo: 'The minimum stay is {n} nights.', vacErrPasado: 'Check-in can\'t be before today.',
	vacCodigo: 'Request sent! Your booking code is {codigo}. We reply in under 2 hours.',
	
	vacResumen: 'Booking request: check-in {llegada}, check-out {salida} ({noches}), {huespedes}. Approx. total {total} incl. taxes.',
	fHuespedesMax: 'Max. guests', fNochesMin: 'Minimum stay', fCamas: 'Beds', fMascotas: 'Pets', fLimpieza: 'Cleaning fee (per stay)',
	vacAntes: 'Before you book', vacMascotasSi: 'Allowed', vacMascotasNo: 'Not allowed', vacComoLlegar: 'Getting there',
	vacChatTitulo: 'Your booking', vacChatCargando: 'Loading your booking…', vacChatVer: 'See my booking and chat', vacCorreo: 'Email (we notify you there when we reply)',
	vacChatSin: 'We could not find this booking. Open the link you received when you booked.',
	vacChatVacio: 'Ask anything: the host or our team will reply.', vacChatPh: 'Write a message…', vacChatEnviar: 'Send',
	vacChatBloqueo: 'For your safety, phone numbers, emails and links are not shared here. Everything is arranged here, in your booking.',
	vacChatFallo: 'Could not send. Please try again.', vacChatTu: 'You', vacChatSocio: 'Host', vacChatEquipo: 'Equipo Inmobiliario',
	vacChatEstadoPendiente: 'Waiting for confirmation', vacChatEstadoConfirmada: 'Booking confirmed', vacChatEstadoNo: 'Not available on those dates', vacChatEstadoCancelada: 'Booking cancelled',
	vacChatVerCasa: 'See the place', vacChatPago: 'Payment details for your booking', vacChatEstadoPagada: 'Payment received',
	vacChatSiguePendiente: 'The host replies in under 2 hours. We will email you.',
	vacChatSigueTarde: 'The host has not replied yet; our team has been notified.',
	vacChatSigueVencida: 'This request expired without a reply. You can pick other dates on the listing.',
	vacChatSigueConfirmada: 'Pay with the details below and attach a photo of your receipt with the camera button.',
	vacChatSiguePagada: 'All set! The address, map and directions are below.',
	vacChatSigueNo: 'You can pick other dates on the listing.', vacChatSigueCancelada: 'If you have questions, write to us here.',
	vacChatLlegada: 'Arrival details', vacChatMapa: 'Open the map', vacChatHorario: 'Check-in from {entrada} · Check-out by {salida}', vacChatVisto: 'Seen',
	vacChatFoto: 'Attach a photo of your payment receipt', vacChatFotoGrande: 'The photo must be a JPG, PNG or WebP up to 5 MB.', vacChatComprobante: 'Payment receipt',
	vacChatNota: 'Save this link to come back to your booking. The address appears here once your payment is received.',
	vacReglas: 'House rules', vacReglasGenerales: '', vacCancelacion: 'Cancellation', vacCancelacionGeneral: '',
	inicio: 'Home', propiedades: 'Properties', comprar: 'Buy', rentar: 'Rent', propiedadesVip: 'Luxury homes', verTodas: 'View all', porZona: 'Browse by area', porZonaTipo: 'Browse by area and type',
	abrirMenu: 'Open menu', enlaces: 'Links', zonas: 'Areas',
	vendeBoton: 'List your property', vendeQue: 'What do you want to sell or rent out?', vendeQuePh: 'House in zone 15, 3 bedrooms…', cerrarAviso: 'Close language notice',
	plantilla: 'Design based on a template by', escribenos: 'Message us on WhatsApp',
	buscarPropiedades: 'Search properties', buscar: 'Search', anterior: 'Previous', siguiente: 'Next', navCarrusel: 'Carousel navigation',
	masInfo: 'Learn more', sobre: 'about', deEstrellas: 'out of 5 stars', escribir: 'Message',
	resenasGoogle: 'Google reviews', verEnGoogle: 'See all on Google', dejarResena: 'Write a review', resenasTotal: 'reviews',
	basadoEn: 'Based on', leerMas: 'Read more', leerMenos: 'Read less', verResena: 'View review', publicadaEn: 'Posted on', anonimo: 'Google user',
	enVenta: 'For sale', enRenta: 'For rent', enVacacional: 'Vacation rental', verDetalles: 'View details', precioRebajado: 'Price reduced', antes: 'Was', precioConsultar: 'Price on request', mes: '/mo',
	habitacion: 'bed', habitaciones: 'beds', bano: 'bath', banos: 'baths',
	nombre: 'Full name', telefono: 'Phone / WhatsApp', codigoPais: 'Country code', telefonoPh: '555 123 4567', correo: 'Email', mensaje: 'Message',
	fechaVisita: 'Date (optional)', tipoVisita: 'Visit type', presencial: 'In person', videollamada: 'Video tour',
	enviar: 'Send', empresa: 'Company', msgInteres: 'Hi, I\'m interested in "{titulo}". Could you send me more information?',
	asesorInmobiliario: 'Real estate advisor', correoBtn: 'Email', msgAsesor: 'Hi {nombre}, I\'m interested in "{titulo}".',
	filtrar: 'Filter properties', busquedaInteligente: 'Smart search',
	iaPh: 'Describe what you want: 3-bedroom house in Zona 16 under $300,000', buscarIA: 'Search',
	buscarPh: 'Area, community, type…', operacion: 'Listing type', todas: 'All', todos: 'All', venta: 'For sale', renta: 'For rent', vacacional: 'Vacation rental',
	tipo: 'Property type', zona: 'Area', ordenar: 'Sort by', recientes: 'Newest', precioAsc: 'Price: low to high', precioDesc: 'Price: high to low',
	precioMin: 'Min price', precioMax: 'Max price', limpiar: 'Clear', propiedad: 'property', propiedadesN: 'properties',
	sinResultados: 'No properties match those filters.', cuentanos: 'Tell us what you are looking for', teAyudamos: 'and we will help.',
	paginacion: 'Pagination', noEncuentras: "Can't find what you need? We'll search for you",
	calcTitulo: 'Estimate your monthly payment', enganche: 'Down %', tasa: 'Interest %', anios: 'Years',
	calcNota: 'Estimate only; the final payment depends on the lender. We can help you explore financing options.',
	rentaTitulo: 'What could it earn as a rental?', rentaIntro: 'Estimate what you would keep each month if you buy it to rent out.',
	rentaPrecio: 'Purchase price', rentaMensual: 'Monthly rent', rentaMoneda: 'Currency', rentaUso: 'Use',
	rentaHabitacional: 'Residential', rentaMixto: 'Mixed use', rentaComercial: 'Commercial',
	rentaSugerida: 'Suggested rent based on a typical market yield. Change it if you already know what you would charge.',
	rentaSupuestos: 'Adjust assumptions', rentaVacancia: 'Vacancy (% of the year without a tenant)', rentaGastos: 'Operating costs (% of rent collected)',
	rentaPlazoContrato: 'Lease term', rentaPlazoAnio: '1 year', rentaPlazoAnios: '{n} years',
	rentaNetoMensual: 'Estimated net monthly income', rentaRendNeto: 'Net annual yield', rentaRendBruto: 'Gross yield',
	rentaEscenarios: 'If the rent changes', rentaEscRenta: 'Rent', rentaEscNeto: 'Net per month', rentaEscRend: 'Yield',
	rentaMenos10: '−10%', rentaActual: 'Current', rentaMas10: '+10%',
	rentaVacio: 'Enter the price and the monthly rent to see the estimate.',
	rentaDesgloseTitulo: 'How it’s calculated (first year)', rentaDBruta: 'Rent for the year', rentaDEfectivo: 'Effective income', rentaDVacancia: 'Vacancy', rentaDGastos: 'Operating costs',
	rentaDIusi: 'Property tax (IUSI)', rentaDComision: 'Leasing commission (prorated)', rentaDExento: 'Exempt', rentaDIsr: 'Income tax (7% of rent collected)', rentaDIvaPeq: 'VAT, small taxpayer 5%', rentaDIvaGen: '12% VAT you charge the tenant separately', rentaDNeto: 'You keep per year', rentaDNetoMes: 'Per month',
	rentaIva: '12% VAT: the tenant pays it on top of the rent (about {monto} per month). It is not your cost.',
	rentaNota: 'Calculated for an individual owner: 7% capital income tax and VAT according to your rent amount. Includes the leasing commission (months of rent according to the lease term, plus VAT), paid when the lease is signed and spread here over the years of the lease. Your tax regime may change the result.',
	rentaAviso: 'Reference estimate only; this is not financial or tax advice.',
	rentaCta: 'Ask an advisor for a full analysis',
	rentaListo: 'Done: we added the estimate to your message. Fill in your details and send it.',
	rentaResumen: 'Hi, I would like a full rental investment analysis.\nPrice: {precio}\nRent: {renta} per month\nUse: {uso}\nEstimated net income: {neto} per month\nNet yield: {rend} per year (gross {bruto})\nAssumptions: vacancy {vacancia}%, costs {gastos}%\nFirst year: rent {bruta} − vacancy {vacMonto} = effective income {efectivo} − costs {gastosMonto} − IUSI {iusi}{comisionResta} − income tax {isr}{ivaResta} = you keep {netoAnual}{ivaNota}',
	rentaPagTitulo: 'Rental calculator', rentaPagMeta: 'Rental calculator: how much does a rental property earn?',
	rentaPagDesc: 'Estimate the net monthly income and yield of a rental property in Guatemala, including vacancy, costs, property tax and income tax.',
	rentaPagLead: 'Enter the property price and the rent you expect to charge. We show what you keep each month after vacancy, costs and taxes.',
	rentaPagForm: 'Ask for your full analysis', rentaPagFormTexto: 'An advisor reviews the numbers, the tax regime and properties that fit your goal with you.',
	rentaLink: 'Rental calculator',
	fTipo: 'Type', fOperacion: 'Listing', fEstado: 'Status', fHabitaciones: 'Bedrooms', fBanos: 'Bathrooms', fParqueos: 'Parking',
	fConstruccion: 'Interior', fTerreno: 'Lot size', fNiveles: 'Floors', fAnio: 'Year built', fMantenimiento: 'Maintenance fee', fUbicacion: 'Location', fPrecioM2: 'Price per sq ft', fCodigo: 'Listing ID',
	compartir: 'Share', compartirWa: 'Share on WhatsApp', compartirFb: 'Share on Facebook', copiarEnlace: 'Copy link',
	verFotosN: 'View all {n} photos', caracteristicas: 'Property details', anteriorFoto: 'Previous photo', siguienteFoto: 'Next photo',
	descripcion: 'Overview', amenidades: 'Amenities', video: 'Video', ubicacion: 'Location', videoDe: 'Video of', mapaDe: 'Map of',
	agendaVisita: 'Schedule a tour (in person or video)', agendarVisita: 'Schedule a tour', llamar: 'Call', quieroInfo: 'Request information', similares: 'Similar properties',
	msgWaFicha: 'Hi, I\'m interested in "{titulo}" ({url}).',
	avisoVendida: 'This property has been sold', avisoRentada: 'This property has been rented',
	avisoCerradaTexto: 'It\'s no longer on the market, but we have similar options. Tell us what you\'re looking for and we\'ll send them your way.',
	verSimilares: 'See similar properties', buscasParecida: 'Looking for something similar?',
	noDisponibleTitulo: 'This property is no longer available',
	noDisponibleTexto: 'It\'s not for sale or rent right now. Browse other options or message us and we\'ll help you find something similar.',
	msgWaCerrada: 'Hi, I saw "{titulo}" ({url}), which is no longer available. Do you have something similar?',
	vipIntro: 'A curated selection of exceptional homes in Guatemala, with personal attention from first call to closing.',
	vipPronto: 'New luxury listings are coming soon.', contactanos: 'Contact us', paraConocerlas: 'to see them first.',
	vipTitulo: 'Luxury homes for sale in Guatemala', vipDesc: 'Exclusive homes and estates in Guatemala with personalized service, video tours and remote buying support.',
	masVip: 'More luxury homes', propiedadExclusiva: 'Exclusive listing', hablarAsesor: 'Talk to an advisor', agendarPrivada: 'Book a private tour',
	laPropiedad: 'The home', unica: 'Why it stands out', galeria: 'Gallery', recorre: 'Explore every room', verFoto: 'View photo',
	galeriaFotos: 'Photo gallery', cerrar: 'Close', enMovimiento: 'See it in motion', todoIncluye: 'Everything included',
	visitaPrivada: 'Private tour', vipContactoTexto: 'Leave your details and an advisor will arrange an in-person or live video tour at a time that works for you, including from the US.',
	msgWaVip: 'Hi, I\'m interested in the luxury listing "{titulo}" ({url}).',
	blog: 'Blog', blogPronto: 'Articles about buying property in Guatemala are coming soon.',
	blogTitulo: 'Guatemala real estate blog', blogDesc: 'Guides for US buyers: owning property in Guatemala as a foreigner, buying remotely, costs, areas and financing.',
	blogLead: 'Looking for a home in Guatemala? Get free advice', masArticulos: 'More articles',
	noEncontrada: 'Page not found', noExiste: "The page you're looking for doesn't exist or the property is no longer available.", verPropiedades: 'View properties',
	duenosTitulo: 'Owners and partner agents', duenosLead: 'Your portal is now your dashboard',
	duenosTexto: 'What you used to see here (how your property is doing, inquiries, showings and offers) is now in your dashboard, together with all your properties. Sign in with your email and your password.',
	duenosEntrar: 'Go to my dashboard', duenosPrimeraVez: 'First time? Ask your agent for access: you will get an email to set your password.',
	duenosPedir: 'Ask for access', duenosMsgWa: 'Hi, I would like access to my owner dashboard.',
	otroIdioma: 'ES', otroIdiomaLabel: 'Ver esta página en español',
	jsErrorDatos: 'Please enter your name and a valid phone number.',
	jsGracias: 'Thank you! We received your request and an advisor will contact you shortly.',
	jsFallo: 'We couldn\'t send the form.', jsSoy: 'Hi, my name is ', jsVisita: ' I would like to visit on ', jsTel: ' My phone: ',
	buscarFiltrar: 'Search and filter', cerrarFiltros: 'Close filters', jsVer: 'Show',
	jsUna: '1 property', jsVarias: ' properties', jsEscribe: 'Tell us what you are looking for.', jsBuscando: 'Searching…',
	jsSinConexion: 'We couldn\'t connect. Please use the filters below.',
	jsCuota: 'Estimated payment: ', jsAlMes: ' per month', jsEnganche: 'Down payment ', jsPrestamo: ' · Loan '
};

export const TEXTOS = { es: ES, en: EN };

// Textos que no se editan desde el panel (códigos de idioma y formato).
const TECNICOS = new Set(['htmlLang', 'ogLocale', 'dateLocale', 'otroIdioma']);

// Grupos del editor "Textos del sitio" del panel. Lo que no esté aquí aparece en "Otros".
export const GRUPOS_TEXTOS = [
	['Menú y pie de página', ['inicio', 'propiedades', 'comprar', 'rentar', 'propiedadesVip', 'verTodas', 'enlaces', 'zonas', 'vendeBoton', 'vendeQue', 'vendeQuePh', 'cerrarAviso', 'plantilla', 'escribenos']],
	['Tarjetas y botones', ['buscarPropiedades', 'buscar', 'masInfo', 'escribir', 'enVenta', 'enRenta', 'enVacacional', 'verDetalles', 'precioRebajado', 'antes', 'precioConsultar', 'mes', 'habitacion', 'habitaciones', 'bano', 'banos', 'asesorInmobiliario', 'correoBtn', 'anterior', 'siguiente']],
	['Formularios', ['nombre', 'telefono', 'telefonoPh', 'correo', 'mensaje', 'fechaVisita', 'tipoVisita', 'presencial', 'videollamada', 'enviar', 'jsErrorDatos', 'jsGracias', 'jsFallo']],
	['Mensajes de WhatsApp', ['msgInteres', 'msgAsesor', 'msgWaFicha', 'msgWaCerrada', 'msgWaVip', 'jsSoy', 'jsVisita', 'jsTel']],
	['Listados y búsqueda', ['filtrar', 'busquedaInteligente', 'iaPh', 'buscarIA', 'buscarPh', 'operacion', 'todas', 'todos', 'venta', 'renta', 'vacacional', 'tipo', 'zona', 'ordenar', 'recientes', 'precioAsc', 'precioDesc', 'precioMin', 'precioMax', 'limpiar', 'propiedad', 'propiedadesN', 'sinResultados', 'cuentanos', 'teAyudamos', 'noEncuentras', 'buscarFiltrar', 'cerrarFiltros', 'jsVer', 'jsUna', 'jsVarias', 'jsEscribe', 'jsBuscando', 'jsSinConexion']],
	['Ficha de propiedad', ['verFotosN', 'caracteristicas', 'anteriorFoto', 'siguienteFoto', 'descripcion', 'amenidades', 'video', 'ubicacion', 'agendaVisita', 'agendarVisita', 'llamar', 'quieroInfo', 'similares', 'fTipo', 'fOperacion', 'fEstado', 'fHabitaciones', 'fBanos', 'fParqueos', 'fConstruccion', 'fTerreno', 'fNiveles', 'fAnio', 'fMantenimiento', 'fUbicacion', 'fPrecioM2', 'fCodigo', 'compartir', 'compartirWa', 'compartirFb', 'copiarEnlace']],
	['Propiedad vendida o no disponible', ['avisoVendida', 'avisoRentada', 'avisoCerradaTexto', 'verSimilares', 'buscasParecida', 'noDisponibleTitulo', 'noDisponibleTexto']],
	['Calculadora de cuota', ['calcTitulo', 'enganche', 'tasa', 'anios', 'calcNota', 'jsCuota', 'jsAlMes', 'jsEnganche', 'jsPrestamo']],
	['Calculadora de renta', ['rentaTitulo', 'rentaIntro', 'rentaPrecio', 'rentaMensual', 'rentaMoneda', 'rentaUso', 'rentaHabitacional', 'rentaMixto', 'rentaComercial', 'rentaSugerida', 'rentaSupuestos', 'rentaVacancia', 'rentaGastos', 'rentaPlazoContrato', 'rentaPlazoAnio', 'rentaPlazoAnios', 'rentaNetoMensual', 'rentaRendNeto', 'rentaRendBruto', 'rentaEscenarios', 'rentaEscRenta', 'rentaEscNeto', 'rentaEscRend', 'rentaMenos10', 'rentaActual', 'rentaMas10', 'rentaVacio', 'rentaDesgloseTitulo', 'rentaDBruta', 'rentaDVacancia', 'rentaDEfectivo', 'rentaDGastos', 'rentaDIusi', 'rentaDComision', 'rentaDExento', 'rentaDIsr', 'rentaDIvaPeq', 'rentaDIvaGen', 'rentaDNeto', 'rentaDNetoMes', 'rentaIva', 'rentaNota', 'rentaAviso', 'rentaCta', 'rentaListo', 'rentaResumen', 'rentaPagTitulo', 'rentaPagMeta', 'rentaPagDesc', 'rentaPagLead', 'rentaPagForm', 'rentaPagFormTexto', 'rentaLink']],
	['Renta vacacional', ['vlBuscar', 'vlComo', 'vlPaso1', 'vlPaso2', 'vlPaso3', 'vlSinCasas', 'vacTitulo', 'vacPorNoche', 'vacImpuestos', 'vacCalendario', 'vacMesAnterior', 'vacMesSiguiente', 'vacLlegada', 'vacSalida', 'vacCheckIn', 'vacCheckOut', 'vacSinFecha', 'vacHuespedes', 'vacHuesped1', 'vacHuespedesN', 'vacMinimo', 'vacOcupado', 'vacLlegadaElegida', 'vacSalidaElegida', 'vacNoDisponible', 'vacEligeLlegada', 'vacEligeSalida', 'vacNoche1', 'vacNochesN', 'vacLimpieza', 'vacIva', 'vacInguat', 'vacTotal', 'vacDeposito', 'vacDepositoNota', 'vacVerNoches', 'vacBorrar', 'vacPausada', 'vacSolicitar', 'vacSinCobro', 'vacErrFechas', 'vacErrOcupada', 'vacErrMinimo', 'vacErrPasado', 'vacResumen', 'vacCodigo', 'vacReservar', 'fHuespedesMax', 'fNochesMin', 'fCamas', 'fMascotas', 'fLimpieza', 'vacAntes', 'vacMascotasSi', 'vacMascotasNo', 'vacComoLlegar', 'vacReglas', 'vacReglasGenerales', 'vacCancelacion', 'vacCancelacionGeneral']],
	['Propiedades VIP', ['vipTitulo', 'vipDesc', 'vipIntro', 'vipPronto', 'contactanos', 'paraConocerlas', 'masVip', 'propiedadExclusiva', 'hablarAsesor', 'agendarPrivada', 'laPropiedad', 'unica', 'galeria', 'recorre', 'verFoto', 'galeriaFotos', 'enMovimiento', 'todoIncluye', 'visitaPrivada', 'vipContactoTexto']],
	['Blog y página no encontrada', ['blog', 'blogTitulo', 'blogDesc', 'blogLead', 'blogPronto', 'leerMas', 'masArticulos', 'noEncontrada', 'noExiste', 'verPropiedades']],
	['Página de propietarios', ['duenosTitulo', 'duenosLead', 'duenosTexto', 'duenosEntrar', 'duenosPrimeraVez', 'duenosPedir', 'duenosMsgWa']]
];

// Valores originales, para mostrarlos en el panel como referencia.
export function textosPorDefecto() {
	const limpiar = (o) => Object.fromEntries(Object.entries(o).filter(([k, v]) => typeof v === 'string' && !TECNICOS.has(k)));
	return { es: limpiar(ES), en: limpiar(EN), grupos: GRUPOS_TEXTOS };
}

// Aplica los textos personalizados del panel (settings/site → textos.es / textos.en).
export function aplicarTextos(personalizados) {
	for (const [lang, base] of Object.entries(TEXTOS)) {
		const propios = (personalizados && personalizados[lang]) || {};
		for (const [k, v] of Object.entries(propios)) {
			if (typeof base[k] === 'string' && !TECNICOS.has(k) && typeof v === 'string' && v.trim()) base[k] = v;
		}
	}
}

// Reemplaza {titulo}, {nombre}, {url} en los mensajes.
export function fmt(texto, datos) {
	return String(texto || '').replace(/\{(\w+)\}/g, (m, k) => (datos && datos[k] != null ? datos[k] : m));
}

// Textos que necesita el JavaScript del navegador.
export function textosCliente(lang) {
	const t = TEXTOS[lang] || ES;
	return Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('js') || k === 'escribenos'));
}

export const TIPOS_EN = {
	casa: 'House', apartamento: 'Condo / apartment', terreno: 'Land', oficina: 'Office', local: 'Retail space', bodega: 'Warehouse', finca: 'Farm / estate'
};

export const ESTADOS_EN = Object.fromEntries(ESTADOS_PROPIEDAD.map((e) => [e.valor, e.en]));

export { M2_A_FT2, M2_A_V2 } from '../../admin/js/formato.js';
