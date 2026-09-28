import pLimit from 'p-limit';
import { config } from '../config.js';
import {
  createDb,
  existingBoardIds,
  insertCompanies,
  recordIngestionCandidate,
  skippedIngestionCandidateKeys,
  type NewCompany,
} from '../db.js';
import { buildCtx } from '../refresh.js';
import type { AtsName, Ctx } from '../types.js';
import { ccPathTokens, ccTokens, ccUrls } from './commoncrawl.js';
import {
  validateAshby,
  validateAfas,
  validateGreenhouse,
  validateHomerun,
  validateLever,
  validatePersonio,
  validateRecruitee,
  validateSmartRecruiters,
  validateSuccessFactors,
  validateTeamtailor,
  validateWorkable,
  validateWorkday,
  validateJoin,
  type HarvestCandidate,
} from './validators.js';

const GREENHOUSE_HOSTS = ['boards.greenhouse.io', 'job-boards.greenhouse.io'];
const LEVER_HOSTS = ['jobs.lever.co', 'jobs.eu.lever.co'];
const SMARTRECRUITERS_HOSTS = ['careers.smartrecruiters.com', 'jobs.smartrecruiters.com'];

export function workdayBoards(urls: string[]): string[] {
  const boards = new Set<string>();
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      if (!/^[a-z0-9-]+(?:\.wd\d+)?\.myworkdayjobs\.com$/i.test(url.hostname)) continue;
      if (['www', 'jobs', 'careers'].includes(url.hostname.split('.')[0]!.toLowerCase())) continue;
      const segments = url.pathname.split('/').filter(Boolean);
      const siteIndex = segments[0] && /^[a-z]{2}-[a-z]{2}$/i.test(segments[0]) ? 1 : 0;
      const site = segments[siteIndex];
      if (site && !/^(job|details|search)$/i.test(site)) boards.add(`${url.hostname.toLowerCase()}|${site}`);
    } catch { /* malformed capture */ }
  }
  return [...boards];
}

export function successFactorsBoards(urls: string[]): string[] {
  const boards = new Set<string>();
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      if (!/^career\d+\.successfactors\.(?:eu|com)$/i.test(url.hostname)) continue;
      const company = url.searchParams.get('company');
      if (company && /^[a-z0-9_-]{2,80}$/i.test(company)) boards.add(`${url.hostname.toLowerCase()}|${company}`);
    } catch { /* malformed capture */ }
  }
  return [...boards];
}

export interface HarvestOpts {
  ats: AtsName[];
  limit?: number;
  minNl: number;
  dryRun: boolean;
  /** How many recent monthly Common Crawl indexes to union (wider = more coverage). */
  ccIndexes?: number;
}

interface Discoverer {
  discover: (ctx: Ctx, indexes?: number) => Promise<string[]>;
  validate: (token: string, ctx: Ctx) => Promise<HarvestCandidate | null>;
  /** Map a stored board_id back to the discovery token, for dedup (identity if omitted). */
  normalizeKnown?: (boardId: string) => string;
}

/** ATS platforms we can harvest today. Common Crawl gives the roster; the validator confirms NL jobs. */
const DISCOVERERS: Partial<Record<AtsName, Discoverer>> = {
  recruitee: { discover: (ctx, n) => ccTokens('recruitee.com', ctx, { indexes: n }), validate: validateRecruitee },
  homerun: { discover: (ctx, n) => ccTokens('homerun.co', ctx, { indexes: n }), validate: validateHomerun },
  // Personio board_id is the full host (<token>.jobs.personio.com); dedup on the bare token.
  personio: {
    discover: (ctx, n) => ccTokens('jobs.personio.com', ctx, { indexes: n }),
    validate: validatePersonio,
    normalizeKnown: (b) => b.split('.')[0] ?? b,
  },
  teamtailor: { discover: (ctx, n) => ccTokens('teamtailor.com', ctx, { indexes: n }), validate: validateTeamtailor },
  // Greenhouse is path-based (boards.greenhouse.io/<token>), so discover from URL paths.
  greenhouse: {
    discover: (ctx, n) => ccPathTokens('greenhouse.io', ctx, GREENHOUSE_HOSTS, { indexes: n }),
    validate: validateGreenhouse,
  },
  ashby: {
    discover: (ctx, n) => ccPathTokens('ashbyhq.com', ctx, ['jobs.ashbyhq.com'], { indexes: n }),
    validate: validateAshby,
  },
  // Lever, Workable and SmartRecruiters are all path-based. They skew toward international
  // employers and scale-ups — the Amsterdam segment the Dutch-SME platforms above miss.
  lever: {
    discover: (ctx, n) => ccPathTokens('lever.co', ctx, LEVER_HOSTS, { indexes: n }),
    validate: validateLever,
  },
  workable: {
    discover: (ctx, n) => ccPathTokens('workable.com', ctx, ['apply.workable.com'], { indexes: n }),
    validate: validateWorkable,
  },
  smartrecruiters: {
    discover: (ctx, n) => ccPathTokens('smartrecruiters.com', ctx, SMARTRECRUITERS_HOSTS, { indexes: n }),
    validate: validateSmartRecruiters,
  },
  afas: {
    discover: (ctx, n) => ccTokens('afas.online', ctx, { indexes: n }),
    validate: validateAfas,
  },
  join: {
    discover: (ctx, n) => ccPathTokens('join.com', ctx, ['join.com', 'www.join.com'], { indexes: n }),
    validate: validateJoin,
  },
  workday: {
    discover: async (ctx, n) => workdayBoards(await ccUrls('myworkdayjobs.com', ctx, { indexes: n, maxPages: 50 })),
    validate: validateWorkday,
    normalizeKnown: (board) => board.toLowerCase(),
  },
  successfactors: {
    discover: async (ctx, n) => {
      const [eu, global] = await Promise.all([
        ccUrls('successfactors.eu', ctx, { indexes: n, maxPages: 40 }),
        ccUrls('successfactors.com', ctx, { indexes: n, maxPages: 40 }),
      ]);
      return successFactorsBoards([...eu, ...global]);
    },
    validate: validateSuccessFactors,
    normalizeKnown: (board) => board.toLowerCase(),
  },
};

export function harvestableAts(): AtsName[] {
  return Object.keys(DISCOVERERS) as AtsName[];
}

function toRow(c: HarvestCandidate): NewCompany {
  return {
    company_name: c.companyName,
    career_url: c.careerUrl,
    website: c.website,
    source_type: c.sourceType,
    source_config: {
      resolved_url: c.careerUrl,
      board_id: c.boardId,
      ...(c.boardRegion ? { board_region: c.boardRegion } : {}),
    },
  };
}

async function harvestOne(ats: AtsName, disc: Discoverer, opts: HarvestOpts, ctx: Ctx): Promise<void> {
  const cfg = config();
  const db = createDb({ readOnly: opts.dryRun });
  console.log(`\n=== ${ats} ===`);

  // 1. Discover the full tenant roster from Common Crawl.
  let tokens: string[];
  try {
    tokens = await disc.discover(ctx, opts.ccIndexes);
  } catch (err) {
    console.error(`  discovery failed: ${err instanceof Error ? err.message : err}`);
    return;
  }
  console.log(`  discovered ${tokens.length} candidate tokens via Common Crawl`);
  if (tokens.length === 0) return;

  // 2. Drop the ones we already track (comparing on the bare token, not the raw board_id).
  const known = await existingBoardIds(db, `ats:${ats}`);
  const norm = disc.normalizeKnown ?? ((b) => b);
  const knownTokens = new Set([...known].map(norm));
  const cached = await skippedIngestionCandidateKeys(db, `ats:${ats}`);
  let fresh = tokens.filter((t) => !knownTokens.has(norm(t)) && !cached.has(norm(t)));
  console.log(`  ${known.size} already in DB, ${cached.size} cached candidates → ${fresh.length} new/due to validate`);
  if (opts.limit && fresh.length > opts.limit) {
    console.log(`  capping at --limit ${opts.limit} (of ${fresh.length})`);
    fresh = fresh.slice(0, opts.limit);
  }
  if (fresh.length === 0) return;

  // 3. Validate concurrently: alive board? has ≥ minNl NL jobs?
  const pool = pLimit(cfg.COMPANY_CONCURRENCY);
  const keep: HarvestCandidate[] = [];
  let checked = 0;
  let dead = 0;
  let nonNl = 0;
  await Promise.all(
    fresh.map((token) =>
      pool(async () => {
        const c = await disc.validate(token, ctx).catch(() => null);
        checked++;
        if (!c) {
          dead++;
          if (!opts.dryRun) await recordIngestionCandidate(db, `ats:${ats}`, norm(token), 'retry', { retryDays: 30 });
        }
        else if (c.nlJobs < opts.minNl) {
          nonNl++;
          if (!opts.dryRun) await recordIngestionCandidate(db, `ats:${ats}`, norm(token), 'rejected', {
            sourceUrl: c.careerUrl,
            retryDays: 14,
            details: { total_jobs: c.totalJobs, nl_jobs: c.nlJobs },
          });
        }
        else keep.push(c);
        if (checked % 50 === 0 || checked === fresh.length) {
          console.log(`  …validated ${checked}/${fresh.length} (keep ${keep.length}, dead ${dead}, non-NL ${nonNl})`);
        }
      }),
    ),
  );

  // 4. Insert the survivors — verified + due now, so the next refresh scrapes them.
  const nlJobEstimate = keep.reduce((s, c) => s + c.nlJobs, 0);
  keep.sort((a, b) => b.nlJobs - a.nlJobs);
  if (opts.dryRun) {
    console.log(`  [dry-run] would insert ${keep.length} companies (~${nlJobEstimate} NL jobs). Sample:`);
    for (const c of keep.slice(0, 25)) {
      console.log(`    + ${c.companyName}  (${c.boardId})  ${c.nlJobs}/${c.totalJobs} NL jobs`);
    }
  } else if (keep.length > 0) {
    const n = await insertCompanies(db, keep.map(toRow));
    await Promise.all(keep.map((candidate) => recordIngestionCandidate(
      db,
      `ats:${ats}`,
      disc.normalizeKnown ? disc.normalizeKnown(candidate.boardId) : candidate.boardId,
      'accepted',
      { sourceUrl: candidate.careerUrl, details: { total_jobs: candidate.totalJobs, nl_jobs: candidate.nlJobs } },
    )));
    console.log(`  inserted ${n} companies (~${nlJobEstimate} NL jobs) — will scrape on next refresh`);
  }

  const rate = fresh.length ? Math.round((100 * keep.length) / fresh.length) : 0;
  console.log(`  NL keep-rate: ${keep.length}/${fresh.length} validated (${rate}%)`);
}

export async function harvestCommand(opts: HarvestOpts): Promise<void> {
  const startedAt = Date.now();
  const ctx = buildCtx(opts.dryRun);
  console.log(
    `Harvesting ${opts.ats.join(', ')} — keep boards with ≥${opts.minNl} NL job(s)${opts.dryRun ? ' [dry-run, no writes]' : ''}`,
  );
  for (const ats of opts.ats) {
    const disc = DISCOVERERS[ats];
    if (!disc) {
      console.error(`\n=== ${ats} ===\n  no harvester yet (available: ${harvestableAts().join(', ')})`);
      continue;
    }
    await harvestOne(ats, disc, opts, ctx);
  }
  console.log(`\nHarvest done in ${Math.round((Date.now() - startedAt) / 1000)}s.`);
}
