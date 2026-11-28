// Corpus del filtro de contacto (js/calc-vacacional.js tieneContacto y su copia en firestore.rules): frases normales de
// un huésped o un dueño (no se bloquea ninguna) e intentos de pasar un teléfono, correo, enlace, usuario o coordenadas
// (se bloquean todos). Lo usan scripts/test-vacacional.mjs (el navegador) y scripts/emulador/test-reglas.mjs (la regla):
// las dos tienen que decir lo mismo de cada frase. Cada caso nuevo que aparezca se agrega aquí.
// Las fechas completas del corpus están escritas para 2026: se corren al año en curso (una fecha de reserva vale del año
// pasado a dentro de 3, js/calc-vacacional.js aniosCercanos), así el corpus no caduca cada enero. Los rangos de años
// («2024-2025») no se corren: valen de 2010 a 2036 (SEGUIDOS).
const CORRE = new Date().getUTCFullYear() - 2026;
export const alAnio = (s) => (CORRE ? s.replace(/(\b\d{1,2}[/.-]\d{1,2}[/.-])(20\d\d)\b|\b(20\d\d)(-\d\d-\d\d)\b/g, (m, a, y1, y2, b) => (a ? a + (Number(y1) + CORRE) : (Number(y2) + CORRE) + b)) : s);
export const NORMALES = (() => [
	// Revisiones y cacerías (pagos, horas, redes sin usuario, NIT): 
	'Pago 2500 hoy, 2500 mañana', 'Ya transferí 1500 y 1500', 'Le transferí 2350 y 1800', 'Mandé 1250 y luego 1250 más', 'El precio es 1350 y no 1530', 'número de boleta 12345678', 'Autorización 00123456', 'Vi la casa en Instagram, se ve como muy bonita', 'La vi en facebook, como dos semanas atrás', 'La encontré en tiktok como recomendación', 'Mi presupuesto es entre 1500 y 2000 quetzales por noche', '¿El depósito es Q1500 o Q2000?', '¿Es $1500 o $2000?', 'Pagué 1500 de los 3000 quetzales', 'De los 3000 quetzales ya pagué 1500', 'Son 2500 noches? no, 2500 quetzales', 'Llegamos a las 1530 y salimos a las 1100', 'Somos doce, trece o catorce personas', 'Llegamos el quince, dieciséis o diecisiete', 'del veinte al veinticinco, somos doce', 'Pago 1500 quetzales y 1500 quetzales', 'Total 4500 quetzales, el depósito 1500', 'Lo tengo guardado en outlook', 'Te lo paso en el live de facebook', 'Somos veinte y cinco niños', 'Llegamos at 1530', 'Mañana a las 0930 te transfiero 2500', 'Q1500 y Q350 de limpieza', 'El total es 6000 quetzales, ya pagué 3000', '4 noches a 1500 cada noche, son 6000', 'Habitación 1204, piso 12', 'Hay 2000 metros de terreno y 1500 de construcción', 'treinta y cinco grados de calor, cuarenta y dos el domingo', 'Son Q1,500 por noche y Q350 de limpieza', 'La cuota es de 750 mensuales', 'Pagamos en 3 cuotas de 1250', 'Pago la mitad ahora, 2500, y la otra mitad al llegar', 'El anticipo es del 50%', 'Le hice depósito de Q2500 en Banrural', 'Transferencia a BI por 3,200', 'Deposité 2500 en el Banco Industrial', 'Total: 4500', 'Me salió en 1800 por noche', '¿Me lo deja en 1200?', '¿Lo puede dejar en 1,000?', 'El total fue 3450', 'Pagué 3450', 'Precio 1500, limpieza 350', 'La noche está en 1500 y el depósito en 500', 'Llevo 1500 en efectivo y 2000 con tarjeta', 'Q1350 x 4 = Q5400', 'Pagué con la tarjeta terminada en 4321', 'Mi boleta es la 123456', 'El número de autorización es 987654', 'La transferencia salió con número 12345678', 'Llegamos a las 2:30 pm', 'Llegamos entre 2 y 3', 'Llegamos como a las 1600', 'Salimos 11am', 'Check in 3pm check out 11am', 'Llegamos 10 y media', 'Salimos el domingo 1100 hrs', 'Our flight lands at 14:30', 'Vamos desde zona 10 por la carretera a El Salvador', 'Salimos de Antigua por la ruta a Ciudad Vieja', 'Estamos en el km 25 de la carretera a El Salvador', 'La casa queda en el kilómetro 89.5?', 'Vamos por la CA-9 hasta el km 102', 'Estamos en el condominio, ¿cuál es la casa?', 'Pasamos por Escuintla a las 2', 'Vivimos en zona 15, colonia Vista Hermosa 2', 'Desde Mixco son como 2 horas', 'Calle 4 zona 1', 'Llegamos por la 6a avenida', 'Estamos en la gasolinera del km 45', 'We are 6 adults and 4 kids, arriving Dec 20', 'Total is $1,250, right?', 'I paid $980 today', 'We paid 1400 dollars', 'Can we check in at 2pm?', 'We will be 8 people for 5 nights', 'Our dog weighs 25 lbs', 'Is it 15 minutes from the beach?', 'We land at 10:45 and drive 2 hours', 'The house is 2500 sq ft?', 'I sent the transfer for 3450, receipt attached', 'Is there a 2 night minimum?', 'Can you do 1200 per night?', 'We arrive 12/20 and leave 12/27', 'Dates: 2026-12-20 to 2026-12-27', 'Room 1 has 2 beds and room 2 has 1 bed', 'Booking ref EQ-ABC123', 'We are flying in from the US, flight AA 1234', 'Flight UA1520 arrives 14:05', 'I paid 1,500.00 USD', 'Somos 4 adultos, edades 35, 36, 60 y 62', 'Niños de 3, 5 y 8 años', 'Somos 6 adultos y 2 niños de 4 y 7', 'Mi papá tiene 85 años, ¿hay gradas?', 'Del 30/12/2026 al 02/01/2027', 'Del 29 de febrero al 3 de marzo', 'Del 24/12 al 26/12 y del 31/12 al 1/1', 'Del 20 al 27 de diciembre del 2026', 'Semana Santa 2027, del 21 al 28 de marzo', 'Para el 15 de septiembre', 'Fin de año 2026-2027', 'La casa 2 o la casa 3?', 'Vi el anuncio en Marketplace', 'Me recomendó una amiga', '¿Tienen WiFi?', '¿Cuál es la clave del wifi?', 'La contraseña del wifi no funciona', 'Hay 2 camas king, 3 queen y 4 individuales', 'Nivel 2, apartamento 4B', 'El portón tiene código', 'Mi DPI termina en 0101', 'Necesito factura con NIT 1234567-8', 'Factura a nombre de Juan Pérez, NIT CF', '¿Aceptan Visa?', 'El 50% ahora y el 50% al llegar', 'Del 1 al 5 de enero: 4 noches', 'Somos 15, ¿cabemos?', 'Somos 3 familias de 4', 'Hora de llegada: 15:30. Hora de salida: 11:00.',
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
	'Precio especial: 1100 entre semana, 1600 fin de semana.', 'El depósito de 500 se devuelve al salir, más 350 de limpieza.',
	'Pagué 1500 + 350 de limpieza.', 'Transferí Q 2,400.00 a las 10:15', 'Son 1350 quetzales por las 3 noches', 'Precio 250000 o 300000', 'US$ 1250000',
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
	'Llegamos el 20 a las 1500 y salimos el 23 a las 1100', 'Son 2,500.00 en total', 'Total 4500 quetzales', 'Total 6000 más 350 de limpieza',
	'Is the pool heated?', 'We arrive on the 20th around 3 pm', 'How far is the beach?', 'Thanks, see you on Saturday!', 'We are 2 adults and 3 kids',
	'¿Aceptan mascotas de 5 kilos?', 'Somos 12 en total', 'Llegamos el 5 y nos vamos el 8', 'Es nuestro aniversario número 10', '¿El precio incluye IVA?',
	// Revisión 5: una red seguida de una palabra cualquiera no es un usuario; los números de un pago, un vuelo, dos montos.
	'Lo vi en facebook marketplace', 'Encontré la casa en instagram buscando lagos', 'Mi gmail funciona mal, mejor por aquí', 'Saw it on instagram yesterday, love it',
	'Por instagram preguntamos antes', 'Vi el video en tiktok: increíble', 'Una amiga la compartió en facebook recientemente', 'Vi las fotos en instagram anteriormente',
	'Found you on facebook marketplace', 'facebook recomendaba esta casa', 'Mi esposo vio el anuncio en facebook mientras buscábamos', 'Síguenos en Instagram para ver más fotos',
	'Referencia 2025112001', 'Referencia de la transferencia: 2025112001', 'No. de autorización 0045871236',
	'Tengo gmail pero no lo reviso mucho, mejor por aquí', 'Transferí Q2450 desde la cuenta terminada en 3456', 'Hay 2000 m² de terreno', 'La boleta del Banrural es la 2034567',
	// Revisión 11.
	'Llámame el 24/12 a las 14:30', 'llámame en 2027 el 24/12', 'Llámanos en 2027 el 20/12 para reservar', 'call me in 2027 at 15:00',
	'te llamo el 2026 el 24/12 jaja', 'Número de huéspedes: 4, llegada 24/12 14:30', 'Atención tel. 9:00 a 17:00', 'Celular 8:00-17:00',
	'whatsapp 22:00 - 07:00', 'Contacto: 24/12 – 26/12', 'Mi contacto llega 24/12', 'mobile check-in 15:00 - 16:00', 'Phone hours 9:00-17:00',
	'call 9:00 - 17:00', 'te escribo el 24/12 a las 14:30', 'escríbeme el 24/12 o el 26/12', 'llámame 24/12 o 26/12', 'text me on 12/24 at 2:30',
	'call me 12/24 at 15:00', 'número de reserva 2026, llegada el 24/12', 'el número de personas 2027 el 24/12', 'Llegamos 2 adultos, 2027 el 24/12',
	'contacto 24/12', 'whatsapp me 24/12', 'cel 24/12 14:30', 'mi cel muere el 24/12 14:30', 'Llegamos el 24/12 14:30 y salimos el 31/12 11:00',
	'Check-in 24/12 14:30, check-out 31/12 11:00', 'Arrive 12/24 14:30, leave 12/31 11:00', 'Llámame mañana, llegamos 24/12 a las 14:30',
	'la llamada 24/12 y 26/12', 'Llamé 24/12 y 26/12', 'call me 9:00 or 9:30', 'número 1 el 24/12', 'phone me 15:00 - 16:00',
	'Llamamos a las 2026 personas', 'call at 2030 hrs', 'Te llamo a las 1530 o 15:45', 'Llámanos 2027 a las 15:00',
	'Celebramos 2026 el 31/12 con 8 personas', 'llamaré 2026 y 2027', 'whatsapp 2026 y 2027 sin señal', 'llámame en 2027 el 24/12',
	'Llámanos 2027 a las 15:00', 'call me in 2027 at 15:00', 'Atención tel. 9:00 a 17:00', 'Celular 8:00-17:00', 'whatsapp 22:00 - 07:00',
	'Contacto: 24/12 – 26/12',
	// Revisión 10.
	'check-in 15:00', 'Check-in 15:00, check-out 11:00', 'Llegamos 14:30 y salimos 11:00.', 'llegamos 14:30, salimos 11:00',
	'llegamos a las 14:30 y nos vamos 11:00', 'check-in: 15:00 / check-out: 11:00', 'Entrada 15:00 · Salida 11:00', 'llegada 14:37 salida 11:12',
	'Llegamos 13:20, el vuelo aterriza 12:05', 'llegamos 14:30 o 15:00', 'nuestro vuelo sale 6:40 y llega 9:55', 'Arrival 14:30, departure 11:00',
	'we arrive 14:30 and leave 11:00', 'we land 13:20 and arrive 15:35', 'ETA 16:10', 'check-out 11:00 sharp please', 'llegamos el 24/12 14:30',
	'el 24/12, 14:30', 'del 24/12 al 31/12', 'del 24/12 - 31/12', '24/12-31/12', '24/12 al 31/12 y 2/1 al 5/1',
	'Llegamos el 20/12 a las 15:00 y salimos el 27/12 a las 11:00', 'contacto de emergencia: mi hermana viaja conmigo',
	'Mi contacto de emergencia llega el 20/12', '¿Cuál es el contacto de emergencia de la casa?', 'text me when ready',
	'Text me when ready, we arrive 15:30', 'please text me here when the house is ready, 14:30?', 'reach me here at 15:00',
	'escríbeme cuando esté lista, llegamos 14:30', 'escríbeme por aquí el 20/12', 'Contactame por aquí a las 9:00 del 24/12',
	'te escribo el 2026-12-20', 'escríbeme 15:00 o 15:30', 'contáctame entre 14:00 y 16:00', 'escribí el 23/12/2026 y nadie respondió',
	'contact me 14:30 - 15:30', 'llámame a las 22:00', 'call me at 15:00 or 15:30', 'text me between 9:00 and 11:00',
	'escríbeme 14:35 o 15:10, aterrizamos', 'contacto: llegamos 21:12 y 23:45 al hotel',
	'Check-in: 15:00 – 21:00. Check-out: 11:00. Silencio: 22:00 a 07:00.', 'Horas de silencio 22:00-7:00',
	'Piscina 8:00 – 20:00, gimnasio 6:00 a 22:00', 'No fiestas. Mascotas con aviso. Check out 11:00.', 'Quiet hours 22:00 to 07:00',
	'Pool hours 8:00 to 20:00', 'Check-in after 15:00, check-out before 11:00', 'Hora de entrada 15:00 hrs, salida 11:00 hrs',
	'Entrada a partir de las 3:00 pm', 'Recepción 7:00-19:00 lunes a sábado', 'Late checkout 13:00 por Q200', 'Temporada alta 15/12 - 15/01: Q1,800',
	'Temporada alta del 15/12 al 15/1, Q 2,350', 'Semana Santa 2027: Q2,500 la noche', 'Navidad 24/12/2026 Q3,000',
	'Del 20/12/2026 al 03/01/2027 tarifa especial', 'Tarifa 2026-2027: $180', 'High season 12/15 - 1/15 $220/night', 'Low season Q1,200 (1/2 - 30/4)',
	'Precio 2027-01-10 a 2027-01-12: Q2,500', 'Fin de año 30/12, 31/12 y 1/1', 'Del 28/12/2027 al 2/1/2028', 'Reservamos 2030-01-05',
	'Check-in: 15:00\nCheck-out: 11:00\nSilencio: 22:00 a 07:00', '• Entrada: 15:00\n• Salida: 11:00\n• Piscina: 8:00 - 20:00\n• No fiestas',
	'- Llegada 14:30\n- Salida 11:00\n- Mascotas con aviso',
	'Horario de llegada: 14:00 – 20:00\nHorario de salida: 10:30\nLate check-out: 12:30 (Q200)',
	'Check-in 15:00 / Check-out 11:00\nQuiet hours 22:00-08:00\nMax 8 guests', 'Entrada 15:00\nSalida 11:00\n\nTemporada alta 15/12 - 15/01',
	'Llegada: 3:00 pm\nSalida: 11:00 am\nContacto de emergencia: el equipo, por el chat',
	'Reglas:\n1. Entrada 15:00\n2. Salida 11:00\n3. Silencio 22:00',
	'Check in: 15:00\nCheck out: 11:00\nPiscina 7:00 a 21:00\nGimnasio 6:00-22:00\nBBQ hasta las 22:00',
	'Navidad y Año Nuevo (24/12, 25/12, 31/12 y 1/1): mínimo 3 noches', 'Fechas especiales: 24/12 - 26/12 y 31/12 - 2/1',
	'Llegada 15:00 hrs\nSalida 11:00 hrs\nWifi: VillaLago2026', 'Check-in 14:45\nCheck-out 11:15', 'Entrada 15:10\nSalida 10:50', '24/12 14:30',
	'Llegada 24/12 14:30, salida 31/12 11:00', 'Las noches 24/12, 25/12, 26/12', 'Fin de año 30/12, 31/12 y 1/1', 'Check-in 24/12 14:30?',
	'Navidad y Año Nuevo (24/12, 25/12, 31/12 y 1/1): mínimo 3 noches', 'Fechas especiales: 24/12 - 26/12 y 31/12 - 2/1', 'arrive 12/24 2:30pm',
	'24 dic 14:30', 'te escribo el 20/12/2026', 'escribí el 23/12/2026', 'contactamos el 20/12/2026', 'contacto de emergencia 20/12/2026',
	'contacto: llegamos 21:12 y 23:45 al hotel',
	// Revisión 9.
	'llámame entre 14:00 y 16:00', 'Escríbeme el 23/12 para confirmar', 'Llámame a las 22:00', 'Silencio 22:00 - 06:00, música hasta las 21:45',
	// Revisión 8.
	'Hola, llegamos el 23-12-2025 y salimos el 27-12-2025', 'Del 20/12/2025 al 27/12/2025 somos 6', 'Somos 2 adultos y 3 niños',
	'¿Aceptan mascotas? Tenemos 2 perros pequeños', 'Llegamos a las 15:00 y salimos a las 11:00', 'Pagué Q2,500 de anticipo y Q1,500 de limpieza',
	'El total fue Q4,850.00', 'Ya hice el depósito de Q3500', 'Mi vuelo UA 2318 llega a las 14:30', '¿Hay parqueo para 2 carros?',
	'La casa tiene 350 m2?', '¿Cuánto cuesta la noche extra?', 'Nos vemos el 2025-12-23', 'Mi teléfono no tiene saldo, escribo por aquí',
	'Mi celular se descargó', '¿Me puedes llamar? No, mejor por aquí', 'Llegamos el viernes 12 a las 3', '¿Tienen wifi? Necesito trabajar',
	'Gracias por todo, la casa es hermosa', 'Quisiera saber si la piscina está climatizada', 'Somos 4 adultos, 2 niños de 5 y 7 años',
	'El año pasado fuimos en 2024 y nos encantó', 'Llegaremos entre 2 y 3 pm', 'Mi número de reserva es EQ-1234', 'Del 1 al 5 de enero 2026',
	'Estaremos del 2026-01-01 al 2026-01-05', 'Pago con tarjeta terminada en 1234', 'La boleta es la 123456', 'Mi correo es obligatorio?',
	'Me llamo Ana Pérez', 'Te escribo desde el aeropuerto', 'Llegamos en el vuelo de las 7', 'Somos 10 personas', '¿Hay 3 habitaciones?',
	'El 31-12-2025 queremos hacer cena', 'Mi hija cumple el 15.06.2026', 'Llamé al banco y me dijeron que ya salió el pago',
	'Hi, we arrive on 12/23/2025 and leave 12/27/2025', 'We are 4 adults and 2 kids', 'Can we check in at 3pm?', 'I paid $350 deposit',
	'Our flight AA 1234 lands at 2:30 pm', 'Thanks! The house looks amazing', 'Do you have parking for 2 cars?',
	'Please call me back? Actually, let us chat here', 'My phone is dying, I will reply later', 'We will arrive around 4',
	'I sent the payment, reference number 1234567890', 'Is there a crib for a 1 year old?', 'We booked for 2025-12-23 to 2025-12-27',
	'See you on 23.12.2025!', 'Can I bring my dog? He is 3 years old', 'How far is the beach? 5 minutes?', 'My email is fine, thanks',
	'Booking number 123456', 'Room for 6 people', 'Hola, bienvenidos. El check in es a las 15:00', 'La clave del wifi se la doy al llegar',
	'Hay que pagar Q500 de depósito reembolsable', 'El parqueo es para 3 vehículos', 'La limpieza cuesta Q350',
	'Su reserva del 23-12-2025 está confirmada', 'Le espero a las 2:00 pm', 'Quedo atento a su comprobante', 'Hola! cualquier duda me escribe por aquí',
	'Casa de 3 habitaciones y 2 baños, a 5 minutos del lago. Terreno de 1,200 m2 y 350 m2 de construcción.',
	'Hora de entrada 15:00, salida 11:00. No se permiten fiestas. Máximo 8 personas.',
	'Piscina de 4 x 8 metros, rancho con churrasquera, parqueo para 4 carros', 'Construida en 2018, remodelada en 2023',
	'Ubicada en el km 32.5 carretera a El Salvador', 'Km. 14.5 Carretera a Antigua', 'A 2 horas de la Ciudad de Guatemala', 'Silencio de 22:00 a 08:00',
	'Wifi 100 Mbps', 'Wifi 100 mbps, TV 55 pulgadas, Netflix', 'Cama king, 2 camas queen y 1 sofá cama',
	'Mascotas permitidas (máximo 2, menos de 15 kg)', 'Depósito de Q1,000 reembolsable', 'Agua caliente, aire acondicionado en 3 habitaciones',
	'Terraza con vista al volcán de Agua', 'Hasta 10 huéspedes', 'Lote 15, Sector B, Condominio Las Palmas', 'Desde 2015 recibimos familias',
	'Cocina equipada, refrigeradora, microondas, cafetera', 'Planta eléctrica', 'Generador de 5000 watts', 'Tanque de agua de 2500 litros',
	'Cisterna de 10,000 litros', 'Distancia: 1.5 km al centro', 'Altura: 1,500 metros sobre el nivel del mar', 'Check-in 3:00 PM - Check-out 11:00 AM',
	'No smoking. Quiet hours 10 pm to 8 am.', 'Sleeps 8, 3 bedrooms, 2.5 baths', 'Pool 4x8 m, BBQ area', 'Built in 2018 and renovated 2023',
	'3 BR / 2 BA', 'Ventilador de techo en cada cuarto', 'Modelo 2020-2021 de la casa', 'Abierto 24/7', 'Calle 5-55 zona 10', '4a avenida 12-34 zona 1',
	'Lote 23-12, sector 20', 'Casa 12-34, Residenciales 2000', 'Silencio 22:00 - 06:00', 'Música 20:00-23:00', 'Del 20/12 - 27/12',
	'Horario de silencio: 22:00 – 07:00', 'reference 1234567890', 'reference number 1234567890', 'transaction 1234567890', 'authorization 1234567890',
	'confirmation 1234567890', 'receipt 1234567890', 'referencia: 1234567890.', 'Line 2 of the address', 'Stand in line at the door',
	'En la línea 3 del contrato',
	// Revisión 7.
	'Llegamos el 12/12 y salimos el 15/12', 'del 20 al 27 de diciembre', '20/12/2026 al 27/12/2026', '2026-12-20 a 2026-12-27', 'Dec 20 - Dec 27, 2026',
	'12-20-2026', '20.12.2026', '20-12-26 al 27-12-26', 'del 24/12/26 al 02/01/27', 'from 12/20 to 12/27',
	'llegamos el 31 de diciembre de 2026 y nos vamos el 2 de enero de 2027', 'Llegamos a las 3:30 pm', 'a las 15:00', 'check in 15:00 check out 11:00',
	'llegamos 14:30 y salimos 11:00', 'entre 2 y 4 de la tarde', 'a las 1430', 'at 1500', 'a eso de las 10 am', 'llegamos como a las 8:45 de la noche',
	'arrival around 9.30pm', 'Q1,250.00 por noche', 'Q1.250,00', 'Q 2,500 la noche', '$350.00', 'Son Q3,750 por 3 noches', 'el total es Q4,550.50',
	'Q12,345.67 total', 'US$ 1,200', 'cuesta 1.250 quetzales', 'Q2500 de depósito', 'pagué Q1,500 de anticipo y el resto Q3,000',
	'Mandé Q 3,450.00 por transferencia', 'el saldo es Q2,050', 'deposité 1500 en BI', '2500 + 350 de limpieza', 'zona 10, 5a avenida 12-34',
	'5a avenida 12-34 zona 10', '13 calle 3-40 zona 10, edificio Atlantis', 'km 25.5 carretera a El Salvador', 'Km. 14.5 Carretera a Muxbal',
	'casa 23, condominio Los Álamos', 'lote 15 manzana B', 'Diagonal 6 10-01 zona 10, oficina 1203', '4a calle 7-53 zona 1',
	'Calzada Roosevelt 22-43 zona 11', 'km 28.5 ruta a Antigua', 'Boulevard Los Próceres 18-00 zona 10', '7a avenida 15-45 zona 9 apartamento 502',
	'Ruta 4 4-56 zona 4', 'Anillo Periférico 17-36 zona 11', 'kilómetro 25 y medio', 'casa #12', 'Apto 1204, torre 2', 'somos 12 personas',
	'somos 8 adultos y 4 niños', '6 adults 3 kids', 'we are 10 people', 'dos familias de 5', 'para 15 personas, 3 noches', 'mi NIT es 98765432',
	'NIT: 4512378-K', 'NIT 12345678', 'CF', 'NIT 108542356', 'EQ-AB12CD', 'mi código es EQ-7K3M9P', 'reserva EQ-2X4Y6Z', 'código EQ-123456',
	'EQ-555512', '3 noches', 'son 7 noches del 20 al 27', '2 noches x Q1,250 = Q2,500', '3 noches por 450 = 1350', '4 noches', '14 noches',
	'Ya hice el depósito, boleta 123456', 'transferencia No. 98765', 'Ya transferí Q2,500 a la cuenta Banrural', 'Número de autorización 004512',
	'ref. 7788123', 'boleta No. 4512789', 'Te mandé el comprobante, transacción 2026112201', 'pagué con tarjeta terminada en 4521',
	'transferencia de Q 1,875.00, referencia 98451236', 'autorización 845123', 'Pagué Q3,500 el 20/11 y Q2,000 el 21/11', 'Ya pagué los Q2,500 del 50%',
	'depósito Q 1,250 + Q 1,250', 'We arrive Dec 20 around 3pm and leave Dec 27 at 11am', 'Total is $1,250.00', 'Is it 4 bedrooms and 3 bathrooms?',
	'2 adults, 2 kids (ages 5 and 8)', 'We will be 6 people for 4 nights', 'Address: 5th avenue 12-34, zone 10', 'Price is Q2,500 per night?',
	'Paid $500 deposit, ref 7781234', 'gracias!! 😀', 'la casa 2 o la 3?', 'el lote mide 20x30', 'el terreno es de 600 varas',
	'la piscina mide 5 x 10 m', 'llegamos 2 carros', 'nos quedamos del 1 al 5', 'Tengo 2 perros de 15 kg', 'mi esposo trabaja en el km 15',
	'el bebé tiene 18 meses', 'tengo 35 años', 'la reserva de 2025 fue genial', 'vinimos en 2024 y 2025', 'Hola, vi la casa en Instagram',
	'la vi en facebook', 'mi correo es el mismo', 'mi correo es correcto', 'sí, mi correo es ese', 'mi correo es nuevo', 'Mi whatsapp es lento hoy',
	'Mi correo es hotmail, ¿llega bien?', 'mi correo es gmail', 'Mi instagram es público', 'Facebook: excelentes fotos', 'Correo: recibido, gracias',
	'mail: enviado', 'Email: sent the receipt', 'WhatsApp: tampoco', '¿El correo es obligatorio?', 'My email is jumping to spam',
	'Mi correo es todo en minúsculas', 'El correo es mío', 'Mi correo es corporativo', 'my email is down today', 'My email is above',
	'my email is listed in the form', 'mi correo es el de arriba', 'Mi correo es empresarial', 'el mail es lento', 'Correo: llegó a spam',
	'correo: confirmado', 'Instagram: hermosas fotos!', 'Vi su tiktok: buenísimo', 'tiktok: increíbles videos', 'Gmail: no me llegó nada',
	'email: ya revisé spam', 'My email is ok', 'Mi correo es: el mismo', 'el correo es seguro?', 'mail: gracias', 'Correo: perfecto',
	'My email is correct', 'my email is the same', 'My email is changed', 'Mi correo es viejito', 'Su correo es muy rápido', 'Telegram: no uso',
	'IG: lindas fotos', 'fb: gracias',
	// Revisión 6.
	'TRANSACCIÓN 1234567890', 'AUTORIZACIÓN: 0045871236', 'Mi correo es CORRECTO', 'Vi la casa en INSTAGRAM, se ve como ESPECTACULAR.',
	'Mi correo es el que puse en el formulario.', 'Mi correo es correcto.', 'Mi correo es nuevo, por si no les llega.',
	'mi correo es otro, ¿lo cambio?', 'Mi correo es diferente al del formulario.', 'Mi gmail es nuevo.', 'mi correo es incorrecto',
	'Mi mail es viejo, revisen spam', 'mi correo es este', 'Mi correo es personal, no de la empresa.', 'Recientemente en facebook vimos su anuncio',
	'Literalmente en tiktok me enamoré de la casa', 'Anteriormente en instagram preguntamos por otra', 'Justamente en facebook la vi ayer',
	'Vi la casa en Instagram, se ve como espectacular.', 'En facebook se veía como nuevecita.', 'En instagram se ve tan linda como preciosa!',
	'La vi en tiktok y soy fanatico.', 'Por facebook me llegó, soy recomendado por Luis.', 'Vi su instagram, soy seguidora!', 'facebook marketplace',
	'Lo vi en facebook como anuncio.', 'Boleta 00451278, depósito en BI', 'Pagué con la tarjeta terminada en 4521',
	'Nuestro vuelo AV 2318 llega a las 3', 'Flight UA 1234 lands at 5pm', 'Son Q2500 y Q1200 de limpieza?', 'Total $1250 and $300 deposit',
	'Llegamos 5 adultos y 3 niños, 2 perros', 'Somos 4 personas, 2 noches, llegamos el 12 a las 3 pm', 'El depósito de Q1500 y la limpieza Q350',
	'Pagaré Q3450 en total', 'We are 2 adults and 2 kids, arriving 3:30', 'Necesito 3 camas y 2 baños', 'Llegamos en el bus de las 2 y 15',
	'Do you allow pets? We have a 2 year old lab', 'Is the 4x4 needed for the road?', 'Habitación 2 y 3 juntas?', 'Mi esposo se llama Ignacio y yo Ana',
	'We land at 14:30 on flight 2318', 'Check-in 3pm, check-out 11am?', 'Total: Q 4,550.00', 'Room 2 i 3?',
	'I will pay the deposit of $500 and the balance of $1500', 'El código de mi reserva es EQ-AB12CD', 'Order no. 12345 from Amazon arrived lol',
	'nos vemos el 24 de diciembre 2026', 'mi correo es correcto, gracias',
	// Revisión de seguridad (B4): frases de reserva con números en palabras y redes sin usuario.
	'llegamos a las 3', 'somos 4 adultos', 'mil gracias', 'Mil gracias, llegamos a las 3, somos 4 adultos', 'el 25 de diciembre', 'Llegamos el veinticinco de diciembre a las tres',
	'Son dos mil quinientos quetzales por noche, y mil quinientos de depósito', 'Pagamos cuatro mil ochocientos cuarenta y dos quetzales', 'cuatro mil ochocientos cuarenta y dos',
	'La casa tiene ciento veinte metros y está a quinientos metros del lago', 'Somos cien por ciento puntuales', 'A thousand thanks!', 'It is two hundred dollars more?',
	'Somos cuatro adultos y dos niños, llegamos el doce y salimos el quince', 'facebook es donde la vi', 'Instagram genial', 'mi facebook está caído', 'mi ig no carga las fotos',
	'Lo vi en instagram es muy bonita, ¿tiene piscina?', 'Por instagram vi que tiene muelle', 'fb: gracias',
	// El precio de una casa en el título, la descripción o una amenidad: con su moneda y en miles exactos, aunque tenga 8
	// cifras que empiezan de 2 a 7 (Q20M a Q79.9M).
	'Precio Q25,000,000', 'Q25,000,000 o Q30,000,000', 'Entregada 300,000 dólares y preventa $275,000', 'Precio Q 25,000,000.00 negociable', 'Precio: Q.25,000,000', 'Precio $25,000,000', 'US$ 22,500,000', 'USD 30,000,000',
	'Valor 40,000,000 quetzales', '25,000,000 dólares', 'Q 2,500,000.00', 'Casa de 4 habitaciones en Q50,000,000, 600 v2 de terreno'
].map(alAnio))();

export const EVASIONES = (() => [
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
	'ig casalago_gt', 'escríbeme al wa', 'búscame por whats', 'instagram @villalago', 'skype juan.perez', 'telegram villa_lago',
	'en airbnb me encuentras como villalago', 'mi wsp es el mismo', 'búscame en insta como villalago', 'búscame en tiktok como villalago', 'me encuentras en ig como villa.lago',
	'mi correo es ana.perez en hotmail', 'escribe a anaperez en el gmail', 'ana perez at gmail', 'juan dot perez at gmail', 'villalago(punto)com',
	// Coordenadas.
	// Revisión 5.
	'mi insta es villalago_gt', 'mi ig es villa.lago', 'mi gmail es anaperez90', 'anaperez90 de gmail', 'anaperez gmail com', '55.55.12.34', '5555l234', '5555 I234',
	'⁵⁵⁵⁵¹²³⁴', 'mi número es 5555 y lo que sigue 12 34', 'mi correo es anaperez90 de gmail',
	// Revisión 11.
	'llámame el 22/12 12:31', 'llamame 22/12 12:31', 'call me 12/22 12:31', 'escribeme el 22/12 12:31', 'text me 12/22 12:31', 'wa 22/12 y 12/31',
	'wa: 22/12 12:31', 'wa 22:12 y 12:31', 'wa 22:12 12:31', 'wa 5555 12:34', 'whats 22/12 y 12/31', 'wsp 22/12 12:31', 'cell 12/22 12:31',
	'mobile 12/22 and 12/31', 'número 22/12 y 12/31', 'whats al 22/12 y 12/31', 'whats: el 22/12 y 12/31', 'número: es 22/12 y 12/31',
	'cel es 22/12 y 12/31', 'mi cel es el 22/12 12:31', 'mi número es 22/12 y 12/31', 'my number is 12/22 12:31', 'my cell is 12/22 and 12/31',
	'phone is 12/22 12:31', 'llámame 22:12 a las 12:31', 'llámame 22/12 a las 12:31', 'wa 22/12 a las 12:31', 'wsp 22/12 a las 12:31',
	'whats 22/12 a las 12:31', 'cel 22/12 a las 12:31', 'número 22/12 a las 12:31', 'tel 22/12 a las 12:31', 'llámame 5555 12/31',
	'llámame 5555 el 12/12', 'wsp 5555 y 12/31', 'llámame 22/12 1231', 'llámame 22/12 y 1231', 'wsp 22/12 1231', 'llámame 2212 12:31',
	'llámame 22 12 12:31', 'llámame al 22, 12, 12:31', 'llámame 22.12 12.31', 'llámame 22-12 12-31', 'llámame 22/1 2/12 3/1', 'llámame 2/2 1/2 3/1',
	'wa 5/5 5/5 1/2 3/4', 'llámame al 5/5, 5/5, 1/2 y 3/4', 'número? 22/12 y 12/31', 'mi whats va por fechas: 22/12 y 12/31', 'cel → 22/12 y 12/31',
	'mi cel 22/12 12:31', 'cel. 22/12 12:31', 'tel.: 22/12, 12:31', 'whatsapp: 22/12 y 12/31', 'escríbeme: 22/12 12:31 gracias',
	'llámame el 22/12 12:31', 'wa: 22/12 12:31', 'mi cel es el 22/12 12:31', 'cel 22/12 a las 12:31', 'mi número es 22/12 y 12/31',
	'my number is 12/12 12:31', 'call me 12/22 12:31', 'wa 22:12 y 12:31',
	// Revisión 10.
	'escríbeme 21:12 23:45', 'escribeme al 21:12 23:45', 'contáctame 22:55 12:34', 'contacto 22:55 12:34', 'text me 22:55 12:34',
	'write me 21:12 23:45', 'reach me 22:55 12:34', 'contáctame al 23-12-2026', 'text me 2026-12-23', 'contacto 2026/12/23', 'escríbeme 22:55 y 12:34',
	'escribeme 2255 12:34', 'contacto 5555 12:34', 'contacto 5555, 12:34', 'contacto: 5555-12:34', 'llegamos 22:55 12:34 jaja', 'mi número 22:55 12:34',
	'whats 22 55 12 34', 'cel 5555 12:30', 'cel 5555 14:00', 'cel 5555 23:45', 'llámame 22:00 - 07:00 5555', 'cel 22:00 12:30',
	'mi número es 5512 a las 12:34', 'cel 5555 a las 12:34', 'cel 5555 el 12/3',
	'cel 5555 el 12/12', 'whatsapp 5555 del 12/3 al 4/5', 'tel 5555 - 1234', 'mi cel 5555 hasta 12:34', 'mi cel 5555 to 12:34',
	'contacto de emergencia 5555 1234', 'my number 22:55 to 12:34', 'cel 22:15 y 12:45', 'llamame 20:00 a 23:30 5555 1234',
	'cel 5555 a las 12:34', 'cel 5555 y 12:34', 'mi cel 5555 hasta 12:34', 'cel 5555 el 12/12', 'escribime 23/12/2026', 'contactame 23/12/2026',
	'text me 23/12/2026',
	// Revisión 9.
	'escríbeme 23/12/2026', 'escríbeme al 21:12 y 23:45', 'mi cel 5555 12:34', 'cel 5555, 12:34', 'whatsapp 4123 20:15',
	// Revisión 8.
	'escríbeme al 23-12-2015', 'al 23.12.2015 me encuentras', 'búscame 31-12-2045', 'contacto: 22.11.2034', '2312-2015 pls', 'mi otro: 23-12-2015',
	'whatsapp de mi hermano, que te contesta él: 23-12-2015', 'mi número 55 1234 5678', '55 1234 5678', 'call me 305 555 1234', '(305) 555-1234',
	'305.555.1234', '612 34 56 78', '612345678', 'mi móvil 612 345 678', '7911 123456', '0412 1234567', '011 4123 4567', '06 12 34 56 78', '0612345678',
	'091 234 5678', '8 800 555 35 35', '4123 4567', '+51 987 654 321', '51987654321', '+593 99 123 4567', '+58 412 1234567', '+86 138 0013 8000',
	'+81 90 1234 5678', '+7 912 345 67 89', '+351 912 345 678', '+41 79 123 45 67', '+591 71234567', '+595 981 123456', '+598 94 123 456',
	'+53 5 1234567', 'referencia 50255551234', 'ref 13055551234', 'ref: 521551234567', 'boleta 0050255551234', 'ref 34612345678',
	'referencia 0034612345678', 'llama al 5 55 51 23 4', '555-512 34', '5555 1 2 3 4', '5555\n1234', '5555, luego 1234', '5555 #1234',
	'telegram: @villa', 'dm me on ig villa_lago', 'my insta handle is villa.lago', 'snap: villa_lago', 'snapchat villa_lago', 'x.com/villalago',
	'twitter @villalago', 'ana punto perez arroba gmail punto com', 'ana.perez(arroba)gmail', 'ana.perez [arroba] gmail', 'anaperez90 hotmail com',
	'gmail punto com', 'whatsapp +502 23-12-2025', 'escríbeme al 23-12-2015', '(502) 23-12-2025', '00502 23-12-2025', '502 23-12-2025',
	'whatsapp 502 23-12-2025', 'tel +502 2025-2026', 'referencia 4155551234 llámame', 'llámame, referencia 4155551234', 'referencia +51987654321',
	'mi tel 912 345 678', 'call me 987 654 321', 'my insta handle is villa.lago', 'IG handle: villa_lago', 'instagram account: villa_lago',
	'snap villa_lago', 'snapchat: villa_lago', 'wechat: villa_lago', 'discord villa#1234', 'line: villa_lago', 'line id villa_lago',
	'signal villa_lago', 'viber: villa_lago', 'ІG: villa_lago', 'ΙG: villa_lago', 'GMАIL: ana.perez', 'İg: villa_lago',
	// Revisión 7.
	'5555_1234', '5555~1234', '5555|1234', '5555•1234', '5555—1234', '5555–1234', '5555 ... 1234', '5555 ___ 1234', '5555/1234', '5555\\1234',
	'(5555)1234', '5555 , 1234', '5 . 5 . 5 . 5 . 1 . 2 . 3 . 4', '5555  ·  1234', '5555 -- 1234', '5555 *** 1234', '5555😀1234', '5😀5😀5😀5😀1😀2😀3😀4',
	'5555 📞 1234', '5️⃣5️⃣5️⃣5️⃣1️⃣2️⃣3️⃣4️⃣', '5⃣5⃣5⃣5⃣1⃣2⃣3⃣4⃣', '٥٥٥٥١٢٣٤', '۵۵۵۵۱۲۳۴', '५५५५१२३४', '৫৫৫৫১২৩৪', '๕๕๕๕๑๒๓๔', '⑤⑤⑤⑤①②③④', '𝟓𝟓𝟓𝟓𝟏𝟐𝟑𝟒',
	'𝟱𝟱𝟱𝟱𝟭𝟮𝟯𝟰', 'Ⅴ Ⅴ Ⅴ Ⅴ Ⅰ Ⅱ Ⅲ Ⅳ', '₅₅₅₅₁₂₃₄', '❺❺❺❺❶❷❸❹', '➎➎➎➎➊➋➌➍', '5555​1234', '5​5​5​5​1​2​3​4', '5555‍1234', '5555⁠ 1234', '5555﻿1234',
	'5555­1234', 'ig:​villa_lago', 'gm​ail: ana.perez', 'ana.perez@​gmail', 'ana​@gmail.com', 'ww​w.casa.com', 'wa​.me/50255551234', '5555᠎1234',
	'5555͏1234', 'іg: villa_lago', 'іnstagram villa_lago', 'gmаil: ana.perez', 'ana.perez аt gmail', 'wа.me/5555', '5555 О 1234',
	'сinco cinco cinco cinco uno dos tres cuatro', '5555 1234', '5555 1234', '5555 1234', '5555　1234', '5555  1234', 'ig villa_lago', '5 5 5 5 1 2 3 4',
	'ig villa_lago', 'más cinco cero dos 5555 1234', 'mas quinientos dos cinco cinco cinco cinco uno dos tres cuatro',
	'plus five zero two 5555', 'código 502, luego 5555 y 1234', 'quinientos dos, cincuenta y cinco cincuenta y cinco doce treinta y cuatro',
	'bit.ly/3abcd', 'tinyurl.com/abc', 't.me/villalago', 'wa.link/abc12', 'linktr.ee/villalago', 'goo.gl/maps/abc', 'is.gd/abc', 'cutt.ly/abc',
	'rb.gy/abc', 'shorturl.at/abc', 'tiny.cc/abc', 'bit ly/3abcd', 'bit. ly/3abcd', 'bitly slash abcd', 'wa.me/50255551234',
	'api.whatsapp.com/send?phone=50255551234', 'api whatsapp com send phone 502', 'whatsapp.com/send', 'chat.whatsapp.com/AbCdEf', 'wa . me / 5025555',
	'wa(.)me/5025', 'w a . m e', 'm.me/villalago', 'fb.me/villalago', 'instagram.com/villalago', 'ig.me/m/villalago', 'ana.perez(at)gmail',
	'ana.perez [at] gmail [dot] com', 'ana perez a r r o b a gmail', 'anaperez90 en gmail', 'ana.perez AT gmail DOT com', 'ana.perez{at}gmail',
	'ana.perez<at>gmail', 'ana.perez @ gmail', 'ana.perez ＠ gmail', 'ana.perez﹫gmail', 'anaperez90 gmail', 'gmail anaperez90', 'anaperez90 (gmail)',
	'ana_perez at hotmail', 'ana.perez en outlook', 'escríbeme: ana.perez gmail', 'ana.perez 4rr0b4 gmail', 'ana.perez arrob@ gmail',
	'mi correo anaperez90', 'mi correo, anaperez90', 'correo -> anaperez90', 'correo = anaperez90', 'correo => ana.perez', 'mi cel empieza con 5555',
	'llamame 5 5 5 5 - 1 2 3 4', '5555 y 1234', 'cinco5cinco5 uno2tres4', '5 5 5 5 one two three four', '5555 one two three four', 'five5five5 1234',
	'wsp 55551234', 'wasap: 5555-1234', 'mi whats 5555 12 34', '5́5́5́5́ ́1́2́3́4', '5555⃣1234', '５５５５１２３４',
	// Revisión 6.
	'mi no. 55551234', 'Mi no. de cel es 5555 1234', 'no. 5555-1234 escríbeme', 'ref 55551234 llámame', 'mi número de referencia: 55551234 (cel)',
	'boleta 55551234 jaja es mi cel', 'vuelo 5555 1234', 'flight 55 551234', 'total q5555 y q1234 jaja', 'son $5555 y $1234 (mi cel)',
	'mi correo es anaperez90', 'My email is anaperez90 at gmail', 'my insta is villalago_gt', 'my ig: villa.lago', 'find me on instagram as villalago',
	'cel 5555l234', 'cel 5555 I234', 'ig villa_lago', 'telegram @villalago', 'tg villalago_gt',
	'five five five five one two three four', '5555 1234 (tel)', 'tel cinco cinco 5 5 12 34', 'mi correo: ana punto perez arroba gmail',
	'tarjeta terminada en 5555 y 1234 es mi cel', 'Mi cuenta terminada en 5555, el resto 1234', 'búscame en ig: villa_lago',
	'escríbeme por ig: villa.lago', 'en telegram: villalago_gt', 'agrégame en fb: ana.perez.90', 'desde instagram: @villalago',
	'on instagram: villa_lago', 'Ref: 5555 1234', 'referencia 5555-1234',
	'No. 5555 1234', 'transacción 55551234', 'mi cel, ref 55551234', 'vuelo 55551234', 'vuelo AV 5555 1234', 'pago Q5555 y Q1234',
	'precio $5555 and $1234', 'mi correo es ana.perez',
	'coordenadas 14.5586, -90.7295', '14.5586 -90.7295', 'lat 14.6349 lon -90.5069', 'N14.6349 W90.5069', '14.63,-90.50', "14°38'N 90°30'W", '14.6349, -90.5069',
	// Revisión de seguridad (B4): un usuario de red sin forma de usuario donde no cabe otra cosa, y los números con cientos y miles.
	'mi usuario de ig es juanlago', 'mi usuario de ig es x123', 'instagram es villalago', 'mi insta es villalago', 'My IG is juanlago', 'ig juanlago', 'IG juanlago!', 'fb casadelago',
	'tiktok villalago', 'telegram juanlago', 'mi ig juanlago.', 'mi cuenta de facebook es juanlago', 'mi ig es villalago', 'mi ig es villa lago gt', 'telegrаm villalago',
	'cincuenta y cinco cincuenta y cinco cuatro mil ochocientos cuarenta y dos', 'cincuenta y cinco cincuenta y cinco mil ciento veintidós', '5555 cuatro mil ochocientos cuarenta y dos',
	'mi número es cinco cinco cinco cinco, mil ciento veintidós', 'cinco mil quinientos cincuenta y cinco mil doscientos treinta y cuatro',
	'cinco mil quinientos cincuenta y cinco, mil doscientos treinta y cuatro', 'five five five five zero five five five', 'fifty five fifty five four thousand eight hundred forty two',
	// Un teléfono vestido de precio (sin miles exactos, o con más cifras que un precio) o junto a un precio.
	'Q55,551,234', '$55,551,234', 'Precio Q25,000,000 y mi cel 5555 1234', '5555 Q25,000,000 1234', 'Q25,000,000 55551234', 'Precio Q25,000,000, 5555-1234',
	'Q5,055,551,000', 'US$ 1,305,555,000',
	// Medio teléfono escrito como precio y la otra mitad al lado (segunda revisión).
	'mi cel es 5555 $1,000', '5555 1,000 quetzales', '$5,000 1234', 'Q5,000-1234', 'Q2,420,000 3000', 'Q 5555 1,000 quetzales', 'mi cel 555 Q51,234,000', 'el 555 Q51,234,000 es mi cel'
].map(alAnio))();

// Se bloquea aunque podría ser normal.
export const BLOQUEADAS_A_PROPOSITO = (() => [
	// Una palabra pura después de «mi … red es» se lee como usuario: «mi instagram es privado» también (revisión de seguridad B4).
	'mi instagram es privado', 'My insta is private',
	'Hice la transferencia, número de boleta 70012345',
	// Juntando los grupos cercanos forman un teléfono posible (8 cifras que empiezan de 2 a 7, o 10 o más): se bloquean
	// aunque sean un monto, una cuenta, un vuelo o una referencia corta. Es preferible a dejar pasar un teléfono.
	'Pagué 2500 + 2500 = 5000', '6000 + 350 = 6350', 'Son 3 noches x 450 = 1350 + 200 de limpieza = 1550 total.',
	'Son Q2345 y Q5678 en total?', 'Our flight UA 2318 lands at 1450, we drive straight there', 'Vuelo AV 2318 aterriza a las 1450',
	'La referencia de mi pago es 20241234, ya transferí', 'Transfer ref 778812345 done',
	'factura a nombre de Ana, NIT 3456789-1', 'deposité en la cuenta 3012345678', 'cuenta monetaria 01-2345678-9', 'cuenta 123-456789-0',
	'el depósito fue de Q3,250.00 en Banco Industrial, boleta 70012345', 'Transfer done, confirmation #4512-7788', 'Zelle confirmation 25563412',
	'boleta 70012345',
	// Un precio de 8 cifras de 2 a 7 sin su moneda o con puntos de miles: sin la forma de precio se lee como teléfono.
	'Terreno de 25,000,000 m2', 'Q25.000.000'
].map(alAnio))();

// Límites aceptados (pasan; no se prueban): sin cifras ni forma de usuario, no hay de dónde agarrarse sin bloquear frases
// normales («facebook marketplace»).
export const LIMITES_ACEPTADOS = [
	'call me 12/22 and 12/31', 'escríbeme 22/12 y 12/31', 'text me 12/22 and 12/31', 'contáctame 22/12, 12/31', 'WA 22/12 - 12/31', 'el número va así: 22/12 y 12/31', 'llámame (22/12 y 12/31)',
	// Revisión 11: un rango de horas redondas pegado a un sustantivo de teléfono es un horario («Celular 8:00-17:00»), y
	// dos días/mes después de «llámame» con «y».
	'cel 22:00-12:30', 'whatsapp 22:00 - 12:30', 'mi cel 22:30 a 12:45', 'tel 21:00 a 23:45', 'whatsapp 22:15 - 12:45', 'llámame 22/12 y 12/31',
	// Revisión 10: días/mes inválidos con palabras en medio.
	'cel 55 del 55/12 al 12/34',
	// Revisión 8: 9 cifras sin palabra de teléfono (prima una referencia), 10 después de «referencia» sin palabra de
	// teléfono (prima la referencia), una fecha válida de un año cercano sin código ni palabra de teléfono, una hora sin
	// código («22:00-06:00» junto a «llámame»).
	'30/11/2025 y 30/11/2026', 'llámame', '9 8765 4321', '987654321', 'referencia 4155551234', 'autorización 3055551234 gracias', 'ref 0412345678',
	'referencia 9876543210', 'referencia 6123456789', 'referencia 0115512345678', '55 51 23 4', 'búscame en insta: villa lago',
	'gmail: villa', '912 345 678', 'referencia 5512345678', 'escríbeme al 23-12-2025', 'Silencio 22:00-06:00 llámame',
'mi correo\u2028es anaperez', 'busca villa lago gt en facebook', 	'los primeros son 5555 y los últimos cuatro son 1234', 'mi whatsapp es el mismo del formulario', 'llámame al número que dejé', 'ana.perez g m a i l',
	// Una palabra pura después de «red:» (sin cifra, punto, guion bajo ni @) o de «correo es»: pasa, para que pasen «Mi correo
	// es obligatorio», «Mi whatsapp es lento», «fb: gracias». Y las cifras repartidas en varios mensajes o en partes sueltas.
	'gmail: juanperez', 'búscame en insta: villalago', 'en instagram: villalago', 'por telegram: villalago', 'ig: villalago',
	'mi correo es anaperez', '🔟', 'i​g: villalago', 'ig: villalago', 'ig:\tvillalago', 'mi correo es anaperez',
	'mi número: cinco cinco cinco cinco', 'termina en 1234', '55-55',
	'12-34', 'IV IV', 'whatsapp 5555',
	// Un teléfono que termina en 000 escrito como precio en miles exactos («Q55,551,000»): pasa como precio.
	'Q55,551,000',
	// Medio teléfono como precio con la otra mitad a dos signos o más («, », « - »): pasa, para que pase «Q50,000,000, 600 v2».
	'Q2,420,000, 3000', '5555, $1,000', 'mi cel 5555 - Q1,000'];

// Corpus GENERADO: cada teléfono y cada usuario conocidos envueltos en cada contexto de excepción que tiene el filtro
// (sus palabras, con dos puntos, en mayúsculas, con y sin acentos, en dos líneas, delante y detrás, en español y en
// inglés). Una excepción nueva que abra un hueco hace fallar `npm test` (scripts/test-vacacional.mjs) y la comparación
// de la regla con el navegador (scripts/emulador/test-reglas.mjs, una muestra).
const TELEFONOS = ['55551234', '5555 1234', '5555-1234', '55 55 12 34', '5555.1234', '+502 5555 1234', '2255 1234', '7777-1234', '5555 12 34', '+1 305 555 1234'];
const PALABRAS_NUMERO = ['referencia', 'ref', 'autorización', 'autorizacion', 'boleta', 'transacción', 'transaccion', 'No.', 'número', 'tarjeta terminada en',
	'cuenta terminada en', 'terminación', 'ending in', 'vuelo', 'flight', 'vuelo AV', 'UA', 'Q', 'Q.', '$', 'US$', 'USD', 'pago Q', 'total', 'son', 'precio', 'a las',
	'at', 'NIT', 'nit es', 'hrs', 'quetzales', 'noches', 'personas', 'm²', 'km', 'habitación', 'código', 'order no.', 'depósito', 'limpieza', 'DPI', 'año 2026', 'el 2026-12-20'];
const USUARIOS = ['villa_lago', 'villa.lago', 'ana.perez.90', 'villalago_gt', '@villalago', 'anaperez90'];
const REDES = ['ig', 'insta', 'instagram', 'fb', 'facebook', 'tiktok', 'telegram', 'tg', 'gmail', 'correo', 'mail', 'email'];
const ANTES_RED = ['', 'en ', 'por ', 'desde ', 'on ', 'in ', 'búscame en ', 'agrégame en ', 'find me on ', 'mi ', 'my '];
const ENTRE = [' ', ': ', ' es ', ' is ', ' como ', ' as ', ':\n'];
const variantes = (s) => [s, s.toUpperCase(), s.replace(/ /, '\n')];
// Con su código de país, seguidos (la excepción de 10 o más cifras después de «referencia» no los deja pasar).
const CON_CODIGO = ['50255551234', '+50255551234', '0050255551234', '13055551234', '+13055551234', '525512345678', '50377771234', '50699998888', '34612345678', '447911123456'];
// Fijos con forma de fecha o de años, con una palabra de teléfono cerca.
const FECHAS_TEL = ['2020-12-31', '25/12/2034', '2025-2031', '2025, 2031', '22/12/2055', '20.12.2031'];
const PALABRAS_TEL = ['tel', 'cel', 'fijo', 'llámame', 'llamame al', 'whatsapp', 'número', 'mi número es', 'phone', 'call me', 'teléfono:'];
// Lo que se escribe con caracteres de otras escrituras o invisibles.
const INVISIBLES = ['\u200b', '\u200d', '\u2060', '\ufeff', '\u00ad', '\u034f', '\u180e', '\u202e'];
const ESPACIOS = ['\u00a0', '\u2009', '\u202f', '\u3000', '\u2007', '\u205f', '\u2028'];
const PARECIDAS = { a: '\u0430', e: '\u0435', o: '\u043e', i: '\u0456', c: '\u0441', p: '\u0440', x: '\u0445', y: '\u0443' };
const conInvisible = (s, z) => s.split('').join(z);
const conParecidas = (s) => s.replace(/[aeoicpxy]/g, (l) => PARECIDAS[l]);
const BASE_UNICODE = ['5555 1234', 'ig: villa_lago', 'gmail: ana.perez', 'ana.perez@gmail', 'wa.me/50255551234', 'www.casa.com', 'telegram villa_lago', 'mi correo es ana.perez90'];
const CORREOS_RAROS = ['ana.perez{at}gmail', 'ana.perez<at>gmail', 'ana.perez﹫gmail', 'ana.perez a r r o b a gmail', 'anaperez90 gmail', 'anaperez90 (gmail)',
	'anaperez90 [hotmail]', 'correo = anaperez90', 'correo -> anaperez90', 'correo => ana.perez', 'mi correo, anaperez90', 'email: ana_perez', 'ana.perez 4rr0b4 gmail'];
const ENLACES = ['is.gd/abc', 'rb.gy/abc', 'goo.gy/x1', 'shorturl.at/abc', 'tiny.cc/abc', 'bit.ly/3abcd', 'casa.me/x', 'link.to/x', 'mi.co/x', 'ab.link/x', 'bit ly/3abcd',
	'bit. ly/3abcd', 'wa . me / 5025555', 'w a . m e', 't.me/villalago', 'm.me/villalago', 'linktr.ee/villalago', 'whatsapp com/send'];
// Un teléfono con forma de fecha: con un año que no es cercano (no es fecha, en ningún contexto), o con un código de país,
// «+» o «00» delante (aunque el año sí sea cercano), con cada separador.
const FECHAS_LEJANAS = ['23-12-2015', '23/12/2015', '23.12.2015', '31-12-2045', '22.11.2034', '2015-12-23'];
const FECHAS_CERCANAS = ['23-12-2025', '23/12/2026', '23.12.2027', '2026-12-23', '2025-2026', '22:00 - 06:00', '20/12'];
const CODIGOS_DELANTE = ['+502 ', '+502', '(502) ', '502 ', '00502 ', '+ 502 ', '+1 ', '+52 ', '0052 ', '+(502) '];
// Un celular partido en «4 cifras + hora o día/mes» («mi cel 5555 12:34», «5555 12/11»), con cada separador y con código.
const HORAS_TEL = ['12:34', '20:15', '23:59', '07:05', '12/11', '31/12', '30/04'];
const ANTES_HORA = ['mi cel 5555 ', 'llámame al 4123 ', 'whatsapp 5555-', 'tel 5555.', 'cel 5555, ', '+502 5555 ', '502 5555 ', 'mi tel 55 55 ', 'call 3055 55 ', '5555 '];
const PALABRAS_502 = ['plus five zero two 5555', 'más cinco cero dos', 'mas cinco cero dos 5555', 'plus 5 0 2'];
// Normales GENERADAS: días/mes con su hora y listas de días/mes, en español y en inglés, en los formatos que se escriben.
const DIAS_NORMALES = ['24/12', '31/12', '1/1', '15/6'], DIAS_EN = ['12/24', '12/31', '1/1', '6/15'], HORAS_NORMALES = ['14:30', '15:00', '11:00', '9:45'];
export const NORMALES_GENERADAS = [...new Set([
	...DIAS_NORMALES.flatMap((d) => HORAS_NORMALES.flatMap((h) => [`Check-in ${d} ${h}`, `Llegamos el ${d} ${h}`, `llegada ${d} a las ${h}`, `${d} ${h}`, `Salida ${d}, ${h}`])),
	...DIAS_EN.flatMap((d) => ['2:30pm', '11am', '15:00'].flatMap((h) => [`arrive ${d} ${h}`, `check-out ${d} at ${h}`, `We arrive ${d} ${h}`])),
	...['24 dic', '31 dic', '1 ene', 'Dec 24'].flatMap((d) => HORAS_NORMALES.map((h) => `${d} ${h}`)),
	...[['24/12', '25/12', '26/12'], ['30/12', '31/12', '1/1'], ['12/24', '12/25', '12/31']].flatMap((l) => [`Las noches ${l.join(', ')}`, `Fin de año ${l.slice(0, -1).join(', ')} y ${l.at(-1)}`, `(${l.join(', ')})`, `Nights ${l.slice(0, -1).join(', ')} and ${l.at(-1)}`, `Del ${l[0]} - ${l[2]}`]),
	...[['24/12', '26/12'], ['31/12', '2/1']].flatMap(([a, b]) => [`Fechas especiales: ${a} - ${b}`, `del ${a} al ${b}`, `${a} to ${b}`, `Temporada ${a} - ${b}: Q1,800`]),
	...['llámame en 2027 el 24/12', 'Llámanos 2027 a las 15:00', 'call me in 2027 at 15:00', 'Atención tel. 9:00 a 17:00', 'Celular 8:00-17:00', 'whatsapp 22:00 - 07:00', 'Contacto: 24/12 – 26/12'].map(alAnio),
	...['Silencio 22:00 - 06:00', 'Música 20:00-23:00', 'Horario de silencio: 22:00 – 07:00', 'Quiet hours 22:00 to 07:00'].flatMap((x) => [x, `Reglas: ${x}.`])
])];

export const EVASIONES_GENERADAS = [...new Set([].concat(
	...TELEFONOS.flatMap((t) => PALABRAS_NUMERO.flatMap((w) => [`${w} ${t}`, `${w}: ${t}`, `${t} ${w}`, `mi cel, ${w} ${t}`, `my phone, ${w} ${t}`].flatMap(variantes))),
	...USUARIOS.flatMap((u) => REDES.flatMap((r) => ANTES_RED.flatMap((a) => ENTRE.map((e) => `${a}${r}${e}${u}`)).flatMap(variantes))),
	...CON_CODIGO.flatMap((t) => [t, ...PALABRAS_NUMERO.flatMap((w) => [`${w} ${t}`, `${w}: ${t}`, `${t} ${w}`])].flatMap(variantes)),
	...FECHAS_TEL.flatMap((f) => PALABRAS_TEL.flatMap((w) => [`${w} ${f}`, `${w}: ${f}`, `${f} es mi ${w}`, `${f} (${w})`]).flatMap(variantes)),
	...BASE_UNICODE.flatMap((b) => [...INVISIBLES.map((z) => conInvisible(b, z)), ...ESPACIOS.map((e) => b.replace(/ /g, e)), conParecidas(b), conParecidas(b).toUpperCase(), b.replace(/i/g, 'İ')]),
	...FECHAS_LEJANAS.flatMap((f) => [f, `escríbeme al ${f}`, `al ${f} me encuentras`, `whatsapp ${f}`, ...CODIGOS_DELANTE.map((c) => `${c}${f}`)].flatMap(variantes)),
	...FECHAS_CERCANAS.flatMap((f) => [...CODIGOS_DELANTE.map((c) => `${c}${f}`), ...CODIGOS_DELANTE.map((c) => `whatsapp ${c}${f}`)].flatMap(variantes)),
	...ANTES_HORA.flatMap((a) => HORAS_TEL.map((h) => `${a}${h}`)).flatMap(variantes),
	// Un sustantivo de teléfono con días/mes u horas pegados, y una palabra de teléfono + 4 cifras + conector + hora o día/mes.
	...['cel ', 'tel: ', 'whatsapp ', 'mi número ', 'contacto ', 'my number ', 'phone: '].flatMap((w) => ['22:15 y 12:45', '22:55, 12:34', '22/12 12:31', '22/12 y 12/31', '22:12 y 12:31', 'es el 22/12 12:31', 'is 12/22 12:31', 'a las 22:12', '22:00 12:30'].map((h) => `${w}${h}`)).flatMap(variantes),
	// Una palabra de teléfono con un día/mes y una hora no redonda, o 4 cifras, o tres días/mes seguidos.
	...['llámame ', 'llámame el ', 'wa: ', 'wsp ', 'whats ', 'call me ', 'text me ', 'mi cel es el ', 'my number is ', 'escríbeme: '].flatMap((w) => ['22/12 12:31', '12/22 12:31', '22/12 a las 12:31', '22/12 y 1231', '2/2 1/2 3/1', '5/5, 5/5, 1/2 y 3/4'].map((h) => `${w}${h}`)).flatMap(variantes),
	...['cel 5555', 'mi número es 5512', 'whatsapp 4123', 'llámame al 5555', 'escríbeme 5555', 'call me 5555'].flatMap((w) => [' a las 12:34', ' y 12:34', ' hasta 12:34', ' el 12/12', ' del 12/3', ' to 12:34', ', 12:34', ' at 12:34'].map((h) => `${w}${h}`)).flatMap(variantes),
	...['escríbeme al ', 'llámame ', 'whatsapp ', 'call me at ', 'mi cel: '].flatMap((w) => ['21:12 y 23:45', '23:59 - 12:34', '21:00, 23:41', '22:13 23:45'].map((h) => `${w}${h}`)).flatMap(variantes),
	...[...CORREOS_RAROS, ...ENLACES, ...PALABRAS_502].flatMap((x) => [x, `mira: ${x}`, `look ${x} ok`].flatMap(variantes))
).map(alAnio))];
