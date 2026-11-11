import * as cheerio from 'cheerio';
import { capDescription, finalizeJob, htmlToText, isCategoryTitle } from '../extract/normalize.js';
import type { CanonicalJob } from '../types.js';

interface JsonLdJobPosting {
  '@type'?: string | string[];
  title?: string;
  name?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string | string[];
  url?: string;
  directApply?: boolean;
  hiringOrganization?: { name?: string };
  jobLocation?: JsonLdPlace | JsonLdPlace[];
  jobLocationType?: string;
  baseSalary?: {
    currency?: string;
    value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string };
  };
  experienceRequirements?: unknown;
  occupationalCategory?: string;
}

interface JsonLdPlace {
  address?: {
    addressLocality?: string;
    addressRegion?: string;
    addressCountry?: string | { name?: string };
  };
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function isJobPosting(node: unknown): node is JsonLdJobPosting {
  if (typeof node !== 'object' || node === null) return false;
  const t = (node as JsonLdJobPosting)['@type'];
  return asArray(t).some((x) => typeof x === 'string' && x.toLowerCase() === 'jobposting');
}

/** Recursively collect JobPosting nodes from a parsed JSON-LD document (handles @graph, ItemList). */
function collectPostings(node: unknown, out: JsonLdJobPosting[], depth = 0): void {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (isJobPosting(node)) {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectPostings(item, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const key of ['@graph', 'itemListElement', 'item', 'mainEntity', 'mainEntityOfPage']) {
    if (key in obj) collectPostings(obj[key], out, depth + 1);
  }
}

function locationOf(posting: JsonLdJobPosting): string | undefined {
  const places = asArray(posting.jobLocation);
  const parts: string[] = [];
  for (const place of places.slice(0, 3)) {
    const addr = place?.address;
    if (!addr) continue;
    const country = typeof addr.addressCountry === 'object' ? addr.addressCountry?.name : addr.addressCountry;
    const label = [addr.addressLocality, addr.addressRegion ?? country].filter(Boolean).join(', ');
    if (label) parts.push(label);
  }
  if (parts.length === 0 && posting.jobLocationType === 'TELECOMMUTE') return 'Remote';
  return parts.length > 0 ? [...new Set(parts)].join(' / ') : undefined;
}

function salaryOf(posting: JsonLdJobPosting): string | undefined {
  const s = posting.baseSalary;
  if (!s?.value) return undefined;
  const cur = s.currency ?? '€';
  const unit = s.value.unitText ? `/${s.value.unitText.toLowerCase()}` : '';
  if (s.value.minValue && s.value.maxValue) return `${cur} ${s.value.minValue}–${s.value.maxValue}${unit}`;
  if (s.value.value) return `${cur} ${s.value.value}${unit}`;
  return undefined;
}

/** Parse one or more back-to-back JSON values from a string (some sites concatenate
 * {JobPosting}{Organization}{Place} in one <script> tag, which trips a plain JSON.parse with
 * "Extra data"). Scans top-level balanced {...} objects, respecting strings/escapes. */
function parseJsonLdBlocks(raw: string): unknown[] {
  try { return [JSON.parse(raw)]; } catch { /* fall through */ }
  const out: unknown[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && start >= 0) { try { out.push(JSON.parse(raw.slice(start, i + 1))); } catch { /* skip */ } start = -1; } }
  }
  return out;
}

/** Parse all JobPosting JSON-LD blocks in an HTML document. */
export function jobPostingsFromHtml(html: string, pageUrl: string): CanonicalJob[] {
  const $ = cheerio.load(html);
  const out: CanonicalJob[] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).contents().text();
    if (!raw || !/jobposting/i.test(raw)) return;
    const postings: JsonLdJobPosting[] = [];
    for (const doc of parseJsonLdBlocks(raw)) collectPostings(doc, postings);
    for (const posting of postings) {
      const title = posting.title ?? posting.name;
      if (!title) continue;
      if (isCategoryTitle(title)) continue; // "Vacatures Zorg", overview listings — not one vacancy
      const description = capDescription(htmlToText(posting.description ?? ''));
      // Structured markup alone isn't proof of a real vacancy: CMS/marketing/test pages and WordPress
      // job plugins emit boilerplate JobPosting LD. Only trust it as verified when it carries real
      // substance (a real description, an apply signal, a deadline, a salary, or a location).
      const hasSubstance =
        (description?.length ?? 0) >= 180 ||
        posting.directApply === true ||
        !!posting.validThrough ||
        !!posting.baseSalary ||
        !!locationOf(posting);
      const job = finalizeJob(
        {
          job_url: posting.url || pageUrl,
          job_title: title,
          description,
          location: locationOf(posting),
          country_code: (() => {
            const countries = asArray(posting.jobLocation).map(place => {
              const value = place?.address?.addressCountry;
              return typeof value === 'object' ? value?.name : value;
            }).filter((value): value is string => Boolean(value));
            return countries.find(value => /^(NL|NLD|Netherlands|The Netherlands|Nederland)$/i.test(value)) || countries[0];
          })(),
          employment_type: normalizeEmployment(asArray(posting.employmentType)[0]),
          salary_range: salaryOf(posting),
          posted_date: posting.datePosted,
          closing_date: posting.validThrough,
          is_remote: posting.jobLocationType === 'TELECOMMUTE' ? true : undefined,
          department: posting.occupationalCategory?.slice(0, 120),
          verified: hasSubstance, // gate: structured data must have substance to count as verified
        },
        pageUrl,
      );
      if (job) out.push(job);
    }
  });
  return out;
}

function normalizeEmployment(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const map: Record<string, string> = {
    FULL_TIME: 'Full-time',
    PART_TIME: 'Part-time',
    CONTRACTOR: 'Contract',
    TEMPORARY: 'Temporary',
    INTERN: 'Internship',
    VOLUNTEER: 'Volunteer',
    PER_DIEM: 'Per diem',
    OTHER: undefined as unknown as string,
  };
  return map[value.toUpperCase()] ?? value;
}

/** Does this HTML contain at least one JobPosting JSON-LD block? (cheap probe) */
export function hasJobPostingLd(html: string): boolean {
  return /application\/ld\+json/i.test(html) && /"@type"\s*:\s*"?\[?"?jobposting/i.test(html);
}
