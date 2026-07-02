import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';
import type { CanonicalJob, CompanyRow, SourceConfig, SourceType } from './types.js';

export type Db = SupabaseClient;

const COMPANY_COLUMNS =
  'id, company_name, career_url, website, career_page_status, source_type, source_config, ' +
  'is_scrape_enabled, is_active, consecutive_failures, check_interval_hours, next_check_at, ' +
  'last_success_at, jobs_found_count';

export function createDb(opts: { readOnly?: boolean } = {}): Db {
  const cfg = config();
  const key = cfg.SUPABASE_SERVICE_ROLE_KEY || (opts.readOnly ? cfg.SUPABASE_ANON_KEY : '');
  if (!key) {
    console.error(
      'SUPABASE_SERVICE_ROLE_KEY is required for writes (SUPABASE_ANON_KEY suffices for --dry-run).',
    );
    process.exit(1);
  }
  return createClient(cfg.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function hasServiceRole(): boolean {
  return Boolean(config().SUPABASE_SERVICE_ROLE_KEY);
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: no data`);
  return res.data;
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export interface Shard {
  k: number; // 0-indexed shard number
  n: number; // total shards
}

/** Disjoint uuid range for a shard (uuids are uniformly random, so first-hex-char ranges partition evenly). */
function shardRange(shard: Shard): { lo: string; hi: string | null } {
  const loChar = Math.floor((shard.k * 16) / shard.n);
  const hiChar = Math.floor(((shard.k + 1) * 16) / shard.n);
  const uuid = (c: number) => `${c.toString(16)}0000000-0000-0000-0000-000000000000`;
  return { lo: uuid(loChar), hi: hiChar >= 16 ? null : uuid(hiChar) };
}

export async function pickDueCompanies(db: Db, limit: number, shard?: Shard): Promise<CompanyRow[]> {
  let query = db
    .from('company_career_sites')
    .select(COMPANY_COLUMNS)
    .eq('is_scrape_enabled', true)
    .neq('career_page_status', 'ambiguous')
    .lte('next_check_at', new Date().toISOString());
  if (shard && shard.n > 1) {
    const { lo, hi } = shardRange(shard);
    query = query.gte('id', lo);
    if (hi) query = query.lt('id', hi);
  }
  const res = await query.order('next_check_at', { ascending: true }).limit(limit);
  return unwrap(res, 'pickDueCompanies') as unknown as CompanyRow[];
}

export async function pickResolvable(
  db: Db,
  limit: number,
  onlyBroken: boolean,
  force = false,
): Promise<CompanyRow[]> {
  let query = db
    .from('company_career_sites')
    .select(COMPANY_COLUMNS)
    .eq('is_scrape_enabled', true)
    .order('next_check_at', { ascending: true })
    .limit(limit);
  // Server-side status filter — client-side filtering starves the picker once
  // the earliest next_check_at rows are all verified
  if (onlyBroken) {
    query = query.or('career_page_status.in.(dead,unverified,ambiguous),consecutive_failures.gte.3');
  } else if (!force) {
    query = query.eq('career_page_status', 'unverified');
  }
  const res = await query;
  return unwrap(res, 'pickResolvable') as unknown as CompanyRow[];
}

export async function findCompany(db: Db, idOrName: string): Promise<CompanyRow | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName);
  const query = db.from('company_career_sites').select(COMPANY_COLUMNS);
  const res = isUuid
    ? await query.eq('id', idOrName).limit(1)
    : await query.ilike('company_name', `%${idOrName}%`).limit(5);
  const rows = unwrap(res, 'findCompany') as unknown as CompanyRow[];
  if (rows.length > 1) {
    console.error(`Multiple matches for "${idOrName}":`);
    for (const r of rows) console.error(`  ${r.id}  ${r.company_name}`);
  }
  return rows[0] ?? null;
}

export async function updateCompany(
  db: Db,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const res = await db.from('company_career_sites').update(patch).eq('id', id);
  if (res.error) throw new Error(`updateCompany: ${res.error.message}`);
}

/** Duplicate-board detection: does another company already own this board identity? */
export async function findBoardOwner(
  db: Db,
  sourceType: SourceType,
  boardId: string,
  excludeCompanyId: string,
): Promise<string | null> {
  const res = await db
    .from('company_career_sites')
    .select('id')
    .eq('source_type', sourceType)
    .eq('source_config->>board_id', boardId)
    .neq('id', excludeCompanyId)
    .limit(1);
  if (res.error) throw new Error(`findBoardOwner: ${res.error.message}`);
  return res.data?.[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Jobs + lifecycle
// ---------------------------------------------------------------------------

export interface ExistingJob {
  id: string;
  job_url: string;
  content_hash: string | null;
  status: string;
  verified: boolean;
}

export async function listCompanyJobs(db: Db, companyId: string): Promise<ExistingJob[]> {
  const out: ExistingJob[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const res = await db
      .from('job_opportunities')
      .select('id, job_url, content_hash, status, verified')
      .eq('company_career_site_id', companyId)
      .range(offset, offset + page - 1);
    const rows = unwrap(res, 'listCompanyJobs') as unknown as ExistingJob[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function upsertJobs(db: Db, companyId: string, jobs: CanonicalJob[]): Promise<number> {
  const now = new Date().toISOString();
  let written = 0;
  for (const batch of chunk(jobs, 100)) {
    const rows = batch.map((j) => ({
      company_career_site_id: companyId,
      job_title: j.job_title,
      job_url: j.job_url,
      location: j.location ?? null,
      employment_type: j.employment_type ?? null,
      department: j.department ?? null,
      salary_range: j.salary_range ?? null,
      description: j.description ?? null,
      posted_date: j.posted_date ?? null,
      is_remote: j.is_remote ?? false,
      is_internship: j.is_internship ?? false,
      experience_level: j.experience_level ?? null,
      scraped_at: now,
      status: 'open',
      closed_at: null,
      miss_count: 0,
      last_seen_at: now,
      content_hash: j.content_hash,
      verified: j.verified,
    }));
    const res = await db.from('job_opportunities').upsert(rows, { onConflict: 'job_url' });
    if (res.error) throw new Error(`upsertJobs: ${res.error.message}`);
    written += batch.length;
  }
  return written;
}

/** Unchanged jobs: just refresh liveness, don't rewrite content fields. */
export async function touchJobs(db: Db, ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  for (const batch of chunk(ids, 200)) {
    const res = await db
      .from('job_opportunities')
      .update({ last_seen_at: now, scraped_at: now, miss_count: 0, status: 'open', closed_at: null })
      .in('id', batch);
    if (res.error) throw new Error(`touchJobs: ${res.error.message}`);
  }
}

export async function incrementMisses(db: Db, ids: string[]): Promise<string[]> {
  // Two-step (read counts, then write) — fine for our single-writer worker.
  const closed: string[] = [];
  const now = new Date().toISOString();
  for (const batch of chunk(ids, 200)) {
    const res = await db
      .from('job_opportunities')
      .select('id, miss_count')
      .in('id', batch);
    const rows = unwrap(res, 'incrementMisses.read') as unknown as Array<{ id: string; miss_count: number }>;
    const toClose = rows.filter((r) => r.miss_count + 1 >= 2).map((r) => r.id);
    const toBump = rows.filter((r) => r.miss_count + 1 < 2);
    if (toClose.length > 0) {
      const upd = await db
        .from('job_opportunities')
        .update({ status: 'closed', closed_at: now, miss_count: 2 })
        .in('id', toClose);
      if (upd.error) throw new Error(`incrementMisses.close: ${upd.error.message}`);
      closed.push(...toClose);
    }
    for (const row of toBump) {
      const upd = await db
        .from('job_opportunities')
        .update({ miss_count: row.miss_count + 1 })
        .eq('id', row.id);
      if (upd.error) throw new Error(`incrementMisses.bump: ${upd.error.message}`);
    }
  }
  return closed;
}

export async function closeCompanyJobs(db: Db, companyId: string): Promise<number> {
  const res = await db
    .from('job_opportunities')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('company_career_site_id', companyId)
    .eq('status', 'open')
    .select('id');
  if (res.error) throw new Error(`closeCompanyJobs: ${res.error.message}`);
  return res.data?.length ?? 0;
}

export async function countOpenJobs(db: Db, companyId: string): Promise<number> {
  const res = await db
    .from('job_opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('company_career_site_id', companyId)
    .eq('status', 'open');
  if (res.error) throw new Error(`countOpenJobs: ${res.error.message}`);
  return res.count ?? 0;
}

// ---------------------------------------------------------------------------
// Scrape history
// ---------------------------------------------------------------------------

export async function insertHistory(
  db: Db,
  companyId: string,
  careerUrl: string,
  method: string,
): Promise<string | null> {
  const res = await db
    .from('scrape_history')
    .insert({ company_career_site_id: companyId, career_url: careerUrl, status: 'running', method })
    .select('id')
    .single();
  if (res.error) {
    console.error(`insertHistory: ${res.error.message}`);
    return null;
  }
  return (res.data as { id: string }).id;
}

export async function completeHistory(
  db: Db,
  historyId: string | null,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!historyId) return;
  const res = await db
    .from('scrape_history')
    .update({ ...patch, completed_at: new Date().toISOString() })
    .eq('id', historyId);
  if (res.error) console.error(`completeHistory: ${res.error.message}`);
}

export async function pruneHistory(db: Db, keepDays = 90): Promise<number> {
  const cutoff = new Date(Date.now() - keepDays * 86_400_000).toISOString();
  const res = await db.from('scrape_history').delete().lt('started_at', cutoff).select('id');
  if (res.error) {
    console.error(`pruneHistory: ${res.error.message}`);
    return 0;
  }
  return res.data?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Staleness sweep — companies whose source died must not serve zombie jobs
// ---------------------------------------------------------------------------

export async function staleCompanies(db: Db): Promise<Array<{ id: string; company_name: string }>> {
  const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const res = await db
    .from('company_career_sites')
    .select('id, company_name, last_success_at, consecutive_failures, jobs_found_count')
    .eq('is_scrape_enabled', true)
    .gt('jobs_found_count', 0)
    .or(`consecutive_failures.gte.10,last_success_at.lt.${cutoff}`);
  if (res.error) throw new Error(`staleCompanies: ${res.error.message}`);
  return (res.data ?? []) as Array<{ id: string; company_name: string }>;
}
