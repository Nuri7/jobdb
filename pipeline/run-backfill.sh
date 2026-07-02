#!/bin/bash
cd /Users/admin/Documents/jobdb/pipeline
export COMPANY_CONCURRENCY=12
LOG=backfill.log
echo "=== BACKFILL start $(date) ===" >> "$LOG"
for i in $(seq 1 12); do
  echo "--- chunk $i $(date +%H:%M) ---" >> "$LOG"
  npx tsx src/cli.ts refresh --budget-min 50 >> "$LOG" 2>&1
  due=$(npx tsx src/cli.ts stats --format json 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin)['companies']['scraped_ok_last_48h'])" 2>/dev/null || echo "?")
  echo "--- after chunk $i: scraped_ok_48h=$due ---" >> "$LOG"
  # stop when a chunk processed nothing new (queue drained): check remaining due via a marker
  remaining=$(npx tsx -e "import{createDb,pickDueCompanies}from'./src/db.js';const d=createDb({});const r=await pickDueCompanies(d,1);console.log(r.length)" 2>/dev/null || echo 1)
  echo "--- remaining due: $remaining ---" >> "$LOG"
  [ "$remaining" = "0" ] && break
done
echo "=== BACKFILL done $(date) ===" >> "$LOG"
tail -4 "$LOG"
