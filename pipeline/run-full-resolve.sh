#!/bin/bash
cd /Users/admin/Documents/jobdb/pipeline
export COMPANY_CONCURRENCY=18
LOG=resolve-full.log
echo "=== FULL RESOLVE start $(date) ===" >> "$LOG"
for i in $(seq 1 14); do
  echo "--- chunk $i $(date +%H:%M) ---" >> "$LOG"
  npx tsx src/cli.ts resolve --limit 400 >> "$LOG" 2>&1
  # stop when nothing left to resolve
  remaining=$(npx tsx src/cli.ts stats --format json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['companies']['by_status'].get('unverified',0))")
  echo "--- after chunk $i: unverified=$remaining ---" >> "$LOG"
  [ "${remaining:-0}" -lt 10 ] && break
done
echo "=== FULL RESOLVE done $(date) ===" >> "$LOG"
tail -12 "$LOG"
