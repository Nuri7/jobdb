import type { AtsHint, AtsName } from '../types.js';
import { ATS_HINTS } from '../types.js';

export interface AtsFingerprint {
  ats: AtsName;
  boardId: string;
  region?: string;
}

interface AtsPattern {
  ats: AtsName;
  /** Matches against a full URL (candidate URL, href, script src, iframe src). */
  re: RegExp;
  board: (m: RegExpMatchArray) => string;
  region?: (m: RegExpMatchArray) => string | undefined;
}

const ATS_PATTERNS: AtsPattern[] = [
  { ats: 'recruitee', re: /https?:\/\/([a-z0-9-]+)\.recruitee\.com/i, board: (m) => m[1]!.toLowerCase() },
  {
    ats: 'greenhouse',
    re: /https?:\/\/(?:boards|job-boards)\.(?:eu\.)?greenhouse\.io\/(?:embed\/job_board\?(?:[^"'\s]*&)?for=)?([a-z0-9]+)/i,
    board: (m) => m[1]!.toLowerCase(),
  },
  {
    ats: 'lever',
    re: /https?:\/\/jobs\.(eu\.)?lever\.co\/([A-Za-z0-9-]+)/i,
    board: (m) => m[2]!,
    region: (m) => (m[1] ? 'eu' : undefined),
  },
  { ats: 'ashby', re: /https?:\/\/jobs\.ashbyhq\.com\/([A-Za-z0-9%.-]+)/i, board: (m) => decodeURIComponent(m[1]!) },
  {
    ats: 'workable',
    re: /https?:\/\/(?:apply\.workable\.com\/([a-z0-9-]+)|([a-z0-9-]+)\.workable\.com)/i,
    board: (m) => (m[1] ?? m[2])!.toLowerCase(),
  },
  {
    ats: 'smartrecruiters',
    re: /https?:\/\/(?:careers|jobs)\.smartrecruiters\.com\/([A-Za-z0-9]+)/i,
    board: (m) => m[1]!,
  },
  {
    ats: 'personio',
    re: /https?:\/\/([a-z0-9-]+)\.jobs\.personio\.(de|com)/i,
    board: (m) => (m[2] === 'com' ? `${m[1]!.toLowerCase()}.jobs.personio.com` : m[1]!.toLowerCase()),
  },
  { ats: 'teamtailor', re: /https?:\/\/([a-z0-9-]+)\.teamtailor\.com/i, board: (m) => m[1]!.toLowerCase() },
  { ats: 'homerun', re: /https?:\/\/([a-z0-9-]+)\.homerun\.co/i, board: (m) => m[1]!.toLowerCase() },
  { ats: 'join', re: /https?:\/\/(?:www\.)?join\.com\/companies\/([a-z0-9-]+)/i, board: (m) => m[1]!.toLowerCase() },
];

const EXCLUDED_BOARDS = new Set(['www', 'careers', 'jobs', 'app', 'api', 'assets', 'static', 'cdn', 'embed', 'auth', 'help', 'support', 'blog', 'docs']);

/** Known ATS platforms without adapters — recorded as hints for coverage stats. */
const HINT_PATTERNS: Array<[AtsHint, RegExp]> = [
  ['carerix', /carerix/i],
  ['otys', /otys/i],
  ['mysolution', /mysolution/i],
  ['afas', /afasinsite|vacatures\.afas|afas\.online/i],
  ['hroffice', /hroffice/i],
  ['workday', /myworkdayjobs\.com|workday/i],
  ['successfactors', /successfactors|career\d*\.sapsf/i],
  ['jobtoolz', /jobtoolz/i],
  ['emply', /emply\.(?:com|net)/i],
  ['byner', /byner/i],
  ['bullhorn', /bullhorn/i],
];

/**
 * Detect an ATS from a URL and/or page HTML. A URL match is definitive; an
 * HTML-based match needs corroboration (≥2 references, or the board id
 * resembling the company) — recruitment agencies link to CLIENT boards, and one
 * stray link must not claim the company.
 */
export function fingerprintAts(url: string, html?: string, companyTokens: string[] = []): AtsFingerprint | null {
  for (const pattern of ATS_PATTERNS) {
    const m = url.match(pattern.re);
    if (m) {
      const boardId = pattern.board(m);
      if (!EXCLUDED_BOARDS.has(boardId.toLowerCase())) {
        return { ats: pattern.ats, boardId, region: pattern.region?.(m) };
      }
    }
  }
  if (!html) return null;
  // Scan hrefs/srcs/inline references — count occurrences per board, take the most referenced
  const counts = new Map<string, { fp: AtsFingerprint; n: number }>();
  for (const pattern of ATS_PATTERNS) {
    const re = new RegExp(pattern.re.source, 'gi');
    for (const m of html.matchAll(re)) {
      const boardId = pattern.board(m as unknown as RegExpMatchArray);
      if (EXCLUDED_BOARDS.has(boardId.toLowerCase())) continue;
      const key = `${pattern.ats}:${boardId}`;
      const entry = counts.get(key) ?? {
        fp: { ats: pattern.ats, boardId, region: pattern.region?.(m as unknown as RegExpMatchArray) },
        n: 0,
      };
      entry.n++;
      counts.set(key, entry);
    }
  }
  let best: { fp: AtsFingerprint; n: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.n > best.n) best = entry;
  }
  if (!best) return null;
  const board = best.fp.boardId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const resembles = companyTokens.some((t) => {
    const token = t.toLowerCase().replace(/[^a-z0-9]/g, '');
    return token.length >= 4 && (board.includes(token) || token.includes(board));
  });
  return best.n >= 2 || resembles ? best.fp : null;
}

export function fingerprintHint(url: string, html?: string): AtsHint | null {
  const haystack = `${url}\n${html?.slice(0, 400_000) ?? ''}`;
  for (const [hint, re] of HINT_PATTERNS) {
    if (re.test(haystack)) return hint;
  }
  return null;
}

export { ATS_HINTS };
