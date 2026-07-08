import pLimit from 'p-limit';
import { config } from '../config.js';
import { createDb, existingBoardIds, insertCompanies, type NewCompany } from '../db.js';
import { buildCtx } from '../refresh.js';
import type { AtsName, Ctx } from '../types.js';
import { ccPathTokens, ccTokens } from './commoncrawl.js';
import {
  validateGreenhouse,
  validateHomerun,
  validatePersonio,
  validateRecruitee,
  validateTeamtailor,
  type HarvestCandidate,
} from './validators.js';

const GREENHOUSE_HOSTS = ['boards.greenhouse.io', 'job-boards.greenhouse.io'];

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
    source_config: { resolved_url: c.careerUrl, board_id: c.boardId },
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
  let fresh = tokens.filter((t) => !knownTokens.has(t));
  console.log(`  ${known.size} already in DB → ${fresh.length} new to validate`);
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
        if (!c) dead++;
        else if (c.nlJobs < opts.minNl) nonNl++;
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
