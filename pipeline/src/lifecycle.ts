import {
  closeCompanyJobs,
  completeHistory,
  countOpenJobs,
  insertHistory,
  listCompanyJobs,
  incrementMisses,
  touchJobs,
  updateCompany,
  upsertJobs,
  type Db,
} from './db.js';
import { resolveCompany } from './resolver/index.js';
import { sourceFor } from './sources/registry.js';
import type { CanonicalJob, CompanyRow, Ctx, SourceType } from './types.js';
import { SourceGoneError, ZeroExtractionError } from './types.js';

export interface CompanyOutcome {
  company: string;
  status: 'ok' | 'nochange' | 'resolved-dead' | 'resolved-ambiguous' | 'failed' | 'dry-run';
  jobsSeen?: number;
  inserted?: number;
  closed?: number;
  openNow?: number;
  error?: string;
}

const MIN_INTERVAL_H = 12;
const MAX_INTERVAL_H = 72;

function nextInterval(current: number, hadChanges: boolean): number {
  const cur = current || 24;
  return hadChanges
    ? Math.max(MIN_INTERVAL_H, Math.floor(cur / 2))
    : Math.min(MAX_INTERVAL_H, Math.ceil(cur * 1.5));
}

function nextCheckAt(hours: number): string {
  const jitterMs = Math.floor(Math.random() * 30 * 60 * 1000);
  return new Date(Date.now() + hours * 3_600_000 + jitterMs).toISOString();
}

/** Escalation ladder when a tier sees job signals but extracts nothing. */
const ESCALATION: Partial<Record<SourceType, SourceType[]>> = {
  sitemap: ['static', 'rendered'],
  static: ['rendered'],
};

export interface EscalatedFetch {
  jobs: CanonicalJob[];
  usedType: SourceType;
}

/**
 * Fetch jobs via the configured source; on ZeroExtraction, walk down the tier
 * ladder. Re-throws ZeroExtraction when every tier fails to extract — callers
 * must treat that as failure (never as "0 open jobs").
 */
export async function fetchJobsWithEscalation(company: CompanyRow, ctx: Ctx): Promise<EscalatedFetch> {
  const primary = company.source_type!;
  const chain: SourceType[] = [primary, ...(ESCALATION[primary] ?? [])];
  let lastZero: ZeroExtractionError | null = null;

  for (const type of chain) {
    try {
      const jobs = await sourceFor(type).fetchJobs({ ...company, source_type: type }, ctx);
      // ATS structured adapters yield genuine, applyable vacancies -> always verified.
      if (type.startsWith('ats:')) for (const j of jobs) j.verified = true;
      if (type !== primary) ctx.log(`  escalated ${primary} -> ${type}: ${jobs.length} jobs`);
      return { jobs, usedType: type };
    } catch (err) {
      if (err instanceof ZeroExtractionError) {
        lastZero = err;
        ctx.log(`  ${type}: ${err.message}${type === chain[chain.length - 1] ? '' : ' — escalating'}`);
        continue;
      }
      throw err;
    }
  }
  throw lastZero ?? new Error('escalation chain exhausted');
}

function needsResolve(company: CompanyRow): boolean {
  if (!company.source_type || !company.source_config) return true;
  // 'api' is a manual override (bespoke JSON endpoint) — never auto-re-resolve over it.
  if (company.source_type === 'api') return false;
  if (company.career_page_status !== 'verified') return true;
  // Dashboard edited career_url since we fingerprinted it → re-resolve
  if (company.source_config.resolved_url !== company.career_url) return true;
  return false;
}

/**
 * Resolve (when needed) + scrape + reconcile one company. Crash-safe ordering:
 * failures never close jobs; a killed run leaves the company due.
 */
export async function processCompany(db: Db, ctx: Ctx, company: CompanyRow): Promise<CompanyOutcome> {
  const name = company.company_name;

  try {
    // ---------- Resolve when needed ----------
    if (needsResolve(company)) {
      const result = await resolveCompany(company, ctx, db);
      ctx.log(`  resolve: ${result.career_page_status} / ${result.source_type ?? '-'} ${result.evidence[result.evidence.length - 1] ?? ''}`);
      if (!ctx.dryRun) {
        await updateCompany(db, company.id, {
          career_url: result.career_url ?? company.career_url,
          career_page_status: result.career_page_status,
          source_type: result.source_type,
          source_config: result.source_config,
          website: company.website ?? safeOrigin(company.career_url),
        });
      }
      company = {
        ...company,
        career_url: result.career_url ?? company.career_url,
        career_page_status: result.career_page_status,
        source_type: result.source_type,
        source_config: result.source_config,
      };
      if (result.career_page_status === 'dead') {
        if (!ctx.dryRun) {
          await updateCompany(db, company.id, {
            crawl_status: 'failed',
            consecutive_failures: company.consecutive_failures + 1,
            next_check_at: nextCheckAt(7 * 24),
          });
        }
        return { company: name, status: 'resolved-dead' };
      }
      if (result.career_page_status === 'ambiguous') {
        if (!ctx.dryRun) {
          await updateCompany(db, company.id, { next_check_at: nextCheckAt(30 * 24) });
        }
        return { company: name, status: 'resolved-ambiguous' };
      }
    }

    if (!company.source_type) throw new Error('no source_type after resolve');
    const source = sourceFor(company.source_type);
    const method = `pipeline:${company.source_type}`;

    // ---------- Change-detection short-circuit ----------
    if (!ctx.dryRun && !ctx.force && source.hasChanged && company.jobs_found_count && company.jobs_found_count > 0) {
      const changed = await source.hasChanged(company, ctx);
      if (!changed) {
        const existing = await listCompanyJobs(db, company.id);
        const openIds = existing.filter((j) => j.status === 'open').map((j) => j.id);
        await touchJobs(db, openIds);
        await finalizeSuccess(db, company, openIds.length, false);
        const historyId = await insertHistory(db, company.id, company.career_url ?? '', `${method}:nochange`);
        await completeHistory(db, historyId, {
          status: 'completed',
          jobs_found: openIds.length,
          jobs_inserted: 0,
          jobs_removed: 0,
        });
        return { company: name, status: 'nochange', openNow: openIds.length };
      }
    }

    // Load current jobs up front so a source can deprioritize already-scraped urls (incremental
    // backfill) and reconcile can keep still-live-but-not-refetched jobs open.
    const existing = await listCompanyJobs(db, company.id);
    ctx.scrapedUrls = new Set(existing.map((j) => j.job_url));
    ctx.liveUrls = undefined;

    // ---------- Full scrape (with tier escalation) ----------
    const historyId = ctx.dryRun ? null : await insertHistory(db, company.id, company.career_url ?? '', method);
    let jobs: CanonicalJob[];
    try {
      const fetched = await fetchJobsWithEscalation(company, ctx);
      jobs = fetched.jobs;
      if (fetched.usedType !== company.source_type) {
        // The escalated tier produced this run's jobs. Persist it as the new primary UNLESS this is
        // a downgrade away from a sitemap that still has a valid config: a sitemap can transiently
        // extract 0 (e.g. every detail fetch failed one run) and we must not let a single bad run
        // strand the company on the low-yield static tier forever — that is exactly how Randstad
        // collapsed 3384 → 28. Keeping source_type='sitemap' lets the next run retry it and self-heal.
        const downgradeFromLiveSitemap =
          company.source_type === 'sitemap' && !!company.source_config?.sitemap_url;
        if (downgradeFromLiveSitemap) {
          ctx.log(`  used ${fetched.usedType} this run but kept source_type=sitemap (retries next run)`);
        } else {
          company = { ...company, source_type: fetched.usedType };
          if (!ctx.dryRun) await updateCompany(db, company.id, { source_type: fetched.usedType });
        }
      }
    } catch (err) {
      if (!ctx.dryRun) {
        await completeHistory(db, historyId, {
          status: 'failed',
          error_message: err instanceof Error ? err.message.slice(0, 500) : String(err),
        });
      }
      throw err;
    }

    if (ctx.dryRun) {
      ctx.log(`  dry-run: ${jobs.length} jobs would be written`);
      for (const j of jobs.slice(0, 5)) ctx.log(`    · ${j.job_title} — ${j.location ?? '?'} — ${j.job_url}`);
      return { company: name, status: 'dry-run', jobsSeen: jobs.length };
    }

    // ---------- Reconcile ----------
    // `existing` was loaded before the fetch (for incremental prioritization); reuse it.
    const openBefore = existing.filter((j) => j.status === 'open').length;

    // Safety floor: a scrape that returns ZERO jobs for a company that currently has
    // open ones is almost always an extraction failure (ATS status-vocab change, transient
    // empty payload, markup change breaking a listing parser) — NOT a genuinely empty board.
    // Refuse to close everything on such weak evidence; treat as a soft failure so the
    // company backs off and is retried, and only the staleness sweep (10 failures / 14 days)
    // may eventually close a board that is truly gone.
    if (jobs.length === 0 && openBefore > 0) {
      await completeHistory(db, historyId, {
        status: 'failed',
        jobs_found: 0,
        error_message: `Suspicious empty result: ${openBefore} open jobs but scrape returned 0 — not closing`,
      });
      throw new ZeroExtractionError(`empty result with ${openBefore} open jobs — refusing to mass-close`, openBefore);
    }

    const byUrl = new Map(existing.map((j) => [j.job_url, j]));
    const seenUrls = new Set(jobs.map((j) => j.job_url));
    // A source may report the FULL live-url set even when it only fetched detail for a capped subset
    // this run (incremental backfill). Fall back to what we actually fetched for sources that don't.
    const liveSet = ctx.liveUrls ?? seenUrls;

    const toWrite: CanonicalJob[] = [];
    for (const job of jobs) {
      const prior = byUrl.get(job.job_url);
      const unchanged =
        prior && prior.content_hash === job.content_hash && prior.status === 'open' && prior.verified === job.verified;
      if (!unchanged) toWrite.push(job);
    }
    const writeUrls = new Set(toWrite.map((j) => j.job_url));
    // Keep alive every open job still present in the live set that we didn't rewrite — both the
    // unchanged ones we re-fetched and the ones a capped run deliberately skipped.
    const touchIds = existing
      .filter((j) => j.status === 'open' && liveSet.has(j.job_url) && !writeUrls.has(j.job_url))
      .map((j) => j.id);
    // Only genuinely-gone jobs (no longer in the live set) count as missed.
    const missedIds = existing.filter((j) => j.status === 'open' && !liveSet.has(j.job_url)).map((j) => j.id);

    // Mass-close circuit breaker. A single run that would drop a large fraction of a sizeable
    // roster is almost always a truncated source fetch (a big sitemap that came back partial this
    // run → a small liveSet), not a genuine mass-removal — that is how Albert Heijn kept losing
    // ~3.9k still-live jobs overnight. The empty-result guard above only catches a fully-empty
    // scrape; this catches the partial one. Keep the jobs open and let a healthy next run confirm;
    // a board that is truly gone is still retired by the staleness sweep (10 failures / 14 days).
    const MASS_CLOSE_MIN = 25; // don't second-guess tiny rosters
    const MASS_CLOSE_FRACTION = 0.4;
    let missedToClose = missedIds;
    if (openBefore >= MASS_CLOSE_MIN && missedIds.length > openBefore * MASS_CLOSE_FRACTION) {
      ctx.log(
        `  ⚠ mass-close guard: ${missedIds.length}/${openBefore} open jobs absent this run — skipping close (likely a partial ${company.source_type} fetch)`,
      );
      missedToClose = [];
    }

    await upsertJobs(db, company.id, toWrite);
    await touchJobs(db, touchIds);
    const closedIds = await incrementMisses(db, missedToClose);

    const hadChanges = toWrite.length > 0 || closedIds.length > 0;
    const openNow = await finalizeSuccess(db, company, null, hadChanges);
    await completeHistory(db, historyId, {
      status: 'completed',
      jobs_found: jobs.length,
      jobs_inserted: toWrite.length,
      jobs_removed: closedIds.length,
      pages_scraped: 1,
    });

    return {
      company: name,
      status: 'ok',
      jobsSeen: jobs.length,
      inserted: toWrite.length,
      closed: closedIds.length,
      openNow,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!ctx.dryRun) {
      const failures = company.consecutive_failures + 1;
      const backoffH = Math.min(company.check_interval_hours * 2 ** Math.min(failures, 3), MAX_INTERVAL_H);
      const patch: Record<string, unknown> = {
        crawl_status: 'failed',
        consecutive_failures: failures,
        next_check_at: nextCheckAt(backoffH),
      };
      // A permanently-gone source must be re-resolved next time it's picked up
      if (err instanceof SourceGoneError) patch.career_page_status = 'unverified';
      await updateCompany(db, company.id, patch).catch(() => {});
    }
    return { company: name, status: 'failed', error: message.slice(0, 200) };
  }
}

async function finalizeSuccess(
  db: Db,
  company: CompanyRow,
  knownOpenCount: number | null,
  hadChanges: boolean,
): Promise<number> {
  const openNow = knownOpenCount ?? (await countOpenJobs(db, company.id));
  const interval = nextInterval(company.check_interval_hours, hadChanges);
  await updateCompany(db, company.id, {
    crawl_status: 'completed',
    last_crawled_at: new Date().toISOString(),
    last_success_at: new Date().toISOString(),
    jobs_found_count: openNow,
    consecutive_failures: 0,
    check_interval_hours: interval,
    next_check_at: nextCheckAt(interval),
    career_page_status: 'verified',
    source_config: company.source_config, // persists mutated listing_hash / etag / last_full_at
  });
  return openNow;
}

function safeOrigin(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Close open jobs of companies whose source has been dead too long (never delete). */
export async function stalenessSweep(db: Db, ctx: Ctx, stale: Array<{ id: string; company_name: string }>): Promise<number> {
  let closed = 0;
  for (const company of stale) {
    if (ctx.dryRun) continue;
    const n = await closeCompanyJobs(db, company.id);
    if (n > 0) {
      ctx.log(`staleness sweep: closed ${n} jobs for ${company.company_name}`);
      await updateCompany(db, company.id, { jobs_found_count: 0 }).catch(() => {});
      closed += n;
    }
  }
  return closed;
}
