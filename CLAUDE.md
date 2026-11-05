# Reglas para trabajar en este repositorio

## Regla obligatoria del chat: /compact al 15 % de uso
Cuando la sesión llegue al 15 % de uso del contexto se hace `/compact`, antes de seguir con cualquier otra cosa:
1. Hacer commit y push de todo el trabajo hecho hasta ese momento, en la rama del chat.
2. Compactar dejando claro qué se pidió, qué quedó hecho y qué falta.
3. Seguir en este mismo chat; no abrir otro para la página, para no tener versiones separadas.

`.claude/settings.json` hace que la compactación automática ocurra al 15 % de uso
(`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`).

## Regla obligatoria de diseño: siempre con agentes y con revisión final
Cada vez que se haga o se cambie un diseño (página, sección, tarjeta, panel, correo, imagen):
1. El diseño lo hace un agente (herramienta Agent), con estas reglas y los archivos del sitio como contexto.
2. Al terminar, otro agente lo revisa con capturas en celular y computadora. Busca qué se puede mejorar:
   - jerarquía, espacios y alineación;
   - contraste, accesibilidad y textos;
   - que se vea igual al resto del sitio.
3. Se aplican las mejoras que encuentre y se vuelve a revisar, hasta que no queden mejoras importantes.
4. Al usuario se le muestra la captura final y qué se mejoró.

### Botones de carrusel (anterior / siguiente)
Siempre minimalistas: solo el ícono de flecha `<` y `>`, sin texto ("Anterior", "Siguiente"),
sin cajas grandes ni rellenos pesados. Círculo o espacio discreto, flecha fina, colores de `css/tema.css`,
área de toque de al menos 44 px y `aria-label` para lectores de pantalla. Nunca volver al estilo con texto.

## Otras reglas
- Cuando el usuario haga una pregunta, responderla primero y de forma directa (sí/no y por qué); después proponer o hacer lo demás.
- Un solo chat a la vez para la página eqinmobiliario.gt; no mezclar con el proyecto "ptg".
- No pedir ni aceptar contraseñas. No compartir el JSON de la cuenta de servicio (clave privada).
- No crear pull requests si no se piden.
- Los colores salen de `css/tema.css` y de Contenido → Colores del panel; no escribir colores a mano.
- Los íconos siempre deben referirse a lo que se habla.
