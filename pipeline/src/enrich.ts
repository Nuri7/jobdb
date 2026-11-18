import pLimit from 'p-limit';
import { createDb } from './db.js';
import { buildCtx } from './refresh.js';
import { canonicalizeUrl, finalizeJob, htmlToText } from './extract/normalize.js';
import { jobPostingsFromHtml } from './sources/jsonld.js';
import { jobFromDetailHtml } from './sources/shared.js';
import { parseWorkdayBoardId } from './sources/ats/workday.js';
import type { CanonicalJob, Ctx } from './types.js';

type Row = {id: string; job_url: string; job_title: string; location: string | null; description: string | null; country_code: string | null};

export function enrichmentPatch(row: Row, detail: CanonicalJob): Record<string, unknown> {
  // A listing-wide JobPosting or redirected marketing page is never evidence for this job.
  if (!detail.verified || canonicalizeUrl(row.job_url) !== canonicalizeUrl(detail.job_url)
    || row.job_title.toLowerCase().replace(/\W/g, '') !== detail.job_title.toLowerCase().replace(/\W/g, '')) return {};
  return {
    ...(!row.description && (detail.description?.length ?? 0) >= 120 ? {description: detail.description} : {}),
    ...(!row.country_code && detail.country_code ? {country_code: detail.country_code} : {}),
    ...(!row.location && detail.location ? {location: detail.location, city: detail.city ?? null, province: detail.province ?? null} : {}),
  };
}

async function workdayDetail(row: Row, boardId: string, ctx: Ctx): Promise<CanonicalJob | null> {
  const board = parseWorkdayBoardId(boardId);
  const url = new URL(row.job_url);
  const index = url.pathname.indexOf('/job/');
  if (!board || url.hostname !== board.host || index < 0) return null;
  const endpoint = `https://${board.host}/wday/cxs/${board.tenant}/${encodeURIComponent(board.site)}${url.pathname.slice(index)}`;
  const response = await ctx.fetchText(endpoint, {kind: 'api', retries: 0});
  if (response.status !== 200) return null;
  const info = JSON.parse(response.text).jobPostingInfo;
  if (!info?.title || !info?.jobDescription) return null;
  return finalizeJob({job_url: row.job_url, job_title: info.title, description: htmlToText(info.jobDescription),
    location: info.location, country_code: info.country?.descriptor, verified: true});
}

async function smartrecruitersDetail(row: Row, boardId: string, ctx: Ctx): Promise<CanonicalJob | null> {
  const url = new URL(row.job_url);
  const match = url.pathname.match(/^\/([^/]+)\/(\d+)(?:-|$)/);
  if (!match || url.hostname !== 'jobs.smartrecruiters.com' || decodeURIComponent(match[1]!).toLowerCase() !== boardId.toLowerCase()) return null;
  const response = await ctx.fetchText(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(boardId)}/postings/${match[2]}`, {kind: 'api', retries: 0});
  if (response.status !== 200) return null;
  const posting = JSON.parse(response.text);
  if (String(posting.id) !== match[2] || !posting.name) return null;
  const sections = Object.values(posting.jobAd?.sections ?? {}) as Array<{title?: string; text?: string}>;
  return finalizeJob({job_url: row.job_url, job_title: posting.name, verified: true, country_code: posting.location?.country,
    location: posting.location?.fullLocation || [posting.location?.city,posting.location?.country].filter(Boolean).join(', '),
    description: htmlToText(sections.map(section => `${section.title ?? ''}\n${section.text ?? ''}`).join('\n'))});
}

/** Source-only, bounded concurrent repair. Good saved facts are never overwritten. */
export async function enrichCommand(limit = 500, dryRun = false, budgetMin = 12, metadata = false, source?: string) {
  const db = createDb({ readOnly: dryRun });
  const deadline = Date.now() + budgetMin * 60000;
  const ctx = buildCtx(dryRun, false, deadline);
  ctx.llm = null;
  let query = db.from('job_opportunities')
    .select('id,job_url,job_title,location,description,country_code,company_career_sites!inner(career_url,source_type,source_config)')
    .eq('status', 'open').eq('verified', true).eq('is_foreign', false)
    .or(metadata ? 'location.is.null,country_code.is.null' : 'description.is.null,location.is.null');
  if (source) query = query.eq('company_career_sites.source_type', source);
  const { data, error } = await query.order('detail_checked_at', { ascending: true, nullsFirst: true }).order('first_seen_at', { ascending: false }).limit(Math.min(limit, 2000));
  if (error) throw error;
  let enriched = 0, checked = 0, failures = 0;
  const pool = pLimit(8);
  await Promise.all((data ?? []).map(row => pool(async () => {
    if (Date.now() >= deadline) return;
    checked++;
    const company = row.company_career_sites as unknown as {career_url: string; source_type: string; source_config: {board_id?: string}};
    try {
      if (!dryRun) {
        const mark = await db.from('job_opportunities').update({detail_checked_at: new Date().toISOString()}).eq('id', row.id);
        if (mark.error) throw mark.error;
      }
      let detail: CanonicalJob | null | undefined;
      if (company.source_type === 'ats:workday') detail = await workdayDetail(row, company.source_config?.board_id ?? '', ctx);
      else if (company.source_type === 'ats:smartrecruiters') detail = await smartrecruitersDetail(row, company.source_config?.board_id ?? '', ctx);
      else {
        if (new URL(row.job_url).hostname !== new URL(company.career_url).hostname || !(await ctx.robotsAllowed(row.job_url))) return;
        const response = await ctx.fetchText(row.job_url, {kind: 'html', retries: 0, timeoutMs: 10000});
        if (response.status !== 200 || canonicalizeUrl(response.finalUrl) !== canonicalizeUrl(row.job_url)) return;
        detail = jobPostingsFromHtml(response.text, response.finalUrl).find(job => canonicalizeUrl(job.job_url) === canonicalizeUrl(row.job_url))
          ?? jobFromDetailHtml(response.text, response.finalUrl, row.job_title);
      }
      if (!detail) return;
      const patch = enrichmentPatch(row, detail);
      if (!Object.keys(patch).length) return;
      if (!dryRun) {
        let query = db.from('job_opportunities').update(patch).eq('id', row.id).eq('status', 'open');
        for (const field of ['description', 'location', 'country_code']) if (field in patch) query = query.is(field, null);
        const update = await query;
        if (update.error) throw update.error;
      }
      enriched++;
      console.log(`enriched ${row.id}: ${Object.keys(patch).join(',')}${dryRun ? ' (dry run)' : ''}`);
    } catch (error) { failures++; console.warn(`enrich ${row.id}: ${error instanceof Error ? error.message : JSON.stringify(error)}`); }
  })));
  console.log(JSON.stringify({selected: data?.length ?? 0, checked, enriched, failures, dry_run: dryRun, ai_calls: 0}));
}
