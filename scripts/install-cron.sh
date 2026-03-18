#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRON_CMD="0 2 * * * cd $ROOT_DIR && $ROOT_DIR/scripts/daily-decay.sh >> $ROOT_DIR/memory-decay.log 2>&1"

( crontab -l 2>/dev/null | grep -Fv "$ROOT_DIR/scripts/daily-decay.sh" ; echo "$CRON_CMD" ) | crontab -

echo "Installed daily decay cron:"
echo "$CRON_CMD"
