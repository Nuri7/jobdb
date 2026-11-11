import { createDb } from './db.js';
import { buildCtx } from './refresh.js';
import { canonicalizeUrl } from './extract/normalize.js';
import { jobPostingsFromHtml } from './sources/jsonld.js';

/** Bounded HTTP-only repair of incomplete public vacancies. Never generates missing facts. */
export async function enrichCommand(limit = 30, dryRun = false) {
  const db = createDb({ readOnly: dryRun });
  const ctx = buildCtx(dryRun);
  const { data, error } = await db.from('job_opportunities')
    .select('id,job_url,job_title,location,description,company_career_sites!inner(career_url)')
    .eq('status', 'open').eq('verified', true).eq('is_foreign', false).is('description', null)
    .order('detail_checked_at', { ascending: true, nullsFirst: true }).order('first_seen_at', { ascending: false }).limit(Math.min(limit, 100));
  if (error) throw error;
  let enriched = 0;
  const started = Date.now();
  for (const row of data || []) {
    if (Date.now() - started > 4 * 60000) break;
    const company = row.company_career_sites as unknown as {career_url: string};
    try {
      if (!dryRun) {
        const { error: markError } = await db.from('job_opportunities').update({ detail_checked_at: new Date().toISOString() }).eq('id', row.id);
        if (markError) throw markError;
      }
      if (new URL(row.job_url).hostname !== new URL(company.career_url).hostname || !(await ctx.robotsAllowed(row.job_url))) continue;
      const response = await ctx.fetchText(row.job_url, { kind: 'html', retries: 0, timeoutMs: 10000 });
      if (response.status !== 200) continue;
      const detail = jobPostingsFromHtml(response.text, response.finalUrl).find(job => canonicalizeUrl(job.job_url) === canonicalizeUrl(row.job_url));
      if (!detail?.description || detail.description.length < 120) continue;
      if (!dryRun) {
        const { error: updateError } = await db.from('job_opportunities').update({
          description: detail.description,
          last_seen_at: new Date().toISOString(),
          ...(detail.country_code ? { country_code: detail.country_code } : {}),
          ...(!row.location && detail.location ? { location: detail.location, city: detail.city, province: detail.province } : {}),
        }).eq('id', row.id).is('description', null);
        if (updateError) throw updateError;
      }
      enriched++;
      console.log(`enriched ${row.id}: ${detail.description.length} source characters${dryRun ? ' (dry run)' : ''}`);
    } catch (error) { console.warn(`enrich ${row.id}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  console.log(JSON.stringify({ checked: data?.length || 0, enriched, dry_run: dryRun, ai_calls: 0 }));
}
