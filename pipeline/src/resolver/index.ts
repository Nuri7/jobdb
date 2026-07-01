import { findBoardOwner, type Db } from '../db.js';
import { hasJobPostingLd, jobPostingsFromHtml } from '../sources/jsonld.js';
import { extractJobLinks } from '../sources/shared.js';
import { discoverSitemaps, fetchSitemapEntries, filterJobEntries } from '../sources/sitemap.js';
import type { CompanyRow, Ctx, ResolveResult, SourceConfig, SourceType } from '../types.js';
import { careerLinksFromHomepage, patternCandidates, registrableDomain } from './candidates.js';
import { fingerprintAts, fingerprintHint, type AtsFingerprint } from './fingerprint.js';

const NOT_FOUND_RE = /(pagina niet gevonden|page not found|404 ?- |niet gevonden\b|kan de pagina niet|bestaat niet( meer)?)/i;
const JOB_WORDS_RE = /(vacature|solliciteer|solliciteren|apply now|open positions?|openstaande|job openings?|werken bij)/i;

interface Candidate {
  url: string;
  finalUrl: string;
  html: string;
  score: number;
  jobLinks: number;
  hasLd: boolean;
}

const BAD_HOST_RE =
  /(linkedin|indeed|glassdoor|facebook|instagram|twitter|youtube|nationalevacaturebank|monsterboard|werkzoeken\.nl|jobbird|intermediair)/i;

function scoreCandidate(c: Omit<Candidate, 'score'>, companyDomain: string): number {
  let score = 0;
  const u = new URL(c.finalUrl);
  const path = u.pathname.toLowerCase();

  if (BAD_HOST_RE.test(u.hostname)) score -= 100;
  if (/(career-advice|interview-tips|how-to|blog|nieuws|news)\b/.test(path)) score -= 50;
  if (/\/(type|level|regio|region|team|fulltime|parttime|junior|senior|stage)\//.test(path)) score -= 25;

  if (/(vacatures?|jobs?|careers?|werken-?bij)\/?$/.test(path) || path === '/') score += 15;
  if (CAREER_HOST(u.hostname)) score += 40;
  if (registrableDomain(u.hostname) === companyDomain) score += 30;
  score += Math.min(c.jobLinks * 4, 40);
  if (c.hasLd) score += 30;
  if (JOB_WORDS_RE.test(c.html.slice(0, 200_000))) score += 10;
  return score;
}

function CAREER_HOST(hostname: string): boolean {
  return /(werkenbij|werkbij|careers?|jobs|vacatures|talent|carriere)/i.test(hostname.split('.')[0] ?? '');
}

async function fetchCandidate(url: string, ctx: Ctx, companyDomain: string): Promise<Candidate | null> {
  let res;
  try {
    res = await ctx.fetchText(url, { kind: 'html', timeoutMs: 12_000, retries: 1 });
  } catch {
    return null;
  }
  if (res.status !== 200 || !/text\/html|^$/i.test(res.contentType.split(';')[0] ?? '')) return null;
  if (res.text.length < 400) return null;
  const titleArea = res.text.slice(0, 4000);
  if (NOT_FOUND_RE.test(titleArea)) return null;

  const jobLinks = extractJobLinks(res.text, res.finalUrl).length;
  const hasLd = hasJobPostingLd(res.text);
  const base = { url, finalUrl: res.finalUrl, html: res.text, jobLinks, hasLd };
  return { ...base, score: scoreCandidate(base, companyDomain) };
}

/**
 * Resolve a company's career page and job source.
 * Read-only against the network; persistence is the caller's job.
 * Pass db=null to skip the duplicate-board check (DB-less probing).
 */
export async function resolveCompany(company: CompanyRow, ctx: Ctx, db: Db | null): Promise<ResolveResult> {
  const evidence: string[] = [];
  const rootUrl = company.website || company.career_url;
  if (!rootUrl) {
    return { career_url: null, career_page_status: 'dead', source_type: null, source_config: null, evidence: ['no urls at all'] };
  }
  let companyDomain = '';
  try {
    companyDomain = registrableDomain(new URL(rootUrl).hostname);
  } catch {
    /* scored without domain affinity */
  }

  // ---- Gather candidate URLs (ordered, capped) ----
  const candidateUrls: string[] = [];
  const push = (u: string | null | undefined) => {
    if (!u) return;
    try {
      const norm = new URL(u).toString();
      if (!candidateUrls.includes(norm)) candidateUrls.push(norm);
    } catch {
      /* skip invalid */
    }
  };

  push(company.career_url);

  // Homepage: both a fingerprint source and a link source
  let homepageHtml = '';
  let origin = '';
  try {
    origin = new URL(rootUrl).origin;
  } catch {
    /* handled above */
  }
  if (origin) {
    try {
      const home = await ctx.fetchText(origin, { kind: 'html', timeoutMs: 12_000, retries: 1 });
      if (home.status === 200) {
        homepageHtml = home.text;
        for (const link of careerLinksFromHomepage(home.text, home.finalUrl)) push(link);
        evidence.push(`homepage ok, ${candidateUrls.length - 1} career links`);
      } else {
        evidence.push(`homepage HTTP ${home.status}`);
      }
    } catch (err) {
      evidence.push(`homepage unreachable (${err instanceof Error ? err.message.slice(0, 60) : 'error'})`);
    }
    for (const pattern of patternCandidates(origin, company.company_name)) push(pattern);
  }

  // ---- Fingerprint the homepage before crawling candidates (ATS beats scoring) ----
  const homeFp = homepageHtml ? fingerprintAts(origin, homepageHtml) : null;

  // ---- Probe candidates ----
  const candidates: Candidate[] = [];
  let atsFp: AtsFingerprint | null = homeFp;
  let atsFromUrl: string | null = homeFp ? origin : null;

  for (const url of candidateUrls.slice(0, 12)) {
    const c = await fetchCandidate(url, ctx, companyDomain);
    if (!c) continue;
    // The stored career_url earned trust by being alive — prefer it over wandering
    if (company.career_url && url === new URL(company.career_url).toString()) c.score += 25;
    candidates.push(c);
    const fp = fingerprintAts(c.finalUrl, c.html);
    if (fp && !atsFp) {
      atsFp = fp;
      atsFromUrl = c.finalUrl;
    }
    // Early exit: strong candidate with ATS or lots of job links
    if (atsFp && candidates.length >= 2) break;
    if (c.score >= 80 && candidates.length >= 3) break;
  }

  if (candidates.length === 0 && !atsFp) {
    return {
      career_url: company.career_url,
      career_page_status: 'dead',
      source_type: null,
      source_config: null,
      evidence: [...evidence, `all ${Math.min(candidateUrls.length, 12)} candidates dead`],
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] ?? null;
  const resolvedUrl = best?.finalUrl ?? atsFromUrl ?? company.career_url!;

  // ---- ATS route ----
  if (atsFp) {
    const sourceType = `ats:${atsFp.ats}` as SourceType;
    evidence.push(`ats fingerprint: ${atsFp.ats}/${atsFp.boardId} via ${atsFromUrl}`);
    const owner = db ? await findBoardOwner(db, sourceType, atsFp.boardId, company.id) : null;
    if (owner) {
      evidence.push(`board already owned by company ${owner} -> ambiguous`);
      const cfg: SourceConfig = { resolved_url: resolvedUrl, board_id: atsFp.boardId, duplicate_of: owner };
      return { career_url: resolvedUrl, career_page_status: 'ambiguous', source_type: sourceType, source_config: cfg, evidence };
    }
    const cfg: SourceConfig = {
      resolved_url: resolvedUrl,
      board_id: atsFp.boardId,
      ...(atsFp.region ? { board_region: atsFp.region } : {}),
    };
    return { career_url: resolvedUrl, career_page_status: 'verified', source_type: sourceType, source_config: cfg, evidence };
  }

  // ---- Non-ATS: hint (for stats), then sitemap -> static -> rendered ----
  const hint = fingerprintHint(resolvedUrl, (best?.html ?? '') + homepageHtml.slice(0, 200_000));
  if (hint) evidence.push(`ats hint: ${hint} (no adapter)`);

  if (best) {
    try {
      const bestOrigin = new URL(best.finalUrl).origin;
      for (const sitemapUrl of await discoverSitemaps(bestOrigin, ctx)) {
        const entries = await fetchSitemapEntries(sitemapUrl, ctx);
        if (entries.length === 0) continue;
        const jobEntries = filterJobEntries(entries, best.finalUrl);
        if (jobEntries.length >= 3) {
          evidence.push(`sitemap ${sitemapUrl}: ${jobEntries.length} job urls`);
          const cfg: SourceConfig = { resolved_url: best.finalUrl, sitemap_url: sitemapUrl, ...(hint ? { ats_hint: hint } : {}) };
          return { career_url: best.finalUrl, career_page_status: 'verified', source_type: 'sitemap', source_config: cfg, evidence };
        }
      }
    } catch {
      /* sitemap probing is best-effort */
    }

    const inlineLd = jobPostingsFromHtml(best.html, best.finalUrl).length;
    if (best.jobLinks >= 1 || inlineLd >= 1) {
      evidence.push(`static: ${best.jobLinks} job links, ${inlineLd} inline LD (score ${best.score})`);
      const cfg: SourceConfig = { resolved_url: best.finalUrl, ...(hint ? { ats_hint: hint } : {}) };
      return { career_url: best.finalUrl, career_page_status: 'verified', source_type: 'static', source_config: cfg, evidence };
    }

    evidence.push(`no static signals (score ${best.score}) -> rendered tier`);
    const cfg: SourceConfig = { resolved_url: best.finalUrl, ...(hint ? { ats_hint: hint } : {}) };
    return { career_url: best.finalUrl, career_page_status: 'verified', source_type: 'rendered', source_config: cfg, evidence };
  }

  return {
    career_url: company.career_url,
    career_page_status: 'dead',
    source_type: null,
    source_config: null,
    evidence: [...evidence, 'no live candidates'],
  };
}
