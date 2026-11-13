# Reglas para trabajar en este repositorio

## Prioridades del usuario (valen para todo, en este orden)
Orden, limpieza de código, simplicidad, minimalismo y sencillez de uso.
- La plataforma existe para quitarle trabajo al usuario, no para darle más.
- Lo que ya está guardado no se vuelve a pedir: se sugiere o se rellena solo.
- Mapa del sistema: `docs/mapa-del-sistema.md` dice dónde vive cada cosa y qué archivos se tocan juntos
  (las «cadenas»). Se lee antes de un cambio que cruza partes del sistema y se actualiza en el mismo commit.
- Antes de dar por resuelto un problema, Claude se pregunta: «si se elige esta opción (p. ej. renta vacacional, o
  socio), ¿qué más cambia de lo que está encadenado?». Va al mapa del sistema, recorre cada pantalla, campo y
  página que dependa de esa opción y quita, cambia o agrega lo que corresponda con lógica; no espera a que el
  usuario lo encuentre uno por uno.
- Antes de programar algo nuevo, buscar si ya existe y reutilizarlo (CSS sobre todo; también JS y HTML).
  Precios, números, m² → sq ft y enlaces de WhatsApp salen de `admin/js/formato.js`.
- Nada de parches encima de código viejo: si algo está mal, se arregla en su origen.
- Cada dato con su formato, uno solo en todo el sistema: los teléfonos llevan código de país
  (`admin/js/formato.js`: «+código número»); correos, fechas y montos se validan al entrar.
  Antes de entregar un campo nuevo, Claude revisa qué puede escribir ahí alguien de otro país u otro caso.
- Gastar pocos tokens: respuestas cortas y sin trabajo que no se pidió.

## Cómo se conversa
- Si el usuario pregunta algo, responder primero y directo (sí/no y por qué); después lo demás.
- Proactivo siempre, nunca una respuesta para salir del paso: si el usuario se topa con algo que no cuadra
  (un dato que el sistema pide de más, un paso repetido, algo que no tiene sentido), Claude no le explica
  cómo saltarlo: busca por qué pasa, dice qué está mal y lo arregla en su origen.
- Cuando el usuario pide opinión o consejo («¿qué te parece?», «¿cómo lo resolvemos?», «quiero un asesor»),
  Claude asesora de verdad, sin decir sí a todo: qué entiende, qué problema le ve, qué alternativa propone y cuál
  recomienda, y lo acuerdan entre los dos. Si no se la piden, hace lo pedido sin opinar de más.
- Un solo chat para eqinmobiliario.gt; no mezclar con el proyecto "ptg". Firebase: solo `eqinmobiliariobd`.
- La compactación del contexto es automática (autocompact); no se hace a mano. Antes de que ocurra:
  commit y push de lo hecho. Se sigue en el mismo chat.

## Diseño
- Lo hace Claude directo, sin agentes de diseño ni agentes revisores.
- Cambio sencillo (texto, color, un botón, un espacio): se hace de una vez.
- Diseño grande o nuevo (página, sección, tarjeta, panel, correo): primero un boceto corto para que
  el usuario lo apruebe; después se programa.
- Revisión: Claude usa el sitio como cliente, en celular (390 px) y computadora (1280 px), corrige lo
  que encuentre y le muestra al usuario la captura final y qué mejoró.
- Espacios vacíos: no se dejan. Antes de entregar, Claude revisa si algo está mal ubicado, rompe el
  diseño o deja un hueco, y lo aprovecha (subir datos a la misma línea, juntar filas) sin agregar relleno.
- Tablas, fichas y listas: se usa el diseño que ya existe en el panel (mismo CSS y mismas piezas),
  salvo que el usuario pida algo distinto para una en particular.
- Íconos en todo el sitio y el panel (no solo en tablas): dan información visual sin ocupar espacio.
  Lo que se entiende con un ícono va en ícono, no en texto; en un mismo grupo de datos, todos con
  ícono o todos con texto, no revueltos.
- Un solo scroll por pantalla: nada de una caja con scroll propio dentro de una página que ya baja.
- Proporción: la foto pesa más que los controles (selectores, botones).
- Si Claude ve algo mal maquetado, lo arregla de una vez, sin esperar a que el usuario lo señale.
- Colores: solo de `css/tema.css` y de Contenido → Colores del panel; nunca escritos a mano.
- Íconos: siempre referidos a lo que se habla.
- Botones compactos, sobre todo en celular: pequeños, de ícono cuando se pueda, sin ocupar una fila
  entera; área de toque de al menos 44 px.
- Carruseles: solo flechas finas `<` `>`, sin texto ni cajas pesadas, con `aria-label`.

## SEO
- En cada cambio al sitio público, Claude revisa el SEO de lo que toca (título, descripción, datos
  estructurados, sitemap, velocidad) y propone mejoras para que la página responda mejor a Google.

## Seguridad y GitHub
- No pedir ni aceptar contraseñas. No compartir el JSON de la cuenta de servicio (clave privada).
- El panel se prueba con el emulador y datos inventados; nunca con datos reales.
- Pull requests: Claude hace commit, push, PR y merge solo, salvo que una tarea diga que no.
- Antes de unir, Claude recorre `docs/revision-antes-de-unir.md` (los errores que ya pasaron aquí y la
  revisión que evita cada uno) y corre `npm test`; si toca reglas, reservas o el chat, también
  `npm run test:reglas`. No se une con una prueba en rojo, ni en local ni en GitHub.
- Lo que toca dinero, datos de clientes o reglas de seguridad lleva una segunda revisión independiente.
- Un error nuevo se agrega a esa lista en el mismo cambio que lo corrige.
