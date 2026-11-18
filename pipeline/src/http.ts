import { USER_AGENT } from './config.js';
import type { FetchResult, FetchTextOpts } from './types.js';

const DEFAULT_TIMEOUT = 10_000;
const RETRY_DELAYS = [1_000, 3_000];

export function retryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

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
        ...(opts.body !== undefined ? { body: opts.body } : {}),
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
        const requestedDelay = retryAfterMs(res.headers.get('retry-after'));
        // Never shorten a provider's requested pause. Long waits belong to the next crawl.
        if (requestedDelay !== null && requestedDelay > 15_000) return res;
        const delay = requestedDelay ?? RETRY_DELAYS[attempt] ?? 3_000;
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
    } catch {
      text = '';
    }
    const max = Math.min(opts.maxBodyChars ?? MAX_BODY_CHARS, 40_000_000);
    if (text.length > max) {
      if (opts.maxBodyChars) throw new Error(`Structured feed exceeds ${max} characters`);
      text = text.slice(0, max);
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
    retryAfterMs: retryAfterMs(res.headers.get('retry-after')) ?? undefined,
  };
}
