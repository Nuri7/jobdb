import { dedupeJobs, finalizeJob, htmlToText } from '../../extract/normalize.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../../types.js';
import { SourceGoneError } from '../../types.js';

interface RecruiteeOffer {
  title?: string;
  careers_url?: string;
  city?: string;
  country?: string;
  location?: string;
  department?: string;
  employment_type_code?: string;
  description?: string;
  requirements?: string;
  created_at?: string;
  remote?: boolean | string;
  salary?: { min?: number; max?: number; period?: string; currency?: string } | null;
  experience_code?: string;
  education_code?: string;
  status?: string;
}

/** Recruitee's declared experience_code → our seniority label (beats the title-regex fallback). */
function recruiteeSeniority(code?: string): string | undefined {
  if (!code) return undefined;
  const c = code.toLowerCase();
  if (/student|intern|stage/.test(c)) return 'Internship';
  if (/junior|entry|starter/.test(c)) return 'Junior';
  if (/medior|mid|intermediate/.test(c)) return 'Medior';
  if (/senior/.test(c)) return 'Senior';
  if (/lead|principal|expert|manager|director|head/.test(c)) return 'Management';
  return undefined; // unknown code → let finalizeJob's title heuristic decide
}

export const recruiteeSource: JobSource = {
  type: 'ats:recruitee',

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    const board = company.source_config?.board_id;
    if (!board) throw new SourceGoneError('recruitee: no board_id');
    const res = await ctx.fetchText(`https://${board}.recruitee.com/api/offers/`, { kind: 'api' });
    if (res.status === 404 || res.status === 410) throw new SourceGoneError(`recruitee board gone: ${board}`);
    if (res.status !== 200) throw new Error(`recruitee HTTP ${res.status}`);

    let data: { offers?: RecruiteeOffer[] };
    try {
      data = JSON.parse(res.text) as { offers?: RecruiteeOffer[] };
    } catch {
      throw new Error('recruitee: invalid JSON');
    }

    const jobs: CanonicalJob[] = [];
    for (const offer of data.offers ?? []) {
      if (!offer.title) continue;
      if (offer.status && offer.status !== 'published') continue;
      const url = offer.careers_url || `https://${board}.recruitee.com/o/unknown`;
      const salary =
        offer.salary?.min || offer.salary?.max
          ? `${offer.salary?.currency ?? '€'} ${offer.salary?.min ?? ''}${offer.salary?.max ? `–${offer.salary.max}` : ''}${offer.salary?.period ? `/${offer.salary.period}` : ''}`.trim()
          : undefined;
      const job = finalizeJob({
        job_url: url,
        job_title: offer.title,
        location: offer.location || [offer.city, offer.country].filter(Boolean).join(', ') || undefined,
        department: offer.department || undefined,
        employment_type: offer.employment_type_code?.replace(/_/g, '-') || undefined,
        description: htmlToText([offer.description ?? '', offer.requirements ?? ''].join('\n')),
        posted_date: offer.created_at,
        experience_level: recruiteeSeniority(offer.experience_code),
        is_remote: offer.remote === true || offer.remote === 'fully' ? true : undefined,
        salary_range: salary,
      });
      if (job) jobs.push(job);
    }
    return dedupeJobs(jobs);
  },
};
