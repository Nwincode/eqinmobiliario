# Mapa del sistema

Dónde vive cada cosa y qué archivos se tocan juntos. Se lee **antes** de un cambio que cruza
partes del sistema y se actualiza **en el mismo commit** que lo cambia (si no, deja de servir).
Las rutas son desde la raíz del repositorio.

## 1. Las cuatro partes

| Parte | Dónde | Qué es |
|---|---|---|
| Panel | `admin/` | Lo que usan el equipo y los dueños (propietarios y colaboradores). Lee y escribe Firestore con el SDK (`admin/js/firebase.js`). |
| Sitio público | `scripts/` genera `dist/`; `js/` y `css/` corren en el navegador del visitante | HTML estático. Solo lo público de Firestore, por REST. |
| Funciones | `netlify/functions/` y `netlify/lib/` | Correos, IA, disponibilidad, Search Console. Leen Firestore con la cuenta de servicio (solo lectura). |
| Datos y permisos | `firestore.rules`, `storage.rules` | Se publican **a mano** en la consola de Firebase. Unir código y publicar reglas van juntos. |

## 2. Panel (`admin/`)

- `admin/js/app.js`: sesión, permisos y menú (`ROUTES`: cada sección, su ícono y quién la ve).
- `admin/js/views/*.js`: una pantalla por archivo.
  - Inventario: `properties.js`, `importar.js`, `listado.js` (PDF), `difusion.js`.
  - Clientes: `leads.js`, `clientes.js`, `agenda.js`, `propietarios.js` (propietario, socio o colaborador).
  - Renta vacacional: `solicitudes.js` (solicitudes y chat), `rentas.js` (reservas y estado de cuenta).
  - Panel del dueño: `mis-casas.js` («Mis propiedades»: sus casas por noche las edita; las de venta y renta, solo lectura con `resumen-casa.js`).
  - Herramientas: `calculadora.js`, `cotizacion.js`, `ia.js`, `google.js`, `reportes.js`.
  - Sitio web: `content.js` (textos, colores, zonas), `pages.js`, `blog.js`, `agents.js`, `testimonials.js`, `publish.js`, `users.js`, `dashboard.js`.
- Piezas que usan todas las pantallas (cambiar aquí cambia todo el panel):
  - `form.js`: formularios desde un esquema (tipos de campo, `when`, `required`). Tipo `telefono` = código + número. Un bloque `custom` dentro de una lista recibe su elemento.
  - `ui.js`: `h`, `modal`, `toast`, `badge`, `iconoBtn`, `cajaTabla`, `emptyState`.
  - `tablas.js` + `admin/admin.css`: tablas que pasan a fichas bajo 1200 px.
  - `session.js`: usuario, rol (`isAdmin`, `esSocio`, `agentId`, `rolVisible`), `markPending`; del dueño, `cargarMiResumen` y `misCasas`.
  - `duenos.js` (puro): `tieneCasasPorNoche`, `casasDe` y su inversa `duenoDe` (la casa manda: `propietarioId`; la lista de la persona solo para casas que no lo dicen), `conDueno`, `etiquetaDueno`, `exclusivaHasta`, `datosDelDueno`. `enlace-dueno.js`: `asignarDueno`, la única forma de enlazar una casa con su dueño (listas y `porNoche` en una transacción, reservas, solicitudes y chats por venir, acuerdo y resumen del anterior) y `revisarSinDueno` (una casa por noche con huéspedes por venir no queda sin dueño).
  - `reservas.js`: la única pieza que crea, cancela y borra reservas por noche, marca lo pagado y escribe sus fechas en la casa (transacción; `cambioDeReserva` en `js/calc-vacacional.js`), con la solicitud y el chat cuando los hay. La usan `rentas.js` y `solicitudes.js`. `ficha-casa.js`: ficha corta de una casa (`fichaCasa`, `datosDe`, `estadoExclusiva`). `acceso.js`: la única forma de crear una cuenta del panel (`crearUsuarioEquipo` desde Usuarios; `darAcceso` / `ponerAcceso` para un dueño), sin contraseñas escritas a mano.
  - `ui.js` `hoy()` = el día de Guatemala (`V.hoy`); `elegirOpcion` (un toque para elegir un motivo).
  - `crm.js`: cargas que respetan el rol (`loadPropietarios`, `loadPropiedades`, `loadReservas`, `loadReglas`: la regla general y la única «parte del asesor», que usan Reportes y la liquidación de las cotizaciones) y `comisionDeNegocio` (Reportes; venta en %, renta en meses).
  - `formato.js`: dinero (cuentas, con centavos), precio de una propiedad según la operación (`precioTexto` / `montoPrecio`: sin centavos si es entero y ≥ 1,000; `ui.js` y `scripts/lib/util.mjs` `formatPrice` son el mismo), m², teléfonos, WhatsApp. **También lo usan el generador y las funciones.**
  - `cambios-casa.js` (puro): qué cambió la ficha (`cambiosEntre`), ponerlo sobre lo guardado ahora (`aplicarCambios`), el historial de estado y de precio (`historialCon`) y `huespedesMaxDe`. `privado-casa.js`: la única escritura de `privado/socio` y `privado/llegada` (`guardarPrivadoVacacional`, solo los campos que se pasan).
  - `para-ia.js` (puro): lo único que sale a la IA o al traductor; `pedirIA` y `traducirTexto` (`ia.js`) lo aplican a todo.
  - `estados.js`: estados de una propiedad y qué pasa en el sitio con cada uno.
  - `pendientes-reglas.js` + `pendientes.js`: «Faltan» (datos por completar).
  - `seo-auto.js`, `seo.js`, `reglas.js` (sin IA) e `ia.js` (con IA; tareas en `netlify/lib/tareas.mjs`).

## 3. Sitio público

- `scripts/build.mjs`: lee los datos (`DATOS=seed` usa el archivo de ejemplo; `DIST_DIR` cambia la carpeta de salida), escribe las páginas, sitemap, feeds, `llms.txt` y `_redirects`, y al final revisa los enlaces internos.
- `scripts/lib/landings.mjs`: **qué listados existen y cuáles se indexan** (general, operación, tipo, VIP, zona, zona + operación, zona + tipo + operación, en los dos idiomas), sus textos automáticos, el bloque de precios y los enlaces (`crearEnlaces`: esconder vacíos, llevar al padre).
- `scripts/lib/enlaces.mjs`: revisa que cada enlace interno de `dist/` lleve a algo.
- `scripts/lib/templates.mjs`: el HTML de cada página (`layout`, `listingPage`, `propertyPage`, `leadForm`, `reservaBox`, `reservaPage`…).
- `scripts/lib/i18n.mjs`: **todos** los textos, en español e inglés, y las rutas de cada idioma. El sitio público usa «tú».
- `scripts/lib/util.mjs`: `lugarDe` (lugar sin repetir) y `departamentoDe` (tabla de municipios → departamento).
- `scripts/lib/assets.mjs`: empaqueta CSS y JS y quita el CSS sin uso (las clases que solo crea JavaScript van en `SAFELIST`).
- En el navegador:
  - `js/site.js`: formularios (guarda el lead), filtros, seguimiento.
  - `js/calc-vacacional.js`: fórmulas de la renta por noche y filtro de contacto del chat. **Lo usan el sitio, el panel y las funciones.**
  - `js/vacacional.js`: calendario y desglose de la ficha por noche.
  - `js/reserva-chat.js`: página «Tu reserva» y su chat.
  - `js/calc-renta.js` + `js/calc-renta-ui.js`: calculadora de inversión.
- CSS: colores solo en `css/tema.css`; lo del sitio en `css/site.css`; botones en `css/botones.css`.

## 4. Funciones (`netlify/functions/`)

| Función | Cuándo corre | Qué hace |
|---|---|---|
| `aviso-lead.mjs` | Al enviar un formulario | Correo al equipo y al asesor, con el lead guardado (lo vuelve a leer por su id; recién creado). |
| `aviso-chat.mjs` | Al reservar y al escribir en el chat | Correo al socio o al cliente; lo decide `netlify/lib/avisos-chat.mjs`. |
| `disponibilidad.mjs` | Al abrir una ficha por noche | Noches ocupadas, precios al día, pausa por mora. |
| `solicitudes-sin-respuesta.mjs` | Cada hora | Al equipo: lo que el socio no respondió y las cancelaciones. A las 7 a. m., comisiones del día a cada socio. |
| `comisiones-vencidas.mjs` | Cada hora | Vuelve a publicar si cambió qué socios están en mora. |
| `resumen-diario.mjs` | Cada mañana | Resumen por asesor. |
| `ia.mjs`, `gsc.mjs`, `resenas-google.mjs`, `automatizaciones.mjs`, `deploy-succeeded.mjs` | Desde el panel o al publicar | IA, Search Console, reseñas, pruebas de automatización. |

Compartido: `netlify/lib/correo.mjs` (envío y plantilla), `firestore.mjs` (lecturas), `auth.mjs`, `comisiones.mjs`.

## 5. Datos (Firestore)

| Colección | Qué guarda | Anidado |
|---|---|---|
| `properties/{id}` | La propiedad (público si `publicado`). `propietarioId` = su dueño, socio o colaborador. Varias pantallas escriben partes distintas (ver «Crear, editar o eliminar una propiedad»). | `privado/socio` (precio del socio, margen, iCal; el contacto del socio vive en su ficha), `privado/llegada` (dirección y mapa de una casa por noche), `privado/acuerdo` (exclusiva, comisión e impuestos acordados con el dueño para ese inmueble), `bitacora/` |
| `propietarios/{id}` | Una ficha por persona: contacto, `tipo` (propietario o colaborador, con `empresa`), `agentId` (el asesor que la ve) y la lista `propiedades`. Sin exclusiva ni comisión: eso es de cada inmueble. Es socio de renta vacacional quien tiene casas por noche (`porNoche`; antes `tipo: socio`): `datosPago`, `email`. `acceso` = copia de si entra al panel. **Solo el equipo la lee.** | — |
| `leads/{id}` | Lo que llega de los formularios. En una reserva: `reserva{}` y `solicitud{}`; esas no cuentan como interesados del CRM (`V.esSolicitudReserva`). **El socio no lo lee.** | — |
| `chats/{token}` | Una reserva vista por el cliente: resumen, `estado`, vistos. El id es la llave del enlace. Del equipo solo entra el administrador (con el dueño de la casa). | `mensajes/` (`de`, `texto`, `tipo`: pago, llegada, foto; el de llegada lleva `direccion` y `mapa`) |
| `reservas/{id}` | Una reserva por noche (de la web o hecha a mano en Rentas) y, si vino de la web, su comisión (la ganancia de EQ). Con el `propietarioId` de su casa al nacer (la ve su dueño); la que ya terminó se queda con quien la ganó aunque la casa cambie de dueño (estado de cuenta de Rentas). Sin teléfono ni notas: los de una reserva a mano van en `properties/{casa}/privado/reserva-{id}` (solo el equipo). | — |
| `clientes`, `actividades`, `requerimientos`, `cotizaciones`, `emisoresAsesor` | CRM y cotizaciones. | — |
| `agents`, `testimonials`, `pages`, `posts` | Contenido del sitio. | — |
| `portalPropietarios/{id}`, `comentariosPropietarios` | Resumen del dueño (lo único suyo que lee de sí mismo: nombre, tipo, correo, teléfono, datos de pago y cómo va cada casa en venta o renta) y su respuesta al anuncio. | — |
| `users/{uid}` | Rol (`admin`, `asesor`, `socio` = dueño: propietario o colaborador), `agentId`, `propietarioId`. | — |
| `settings/site`, `settings/private`, `settings/crm`, `settings/cotizacion`, `meta/publish` | Configuración y aviso de cambios sin publicar. | — |

Storage (`storage.rules`): fotos por dirección (las sube, cambia, borra y lista solo el equipo: administrador o asesor; un dueño no); `chats/{token}/…` = comprobantes del cliente; `comprobantes/{reserva}/…` = comprobante de la comisión que sube el dueño de esa reserva. Los comprobantes solo se agregan. Pruebas: `npm run test:reglas`.

## 6. Cadenas: qué se toca junto

Cada cadena va en el orden en que conviene revisarla.

**Teléfono** → `admin/js/formato.js` (formato y validación) → `admin/js/form.js` (campo `telefono`) → `scripts/lib/templates.mjs` `leadForm` → `js/site.js` (arma y valida) → `scripts/test-telefono.mjs`.

**Un texto del sitio** → `scripts/lib/i18n.mjs` (español **e** inglés). Si lo usa JavaScript de la ficha por noche o del chat, la clave debe empezar con `vac` (así viaja a la página).

**Un campo nuevo de la propiedad** → `admin/js/views/properties.js` (`schema` y guardado) → `admin/js/pendientes-reglas.js` si es obligatorio → `scripts/lib/templates.mjs` si se muestra → `admin/js/seo-auto.js` y JSON-LD si importa a Google → `admin/js/views/importar.js` y `docs/formato-inventario-propiedades.md` si entra por CSV → `firestore.rules` solo si lo escribe alguien que no es del equipo.

**Dueño de una casa (propietario, socio, colaborador)** → quién es: `admin/js/duenos.js` `duenoDe` / `casasDe` (la casa manda; la usan Rentas, cotización, tablero, resumen del dueño, exclusivas y `netlify/lib/resumen.mjs`) → enlazar: `admin/js/enlace-dueno.js` `asignarDueno` (única; la llaman `views/properties.js` al guardar y al duplicar, `views/importar.js` y `views/propietarios.js` `vincularCasas` al guardar o eliminar la ficha: la casa sale de la lista de cualquier otro, `porNoche` se recalcula con `tieneCasasPorNoche` (la ficha de la persona no escribe su lista ni `porNoche`), sus reservas, solicitudes y chats por venir pasan al nuevo, el acuerdo del anterior no pasa al nuevo y su resumen se rehace; una casa por noche con huéspedes por venir no queda sin dueño: `revisarSinDueno`, antes de escribir nada) → `admin/js/views/propietarios.js` (`tipo`, lista de casas: `elegirCasa` es el selector con buscador y una ficha por inmueble (`fichaCasa`); crear y editar abren la ficha del inmueble en una ventana (`abrirFicha`)) → acceso al panel desde su ficha (ver «Panel del dueño») → `firestore.rules` (`esSocioDe`) → `scripts/build.mjs` (mora: solo casas por noche).

**Precio de la renta por noche** → `js/calc-vacacional.js` (única fórmula) → `admin/js/views/properties.js` (`vacacionalPublico` dentro de `guardarCambios`) y `mis-casas.js` (precio del socio → precio público, en una transacción con lo guardado ahora y solo lo que cambió; los dos escriben `privado/socio` con `guardarPrivadoVacacional` y los huéspedes con `huespedesMaxDe`) → `firestore.rules` (`preciosCuadran`: lo que cambia el dueño, su precio y el público cuadran con el margen; hasta 10 precios por fechas, `MAX_TARIFAS` en la ficha; con más, de antes, el dueño solo quita) → `js/vacacional.js` (desglose) → `netlify/functions/disponibilidad.mjs` (precio al día) → `scripts/test-vacacional.mjs`.

**Reserva por noche, de punta a punta** → `scripts/lib/templates.mjs` `reservaBox` → `js/vacacional.js` (fechas, código) → `js/site.js` (guarda el lead) → `js/reserva-chat.js` (`crear` el chat, página «Tu reserva») → `netlify/functions/aviso-chat.mjs` + `netlify/lib/avisos-chat.mjs` → `admin/js/views/solicitudes.js` (chat, Confirmada, No se dio, Pago recibido, Cancelar) y `admin/js/views/rentas.js` (reservas a mano, cancelar, estado de cuenta) → las dos por `admin/js/reservas.js` → `netlify/functions/solicitudes-sin-respuesta.mjs` → `firestore.rules` (`leads`, `chats`, `mensajes`, `reservas`) y `storage.rules` (`chats/`).

**Reservas (crear, cancelar, pagar, fechas ocupadas)** → `admin/js/reservas.js` (`nuevaReserva`: lo que lleva toda reserva; `guardarReserva` y `borrarReserva` a mano; `confirmarSolicitud`, `noSeDio`, `cancelarReserva` (también desde Rentas: busca el chat por el código), `pagoRecibido`, `comisionPagada`, `pagadoAlPropietario`; `ponerAlDiaReservas` pasa las de antes: teléfono y notas a privado, `propietarioId` de su casa) → `js/calc-vacacional.js` `cambioDeReserva` (fechas de la casa desde las reservas leídas en la transacción; el administrador las ve todas, el socio y el asesor parten de lo guardado) y `choquesReserva` → `properties/{id}.vacacional.reservadas` → `netlify/functions/disponibilidad.mjs` y `scripts/build.mjs` (calendario público) → `admin/js/views/mis-casas.js` (lo que ve el dueño) → `firestore.rules` (`reservas`, `leads`, `chats`, `privado`) → `scripts/test-vacacional.mjs`, `scripts/emulador/test-reglas.mjs`, `scripts/entorno/recorrido.mjs` (4c, 4e). Una reserva de la web no cambia de fechas ni de casa en Rentas (se cancela y se hace otra); si cambian sus montos, `comisionDeReserva` rehace la comisión (monto = ganancia, vence = llegada) y lo que muestra la solicitud. Una reserva que alguien cambió desde que se leyó (estado o `updatedAt`) no se escribe encima; «Confirmada» y «No se dio» revisan dentro de la transacción que nadie respondió antes. Al cambiar el dueño de una casa (`asignarDueno`), sus reservas, solicitudes y chats que no han terminado pasan al nuevo; las pasadas quedan con quien las ganó (también al editarlas en Rentas). Lo que el socio puede crear lo limita `firestore.rules` (`reservaDelSocioValida`: campos fijos, de una solicitud real, sin pago marcado, comisión = ganancia ≥ margen de la casa, su parte ≥ noches × su noche más barata para esas fechas: base, fin de semana o un precio por fechas que las toque). Decisiones: el dueño ve los montos de sus reservas, ganancia incluida (el margen sale del precio público); las solicitudes y Rentas las atienden el administrador y el dueño, no los asesores (una casa por noche no lleva `agentId`).

**Comisión de un inmueble** → `admin/js/acuerdo.js` `comisionDe` (acuerdo de ese inmueble → regla general de `settings/crm` → `REGLAS_POR_DEFECTO`; venta en %, renta en meses por año de contrato), `montoComision`, `textoComision` → `admin/js/cotizacion.js` (`lineaVacia`, `calcularLinea`: `mesesPorAnio` × escala de ley) → `admin/js/views/cotizacion.js` (al elegir el inmueble: % o meses y modo acordados) → `admin/js/crm.js` `comisionDeNegocio` (cliente con comisión propia, si no la regla general) → `admin/js/views/reportes.js`, `views/propietarios.js` (listado), `views/clientes.js` (`textoRegla`) → `scripts/test-acuerdo.mjs`. Por noche no hay comisión: EQ gana el margen (`js/calc-vacacional.js`).

**Reglas de ingreso de la reserva** (no aflojar): filtro de contacto en `js/calc-vacacional.js` y su piso en `firestore.rules`; datos de pago solo al confirmar; dirección solo con pago recibido (vive en `privado/llegada` y viaja en el mensaje, idéntica a lo guardado); el socio no lee `leads` ni cancela con el pago recibido. Pruebas: emulador de Firestore.

**Dirección y mapa de una casa por noche** → `admin/js/views/properties.js` (los saca del documento público al guardar) e `importar.js` → `properties/{id}/privado/llegada` → `admin/js/views/solicitudes.js` `pagoRecibido` (los copia al mensaje) → `js/reserva-chat.js` (los muestra) → `firestore.rules` (`privado`, `mensajes`) → `scripts/build.mjs` (los borra de toda casa por noche antes de generar).

**Crear, editar o eliminar una propiedad** → una sola ficha: `admin/js/views/properties.js` `renderEditor` (en su página, o en una ventana con `abrirFicha`, que usa `propietarios.js` desde la ficha del dueño). `propiedadNueva` (lo que lleva toda propiedad al nacer) la usan la ficha, «Duplicar», `importar.js` y `admin/js/demo.js`; `revisarCasa` (lo que se revisa antes de guardar: casa por noche con dueño, sin asesor, solo del administrador, sin dejar de ser por noche con huéspedes por venir) la usan la ficha y el importador, que después enlazan al dueño con `asignarDueno`; `eliminarPropiedad` (también la quita de la lista del dueño), la ficha y el listado. **Guardar una que ya existe** es siempre `guardarCambios`: en una transacción vuelve a leer la casa y el costo del socio y pone encima solo lo que cambió quien guarda (`admin/js/cambios-casa.js`); de ahí salen los precios públicos por noche y el historial (`historialCon`). La usan la ficha y el importador. Lo que escriben otras pantallas en la misma casa: `vacacional.reservadas` (`solicitudes.js`, `rentas.js`), `vacacional.bloqueos`, `minimos`, `huespedesMax` y precios (`mis-casas.js`), `difusion.{portal}` (`views/difusion.js`), estado, visible, fotos y textos (acciones del listado). Tras guardar, lo guardado es el punto de partida del siguiente «Guardar». «Duplicar» usa `propiedadNueva`, `slugLibre` y, si es por noche, `guardarPrivadoVacacional` (sin noches reservadas, bloqueos, mínimos ni iCal; el acuerdo no se copia).

**Qué se le pide a cada dueño** → `admin/js/views/propietarios.js` `operacionesDe` y `esSocio` (según sus casas, que pueden ser de las tres categorías en la misma ficha: con casas por noche, datos de pago; con venta o renta, el asesor que la atiende; sin casas todavía, nada de eso) → `admin/js/views/properties.js` (marca `porNoche` al guardar una casa por noche) → `admin/js/pendientes-reglas.js`.

**Acuerdo con el dueño (exclusiva, comisión, impuestos), por inmueble** → `admin/js/acuerdo.js` (qué aplica a cada operación, herencia de lo que antes se guardaba en la persona, exclusivas por vencer; sin dependencias) → `admin/js/views/properties.js` (bloque «Acuerdo con el dueño»; `acuerdoPorGuardar` decide qué se escribe en `privado/acuerdo`; nunca va al documento público ni a `traducirEn` / `netlify/functions/ia.mjs`) → `admin/js/crm.js` `loadAcuerdos` → `admin/js/views/propietarios.js` (listado, fichas cortas, `migrarAcuerdos`) → `admin/js/views/dashboard.js` → `admin/js/portal.js` (solo la fecha de cada inmueble va al resumen del dueño, `exclusivaHasta` en `admin/js/duenos.js`) → `admin/js/views/cotizacion.js` → `netlify/lib/resumen.mjs` → `firestore.rules` (`privado`) → `scripts/test-acuerdo.mjs`. **Qué no aplica a una casa por noche** → `admin/js/views/properties.js` (`when: !esVacacional`: asesor, precio, VIP, mantenimiento) y `scripts/build.mjs` (les quita dirección, mapa y VIP).

**«Hoy»** → `js/calc-vacacional.js` `hoy()` (día de Guatemala; lo usan el sitio, el panel (`admin/js/ui.js` `hoy`) y las funciones) → `scripts/test-vacacional.mjs`.

**Enlace de WhatsApp** → `admin/js/formato.js` `telefonoWa` / `whatsappUrl` → `scripts/lib/util.mjs` `whatsappLink` → `scripts/build.mjs` (config del sitio) → `admin/js/portal.js`.

**Etiqueta de la operación** («Venta», «en renta vacacional», hashtag) → `admin/js/estados.js` (`OPERACIONES`, `operacionDe`, `enOperacion`, `operacionHashtag`, en español o inglés; `properties.js` reexporta `OPERACIONES`) → `listado.js`, `difusion.js`, `reglas.js`, `seo-auto.js`, `cotizacion.js`. El precio con su operación («/mes», «por noche») → `admin/js/formato.js` `precioTexto` (el generador aún tiene su copia en `scripts/lib/util.mjs` `formatPrice`). Una casa por noche no entra donde se compara un precio de compra o de renta al mes: `calculadora.js` y `reglas.js` `evaluar`.

**Estado de una propiedad** → `admin/js/estados.js` → `scripts/build.mjs` (`seOfrece`, páginas cerradas) → `scripts/lib/templates.mjs`.

**«Faltan»** → `admin/js/pendientes-reglas.js` → `scripts/test-pendientes.mjs`.

**Mascotas en una casa por noche** → un solo dato, el selector `vacacional.mascotas`; `admin/js/estados.js` `mascotasUnaVez` y `amenidadesPara` quitan la amenidad repetida → `admin/js/views/properties.js` (al abrir y al guardar) → `scripts/build.mjs` (al publicar) → `admin/js/reglas.js` `textoProp` (búsquedas).

**Traducción al inglés** → `netlify/lib/tareas.mjs` (con IA) y `admin/js/reglas.js` (sin IA; usa un traductor gratuito de fuera) → `admin/js/views/properties.js` `traducirEn`, `fuenteEs`, `traducirEnVivo` (se traduce al salir del campo, con `paraTraducir`: precios que ve el cliente; `form.poner` la muestra) → `scripts/build.mjs` `propiedadEn`.

**Lo que sale a la IA o al traductor** → `admin/js/ia.js` `pedirIA` (única salida) → `admin/js/para-ia.js` `paraIA` (de cada propiedad, solo lo público; casa por noche sin dirección ni mapa; nada de socio, acuerdo, privado, historial, difusión, dueño, asesor ni uid; del lead y del requerimiento, primer nombre y lo que busca, sin teléfono ni correo) ← `views/ia.js` (buscar, redactar, seguimiento, clientes, chat) y `traducirEn` → `scripts/test-para-ia.mjs`. `generarDescripcion` también recibe `propiedadParaIA` (lo que escribe se publica).

**Listados y páginas de aterrizaje (SEO)** → `scripts/lib/landings.mjs` `planListados` (regla de poco contenido, una sola función `bastante`: tipo y zona desde `MIN_INDEXABLE` = 3; nada igual a su padre; listado vacío sin indexar) → `textosListado` (título ≤ 60, tipo que domina, dato de la zona) y `estadisticasPrecio` (≥ 3 precios en una moneda) → `scripts/build.mjs` (`textosDelPlan`, pares de idioma solo entre páginas que se indexan, sitemap y `llms.txt` desde la etiqueta robots de cada página, `_redirects` por familia) → `scripts/lib/templates.mjs` (`listingPage`, `bloquePrecios`, `porZona`, migas con `padres`, ficha con `paginaDeZona`, menú, pie y enlaces de Contenido de la portada con `visible`, pastillas de zona solo a páginas que se indexan, listado vacío con su propio mensaje, contenido con `md` → `resolver`) → `scripts/test-seo.mjs` y `scripts/test-sitio.mjs` (genera un sitio de ejemplo con `scripts/lib/sitio-ejemplo.mjs` y lo recorre).

**Lugar de una propiedad** → `admin/js/seo-auto.js` `sinRepetir` (única regla; la usan `admin/js/reglas.js` y `admin/js/descripcion.js`) → `scripts/lib/util.mjs` `lugarDe` y `departamentoDe` → `scripts/lib/templates.mjs` (ficha, JSON-LD) y `scripts/build.mjs` (catálogos).

**Descripción y SEO automáticos de una propiedad** → `admin/js/descripcion.js` (`generarDescripcion` solo presentación y nota del precio; `sinBloquesGenerados` quita las listas del formato viejo al publicar) → `admin/js/seo-auto.js` `autoSeoTitle` (60) → `admin/js/reglas.js` (traducción; `seoEnViejo` reconoce el SEO en inglés viejo) → `scripts/build.mjs` (`seoPropio`, `seoTraducido`: lo automático guardado se recalcula).

**Página nueva del sitio** → `scripts/lib/templates.mjs` → `scripts/build.mjs` (escribirla, sitemap, hreflang) → `scripts/lib/i18n.mjs` (rutas y textos) → `scripts/lib/assets.mjs` si lleva JavaScript propio.

**Panel del dueño** (propietario o colaborador; un solo panel para las tres categorías) → acceso: `admin/js/acceso.js` `darAcceso` / `ponerAcceso` (única forma; la usan la ficha en `views/propietarios.js`, con las mismas condiciones en las dos (`motivoParaNoAbrir`: sin ficha, o sin casas por noche mientras `reglasNuevas()` diga que siguen las reglas de antes), y `users.js`, que solo los lista y apaga) → `admin/js/firebase.js` `createAccount` → `admin/js/app.js` (menú: Solicitudes solo con casas por noche; etiqueta con `etiquetaDueno`) → resumen: `admin/js/portal.js` `armarPortal` (casas con `casasDe`, sin las por noche; exclusiva por inmueble; `anuncioDe`; datos de la ficha con `datosDelDueno`) ← `refrescarPortalesDe` (propiedad, difusión, clientes, agenda), guardar la ficha y `avisoResumenes` al abrir Propietarios (cuenta los que faltan; `publicarPortal` reserva el id con una transacción y deja uno solo por persona) → `admin/js/session.js` `cargarMiResumen` (resumen; si las reglas viejas lo niegan, la ficha) → `admin/js/views/mis-casas.js` + `admin/js/resumen-casa.js` → `admin/js/views/solicitudes.js` (datos de pago al confirmar) → `firestore.rules` (`portalPropietarios`, `comentariosPropietarios`, `esSocioPorNoche` y `esSocioDeCasaPorNoche` en propiedades, privado, reservas, solicitudes y chat) → `scripts/lib/templates.mjs` `portalPage` (la página vieja `/propietarios/` lleva al panel) → `scripts/emulador/test-reglas.mjs` y `scripts/entorno/recorrido.mjs` (paso 8) → `docs/portal-propietarios.md`.

**Sección nueva del panel** → `admin/js/views/<nombre>.js` → `admin/js/app.js` (`ROUTES`) → `firestore.rules` si usa una colección nueva.

## 7. Cómo se prueba

- Todo junto: `npm test` (sintaxis de todo el código y `scripts/test-*.mjs`). En GitHub corre solo en cada pull request.
- Reglas de Firestore y Storage: `npm run test:reglas` (`scripts/emulador/`: levanta limpios los emuladores de Firestore y Storage con firebase-tools y corre los casos).
- Entorno de pruebas completo (`scripts/entorno/`): `npm run entorno` levanta panel, sitio y funciones contra los emuladores
  de Firebase (inicio de sesión, base con `firestore.rules`, fotos con `storage.rules`) con datos inventados y usuarios
  de prueba (administrador, asesor, socio y colaborador; a la dueña mixta le da acceso el recorrido); `npm run recorrido` hace la reserva por noche de punta a punta entrando al panel como administrador, socio y
  asesor, y como cliente. Los correos no se envían: quedan anotados. `levantar.sh publicar` hace lo que el botón Publicar.
- Qué revisar antes de unir: `docs/revision-antes-de-unir.md`.
- Sitio: `npm run build` y `npm run serve` (sirve `dist/`; `DIST_DIR=…` sirve otra carpeta). `GUARDAR=<carpeta> node scripts/test-sitio.mjs` deja el sitio de ejemplo para verlo.
- Dentro de un lote las reglas ven el estado anterior: lo que depende de un cambio previo va en dos pasos.
- Panel: datos inventados; nunca la base real.
- No se puede probar en local: que un correo llegue de verdad a una bandeja, las funciones programadas y lo propio de Netlify.
