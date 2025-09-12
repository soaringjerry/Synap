#!/usr/bin/env bash
set -euo pipefail

# Start backend (air) and frontend dev server if present

cd /workspace

have_frontend=0
if [ -f frontend/package.json ]; then
  have_frontend=1
fi

if [ "$have_frontend" = "1" ]; then
  echo "[dev] Installing frontend deps..."
  npm ci --prefix frontend || npm install --prefix frontend
fi

echo "[dev] Starting backend with air..."
"$(go env GOPATH)"/bin/air &
BACK_PID=$!

if [ "$have_frontend" = "1" ]; then
  echo "[dev] Starting frontend dev server..."
  (cd frontend && npm run dev) &
  FRONT_PID=$!
else
  FRONT_PID=""
fi

cleanup() {
  echo "[dev] Shutting down..."
  if [ -n "$FRONT_PID" ]; then kill "$FRONT_PID" 2>/dev/null || true; fi
  kill "$BACK_PID" 2>/dev/null || true
  wait "$BACK_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait -n "$BACK_PID" ${FRONT_PID:+"$FRONT_PID"}

