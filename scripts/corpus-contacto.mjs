// Corpus del filtro de contacto (js/calc-vacacional.js tieneContacto y su copia en firestore.rules): frases normales de
// un huésped o un dueño (no se bloquea ninguna) e intentos de pasar un teléfono, correo, enlace, usuario o coordenadas
// (se bloquean todos). Lo usan scripts/test-vacacional.mjs (el navegador) y scripts/emulador/test-reglas.mjs (la regla):
// las dos tienen que decir lo mismo de cada frase. Cada caso nuevo que aparezca se agrega aquí.
export const NORMALES = [
	// Revisiones y cacerías (pagos, horas, redes sin usuario, NIT): 
	'Pago 2500 hoy, 2500 mañana', 'Ya transferí 1500 y 1500', 'Le transferí 2350 y 1800', 'Mandé 1250 y luego 1250 más', 'El precio es 1350 y no 1530', 'número de boleta 12345678', 'Autorización 00123456', 'Vi la casa en Instagram, se ve como muy bonita', 'La vi en facebook, como dos semanas atrás', 'La encontré en tiktok como recomendación', 'Mi presupuesto es entre 1500 y 2000 quetzales por noche', '¿El depósito es Q1500 o Q2000?', '¿Es $1500 o $2000?', 'Pagué 1500 de los 3000 quetzales', 'De los 3000 quetzales ya pagué 1500', 'Son 2500 noches? no, 2500 quetzales', 'Llegamos a las 1530 y salimos a las 1100', 'Somos doce, trece o catorce personas', 'Llegamos el quince, dieciséis o diecisiete', 'del veinte al veinticinco, somos doce', 'Pago 1500 quetzales y 1500 quetzales', 'Total 4500 quetzales, el depósito 1500', 'Lo tengo guardado en outlook', 'Te lo paso en el live de facebook', 'Somos veinte y cinco niños', 'Llegamos at 1530', 'Mañana a las 0930 te transfiero 2500', 'Q1500 y Q350 de limpieza', 'El total es 6000 quetzales, ya pagué 3000', '4 noches a 1500 cada noche, son 6000', 'Pagué 2500 + 2500 = 5000', 'Habitación 1204, piso 12', 'Hay 2000 metros de terreno y 1500 de construcción', 'treinta y cinco grados de calor, cuarenta y dos el domingo', 'Son Q1,500 por noche y Q350 de limpieza', 'La cuota es de 750 mensuales', 'Pagamos en 3 cuotas de 1250', 'Pago la mitad ahora, 2500, y la otra mitad al llegar', 'El anticipo es del 50%', 'Le hice depósito de Q2500 en Banrural', 'Transferencia a BI por 3,200', 'Deposité 2500 en el Banco Industrial', 'Total: 4500', 'Me salió en 1800 por noche', '¿Me lo deja en 1200?', '¿Lo puede dejar en 1,000?', 'El total fue 3450', 'Pagué 3450', 'Precio 1500, limpieza 350', 'La noche está en 1500 y el depósito en 500', 'Llevo 1500 en efectivo y 2000 con tarjeta', 'Q1350 x 4 = Q5400', 'Pagué con la tarjeta terminada en 4321', 'Mi boleta es la 123456', 'El número de autorización es 987654', 'La transferencia salió con número 12345678', 'Llegamos a las 2:30 pm', 'Llegamos entre 2 y 3', 'Llegamos como a las 1600', 'Salimos 11am', 'Check in 3pm check out 11am', 'Llegamos 10 y media', 'Salimos el domingo 1100 hrs', 'Our flight lands at 14:30', 'Vamos desde zona 10 por la carretera a El Salvador', 'Salimos de Antigua por la ruta a Ciudad Vieja', 'Estamos en el km 25 de la carretera a El Salvador', 'La casa queda en el kilómetro 89.5?', 'Vamos por la CA-9 hasta el km 102', 'Estamos en el condominio, ¿cuál es la casa?', 'Pasamos por Escuintla a las 2', 'Vivimos en zona 15, colonia Vista Hermosa 2', 'Desde Mixco son como 2 horas', 'Calle 4 zona 1', 'Llegamos por la 6a avenida', 'Estamos en la gasolinera del km 45', 'We are 6 adults and 4 kids, arriving Dec 20', 'Total is $1,250, right?', 'I paid $980 today', 'We paid 1400 dollars', 'Can we check in at 2pm?', 'We will be 8 people for 5 nights', 'Our dog weighs 25 lbs', 'Is it 15 minutes from the beach?', 'We land at 10:45 and drive 2 hours', 'The house is 2500 sq ft?', 'I sent the transfer for 3450, receipt attached', 'Is there a 2 night minimum?', 'Can you do 1200 per night?', 'We arrive 12/20 and leave 12/27', 'Dates: 2026-12-20 to 2026-12-27', 'Room 1 has 2 beds and room 2 has 1 bed', 'Booking ref EQ-ABC123', 'We are flying in from the US, flight AA 1234', 'Flight UA1520 arrives 14:05', 'I paid 1,500.00 USD', 'Somos 4 adultos, edades 35, 36, 60 y 62', 'Niños de 3, 5 y 8 años', 'Somos 6 adultos y 2 niños de 4 y 7', 'Mi papá tiene 85 años, ¿hay gradas?', 'Del 30/12/2026 al 02/01/2027', 'Del 29 de febrero al 3 de marzo', 'Del 24/12 al 26/12 y del 31/12 al 1/1', 'Del 20 al 27 de diciembre del 2026', 'Semana Santa 2027, del 21 al 28 de marzo', 'Para el 15 de septiembre', 'Fin de año 2026-2027', 'La casa 2 o la casa 3?', 'Vi el anuncio en Marketplace', 'Me recomendó una amiga', '¿Tienen WiFi?', '¿Cuál es la clave del wifi?', 'La contraseña del wifi no funciona', 'Hay 2 camas king, 3 queen y 4 individuales', 'Nivel 2, apartamento 4B', 'El portón tiene código', 'Mi DPI termina en 0101', 'Necesito factura con NIT 1234567-8', 'Factura a nombre de Juan Pérez, NIT CF', '¿Aceptan Visa?', 'El 50% ahora y el 50% al llegar', 'Del 1 al 5 de enero: 4 noches', 'Somos 15, ¿cabemos?', 'Somos 3 familias de 4', 'Hora de llegada: 15:30. Hora de salida: 11:00.',
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
	'¿Aceptan mascotas de 5 kilos?', 'Somos 12 en total', 'Llegamos el 5 y nos vamos el 8', 'Es nuestro aniversario número 10', '¿El precio incluye IVA?',
	// Revisión 5: una red seguida de una palabra cualquiera no es un usuario; los números de un pago, un vuelo, dos montos.
	'Lo vi en facebook marketplace', 'Encontré la casa en instagram buscando lagos', 'Mi gmail funciona mal, mejor por aquí', 'Saw it on instagram yesterday, love it',
	'Por instagram preguntamos antes', 'Vi el video en tiktok: increíble', 'Una amiga la compartió en facebook recientemente', 'Vi las fotos en instagram anteriormente',
	'Found you on facebook marketplace', 'facebook recomendaba esta casa', 'Mi esposo vio el anuncio en facebook mientras buscábamos', 'Síguenos en Instagram para ver más fotos',
	'Transferí Q2450 desde la cuenta terminada en 3456', 'Son Q2345 y Q5678 en total?', 'Our flight UA 2318 lands at 1450, we drive straight there',
	'Vuelo AV 2318 aterriza a las 1450', 'Referencia 2025112001', 'Referencia de la transferencia: 2025112001', 'No. de autorización 0045871236',
	'Tengo gmail pero no lo reviso mucho, mejor por aquí', 'Hay 2000 m² de terreno', 'La boleta del Banrural es la 2034567'
];

export const EVASIONES = [
	'mi cel 5555 y 1234 quetzales', 'búscame en ig, me llamo villalago', 'insta: villa_lago', 'Q5555 Q1234', '5555, 1234 noches', 'cincuenta y cinco, cincuenta y cinco, doce, treinta y cuatro', 'fifty five fifty five twelve thirty four', 'ana.perez arroba gmail', 'anaperez(arroba)gmail(punto)com', 'anaperez en gmail', 'villalago en insta', 'sígueme en insta: villa.lago.gt', 'mi correo ana perez en yahoo punto es', '5555 hrs 1234 hrs', 'las 2359 las 1234', 'at 5555 at 1234', '$5555 $1234', '5555% 1234', '5555#1234', '55 55 12 34', 'nit 5555123-4 y 4', 'NIT 55551234-k', 'q5555y q1234', '5555 personas 1234 personas', '5555 quetzales, 1234 quetzales',
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
	// Revisión 5.
	'mi insta es villalago_gt', 'mi ig es villa.lago', 'mi gmail es anaperez90', 'anaperez90 de gmail', 'anaperez gmail com', '55.55.12.34', '5555l234', '5555 I234',
	'⁵⁵⁵⁵¹²³⁴', 'mi número es 5555 y lo que sigue 12 34', 'mi correo es anaperez90 de gmail',
	'coordenadas 14.5586, -90.7295', '14.5586 -90.7295', 'lat 14.6349 lon -90.5069', 'N14.6349 W90.5069', '14.63,-90.50', "14°38'N 90°30'W", '14.6349, -90.5069'
];

// Se bloquea aunque podría ser normal (hoy, ninguna: los números de un pago pasan después de referencia, autorización,
// boleta, transacción o «No.»).
export const BLOQUEADAS_A_PROPOSITO = [];
