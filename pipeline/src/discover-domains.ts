import pLimit from 'p-limit';
import { config } from './config.js';
import {
  createDb,
  existingCompanyHosts,
  insertUnverifiedCompany,
  recordIngestionCandidate,
  skippedIngestionCandidateKeys,
} from './db.js';
import { buildCtx } from './refresh.js';
import { ccPatternUrls } from './harvest/commoncrawl.js';
import { jobPostingsFromHtml } from './sources/jsonld.js';

const AGGREGATOR_RE = /(indeed|linkedin|glassdoor|monsterboard|jobbird|werkzoeken|nationalevacaturebank|talent\.com|jooble|adzuna)/i;

function companyNameFromHost(host: string): string {
  const label = host.replace(/^www\./, '').split('.')[0] ?? host;
  return label
    .replace(/^(werkenbij|werkbij|careers?|jobs?|vacatures?)[-_]?/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim() || host;
}

export async function discoverDomainsCommand(opts: { limit?: number; dryRun: boolean }): Promise<void> {
  const ctx = buildCtx(opts.dryRun);
  const db = createDb({ readOnly: opts.dryRun });
  const patterns = ['*.nl/vacature/*', '*.nl/vacatures/*', '*.nl/jobs/*', '*.nl/werken-bij/*'];
  const batches = await Promise.all(patterns.map((pattern) => ccPatternUrls(pattern, ctx, { indexes: 2, maxPages: 4 })));
  const byHost = new Map<string, string>();
  for (const raw of batches.flat()) {
    try {
      const url = new URL(raw);
      const host = url.hostname.replace(/^www\./, '').toLowerCase();
      if (!host.endsWith('.nl') || AGGREGATOR_RE.test(host)) continue;
      if (!byHost.has(host)) byHost.set(host, url.toString());
    } catch { /* invalid capture */ }
  }

  const [known, cached] = await Promise.all([
    existingCompanyHosts(db),
    skippedIngestionCandidateKeys(db, 'commoncrawl:nl-domain'),
  ]);
  const candidates = [...byHost.entries()]
    .filter(([host]) => !known.has(host) && !cached.has(host))
    .slice(0, opts.limit ?? 500);
  console.log(`Dutch-domain discovery: ${byHost.size} hosts, ${known.size} known, ${cached.size} cached → validating ${candidates.length}`);

  const pool = pLimit(Math.min(config().COMPANY_CONCURRENCY, 12));
  let accepted = 0;
  let rejected = 0;
  await Promise.all(candidates.map(([host, sampleUrl]) => pool(async () => {
    const res = await ctx.fetchText(sampleUrl, { kind: 'html', retries: 1, timeoutMs: 15_000 }).catch(() => null);
    const postings = res?.status === 200 ? jobPostingsFromHtml(res.text, res.finalUrl) : [];
    const hasApplyablePosting = postings.some((job) => job.verified && job.job_title && job.job_url);
    if (!hasApplyablePosting) {
      rejected++;
      if (!opts.dryRun) await recordIngestionCandidate(db, 'commoncrawl:nl-domain', host, 'rejected', {
        sourceUrl: sampleUrl, retryDays: 30, details: { reason: 'no verified JobPosting on sample' },
      });
      return;
    }
    const origin = new URL(sampleUrl).origin;
    if (opts.dryRun) {
      console.log(`  [dry-run] + ${host} (${postings.length} posting(s) on sample)`);
      accepted++;
      return;
    }
    const inserted = await insertUnverifiedCompany(db, {
      name: companyNameFromHost(host), website: origin, careerUrl: origin,
    });
    if (inserted) {
      accepted++;
      await recordIngestionCandidate(db, 'commoncrawl:nl-domain', host, 'accepted', {
        sourceUrl: sampleUrl, details: { sample_postings: postings.length },
      });
    }
  })));
  console.log(`Dutch-domain discovery complete: accepted ${accepted}, rejected ${rejected}`);
}
