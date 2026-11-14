# Revisión antes de unir

Cada renglón es un error que ya pasó en este proyecto y la revisión que lo evita. Claude la recorre
antes de unir cualquier cambio; lo que no aplica se salta, lo que aplica se hace. Un error nuevo se
agrega aquí en el mismo cambio que lo corrige.

## 1. Lo que corre solo (no se une si falla)

| Revisión | Cómo |
|---|---|
| Sintaxis de todo el código y pruebas de lógica | `npm test` |
| Reglas de Firestore y Storage (quién lee, quién escribe, qué se bloquea) | `npm run test:reglas`, siempre que se toquen `firestore.rules`, `storage.rules`, la reserva por noche, el chat o una subida de fotos |
| La reserva por noche de punta a punta, con cada rol entrando de verdad | `npm run entorno` y `npm run recorrido`, siempre que se toque la reserva, el chat, Solicitudes, la ficha del inmueble o las reglas |
| Lo mismo en GitHub, en cada pull request | `.github/workflows/pruebas.yml`: se espera a que termine en verde antes de unir |

## 2. Probar de verdad

| Error que pasó | Revisión |
|---|---|
| Se probó sobre una versión vieja del sitio y el resultado engañó. | `npm run build` justo antes de probar `dist/`. |
| «Pago recibido» se dio por probado con dos pasos sueltos; el panel lo mandaba junto y las reglas lo rechazaban. | Se prueba el camino real que usa la persona, no una imitación. En un lote, las reglas ven el estado anterior. |
| Al confirmar una reserva no salía el correo al cliente: el recorrido imitaba al panel y nunca pasó por ese botón. | El recorrido usa los botones reales del panel y revisa los correos que habrían salido. |
| Una foto ya subida se podía reemplazar (la regla decía «crear», pero no exigía que no existiera). | En reglas de Storage, «crear» lleva `resource == null`; probar también reemplazar y borrar. |
| Una regla de precios con listas pasó la prueba con 1 elemento y se cayó con 20: las reglas cuentan hasta 1000 operaciones por pedido. | Probar cada regla con el caso más grande que permite (y uno más), y con números enteros y con decimales (el panel guarda los enteros como enteros). |
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
| La ficha de la casa y el importador guardaban con revisiones distintas: el importador pasaba a venta una casa con huéspedes, dejaba su dirección privada, creaba casas por noche sin dueño y no ponía al día `porNoche`. | Lo que se revisa antes de guardar un registro vive en una función (`revisarCasa`) y la usan todas las entradas; después, el mismo enlace (`asignarDueno`). |
| Usuarios del equipo se creaban con una contraseña escrita a mano y los dueños sin ella, con dos códigos. | Una sola pieza para crear cuentas (`acceso.js`), sin contraseñas escritas. |
| La parte del asesor tenía dos números (Reportes y cotizaciones) y la cotización caía a 5 % fijo sin %. | Un número de negocio, una fuente (`loadReglas`, `comisionDe`). |
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
| Storage contaba como «equipo» a cualquier usuario activo: un dueño con acceso al panel podía listar el bucket (las carpetas de los chats son las llaves de las reservas) y cambiar o borrar fotos del sitio. | «Equipo» es rol administrador o asesor, igual en Firestore y Storage; cada carpeta de comprobantes con su regla; probar con un dueño. |
| El dueño podía bajar su precio sin bajar el público (la comisión de EQ sale de su parte), quitar el margen del público o crear su reserva con montos mínimos. | Lo que el dueño escribe y toca dinero cuadra en la regla con el otro documento (`getAfter`) y tiene piso; el panel escribe los dos en una transacción. |
| Al cambiar el dueño de una casa por noche solo pasaban sus reservas: las solicitudes y los chats seguían con el anterior y el cliente recibía sus datos de pago. | Al mover un registro a otro dueño, mover todo lo que cuelga de él y lleva su id (reservas, solicitudes, chats), con prueba en el recorrido. |
| Soltar o eliminar al dueño de una casa por noche con huéspedes por venir la dejaba sin dueño. | La misma guardia (`porVenir`) en cada camino que suelta o borra (ficha de la casa, de la persona, importador), antes de escribir nada. |
| «Mis propiedades» reescribía bloqueos, mínimos, tarifas y huéspedes enteros, en tres escrituras separadas. | Cada acción del dueño se aplica sobre lo guardado ahora, en una transacción, y escribe solo lo que cambió. |
| El estado de cuenta de Rentas agrupaba por el dueño de hoy de la casa, y editar una reserva pasada se la pasaba al dueño nuevo. | Un registro que ya pasó conserva a quien lo ganó (su `propietarioId`); agrupar por el dato del registro, no por el de hoy. |
| Las casas por noche tomaban el asesor del dueño, y con él ese asesor leía teléfonos de huéspedes, reservas y precios del dueño. | Un permiso que se hereda por un campo (`agentId`): revisar a quién le abre qué en cada colección; migrar también lo que ya lo copió. |
| Listas guardadas enteras con lo leído al abrir (bitácora del dueño, su lista de casas, el contenido del sitio). | Agregar con `arrayUnion`; cambiar sobre lo guardado ahora, en una transacción y solo lo que cambió. |
| El piso de la parte del dueño tomaba cualquier precio por fechas, también uno de otro año puesto a propósito. | Un piso de dinero se calcula solo con lo que aplica a ese registro (sus fechas); probar con el truco. |
| Una regla nueva que exige un dato (el asesor del formulario) rechazaba lo que mandan las páginas publicadas antes. | Antes de exigir un dato en una regla, ver quién lo manda hoy (páginas ya publicadas) y publicar el sitio antes que las reglas. |
| Un número de negocio se unificó cambiando el valor que ya usaban (la parte del asesor, la comisión de renta de un cliente). | Al unificar, se conserva el valor de antes y se muestra para que el administrador lo confirme; nada cambia de número en silencio. |
| El aviso de un formulario mandaba al equipo lo que traía la petición. | Una función que avisa lee el registro guardado por su id; no repite lo que le mandan. |
| Entre publicar el código y las reglas, dar acceso a un dueño de venta le habría abierto su ficha y el precio de su casa con las reglas de antes. | Recorrer el estado intermedio (código nuevo, reglas viejas): lo que no es seguro ahí se bloquea hasta que las reglas estén publicadas (`reglasNuevas`). |
| Guardar la ficha de una casa abierta desde antes la reescribía entera con lo leído al abrirla: liberaba las noches que el socio había confirmado mientras tanto (reserva doble), deshacía el precio que el dueño cambió en «Mis propiedades» y borraba la difusión; el importador hacía lo mismo con `vacacional`. | Un documento que escriben varias pantallas no se reemplaza: se guarda solo lo que cambió quien guarda, sobre lo guardado ahora, en una transacción (`guardarCambios`). Probar con la ficha abierta mientras otra pantalla escribe (`recorrido.mjs`). |
| Un segundo «Guardar» sin recargar, después de cambiar el dueño, borraba el acuerdo recién guardado: comparaba con lo leído al abrir. | Después de guardar, lo guardado es el nuevo punto de partida (datos, dueño, acuerdo, operación). Probar dos «Guardar» seguidos sin que el primero recargue. |
| Guardar una ficha abierta desde antes borraba el resumen que otra pantalla acababa de crear, y quedaban dos. | Al reemplazar un documento, lo que escriben otras pantallas se vuelve a leer justo antes de guardar; un dato «uno por persona» se asegura al escribirlo (se borran los demás). |
| El dueño de una casa en venta podía, por regla, crear reservas y escribir en chats de esa casa. | Cada permiso nuevo de un rol se revisa en TODAS las colecciones donde ese rol escribe, no solo en la pantalla que se cambió. |
| El socio podía cancelar por escritura directa una reserva ya pagada o ya empezada: la comisión salía de la mora sin alerta (la pantalla lo escondía, la regla no). | Lo que esconde la pantalla en algo que toca dinero, la regla lo exige con datos que el socio no controla (el chat guardado en la reserva, la fecha de llegada), con pruebas negativas y un control positivo. |
| Solicitudes del dueño se caía entera si una de sus casas cambió de dueño (leía mensajes que la regla ya le niega, todo en un `Promise.all`); su comprobante de una reserva pasada subía la foto pero no se guardaba. | Lecturas de varias cosas a la vez: cada una con su `catch`, y solo las que la regla deja. Storage y Firestore piden lo mismo para el mismo dato. |
| El chat aceptaba un título libre y el correo «Recibimos tu solicitud» lo repetía al correo que escribiera cualquiera. | Un correo a un tercero no lleva texto que puso quien llama: sale de lo guardado (la casa) y con límite por IP. |
| Un asesor sin «orden» desaparecía de Usuarios, Propiedades, Propietarios y Leads (`orderBy` deja fuera a quien no tiene el campo). | `orderBy` solo en campos que siempre están; si no, se ordena en el navegador (`porOrden`). |
| El asesor sin asesor vinculado filtraba con `''` o `'-'` y la regla esperaba `'(sin asesor)'`: error en vez de lista vacía. | El valor «sin asesor» es uno solo (`SIN_ASESOR`) en el panel y en las reglas. |
| El socio podía confirmar el chat, mandar sus datos de pago y cobrar sin crear la reserva (sin comisión), o cancelar la solicitud con la reserva viva; «ya pagó» dependía solo de lo que él marcaba, y podía inventar otro chat para la misma solicitud. | Un estado que depende de otro registro se exige en el mismo lote (`getAfter`); lo que prueba un pago lo marca quien paga (el cliente); lo que debe ser único se asegura con un documento que solo se crea una vez. |
| El índice «un chat por solicitud» se podía crear para una solicitud de antes con un chat inventado; el socio podía cancelar solo la reserva (el cliente seguía viendo los datos de pago) y el aviso al equipo dependía del panel. | Lo que asegura unicidad nace en el mismo lote que lo que asegura (y los registros de antes los completa el administrador); una cancelación exige que todo lo que la muestra cambie en el mismo lote; un aviso que importa sale de un control del servidor, no solo de la pantalla. |
| Una regla que comparaba el título del chat con el de la casa rechazaba solicitudes de páginas publicadas antes, y el sitio se tragaba el error. | No exigir en una regla un dato que una página vieja manda distinto; todo fallo que deja al cliente a medias se le dice, con otra vía de contacto. |
| Un asesor podía crear o cambiar reservas, resúmenes de dueños de otro asesor, la bitácora y las fotos de casas de otros, y pasar su casa a «por noche» con su agentId. | Cada colección: ¿quién la escribe en la pantalla? La regla da eso y nada más (admin, o el asesor de ESA casa o persona). |

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
| El separador de las migas era blanco al 30 % también sobre fondo blanco (invisible en la ficha). | Un color pensado para un fondo oscuro se limita a ese fondo (`.hero`); mirar cada pieza en fondo claro y oscuro. |
| En la landing VIP a 390 el WhatsApp flotante repetía el de la barra fija, y los datos de la casa dejaban una celda sola. | Un control, una vez por pantalla; las rejillas de datos sin celdas sueltas con cualquier cantidad. |
| Galería VIP con un bloque vacío bajo tres miniaturas (1280) y una celda suelta (390). | Rejillas con número variable de elementos: probar 2 a 14 fotos sin huecos (`celdaGaleriaVip`, `test-sitio.mjs`). |
| Una etiqueta de precio se salía 11 px a 390 (`minmax(140px)` y `nowrap`); el WhatsApp flotante tapaba el enlace «VIP» del pie; el texto chico dorado no se leía sobre la foto; el selector de orden medía 42 px. | Medir a 390 y 1280: nada se sale, nada fijo tapa un enlace, texto sobre foto con velo, toques de 44 px. |
| La estancia mínima salía dos veces en la caja de reserva; «Huéspedes» y «Huéspedes máximo» para el mismo dato. | Un dato, un texto, un lugar en la pantalla. |
| El carrusel de la portada ponía sus fotos en fila (1560 px a 390): en iOS se podía arrastrar de lado. | Lo que es más ancho que la pantalla a propósito se recorta en su contenedor (`.hero`). |
| El orden por precio y los filtros mín./máx. comparaban Q con US$ (Q 970,000 salía arriba de US$ 378,200). | Lo que compara montos de monedas distintas pasa por `enUSD` (un solo `TIPO_CAMBIO`, formato.js); los campos dicen su moneda. |
| Los formularios aceptaban «ana@» (solo se revisaban nombre y teléfono). | Cada dato con su regla al entrar: el correo con `correoValido` (formato.js), la misma en el sitio y en las funciones. |
| El horario decía 5 p. m. en español y 6 p. m. en inglés: se guardaba dos veces. | Un dato que solo cambia de idioma se escribe una vez y el otro idioma se genera (`horarioEn`). |
| Las tarjetas bajaban fotos de 1920 px para mostrarlas a 282 px (la revisión se hizo con un build local, donde el CDN estaba apagado). | Toda foto con `imgFoto` (srcset del CDN también en local; `serve.mjs` redirige); medir el peso de cada página, no solo verla. |
| Cada página bajaba la fuente de íconos entera (300 KB) para usar ~70. | La fuente del sitio lleva solo sus íconos (`scripts/fuente-iconos.mjs`); `test-sitio.mjs` revisa que no falte ninguno. |
| Con «reducir movimiento» del sistema seguían las animaciones y los carruseles avanzaban solos, sin pausa. | Animaciones y avance solo apagados con `prefers-reduced-motion`; todo carrusel que avanza solo se pausa con el cursor y el foco. |
| En la landing VIP a 390 la barra fija repetía los botones de la portada. | La barra fija aparece cuando el botón de la portada sale de la pantalla y se esconde junto al formulario. |
| «US$ 350,000.00» en precios de propiedades. | Precio de una propiedad con `precioTexto`/`montoPrecio` (sin centavos si es entero y ≥ 1,000); lo que se cobra o se suma, con `dinero`. Una sola función para panel y sitio. |
| «Armar borrador» mandaba a la IA casi toda la propiedad (historial con nombres y uid del equipo, difusión, dueño); «Seguimiento» mandaba el teléfono y el correo del lead; la traducción en lote no pasaba por la limpieza. | Una sola salida (`pedirIA`) y una sola limpieza, con lista de lo permitido (`para-ia.js`); lo nuevo que se mande a la IA se agrega ahí, no en cada pantalla. |
| Una casa por noche salía «En venta» en la calculadora (su precio por noche como precio de compra), en las búsquedas contra un presupuesto de compra y en difusión sin «por noche» y con #HomesForSale. | Cada precio con su operación (`precioTexto`, `operacionHashtag`); donde se compara un precio, filtrar por operación. |

## 5b. Programación del panel

| Error que pasó | Revisión |
|---|---|
| Se podía borrar una casa por noche, o pasarla a venta, con huéspedes por venir; al borrarla quedaban sueltos los teléfonos de sus huéspedes. | Antes de borrar o cambiar de tipo un registro, mirar qué depende de él (`porVenir` en reservas.js) y borrar lo privado que cuelga de él. |
| «Mis propiedades» calculaba el precio público con el margen que había al abrir la pantalla. | Lo que pone otra persona (el margen) se vuelve a leer justo antes de calcular con él. |
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
| Un enlace escrito en Contenido (portada: «Propiedades en renta») llevaba a un listado sin casas, y ese listado decía «No encontramos propiedades con esos filtros» sin filtro alguno. | Todo enlace configurable a un listado pasa por `visible`; un listado vacío dice que está vacío y ofrece todas las propiedades y contacto (`test-sitio.mjs`, sitio sin renta). |
| Páginas que se indexan enlazaban zonas que no se indexan («Zona 1 (1)»). | Las pastillas de zona solo enlazan páginas `indexable` (regla `bastante`). |
| El JSON-LD de un artículo sin foto no llevaba imagen. | Sin foto, la imagen del sitio (`seo.imagen`). |
| El contenido escrito con «##» salía como h3 bajo el h1 (salto de nivel en 17 páginas); el aviso de una casa vendida iba con h2 antes del h1. | Los títulos del markdown empiezan en el nivel que les toca (`markdown(…, nivel)`); `test-sitio.mjs` revisa el orden en todas las páginas. |
| En inglés la descripción y el JSON-LD decían solo m². | Medidas en inglés con sus sq ft (`conPiesCuadrados`, formato.js). |
| La ficha por noche cargaba en cada página todos los textos del chat. | Lo que viaja a la página en JSON se filtra a lo que usa ese JavaScript; el chat, solo en /reserva/. |

## 7. Cómo se le responde al usuario

| Error que pasó | Revisión |
|---|---|
| Se afirmó que algo era cierto sin comprobarlo (lo que muestra Google, que un dato no era público, que Claude podía publicar reglas, que algo estaba «verificado»). | Lo comprobado se dice como hecho; lo no comprobado se dice así: «no lo verifiqué». |
| Ante algo que no cuadraba, se explicó cómo saltarlo. | Buscar por qué pasa, decir qué está mal y arreglarlo. |
| Se actuó sobre una suposición de lo que el usuario quiso decir. | Si el mensaje admite dos lecturas, preguntar en una línea antes de programar. |
| Respuestas largas, trabajo que no se pidió, compactar a mano. | Respuesta corta y directa; solo lo pedido; la compactación es automática. |
| Se entregó sin decir qué quedó sin probar. | Cada entrega dice qué se probó, con qué, y qué no. |
| Se quitaron los centavos de los precios ≥ 1,000 sin preguntarle al dueño; él los quiere siempre. | Un cambio de cómo se ve un dato (formato de precio, fecha, moneda) se consulta antes con el dueño. |
| El sitio averiguaba si las reglas nuevas estaban publicadas leyendo un documento de id fijo; cualquiera podía crearlo y hacer que todos los clientes usaran el camino viejo (sin las protecciones). | Una sonda de «¿qué reglas hay?» consulta un id al azar en cada carga, nunca un id fijo que alguien pueda crear. |
| La ganancia de EQ salía de los precios del socio al confirmar: un precio especial puesto después de la solicitud la bajaba; la moneda de la reserva no estaba atada a la solicitud. | Lo que se cobra al cliente sale de lo que se le cotizó (subtotal sin limpieza) y en su moneda; las reglas lo exigen. |
| El orden para publicar decía solo «reglas de la base» y no nombraba Propiedades, Rentas ni Solicitudes. | Una sola lista de pasos (docs/portal-propietarios.md) con las dos reglas juntas y cada pantalla que migra datos. |
