import { dedupeJobs, finalizeJob, htmlToText } from '../../extract/normalize.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../../types.js';
import { SourceGoneError } from '../../types.js';

interface WorkableJob {
  title?: string;
  url?: string;
  shortcode?: string;
  city?: string;
  state?: string;
  country?: string;
  department?: string;
  employment_type?: string;
  created_at?: string;
  description?: string; // HTML (with ?details=true)
  telecommuting?: boolean;
}

export const workableSource: JobSource = {
  type: 'ats:workable',

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    const board = company.source_config?.board_id;
    if (!board) throw new SourceGoneError('workable: no board_id');
    const res = await ctx.fetchText(
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(board)}?details=true`,
      { kind: 'api', timeoutMs: 25_000 },
    );
    if (res.status === 404) throw new SourceGoneError(`workable account gone: ${board}`);
    if (res.status !== 200) throw new Error(`workable HTTP ${res.status}`);

    let data: { jobs?: WorkableJob[] };
    try {
      data = JSON.parse(res.text) as { jobs?: WorkableJob[] };
    } catch {
      throw new Error('workable: invalid JSON');
    }

    const jobs: CanonicalJob[] = [];
    for (const wj of data.jobs ?? []) {
      if (!wj.title) continue;
      const url = wj.url || (wj.shortcode ? `https://apply.workable.com/${board}/j/${wj.shortcode}/` : null);
      if (!url) continue;
      const job = finalizeJob({
        job_url: url,
        job_title: wj.title,
        location: [wj.city, wj.state, wj.country].filter(Boolean).join(', ') || undefined,
        department: wj.department || undefined,
        employment_type: wj.employment_type || undefined,
        description: wj.description ? htmlToText(wj.description) : undefined,
        posted_date: wj.created_at,
        is_remote: wj.telecommuting === true ? true : undefined,
      });
      if (job) jobs.push(job);
    }
    return dedupeJobs(jobs);
  },
};
