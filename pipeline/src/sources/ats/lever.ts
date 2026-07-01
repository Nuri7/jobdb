import { dedupeJobs, finalizeJob } from '../../extract/normalize.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../../types.js';
import { SourceGoneError } from '../../types.js';

interface LeverPosting {
  text?: string;
  hostedUrl?: string;
  createdAt?: number;
  categories?: { location?: string; team?: string; department?: string; commitment?: string; allLocations?: string[] };
  descriptionPlain?: string;
  workplaceType?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
  country?: string;
}

export const leverSource: JobSource = {
  type: 'ats:lever',

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    const board = company.source_config?.board_id;
    if (!board) throw new SourceGoneError('lever: no board_id');
    const region = company.source_config?.board_region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co';
    const res = await ctx.fetchText(
      `https://${region}/v0/postings/${encodeURIComponent(board)}?mode=json`,
      { kind: 'api', timeoutMs: 20_000 },
    );
    if (res.status === 404) throw new SourceGoneError(`lever site gone: ${board}`);
    if (res.status !== 200) throw new Error(`lever HTTP ${res.status}`);

    let data: LeverPosting[];
    try {
      data = JSON.parse(res.text) as LeverPosting[];
    } catch {
      throw new Error('lever: invalid JSON');
    }
    if (!Array.isArray(data)) throw new Error('lever: unexpected payload');

    const jobs: CanonicalJob[] = [];
    for (const p of data) {
      if (!p.text || !p.hostedUrl) continue;
      const salary =
        p.salaryRange?.min || p.salaryRange?.max
          ? `${p.salaryRange?.currency ?? ''} ${p.salaryRange?.min ?? ''}–${p.salaryRange?.max ?? ''}${p.salaryRange?.interval ? `/${p.salaryRange.interval.toLowerCase()}` : ''}`.trim()
          : undefined;
      const job = finalizeJob({
        job_url: p.hostedUrl,
        job_title: p.text,
        location:
          p.categories?.allLocations?.join(' / ') ||
          [p.categories?.location, p.country].filter(Boolean).join(', ') ||
          undefined,
        department: p.categories?.team || p.categories?.department || undefined,
        employment_type: p.categories?.commitment || undefined,
        description: p.descriptionPlain?.trim() || undefined,
        posted_date: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
        is_remote: p.workplaceType?.toLowerCase() === 'remote' ? true : undefined,
        salary_range: salary,
      });
      if (job) jobs.push(job);
    }
    return dedupeJobs(jobs);
  },
};
