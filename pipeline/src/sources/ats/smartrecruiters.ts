import { dedupeJobs, finalizeJob, htmlToText } from '../../extract/normalize.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../../types.js';
import { SourceGoneError } from '../../types.js';

interface SrPosting {
  id?: string;
  uuid?: string;
  name?: string;
  releasedDate?: string;
  location?: { city?: string; country?: string; remote?: boolean };
  department?: { label?: string };
  typeOfEmployment?: { label?: string };
  experienceLevel?: { label?: string };
}

interface SrPostingDetail {
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
  applyUrl?: string;
  postingUrl?: string;
}

const DETAIL_CAP = 150;

export const smartrecruitersSource: JobSource = {
  type: 'ats:smartrecruiters',

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    const board = company.source_config?.board_id;
    if (!board) throw new SourceGoneError('smartrecruiters: no board_id');

    const postings: SrPosting[] = [];
    for (let offset = 0; offset < 500; offset += 100) {
      const res = await ctx.fetchText(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings?limit=100&offset=${offset}`,
        { kind: 'api', timeoutMs: 20_000 },
      );
      if (res.status === 404) throw new SourceGoneError(`smartrecruiters company gone: ${board}`);
      if (res.status !== 200) throw new Error(`smartrecruiters HTTP ${res.status}`);
      let page: { totalFound?: number; content?: SrPosting[] };
      try {
        page = JSON.parse(res.text) as { totalFound?: number; content?: SrPosting[] };
      } catch {
        throw new Error('smartrecruiters: invalid JSON');
      }
      postings.push(...(page.content ?? []));
      if (postings.length >= (page.totalFound ?? 0) || (page.content?.length ?? 0) < 100) break;
    }

    const jobs: CanonicalJob[] = [];
    for (const [i, p] of postings.entries()) {
      if (!p.name || !p.id) continue;
      let description: string | undefined;
      if (i < DETAIL_CAP) {
        try {
          const det = await ctx.fetchText(
            `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings/${p.id}`,
            { kind: 'api' },
          );
          if (det.status === 200) {
            const detail = JSON.parse(det.text) as SrPostingDetail;
            const sections = Object.values(detail.jobAd?.sections ?? {});
            description = htmlToText(sections.map((s) => `${s.title ?? ''}\n${s.text ?? ''}`).join('\n'));
          }
        } catch {
          /* listing data is enough */
        }
      }
      const job = finalizeJob({
        job_url: `https://jobs.smartrecruiters.com/${encodeURIComponent(board)}/${p.id}`,
        job_title: p.name,
        location: [p.location?.city, p.location?.country?.toUpperCase()].filter(Boolean).join(', ') || undefined,
        department: p.department?.label || undefined,
        employment_type: p.typeOfEmployment?.label || undefined,
        experience_level: p.experienceLevel?.label || undefined,
        description,
        posted_date: p.releasedDate,
        is_remote: p.location?.remote === true ? true : undefined,
      });
      if (job) jobs.push(job);
    }
    if (postings.length > DETAIL_CAP) {
      ctx.log(`  smartrecruiters: descriptions capped at ${DETAIL_CAP}/${postings.length}`);
    }
    return dedupeJobs(jobs);
  },
};
