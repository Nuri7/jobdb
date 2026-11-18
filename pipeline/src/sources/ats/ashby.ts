import { dedupeJobs, finalizeJob, htmlToText } from '../../extract/normalize.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../../types.js';
import { SourceGoneError } from '../../types.js';

interface Address {addressLocality?: string; addressRegion?: string; addressCountry?: string}
interface AshbyJob {
  title?: string;
  jobUrl?: string;
  applyUrl?: string;
  location?: string;
  address?: {postalAddress?: Address};
  secondaryLocations?: Array<{ location?: string; address?: Address }>;
  isListed?: boolean;
  department?: string;
  team?: string;
  employmentType?: string;
  isRemote?: boolean;
  publishedAt?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  compensation?: { compensationTierSummary?: string };
}

export const ashbySource: JobSource = {
  type: 'ats:ashby',

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    const board = company.source_config?.board_id;
    if (!board) throw new SourceGoneError('ashby: no board_id');
    const res = await ctx.fetchText(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`,
      { kind: 'api', timeoutMs: 20_000 },
    );
    if (res.status === 404) throw new SourceGoneError(`ashby board gone: ${board}`);
    if (res.status !== 200) throw new Error(`ashby HTTP ${res.status}`);

    let data: { jobs?: AshbyJob[] };
    try {
      data = JSON.parse(res.text) as { jobs?: AshbyJob[] };
    } catch {
      throw new Error('ashby: invalid JSON');
    }

    const jobs: CanonicalJob[] = [];
    for (const aj of data.jobs ?? []) {
      if (aj.isListed === false || !aj.title || !(aj.jobUrl || aj.applyUrl)) continue;
      const allLocations = [{location: aj.location, address: aj.address?.postalAddress}, ...(aj.secondaryLocations ?? [])];
      const nl = allLocations.filter(s => /^(NL|NLD|Netherlands|Nederland|The Netherlands)$/i.test(s.address?.addressCountry ?? ''));
      const selected = nl.length ? nl : allLocations;
      const locations = selected.map(s => s.location || [s.address?.addressLocality,s.address?.addressRegion,s.address?.addressCountry].filter(Boolean).join(', '))
        .filter(Boolean)
        .join(' / ');
      const job = finalizeJob({
        job_url: (aj.jobUrl || aj.applyUrl)!,
        job_title: aj.title,
        location: locations || undefined,
        country_code: selected.find(s => s.address?.addressCountry)?.address?.addressCountry,
        department: aj.department || aj.team || undefined,
        employment_type: aj.employmentType || undefined,
        description: aj.descriptionPlain?.trim() || (aj.descriptionHtml ? htmlToText(aj.descriptionHtml) : undefined),
        posted_date: aj.publishedAt,
        is_remote: aj.isRemote === true ? true : undefined,
        salary_range: aj.compensation?.compensationTierSummary || undefined,
      });
      if (job) jobs.push(job);
    }
    const result = dedupeJobs(jobs);
    ctx.liveUrls = new Set(result.map(j => j.job_url));
    ctx.liveUrlsComplete = true;
    return result;
  },
};
