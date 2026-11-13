#!/usr/bin/env bash
# Levanta el emulador de Firestore con firestore.rules, corre scripts/emulador/test-reglas.mjs y lo apaga.
# Necesita Java. El emulador se descarga una vez y queda en la carpeta temporal del sistema.
set -euo pipefail
cd "$(dirname "$0")/../.."
JAR="${TMPDIR:-/tmp}/cloud-firestore-emulator-v1.19.8.jar"
[ -s "$JAR" ] || curl -fsSL -o "$JAR" https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.19.8.jar
java -jar "$JAR" --host=127.0.0.1 --port=8085 --rules=firestore.rules > "${TMPDIR:-/tmp}/emulador-firestore.log" 2>&1 &
EMULADOR=$!
trap 'kill $EMULADOR 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:8085/ && break; sleep 0.5; done
node scripts/emulador/test-reglas.mjs
