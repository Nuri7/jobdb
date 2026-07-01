import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import { dedupeJobs } from '../extract/normalize.js';
import { hasBlockedSegment, jobsViaDetailPages, JOB_PATH_RE, NON_JOB_RE } from './shared.js';
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

/** Fetch a sitemap (or sitemap index, one level deep) and return its URL entries. */
export async function fetchSitemapEntries(
  sitemapUrl: string,
  ctx: Ctx,
  depth = 0,
): Promise<SitemapEntry[]> {
  const res = await ctx.fetchText(sitemapUrl, { kind: 'api', timeoutMs: 15_000 });
  if (res.status !== 200 || !res.text.includes('<')) return [];
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(res.text) as Record<string, unknown>;
  } catch {
    return [];
  }

  const out: SitemapEntry[] = [];
  const index = doc.sitemapindex as { sitemap?: unknown } | undefined;
  if (index && depth < 1) {
    const children = asArray(index.sitemap as { loc?: string } | Array<{ loc?: string }>);
    // Prefer job-ish child sitemaps, cap fan-out
    const ranked = children
      .filter((c): c is { loc: string } => typeof c?.loc === 'string')
      .sort((a, b) => Number(JOB_PATH_RE.test(b.loc)) - Number(JOB_PATH_RE.test(a.loc)))
      .slice(0, 8);
    for (const child of ranked) {
      out.push(...(await fetchSitemapEntries(child.loc, ctx, depth + 1)));
      if (out.length > 5000) break;
    }
    return out;
  }

  const urlset = doc.urlset as { url?: unknown } | undefined;
  for (const entry of asArray(urlset?.url as SitemapEntry | SitemapEntry[])) {
    if (entry && typeof entry.loc === 'string') {
      out.push({ loc: entry.loc, lastmod: typeof entry.lastmod === 'string' ? entry.lastmod : undefined });
    }
    if (out.length > 5000) break;
  }
  return out;
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

export function filterJobEntries(entries: SitemapEntry[], careerUrl: string): SitemapEntry[] {
  let careerHost = '';
  try {
    careerHost = new URL(careerUrl).host;
  } catch {
    /* keep empty */
  }
  return entries.filter((e) => {
    let u: URL;
    try {
      u = new URL(e.loc);
    } catch {
      return false;
    }
    if (careerHost && u.host !== careerHost) return false;
    if (NON_JOB_RE.test(u.pathname) || hasBlockedSegment(u.pathname)) return false;
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
      const entries = filterJobEntries(await fetchSitemapEntries(cfg.sitemap_url, ctx), company.career_url ?? '');
      if (entries.length === 0) return true;
      return hashUrlSet(entries) !== cfg.listing_hash;
    } catch {
      return true;
    }
  },

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    const cfg = company.source_config;
    const careerUrl = company.career_url;
    if (!cfg?.sitemap_url || !careerUrl) throw new SourceGoneError('sitemap source missing config');

    const entries = await fetchSitemapEntries(cfg.sitemap_url, ctx);
    if (entries.length === 0) throw new SourceGoneError(`sitemap empty/gone: ${cfg.sitemap_url}`);
    const jobEntries = filterJobEntries(entries, careerUrl);
    ctx.log(`  sitemap: ${entries.length} urls, ${jobEntries.length} job-like`);

    const jobs = await jobsViaDetailPages(
      jobEntries.map((e) => ({ url: e.loc, text: '' })),
      ctx,
      { cap: 250 },
    );

    if (jobs.length === 0 && jobEntries.length >= 3) {
      throw new ZeroExtractionError(`sitemap saw ${jobEntries.length} job urls but extracted 0`, jobEntries.length);
    }

    // Persist change-detection state via the mutable source_config (lifecycle saves it)
    cfg.listing_hash = hashUrlSet(jobEntries);
    cfg.last_full_at = new Date().toISOString();
    return dedupeJobs(jobs);
  },
};
