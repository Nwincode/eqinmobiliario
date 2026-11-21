// Corpus del filtro de contacto (js/calc-vacacional.js tieneContacto y su copia en firestore.rules): frases normales de
// un huésped o un dueño (no se bloquea ninguna) e intentos de pasar un teléfono, correo, enlace, usuario o coordenadas
// (se bloquean todos). Lo usan scripts/test-vacacional.mjs (el navegador) y scripts/emulador/test-reglas.mjs (la regla):
// las dos tienen que decir lo mismo de cada frase. Cada caso nuevo que aparezca se agrega aquí.
export const NORMALES = [
	// Fechas, horas y personas.
	'Llegamos el 16/11/2026 a las 15:00', '¿Aceptan 2 perros?', 'Somos 8 adultos y 2 niños', 'del 16 al 20 de noviembre de 2026', 'Código EQ-J2XLVP',
	'¿La casa está a 45 min de la capital? Son 2 km de terracería', 'En el Km 98.5', 'Perfecto.Me avisas', 'Gracias.Info del parqueo', 'Llegamos a las 3.me dices',
	'Hola, somos 4 adultos y 2 niños, llegamos el viernes 20 a las 3 de la tarde.', 'Llegamos por la ruta CA-2, kilómetro 145, a eso de las 2 pm.',
	'Somos dos familias, uno de los niños tiene 3 años.', 'Todos los cuartos tienen aire? Somos nueve personas en total, seis adultos y tres niños.',
	'La reserva es del 20/12 al 27/12, son 7 noches.', 'Gracias! Nos vemos el sábado. Somos sinceros, la casa se ve increíble.', 'Tenemos un perro de 12 kilos, ¿se puede?',
	'Hay parqueo para 2 carros? Uno es una camioneta grande.', 'Mi vuelo llega a las 1430 y sale a las 1015 del domingo.', 'Somos 10 personas: 6 adultos, 3 niños y 1 bebé, llegamos 14, salimos 17.',
	'Llegamos el 24, somos 6, salimos el 27 temprano.', 'Habitaciones: 4, baños: 3.5, parqueos: 2, capacidad 10.', 'Del 2026-11-20 al 2026-11-25', 'Disponible del 15 al 22 de enero 2027, tarifa 1350 la noche.',
	'Llegamos tipo 4 o 5 de la tarde', 'Salimos a las 11:00 en punto', 'El check-in es a las 15:00 y el check-out a las 11:00, ¿correcto?', 'Somos 2 parejas y 1 niño de 5 años',
	'¿Podemos llegar el 31/12 a las 22:30?', 'Venimos del 3 al 6 de enero', 'Mi hija cumple 15 el sábado', 'Llegaremos como a las 1900 horas',
	'Del 1 al 15 de marzo de 2026', 'Capacidad 2-4-6 personas', 'Años 2018, 2019, 2020', 'Desde 1990 hasta 2025', 'Horario 8:00-17:00', '24/7 seguridad, 365 días',
	// Montos, cuentas y pagos.
	'El total es US$ 1,122.40, ¿correcto?', 'Q 3500.00 por 4 noches', 'Mantenimiento Q 1500 y luz Q 1800', '¿El precio de 1500 por noche incluye la limpieza? En otra página vi 1200.',
	'Ya hice la transferencia por 3450 quetzales, el número de boleta es el que sale en la foto.', 'Les depositamos 2350 hoy y mañana completamos el resto, 1800.',
	'Pagué 1,250.00 dólares, adjunto comprobante.', 'Pagamos US 980 y el resto en efectivo al llegar.', 'The house is great, someone told us about it. We are 4 people, done paying 1400 today.',
	'Precio especial: 1100 entre semana, 1600 fin de semana.', 'El depósito de 500 se devuelve al salir, más 350 de limpieza.', 'Son 3 noches x 450 = 1350 + 200 de limpieza = 1550 total.',
	'Pagué 1500 + 350 de limpieza.', 'Transferí Q 2,400.00 a las 10:15', 'Son 1350 quetzales por las 3 noches', 'Precio 250000 o 300000', 'US$ 1250000', 'Q 2,500,000.00',
	'Q.1,500 al mes, depósito Q.3,000', 'Tel no, pero 150000 USD', 'La limpieza son 350 y el depósito 500', '¿Hacen descuento si son 7 noches?', 'Te deposité 980 dólares',
	'El precio por noche es 1200 entre semana', 'Total 4,560.50', 'Son 2 noches a 1500 cada una', 'Pago con tarjeta o transferencia?', 'Ya pagué, adjunto la foto',
	// Medidas y la casa.
	'Remodelada 2019/2020', 'Temporada 2024-2025', 'Terreno de 1200 / 1500 m²', 'Casa de 350 m² y 2 niveles', 'construida en 2019, 3 habitaciones', 'La casa tiene 2500 pies de construcción y 3000 de terreno.',
	'Casa con piscina de 8 x 4 metros, terreno de 1200 varas y 800 de construcción.', '3 hab 2 baños 150 m2 2 parqueos', '1,200 sq ft / 111 m²', 'Medidas 10x25 = 250 m2', 'Km 14.5 a 15.2',
	'Lotes de 300-500 m², desde 2025', 'Apto 1201, torre 3, nivel 12', 'Casa en 5a calle 12-34 zona 10', 'Finca No. 12345 folio 678', 'La piscina mide 10 x 5 y tiene 1.5 de profundidad',
	'Tiene 4 habitaciones y 3 baños', 'El rancho es para 20 personas', 'Hay 2 hamacas y 1 asador', 'Queda a 300 metros de la playa', 'Son 15 minutos en carro al pueblo',
	// Plataformas y redes, sin datos.
	'Síguenos en Instagram para ver más fotos', 'Hola.Me interesa la casa', 'Excelente ubicación.Muy cerca de todo', 'Mi número de reserva de Airbnb no aplica, es la primera vez que reservo por aquí.',
	'Vi la casa en Facebook', '¿Tienen más fotos?', 'Listo.Co mo quedamos', 'Bueno.Io no sé', 'Me encantó la vista', 'Gracias por responder tan rápido', '',
	'Perfecto, entonces confirmamos', '¿Hay señal de celular en la casa?', '¿La cocina tiene licuadora?', 'Llevamos nuestras toallas', '¿Se puede hacer fogata?',
	'Son 4 noches por 1500 cada una, 6000 en total', 'Mi NIT es 1234567-8', 'NIT 1234567-8', 'We arrive at 1500 and leave at 1100', '1350*4=5400', 'Precio por noche: Q 1,350.00',
	'Llegamos el 20 a las 1500 y salimos el 23 a las 1100', 'Son 2,500.00 en total', 'Total 4500 quetzales', '6000 + 350 = 6350', 'Total 6000 más 350 de limpieza',
	'Is the pool heated?', 'We arrive on the 20th around 3 pm', 'How far is the beach?', 'Thanks, see you on Saturday!', 'We are 2 adults and 3 kids',
	'¿Aceptan mascotas de 5 kilos?', 'Somos 12 en total', 'Llegamos el 5 y nos vamos el 8', 'Es nuestro aniversario número 10', '¿El precio incluye IVA?'
];

export const EVASIONES = [
	// Teléfonos.
	'mi número es 5555-1234', 'llamame al 55 55 12 34', '+502 5913 1276', '5 5 5 5 1 2 3 4', 'cinco cinco cinco cinco uno dos tres cuatro', 'cinco5cinco5 1234', 'Llámame al 2024 5678',
	'5O55 1234', '5555 y luego 1234', 'mi número termina en 1234 y empieza con 5555', '5555 + 1234', '5555 1234', 'Q 5555 1234', 'Q5555-1234', '5555 1234 quetzales',
	'mi cel ５５５５１２３４', 'mi cel ٥٥٥٥١٢٣٤', 'mi cel ⑤⑤⑤⑤①②③④', 'escribime al 4012-3344', 'whats 3012 4455', 'mi tel: 2233-4455', '(502) 5555-1234', '502.5555.1234',
	'5-5-5-5-1-2-3-4', 'llámame al 55551234 noches', 'mi número 55551234 total', '55 55 = 12 34', '5 5 5 5 x 1 2 3 4', '555*51234', 'a las 5555 1234', '5555 1234 personas', 'tel 5555 x 1234', 'cinco5cinco cinco 1 2 3 4', 'llámame: 55551234', 'el 5555 y el 1234', 'nueve ocho siete seis cinco cuatro tres dos', '+1 305 555 1234',
	// Correos y enlaces.
	'escribime a ana@correo.com', 'ana arroba gmail', 'ana arroba gmail punto com', 'ana＠gmail.com', 'juan at gmail dot com', 'juan[at]gmail', 'juanATgmailDOTcom',
	'casa(dot)com', 'casa[.]com', 'casa,com', 'casa。com', 'mirá wa.me/50255551234', 'https://ejemplo.gt/casa', 'www.micasa.com', 'ｗｗｗ．micasa．com', 'www casa com',
	'mira [aquí](x)', 't.me/villa', 'casalago.co', 'fotos en villa-lago.me/fotos', 'T.ME/X', 'Bit.Ly/x', 'casa.lago.me', 'mi.link.me/y', 'micasa punto com', 'visita micasa.gt',
	'http//micasa', 'ana.perez@hotmail', 'reservas en lacasa.net',
	'5555 noches 1234', 'mi tel 5555 hrs 1234', '5555 total 1234', '5555km 1234km', 'las 5555 las 1234', '5555 de limpieza 1234', '5555 personas 1234', '5555 quetzales 1234',
	'son 5555 noches y 1234 noches', '5555 kms y 1234 kms', 'Q5555 y Q1234', 'Q 5555 y Q 1234', '5555 quetzales y 1234 de limpieza',
	'cinco cinco cinco cinco, doce treinta y cuatro', 'five five five five twelve thirty four', 'cincuenta y cinco cincuenta y cinco doce treinta y cuatro',
	// Usuarios en otras plataformas.
	'ig casalago_gt', 'gmail: juanperez', 'escríbeme al wa', 'búscame por whats', 'instagram @villalago', 'skype juan.perez', 'telegram villa_lago', 'fb casadelago',
	'en airbnb me encuentras como villalago', 'mi wsp es el mismo', 'búscame en insta como villalago', 'búscame en tiktok como villalago', 'me encuentras en ig como villa.lago',
	'mi correo es ana.perez en hotmail', 'escribe a anaperez en el gmail', 'ana perez at gmail', 'juan dot perez at gmail', 'villalago(punto)com',
	// Coordenadas.
	'coordenadas 14.5586, -90.7295', '14.5586 -90.7295', 'lat 14.6349 lon -90.5069', 'N14.6349 W90.5069', '14.63,-90.50', "14°38'N 90°30'W", '14.6349, -90.5069'
];

// Se bloquean aunque podrían ser normales: no se distinguen de un teléfono partido («5555 y luego 1234») ni de uno de
// 8 cifras con una palabra delante. Entre las dos cosas, se protege el contacto; el cliente manda su comprobante en foto.
export const BLOQUEADAS_A_PROPOSITO = ['Pago 2500 hoy, 2500 mañana', 'Ya transferí 1500 y 1500', 'Le transferí 2350 y 1800', 'Mandé 1250 y luego 1250 más',
	'El precio es 1350 y no 1530', 'número de boleta 12345678', 'Autorización 00123456', 'Referencia 2025112001'];
