import * as cheerio from 'cheerio';
import { dedupeJobs, finalizeJob, htmlToText, JUNK_TITLE_RE } from '../extract/normalize.js';
import { jobPostingsFromHtml } from './jsonld.js';
import type { CanonicalJob, Ctx } from '../types.js';

/** Path fragments that strongly suggest a job detail URL. */
export const JOB_PATH_RE =
  /(vacature|vacatures|job|jobs|vacancy|vacancies|position|positions|opening|careers?|werken-bij|stelle|\/o\/|\/j\/)/i;

/** Paths that are never job details (safe substrings only). */
export const NON_JOB_RE =
  /(privacy|cookie|terms|disclaimer|login|signin|signup|account|nieuws|news|blog|faq|sitemap|search|filter|categor|benefits|share|print|jobalert|job-?alert|open-sollicitatie|unsolicited|talent-?pool|referral|testimonial|\.pdf$|\.docx?$|\.jpe?g$|\.png$|\.svg$|\.zip$|mailto:|tel:)/i;

/** Informational pages that live under career paths — blocked as exact path segments. */
const BLOCKED_SEGMENTS = new Set([
  'esg', 'waarden', 'onze-waarden', 'values', 'cultuur', 'culture', 'verhalen', 'stories',
  'diversiteit-and-inclusie', 'diversiteit-en-inclusie', 'diversity', 'inclusion',
  'wat-je-ervoor-krijgt', 'arbeidsvoorwaarden', 'sollicitatieprocedure', 'de-sollicitatieprocedure',
  'sollicitatie-tips', 'early-careers', 'young-professional', 'studenten', 'events', 'event',
  'contact', 'over-ons', 'about', 'about-us', 'teams', 'team', 'afdelingen', 'departments',
  'locaties', 'locations', 'kantoren', 'offices', 'voorwaarden', 'recruiters', 'recruitment',
]);

export function hasBlockedSegment(pathname: string): boolean {
  return pathname
    .toLowerCase()
    .split('/')
    .some((segment) => BLOCKED_SEGMENTS.has(segment.replace(/\/$/, '')));
}

/** Generic career-section words that are landing pages, never a single vacancy. */
const CAREER_SECTION_WORDS = new Set([
  'werken-bij', 'werkenbij', 'werken', 'werk', 'vacatures', 'vacature', 'careers', 'career',
  'jobs', 'job', 'vacancies', 'vacancy', 'openings', 'bareme', 'home', 'index', 'overzicht',
  'solliciteren', 'sollicitatie', 'kom-werken', 'join-us', 'join', 'work-with-us',
]);

/**
 * True when a URL points at a career *section* root (e.g. /werken-bij, /vacatures,
 * /careers, /werken-bij#vacancies) rather than an individual vacancy. A real job detail
 * URL has a job-specific slug AFTER the section word (e.g. /vacatures/senior-adviseur).
 */
export function isCareerSectionUrl(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  const segs = path.toLowerCase().replace(/\/+$/, '').split('/').filter(Boolean);
  if (segs.length === 0) return true; // bare domain
  const last = segs[segs.length - 1]!;
  return CAREER_SECTION_WORDS.has(last);
}

/** Body must show real vacancy signals before we accept a heuristic (non-JSON-LD) extraction. */
export const JOB_SIGNAL_RE =
  /(solliciteer|solliciteren|apply (now|for|today)|wat ga je doen|wat je gaat doen|wij bieden|wat wij bieden|jouw profiel|functie-?eisen|arbeidsvoorwaarden|responsibilities|requirements|qualifications|what you.ll do|who you are|your profile|we offer|uur per week|per maand|bruto|salaris|salary|vacaturenummer|dienstverband)/i;

const GENERIC_LINK_TEXT_RE =
  /^(lees meer|read more|meer info|more info|bekijk|view|apply|solliciteer|solliciteren|alle vacatures|all jobs|home|menu|vacatures|jobs|careers?|werken bij .*)$/i;

export interface JobLink {
  url: string;
  text: string;
}

/**
 * Extract candidate job-detail links from a listing page.
 * Accepts same-site links (including werkenbij-style sibling domains) whose path
 * looks job-like, or whose anchor text looks like a job title.
 */
export function extractJobLinks(html: string, pageUrl: string): JobLink[] {
  const $ = cheerio.load(html);
  const page = new URL(pageUrl);
  const seen = new Map<string, JobLink>();

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    let u: URL;
    try {
      u = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    const full = u.toString();
    if (NON_JOB_RE.test(u.pathname + u.search) || hasBlockedSegment(u.pathname)) return;
    // /werken-bij, /vacatures, /careers … are section landing pages, not individual jobs
    if (isCareerSectionUrl(full)) return;

    const sameSite = u.host === page.host;
    if (!sameSite) return; // cross-domain job links are the ATS fingerprint's business, not ours

    // Must go *deeper* than the listing page itself
    const listingPath = page.pathname.replace(/\/$/, '');
    const linkPath = u.pathname.replace(/\/$/, '');
    if (linkPath === listingPath || linkPath === '') return;

    const text = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 160);
    const pathLooksJobby = JOB_PATH_RE.test(u.pathname) && /[a-z0-9]([-_][a-z0-9]|\/\d)/i.test(linkPath.split('/').pop() ?? '');
    const textLooksTitle =
      text.length >= 6 &&
      text.length <= 120 &&
      !GENERIC_LINK_TEXT_RE.test(text) &&
      /[a-zA-Z]{3}/.test(text) &&
      linkPath.startsWith(listingPath); // e.g. /vacatures/<slug> under /vacatures

    if (pathLooksJobby || textLooksTitle) {
      if (!seen.has(full) || (textLooksTitle && !seen.get(full)?.text)) {
        seen.set(full, { url: full, text });
      }
    }
  });

  return [...seen.values()];
}

/** Find a rel=next / ?page=N pagination link on a listing page. */
export function findNextPage(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const relNext = $('a[rel="next"], link[rel="next"]').attr('href');
  if (relNext) {
    try {
      return new URL(relNext, pageUrl).toString();
    } catch {
      /* ignore */
    }
  }
  let found: string | null = null;
  $('a[href]').each((_i, el) => {
    if (found) return;
    const text = $(el).text().trim().toLowerCase();
    const aria = ($(el).attr('aria-label') ?? '').toLowerCase();
    if (/^(volgende|next|»|›)$/.test(text) || /next|volgende/.test(aria)) {
      try {
        found = new URL($(el).attr('href')!, pageUrl).toString();
      } catch {
        /* ignore */
      }
    }
  });
  return found;
}

/** Heuristic single-page extraction when a detail page has no JSON-LD. */
export function jobFromDetailHtml(html: string, url: string, linkText?: string): CanonicalJob | null {
  // A career-section landing page (/werken-bij, /vacatures) is never a single vacancy,
  // even though it's full of apply/vacancy words — this is how "Werken bij AEF" slipped in.
  if (isCareerSectionUrl(url)) return null;

  const $ = cheerio.load(html);
  $('script, style, nav, header, footer, noscript, svg, form').remove();

  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() ?? '';
  const siteName = $('meta[property="og:site_name"]').attr('content')?.trim() ?? '';
  const title =
    h1 ||
    ogTitle ||
    $('title').text().split(/[|–-]/)[0]?.trim() ||
    linkText ||
    '';
  if (!title || title.length < 3) return null;
  // Landing/info page titles ("Werken bij X", "Vacatures", "Home", "Onze arbeidsvoorwaarden")
  if (JUNK_TITLE_RE.test(title)) return null;
  // A page whose h1 is just the site slogan/name is not a vacancy
  if (siteName && title.toLowerCase().includes(siteName.toLowerCase()) && title.length < siteName.length + 12) {
    return null;
  }

  const main = $('main, article, [class*="vacature"], [class*="job"], [id*="content"]').first();
  const bodyText = htmlToText((main.length ? main : $('body')).html() ?? '').slice(0, 12_000);
  if (bodyText.length < 120) return null;

  // Require real vacancy signals — marketing/informational pages don't get to become jobs
  const signals = bodyText.match(new RegExp(JOB_SIGNAL_RE.source, 'gi'))?.length ?? 0;
  if (signals < 2) return null;

  return finalizeJob({ job_url: url, job_title: title, description: bodyText }, url);
}

/**
 * Shared "listing page → detail pages → jobs" walk used by tier-2/3 and the
 * JSON-LD-based ATS adapters. Prefers JSON-LD on detail pages, falls back to
 * heuristic extraction. Caps detail fetches.
 */
export async function jobsViaDetailPages(
  links: JobLink[],
  ctx: Ctx,
  opts: { cap?: number; requireJsonLd?: boolean } = {},
): Promise<CanonicalJob[]> {
  const cap = opts.cap ?? 200;
  const jobs: CanonicalJob[] = [];
  const heuristicJobs: CanonicalJob[] = [];
  let ldMisses = 0;

  for (const link of links.slice(0, cap)) {
    if (!(await ctx.robotsAllowed(link.url))) continue;
    let res;
    try {
      res = await ctx.fetchText(link.url, { kind: 'html' });
    } catch {
      continue;
    }
    if (res.status !== 200 || !/text\/html/i.test(res.contentType)) continue;

    const fromLd = jobPostingsFromHtml(res.text, res.finalUrl);
    if (fromLd.length > 0) {
      // Detail pages describe one job; ItemList pages can hold many
      jobs.push(...fromLd);
      continue;
    }
    ldMisses++;
    if (opts.requireJsonLd) continue;
    const heuristic = jobFromDetailHtml(res.text, res.finalUrl, link.text);
    if (heuristic) heuristicJobs.push(heuristic);
  }

  // Mass-duplicate guard: many heuristic "jobs" sharing one title = a site template, not vacancies
  const titleCounts = new Map<string, number>();
  for (const job of heuristicJobs) {
    const key = job.job_title.toLowerCase();
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }
  const kept = heuristicJobs.filter((job) => (titleCounts.get(job.job_title.toLowerCase()) ?? 0) <= 2);
  const dropped = heuristicJobs.length - kept.length;
  if (dropped > 0) ctx.log(`  dropped ${dropped} template-duplicate heuristic pages`);
  jobs.push(...kept);

  if (ldMisses > 0) ctx.log(`  ${ldMisses}/${Math.min(links.length, cap)} detail pages without JSON-LD`);
  return dedupeJobs(jobs);
}
