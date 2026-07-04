export const ATS_NAMES = [
  'recruitee',
  'greenhouse',
  'lever',
  'ashby',
  'workable',
  'smartrecruiters',
  'personio',
  'teamtailor',
  'homerun',
  'join',
] as const;

export type AtsName = (typeof ATS_NAMES)[number];

/** NL-market ATS platforms we fingerprint (for stats) but don't have adapters for yet. */
export const ATS_HINTS = [
  'carerix',
  'otys',
  'mysolution',
  'afas',
  'hroffice',
  'workday',
  'successfactors',
  'jobtoolz',
  'emply',
  'byner',
  'bullhorn',
] as const;

export type AtsHint = (typeof ATS_HINTS)[number];

export type SourceType = `ats:${AtsName}` | 'api' | 'sitemap' | 'static' | 'rendered';

export type CareerPageStatus = 'unverified' | 'verified' | 'dead' | 'ambiguous';

/** Normalized job as stored in job_opportunities. job_url is the upsert conflict key. */
export interface CanonicalJob {
  job_url: string;
  job_title: string;
  location?: string;
  employment_type?: string;
  department?: string;
  salary_range?: string;
  description?: string;
  posted_date?: string; // ISO date (YYYY-MM-DD)
  is_remote?: boolean;
  is_internship?: boolean;
  experience_level?: string;
  /** Normalized city + province derived from `location` (for maps / filtering). */
  city?: string;
  province?: string;
  content_hash: string;
  /**
   * True only when we have strong evidence this is a genuine, applyable vacancy:
   * schema.org JobPosting JSON-LD, an ATS structured adapter, or a heuristic page
   * with a real apply element. The public API serves ONLY verified jobs.
   */
  verified: boolean;
}

export interface SourceConfig {
  /** Must equal company.career_url — a mismatch means the URL was edited elsewhere; re-resolve. */
  resolved_url: string;
  /** ATS board identity (slug/token). Also the duplicate-board detection key. */
  board_id?: string;
  /** Extra ATS routing detail (e.g. lever region 'eu'). */
  board_region?: string;
  sitemap_url?: string;
  listing_urls?: string[];
  /** Fingerprint label when we saw a known ATS without having an adapter for it. */
  ats_hint?: AtsHint;
  etag?: Record<string, string>;
  listing_hash?: string;
  /** Last time a full (non-short-circuited) scrape ran. Force full every 7 days. */
  last_full_at?: string;
  duplicate_of?: string;
}

export interface CompanyRow {
  id: string;
  company_name: string;
  career_url: string | null;
  website: string | null;
  career_page_status: CareerPageStatus;
  source_type: SourceType | null;
  source_config: SourceConfig | null;
  is_scrape_enabled: boolean;
  is_active: boolean | null;
  consecutive_failures: number;
  check_interval_hours: number;
  next_check_at: string;
  last_success_at: string | null;
  jobs_found_count: number | null;
}

export interface ResolveResult {
  career_url: string | null;
  career_page_status: CareerPageStatus;
  source_type: SourceType | null;
  source_config: SourceConfig | null;
  /** Human-readable trace of how we got here (stored in logs only). */
  evidence: string[];
}

export interface FetchResult {
  status: number;
  finalUrl: string;
  text: string;
  contentType: string;
  etag?: string;
  notModified?: boolean;
}

export interface Ctx {
  log: (msg: string) => void;
  dryRun: boolean;
  /** Skip the change-detection short-circuit and re-extract every company (full re-scrape). */
  force?: boolean;
  /** Fetch with retry + politeness (per-host serialization). */
  fetchText: (url: string, opts?: FetchTextOpts) => Promise<FetchResult>;
  llm: LlmClient | null;
  robotsAllowed: (url: string) => Promise<boolean>;
}

export interface FetchTextOpts {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Politeness class: 'api' (250ms/host) or 'html' (1000ms/host). Default 'html'. */
  kind?: 'api' | 'html';
  ifNoneMatch?: string;
  method?: 'GET' | 'HEAD';
}

export interface LlmClient {
  callsUsed: number;
  /** JSON-mode chat call; returns parsed JSON or null on failure. Enforces the per-run cap. */
  json<T>(system: string, user: string, maxTokens?: number): Promise<T | null>;
}

export interface JobSource {
  readonly type: SourceType;
  /** Cheap change probe; return false to short-circuit the scrape (all open jobs still present). */
  hasChanged?(company: CompanyRow, ctx: Ctx): Promise<boolean>;
  fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]>;
}

/** Thrown when the configured source is permanently gone (404 board, dead domain) → re-resolve. */
export class SourceGoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceGoneError';
  }
}

/**
 * Thrown when a source SAW job signals (sitemap entries, listing links) but extracted 0 jobs —
 * an extraction failure, not an empty board. Triggers tier escalation, never job closures.
 */
export class ZeroExtractionError extends Error {
  constructor(
    message: string,
    public readonly signals: number,
  ) {
    super(message);
    this.name = 'ZeroExtractionError';
  }
}
