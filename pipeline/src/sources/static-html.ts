import { createHash } from 'node:crypto';
import { dedupeJobs } from '../extract/normalize.js';
import { jobPostingsFromHtml } from './jsonld.js';
import { extractJobLinks, findNextPage, jobsViaDetailPages, type JobLink } from './shared.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../types.js';
import { SourceGoneError } from '../types.js';

const MAX_LISTING_PAGES = 6;

export async function collectListingLinks(
  careerUrl: string,
  ctx: Ctx,
): Promise<{ links: JobLink[]; inlineJobs: CanonicalJob[]; listingHash: string; finalUrl: string }> {
  const links: JobLink[] = [];
  const inlineJobs: CanonicalJob[] = [];
  const seenPages = new Set<string>();
  let pageUrl: string | null = careerUrl;
  let firstFinalUrl = careerUrl;

  for (let i = 0; i < MAX_LISTING_PAGES && pageUrl && !seenPages.has(pageUrl); i++) {
    seenPages.add(pageUrl);
    const res = await ctx.fetchText(pageUrl, { kind: 'html', timeoutMs: 15_000 });
    if (i === 0) {
      if (res.status === 404 || res.status === 410) throw new SourceGoneError(`listing gone: ${careerUrl}`);
      if (res.status !== 200) throw new Error(`listing HTTP ${res.status}: ${careerUrl}`);
      firstFinalUrl = res.finalUrl;
    } else if (res.status !== 200) {
      break;
    }
    // Some listings put full JobPosting JSON-LD right on the page — take it
    inlineJobs.push(...jobPostingsFromHtml(res.text, res.finalUrl));
    links.push(...extractJobLinks(res.text, res.finalUrl));
    pageUrl = findNextPage(res.text, res.finalUrl);
  }

  const unique = new Map(links.map((l) => [l.url, l]));
  const listingHash = createHash('sha256')
    .update([...unique.keys()].sort().join('\n'))
    .digest('hex')
    .slice(0, 32);
  return { links: [...unique.values()], inlineJobs: dedupeJobs(inlineJobs), listingHash, finalUrl: firstFinalUrl };
}

export const staticHtmlSource: JobSource = {
  type: 'static',

  async hasChanged(company: CompanyRow, ctx: Ctx): Promise<boolean> {
    const cfg = company.source_config;
    if (!cfg?.listing_hash || !company.career_url) return true;
    if (!cfg.last_full_at || Date.now() - Date.parse(cfg.last_full_at) > 7 * 86_400_000) return true;
    try {
      const { listingHash } = await collectListingLinks(company.career_url, ctx);
      return listingHash !== cfg.listing_hash;
    } catch {
      return true;
    }
  },

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    if (!company.career_url) throw new SourceGoneError('static: no career_url');
    const { links, inlineJobs, listingHash } = await collectListingLinks(company.career_url, ctx);
    ctx.log(`  static: ${links.length} links, ${inlineJobs.length} inline JSON-LD jobs`);

    // Inline JSON-LD with per-job URLs beats crawling details
    const inlineWithUrls = inlineJobs.filter((j) => j.job_url !== company.career_url);
    let jobs: CanonicalJob[];
    if (inlineWithUrls.length >= Math.max(3, links.length / 2)) {
      jobs = inlineWithUrls;
    } else {
      jobs = await jobsViaDetailPages(links, ctx, { cap: 200 });
      if (jobs.length === 0 && inlineWithUrls.length > 0) jobs = inlineWithUrls;
    }

    if (company.source_config) {
      company.source_config.listing_hash = listingHash;
      company.source_config.last_full_at = new Date().toISOString();
    }
    return dedupeJobs(jobs);
  },
};
