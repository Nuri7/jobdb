import { fetchTextRaw } from './http.js';
import type { FetchResult, FetchTextOpts } from './types.js';

const HOST_SPACING: Record<'api' | 'html', number> = { api: 250, html: 1000 };

interface HostState {
  chain: Promise<void>;
  lastAt: number;
}

const hosts = new Map<string, HostState>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Serialize requests per host with a minimum spacing between them. */
async function withHostSlot<T>(host: string, spacing: number, fn: () => Promise<T>): Promise<T> {
  const state = hosts.get(host) ?? { chain: Promise.resolve(), lastAt: 0 };
  hosts.set(host, state);

  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const prev = state.chain;
  state.chain = state.chain.then(() => gate).catch(() => gate);

  await prev.catch(() => {});
  const wait = state.lastAt + spacing - Date.now();
  if (wait > 0) await sleep(wait);
  try {
    return await fn();
  } finally {
    state.lastAt = Date.now();
    release();
  }
}

/** Polite fetch: per-host serialization + spacing. */
export async function politeFetchText(url: string, opts: FetchTextOpts = {}): Promise<FetchResult> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  const spacing = HOST_SPACING[opts.kind ?? 'html'];
  return withHostSlot(host, spacing, () => fetchTextRaw(url, opts));
}

// ---------------------------------------------------------------------------
// Minimal robots.txt handling (User-agent: * groups only). HTML crawling only;
// ATS APIs, sitemaps and robots.txt itself are exempt by design.
// ---------------------------------------------------------------------------

const robotsCache = new Map<string, string[] | null>(); // origin -> disallow prefixes (null = no robots)

function parseRobots(text: string): string[] {
  const disallow: string[] = [];
  let inStarGroup = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    const k = key?.trim().toLowerCase();
    if (k === 'user-agent') {
      inStarGroup = value === '*';
    } else if (inStarGroup && k === 'disallow' && value) {
      disallow.push(value);
    }
  }
  return disallow;
}

export function createRobotsChecker(respect: boolean) {
  return async function robotsAllowed(url: string): Promise<boolean> {
    if (!respect) return true;
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return false;
    }
    const origin = u.origin;
    if (!robotsCache.has(origin)) {
      try {
        const res = await politeFetchText(`${origin}/robots.txt`, { kind: 'api', retries: 0, timeoutMs: 6000 });
        robotsCache.set(origin, res.status === 200 ? parseRobots(res.text) : null);
      } catch {
        robotsCache.set(origin, null);
      }
    }
    const rules = robotsCache.get(origin);
    if (!rules || rules.length === 0) return true;
    const target = u.pathname + u.search;
    for (const prefix of rules) {
      // Support trailing '*' loosely; robots '*' wildcards map to prefix checks here.
      const p = prefix.endsWith('*') ? prefix.slice(0, -1) : prefix;
      if (p === '/') return false;
      if (p && target.startsWith(p)) return false;
    }
    return true;
  };
}

/** Test hook. */
export function _clearPolitenessState(): void {
  hosts.clear();
  robotsCache.clear();
}
