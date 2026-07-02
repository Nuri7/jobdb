import pLimit from 'p-limit';
import { config } from './config.js';
import { createDb, findCompany, pickDueCompanies, pruneHistory, staleCompanies } from './db.js';
import { createLlmClient } from './extract/llm.js';
import { processCompany, stalenessSweep, type CompanyOutcome } from './lifecycle.js';
import { politeFetchText, createRobotsChecker } from './politeness.js';
import { closeBrowser } from './sources/rendered.js';
import type { Ctx } from './types.js';

export interface RefreshOpts {
  limit?: number;
  company?: string;
  budgetMin: number;
  dryRun: boolean;
  shard?: { k: number; n: number };
}

export function buildCtx(dryRun: boolean): Ctx {
  const cfg = config();
  return {
    log: (m) => console.log(m),
    dryRun,
    fetchText: politeFetchText,
    llm: createLlmClient((m) => console.log(`[llm] ${m}`)),
    robotsAllowed: createRobotsChecker(cfg.ROBOTS_RESPECT),
  };
}

export async function refreshCommand(opts: RefreshOpts): Promise<void> {
  const cfg = config();
  const db = createDb({ readOnly: opts.dryRun });
  const ctx = buildCtx(opts.dryRun);
  const startedAt = Date.now();
  const deadline = startedAt + opts.budgetMin * 60_000;

  const outcomes: CompanyOutcome[] = [];
  const pool = pLimit(cfg.COMPANY_CONCURRENCY);

  if (opts.company) {
    const company = await findCompany(db, opts.company);
    if (!company) {
      console.error(`No company matches "${opts.company}"`);
      process.exitCode = 1;
      return;
    }
    console.log(`Refreshing ${company.company_name} (${company.career_url ?? 'no url'}) …`);
    outcomes.push(await processCompany(db, ctx, company));
  } else {
    let processed = 0;
    const max = opts.limit ?? Infinity;
    while (processed < max && Date.now() < deadline) {
      // Pull a large batch so the Promise.all barrier only bites once at the very end —
      // with a small batch, the single slowest company (e.g. a 5,000-URL sitemap) gates
      // the next batch while most of the concurrency pool sits idle.
      const batchSize = Math.min(4000, max - processed);
      const due = await pickDueCompanies(db, batchSize, opts.shard);
      if (due.length === 0) break;
      console.log(`Batch: ${due.length} due companies (elapsed ${Math.round((Date.now() - startedAt) / 60000)}m)`);
      const results = await Promise.all(
        due.map((company) =>
          pool(async () => {
            if (Date.now() >= deadline) {
              return { company: company.company_name, status: 'failed', error: 'budget reached (stays due)' } as CompanyOutcome;
            }
            const outcome = await processCompany(db, ctx, company);
            const tag =
              outcome.status === 'ok'
                ? `${outcome.jobsSeen} seen, +${outcome.inserted} upserted, -${outcome.closed} closed, ${outcome.openNow} open`
                : outcome.status === 'nochange'
                  ? `${outcome.openNow} open (unchanged)`
                  : (outcome.error ?? '');
            ctx.log(`[${outcome.status}] ${outcome.company}: ${tag}`);
            return outcome;
          }),
        ),
      );
      outcomes.push(...results);
      processed += due.length;
      if (Date.now() >= deadline) {
        console.log('Time budget reached — remaining companies stay due and are picked up next run.');
        break;
      }
    }

    // Run-level maintenance
    if (!opts.dryRun) {
      try {
        const stale = await staleCompanies(db);
        if (stale.length > 0) {
          const closed = await stalenessSweep(db, ctx, stale);
          if (closed > 0) console.log(`Staleness sweep closed ${closed} jobs across ${stale.length} companies`);
        }
        const pruned = await pruneHistory(db, 90);
        if (pruned > 0) console.log(`Pruned ${pruned} scrape_history rows (>90d)`);
      } catch (err) {
        console.error(`maintenance: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  await closeBrowser();

  const byStatus = new Map<string, number>();
  for (const o of outcomes) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
  const totalOpen = outcomes.reduce((s, o) => s + (o.openNow ?? 0), 0);
  const inserted = outcomes.reduce((s, o) => s + (o.inserted ?? 0), 0);
  console.log(
    `\nDone in ${Math.round((Date.now() - startedAt) / 1000)}s — ${outcomes.length} companies: ` +
      [...byStatus.entries()].map(([k, v]) => `${k}=${v}`).join(', ') +
      ` | upserted ${inserted}, open tracked ${totalOpen}` +
      (ctx.llm ? ` | llm calls ${ctx.llm.callsUsed}` : ''),
  );
}
