import { fetchJobsWithEscalation } from './lifecycle.js';
import { resolveCompany } from './resolver/index.js';
import { closeBrowser } from './sources/rendered.js';
import { buildCtx } from './refresh.js';
import type { CompanyRow } from './types.js';

/**
 * DB-less end-to-end test of the funnel for one URL:
 * resolve → fingerprint → fetch jobs via the detected source. Nothing is written.
 */
export async function probeCommand(url: string, name?: string): Promise<void> {
  const ctx = buildCtx(true);
  const company: CompanyRow = {
    id: '00000000-0000-0000-0000-000000000000',
    company_name: name ?? new URL(url).hostname.replace(/^www\./, ''),
    career_url: url,
    website: null,
    career_page_status: 'unverified',
    source_type: null,
    source_config: null,
    is_scrape_enabled: true,
    is_active: true,
    consecutive_failures: 0,
    check_interval_hours: 24,
    next_check_at: new Date().toISOString(),
    last_success_at: null,
    jobs_found_count: 0,
  };

  console.log(`Probing ${company.company_name} (${url}) …\n`);
  const started = Date.now();
  const result = await resolveCompany(company, ctx, null);
  console.log('— Resolve —');
  console.log(`  status:      ${result.career_page_status}`);
  console.log(`  career_url:  ${result.career_url}`);
  console.log(`  source_type: ${result.source_type}`);
  console.log(`  config:      ${JSON.stringify(result.source_config)}`);
  for (const e of result.evidence) console.log(`  · ${e}`);

  if (result.career_page_status !== 'verified' || !result.source_type) {
    console.log('\nNo scrapable source found.');
    await closeBrowser();
    return;
  }

  const scrapeTarget: CompanyRow = {
    ...company,
    career_url: result.career_url,
    career_page_status: result.career_page_status,
    source_type: result.source_type,
    source_config: result.source_config,
  };
  console.log('\n— Fetch —');
  try {
    const { jobs, usedType } = await fetchJobsWithEscalation(scrapeTarget, ctx);
    if (usedType !== result.source_type) console.log(`  (escalated to ${usedType})`);
    console.log(`  ${jobs.length} jobs in ${Math.round((Date.now() - started) / 1000)}s`);
    for (const job of jobs.slice(0, 10)) {
      console.log(`  · ${job.job_title}  [${job.location ?? '?'}]  ${job.job_url}`);
    }
    if (jobs.length > 10) console.log(`  … and ${jobs.length - 10} more`);
  } catch (err) {
    console.error(`  FETCH FAILED: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  } finally {
    await closeBrowser();
  }
}
