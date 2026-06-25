#!/bin/bash
# Restart API WITHOUT recompiling (use when source hasn't changed)
# For a full recompile+restart, use scripts/start-api.sh instead

ROOT="/mnt/c/Users/anant/Videos/pdash"
TMP_OUT="/tmp/pdash-api-dist"

echo "==> Killing any existing process on port 4000..."
fuser -k 4000/tcp 2>/dev/null && echo "    Killed old process." || echo "    No process was running."
sleep 1

if [ ! -f "$TMP_OUT/main.js" ]; then
  echo "ERROR: $TMP_OUT/main.js not found. Run scripts/start-api.sh first to compile."
  exit 1
fi

echo "==> Starting API on http://localhost:4000 (using existing build)..."
echo ""
exec env NODE_PATH="$ROOT/node_modules" node "$TMP_OUT/main.js"
