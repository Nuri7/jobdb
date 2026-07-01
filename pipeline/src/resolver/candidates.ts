import * as cheerio from 'cheerio';

const CAREER_TEXT_RE =
  /(vacatures?|werken.?bij|werk\b|careers?|jobs?\b|join (us|ons)|solliciteer|kom werken|word collega|carri[eè]re)/i;
const CAREER_HOST_RE = /(werkenbij|werkbij|carriere|career|jobs|vacatures|talent)/i;

/** Career-page candidate links found on a homepage (same-site paths AND werkenbij-style domains). */
export function careerLinksFromHomepage(html: string, homepageUrl: string): string[] {
  const $ = cheerio.load(html);
  let home: URL;
  try {
    home = new URL(homepageUrl);
  } catch {
    return [];
  }
  const baseDomain = registrableDomain(home.hostname);
  const scored = new Map<string, number>();

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    let u: URL;
    try {
      u = new URL(href, homepageUrl);
    } catch {
      return;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const sameSite = registrableDomain(u.hostname) === baseDomain;
    const careerHost = CAREER_HOST_RE.test(u.hostname) && u.hostname !== home.hostname;
    const careerPath = CAREER_TEXT_RE.test(decodeURIComponent(u.pathname));
    const careerText = text.length <= 60 && CAREER_TEXT_RE.test(text);

    if ((sameSite && (careerPath || careerText)) || (careerHost && (careerText || careerPath || u.pathname === '/'))) {
      u.hash = '';
      const key = u.toString();
      const score = (careerText ? 2 : 0) + (careerPath ? 2 : 0) + (careerHost ? 3 : 0) + (sameSite ? 1 : 0);
      scored.set(key, Math.max(scored.get(key) ?? 0, score));
    }
  });

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([url]) => url);
}

/** "acme-groep B.V." -> ["acmegroep", "acme"] */
export function companyNameTokens(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/\b(b\.?v\.?|n\.?v\.?|holding|groep|group|international|nederland|netherlands|inc|ltd|gmbh)\b/g, ' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim();
  const compact = cleaned.replace(/[\s-]+/g, '');
  const first = cleaned.split(/[\s-]+/)[0] ?? '';
  const tokens = new Set<string>();
  if (compact.length >= 3 && compact.length <= 30) tokens.add(compact);
  if (first.length >= 4 && first !== compact) tokens.add(first);
  return [...tokens];
}

/** Pattern-based candidate URLs for a company. Ordered by likelihood. */
export function patternCandidates(rootUrl: string, companyName: string): string[] {
  let root: URL;
  try {
    root = new URL(rootUrl);
  } catch {
    return [];
  }
  const origin = root.origin;
  const host = root.hostname.replace(/^www\./, '');
  const out: string[] = [
    `${origin}/vacatures`,
    `${origin}/werken-bij`,
    `${origin}/careers`,
    `${origin}/jobs`,
    `${origin}/nl/vacatures`,
    `https://werkenbij.${host}`,
    `https://careers.${host}`,
    `https://jobs.${host}`,
  ];
  for (const token of companyNameTokens(companyName)) {
    out.push(`https://werkenbij${token}.nl`);
  }
  return out;
}

export function registrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split('.');
  if (parts.length <= 2) return hostname.toLowerCase();
  // Good enough for NL/EU hosts (handles co.uk-style second-level TLDs minimally)
  const secondLevel = new Set(['co', 'com', 'org', 'net', 'gov', 'ac']);
  const n = parts.length;
  if (secondLevel.has(parts[n - 2]!) && parts[n - 1]!.length === 2) {
    return parts.slice(n - 3).join('.');
  }
  return parts.slice(n - 2).join('.');
}
