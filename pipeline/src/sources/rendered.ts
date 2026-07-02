import { z } from 'zod';
import { dedupeJobs, finalizeJob } from '../extract/normalize.js';
import { jobPostingsFromHtml } from './jsonld.js';
import { extractJobLinks, jobsViaDetailPages } from './shared.js';
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

/** Render a page, auto-scroll, click load-more a few times, return final HTML. */
export async function renderPage(url: string): Promise<string> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    locale: 'nl-NL',
    viewport: { width: 1366, height: 2200 },
  });
  try {
    const page = await context.newPage();
    // Block heavy assets — we only need the DOM
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') return route.abort();
      return route.continue();
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

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
    return await page.content();
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
    // Refuse synthetic fragment URLs — they'd pollute the job_url conflict key
    if (job && !job.job_url.includes('#')) jobs.push(job);
  }
  return jobs;
}

export const renderedSource: JobSource = {
  type: 'rendered',

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    if (!company.career_url) throw new SourceGoneError('rendered: no career_url');
    const html = await renderPage(company.career_url);

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
    return dedupeJobs([...llmJobs, ...inline]);
  },
};
