import type { Ctx } from '../types.js';

/**
 * Discover the customer roster of a subdomain-per-tenant ATS (e.g. `<token>.recruitee.com`)
 * from the Common Crawl URL index. Unlike Certificate Transparency — which only sees a single
 * `*.recruitee.com` wildcard cert and thus never reveals tenants — Common Crawl has actually
 * fetched the tenant boards, so their hostnames are in its index. The validate step then
 * confirms each token is a live board that hires in the Netherlands.
 */

// Platform-owned subdomains, never a tenant board. Anything else that isn't a real board
// just fails validation, so this list only trims wasted requests.
const INFRA = new Set([
  'www', 'api', 'api2', 'app', 'apps', 'auth', 'mail', 'smtp', 'imap', 'pop', 'mx', 'ns', 'ns1',
  'ns2', 'dns', 'autodiscover', 'autoconfig', 'cpanel', 'webmail', 'cdn', 'cdn1', 'cdn2', 'assets',
  'static', 's', 's3', 'img', 'images', 'media', 'files', 'download', 'downloads', 'status', 'help',
  'support', 'docs', 'doc', 'developer', 'developers', 'blog', 'old-blog', 'news', 'go', 'link',
  'links', 'email', 'em', 'staging', 'stage', 'test', 'testing', 'demo', 'dev', 'sandbox', 'preview',
  'beta', 'admin', 'portal', 'dashboard', 'careers', 'career', 'jobs', 'job', 'vacatures', 'connect',
  'partners', 'ats', 'secure', 'landing', 'feedback', 'interactive', 'metabase', 'proxycareers',
  'default', 'localhost',
]);

const HOST = 'https://index.commoncrawl.org';

/** Extract unique single-label tenant tokens under `baseDomain` from CDX JSONL lines. Pure. */
export function tokensFromCcLines(lines: string[], baseDomain: string): string[] {
  const suffix = `.${baseDomain.toLowerCase()}`;
  const tokens = new Set<string>();
  for (const line of lines) {
    let raw: string;
    try {
      raw = (JSON.parse(line) as { url?: string }).url ?? '';
    } catch {
      continue; // truncated/partial line (e.g. body cap) — skip
    }
    let host: string;
    try {
      host = new URL(raw).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (!host.endsWith(suffix)) continue;
    const label = host.slice(0, -suffix.length);
    if (!label || label.includes('.')) continue; // only direct <token>.base tenants
    if (INFRA.has(label)) continue;
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(label)) continue;
    tokens.add(label);
  }
  return [...tokens];
}

/** Newest `n` monthly Common Crawl index ids (e.g. 'CC-MAIN-2026-25'). */
export async function ccLatestIndexes(ctx: Ctx, n: number): Promise<string[]> {
  const res = await ctx.fetchText(`${HOST}/collinfo.json`, { kind: 'api', retries: 2, timeoutMs: 30_000 });
  if (res.status !== 200) throw new Error(`Common Crawl collinfo HTTP ${res.status}`);
  const arr = JSON.parse(res.text) as Array<{ id?: string }>;
  return arr.map((c) => c.id).filter((x): x is string => Boolean(x)).slice(0, n);
}

async function ccNumPages(indexId: string, baseDomain: string, ctx: Ctx): Promise<number> {
  const url = `${HOST}/${indexId}-index?url=${encodeURIComponent(baseDomain)}&matchType=domain&showNumPages=true&output=json`;
  try {
    const res = await ctx.fetchText(url, { kind: 'api', retries: 2, timeoutMs: 30_000 });
    if (res.status !== 200) return 0; // 404 = no captures in this index
    const j = JSON.parse(res.text) as { pages?: number };
    return Math.max(0, Number(j.pages) || 0);
  } catch {
    return 0;
  }
}

async function ccPageTokens(indexId: string, baseDomain: string, page: number, ctx: Ctx): Promise<string[]> {
  const url = `${HOST}/${indexId}-index?url=${encodeURIComponent(baseDomain)}&matchType=domain&output=json&fl=url&page=${page}`;
  const res = await ctx.fetchText(url, { kind: 'api', retries: 2, timeoutMs: 60_000 });
  if (res.status !== 200) return [];
  return tokensFromCcLines(res.text.trim().split('\n').filter(Boolean), baseDomain);
}

/**
 * Union of tenant tokens for `baseDomain` across the newest `indexes` monthly crawls.
 * Each monthly index captures a somewhat different subset, so unioning a few widens coverage.
 */
export async function ccTokens(
  baseDomain: string,
  ctx: Ctx,
  opts: { indexes?: number; maxPages?: number } = {},
): Promise<string[]> {
  const indexes = await ccLatestIndexes(ctx, opts.indexes ?? 2);
  const maxPages = opts.maxPages ?? 30;
  const all = new Set<string>();
  for (const indexId of indexes) {
    const pages = Math.min(await ccNumPages(indexId, baseDomain, ctx), maxPages);
    for (let p = 0; p < pages; p++) {
      for (const t of await ccPageTokens(indexId, baseDomain, p, ctx)) all.add(t);
    }
    ctx.log(`  cc ${indexId}: ${pages} page(s) → ${all.size} unique tokens so far`);
  }
  return [...all];
}
