import { dedupeJobs, finalizeJob } from '../../extract/normalize.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../../types.js';
import { SourceGoneError } from '../../types.js';

interface WorkdayPosting {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}

interface WorkdayResponse {
  total?: number;
  jobPostings?: WorkdayPosting[];
}

export function parseWorkdayBoardId(boardId: string): { host: string; tenant: string; site: string } | null {
  const [host, site] = boardId.split('|');
  if (!host || !site || !/^[a-z0-9.-]+\.myworkdayjobs\.com$/i.test(host)) return null;
  const tenant = host.split('.')[0];
  return tenant ? { host: host.toLowerCase(), tenant, site } : null;
}

export const workdaySource: JobSource = {
  type: 'ats:workday',

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    const parsed = parseWorkdayBoardId(company.source_config?.board_id ?? '');
    if (!parsed) throw new SourceGoneError('workday: invalid board_id');
    const endpoint = `https://${parsed.host}/wday/cxs/${encodeURIComponent(parsed.tenant)}/${encodeURIComponent(parsed.site)}/jobs`;
    const pageSize = 20;
    const jobs: CanonicalJob[] = [];
    const liveUrls = new Set<string>();
    let total = Infinity;

    for (let offset = 0; offset < total && offset < 20_000; offset += pageSize) {
      const res = await ctx.fetchText(endpoint, {
        kind: 'api',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit: pageSize, offset, searchText: '' }),
        timeoutMs: 25_000,
      });
      if (res.status === 404 || res.status === 410) throw new SourceGoneError(`workday board gone: ${parsed.host}/${parsed.site}`);
      if (res.status !== 200) throw new Error(`workday HTTP ${res.status}`);
      let payload: WorkdayResponse;
      try { payload = JSON.parse(res.text) as WorkdayResponse; } catch { throw new Error('workday: invalid JSON'); }
      const postings = payload.jobPostings ?? [];
      total = Number(payload.total) || postings.length;
      if (postings.length === 0) break;
      for (const posting of postings) {
        if (!posting.title || !posting.externalPath) continue;
        const jobUrl = `https://${parsed.host}/en-US/${encodeURIComponent(parsed.site)}${posting.externalPath.startsWith('/') ? posting.externalPath : `/${posting.externalPath}`}`;
        liveUrls.add(jobUrl);
        const job = finalizeJob({
          job_url: jobUrl,
          job_title: posting.title,
          location: posting.locationsText,
          employment_type: posting.bulletFields?.join(' · '),
          verified: true,
        });
        if (job) jobs.push(job);
      }
      if (postings.length < pageSize) break;
    }

    ctx.liveUrls = liveUrls;
    ctx.liveUrlsComplete = jobs.length >= Math.min(Number.isFinite(total) ? total : jobs.length, 20_000);
    ctx.log(`  workday: ${jobs.length}/${Number.isFinite(total) ? total : '?'} vacancies`);
    return dedupeJobs(jobs);
  },
};
