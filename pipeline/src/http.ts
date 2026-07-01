import { USER_AGENT } from './config.js';
import type { FetchResult, FetchTextOpts } from './types.js';

const DEFAULT_TIMEOUT = 10_000;
const RETRY_DELAYS = [1_000, 3_000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * fetch with timeout + bounded retries.
 * Retries network errors, timeouts, 5xx and 429 (honoring Retry-After).
 * 4xx (except 429) are hard results — returned, never retried.
 */
export async function fetchRaw(url: string, opts: FetchTextOpts = {}): Promise<Response> {
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'nl,en;q=0.8',
          ...(opts.ifNoneMatch ? { 'If-None-Match': opts.ifNoneMatch } : {}),
          ...opts.headers,
        },
      });
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 15_000)
          : RETRY_DELAYS[attempt] ?? 3_000;
        await res.body?.cancel();
        await sleep(delay);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await sleep(RETRY_DELAYS[attempt] ?? 3_000);
        continue;
      }
    }
  }
  throw lastError ?? new Error(`fetch failed: ${url}`);
}

const MAX_BODY_CHARS = 3_000_000;

export async function fetchTextRaw(url: string, opts: FetchTextOpts = {}): Promise<FetchResult> {
  const res = await fetchRaw(url, opts);
  if (res.status === 304) {
    await res.body?.cancel();
    return {
      status: 304,
      finalUrl: res.url || url,
      text: '',
      contentType: res.headers.get('content-type') ?? '',
      notModified: true,
    };
  }
  let text = '';
  if (opts.method !== 'HEAD') {
    try {
      text = await res.text();
      if (text.length > MAX_BODY_CHARS) text = text.slice(0, MAX_BODY_CHARS);
    } catch {
      text = '';
    }
  } else {
    await res.body?.cancel();
  }
  return {
    status: res.status,
    finalUrl: res.url || url,
    text,
    contentType: res.headers.get('content-type') ?? '',
    etag: res.headers.get('etag') ?? undefined,
  };
}
