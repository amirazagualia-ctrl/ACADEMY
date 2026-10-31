#!/usr/bin/env bash
# ============================================================
# Rahma Academy — capture continue des logs Cloudflare (wrangler tail)
# - Reconnexion automatique si `wrangler tail` se termine (réseau, redéploiement)
# - Rotation des fichiers locaux par taille (LOG_MAX_MB) et conservation (LOG_KEEP)
# - Format : une ligne JSON par événement (sortie `--format json` de wrangler)
# - Optionnel : analyse en temps réel via analyze-logs.mjs (ANALYZE=1)
#
# Usage :
#   scripts/monitoring/tail-logs.sh                      # projet Pages par défaut (wrangler.jsonc)
#   PROJECT=webapp ENVIRONMENT=production scripts/monitoring/tail-logs.sh
#   ANALYZE=1 scripts/monitoring/tail-logs.sh            # pipe vers l'analyseur (alertes)
#   STATUS=error scripts/monitoring/tail-logs.sh         # ne garder que les erreurs côté Cloudflare
# Variables : LOG_DIR (./logs) · LOG_MAX_MB (50) · LOG_KEEP (14) · RECONNECT_DELAY (5)
# Prérequis : wrangler authentifié (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID) — jamais `wrangler login` en sandbox.
# ============================================================
set -euo pipefail

PROJECT="${PROJECT:-$(node -e "try{console.log(require('./wrangler.jsonc'.replace('.jsonc','.json'))?.name||'')}catch{console.log('')}" 2>/dev/null || true)}"
PROJECT="${PROJECT:-webapp}"
ENVIRONMENT="${ENVIRONMENT:-production}"
LOG_DIR="${LOG_DIR:-./logs}"
LOG_MAX_MB="${LOG_MAX_MB:-50}"
LOG_KEEP="${LOG_KEEP:-14}"
RECONNECT_DELAY="${RECONNECT_DELAY:-5}"
STATUS="${STATUS:-}"          # ok | error | canceled (filtre wrangler)
ANALYZE="${ANALYZE:-0}"
MODE="${MODE:-pages}"         # pages | worker

mkdir -p "$LOG_DIR"
CURRENT="$LOG_DIR/current.jsonl"
touch "$CURRENT"

log() { printf '%s [tail-logs] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

rotate_if_needed() {
  local size_mb
  size_mb=$(du -m "$CURRENT" 2>/dev/null | cut -f1 || echo 0)
  if [ "${size_mb:-0}" -ge "$LOG_MAX_MB" ]; then
    local stamp; stamp=$(date -u +%Y%m%d-%H%M%S)
    mv "$CURRENT" "$LOG_DIR/logs-$stamp.jsonl"
    gzip -f "$LOG_DIR/logs-$stamp.jsonl" &
    touch "$CURRENT"
    log "rotation → logs-$stamp.jsonl.gz"
    # conservation : supprimer les archives au-delà de LOG_KEEP
    ls -1t "$LOG_DIR"/logs-*.jsonl.gz 2>/dev/null | tail -n +$((LOG_KEEP + 1)) | xargs -r rm -f
  fi
}

build_cmd() {
  local -a cmd
  if [ "$MODE" = "pages" ]; then
    cmd=(npx wrangler pages deployment tail --project-name "$PROJECT" --environment "$ENVIRONMENT" --format json)
  else
    cmd=(npx wrangler tail "$PROJECT" --format json)
  fi
  [ -n "$STATUS" ] && cmd+=(--status "$STATUS")
  printf '%q ' "${cmd[@]}"
}

trap 'log "arrêt demandé"; exit 0' INT TERM

log "projet=$PROJECT env=$ENVIRONMENT mode=$MODE dir=$LOG_DIR rotation=${LOG_MAX_MB}Mo garde=$LOG_KEEP analyse=$ANALYZE"
while true; do
  CMD=$(build_cmd)
  log "connexion : $CMD"
  # Chaque ligne : horodatage ajouté si absent, écriture append + rotation, puis analyse optionnelle
  # shellcheck disable=SC2086
  eval "$CMD" 2>>"$LOG_DIR/tail.err" | while IFS= read -r line; do
    [ -z "$line" ] && continue
    printf '%s\n' "$line" >> "$CURRENT"
    rotate_if_needed
    if [ "$ANALYZE" = "1" ]; then printf '%s\n' "$line"; fi
  done | { if [ "$ANALYZE" = "1" ]; then node "$(dirname "$0")/analyze-logs.mjs" --stdin; else cat >/dev/null; fi; }
  log "flux terminé — reconnexion dans ${RECONNECT_DELAY}s"
  sleep "$RECONNECT_DELAY"
done
