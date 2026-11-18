import { randomUUID } from 'node:crypto';
import { createDb, findCompany } from './db.js';
import { buildCtx } from './refresh.js';
import { resolveCompany } from './resolver/index.js';
import { fetchJobsWithEscalation, processCompany } from './lifecycle.js';
import { createRobotsChecker, politeFetchText } from './politeness.js';
import { publicFetchText, publicHttpsUrl } from './public-fetch.js';
import { canonicalizeUrl } from './extract/normalize.js';
import type { CompanyRow } from './types.js';

/** Review is explicit; the scheduled worker only processes approved requests. */
export async function sourceRequestsCommand(limit = 20, dryRun = false, budgetMin = 12) {
  const db = createDb({readOnly: dryRun});
  const now = new Date().toISOString();
  const pending = await db.from('job_source_requests').select('*')
    .in('status', ['approved','failed','validating']).lt('attempts', 3).lte('next_check_at', now)
    .order('next_check_at').limit(limit);
  if (pending.error) throw pending.error;
  const deadline = Date.now() + budgetMin * 60000;
  for (const row of pending.data ?? []) {
    if (Date.now() >= deadline) break;
    if (row.status === 'validating' && Date.parse(row.updated_at) > Date.now() - 2 * 3600000) continue;
    if (dryRun) {console.log(`Would check approved source ${row.id}: ${row.career_url}`); continue;}
    const claim = await db.from('job_source_requests').update({status: 'validating', attempts: row.attempts + 1, updated_at: now})
      .eq('id', row.id).eq('status', row.status).eq('updated_at', row.updated_at).select('id');
    if (claim.error) throw claim.error;
    if (!claim.data?.length) continue;
    try {
      const url = publicHttpsUrl(row.career_url);
      const ctx = buildCtx(false);
      ctx.llm = null;
      ctx.allowRendered = false;
      ctx.fetchText = (url, opts) => {
        if (Date.now() >= deadline) throw new Error('Source validation time budget reached');
        return politeFetchText(url, opts, publicFetchText);
      };
      ctx.robotsAllowed = createRobotsChecker(true, ctx.fetchText);
      if (!(await ctx.robotsAllowed(url.toString()))) throw new Error('Robotsbeleid staat controle van deze bron niet toe.');
      // Reuse a stored source; never replace its existing documents or ownership.
      const found = await db.from('company_career_sites').select('id,career_url').eq('career_url', canonicalizeUrl(row.career_url) ?? row.career_url).limit(1);
      if (found.error) throw found.error;
      let target = found.data?.[0] ? await findCompany(db, found.data[0].id) : null;
      if (!target) {
        const candidate: CompanyRow = {id: randomUUID(), company_name: row.company_name, career_url: url.toString(), website: url.origin,
          career_page_status: 'unverified', source_type: null, source_config: null, is_scrape_enabled: true, is_active: true,
          consecutive_failures: 0, check_interval_hours: 24, next_check_at: now, last_success_at: null, jobs_found_count: null};
        const resolved = await resolveCompany(candidate, ctx, db);
        if (resolved.source_config?.duplicate_of) target = await findCompany(db, resolved.source_config.duplicate_of);
        else {
          if (resolved.career_page_status !== 'verified' || !resolved.source_type || resolved.source_type === 'rendered' || resolved.source_type === 'ats:successfactors')
            throw new Error('Geen automatisch controleerbare bron gevonden. Handmatige broncontrole nodig.');
          const preflight = await fetchJobsWithEscalation({...candidate, ...resolved}, ctx);
          if (!preflight.jobs.some(job => job.verified && (job.country_code
            ? /^(NL|NLD|Netherlands|The Netherlands|Nederland)$/i.test(job.country_code)
            : Boolean(job.province)))) throw new Error('Geen actuele, geverifieerde Nederlandse vacatures gevonden.');
          const inserted = await db.from('company_career_sites').insert({...candidate, ...resolved, evidence: undefined}).select('id').single();
          if (inserted.error) throw inserted.error;
          target = await findCompany(db, inserted.data.id);
        }
      }
      if (!target || target.source_type === 'rendered' || target.source_type === 'ats:successfactors') throw new Error('Bron vereist handmatige controle.');
      const result = await processCompany(db, ctx, target);
      if (!['ok','nochange'].includes(result.status)) throw new Error(result.error ?? result.status);
      const saved = await db.from('job_source_requests').update({status: 'imported', company_id: target.id, jobs_imported: result.openNow ?? 0,
        review_note: null, updated_at: new Date().toISOString()}).eq('id', row.id);
      if (saved.error) throw saved.error;
      console.log(JSON.stringify({request: row.id, company: target.id, imported: result.openNow ?? 0}));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const saved = await db.from('job_source_requests').update({status: 'failed', review_note: message.slice(0,500),
        next_check_at: new Date(Date.now() + 86400000).toISOString(), updated_at: new Date().toISOString()}).eq('id', row.id);
      if (saved.error) throw saved.error;
      console.error(`Source request ${row.id}: ${message}`);
    }
  }
}
