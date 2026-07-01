import { dedupeJobs } from '../../extract/normalize.js';
import { extractJobLinks, jobsViaDetailPages } from '../shared.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource, SourceType } from '../../types.js';
import { SourceGoneError } from '../../types.js';

/**
 * Teamtailor / Homerun / Join host career sites without a public JSON API, but
 * every job page carries schema.org JobPosting JSON-LD — so: listing → links → LD.
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
      const jobs = await jobsViaDetailPages(links, ctx, { cap: 150 });
      return dedupeJobs(jobs);
    },
  };
}

export const teamtailorSource = makeListingLdSource(
  'ats:teamtailor',
  (b) => `https://${b}.teamtailor.com/jobs`,
  (url) => /\/jobs\/\d/.test(url),
);

export const homerunSource = makeListingLdSource(
  'ats:homerun',
  (b) => `https://${b}.homerun.co/`,
  (url) => new URL(url).pathname.replace(/\/$/, '').length > 1,
);

export const joinSource = makeListingLdSource(
  'ats:join',
  (b) => `https://join.com/companies/${b}`,
  (url, b) => new URL(url).pathname.startsWith(`/companies/${b}/`),
);
