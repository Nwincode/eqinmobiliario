#!/bin/sh
# Netlify corre esto antes de generar el sitio: salida 0 = no generarlo (ahorra créditos); 1 = generarlo.
# Se salta solo cuando entre la publicación anterior y esta cambiaron únicamente documentos o pruebas.
# Siempre se genera con «Publicar» del panel (gancho de compilación: contenido nuevo de la base), al volver a publicar
# a mano el mismo commit o si no se sabe cuál fue el anterior.
# Vistas previas y ramas: nunca (se prueba en el entorno de Claude antes de unir); solo la publicación real.
if [ -n "$CONTEXT" ] && [ "$CONTEXT" != "production" ]; then exit 0; fi
[ -n "$INCOMING_HOOK_URL$INCOMING_HOOK_TITLE$INCOMING_HOOK_BODY" ] && exit 1
if [ -z "$CACHED_COMMIT_REF" ] || [ "$CACHED_COMMIT_REF" = "$COMMIT_REF" ]; then exit 1; fi
git cat-file -e "$CACHED_COMMIT_REF^{commit}" 2>/dev/null || exit 1
git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- . ':(exclude)docs' ':(exclude)scripts/entorno' ':(exclude)scripts/test-*' \
	':(exclude)CLAUDE.md' ':(exclude)README.md' ':(exclude)research_notes' ':(exclude)reports' && exit 0
exit 1
