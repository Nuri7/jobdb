#!/bin/bash
cd /Users/admin/Documents/jobdb/pipeline
export COMPANY_CONCURRENCY=15
LOG=recovery.log
echo "=== RECOVERY start $(date) ===" > "$LOG"
echo "--- resolve --stale (re-find pages for broken + verified-but-empty) ---" >> "$LOG"
npx tsx src/cli.ts resolve --stale >> "$LOG" 2>&1
echo "--- resolve done $(date); sharded re-scrape (network capture) ---" >> "$LOG"
FORCE=1 ./run-backfill-sharded.sh >> "$LOG" 2>&1
echo "=== RECOVERY done $(date) ===" >> "$LOG"
tail -6 "$LOG"
