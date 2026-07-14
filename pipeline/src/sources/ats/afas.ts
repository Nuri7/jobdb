import { dedupeJobs, finalizeJob, htmlToText } from '../../extract/normalize.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../../types.js';
import { SourceGoneError } from '../../types.js';

/**
 * AFAS OutSite recruitment ("werken bij …" sites, common across NL zorg/overheid — e.g. Parnassia
 * Groep, Jeroen Bosch Ziekenhuis). The vacancy list is served from a JSON endpoint that the SPA
 * calls: POST {base}/api/integration/vacancy/get-page with a paging body, returning {vacancies,count}.
 * Configured per company via source_config.board_id = the site base ("https://werkenbij…nl").
 */
interface AfasVacancy {
  shortId?: string;
  titleAsUrl?: string;
  title?: string;
  number?: number;
  department?: string;
  location?: string;
  published?: string;
  deadline?: string;
  translations?: { content?: string }[];
}

const PAGE = 10; // AFAS get-page caps `limit` at 10 per request; page via `offset` (skip/take are ignored)
const MAX_PAGES = 400; // safety cap (4000 vacancies)

export const afasSource: JobSource = {
  type: 'ats:afas',

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    const base = (company.source_config?.board_id ?? company.source_config?.resolved_url ?? company.career_url ?? '')
      .replace(/\/+$/, '');
    if (!base) throw new SourceGoneError('afas: no base_url');
    const endpoint = `${base}/api/integration/vacancy/get-page`;

    const getPage = async (offset: number): Promise<{ vacancies: AfasVacancy[]; count: number }> => {
      const res = await ctx.fetchText(endpoint, {
        kind: 'api',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: [], offset, limit: PAGE, cultureCode: 'nl-NL' }),
        timeoutMs: 25_000,
      });
      if (res.status === 404 || res.status === 410) throw new SourceGoneError(`afas endpoint gone: ${endpoint}`);
      if (res.status !== 200) throw new Error(`afas HTTP ${res.status}`);
      try {
        const j = JSON.parse(res.text) as { vacancies?: AfasVacancy[]; count?: number };
        return { vacancies: j.vacancies ?? [], count: j.count ?? 0 };
      } catch {
        throw new Error('afas: invalid JSON');
      }
    };

    const first = await getPage(0);
    const all: AfasVacancy[] = [...first.vacancies];
    const total = first.count;
    // De-dupe by shortId while paging: some AFAS instances ignore an out-of-range offset and re-serve
    // the first page, so "no new ids" is the reliable stop signal (not an empty array).
    const seen = new Set(all.map((v) => v.shortId).filter(Boolean) as string[]);
    for (let page = 1; page < MAX_PAGES && all.length < total; page++) {
      const next = await getPage(page * PAGE);
      const fresh = next.vacancies.filter((v) => v.shortId && !seen.has(v.shortId));
      if (fresh.length === 0) break;
      for (const v of fresh) seen.add(v.shortId!);
      all.push(...fresh);
    }
    if (all.length === 0) throw new SourceGoneError(`afas: no vacancies at ${endpoint}`);

    const jobs: CanonicalJob[] = [];
    for (const v of all) {
      if (!v.title || !v.shortId) continue;
      const slug = v.titleAsUrl || String(v.number ?? v.shortId);
      const job = finalizeJob({
        // AFAS OutSite deep link; shortId keeps it unique per vacancy for dedup/reconcile.
        job_url: `${base}/vacature/${v.shortId}/${slug}`,
        job_title: v.title,
        location: v.location || undefined,
        department: v.department || undefined,
        description: v.translations?.[0]?.content ? htmlToText(v.translations[0].content) : undefined,
        posted_date: v.published,
        closing_date: v.deadline,
        verified: true, // structured recruitment API = genuine vacancy
      });
      if (job) jobs.push(job);
    }
    ctx.log(`  afas: ${jobs.length}/${total} vacancies from ${base}`);
    return dedupeJobs(jobs);
  },
};
