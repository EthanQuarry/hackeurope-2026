#!/usr/bin/env bash
# Run both frontend and backend locally for development
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

trap 'kill 0' EXIT

# Ensure frontend deps are installed
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  cd "$ROOT/frontend" && npm install
fi

echo "Starting backend on :8000..."
cd "$ROOT/backend"
PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null)
"$PYTHON" run.py &

echo "Starting frontend on :3000..."
cd "$ROOT/frontend"
npx next dev --turbopack &

wait
