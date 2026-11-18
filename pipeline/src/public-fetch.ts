import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { USER_AGENT } from './config.js';
import type { FetchResult, FetchTextOpts } from './types.js';

export function publicAddress(address: string): boolean {
  if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:db8:/i.test(address);
  if (isIP(address) !== 4) return false;
  const [a = 0,b = 0] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31 || a === 192 && [0,168].includes(b)
    || a === 100 && b >= 64 && b <= 127 || a === 198 && [18,19,51].includes(b)
    || a === 203 && b === 0);
}

export function publicHttpsUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443'
    || isIP(url.hostname.replace(/[[\]]/g,'')) || !url.hostname.includes('.')
    || /\.(local|internal|localhost|test|invalid)$/i.test(url.hostname)) throw new Error('Only public HTTPS employer websites are supported');
  return url;
}

/** Pin checked DNS addresses to the socket, including every redirect. No DNS rebinding/SSRF. */
export async function publicFetchText(raw: string, opts: FetchTextOpts = {}, redirects = 0): Promise<FetchResult> {
  const url = publicHttpsUrl(raw);
  const records = await lookup(url.hostname, {all: true});
  if (!records.length || records.some(record => !publicAddress(record.address))) throw new Error('Non-public source address rejected');
  const result = await new Promise<{status: number; text: string; headers: Record<string, string | string[] | undefined>}>((resolve, reject) => {
    const req = request(url, {
      method: opts.method ?? 'GET',
      headers: {'User-Agent': USER_AGENT, Accept: 'text/html,application/json,application/xml', 'Accept-Encoding': 'identity', ...opts.headers},
      lookup: (_host, options, callback) => options.all ? callback(null, records) : callback(null, records[0]!.address, records[0]!.family),
    }, res => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > Math.min(opts.maxBodyChars ?? 3000000, 40000000)) req.destroy(new Error('Source body exceeds safety limit'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8'), headers: res.headers}));
    });
    const timer = setTimeout(() => req.destroy(new Error('Source request timed out')), opts.timeoutMs ?? 15000);
    req.on('error', reject);
    req.on('close', () => clearTimeout(timer));
    if (opts.body) req.write(opts.body);
    req.end();
  });
  if ([301,302,303,307,308].includes(result.status) && typeof result.headers.location === 'string') {
    if (redirects >= 4) throw new Error('Source redirect limit reached');
    const next = new URL(result.headers.location, url).toString();
    return publicFetchText(next, result.status === 303 ? {...opts, method: 'GET', body: undefined} : opts, redirects + 1);
  }
  return {status: result.status, finalUrl: url.toString(), text: result.text,
    contentType: String(result.headers['content-type'] ?? ''), etag: typeof result.headers.etag === 'string' ? result.headers.etag : undefined};
}
