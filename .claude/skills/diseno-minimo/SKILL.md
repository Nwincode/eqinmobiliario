---
name: diseno-minimo
description: Diseño sin ruido y sin espacio desperdiciado, con lo que enseñaron Jakob Nielsen (usabilidad), Dieter Rams (menos, pero mejor) y Josef Müller-Brockmann (retícula). Úsala antes de diseñar o cambiar cualquier pantalla, tarjeta, lista, formulario o correo del sitio o del panel, y antes de mostrarle un diseño al usuario.
---

# Diseño mínimo

**Cada cosa en la pantalla se gana su lugar o sale.** El usuario pide siempre lo mismo: sin ruido, sin
espacios de más, poco texto y toda la información que sirve para decidir.

De dónde sale cada regla (Müller-Brockmann, Rams, Nielsen, Krug, sus libros y las fuentes):
[`referencia.md`](referencia.md).

## 1. Qué entra y qué sale

- **Prueba de quitar:** por cada elemento, «si lo quito, ¿el usuario pierde algo para decidir o actuar?». Si no
  pierde nada, sale. Si pierde, se queda aunque ocupe.
- **Nada se dice dos veces.** Si una sección ya muestra algo (las propiedades, los asesores), no hay otra que
  lo anuncie, ni un párrafo que lo explique, ni una etiqueta que repita lo que el dato ya dice («Precio:»,
  «Código:», «Ubicación:»).
- **Poco texto:** la página no puede parecer un libro. Un título y, si hace falta, una línea. A cada párrafo
  se le quita la mitad de las palabras, y después la mitad de lo que quede.
- **Una señal por idea:** si un punto de color ya dice el estado, no se repite en una etiqueta.
- **No irse al otro extremo:** quitar ruido no es quitar información. En una propiedad siempre se ven precio,
  operación, nombre, zona, cuartos, baños, parqueos o personas, m² y estado.
- **Patrones conocidos antes que inventos:** un portal de casas muestra el precio primero.

## 2. Medidas

| Qué | Regla |
|---|---|
| Espacios (padding, margen, separación) | Solo múltiplos de 4 px: 4, 8, 12, 16, 20, 24, 32 |
| Interlineado | Múltiplo de 4: letra de 14 con línea de 20; letra de 12 con línea de 16 |
| Líneas de un mismo bloque | Pegadas (0 o 4 px) |
| Entre bloques de una pieza | 8 o 12 px |
| Entre secciones | 24 o 32 px |
| Margen lateral en celular | 12 o 16 px |
| Tamaños de letra por pantalla | 12, 14 y 16 px; uno más grande solo para el título de la página |
| Pesos | Dos: normal y seminegrita |
| Área de toque | 44 px como mínimo, aunque el ícono se vea de 16 a 20 px |
| Listas del panel en celular | Al menos 3.5 registros por pantalla |

- **Tres niveles de texto**, con los colores de `css/tema.css`: principal (nombre, precio), secundario (zona,
  datos) y tenue (fecha, código, unidades).
- **Números tabulares** (`font-variant-numeric: tabular-nums`) en precios, fechas, medidas y contadores.
  Los códigos de inventario van en letra monoespaciada.
- **Letra:** Work Sans, la del sitio.

## 3. Retícula y alineación

- Todo se alinea a un eje: el mismo borde izquierdo para el texto, la misma columna para los íconos, el
  mismo padding en las piezas hermanas.
- Una foto al lado de texto mide lo mismo que ese texto, sin hueco arriba ni abajo.
- Un dato corto (código, fecha) nunca ocupa una línea propia: va al lado de otro.
- Un botón o ícono no agranda su fila: su área de toque se monta sobre una línea que ya existe.
- Cero scroll de lado. Un nombre largo usa dos líneas como máximo; después, «…».
- Lo más importante, arriba y a la izquierda. Lo que más se toca, al alcance del pulgar (abajo a la derecha
  en celular).

## 4. Bordes, cajas y color

- La jerarquía sale del espacio, el tamaño y el peso de la letra, no de cajas.
- Las filas y las secciones se separan con una línea fina de 1 px (el color de borde de `css/tema.css`).
  Nunca un recuadro dentro de otro, ni sombras, degradados o chips de adorno.
- Un color, un significado: verde se ve, gris oculta, ámbar reservada o falta algo, rojo vendida o borrar,
  azul la acción principal. Colores solo de `css/tema.css`.
- Estados: una píldora compacta (24 a 28 px de alto, letra de 12) con un punto de color, o solo el punto.
- Sobre una foto, como mucho una etiqueta, en una esquina.

## 5. Celular: íconos, no textos

- Lo que se entiende con un ícono va en ícono, con su `title` y su `aria-label`:
  - acciones: «+» nueva, ✓ elegir varias, X cerrar, ↗ ver el sitio, ⋮ más;
  - estados: el ojo si sale en la página, el ojo tachado si no;
  - avisos: ⚠ con el número de datos que faltan;
  - datos: cama, baño, carro, personas, m²;
  - contacto: teléfono, chat, correo.
- El texto queda para lo que ningún ícono dice bien: precio, nombre, zona y el estado en una palabra.
- En un grupo de datos, todos con ícono o todos con texto.
- No se repite un título que la barra de arriba ya dice.
- Tocar la fila abre la ficha. Las acciones secundarias van en un solo ⋮; borrar, al final y en rojo.

## 6. Antes de mostrar un diseño (siempre)

1. **Como usuario:** Claude recorre la pantalla con una tarea («quiero saber cuánto cuesta y dónde está»,
   «quiero cambiar su estado con una mano») y anota lo que no pudo ver o hacer.
2. **Prueba de los 5 segundos:** se entiende qué es la pantalla, qué es lo principal y dónde se toca. Si no,
   falta jerarquía o sobra ruido.
3. **Medir** con Playwright a 390 px (celular), 820 px (tableta) y 1280 px (computadora):
   - que la página mida lo mismo que la ventana (sin scroll de lado);
   - los textos cortados (`scrollWidth > clientWidth` o `scrollHeight > clientHeight`);
   - las áreas de toque (≥ 44 px);
   - que cada espacio sea múltiplo de 4;
   - cuántos tamaños de letra hay;
   - el alto total de la página contra el de hoy.
4. **Mirar la captura** de cada tamaño: huecos, una línea propia para un dato corto, texto repetido, una foto
   más alta que su texto.
5. **Con los datos difíciles:** un nombre largo, una casa sin foto, una lista de veinte.
6. **Decir lo que no se resolvió.**
7. **Diseño nuevo o grande:** primero la propuesta, a tamaño real en celular y computadora, y el sí del
   usuario. Después se programa, y solo lo aprobado.
