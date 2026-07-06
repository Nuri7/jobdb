import { XMLParser } from 'fast-xml-parser';
import { dedupeJobs, finalizeJob, htmlToText } from '../../extract/normalize.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../../types.js';
import { SourceGoneError } from '../../types.js';

/**
 * Homerun renders its job listing client-side (the static HTML has no job links), but every
 * board publishes a clean public Atom feed at feed.homerun.co/<token> with one <entry> per
 * vacancy — title, detail link, department, employment type, and a location label. That feed
 * is the reliable, single-request source; we build jobs straight from it.
 */

export function homerunFeedUrl(token: string): string {
  return `https://feed.homerun.co/${token}`;
}

export interface HomerunEntry {
  title: string;
  url: string;
  location?: string;
  department?: string;
  type?: string;
  description?: string;
  posted_date?: string;
}

const parser = new XMLParser({ ignoreAttributes: false });

/** Atom values carry a `{@_type, #text}` shape when they have attributes — unwrap to the text. */
function text(node: unknown): string | undefined {
  if (node == null) return undefined;
  if (typeof node === 'string') return node;
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    const t = (node as Record<string, unknown>)['#text'];
    return typeof t === 'string' ? t : t == null ? undefined : String(t);
  }
  return undefined;
}

function nestedName(node: unknown): string | undefined {
  if (node && typeof node === 'object' && 'name' in (node as Record<string, unknown>)) {
    return text((node as Record<string, unknown>).name);
  }
  return text(node);
}

function alternateHref(link: unknown): string | undefined {
  const links = Array.isArray(link) ? link : [link];
  for (const l of links) {
    if (l && typeof l === 'object') {
      const rec = l as Record<string, unknown>;
      if (rec['@_rel'] === 'alternate' && typeof rec['@_href'] === 'string') return rec['@_href'];
    }
  }
  // Fall back to the first link with an href.
  for (const l of links) {
    if (l && typeof l === 'object' && typeof (l as Record<string, unknown>)['@_href'] === 'string') {
      return (l as Record<string, unknown>)['@_href'] as string;
    }
  }
  return undefined;
}

/** Parse a Homerun Atom feed into raw entries. Pure (no I/O) so it's unit-testable. */
export function parseHomerunFeed(xml: string): HomerunEntry[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }
  const feed = doc.feed as Record<string, unknown> | undefined;
  if (!feed) return [];
  const rawEntries = feed.entry;
  const entries = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [];

  const out: HomerunEntry[] = [];
  for (const e of entries as Array<Record<string, unknown>>) {
    const title = text(e.title);
    const url = alternateHref(e.link);
    if (!title || !url) continue;
    out.push({
      title,
      url,
      location: nestedName(e.location),
      department: nestedName(e.department),
      type: nestedName(e.type),
      description: text(e.summary) ?? text(e.content) ?? text(e.description),
      posted_date: text(e.updated),
    });
  }
  return out;
}

/** Convert feed entries into canonical jobs. Homerun feed data is structured → verified. */
export function homerunJobsFromEntries(entries: HomerunEntry[]): CanonicalJob[] {
  const jobs: CanonicalJob[] = [];
  for (const e of entries) {
    // A location label that's just the company/venue name (some employers do this) is not a
    // city — but finalizeJob's normalizer already drops non-city labels, so pass it through.
    const job = finalizeJob({
      job_url: e.url,
      job_title: e.title,
      location: e.location,
      department: e.department,
      employment_type: e.type,
      description: e.description ? htmlToText(e.description) : undefined,
      posted_date: e.posted_date,
      verified: true,
    });
    if (job) jobs.push(job);
  }
  return dedupeJobs(jobs);
}

export const homerunSource: JobSource = {
  type: 'ats:homerun',

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    const board = company.source_config?.board_id;
    if (!board) throw new SourceGoneError('homerun: no board_id');
    const res = await ctx.fetchText(homerunFeedUrl(board), { kind: 'api', timeoutMs: 15_000 });
    if (res.status === 404 || res.status === 410) throw new SourceGoneError(`homerun board gone: ${board}`);
    if (res.status !== 200) throw new Error(`homerun HTTP ${res.status}`);
    return homerunJobsFromEntries(parseHomerunFeed(res.text));
  },
};
