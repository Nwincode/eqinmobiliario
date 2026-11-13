#!/usr/bin/env bash
# Entorno de pruebas local: una copia del sistema completo (panel, sitio y funciones) contra los emuladores
# de Firebase (inicio de sesión, base de datos con firestore.rules y fotos con storage.rules), con datos inventados.
# Nada de aquí toca la base real.
#   bash scripts/entorno/levantar.sh            levanta todo y deja el sitio en http://localhost:8090
#   bash scripts/entorno/levantar.sh publicar   vuelve a generar el sitio (lo que hace «Publicar» en el panel)
#   bash scripts/entorno/levantar.sh apagar
# Necesita Java y acceso a npm. La primera vez descarga los emuladores (unos minutos).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${ENTORNO_DIR:-${TMPDIR:-/tmp}/eq-entorno}"
PUERTO="${PORT:-8090}"
export CORREOS="$DIR/correos.jsonl"
mkdir -p "$DIR"

copiar() {
	rm -rf "$DIR/sitio" && mkdir -p "$DIR/sitio"
	(cd "$REPO" && tar cf - --exclude=./.git --exclude=./dist --exclude=./node_modules .) | tar xf - -C "$DIR/sitio"
	ln -s "$REPO/node_modules" "$DIR/sitio/node_modules"
	# Misma configuración, pero apuntando al proyecto de mentira y a los emuladores.
	node -e "
		const fs = require('fs'), f = '$DIR/sitio/site.config.json', c = JSON.parse(fs.readFileSync(f));
		c.siteUrl = 'http://localhost:$PUERTO';
		c.firebase = { apiKey: 'pruebas', projectId: 'demo-eq', appId: 'pruebas', authDomain: 'demo-eq.firebaseapp.com', storageBucket: 'demo-eq.appspot.com' };
		c.emuladores = { auth: '127.0.0.1:9099', firestore: '127.0.0.1:8085', storage: '127.0.0.1:9199' };
		fs.writeFileSync(f, JSON.stringify(c, null, '\t'));"
}
publicar() { (cd "$DIR/sitio" && node --import ./scripts/entorno/red-local.mjs scripts/build.mjs | tail -2); }
apagar() { pkill -f "scripts/entorno/servidor.mjs" 2>/dev/null || true; pkill -f "firebase emulators:start" 2>/dev/null || true; pkill -f "cloud-firestore-emulator" 2>/dev/null || true; pkill -f "cloud-storage-rules-runtime" 2>/dev/null || true; }

case "${1:-levantar}" in
	apagar) apagar; echo "Entorno apagado."; exit 0 ;;
	publicar) copiar; publicar; pkill -f "scripts/entorno/servidor.mjs" 2>/dev/null || true ;;
	levantar)
		apagar; sleep 1
		[ -d "$DIR/node_modules/firebase-tools" ] || (cd "$DIR" && npm init -y >/dev/null && npm i --no-audit --no-fund firebase-tools@15.36.0 firebase@10.12.2 >/dev/null)
		ln -sf "$REPO/firestore.rules" "$DIR/firestore.rules"; ln -sf "$REPO/storage.rules" "$DIR/storage.rules"
		cat > "$DIR/firebase.json" <<JSON
{ "firestore": { "rules": "firestore.rules" }, "storage": { "rules": "storage.rules" },
  "emulators": { "auth": { "host": "127.0.0.1", "port": 9099 }, "firestore": { "host": "127.0.0.1", "port": 8085 },
    "storage": { "host": "127.0.0.1", "port": 9199 }, "ui": { "enabled": false }, "singleProjectMode": true } }
JSON
		: > "$DIR/emuladores.log"; : > "$CORREOS"
		# La salida va al archivo desde el subproceso mismo: si heredara la de este guion, quien lo llamó se quedaría esperando.
		# Sin las variables de proxy del sistema: los emuladores se hablan entre sí por 127.0.0.1 (la regla de Storage
		# consulta Firestore) y un proxy en medio les corta esa llamada.
		(cd "$DIR" && exec env -u JAVA_TOOL_OPTIONS -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
			nohup npx firebase emulators:start --only auth,firestore,storage --project demo-eq) >> "$DIR/emuladores.log" 2>&1 < /dev/null &
		for _ in $(seq 1 120); do grep -q "All emulators ready" "$DIR/emuladores.log" && break; sleep 1; done
		grep -q "All emulators ready" "$DIR/emuladores.log" || { echo "Los emuladores no arrancaron:"; tail -20 "$DIR/emuladores.log"; exit 1; }
		copiar
		(cd "$DIR/sitio" && node scripts/entorno/sembrar.mjs)
		publicar ;;
	*) echo "Uso: levantar.sh [levantar|publicar|apagar]"; exit 1 ;;
esac
(cd "$DIR/sitio" && PORT="$PUERTO" exec nohup node --import ./scripts/entorno/red-local.mjs scripts/entorno/servidor.mjs) > "$DIR/servidor.log" 2>&1 < /dev/null &
for _ in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PUERTO/" && break; sleep 0.5; done
echo "Listo: sitio en http://localhost:$PUERTO · panel en http://localhost:$PUERTO/admin/ · correos en $CORREOS"
