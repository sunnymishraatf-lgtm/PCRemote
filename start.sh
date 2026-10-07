#!/bin/sh
# PC Remote Server launcher (macOS / Linux)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "[PC Remote] Node.js is not installed. Install it from https://nodejs.org (LTS)."
  exit 1
fi
if [ ! -d "node_modules" ]; then
  echo "[PC Remote] First run — installing dependencies..."
  npm install --no-audit --no-fund || exit 1
fi
exec node server/index.js
