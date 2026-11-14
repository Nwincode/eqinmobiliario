#!/usr/bin/env bash
# Levanta limpios los emuladores de Firestore (firestore.rules, puerto 8085) y de Storage (storage.rules, puerto 9199),
# corre scripts/emulador/test-reglas.mjs y los apaga. Las reglas de Storage consultan Firestore: por eso van juntos,
# con firebase-tools (se instala una vez en la carpeta temporal del sistema). Necesita Java.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="${TMPDIR:-/tmp}"
HERR="$TMP/eq-firebase-tools"
[ -x "$HERR/node_modules/.bin/firebase" ] || (mkdir -p "$HERR" && cd "$HERR" && npm init -y >/dev/null && npm i --no-audit --no-fund firebase-tools@15.36.0 >/dev/null)
CONF="$(mktemp -d "$TMP/eq-reglas-XXXXXX")"
trap 'cp "$CONF"/*-debug.log "$TMP"/ 2>/dev/null; rm -rf "$CONF"' EXIT
ln -s "$REPO/firestore.rules" "$CONF/firestore.rules"; ln -s "$REPO/storage.rules" "$CONF/storage.rules"
cat > "$CONF/firebase.json" <<JSON
{ "firestore": { "rules": "firestore.rules" }, "storage": { "rules": "storage.rules" },
  "emulators": { "firestore": { "host": "127.0.0.1", "port": 8085 }, "storage": { "host": "127.0.0.1", "port": 9199 },
    "ui": { "enabled": false }, "singleProjectMode": true } }
JSON
# Sin las variables de proxy: los emuladores se hablan entre sí por 127.0.0.1 (la regla de Storage consulta Firestore).
cd "$CONF"
env -u JAVA_TOOL_OPTIONS -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
	"$HERR/node_modules/.bin/firebase" emulators:exec --only firestore,storage --project demo-eq "node $REPO/scripts/emulador/test-reglas.mjs"
