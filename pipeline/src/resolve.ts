import pLimit from 'p-limit';
import { config } from './config.js';
import { createDb, findCompany, pickResolvable, updateCompany, type Db } from './db.js';
import { resolveCompany } from './resolver/index.js';
import { buildCtx } from './refresh.js';
import type { CompanyRow, Ctx, ResolveResult } from './types.js';

export interface ResolveOpts {
  limit?: number;
  company?: string;
  mode: 'unverified' | 'broken' | 'stale' | 'all';
  dryRun: boolean;
  budgetMin?: number;
  dueOnly?: boolean;
}

async function resolveOne(db: Db, ctx: Ctx, company: CompanyRow, force: boolean): Promise<ResolveResult | null> {
  if (company.source_type?.startsWith('freelance:')) return null;
  if (!force && company.career_page_status === 'verified' && company.source_type) return null;
  const result = await resolveCompany(company, ctx, db);
  if (company.source_type && company.career_page_status === 'verified' && !result.source_type) {
    // A blocked/unreachable HTML page does not prove its configured API has disappeared.
    // Refresh will verify the adapter itself, and SourceGoneError can then re-resolve it.
    if (!ctx.dryRun) await updateCompany(db, company.id, {crawl_status: 'failed', next_check_at: new Date(Date.now() + 86400000).toISOString()});
    ctx.log(`  ${company.company_name}: page unavailable; retained known ${company.source_type} adapter for retry`);
    return {...result, source_type: company.source_type, source_config: company.source_config};
  }
  if (!ctx.dryRun) {
    // dead: retry weekly; ambiguous: monthly (duplicate boards rarely un-duplicate);
    // newly (re)verified: make due NOW so the next refresh scrapes the corrected page.
    const defer =
      result.career_page_status === 'dead'
        ? { next_check_at: new Date(Date.now() + 7 * 86_400_000).toISOString() }
        : result.career_page_status === 'ambiguous'
          ? { next_check_at: new Date(Date.now() + 30 * 86_400_000).toISOString() }
          : { next_check_at: new Date().toISOString() };
    await updateCompany(db, company.id, {
      career_url: result.career_url ?? company.career_url,
      career_page_status: result.career_page_status,
      source_type: result.source_type,
      source_config: result.source_config,
      website: company.website ?? safeOrigin(company.career_url),
      ...defer,
    });
  }
  return result;
}

function safeOrigin(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function resolveCommand(opts: ResolveOpts): Promise<void> {
  const cfg = config();
  const db = createDb({ readOnly: opts.dryRun });
  const startedAt = Date.now();
  const ctx = buildCtx(opts.dryRun, false, startedAt + (opts.budgetMin ?? 50) * 60000);

  let companies: CompanyRow[];
  if (opts.company) {
    const one = await findCompany(db, opts.company);
    if (!one) {
      console.error(`No company matches "${opts.company}"`);
      process.exitCode = 1;
      return;
    }
    companies = [one];
  } else {
    companies = await pickResolvable(db, opts.limit ?? 100_000, opts.mode, opts.dueOnly);
  }
  const forceEach = opts.mode !== 'unverified';
  console.log(`Resolving ${companies.length} companies (concurrency ${cfg.COMPANY_CONCURRENCY})…`);

  const pool = pLimit(cfg.COMPANY_CONCURRENCY);
  const tally = new Map<string, number>();
  let done = 0;

  await Promise.all(
    companies.map((company) =>
      pool(async () => {
        if (Date.now() - startedAt >= (opts.budgetMin ?? 50) * 60000) return;
        try {
          const result = await resolveOne(db, ctx, company, forceEach || Boolean(opts.company));
          done++;
          if (!result) return;
          const key = `${result.career_page_status}${result.source_type ? `/${result.source_type}` : ''}`;
          tally.set(key, (tally.get(key) ?? 0) + 1);
          console.log(`[${done}/${companies.length}] ${company.company_name}: ${key} -> ${result.career_url ?? '-'}`);
        } catch (err) {
          done++;
          tally.set('error', (tally.get('error') ?? 0) + 1);
          console.error(`[${done}/${companies.length}] ${company.company_name}: ERROR ${err instanceof Error ? err.message.slice(0, 120) : err}`);
        }
      }),
    ),
  );

  console.log(`\nResolve done in ${Math.round((Date.now() - startedAt) / 1000)}s:`);
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, n] of sorted) console.log(`  ${key.padEnd(28)} ${n}`);
  const verified = sorted.filter(([k]) => k.startsWith('verified')).reduce((s, [, n]) => s + n, 0);
  const total = sorted.reduce((s, [, n]) => s + n, 0);
  if (total > 0) console.log(`  → verified: ${verified}/${total} (${Math.round((100 * verified) / total)}%)`);
}
