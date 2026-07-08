import { XMLParser } from 'fast-xml-parser';
import { normalizeCity, provinceOf } from '../extract/nl-geo.js';
import { homerunFeedUrl, parseHomerunFeed } from '../sources/ats/homerun.js';
import { jobPostingsFromHtml } from '../sources/jsonld.js';
import type { Ctx, SourceType } from '../types.js';

/** A validated, live, NL-hiring ATS board ready to be inserted as a company. */
export interface HarvestCandidate {
  sourceType: SourceType;
  boardId: string;
  careerUrl: string;
  website: string;
  companyName: string;
  totalJobs: number;
  nlJobs: number;
}

const NL_MARKER_RE = /\b(nederland|netherlands|the netherlands|holland)\b/i;

/**
 * True when a job location is in the Netherlands. Uses the same city→province table the
 * rest of the pipeline uses (authoritative), plus explicit country markers for postings
 * that only name the country. `countryHint` is the ATS's own country field when available.
 */
export function isNlLocation(location?: string, countryHint?: string): boolean {
  if (countryHint) {
    const c = countryHint.trim().toLowerCase();
    if (c === 'nl' || c === 'nld' || NL_MARKER_RE.test(c)) return true;
  }
  if (!location) return false;
  const city = normalizeCity(location);
  if (provinceOf(location, city)) return true; // known NL city or explicit NL province
  if (NL_MARKER_RE.test(location)) return true;
  const t = location.trim().toLowerCase();
  return t === 'nl' || t === 'nld';
}

/** "acme-bv" / "acme_group" → "Acme Bv" — a readable fallback when the board omits a name. */
export function titleize(token: string): string {
  return token
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Feed/board titles often wrap the real name in careers boilerplate
// ("Vacatures - Werken bij Douglas NL", "Careers at Bitonic"). Strip it for a clean display name.
const NAME_PREFIXES = [
  /^vacatures?\s*[|:•–—-]\s*/i,
  /^careers?\s*[|:•–—-]\s*/i,
  /^jobs?\s*[|:•–—-]\s*/i,
  /^(kom\s+)?werken\s+bij\s+/i,
  /^werken\s+voor\s+/i,
  /^vacatures?\s+bij\s+/i,
  /^careers?\s+at\s+/i,
  /^jobs?\s+at\s+/i,
];

export function cleanCompanyName(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    let changed = false;
    for (const re of NAME_PREFIXES) {
      const next = s.replace(re, '');
      if (next !== s) {
        s = next.trim();
        changed = true;
      }
    }
    if (!changed) break;
  }
  s = s.replace(/\s*[|:•–—-]\s*(vacatures?|careers?|jobs?)$/i, '').trim();
  return s.length >= 2 ? s : raw.trim();
}

// ---------------------------------------------------------------------------
// Recruitee — public JSON offers API, one cheap request per board.
// ---------------------------------------------------------------------------

interface RecruiteeOffer {
  title?: string;
  status?: string;
  city?: string;
  country?: string;
  country_code?: string;
  location?: string;
  company_name?: string;
}

export async function validateRecruitee(token: string, ctx: Ctx): Promise<HarvestCandidate | null> {
  const careerUrl = `https://${token}.recruitee.com/`;
  let res;
  try {
    res = await ctx.fetchText(`https://${token}.recruitee.com/api/offers/`, {
      kind: 'api',
      retries: 1,
      timeoutMs: 12_000,
    });
  } catch {
    return null;
  }
  if (res.status !== 200) return null;

  let data: { offers?: RecruiteeOffer[]; company?: { name?: string } };
  try {
    data = JSON.parse(res.text) as typeof data;
  } catch {
    return null;
  }
  const offers = (data.offers ?? []).filter(
    (o) => o.title && (!o.status || o.status === 'published'),
  );
  if (offers.length === 0) return null;

  let nlJobs = 0;
  let companyName = data.company?.name ?? null;
  for (const o of offers) {
    const loc = o.location || [o.city, o.country].filter(Boolean).join(', ') || undefined;
    if (isNlLocation(loc, o.country_code || o.country)) nlJobs++;
    if (!companyName && o.company_name) companyName = o.company_name;
  }

  return {
    sourceType: 'ats:recruitee',
    boardId: token,
    careerUrl,
    website: `https://${token}.recruitee.com`,
    companyName: companyName ? cleanCompanyName(companyName) : titleize(token),
    totalJobs: offers.length,
    nlJobs,
  };
}

// ---------------------------------------------------------------------------
// Homerun — public Atom feed at feed.homerun.co/<token> lists every vacancy with a
// location label. Labels are usually cities but sometimes venue names, and small NL
// towns aren't in our city table — so when no label reads as NL, sample a couple of
// detail pages, whose JSON-LD carries the authoritative "City, Province, NL" address.
// ---------------------------------------------------------------------------

function feedTitle(xml: string): string | null {
  const before = xml.split('<entry')[0] ?? xml;
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(before);
  if (!m?.[1]) return null;
  const clean = m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length >= 2 && clean.length <= 80 ? clean : null;
}

export async function validateHomerun(token: string, ctx: Ctx): Promise<HarvestCandidate | null> {
  let res;
  try {
    res = await ctx.fetchText(homerunFeedUrl(token), { kind: 'api', retries: 1, timeoutMs: 15_000 });
  } catch {
    return null;
  }
  if (res.status !== 200) return null;

  const entries = parseHomerunFeed(res.text);
  if (entries.length === 0) return null; // no live vacancies

  let nlJobs = entries.filter((e) => isNlLocation(e.location)).length;
  // No label read as NL — could be small NL towns / venue-name labels. Confirm via the
  // authoritative detail-page JSON-LD (which includes the province + country).
  if (nlJobs === 0) {
    for (const e of entries.slice(0, 3)) {
      const detail = await ctx.fetchText(e.url, { kind: 'html', retries: 0, timeoutMs: 12_000 }).catch(() => null);
      if (!detail || detail.status !== 200) continue;
      const isNl = jobPostingsFromHtml(detail.text, detail.finalUrl).some((p) => isNlLocation(p.location));
      if (isNl) {
        nlJobs = entries.length; // board hires in NL; labels just weren't recognizable
        break;
      }
    }
  }

  return {
    sourceType: 'ats:homerun',
    boardId: token,
    careerUrl: `https://${token}.homerun.co/`,
    website: `https://${token}.homerun.co`,
    companyName: cleanCompanyName(feedTitle(res.text) || titleize(token)),
    totalJobs: entries.length,
    nlJobs,
  };
}

// ---------------------------------------------------------------------------
// Personio — public XML feed at <token>.jobs.personio.com/xml, one request per board.
// <office> holds the location. board_id is the FULL host so the adapter targets .com
// (the adapter defaults a bare token to .jobs.personio.de, where .com tenants 404).
// ---------------------------------------------------------------------------

interface PersonioPosition {
  name?: string;
  office?: string;
}

const personioParser = new XMLParser({ ignoreAttributes: true });

export async function validatePersonio(token: string, ctx: Ctx): Promise<HarvestCandidate | null> {
  const host = `${token}.jobs.personio.com`;
  let res;
  try {
    res = await ctx.fetchText(`https://${host}/xml`, { kind: 'api', retries: 1, timeoutMs: 15_000 });
  } catch {
    return null;
  }
  if (res.status !== 200 || !res.text.includes('<position')) return null;

  let doc: { 'workzag-jobs'?: { position?: PersonioPosition | PersonioPosition[] } };
  try {
    doc = personioParser.parse(res.text) as typeof doc;
  } catch {
    return null;
  }
  const raw = doc['workzag-jobs']?.position;
  const positions = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((p) => p?.name);
  if (positions.length === 0) return null;

  let nlJobs = 0;
  for (const p of positions) if (isNlLocation(p.office ? String(p.office) : undefined)) nlJobs++;

  return {
    sourceType: 'ats:personio',
    boardId: host,
    careerUrl: `https://${host}/`,
    website: `https://${host}`,
    companyName: titleize(token),
    totalJobs: positions.length,
    nlJobs,
  };
}
