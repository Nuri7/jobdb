/**
 * One-off maintenance: recover companies the escalation bug (see lifecycle.ts) silently downgraded
 * off their sitemap. Targets enabled companies that STILL carry a sitemap_url in source_config but
 * whose source_type drifted to static/rendered — flips them back to sitemap, drops the stale
 * listing_hash so change-detection can't short-circuit, and re-scrapes via the sitemap source.
 *
 *   tsx src/recover-sitemaps.ts                 # zero-yield downgrades only (safe, pure upside)
 *   tsx src/recover-sitemaps.ts --include-partial   # also the ones still yielding some jobs
 *
 * Honors SITEMAP_DETAIL_CAP (default 250) — leaving it at the default keeps each big roster under a
 * site's volume rate-limit; the autopilot fills the remainder incrementally on later runs.
 */
import pLimit from 'p-limit';
import { config } from './config.js';
import { createDb, updateCompany } from './db.js';
import { buildCtx } from './refresh.js';
import { processCompany } from './lifecycle.js';
import { closeBrowser } from './sources/rendered.js';
import type { CompanyRow, SourceConfig, SourceType } from './types.js';

async function main(): Promise<void> {
  const includePartial = process.argv.includes('--include-partial');
  const cfg = config();
  const db = createDb({});
  const ctx = buildCtx(false);
  const pool = pLimit(cfg.COMPANY_CONCURRENCY);

  let query = db
    .from('company_career_sites')
    .select('*')
    .eq('is_scrape_enabled', true)
    .neq('source_type', 'sitemap')
    .not('source_config->>sitemap_url', 'is', null);
  if (!includePartial) query = query.eq('jobs_found_count', 0);
  const { data, error } = await query;
  if (error) throw new Error(`select downgraded: ${error.message}`);
  const companies = (data ?? []) as unknown as CompanyRow[];
  console.log(
    `Recovering ${companies.length} downgraded companies (${includePartial ? 'all' : 'zero-yield only'}) ` +
      `via sitemap; cap=${Number(process.env.SITEMAP_DETAIL_CAP) || 250}…`,
  );

  let ok = 0;
  let recovered = 0;
  let failed = 0;
  let nochange = 0;
  let totalOpen = 0;
  let added = 0;

  await Promise.all(
    companies.map((c) =>
      pool(async () => {
        if (!c.source_config) {
          failed++;
          return;
        }
        const sc: SourceConfig = { ...c.source_config };
        delete sc.listing_hash; // don't let change-detection short-circuit the recovery
        try {
          await updateCompany(db, c.id, { source_type: 'sitemap', source_config: sc });
        } catch (e) {
          failed++;
          console.log(`[db-fail] ${c.company_name}: ${e instanceof Error ? e.message : e}`);
          return;
        }
        const company: CompanyRow = { ...c, source_type: 'sitemap' as SourceType, source_config: sc };
        try {
          const oc = await processCompany(db, ctx, company);
          const n = oc.openNow ?? 0;
          if (oc.status === 'ok') {
            ok++;
            totalOpen += n;
            added += oc.inserted ?? 0;
            if (n > 0) recovered++;
          } else if (oc.status === 'nochange') {
            nochange++;
          } else {
            failed++;
          }
          console.log(
            `[${oc.status}] ${oc.company}: ${oc.status === 'ok' ? `+${oc.inserted ?? 0}, ${n} open` : (oc.error ?? '')}`,
          );
        } catch (e) {
          failed++;
          console.log(`[error] ${c.company_name}: ${e instanceof Error ? e.message : e}`);
        }
      }),
    ),
  );

  console.log(
    `\nDone — ${companies.length} companies: ok=${ok}, recovered(>0 jobs)=${recovered}, ` +
      `nochange=${nochange}, failed=${failed} | +${added} jobs upserted, ${totalOpen} open across the set`,
  );
  await closeBrowser();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
