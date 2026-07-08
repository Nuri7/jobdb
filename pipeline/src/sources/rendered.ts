import { z } from 'zod';
import { dedupeJobs, finalizeJob } from '../extract/normalize.js';
import { jobsFromApiBodies } from '../extract/json-jobs.js';
import { jobPostingsFromHtml } from './jsonld.js';
import { extractJobLinks, jobsViaDetailPages, locationFromDetailHtml } from './shared.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../types.js';
import { SourceGoneError } from '../types.js';

type PlaywrightModule = typeof import('playwright');
let pw: PlaywrightModule | null = null;
let browserPromise: Promise<import('playwright').Browser> | null = null;

async function getBrowser(): Promise<import('playwright').Browser> {
  if (!pw) pw = await import('playwright');
  if (!browserPromise) {
    // On launch failure, clear the cache so it isn't a permanently-rejected promise
    // that poisons every subsequent rendered company in this process.
    browserPromise = pw.chromium.launch({ args: ['--disable-dev-shm-usage'] }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    try {
      // await the close itself — not just the browser handle — so chromium is gone
      // before the process exits (otherwise the run can leak the browser + its /tmp profile)
      await (await browserPromise).close();
    } catch {
      /* already gone */
    }
    browserPromise = null;
  }
}

const LOAD_MORE_RE = /^(load more|show more|meer laden|toon meer|meer vacatures|more jobs|laad meer|alle vacatures tonen)/i;
const COOKIE_ACCEPT_RE =
  /(accepteer alles|alles accepteren|^accepteren$|alle cookies (accepteren|toestaan)|ik ga akkoord|^akkoord$|ga verder|accept all|allow all|accept cookies|allow cookies|^i agree$|^agree$|toestaan)/i;
// Well-known consent-framework accept buttons (OneTrust, Cookiebot, Cookieinformation, …)
const COOKIE_ACCEPT_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  'button[aria-label*="ccept all" i]',
  'button[data-testid*="accept" i]',
  '.cookie-consent__accept, .cc-allow, .js-accept-cookies',
].join(', ');

export interface RenderResult {
  html: string;
  /** JSON bodies of XHR/fetch responses the page loaded — where SPA career sites keep their jobs. */
  apiBodies: Array<{ url: string; body: string }>;
}

/** Render a page, auto-scroll, click load-more, AND capture the JSON APIs it calls. */
export async function renderPage(url: string): Promise<RenderResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    locale: 'nl-NL',
    viewport: { width: 1366, height: 2200 },
  });
  const apiBodies: Array<{ url: string; body: string }> = [];
  const pending: Promise<void>[] = [];
  try {
    const page = await context.newPage();
    // Capture JSON responses (the jobs API lives here on SPA career sites)
    page.on('response', (resp) => {
      try {
        if (resp.status() !== 200) return;
        const ct = resp.headers()['content-type'] ?? '';
        if (!/json/i.test(ct)) return;
        pending.push(
          resp
            .text()
            .then((t) => {
              if (t && t.length < 3_000_000 && (t.includes('[') || t.includes('{'))) {
                apiBodies.push({ url: resp.url(), body: t });
              }
            })
            .catch(() => {}),
        );
      } catch {
        /* ignore */
      }
    });
    // Block heavy assets — we only need the DOM + JSON
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') return route.abort();
      return route.continue();
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    // Accept cookie consent — many EU career sites don't load their jobs until you do.
    let accepted = false;
    try {
      const known = page.locator(COOKIE_ACCEPT_SELECTORS).first();
      if (await known.isVisible({ timeout: 1500 }).catch(() => false)) {
        await known.click({ timeout: 3_000 }).catch(() => {});
        accepted = true;
      }
    } catch {
      /* fall through to text match */
    }
    if (!accepted) {
      try {
        const btns = page.locator('button, a[role="button"], a.button');
        const n = Math.min(await btns.count(), 60);
        for (let b = 0; b < n; b++) {
          const t = ((await btns.nth(b).textContent().catch(() => '')) ?? '').trim();
          if (t && t.length < 40 && COOKIE_ACCEPT_RE.test(t) && (await btns.nth(b).isVisible().catch(() => false))) {
            await btns.nth(b).click({ timeout: 3_000 }).catch(() => {});
            accepted = true;
            break;
          }
        }
      } catch {
        /* no consent wall */
      }
    }
    if (accepted) {
      await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
    }

    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(600);
      const buttons = page.locator('button, a[role="button"], a.button, [class*="load-more"], [class*="loadmore"]');
      const count = Math.min(await buttons.count(), 40);
      let clicked = false;
      for (let b = 0; b < count; b++) {
        const el = buttons.nth(b);
        const text = ((await el.textContent().catch(() => '')) ?? '').trim();
        if (text && LOAD_MORE_RE.test(text) && (await el.isVisible().catch(() => false))) {
          await el.click({ timeout: 3_000 }).catch(() => {});
          await page.waitForTimeout(1_200);
          clicked = true;
          break;
        }
      }
      if (!clicked && i >= 1) break;
    }
    const html = await page.content();
    await Promise.race([Promise.all(pending), page.waitForTimeout(1500)]); // let JSON bodies resolve
    return { html, apiBodies };
  } finally {
    await context.close();
  }
}

const llmJobsSchema = z.array(
  z.object({
    title: z.string().min(2),
    url: z.string().optional(),
    location: z.string().optional(),
    employment_type: z.string().optional(),
    department: z.string().optional(),
  }),
);

/** Last-ditch: ask the LLM to read the rendered listing text and list the jobs on it. */
async function llmJobsFromListing(
  html: string,
  listingUrl: string,
  ctx: Ctx,
): Promise<CanonicalJob[]> {
  if (!ctx.llm) return [];
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
      const t = String(inner).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return t ? `[LINK ${t} -> ${href}]` : '';
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 24_000);

  const result = await ctx.llm.json<unknown>(
    'You extract job vacancies from career-page text. Return a JSON array of objects: ' +
      '{"title": string, "url": string (absolute or relative, from the [LINK ...] markers if available), ' +
      '"location": string?, "employment_type": string?, "department": string?}. ' +
      'For "location", give the job\'s city/place — read a "Standplaats/Locatie/Plaats/Werklocatie" ' +
      'label or the city named in the job title; omit only if truly none is shown. ' +
      'Only actual job vacancies — no navigation, benefits, or category links. Empty array if none.',
    `Career page: ${listingUrl}\n\n${text}`,
    3000,
  );
  const parsed = llmJobsSchema.safeParse(result);
  if (!parsed.success) return [];
  const jobs: CanonicalJob[] = [];
  for (const item of parsed.data.slice(0, 100)) {
    const job = finalizeJob(
      {
        job_url: item.url || `${listingUrl}#${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        job_title: item.title,
        location: item.location,
        employment_type: item.employment_type,
        department: item.department,
      },
      listingUrl,
    );
    // Refuse synthetic fragment URLs and the listing page itself — they'd pollute job_url
    if (job && !job.job_url.includes('#') && job.job_url !== listingUrl) jobs.push(job);
  }

  // Category-flattening guard: on a department/category site (e.g. Koskamp) the only links
  // are category pages, so the LLM maps many job titles onto a few shared URLs. Real jobs
  // have DISTINCT urls — drop any url claimed by more than one job (it's a listing, not a job).
  const perUrl = new Map<string, number>();
  for (const j of jobs) perUrl.set(j.job_url, (perUrl.get(j.job_url) ?? 0) + 1);
  const unique = jobs.filter((j) => perUrl.get(j.job_url) === 1);
  const dropped = jobs.length - unique.length;
  if (dropped > 0) ctx.log(`  dropped ${dropped} LLM jobs sharing category URLs (not real detail pages)`);
  return unique;
}

/**
 * Jobs from the captured JSON API and the LLM listing reader often lack a location (a listing
 * page rarely shows the per-job city). Fetch their detail pages and read the location there —
 * JSON-LD address first, then heuristics. Capped to stay within the per-company budget.
 */
async function enrichLocations(jobs: CanonicalJob[], ctx: Ctx): Promise<CanonicalJob[]> {
  const need = jobs.filter((j) => !j.location && /^https?:\/\//.test(j.job_url) && !j.job_url.includes('#'));
  if (need.length === 0) return jobs;
  const byUrl = new Map(jobs.map((j) => [j.job_url, j]));
  let filled = 0;
  for (const j of need.slice(0, 60)) {
    if (!(await ctx.robotsAllowed(j.job_url))) continue;
    const res = await ctx.fetchText(j.job_url, { kind: 'html', retries: 0, timeoutMs: 10_000 }).catch(() => null);
    if (!res || res.status !== 200) continue;
    const loc = locationFromDetailHtml(res.text, res.finalUrl);
    if (!loc) continue;
    const upgraded = finalizeJob({ ...j, location: loc }, j.job_url);
    if (upgraded) {
      byUrl.set(j.job_url, upgraded);
      filled++;
    }
  }
  if (filled > 0) ctx.log(`  rendered: enriched ${filled} jobs with a location from detail pages`);
  return [...byUrl.values()];
}

export const renderedSource: JobSource = {
  type: 'rendered',

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    if (!company.career_url) throw new SourceGoneError('rendered: no career_url');
    const base = new URL(company.career_url).origin;
    const { html, apiBodies } = await renderPage(company.career_url);

    // 0) The jobs JSON API the SPA itself called — the cleanest source (auto-solves ASR-class sites)
    const apiJobs = jobsFromApiBodies(apiBodies, base).filter((j) => j.job_url !== company.career_url);
    if (apiJobs.length >= 2) {
      ctx.log(`  rendered: ${apiJobs.length} jobs from captured JSON API`);
      return dedupeJobs(await enrichLocations(apiJobs, ctx));
    }

    // 1) JSON-LD that only materializes after rendering
    const inline = jobPostingsFromHtml(html, company.career_url).filter(
      (j) => j.job_url !== company.career_url,
    );
    if (inline.length >= 3) {
      ctx.log(`  rendered: ${inline.length} inline JSON-LD jobs`);
      return dedupeJobs(inline);
    }

    // 2) Links extracted from the rendered DOM → details via plain fetch (usually static)
    const links = extractJobLinks(html, company.career_url);
    ctx.log(`  rendered: ${links.length} links after render`);
    if (links.length > 0) {
      const jobs = await jobsViaDetailPages(links, ctx, { cap: 150 });
      if (jobs.length > 0) return dedupeJobs([...jobs, ...inline]);
    }

    // 3) LLM reads the listing
    const llmJobs = await llmJobsFromListing(html, company.career_url, ctx);
    ctx.log(`  rendered: LLM extracted ${llmJobs.length} jobs`);
    return dedupeJobs([...(await enrichLocations(llmJobs, ctx)), ...inline]);
  },
};
