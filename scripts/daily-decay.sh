#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if command -v node >/dev/null 2>&1; then
  node scripts/memory_decay.js decay
elif command -v python3 >/dev/null 2>&1; then
  python3 scripts/memory_decay.py decay
else
  echo "Need node or python3 to run decay." >&2
  exit 1
fi
