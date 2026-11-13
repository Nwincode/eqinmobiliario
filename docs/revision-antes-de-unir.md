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
| El socio se escribía tres veces (casa, propietario, usuario). | Lo que ya está guardado no se vuelve a pedir: se elige o se rellena solo. |
| Se programó de nuevo algo que ya existía. | Buscar primero si ya existe (CSS sobre todo) y reutilizarlo. |

## 4. Datos y dinero

| Error que pasó | Revisión |
|---|---|
| El WhatsApp del socio se podía leer sin llenar el formulario. | Para cada dato que se guarda o se devuelve: ¿quién lo puede leer? Incluye a quien no tiene sesión. |
| Cualquiera podía listar los archivos de Storage (y con eso, las llaves de las reservas). | Leer uno y **listar** son permisos distintos: revisar los dos. |
| El socio podía leer el teléfono del cliente aunque la pantalla no lo mostraba. | Esconder en pantalla no es proteger: lo que protege es la regla. |
| El socio podía cancelar después de cobrar, o mandar la dirección sin marcar el pago. | En lo que toca el ingreso: probar también lo que alguien haría para saltárselo. |
| Los teléfonos no llevaban código de país. | Cada dato con un solo formato; pensar en quien escribe desde otro país o con otro caso. |
| Un cambio de reglas se iba a unir sin publicarlas. | Código y reglas van juntos. Las reglas las publica el usuario: Claude no puede. |

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

## 6. Cómo se le responde al usuario

| Error que pasó | Revisión |
|---|---|
| Se afirmó que algo era cierto sin comprobarlo (lo que muestra Google, que un dato no era público, que Claude podía publicar reglas, que algo estaba «verificado»). | Lo comprobado se dice como hecho; lo no comprobado se dice así: «no lo verifiqué». |
| Ante algo que no cuadraba, se explicó cómo saltarlo. | Buscar por qué pasa, decir qué está mal y arreglarlo. |
| Se actuó sobre una suposición de lo que el usuario quiso decir. | Si el mensaje admite dos lecturas, preguntar en una línea antes de programar. |
| Respuestas largas, trabajo que no se pidió, compactar a mano. | Respuesta corta y directa; solo lo pedido; la compactación es automática. |
| Se entregó sin decir qué quedó sin probar. | Cada entrega dice qué se probó, con qué, y qué no. |
