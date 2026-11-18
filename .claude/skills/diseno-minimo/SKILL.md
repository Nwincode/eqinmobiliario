---
name: diseno-minimo
description: Diseño sin ruido y sin espacio desperdiciado, con lo que enseñaron Jakob Nielsen (usabilidad), Dieter Rams (menos, pero mejor) y Josef Müller-Brockmann (retícula). Úsala antes de diseñar o cambiar cualquier pantalla, tarjeta, lista, formulario o correo del sitio o del panel, y antes de mostrarle un diseño al usuario.
---

# Diseño mínimo: Nielsen, Rams y Müller-Brockmann

Tres maestros, una sola idea: **cada cosa en la pantalla se gana su lugar o sale**. Müller-Brockmann
pone el orden (la retícula), Rams la forma (menos, pero mejor) y Nielsen la prueba (¿el usuario termina su
tarea más rápido?). En este proyecto el usuario ha pedido muchas veces lo mismo: **sin ruido, sin espacios
de más y con toda la información que sirve para decidir**. Esta skill existe para no volver a fallar en eso.

## 1. Quiénes son y qué enseñaron

### Josef Müller-Brockmann (1914–1996): la retícula
- Diseñador gráfico y maestro suizo, nacido en Rapperswil. Estudió en la Kunstgewerbeschule de Zúrich y
  enseñó ahí y en la escuela de diseño de Basilea.
- Sus carteles de conciertos para la Tonhalle de Zúrich (desde 1950–51, la serie «Musica Viva») lo hicieron
  conocido: solo tipografía y formas geométricas, sin adornos, el orden como expresión.
- En 1958 fundó la revista *Neue Grafik* con Richard Paul Lohse, Hans Neuburg y Carlo Vivarelli: la voz del
  Estilo Tipográfico Internacional (diseño suizo).
- Libros: *The Graphic Artist and His Design Problems* (1961) y *Rastersysteme für die visuelle Gestaltung /
  Grid Systems in Graphic Design* (1981).
- Lo que enseñó:
  - La retícula ordena: columnas, módulos y márgenes fijos. Todo se alinea a ella; nada flota.
  - La jerarquía sale del tamaño, el peso y la posición del texto, no de cajas, colores ni adornos.
  - El espacio en blanco es un elemento del diseño, con medida, no lo que sobra.
  - Objetividad: el diseñador sirve al mensaje, no a su gusto.

### Dieter Rams (1932): menos, pero mejor
- Diseñador industrial alemán, nacido en Wiesbaden. Entró a Braun en 1955 y dirigió su diseño desde 1961
  hasta 1997. Para Vitsœ diseñó el sistema de repisas 606, que se fabrica desde 1960.
- Su frase: «Weniger, aber besser» («menos, pero mejor»). Jony Ive, en Apple, llevó esas ideas al hardware y
  al software.
- Sus 10 principios del buen diseño (los pensó como criterios para juzgar, no como recetas). El buen diseño:
  1. Es innovador.
  2. Hace útil al producto.
  3. Es estético.
  4. Hace comprensible al producto: se explica solo.
  5. Es discreto: es una herramienta, no una obra de arte; deja espacio a la persona.
  6. Es honesto: no promete lo que no hay.
  7. Es duradero: no sigue modas.
  8. Es minucioso hasta el último detalle: nada se deja al azar.
  9. Cuida el medio ambiente.
  10. Es tan poco diseño como sea posible: se concentra en lo esencial.

### Jakob Nielsen (1957): usabilidad
- Investigador danés. En Bellcore definió las 10 heurísticas de usabilidad (con Rolf Molich, 1990; la
  versión final, de 1994). Fue Distinguished Engineer de Sun Microsystems (1994–1998), donde diseñó su sitio y
  su intranet. En 1998 fundó Nielsen Norman Group con Don Norman. Escribió la columna *Alertbox* desde 1995 y
  los libros *Usability Engineering* (1993), *Designing Web Usability* (2000) y *Prioritizing Web Usability*
  (2006). Hoy escribe en su Substack (jakobnielsenphd.substack.com).
- Lo que enseñó:
  - Las 10 heurísticas:
    1. Que el sistema siempre diga qué pasa.
    2. Que hable como habla el usuario.
    3. Que se pueda deshacer y salir.
    4. Que sea consistente.
    5. Que prevenga errores.
    6. Que se reconozca, no que haya que recordar.
    7. Que tenga atajos para el experto.
    8. **Diseño estético y minimalista: cada dato de más compite con el que importa.**
    9. Que los errores se entiendan y se puedan corregir.
    10. Ayuda donde se necesita.
  - En la web la gente no lee: escanea. Por eso: lo importante arriba y a la izquierda, textos cortos y
    frases que se entienden sueltas.
  - Tiempos de respuesta: 0.1 s se siente inmediato; 1 s mantiene el hilo; 10 s y se pierde la atención.
  - Ley de Jakob: la gente pasa la mayor parte del tiempo en otros sitios, así que espera que el tuyo funcione
    igual. Usa los patrones que ya conoce (un portal de casas muestra precio, zona, cuartos, baños y m²).
  - Con 5 usuarios aparece la mayoría de los problemas: se prueba poco y seguido.

## 2. Las reglas en este proyecto (obligatorias)

### Retícula y espacios (Müller-Brockmann)
- Todo se alinea: mismo borde izquierdo para el texto de una tarjeta, misma columna para los íconos, el
  mismo padding en las piezas hermanas.
- Medidas fijas, no al ojo:

  | Dónde | Medida |
  |---|---|
  | Entre líneas de texto de un mismo bloque (título, zona, datos, precio) | 2 px; interlineado 1.25–1.3 |
  | Entre bloques dentro de una tarjeta | 6–8 px |
  | Entre tarjetas o filas | un borde de 1 px, sin margen extra |
  | Padding de una tarjeta | 8–10 px en celular, 12 px en computadora |
- Una foto al lado de texto mide lo mismo que el texto (sin hueco abajo ni arriba). Si el texto crece, se
  revisa la foto.
- Un dato corto (un código, una fecha) nunca ocupa una línea propia: va al lado de otro dato.
- Un botón o ícono no puede agrandar su fila. El ⋮ (44 px de toque) se monta con margen negativo sobre una
  línea existente.
- Nada se sale de la pantalla (cero scroll de lado) y nada se corta a la mitad: un nombre largo usa dos
  líneas antes que «…».

### Menos, pero mejor (Rams)
- Prueba de quitar: por cada elemento, Claude se pregunta «si lo quito, ¿el usuario pierde algo para
  decidir o actuar?». Si no pierde nada, sale. Si pierde, se queda, aunque ocupe.
- Nada de cajas, chips, sombras ni colores para «decorar». Un color dice algo (verde se ve, gris oculta,
  ámbar falta algo, rojo vendida) o no va.
- Una sola señal por idea: si un punto de color ya dice el estado, no se repite en una etiqueta.
- Honesto: lo que se ve es lo que hay. No se esconde información que el usuario necesita para decidir
  (en una propiedad: precio, operación, nombre, zona, cuartos, baños, parqueos o personas, m², estado).
- Minucioso: antes de entregar, cada píxel tiene una razón (sección 3).

### Usabilidad (Nielsen)
- Lo más importante, arriba y a la izquierda. En una casa, el precio va primero, como en los portales.
- Lo que más se usa, más a mano: en el celular, abajo a la derecha (el pulgar). Lo raro, en el ⋮; borrar,
  al final y en rojo.
- Tocar la tarjeta abre la ficha; las acciones secundarias van en un solo ⋮.
- Áreas de toque de 44 px como mínimo.
- Patrones conocidos antes que inventos.

### Celular: íconos, no textos
- En el celular, lo que se entiende con un ícono va en ícono, con su `title` y su `aria-label` (sirve también a
  quien no ve la pantalla):
  - acciones: «+» nueva, ✓ elegir varias, X cerrar, ↗ ver el sitio, ⋮ más;
  - estados: un ojo si sale en la página, el ojo tachado si no;
  - avisos: ⚠ con el número de datos que faltan;
  - datos: cama, baño, carro, personas, m².
- No se repite un título grande que la barra de arriba ya dice.
- El texto queda solo para lo que ningún ícono dice bien: precio, nombre, zona y el estado en una palabra.
- En un grupo de datos, todos con ícono o todos con texto, no revueltos (`CLAUDE.md`).

### Lo que el usuario ya corrigió (no repetir)
- Hacer solo lo pedido. Nada «de paso» (un botón de WhatsApp, un número, una etiqueta más). Lo nuevo va
  como propuesta aparte y espera su sí (`CLAUDE.md`).
- No tocar, guardar ni volver a publicar lo que el usuario está usando.
- No irse al otro extremo: quitar ruido no es quitar información.
- No mostrar algo sin haberlo mirado como usuario.

## 3. Los libros, y cómo se usan aquí

> Nota honesta: Claude no tiene el texto completo de estos libros. Lo de abajo sale de lo que se conoce y
> publica de cada uno (índice, editoriales, catálogos y reseñas) y de su obra. Si una regla viene de una
> fuente secundaria, se dice.

### Müller-Brockmann, *Grid Systems in Graphic Design* (Niggli; original en alemán, 1981; 176 páginas)
El punto de partida para maquetar mucha información en poco espacio.
- **El orden parte de la letra.** Primero se fija el tamaño del texto y su interlineado. Después, el ancho de
  la columna: unas 7 palabras por línea para leer cómodo. Al final, las columnas y los campos. Todo es
  múltiplo de la línea de texto.
- **Tipos de retícula:** de una columna, de varias columnas, modular (columnas y filas: campos), jerárquica,
  de líneas base y compuesta. Se elige según el contenido, no al revés.
- **Campos y separaciones:** el alto de un campo es un número entero de líneas de texto. Entre campos hay un
  espacio fijo (una línea vacía), para que las líneas base coincidan de una columna a la otra.
- **Pocas variantes:** dos o tres tamaños de letra y dos pesos. La jerarquía la dan el tamaño, el peso y la
  posición, no las cajas ni los adornos. Texto alineado a la izquierda, sin justificar en columnas angostas.
- **Imágenes a la retícula:** una foto ocupa uno o varios campos completos; su borde coincide con una línea de
  texto. No hay medias líneas vacías.
- **Constancia:** el mismo interlineado en toda la pieza; la misma retícula en todas las páginas.

**En el panel y el sitio:**
- Línea base de 4 px. El interlineado es múltiplo de 4 (texto de 14 px con 20 px de línea; texto chico de
  12–13 px con 16 px).
- Entre líneas de un bloque, 2 px; entre bloques, 8 px (dos pasos de la línea base).
- Una tarjeta es un campo: la foto mide un número entero de líneas del texto que tiene al lado (5 líneas de
  20 px ≈ 104 px con sus separaciones).
- Máximo 3 tamaños de letra en una pantalla (dato, nombre y precio) y 2 pesos (normal y negrita).

### Rams, *Less and More: The Design Ethos of Dieter Rams* (Gestalten, 2009; edición de Klaus Klemp y Keiko Ueki-Polet)
Es el catálogo de la exposición que empezó en el Museo Suntory de Osaka y pasó por Tokio, el Design Museum de
Londres, Fráncfort y el SFMOMA. Trae los ensayos de los editores, los 10 principios del propio Rams, el
diseño gráfico de Braun, la relación de Rams con Yanagi Sōetsu y cientos de productos fotografiados (Braun y
Vitsœ).
- **Lo que enseñan sus productos:**
  - Colores neutros (blanco, gris, negro). El color se usa solo para decir algo: en la calculadora ET66 el
    color marca las teclas de operación; en los aparatos, un verde o rojo dice encendido.
  - Los controles se agrupan por función, todos del mismo tamaño y alineados a una retícula. Lo que se usa
    más está más a mano.
  - Etiquetas pocas, cortas y del mismo tamaño en todo el producto.
  - Sin adornos: ni bordes de más, ni sombras pesadas, ni etiquetas que repiten lo que ya se ve.
  - Honesto y duradero: nada que pase de moda, nada que aparente lo que no es.
- **En el panel y el sitio:**
  - Un color, un significado: verde se ve, gris oculta, ámbar reservada o falta algo, rojo vendida o
    borrar. El azul es para la acción principal. Ningún color de adorno.
  - Bordes de 1 px y sombras muy suaves (las de `css/tema.css`); nunca un recuadro dentro de otro recuadro.
  - Una sola señal por idea.
  - Controles agrupados en un solo lugar: el ⋮ abajo a la derecha.

### Nielsen, *Designing Web Usability: The Practice of Simplicity* (New Riders, 1999)
Las reglas de cómo se usa una pantalla.
- **El contenido manda:** la mayor parte de la pantalla debe ser contenido, no navegación ni adornos. Se
  mide qué parte de los píxeles es información.
- **Velocidad:** 0.1 s se siente inmediato; 1 s mantiene el hilo; a los 10 s se pierde la atención. Fotos
  livianas y nada que haga esperar.
- **Escribir para escanear:** la gente no lee, escanea. Textos de la mitad de largo que en papel, con lo
  importante primero (pirámide invertida). Títulos que se entienden solos, listas y palabras clave
  destacadas.
- **Navegación:** siempre se sabe dónde estoy, de dónde vengo y a dónde puedo ir.
- **Simplicidad:** cada elemento que no ayuda a la tarea le quita atención a lo que sí ayuda.
- Lo que Nielsen publicó después: el patrón en F (estudio de seguimiento de la mirada de 2006, no está en
  el libro). La gente lee la primera línea, luego un poco de la segunda y después baja por el borde
  izquierdo. Por eso lo importante va arriba y empezando por la izquierda (en una casa, primero el precio).

### Krug, *Don't Make Me Think* (2000; *Revisited*, 2014): la versión práctica
- **Primera ley de Krug: no me hagas pensar.** Cada pantalla se entiende sola, sin explicaciones.
- La gente escanea, toma la primera opción razonable y se las arregla sin entender cómo funciona.
- **Pantallas como vallas publicitarias:**
  - usar convenciones;
  - jerarquía clara: lo importante, más visible; lo relacionado, junto; lo que está dentro de algo, adentro;
  - áreas bien separadas;
  - que lo que se toca parezca tocable;
  - quitar el ruido.
- **Quitar palabras:** quita la mitad de las palabras de cada página y después la mitad de lo que quede. Las
  instrucciones y el texto de relleno sobran.
- **Celular:** que lo tocable se note, no esconder lo importante y áreas de toque generosas. La paciencia del
  usuario es una reserva que cada estorbo gasta.
- **Probar poco y seguido:** tres usuarios una mañana al mes encuentran los problemas grandes.

**En el panel y el sitio:** Claude hace la prueba de Krug antes de entregar. En 5 segundos se debe
entender qué es la pantalla, qué es lo principal y dónde se toca. Si no, falta jerarquía o sobra ruido.

## 4. Antes de mostrar un diseño (siempre)

1. **Como usuario:** Claude recorre la pantalla como quien la usa («quiero saber cuánto cuesta, dónde está y
   cuántos cuartos tiene; quiero cambiar su estado con una mano») y escribe qué no pudo hacer o ver.
2. **Medir, no adivinar:** con Playwright, a 390 px (celular), 820 px (tableta) y 1280 px (computadora):
   - el espacio entre líneas de texto de cada bloque (≤ 2–4 px);
   - el alto de la foto contra el alto del texto a su lado;
   - que el ancho de la página sea igual al de la ventana (sin scroll de lado);
   - los textos cortados (`scrollWidth > clientWidth` o `scrollHeight > clientHeight`);
   - las áreas de toque (≥ 44 px).
3. **Mirar la captura** de cada tamaño y quitar todo hueco, línea propia de un dato corto o elemento que no
   pase la prueba de quitar.
4. **Decir lo que no se resolvió.** Si algo queda pendiente (un nombre que no cabe), se le dice al usuario.
5. Diseño nuevo o grande: primero propuestas (dos o tres, lado a lado, a tamaño real en cada aparato) y el sí
   del usuario; después se programa.

## Fuentes
- Libros: Müller-Brockmann, *Grid Systems in Graphic Design* (Niggli; índice de la edición en línea y
  ficha de la editorial); Klemp y Ueki-Polet (ed.), *Less and More: The Design Ethos of Dieter Rams*
  (Gestalten, 2009; ficha de biblioteca del CCA y British Council); Nielsen, *Designing Web Usability* (New
  Riders, 1999); Krug, *Don't Make Me Think* (New Riders, 2000; 3.ª ed. 2014).
- Nielsen: Wikipedia, «Jakob Nielsen (usability consultant)»; su Substack: «43 Years in UX: A Career
  Retrospective» y «How I Developed the 10 Usability Heuristics» (jakobnielsenphd.substack.com).
- Rams: Wikipedia, «Dieter Rams»; Vitsœ, «Dieter Rams and Vitsœ» (vitsoe.com/dieter-rams); Design Museum.
- Müller-Brockmann: artnet; perfil del jurado de iF Design (Neue Grafik, 1958); People's Graphic Design
  Archive (carteles «Musica Viva» de la Tonhalle).
