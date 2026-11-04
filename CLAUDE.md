# Reglas para trabajar en este repositorio

## Regla obligatoria del chat: al quedar 15 % de contexto
Cuando el chat llegue al 85 % de uso (queda 15 % libre), antes de seguir con cualquier otra cosa:
1. Hacer commit y push de todo el trabajo hecho hasta ese momento, en la rama del chat.
2. Resumir el chat (compactar) dejando claro qué se pidió, qué quedó hecho y qué falta.
3. Seguir en este mismo chat; no abrir otro para la página, para no tener versiones separadas.

`.claude/settings.json` adelanta la compactación automática al 85 % (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`)
para que esto ocurra antes de que se llene el chat.

## Otras reglas
- Un solo chat a la vez para la página eqinmobiliario.gt; no mezclar con el proyecto "ptg".
- No pedir ni aceptar contraseñas. No compartir el JSON de la cuenta de servicio (clave privada).
- No crear pull requests si no se piden.
- Los colores salen de `css/tema.css` y de Contenido → Colores del panel; no escribir colores a mano.
- Los íconos siempre deben referirse a lo que se habla.
