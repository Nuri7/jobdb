import { dedupeJobs, finalizeJob, htmlToText } from '../../extract/normalize.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../../types.js';
import { SourceGoneError } from '../../types.js';

interface GreenhouseJob {
  title?: string;
  absolute_url?: string;
  location?: { name?: string };
  content?: string; // HTML-escaped HTML
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string }>;
  updated_at?: string;
  first_published?: string;
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

export const greenhouseSource: JobSource = {
  type: 'ats:greenhouse',

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    const board = company.source_config?.board_id;
    if (!board) throw new SourceGoneError('greenhouse: no board_id');
    const res = await ctx.fetchText(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`,
      { kind: 'api', timeoutMs: 20_000 },
    );
    if (res.status === 404) throw new SourceGoneError(`greenhouse board gone: ${board}`);
    if (res.status !== 200) throw new Error(`greenhouse HTTP ${res.status}`);

    let data: { jobs?: GreenhouseJob[] };
    try {
      data = JSON.parse(res.text) as { jobs?: GreenhouseJob[] };
    } catch {
      throw new Error('greenhouse: invalid JSON');
    }

    const jobs: CanonicalJob[] = [];
    for (const gj of data.jobs ?? []) {
      if (!gj.title || !gj.absolute_url) continue;
      const job = finalizeJob({
        job_url: gj.absolute_url,
        job_title: gj.title,
        location: gj.location?.name || gj.offices?.map((o) => o.name).filter(Boolean).join(' / ') || undefined,
        department: gj.departments?.[0]?.name || undefined,
        description: gj.content ? htmlToText(unescapeHtml(gj.content)) : undefined,
        posted_date: gj.first_published ?? gj.updated_at,
      });
      if (job) jobs.push(job);
    }
    return dedupeJobs(jobs);
  },
};
