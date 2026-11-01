#!/usr/bin/env bash
# Lancement durci de wrangler pages dev (appelé par PM2).
# 1) aucun core dump possible  2) port 3000 libéré  3) dist/ reconstruit s'il manque  4) core* résiduels supprimés
set -u
cd "$(dirname "$0")/.." || exit 1
ulimit -c 0                                   # ← solution radicale : plus jamais de fichier core
rm -f core core.* 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
[ -f dist/_worker.js ] || { echo "[serve] dist/ absent → npm run build"; npm run build || exit 1; }
exec npx wrangler pages dev dist --ip 0.0.0.0 --port "${PORT:-3000}"
