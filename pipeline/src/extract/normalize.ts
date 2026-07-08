import { createHash } from 'node:crypto';
import type { CanonicalJob } from '../types.js';
import { normalizeCity, provinceOf } from './nl-geo.js';

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gh_src', 'gh_jid', 'lever-source', 'lever-origin', 'source', 'src', 'ref',
  'fbclid', 'gclid', 'mc_cid', 'mc_eid',
]);

/**
 * Canonicalize a job URL — it is the upsert conflict key, so the same job seen
 * via sitemap vs. listing vs. ATS API must produce the same string.
 */
export function canonicalizeUrl(raw: string, base?: string): string | null {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.protocol = 'https:';
  u.hostname = u.hostname.toLowerCase();
  u.hash = '';
  // gh_jid identifies the job on embedded Greenhouse boards — keep it, drop other tracking noise
  const keepGhJid = u.searchParams.get('gh_jid');
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) && key.toLowerCase() !== 'gh_jid') u.searchParams.delete(key);
  }
  if (keepGhJid) u.searchParams.set('gh_jid', keepGhJid);
  u.searchParams.sort();
  let s = u.toString();
  if (u.pathname !== '/' && !u.search && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

/** Strip HTML tags to readable text (good enough for descriptions from ATS APIs). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&euml;/gi, 'ë')
    .replace(/&eacute;/gi, 'é')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

// A landing/info page, not a vacancy. Exact-match set + a few reliable prefixes.
// NOTE: "Vacature <role>" / "Vacatures <team>" are REAL job titles in Dutch, so we must
// NOT treat a leading "vacature" as junk — only the bare word or clear section phrases.
const JUNK_TITLE_EXACT = new Set([
  'home', 'welkom', 'contact', 'overzicht', 'vacatureoverzicht',
  'vacatures', 'vacature', 'alle vacatures', 'onze vacatures', 'openstaande vacatures',
  'careers', 'career', 'jobs', 'job', 'careers home',
  'solliciteren', 'sollicitatie', 'open sollicitatie', 'open sollicitaties', 'initiatiefsollicitatie',
  'werken bij', 'werken voor', 'over ons', 'over-ons', 'onze arbeidsvoorwaarden',
]);
const JUNK_TITLE_PREFIX =
  /^(werken bij |werk bij |werken voor |kom werken bij |word collega |onze arbeidsvoorwaarden\b)/i;

// Info/story/landing pages that slip through as "jobs" — they have no location because they
// are not vacancies: "Waarom werken bij X", "X als werkgever", "Het verhaal van …", "Stap voor stap …".
const JUNK_TITLE_RE =
  /(^(waarom (werken|kiezen)|over werken bij|het verhaal (van|achter)|ons verhaal|stap voor stap|werken in nederland)\b|\bals werkgever$)/i;

/** True when a title is a landing/info page rather than a specific vacancy. */
export function isJunkTitle(title: string): boolean {
  const s = title.trim().toLowerCase().replace(/\s+/g, ' ');
  return JUNK_TITLE_EXACT.has(s) || JUNK_TITLE_PREFIX.test(s) || JUNK_TITLE_RE.test(s);
}

/**
 * True when a title reads like a category/overview listing, not a single vacancy.
 * Careful: singular "Vacature <role>" IS a real job (common NL pattern) — only the
 * PLURAL "Vacatures <category>" and "... vacatures in <place>" forms are categories.
 */
export function isCategoryTitle(title: string): boolean {
  const s = title.trim().toLowerCase().replace(/\s+/g, ' ');
  return (
    /^vacatures\s+\S/.test(s) || // "vacatures engineering", "vacatures verpleegkundige"
    /\bvacatures?\s+(in|voor|bij|regio)\b/.test(s) || // "... vacatures in arnhem"
    /vacatures?\s*[|/]/.test(s) || // "vacatures | toerisme"
    /^(overzicht|alle vacatures|openstaande vacatures|vacatureoverzicht)\b/.test(s)
  );
}

export const MAX_DESCRIPTION_CHARS = 8_000;

export function capDescription(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const t = text.trim();
  if (!t) return undefined;
  return t.length > MAX_DESCRIPTION_CHARS ? `${t.slice(0, MAX_DESCRIPTION_CHARS)}…` : t;
}

/** Stable content hash for change detection (title|location|type|desc prefix). */
export function contentHash(
  job: Partial<Omit<CanonicalJob, 'content_hash'>> & { job_title: string },
): string {
  const basis = [
    job.job_title,
    job.location ?? '',
    job.employment_type ?? '',
    (job.description ?? '').slice(0, 2000),
  ].join('|');
  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

const REMOTE_RE = /\b(remote|thuiswerk|work from home|wfh|volledig thuis)\b/i;
const INTERNSHIP_RE = /\b(internship|intern\b|stage\b|stagiair|werkstudent|traineeship|afstudeer)/i;

const EXPERIENCE_LEVELS: Array<[RegExp, string]> = [
  [INTERNSHIP_RE, 'Internship'],
  [/\b(junior|starter|entry.level|trainee)\b/i, 'Junior'],
  [/\b(medior|mid.level|intermediate)\b/i, 'Medior'],
  [/\b(principal|staff engineer|distinguished)\b/i, 'Principal'],
  [/\b(senior|sr\.)\b/i, 'Senior'],
  [/\b(lead|head of|director|manager|chief|vp\b)/i, 'Management'],
];

/**
 * Fill derived fields + canonicalize + hash. Returns null when the job is unusable
 * (no valid URL or no plausible title).
 */
export function finalizeJob(
  partial: Partial<CanonicalJob> & { job_url: string; job_title: string },
  baseUrl?: string,
): CanonicalJob | null {
  const url = canonicalizeUrl(partial.job_url, baseUrl);
  if (!url) return null;
  const title = partial.job_title.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (title.length < 2) return null;
  // Global guard (all tiers): landing/info-page titles are not vacancies.
  if (isJunkTitle(title)) return null;

  const description = capDescription(partial.description);
  const haystack = `${title}\n${description ?? ''}`;

  let experience = partial.experience_level;
  if (!experience) {
    for (const [re, label] of EXPERIENCE_LEVELS) {
      if (re.test(title)) {
        experience = label;
        break;
      }
    }
  }

  const locationStr = partial.location?.replace(/\s+/g, ' ').trim().slice(0, 150) || undefined;
  const city = normalizeCity(locationStr);
  const draft: Omit<CanonicalJob, 'content_hash'> = {
    job_url: url,
    job_title: title,
    location: locationStr,
    city: city ?? undefined,
    province: provinceOf(locationStr, city) ?? undefined,
    employment_type: partial.employment_type?.trim().slice(0, 80) || undefined,
    department: partial.department?.trim().slice(0, 120) || undefined,
    salary_range: partial.salary_range?.trim().slice(0, 100) || undefined,
    description,
    posted_date: normalizeDate(partial.posted_date),
    is_remote: partial.is_remote ?? REMOTE_RE.test(haystack.slice(0, 4000)),
    is_internship: partial.is_internship ?? INTERNSHIP_RE.test(title),
    experience_level: experience,
    verified: partial.verified ?? false, // callers upgrade to true for structured/apply-verified jobs
  };
  return { ...draft, content_hash: contentHash(draft) };
}

export function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  const yr = d.getUTCFullYear();
  if (yr < 2000 || yr > 2100) return undefined;
  return d.toISOString().slice(0, 10);
}

/** Dedupe by job_url, keeping the entry with the longer description. */
export function dedupeJobs(jobs: CanonicalJob[]): CanonicalJob[] {
  const byUrl = new Map<string, CanonicalJob>();
  for (const job of jobs) {
    const existing = byUrl.get(job.job_url);
    if (!existing || (job.description?.length ?? 0) > (existing.description?.length ?? 0)) {
      byUrl.set(job.job_url, job);
    }
  }
  return [...byUrl.values()];
}
