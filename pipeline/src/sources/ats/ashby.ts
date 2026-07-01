import { dedupeJobs, finalizeJob, htmlToText } from '../../extract/normalize.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../../types.js';
import { SourceGoneError } from '../../types.js';

interface AshbyJob {
  title?: string;
  jobUrl?: string;
  applyUrl?: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
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
      if (!aj.title || !(aj.jobUrl || aj.applyUrl)) continue;
      const locations = [aj.location, ...(aj.secondaryLocations?.map((s) => s.location) ?? [])]
        .filter(Boolean)
        .join(' / ');
      const job = finalizeJob({
        job_url: (aj.jobUrl || aj.applyUrl)!,
        job_title: aj.title,
        location: locations || undefined,
        department: aj.department || aj.team || undefined,
        employment_type: aj.employmentType || undefined,
        description: aj.descriptionPlain?.trim() || (aj.descriptionHtml ? htmlToText(aj.descriptionHtml) : undefined),
        posted_date: aj.publishedAt,
        is_remote: aj.isRemote === true ? true : undefined,
        salary_range: aj.compensation?.compensationTierSummary || undefined,
      });
      if (job) jobs.push(job);
    }
    return dedupeJobs(jobs);
  },
};
