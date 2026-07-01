#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUPERVISOR_PID_FILE="$ROOT/data/dev-supervisor.pid"
LOG_FILE="$ROOT/data/dev.log"
PORT="${PORT:-3000}"

mkdir -p "$ROOT/data"

port_in_use() {
  ss -tlnp 2>/dev/null | grep -q ":${PORT} "
}

supervisor_alive() {
  [[ -f "$SUPERVISOR_PID_FILE" ]] || return 1
  kill -0 "$(cat "$SUPERVISOR_PID_FILE")" 2>/dev/null
}

stop_server() {
  if supervisor_alive; then
    echo "Stopping supervisor (pid $(cat "$SUPERVISOR_PID_FILE"))..."
    kill "$(cat "$SUPERVISOR_PID_FILE")" 2>/dev/null || true
    sleep 2
    kill -9 "$(cat "$SUPERVISOR_PID_FILE")" 2>/dev/null || true
  fi
  rm -f "$SUPERVISOR_PID_FILE"
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  fuser -k 3001/tcp 3002/tcp 2>/dev/null || true
  pkill -f "next dev" 2>/dev/null || true
  sleep 1
}

start_server() {
  if supervisor_alive; then
    if port_in_use; then
      echo "Dev server already running (supervisor pid $(cat "$SUPERVISOR_PID_FILE"))"
      echo "http://localhost:${PORT}"
      return 0
    fi
    echo "Supervisor alive but port ${PORT} down — restarting..."
    stop_server
  fi

  echo "Starting dev supervisor..."
  setsid "$ROOT/scripts/dev-supervisor.sh" >>"$LOG_FILE" 2>&1 &
  echo $! >"$SUPERVISOR_PID_FILE"

  for _ in $(seq 1 30); do
    sleep 1
    if port_in_use; then
      echo "Dev server running at http://localhost:${PORT}"
      echo "Supervisor pid: $(cat "$SUPERVISOR_PID_FILE")"
      echo "Logs: $LOG_FILE"
      return 0
    fi
  done

  echo "Dev server failed to start. Last log lines:"
  tail -30 "$LOG_FILE" || true
  stop_server
  exit 1
}

status_server() {
  if supervisor_alive; then
    echo "Supervisor: running (pid $(cat "$SUPERVISOR_PID_FILE"))"
  else
    echo "Supervisor: stopped"
  fi
  if port_in_use; then
    echo "Port ${PORT}: listening"
    ss -tlnp 2>/dev/null | grep ":${PORT} " || true
  else
    echo "Port ${PORT}: not listening"
  fi
}

CMD="${1:-start}"
case "$CMD" in
  start)   start_server ;;
  stop)    stop_server; echo "Stopped." ;;
  restart) stop_server; start_server ;;
  status)  status_server ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
