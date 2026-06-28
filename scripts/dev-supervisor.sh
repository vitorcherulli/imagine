#!/usr/bin/env bash
# Keeps `next dev` alive — restarts automatically on crash.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$ROOT/data/dev.log"
PORT="${PORT:-3000}"
RESTART_DELAY="${RESTART_DELAY:-3}"

cd "$ROOT"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

cleanup() {
  log "Supervisor stopping — killing dev server on port ${PORT}..."
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  exit 0
}

trap cleanup SIGTERM SIGINT

while true; do
  log "Starting dev server on port ${PORT}..."
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  sleep 1

  set +e
  PORT="$PORT" npm run dev >>"$LOG_FILE" 2>&1
  EXIT=$?
  set -e

  log "Dev server exited (code ${EXIT}). Restarting in ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"
done
