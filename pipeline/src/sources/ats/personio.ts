import { XMLParser } from 'fast-xml-parser';
import { dedupeJobs, finalizeJob, htmlToText } from '../../extract/normalize.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../../types.js';
import { SourceGoneError } from '../../types.js';

interface PersonioPosition {
  id?: number | string;
  office?: string;
  department?: string;
  name?: string;
  employmentType?: string;
  seniority?: string;
  schedule?: string;
  createdAt?: string;
  occupationCategory?: string;
  jobDescriptions?: { jobDescription?: Array<{ name?: string; value?: string }> | { name?: string; value?: string } };
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export const personioSource: JobSource = {
  type: 'ats:personio',

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    const board = company.source_config?.board_id;
    if (!board) throw new SourceGoneError('personio: no board_id');
    // board may be "acme" (jobs.personio.de) or carry its own domain from the fingerprint
    const host = board.includes('.') ? board : `${board}.jobs.personio.de`;
    const res = await ctx.fetchText(`https://${host}/xml`, { kind: 'api', timeoutMs: 20_000 });
    if (res.status === 404) throw new SourceGoneError(`personio feed gone: ${host}`);
    if (res.status !== 200 || !res.text.includes('<')) throw new Error(`personio HTTP ${res.status}`);

    let doc: { 'workzag-jobs'?: { position?: PersonioPosition | PersonioPosition[] } };
    try {
      doc = new XMLParser({ ignoreAttributes: true }).parse(res.text) as typeof doc;
    } catch {
      throw new Error('personio: invalid XML');
    }

    const jobs: CanonicalJob[] = [];
    for (const p of asArray(doc['workzag-jobs']?.position)) {
      if (!p?.name || p.id === undefined) continue;
      const description = asArray(p.jobDescriptions?.jobDescription)
        .map((d) => `${d?.name ?? ''}\n${htmlToText(String(d?.value ?? ''))}`)
        .join('\n\n');
      const job = finalizeJob({
        job_url: `https://${host}/job/${p.id}`,
        job_title: String(p.name),
        location: p.office ? String(p.office) : undefined,
        department: p.department ? String(p.department) : undefined,
        employment_type: p.schedule ? String(p.schedule) : p.employmentType ? String(p.employmentType) : undefined,
        experience_level: p.seniority ? String(p.seniority) : undefined,
        description,
        posted_date: p.createdAt,
      });
      if (job) jobs.push(job);
    }
    return dedupeJobs(jobs);
  },
};
