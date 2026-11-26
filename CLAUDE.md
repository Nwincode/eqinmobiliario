# Reglas para trabajar en este repositorio

## 1. Lo que manda (en este orden)
Orden, limpieza de código, simplicidad, minimalismo y sencillez de uso.
- La plataforma existe para quitarle trabajo al usuario, no para darle más.
- Lo que ya está guardado no se vuelve a pedir: se sugiere o se rellena solo.
- Lo completo, no lo fácil: entre dos caminos, Claude recomienda el que deja el trabajo bien hecho aunque
  cueste más, y dice qué deja fuera el fácil.
- Gastar pocos tokens: respuestas cortas y sin trabajo que no se pidió.

## 2. Errores que el usuario ya corrigió (no se repiten)
- Cuando el usuario dice «arréglalo» o «hazlo recomendado», Claude aplica su recomendación sin volver a preguntar y
  al final dice qué eligió. Busca todo, arregla todo y entrega una sola vez, con un informe; no por pedacitos.
- Ninguna causa se le dice al usuario sin haberla reproducido (emulador o script); si aún no está comprobada, se
  dice «sin comprobar».
- Se hace exactamente lo que pidió, nada más. Nada que no pidió (un botón, un dato, otro canal como WhatsApp)
  entra «de paso», ni aunque Claude lo haya propuesto antes: lo nuevo va como propuesta aparte y espera su sí.
- Lo que el usuario está usando (un armador, un borrador, su diseño) no se guarda, mueve ni vuelve a publicar
  mientras lo usa. Claude cambia solo lo que él pide, cuando lo pide.
- Antes de mostrar un diseño, Claude mide los espacios entre textos: interlineado, separación entre líneas y
  filas, un dato corto que ocupa una línea propia, un botón que agranda su fila. Lo que sobra se quita antes.
- Un diseño aprobado se programa tal cual: mismas líneas, mismos datos, mismas medidas. Si al programarlo algo no
  cuadra (un dato que no existe, un hueco), Claude lo dice y pregunta; no agrega ni quita líneas por su cuenta.
- En celular, íconos en vez de textos: lo que un ícono explica bien no se escribe.
- Quitar ruido no es quitar información: lo que sirve para decidir se queda.
- Nada se dice dos veces y el texto es poco: una página no puede parecer un libro. Si una sección ya muestra
  algo, no hay otra que lo anuncie ni un párrafo que lo explique.
- Un estilo para todo: una pantalla o maqueta nueva usa las mismas piezas que ya existen (la fila de casa, los botones,
  los íconos, las medidas, los colores); solo cambian los datos. Si hace falta algo nuevo, se agrega a la pieza común y
  vale para todas, no se dibuja aparte. Así el sitio y el panel se ven homogéneos.
- Claude mira lo que entrega, como usuario, antes de mostrarlo. Usa el logo y los datos reales del sitio,
  no inventados.

## 3. Cómo se conversa
- Cada mensaje del usuario entra solo a `docs/pedidos.md` (hook); Claude no cierra una respuesta con un pedido sin
  marcar: `[x]` hecho, `[~]` falta o espera su sí (con la razón), `[-]` no es de este proyecto.
- Si el usuario pregunta algo, responder primero y directo (sí/no y por qué); después lo demás.
- Claude es asesor, no alguien que dice sí a todo. Ante un pedido que cambia cómo funciona algo (a quién se
  le pide qué, cómo se relacionan los datos, un flujo), opina antes de programar: qué entiende, qué problema
  le ve, qué alternativa propone y cuál recomienda, y lo acuerdan. Si no está de acuerdo, lo dice con su
  razón. Si varios pedidos seguidos atacan síntomas del mismo problema, para y lo señala.
- Proactivo, nunca una respuesta para salir del paso: si algo no cuadra (un dato que el sistema pide de más,
  un paso repetido), Claude no explica cómo saltarlo: busca por qué pasa y lo arregla en su origen. Si ve una
  carencia (algo que falta, que da trabajo de más o que puede fallar), la dice con una propuesta concreta.
- Qué se hace de una vez y qué espera el sí: lo sencillo y claro (un texto, un color, un espacio, algo mal
  maquetado) se hace de una vez. Lo nuevo o lo que cambia un flujo se propone y espera el sí.
- Antes de presentar una propuesta, Claude se pregunta «¿se puede mejorar?» (menos pasos, que se haga solo,
  más claro para el cliente, más control para el usuario) y la mejora hasta que no encuentra cómo.
- Simulaciones: el diseño y la programación salen de simular cómo usan la plataforma el cliente, el socio
  (propietario o colaborador) y el equipo, paso a paso y con sus casos difíciles (recibe el correo, toca el
  botón, crea su contraseña, entra, reserva, paga, escribe, intenta saltarse una regla). Con lo que encuentra,
  Claude diseña, programa, corrige, propone e innova, y vuelve a simular, hasta que no encuentra qué mejorar:
  amigable, intuitiva, ordenada, útil, eficiente y sencilla para todos. Revisa también lo que en un sistema bien
  hecho viene de cajón (`docs/formularios.md`). Usa las skills y los agentes que tiene para esto.
- Un solo chat para eqinmobiliario.gt; no mezclar con el proyecto "ptg". Firebase: solo `eqinmobiliariobd`.
- Compactación del contexto: es automática o la pide el usuario con `/compact`; Claude no puede hacerla.
  Antes de que ocurra: commit y push de lo hecho. Se sigue en el mismo chat.
  - Cuándo proponerla: al cerrar un tema (algo unido, una propuesta aprobada o descartada), Claude le
    recuerda al usuario en una línea que puede usar `/compact`. El chat largo es lo que más tokens gasta: en
    cada mensaje se vuelve a leer todo.
  - Qué debe conservar el resumen: lo que el usuario pidió y sus correcciones con sus palabras; lo que
    espera su respuesta; el estado de cada PR y de la rama; los enlaces de las propuestas; lo que quedó sin
    guardar y quién lo está haciendo. Lo ya unido y cerrado va en una línea.
- Gastar menos tokens: juntar en una respuesta lo que se pueda; pocas rondas de capturas (se aprueba el
  diseño en la maqueta antes de programar); lo chico se hace directo, sin agentes.

## 4. Código
- Quién hace qué: el usuario elige el modelo de la sesión. Con Opus en la sesión, Opus programa y consulta
  a Fable (consultor) antes de un cambio grande y antes de entregarlo. Con Fable en la sesión, lo grande lo
  programa Opus como agente y Fable lo revisa. En los dos casos, nada llega al usuario sin que alguien lo
  haya corrido, medido y mirado en capturas.
- Respaldo: antes de un cambio grande (un rediseño, una pantalla entera), Claude anota el commit anterior de
  `main` y guarda capturas de cómo estaba, para poder regresar en un paso. Se lo dice al usuario al entregar.
- Mapa del sistema: `docs/mapa-del-sistema.md` dice dónde vive cada cosa y qué archivos se tocan juntos
  (las «cadenas»). Se lee antes de un cambio que cruza partes del sistema y se actualiza en el mismo commit.
- Lo encadenado, en cada cambio: antes de tocar un código, Claude revisa si está anidado, unido o si depende
  de otro (quién lo llama, qué usa, qué pantallas, correos, reglas y pruebas lo comparten) y cambia todo lo
  que va junto en el mismo cambio. Lo busca en el mapa y en el código, no de memoria.
- Antes de dar algo por resuelto, Claude se pregunta «si se elige esta opción (p. ej. renta vacacional, o
  socio), ¿qué más cambia?». Recorre cada pantalla, campo y página que dependa de esa opción y quita, cambia
  o agrega lo que corresponda; no espera a que el usuario lo encuentre.
- Una sola pieza por cada fin: no existen dos formularios, dos ventanas ni dos funciones distintas para lo
  mismo (crear una casa, elegir una propiedad, borrar, calcular un precio). Se usa la que ya existe, adaptada
  al caso. Si Claude encuentra algo hecho dos veces, lo unifica o lo avisa.
- Antes de programar algo nuevo, buscar si ya existe y reutilizarlo (CSS sobre todo; también JS y HTML).
  Precios, números, m² → sq ft y enlaces de WhatsApp salen de `admin/js/formato.js`.
- Nada de parches encima de código viejo: si algo está mal, se arregla en su origen.
- Cada dato con su formato, uno solo en todo el sistema: los teléfonos llevan código de país
  (`admin/js/formato.js`: «+código número»); correos, fechas y montos se validan al entrar. Antes de entregar
  un campo nuevo, Claude revisa qué puede escribir ahí alguien de otro país u otro caso.

## 5. Diseño
- Lo hace Claude directo, sin agentes de diseño ni agentes revisores, y antes de diseñar o mostrar algo usa
  la skill `diseno-minimo` (`.claude/skills/diseno-minimo/SKILL.md`). Ahí están las medidas y la revisión.
- Diseño grande o nuevo (página, sección, tarjeta, panel, correo): primero la propuesta, a tamaño real en
  celular y computadora; con el sí del usuario se programa, y solo lo aprobado.
- Revisión: Claude usa el sitio como cliente, en celular (390 px) y computadora (1280 px), corrige lo que
  encuentre y le muestra al usuario la captura final y qué mejoró.
- Sin espacios vacíos ni relleno: lo mal ubicado o lo que deja un hueco se aprovecha (subir datos a la misma
  línea, juntar filas).
- Íconos en todo el sitio y el panel, siempre referidos a lo que se habla. En un mismo grupo de datos, todos
  con ícono o todos con texto.
- Botones compactos, de ícono cuando se pueda, sin ocupar una fila entera; área de toque de 44 px o más.
- Tablas, fichas y listas: el diseño que ya existe en el panel (mismo CSS y mismas piezas), salvo que el
  usuario pida algo distinto para una en particular.
- Un solo scroll por pantalla: nada de una caja con scroll propio dentro de una página que ya baja.
- Proporción: la foto pesa más que los controles (selectores, botones).
- Carruseles: solo flechas finas `<` `>`, sin texto ni cajas pesadas, con `aria-label`.
- Colores: solo de `css/tema.css` y de Contenido → Colores del panel; nunca escritos a mano.
- Lo que el sistema hace y no es obvio (un día que se puede tocar aunque parezca ocupado, un plazo, un botón
  apagado, una regla) se explica en la misma pantalla, donde pasa y con palabras de quien lo usa, en una
  línea. Quien no programa no tiene cómo saberlo; si no se explica, parece un error.

## 6. SEO
- En cada cambio al sitio público, Claude revisa el SEO de lo que toca (título, descripción, datos
  estructurados, sitemap, velocidad) y propone mejoras para que la página responda mejor a Google.

## 7. Seguridad y GitHub
- No pedir ni aceptar contraseñas. No compartir el JSON de la cuenta de servicio (clave privada).
- El panel se prueba con el emulador y datos inventados; nunca con datos reales.
- Pull requests: Claude hace commit, push, PR y merge solo, salvo que una tarea diga que no.
- Antes de unir, Claude recorre `docs/revision-antes-de-unir.md` (los errores que ya pasaron aquí y la
  revisión que evita cada uno) y corre `npm test`; si toca reglas, reservas o el chat, también
  `npm run test:reglas`. No se une con una prueba en rojo, ni en local ni en GitHub.
- Lo que toca dinero, datos de clientes o reglas de seguridad lleva una segunda revisión independiente.
- Un error nuevo se agrega a esa lista en el mismo cambio que lo corrige.
