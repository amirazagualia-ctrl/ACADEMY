#!/usr/bin/env bash
# Gardien (PM2 « webapp-guard ») : toutes les 60 s
#  - supprime tout core dump apparu (même si ulimit a été contourné)
#  - vérifie /api/health ; après 3 échecs consécutifs → pm2 restart webapp
#  - purge les archives de logs > 200 Mo dans logs/
set -u
cd "$(dirname "$0")/.." || exit 1
ulimit -c 0
FAILS=0
while true; do
  if ls core core.* >/dev/null 2>&1; then echo "[guard] core dump détecté → suppression"; rm -f core core.*; fi
  find . -maxdepth 1 -name 'core*' -size +50M -delete 2>/dev/null
  if [ -d logs ]; then find logs -name '*.jsonl' -size +200M -exec sh -c 'gzip -f "$1" || true' _ {} \; 2>/dev/null; fi
  if curl -s -m 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health | grep -q '^200$'; then
    FAILS=0
  else
    FAILS=$((FAILS+1)); echo "[guard] /api/health KO ($FAILS/3)"
    if [ "$FAILS" -ge 3 ]; then echo "[guard] → pm2 restart webapp"; pm2 restart webapp --update-env >/dev/null 2>&1 || pm2 start ecosystem.config.cjs --only webapp >/dev/null 2>&1; FAILS=0; sleep 20; fi
  fi
  sleep 60
done
