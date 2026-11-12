#!/bin/bash
set -Eeuo pipefail

python -m uvicorn ai_service.main:app --host 127.0.0.1 --port 8000 &
ai_pid=$!

node server/index.mjs &
node_pid=$!

shutdown() {
  trap - INT TERM
  kill -TERM "$ai_pid" "$node_pid" 2>/dev/null || true
  wait "$ai_pid" 2>/dev/null || true
  wait "$node_pid" 2>/dev/null || true
}

trap shutdown INT TERM

set +e
wait -n "$ai_pid" "$node_pid"
status=$?
set -e

shutdown
exit "$status"
