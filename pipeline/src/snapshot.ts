import { createDb, type Db } from './db.js';

/**
 * Record one row of company/job metrics into pipeline_snapshots and print a summary,
 * including week-over-week deltas vs the previous snapshot. This is the stored weekly
 * log of what's being added and removed.
 */

// The Supabase query builder is deeply generic; `any` on the filter chain keeps this readable.
type Filter = (q: any) => any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function count(db: Db, table: string, apply: Filter): Promise<number> {
  const { count, error } = await apply(db.from(table).select('id', { count: 'exact', head: true }));
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

interface Metrics {
  companies_total: number;
  companies_active: number;
  companies_dead: number;
  companies_added_7d: number;
  jobs_open: number;
  jobs_verified_open: number;
  jobs_closed_total: number;
  jobs_added_7d: number;
  jobs_closed_7d: number;
}

const sign = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

export async function snapshotCommand(opts: { dryRun: boolean }): Promise<void> {
  const db = createDb({ readOnly: opts.dryRun });
  const daysAgo = (d: number): string => new Date(Date.now() - d * 86_400_000).toISOString();
  const wk = daysAgo(7);

  const m: Metrics = {
    companies_total: await count(db, 'company_career_sites', (q) => q),
    companies_active: await count(db, 'company_career_sites', (q) => q.eq('is_scrape_enabled', true)),
    companies_dead: await count(db, 'company_career_sites', (q) => q.eq('career_page_status', 'dead')),
    companies_added_7d: await count(db, 'company_career_sites', (q) => q.gte('created_at', wk)),
    jobs_open: await count(db, 'job_opportunities', (q) => q.eq('status', 'open')),
    jobs_verified_open: await count(db, 'job_opportunities', (q) => q.eq('status', 'open').eq('verified', true)),
    jobs_closed_total: await count(db, 'job_opportunities', (q) => q.eq('status', 'closed')),
    jobs_added_7d: await count(db, 'job_opportunities', (q) => q.gte('first_seen_at', wk)),
    jobs_closed_7d: await count(db, 'job_opportunities', (q) => q.gte('closed_at', wk).eq('status', 'closed')),
  };

  // Previous snapshot → week-over-week deltas.
  const prevRes = await db
    .from('pipeline_snapshots')
    .select('taken_at, companies_total, jobs_open, jobs_verified_open')
    .order('taken_at', { ascending: false })
    .limit(1);
  const prev = (prevRes.data ?? [])[0] as
    | { taken_at: string; companies_total: number; jobs_open: number; jobs_verified_open: number }
    | undefined;

  console.log(`\njobdb snapshot @ ${new Date().toISOString()}`);
  console.log(
    `  companies: ${m.companies_total} total  (${m.companies_active} active, ${m.companies_dead} dead)  |  +${m.companies_added_7d} added last 7d`,
  );
  console.log(
    `  jobs open: ${m.jobs_open}  (${m.jobs_verified_open} verified)  |  closed archive: ${m.jobs_closed_total}`,
  );
  console.log(`  job churn last 7d:  +${m.jobs_added_7d} added,  -${m.jobs_closed_7d} closed`);
  if (prev) {
    const days = Math.max(1, Math.round((Date.now() - Date.parse(prev.taken_at)) / 86_400_000));
    console.log(
      `  since last snapshot (${days}d ago):  companies ${sign(m.companies_total - prev.companies_total)},  open jobs ${sign(m.jobs_open - prev.jobs_open)},  verified ${sign(m.jobs_verified_open - prev.jobs_verified_open)}`,
    );
  } else {
    console.log('  (first snapshot — week-over-week deltas begin from the next run)');
  }

  if (opts.dryRun) {
    console.log('  [dry-run] not stored');
    return;
  }
  const ins = await db.from('pipeline_snapshots').insert(m);
  if (ins.error) throw new Error(`snapshot insert: ${ins.error.message}`);
  console.log('  stored in pipeline_snapshots ✓');
}
