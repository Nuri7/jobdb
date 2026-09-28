import { dedupeJobs } from '../../extract/normalize.js';
import { extractJobLinks, jobsViaDetailPages } from '../shared.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource, SourceType } from '../../types.js';
import { SourceGoneError } from '../../types.js';

/**
 * Teamtailor / Join host career sites without a public JSON API, but every job page
 * carries schema.org JobPosting JSON-LD — so: listing → links → LD.
 * (Homerun moved to its own feed-based adapter; its listing is JS-rendered.)
 */
function makeListingLdSource(
  type: SourceType,
  listingUrl: (boardId: string) => string,
  linkFilter: (url: string, boardId: string) => boolean,
): JobSource {
  return {
    type,
    async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
      const board = company.source_config?.board_id;
      if (!board) throw new SourceGoneError(`${type}: no board_id`);
      const url = listingUrl(board);
      const res = await ctx.fetchText(url, { kind: 'html', timeoutMs: 15_000 });
      if (res.status === 404 || res.status === 410) throw new SourceGoneError(`${type} board gone: ${board}`);
      if (res.status !== 200) throw new Error(`${type} HTTP ${res.status}`);

      const links = extractJobLinks(res.text, res.finalUrl).filter((l) => linkFilter(l.url, board));
      ctx.log(`  ${type}: ${links.length} job links on listing`);
      ctx.liveUrls = new Set(links.map((link) => link.url));
      ctx.liveUrlsComplete = true;
      const detailCap = Number(process.env.ATS_LISTING_DETAIL_CAP) || 400;
      const already = ctx.scrapedUrls ?? new Set<string>();
      const fresh = links.filter((link) => !already.has(link.url));
      const ordered = [...fresh, ...links.filter((link) => already.has(link.url))];
      const jobs = await jobsViaDetailPages(ordered, ctx, { cap: detailCap });
      if (fresh.length > detailCap) {
        ctx.liveUrlsComplete = false;
        ctx.log(`  incremental: ${fresh.length} new urls, fetched ${detailCap}; ${fresh.length - detailCap} remain`);
      }
      return dedupeJobs(jobs);
    },
  };
}

export const teamtailorSource = makeListingLdSource(
  'ats:teamtailor',
  (b) => `https://${b}.teamtailor.com/jobs`,
  (url) => /\/jobs\/\d/.test(url),
);

export const joinSource = makeListingLdSource(
  'ats:join',
  (b) => `https://join.com/companies/${b}`,
  (url, b) => new URL(url).pathname.startsWith(`/companies/${b}/`),
);
