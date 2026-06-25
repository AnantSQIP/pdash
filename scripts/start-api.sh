#!/bin/bash
# Start the NestJS API with WSL2 workarounds
# - Kills any existing process on port 4000
# - Compiles TypeScript to /tmp (WSL2 cannot write compiled output to /mnt/c/)
# - Starts with NODE_PATH pointing to the monorepo node_modules

set -e

ROOT="/mnt/c/Users/anant/Videos/pdash"
TMP_OUT="/tmp/pdash-api-dist"

echo ""
echo "==> [1/3] Killing any existing process on port 4000..."
fuser -k 4000/tcp 2>/dev/null && echo "    Killed old process." || echo "    No process was running."
sleep 1

echo ""
echo "==> [2/3] Compiling TypeScript to $TMP_OUT ..."
cd "$ROOT"
npx tsc -p apps/api/tsconfig.json --outDir "$TMP_OUT"
echo "    Compile complete."

echo ""
echo "==> [3/3] Starting API on http://localhost:4000 ..."
echo ""
exec env NODE_PATH="$ROOT/node_modules" node "$TMP_OUT/main.js"
