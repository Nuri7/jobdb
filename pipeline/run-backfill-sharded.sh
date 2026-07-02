#!/bin/bash
# Parallel backfill: N independent processes, each scraping a disjoint uuid shard.
# Uses the machine's idle cores (work is network-I/O-bound, not CPU-bound).
cd /Users/admin/Documents/jobdb/pipeline
export COMPANY_CONCURRENCY=12
N=4
LOG=backfill.log
FORCE_FLAG="${FORCE:+--force}"   # run with FORCE=1 to re-extract every company (bypass change-detection)
echo "=== SHARDED BACKFILL start $(date), $N shards x $COMPANY_CONCURRENCY ${FORCE_FLAG} ===" >> "$LOG"

run_shard() {
  local k=$1
  for i in $(seq 1 12); do
    echo "[shard $k] chunk $i $(date +%H:%M)" >> "$LOG.$k"
    npx tsx src/cli.ts refresh --budget-min 50 --shard "$k/$N" $FORCE_FLAG >> "$LOG.$k" 2>&1
    remaining=$(npx tsx -e "(async()=>{const{createDb,pickDueCompanies}=await import('./src/db.js');const d=createDb({});const r=await pickDueCompanies(d,1,{k:$k,n:$N});console.log(r.length)})()" 2>/dev/null || echo 1)
    echo "[shard $k] remaining due: $remaining" >> "$LOG.$k"
    [ "$remaining" = "0" ] && break
  done
  echo "[shard $k] DONE $(date)" >> "$LOG.$k"
}

for k in $(seq 0 $((N-1))); do
  run_shard "$k" &
done
wait
echo "=== SHARDED BACKFILL all shards done $(date) ===" >> "$LOG"
tail -2 "$LOG"
