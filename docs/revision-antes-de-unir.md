# Revisión antes de unir

Cada renglón es un error que ya pasó en este proyecto y la revisión que lo evita. Claude la recorre
antes de unir cualquier cambio; lo que no aplica se salta, lo que aplica se hace. Un error nuevo se
agrega aquí en el mismo cambio que lo corrige.

## 1. Lo que corre solo (no se une si falla)

| Revisión | Cómo |
|---|---|
| Sintaxis de todo el código y pruebas de lógica | `npm test` |
| Reglas de Firestore (quién lee, quién escribe, qué se bloquea) | `npm run test:reglas`, siempre que se toquen `firestore.rules`, la reserva por noche o el chat |
| La reserva por noche de punta a punta, con cada rol entrando de verdad | `npm run entorno` y `npm run recorrido`, siempre que se toque la reserva, el chat, Solicitudes, la ficha del inmueble o las reglas |
| Lo mismo en GitHub, en cada pull request | `.github/workflows/pruebas.yml`: se espera a que termine en verde antes de unir |

## 2. Probar de verdad

| Error que pasó | Revisión |
|---|---|
| Se probó sobre una versión vieja del sitio y el resultado engañó. | `npm run build` justo antes de probar `dist/`. |
| «Pago recibido» se dio por probado con dos pasos sueltos; el panel lo mandaba junto y las reglas lo rechazaban. | Se prueba el camino real que usa la persona, no una imitación. En un lote, las reglas ven el estado anterior. |
| Al confirmar una reserva no salía el correo al cliente: el recorrido imitaba al panel y nunca pasó por ese botón. | El recorrido usa los botones reales del panel y revisa los correos que habrían salido. |
| Una foto ya subida se podía reemplazar (la regla decía «crear», pero no exigía que no existiera). | En reglas de Storage, «crear» lleva `resource == null`; probar también reemplazar y borrar. |
| «Cancelar» del socio dejó de funcionar al cambiar de dónde lee sus solicitudes: se corrigió un lugar que usaba el dato y no el otro. | Al cambiar la forma de un dato, buscar **todos** los usos de cada campo que desaparece, y recorrer cada botón de esa pantalla con ese rol. |
| Una función nueva dentro de un control que ya existía podía, al fallar, callar la alerta de siempre. | Lo nuevo que se agrega a un proceso que ya avisa va aislado: su falla se registra y no detiene lo anterior. |
| El panel se probó solo como administrador. | Cada rol que toca el cambio: administrador, asesor, socio y visitante sin sesión. |
| Las pruebas de las reglas vivían en una carpeta temporal y se iban a perder. | Toda prueba que sirvió para confiar en un cambio se guarda en el repositorio. |
| Se quiso forzar o esconder un error para seguir. | El error se entiende y se arregla en su origen; no se tapa. |

## 3. El mismo cambio en todos sus lugares

| Error que pasó | Revisión |
|---|---|
| «Asesor responsable» se quitó en la ficha de la casa y siguió en la del socio. | Buscar el concepto (etiqueta, campo, función) en todo el proyecto y leer su cadena en `docs/mapa-del-sistema.md`. |
| Al quitar el WhatsApp de la reserva, el socio dejó de enterarse de las solicitudes. | Antes de quitar algo: ¿quién dependía de eso? Seguir el dato hasta el final de la cadena. |
| El botón de WhatsApp apuntaba a un cuadro que no existe en casas cerradas. | Probar el cambio en los otros estados del registro (cerrada, pausada, sin datos, VIP). |
| La mora de un socio sacaba del sitio también sus casas en venta. | Un dato que ahora llega a más registros: revisar todo lo que lo lee. |
| Al socio de renta por noche se le pedían impuestos de venta y comisión acordada; una casa por noche se podía marcar VIP (landing sin caja de reserva) y pedía «mantenimiento al mes». | Cada opción que cambia el caso (operación, tipo de dueño, rol): recorrer **todos** los campos, bloques y páginas de esa pantalla y preguntarse cuáles aplican a ese caso. |
| La exclusiva, la comisión y los impuestos se guardaban una vez por persona, aunque se acuerdan por inmueble; la ficha de la persona se cambió cinco veces persiguiendo síntomas. | Antes de agregar un campo: ¿de qué es este dato en la realidad (de la persona, del inmueble, del negocio)? Si varios arreglos seguidos tocan la misma pantalla, parar y revisar el modelo. |
| Al mover datos ya guardados a otro lugar se podía escribir encima de lo nuevo o borrar lo que aún no tenía destino. | Migración: nunca escribir encima; no tomar «no se pudo leer» por «no existe»; borrar el origen solo de lo que ya quedó en todos sus destinos; probar los casos sin destino. |
| «Socio» era un tipo que se elegía a mano: quien tenía una casa por noche y otra en venta necesitaba dos fichas. | Lo que se deduce de los datos no se pregunta. Antes de agregar un «tipo», ver si un mismo registro puede ser dos a la vez. |
| El socio se escribía tres veces (casa, propietario, usuario). | Lo que ya está guardado no se vuelve a pedir: se elige o se rellena solo. |
| Se programó de nuevo algo que ya existía. | Buscar primero si ya existe (CSS sobre todo) y reutilizarlo. |
| Para crear una casa desde la ficha de su dueño se hizo una ventana corta aparte de la ficha del inmueble: le faltaban fotos, editar y eliminar. | Una sola pieza por cada fin. Si hace falta en otro lugar, se abre ahí la que ya existe (`abrirFicha`), no una versión reducida. |
| Un dueño con casas por noche y en venta tenía dos entradas (panel del socio y portal sin contraseña), y cada una ignoraba la mitad de sus casas. | Una sola entrada por persona; antes de agregar otra, ver si la que existe puede mostrar el caso nuevo. |
| El resumen del dueño recorría solo la lista de la ficha (no las casas que dicen ser suyas), traía una sola exclusiva para todas y «Cómo se anuncia» quedaba vacío porque nadie llamaba a `anuncioDe`. | Un dato por inmueble se calcula por inmueble; buscar quién llama a cada función que arma una pantalla. |
| Las reservas por noche se creaban y cancelaban por dos caminos (Rentas y Solicitudes) con código distinto: las de Rentas no las veía el dueño (sin `propietarioId`) y guardaban el teléfono del huésped donde el dueño lo podía leer; cancelar en Rentas dejaba el chat del cliente «confirmada»; una pestaña vieja reescribía las fechas ocupadas de la casa con su lista. | Una sola pieza por fin (`admin/js/reservas.js`); lo que se deduce de otras fuentes (fechas ocupadas) se recalcula en una transacción con lo leído en ese momento, nunca con la lista de la pantalla. Probar con dos pestañas. |
| Cambiar en Rentas las fechas de una reserva de la web rehacía el monto de la comisión pero no su vencimiento (la mora podía sacar del sitio todas las casas del socio), y el chat seguía con las fechas viejas. | Lo que sale de un dato (comisión, vencimiento, lo que ve el cliente) se recalcula en una sola función, o el dato no se deja cambiar donde no se puede seguir la cadena. |
| Guardar la ficha de un dueño soltaba las casas que eran suyas pero no estaban en su lista y les borraba el acuerdo. | El formulario muestra la verdad (lo que dice la casa); solo se suelta lo que se quitó a mano, y nada se borra antes de que lo principal quedara escrito. |
| El socio podía crear su reserva con la comisión marcada pagada o más baja (las reglas solo miraban el estado). | En lo que crea alguien que no es del equipo, la regla fija los campos y los valores que tocan dinero, con pruebas que intentan saltárselo. |
| La cotización ponía 5 % fijo y Reportes usaba otra cuenta; los meses de renta no coincidían entre pantallas. | Un número de negocio sale de una sola función (`comisionDe`), y con lo de siempre no cambia ningún resultado (probarlo). |
| El dueño de una casa se buscaba de tres maneras y el enlace se escribía de tres: una casa pasaba a otro dueño y seguía en la lista, el resumen y con el acuerdo del anterior; `porNoche` solo se encendía. | Un dato con una sola verdad (la casa); las copias (listas, marcas) las mantiene una sola función que las recalcula, también para apagar. |
| Las solicitudes de reserva contaban como «Leads sin atender» y creaban un cliente «comprador» por huésped. | Un registro que se atiende en otra pantalla se excluye con un solo predicado en todos los conteos (`V.esSolicitudReserva`). |
| «Hoy» se calculaba de tres formas (hora del servidor, de Guatemala y del navegador): de 6 p. m. a medianoche el calendario podía mostrar libre una noche reservada; el WhatsApp del sitio no ponía el código de país que el panel sí. | Antes de escribir un cálculo, buscar si ya existe uno para ese fin y usarlo; si hay dos, dejar uno. |

## 4. Datos y dinero

| Error que pasó | Revisión |
|---|---|
| El WhatsApp del socio se podía leer sin llenar el formulario. | Para cada dato que se guarda o se devuelve: ¿quién lo puede leer? Incluye a quien no tiene sesión. |
| Cualquiera podía listar los archivos de Storage (y con eso, las llaves de las reservas). | Leer uno y **listar** son permisos distintos: revisar los dos. |
| El socio podía leer el teléfono del cliente aunque la pantalla no lo mostraba. | Esconder en pantalla no es proteger: lo que protege es la regla. |
| El socio leía su ficha entera (notas, bitácora interna) para sacar sus datos de pago, y podía cambiar el precio de su casa en venta. | Lo que una persona necesita de sí misma va en un documento hecho para ella (su resumen); lo que no es suyo de cambiar, la regla lo limita al caso (solo casas por noche). |
| El portal del propietario se abría sin sesión con el enlace, y llevaba datos de la persona. | Un dato personal no se abre «con el enlace»: se lee con sesión y regla. |
| El socio podía cancelar después de cobrar, o mandar la dirección sin marcar el pago. | En lo que toca el ingreso: probar también lo que alguien haría para saltárselo. |
| La dirección y el mapa de las casas por noche no salían en la página, pero estaban en el documento público de la base. | Un dato privado no vive en un documento público: va aparte, con su regla, y se revisa lo que la base entrega sin sesión y todo `dist/`. |
| Los teléfonos no llevaban código de país. | Cada dato con un solo formato; pensar en quien escribe desde otro país o con otro caso. |
| Un cambio de reglas se iba a unir sin publicarlas. | Código y reglas van juntos. Las reglas las publica el usuario: Claude no puede. |
| Entre publicar el código y las reglas, dar acceso a un dueño de venta le habría abierto su ficha y el precio de su casa con las reglas de antes. | Recorrer el estado intermedio (código nuevo, reglas viejas): lo que no es seguro ahí se bloquea hasta que las reglas estén publicadas (`reglasNuevas`). |
| Guardar la ficha de una casa abierta desde antes la reescribía entera con lo leído al abrirla: liberaba las noches que el socio había confirmado mientras tanto (reserva doble), deshacía el precio que el dueño cambió en «Mis propiedades» y borraba la difusión; el importador hacía lo mismo con `vacacional`. | Un documento que escriben varias pantallas no se reemplaza: se guarda solo lo que cambió quien guarda, sobre lo guardado ahora, en una transacción (`guardarCambios`). Probar con la ficha abierta mientras otra pantalla escribe (`recorrido.mjs`). |
| Un segundo «Guardar» sin recargar, después de cambiar el dueño, borraba el acuerdo recién guardado: comparaba con lo leído al abrir. | Después de guardar, lo guardado es el nuevo punto de partida (datos, dueño, acuerdo, operación). Probar dos «Guardar» seguidos sin que el primero recargue. |
| Guardar una ficha abierta desde antes borraba el resumen que otra pantalla acababa de crear, y quedaban dos. | Al reemplazar un documento, lo que escriben otras pantallas se vuelve a leer justo antes de guardar; un dato «uno por persona» se asegura al escribirlo (se borran los demás). |
| El dueño de una casa en venta podía, por regla, crear reservas y escribir en chats de esa casa. | Cada permiso nuevo de un rol se revisa en TODAS las colecciones donde ese rol escribe, no solo en la pantalla que se cambió. |

Lo que toca dinero, datos de clientes o reglas de seguridad lleva además una segunda revisión independiente antes de unir.

## 5. Diseño

| Error que pasó | Revisión |
|---|---|
| Tablas más anchas que la página. | Captura a 390 px y 1280 px; ningún scroll de lado. |
| Una caja con scroll propio dentro de una página que ya baja. | Un solo scroll por pantalla. |
| Huecos, datos mal ubicados, la foto más chica que los controles, fichas feas. | Mirar la captura como cliente y arreglar lo que se vea mal, sin esperar a que lo señalen. |
| Datos en texto que se entendían con un ícono; numeración que empezaba en 2. | Íconos donde dan la información; contar que los números empiecen donde deben. |
| Una etiqueta del menú se partía en dos líneas; una ayuda de cinco líneas bajo un campo. | Textos cortos; revisar la captura después de cambiar una etiqueta. |
| El buscador quedaba tapado por la portada y no se podía tocar. | Lo que se ve ¿se puede tocar? Probar el clic, no solo la imagen. |
| Los campos en inglés se veían vacíos y habilitados hasta guardar: parecía que había que llenarlos a mano. | Un campo que el sistema llena solo se llena a la vista, mientras se escribe; no se deja vacío esperando a «Guardar». |
| Una casa por noche decía «Acepta mascotas» dos veces: como amenidad y en su selector de mascotas. | Antes de agregar un campo, buscar si ese dato ya se pide en otro lado; un dato, un solo lugar (`mascotasUnaVez`). |
| En una casa por noche el formulario ofrecía «Vendida», «Terreno» o «Bodega», avisaba que faltaba el precio (ya puesto) y la vista de Google decía «A consultar»; a un terreno se le pedían cuartos y baños. | Al agregar una operación o un tipo, recorrer TODO el formulario con esa opción elegida: opciones de cada selector, avisos de «falta», vistas previas y textos automáticos (`estadosPara`, `tipoAplica`). |
| El cambio de estado en lote y la importación dejaban poner «Vendida» a una casa por noche, aunque el formulario ya no lo ofrecía. | Una regla de datos vive en una sola función (`incoherencia`) y la usan todas las entradas: formulario, lote e importación. |
| La tabla de precios por noche ponía «Al público» antes de los impuestos y no decía cuánto paga el cliente. | Los montos van en el orden en que se suman y terminan en el total que paga el cliente. |
| El botón «Traducir» de una casa por noche mandaba la dirección privada al traductor. | Todo lo que sale a un servicio externo pasa por la misma limpieza que lo que se publica (`paraTraducir`). |
| Las fichas por noche decían «Hasta 1 huésped» y «Estadía mínima» en la descripción mientras los campos decían otra cosa: «Mejorar descripción» copiaba campos al texto. | Un texto generado no copia datos que ya son campos; lo viejo se limpia al publicar (`sinBloquesGenerados`). |
| Carruseles con puntos y tarjetas unas con puntos y otras con «1 / 8». | Carruseles con `nav: false`; la misma pieza (`propertyCard`) para todas las tarjetas. |
| Enlaces y campos de 14 a 38 px en celular (migas, «Leer más», ES/EN, fechas del buscador). | Medir en 390 px que todo lo que se toca mida 44 px o más. |
| Botones de zona con ícono y de tipo sin ícono en el mismo grupo. | En un grupo de enlaces, todos con ícono o ninguno. |
| «Armar borrador» mandaba a la IA casi toda la propiedad (historial con nombres y uid del equipo, difusión, dueño); «Seguimiento» mandaba el teléfono y el correo del lead; la traducción en lote no pasaba por la limpieza. | Una sola salida (`pedirIA`) y una sola limpieza, con lista de lo permitido (`para-ia.js`); lo nuevo que se mande a la IA se agrega ahí, no en cada pantalla. |
| Una casa por noche salía «En venta» en la calculadora (su precio por noche como precio de compra), en las búsquedas contra un presupuesto de compra y en difusión sin «por noche» y con #HomesForSale. | Cada precio con su operación (`precioTexto`, `operacionHashtag`); donde se compara un precio, filtrar por operación. |

## 5b. Programación del panel

| Error que pasó | Revisión |
|---|---|
| «Poner marca de agua» en lote se caía sin hacer nada y «Crear usuario» quedaba deshabilitado al fallar: leían `e.currentTarget` después de un `await` (ya es null). | El botón se guarda en una variable antes del primer `await`; buscar `currentTarget` en lo que se toque. Todo botón que se deshabilita se vuelve a habilitar si falla. |
| «Duplicar» copiaba las noches reservadas y el calendario de Airbnb de la original; eliminar una casa la dejaba en la lista de su dueño. | Al copiar o borrar un registro, recorrer todo lo que cuelga de él (privado, listas de otros documentos, calendario). |

## 6. SEO del sitio público

| Error que pasó | Revisión |
|---|---|
| Páginas de zona con una sola casa, /vip/ y /en/luxury/ «Muy pronto» se indexaban y estaban en el sitemap. | Una página vacía o con poco contenido va `noindex` y fuera del sitemap; la regla vive en `scripts/lib/landings.mjs` y el sitemap sale de la etiqueta robots (`npm test`: `test-sitio.mjs`). |
| El blog enlazaba a `/propiedades/zona-16/`, que no existía. | Los enlaces del contenido pasan por `resolver` (van al listado padre) y el build avisa cualquier enlace interno roto. |
| El pie tenía dos enlaces al mismo destino y otros a listados sin casas («Propiedades en renta», «Rentar»). | Menú, pie y pastillas pasan por `visible` y no repiten destino. |
| «Centro Vivo, zona 1, Zona 1, Guatemala»: la ubicación repetía la zona. | Lugares con `sinRepetir` (una sola regla, por palabras completas). |
| `addressRegion` decía «Guatemala» para todo, también Monterrico. | Departamento con `departamentoDe`; si no se conoce, se omite. |
| Títulos de 68 a 73 caracteres y en inglés «Lot for Sale Guatemala». | Título automático de 60 (`autoSeoTitle`), el guardado como automático se recalcula al publicar. |
| Textos del sitio con «vos» (Revisá, Pedile, Entrás) junto a «tú». | El sitio público usa «tú»: revisar textos nuevos de `i18n.mjs`, plantillas y textos generados. |

## 7. Cómo se le responde al usuario

| Error que pasó | Revisión |
|---|---|
| Se afirmó que algo era cierto sin comprobarlo (lo que muestra Google, que un dato no era público, que Claude podía publicar reglas, que algo estaba «verificado»). | Lo comprobado se dice como hecho; lo no comprobado se dice así: «no lo verifiqué». |
| Ante algo que no cuadraba, se explicó cómo saltarlo. | Buscar por qué pasa, decir qué está mal y arreglarlo. |
| Se actuó sobre una suposición de lo que el usuario quiso decir. | Si el mensaje admite dos lecturas, preguntar en una línea antes de programar. |
| Respuestas largas, trabajo que no se pidió, compactar a mano. | Respuesta corta y directa; solo lo pedido; la compactación es automática. |
| Se entregó sin decir qué quedó sin probar. | Cada entrega dice qué se probó, con qué, y qué no. |
