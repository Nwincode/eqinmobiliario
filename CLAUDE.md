# Reglas para trabajar en este repositorio

## Regla obligatoria del chat: /compact al 15 % de uso
Cuando la sesión llegue al 15 % de uso del contexto se hace `/compact`, antes de seguir con cualquier otra cosa:
1. Hacer commit y push de todo el trabajo hecho hasta ese momento, en la rama del chat.
2. Compactar dejando claro qué se pidió, qué quedó hecho y qué falta.
3. Seguir en este mismo chat; no abrir otro para la página, para no tener versiones separadas.

`.claude/settings.json` hace que la compactación automática ocurra al 15 % de uso
(`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`).

## Otras reglas
- Un solo chat a la vez para la página eqinmobiliario.gt; no mezclar con el proyecto "ptg".
- No pedir ni aceptar contraseñas. No compartir el JSON de la cuenta de servicio (clave privada).
- No crear pull requests si no se piden.
- Los colores salen de `css/tema.css` y de Contenido → Colores del panel; no escribir colores a mano.
- Los íconos siempre deben referirse a lo que se habla.
