#!/usr/bin/env bash
# One clean dev server — kills stale Next processes and rebuilds .next cache.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
cd "$ROOT"

echo "Stopping stale dev servers on ports 3000–3002..."
fuser -k 3000/tcp 3001/tcp 3002/tcp 2>/dev/null || true
sleep 2

if [[ -f "$ROOT/data/dev-supervisor.pid" ]]; then
  SUP_PID="$(cat "$ROOT/data/dev-supervisor.pid")"
  kill "$SUP_PID" 2>/dev/null || true
  rm -f "$ROOT/data/dev-supervisor.pid"
fi

echo "Clearing .next cache..."
rm -rf "$ROOT/.next"

echo "Starting dev server at http://localhost:${PORT}"
exec npx next dev -p "$PORT"
