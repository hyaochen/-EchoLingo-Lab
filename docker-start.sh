#!/bin/sh
set -eu

API_PORT="${API_PORT:-8787}"
WEB_PORT="${WEB_PORT:-5173}"

mkdir -p /app/data /app/data/backups

echo "[lang] starting api on :${API_PORT}"
npx tsx server/index.ts &
API_PID=$!

echo "[lang] starting vite preview on :${WEB_PORT}"
npx vite preview --host 0.0.0.0 --port "${WEB_PORT}" --strictPort &
WEB_PID=$!

cleanup() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}

trap cleanup INT TERM

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 1
done

cleanup
wait "$API_PID" 2>/dev/null || true
wait "$WEB_PID" 2>/dev/null || true
exit 1
