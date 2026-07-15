import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import { dedupeJobs } from '../extract/normalize.js';
import { FACET_LISTING_RE, hasBlockedSegment, jobsViaDetailPages, JOB_PATH_RE, NON_JOB_RE } from './shared.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../types.js';
import { SourceGoneError, ZeroExtractionError } from '../types.js';

const parser = new XMLParser({ ignoreAttributes: false });

interface SitemapEntry {
  loc: string;
  lastmod?: string;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Fetch a sitemap (or sitemap index, one level deep) and return its URL entries plus whether the
 * result is COMPLETE. `complete` is false when we couldn't read the whole listing — a child sitemap
 * fetch failed, the index had more children than we fan out to, or we hit the 5000-entry truncation.
 * Reconcile uses this to avoid mass-closing live jobs on a partial fetch (a truncated liveUrls set).
 */
export async function fetchSitemapEntries(
  sitemapUrl: string,
  ctx: Ctx,
  depth = 0,
): Promise<{ entries: SitemapEntry[]; complete: boolean }> {
  const res = await ctx.fetchText(sitemapUrl, { kind: 'api', timeoutMs: 15_000 });
  if (res.status !== 200 || !res.text.includes('<')) return { entries: [], complete: false };
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(res.text) as Record<string, unknown>;
  } catch {
    return { entries: [], complete: false };
  }

  const out: SitemapEntry[] = [];
  const index = doc.sitemapindex as { sitemap?: unknown } | undefined;
  if (index && depth < 1) {
    const children = asArray(index.sitemap as { loc?: string } | Array<{ loc?: string }>).filter(
      (c): c is { loc: string } => typeof c?.loc === 'string',
    );
    // Prefer job-ish child sitemaps, cap fan-out. Dropping any child makes the result partial.
    const ranked = [...children]
      .sort((a, b) => Number(JOB_PATH_RE.test(b.loc)) - Number(JOB_PATH_RE.test(a.loc)))
      .slice(0, 8);
    let complete = ranked.length === children.length;
    for (const child of ranked) {
      const sub = await fetchSitemapEntries(child.loc, ctx, depth + 1);
      out.push(...sub.entries);
      if (!sub.complete) complete = false;
      if (out.length > 5000) {
        complete = false;
        break;
      }
    }
    return { entries: out, complete };
  }

  const urlset = doc.urlset as { url?: unknown } | undefined;
  let complete = true;
  for (const entry of asArray(urlset?.url as SitemapEntry | SitemapEntry[])) {
    if (entry && typeof entry.loc === 'string') {
      out.push({ loc: entry.loc, lastmod: typeof entry.lastmod === 'string' ? entry.lastmod : undefined });
    }
    if (out.length > 5000) {
      complete = false;
      break;
    }
  }
  return { entries: out, complete };
}

/** Sitemap URLs advertised in robots.txt, plus the /sitemap.xml default. */
export async function discoverSitemaps(origin: string, ctx: Ctx): Promise<string[]> {
  const candidates = new Set<string>([`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]);
  try {
    const robots = await ctx.fetchText(`${origin}/robots.txt`, { kind: 'api', retries: 0, timeoutMs: 6000 });
    if (robots.status === 200) {
      for (const m of robots.text.matchAll(/^sitemap:\s*(\S+)/gim)) {
        if (m[1]) candidates.add(m[1].trim());
      }
    }
  } catch {
    /* no robots — fine */
  }
  return [...candidates];
}

const AGGREGATOR_HOST_RE =
  /(linkedin|indeed|glassdoor|monsterboard|nationalevacaturebank|jobbird|werkzoeken\.nl|google\.|facebook|instagram|youtube|twitter)/i;

export function filterJobEntries(entries: SitemapEntry[], _careerUrl: string): SitemapEntry[] {
  return entries.filter((e) => {
    let u: URL;
    try {
      u = new URL(e.loc);
    } catch {
      return false;
    }
    // Don't require the same host as career_url: dedicated job sitemaps often live on a
    // "werkenbij…" domain while the job pages sit on the main brand domain (e.g. Coolblue's
    // sitemap is on werkenbijcoolblue.nl but the jobs are on coolblue.nl). Only exclude aggregators.
    if (AGGREGATOR_HOST_RE.test(u.host)) return false;
    if (NON_JOB_RE.test(u.pathname) || hasBlockedSegment(u.pathname) || FACET_LISTING_RE.test(u.pathname)) return false;
    if (!JOB_PATH_RE.test(u.pathname)) return false;
    // A job detail page, not the listing root: needs a slug segment after the job-ish part
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';
    return segments.length >= 2 && /[a-z0-9]/i.test(last) && !/^(vacatures?|jobs?|careers?|werken-bij)$/i.test(last);
  });
}

export function hashUrlSet(entries: SitemapEntry[]): string {
  const basis = entries
    .map((e) => `${e.loc}@${e.lastmod ?? ''}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

export const sitemapSource: JobSource = {
  type: 'sitemap',

  async hasChanged(company: CompanyRow, ctx: Ctx): Promise<boolean> {
    const cfg = company.source_config;
    if (!cfg?.sitemap_url || !cfg.listing_hash) return true;
    // Force a full pass weekly
    if (!cfg.last_full_at || Date.now() - Date.parse(cfg.last_full_at) > 7 * 86_400_000) return true;
    try {
      const { entries } = await fetchSitemapEntries(cfg.sitemap_url, ctx);
      const jobEntries = filterJobEntries(entries, company.career_url ?? '');
      if (jobEntries.length === 0) return true;
      return hashUrlSet(jobEntries) !== cfg.listing_hash;
    } catch {
      return true;
    }
  },

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    const cfg = company.source_config;
    const careerUrl = company.career_url;
    if (!cfg?.sitemap_url || !careerUrl) throw new SourceGoneError('sitemap source missing config');

    const { entries, complete } = await fetchSitemapEntries(cfg.sitemap_url, ctx);
    if (entries.length === 0) throw new SourceGoneError(`sitemap empty/gone: ${cfg.sitemap_url}`);
    const jobEntries = filterJobEntries(entries, careerUrl);
    ctx.log(`  sitemap: ${entries.length} urls, ${jobEntries.length} job-like${complete ? '' : ' (partial fetch)'}`);

    // Every sitemap job url is a currently-live vacancy — tell reconcile so a capped run keeps the
    // ones it didn't re-fetch this pass OPEN instead of closing them. `complete` tells reconcile
    // whether this is the full roster (safe to close what's absent) or a truncated fetch (never).
    ctx.liveUrls = new Set(jobEntries.map((e) => e.loc));
    ctx.liveUrlsComplete = complete;

    // Per-run detail-page cap keeps a single big employer from blowing the run's time budget; big
    // rosters fill over several runs. Deprioritize urls we've already scraped so each run spends its
    // budget on NEW vacancies (incremental backfill). Overridable via SITEMAP_DETAIL_CAP.
    const detailCap = Number(process.env.SITEMAP_DETAIL_CAP) || 250;
    const already = ctx.scrapedUrls ?? new Set<string>();
    const fresh = jobEntries.filter((e) => !already.has(e.loc));
    const ordered = [...fresh, ...jobEntries.filter((e) => already.has(e.loc))];

    const jobs = await jobsViaDetailPages(
      ordered.map((e) => ({ url: e.loc, text: '' })),
      ctx,
      { cap: detailCap },
    );

    if (jobs.length === 0 && jobEntries.length >= 3) {
      throw new ZeroExtractionError(`sitemap saw ${jobEntries.length} job urls but extracted 0`, jobEntries.length);
    }

    // Only mark the listing "fully crawled" once this run covered all not-yet-scraped urls — otherwise
    // keep hasChanged() returning true so the next run continues filling a big roster.
    if (fresh.length <= detailCap) {
      cfg.listing_hash = hashUrlSet(jobEntries);
      cfg.last_full_at = new Date().toISOString();
    } else {
      ctx.log(`  incremental: ${fresh.length} new urls, fetched ${detailCap}; ${fresh.length - detailCap} remain for next run`);
    }
    return dedupeJobs(jobs);
  },
};
