import { createDb, type Db } from './db.js';
import { ATS_NAMES, type SourceType } from './types.js';

async function countWhere(db: Db, table: string, filters: Record<string, string>): Promise<number> {
  let q = db.from(table).select('id', { count: 'exact', head: true });
  for (const [col, val] of Object.entries(filters)) {
    q = val.startsWith('!') ? q.neq(col, val.slice(1)) : q.eq(col, val);
  }
  const res = await q;
  if (res.error) return -1;
  return res.count ?? 0;
}

export async function statsCommand(format: 'text' | 'md' | 'json'): Promise<void> {
  const db = createDb({ readOnly: true });

  const statuses = ['verified', 'unverified', 'dead', 'ambiguous'];
  const sourceTypes: SourceType[] = [...ATS_NAMES.map((a) => `ats:${a}` as SourceType), 'sitemap', 'static', 'rendered'];

  const [totalCompanies, enabled, ...statusCounts] = await Promise.all([
    countWhere(db, 'company_career_sites', {}),
    countWhere(db, 'company_career_sites', { is_scrape_enabled: 'true' }),
    ...statuses.map((s) => countWhere(db, 'company_career_sites', { career_page_status: s })),
  ]);
  const sourceCounts = await Promise.all(
    sourceTypes.map((t) => countWhere(db, 'company_career_sites', { source_type: t })),
  );
  const [openJobs, closedJobs] = await Promise.all([
    countWhere(db, 'job_opportunities', { status: 'open' }),
    countWhere(db, 'job_opportunities', { status: 'closed' }),
  ]);

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const historyRes = await db
    .from('scrape_history')
    .select('status, error_message, method')
    .gte('started_at', dayAgo)
    .limit(5000);
  const history = historyRes.data ?? [];
  const histBy = new Map<string, number>();
  const errors = new Map<string, number>();
  for (const h of history as Array<{ status: string; error_message: string | null }>) {
    histBy.set(h.status, (histBy.get(h.status) ?? 0) + 1);
    if (h.error_message) {
      const key = h.error_message.slice(0, 80);
      errors.set(key, (errors.get(key) ?? 0) + 1);
    }
  }
  const topErrors = [...errors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const freshRes = await db
    .from('company_career_sites')
    .select('id', { count: 'exact', head: true })
    .eq('is_scrape_enabled', true)
    .gte('last_success_at', new Date(Date.now() - 48 * 3_600_000).toISOString());
  const fresh48h = freshRes.count ?? 0;

  const data = {
    companies: {
      total: totalCompanies,
      enabled,
      by_status: Object.fromEntries(statuses.map((s, i) => [s, statusCounts[i] ?? 0])),
      by_source: Object.fromEntries(sourceTypes.map((t, i) => [t, sourceCounts[i] ?? 0]).filter(([, n]) => (n as number) > 0)),
      scraped_ok_last_48h: fresh48h,
    },
    jobs: { open: openJobs, closed: closedJobs },
    runs_last_24h: Object.fromEntries(histBy.entries()),
    top_errors_24h: topErrors.map(([msg, n]) => ({ n, msg })),
  };

  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const lines: string[] = [];
  const h = (s: string) => (format === 'md' ? `\n### ${s}\n` : `\n== ${s} ==`);
  lines.push(h('Companies'));
  lines.push(`total ${data.companies.total}, enabled ${data.companies.enabled}, fresh<48h ${data.companies.scraped_ok_last_48h}`);
  lines.push(
    'status: ' + Object.entries(data.companies.by_status).map(([k, v]) => `${k}=${v}`).join(', '),
  );
  const srcEntries = Object.entries(data.companies.by_source);
  if (srcEntries.length > 0) {
    lines.push('sources: ' + srcEntries.map(([k, v]) => `${k}=${v}`).join(', '));
  }
  lines.push(h('Jobs'));
  lines.push(`open ${data.jobs.open}, closed ${data.jobs.closed}`);
  lines.push(h('Runs last 24h'));
  lines.push(
    Object.entries(data.runs_last_24h).length > 0
      ? Object.entries(data.runs_last_24h).map(([k, v]) => `${k}=${v}`).join(', ')
      : 'none',
  );
  if (data.top_errors_24h.length > 0) {
    lines.push(h('Top errors 24h'));
    for (const e of data.top_errors_24h) lines.push(`${e.n}× ${e.msg}`);
  }
  console.log(lines.join('\n'));
}
