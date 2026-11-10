import * as cheerio from 'cheerio';
import { freelanceEligibility } from '../extract/freelance.js';
import { dedupeJobs, finalizeJob, htmlToText } from '../extract/normalize.js';
import type { CanonicalJob, Ctx, FreelanceDetails, JobSource } from '../types.js';
import { ZeroExtractionError } from '../types.js';

type Row = Record<string, unknown>;
const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const positive = (v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined;
const UA = { 'User-Agent': 'FairJobs/1.0 (+https://fairjobs.app)' };
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export function assignmentDate(value: unknown, utcTimestamp = false): string | undefined {
  const s = text(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    if (!utcTimestamp || !s.includes('T')) return s.slice(0, 10);
    const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z');
    return Number.isNaN(d.getTime()) ? undefined : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(d);
  }
  const m = s.toLowerCase().match(/\b(\d{1,2})\s+([a-z]+)\s+(20\d{2})\b/);
  if (!m || !MONTHS.includes(m[2]!)) return undefined;
  return `${m[3]}-${String(MONTHS.indexOf(m[2]!) + 1).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
}

function utcInstant(value: unknown): string | undefined {
  const s = text(value).replace(' ', 'T');
  if (!s) return undefined;
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z');
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function rate(min: unknown, max: unknown) {
  const lo = positive(min), hi = positive(max);
  return {
    salary_min: lo, salary_max: hi, salary_currency: 'EUR', salary_period: 'hour',
    salary_range: lo && hi && lo !== hi ? `€ ${lo}–${hi}/uur` : hi ? `${lo ? '' : 'Tot '}€ ${hi}/uur` : lo ? `Vanaf € ${lo}/uur` : undefined,
  };
}

function build(row: Partial<CanonicalJob> & { job_url: string; job_title: string }, details: FreelanceDetails, structured?: boolean | null): CanonicalJob | null {
  const eligible = freelanceEligibility(`${row.employment_type || ''}\n${row.job_title}\n${row.description || ''}`, structured);
  return finalizeJob({ ...row, employment_type: eligible === true ? 'Freelance / ZZP' : 'Interim / contract', freelance_eligible: eligible, freelance_details: details, verified: true });
}

export function parseStriive(row: Row): CanonicalJob | null {
  if (!text(row.id) || !text(row.title) || row.permanentJob === true) return null;
  const description = htmlToText(text(row.content) + '\n' + text(row.requirements));
  return build({
    job_url: `https://striive.com/nl/opdrachten?id=${encodeURIComponent(text(row.id))}`,
    job_title: text(row.title), description, location: text(row.location),
    posted_date: assignmentDate(row.publishedDate, true),
    closing_date: assignmentDate(row.closingDateInvoice || row.closingDateClient, true),
    ...rate(row.hourlyRateMin, row.hourlyRateMax || row.hourlyRateClient),
  }, {
    source_name: 'Striive', client_name: text(row.clientName), reference: text(row.referenceCode) || text(row.recordId),
    hours_min: positive(row.hoursPerWeekMin), hours_max: positive(row.hoursPerWeekMax),
    start_date: assignmentDate(row.startDate, true), end_date: assignmentDate(row.endDate, true),
    closing_at: utcInstant(row.closingDateInvoice || row.closingDateClient),
  });
}

export function parseOverheid(row: Row): CanonicalJob | null {
  if (!text(row.tender_name) || !text(row.tender_url) || row.tender_status !== 'open') return null;
  const contract = text(row.contract_type).toLowerCase();
  const structured = /(?:geen|niet)\s+(?:zzp|freelance)/.test(contract) ? false : /zzp|freelance/.test(contract) ? true : /detachering|loondienst/.test(contract) ? false : null;
  const loc = (row.location || row.vacancies_location || {}) as Row;
  const description = htmlToText([row.tender_overview, row.tender_description_html, row.tender_requirements, row.tender_other_information].map(text).join('\n'));
  let url: URL;
  try { url = new URL(text(row.tender_url)); } catch { return null; }
  if (url.hostname.endsWith('flextender.nl')) { url.pathname = '/opdracht'; url.searchParams.delete('resultatenlijst'); }
  return build({
    job_url: url.toString(), job_title: text(row.tender_name), description,
    location: text(loc.city) || text(row.tender_job_location) || text(loc.province) || 'Nederland',
    posted_date: assignmentDate(row.tender_first_seen), closing_date: assignmentDate(row.tender_offline_date || row.tender_date),
    ...rate(row.tender_tariff, row.tender_maximum_tariff),
  }, {
    source_name: 'Opdracht Overheid', client_name: text(row.tender_buying_organization), reference: text(row.tender_id),
    hours_min: positive(row.tender_min_hours), hours_max: positive(row.tender_max_hours),
    start_date: assignmentDate(row.tender_start_date), end_date: assignmentDate(row.tender_end_date),
    duration: positive(row.tender_duration_months) ? `${row.tender_duration_months} maanden` : undefined,
    closing_at: utcInstant(row.tender_offline_date || row.tender_date),
  }, structured);
}

function summaries(html: string): Record<string, string> {
  const $ = cheerio.load(html), out: Record<string, string> = {};
  $('.css-summaryrow').each((_, e) => {
    const key = $(e).find('.css-caption').text().trim().toLowerCase();
    const value = $(e).find('.css-value').clone().find('a').remove().end().text().trim();
    if (key && value) out[key] = value;
  });
  return out;
}

export function parseFlextender(html: string, url: string): CanonicalJob | null {
  const $ = cheerio.load(html), summary = summaries(html);
  const content = $('.flx-job-mce-container').first();
  const title = $('.css-jobtitle').first().text().trim();
  if (!title || content.text().length < 180) return null;
  const description = htmlToText(content.html() || '');
  const numbers = (summary['uren per week']?.match(/\d+/g) || []).map(Number);
  const canonical = new URL(url); canonical.pathname = '/opdracht'; canonical.searchParams.delete('resultatenlijst');
  const rateMatch = description.match(/\b(?:maximaal|maximale|maximum)?\s*(?:uurtarief|maximumtarief)\s*(?:van|:)?\s*€?\s*(\d{2,3})(?:[,.]\d{1,2})?/i);
  return build({
    job_url: canonical.toString(), job_title: title, description,
    location: summary['standplaats'] || summary['locatie'] || summary['regio'] || 'Nederland',
    closing_date: assignmentDate(summary['einde inschrijfdatum']),
    ...(rateMatch ? rate(undefined, rateMatch[1]) : {}),
  }, {
    source_name: 'Flextender', client_name: $('.css-customer').first().text().trim(),
    reference: summary['aanvraagnummer'] || canonical.searchParams.get('aanvraagnr') || undefined,
    hours_min: numbers[0], hours_max: numbers.at(-1), start_date: assignmentDate(summary['start']),
    end_date: assignmentDate(summary['duur']), duration: summary['duur'],
  });
}

async function fetchChecked(ctx: Ctx, url: string, body?: string) {
  if (!await ctx.robotsAllowed(url)) throw new Error(`Source robots policy disallows ${new URL(url).hostname}${new URL(url).pathname}`);
  const r = await ctx.fetchText(url, { kind: body ? 'api' : 'html', headers: { ...UA, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body } : {}), timeoutMs: 45000, ...(new URL(url).hostname === 'striive-cms.codebridge.nl' ? { maxBodyChars: 40_000_000 } : {}) });
  if (r.status !== 200) throw new Error(`Freelance source HTTP ${r.status}: ${url}`);
  return r.text;
}

function liveJobs(ctx: Ctx, jobs: CanonicalJob[], complete: boolean) {
  const now = Date.now(), today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(now);
  const live = dedupeJobs(jobs).filter(j => (!j.closing_date || j.closing_date >= today) && (!j.freelance_details?.closing_at || Date.parse(j.freelance_details.closing_at) > now));
  ctx.liveUrls = new Set(live.map(j => j.job_url)); ctx.liveUrlsComplete = complete;
  return live;
}

export const striiveSource: JobSource = {
  type: 'freelance:striive',
  async fetchJobs(_company, ctx) {
    const jobs: CanonicalJob[] = [], seen = new Set<string>(); let complete = false;
    for (let page = 1; page <= 40; page++) {
      const result = JSON.parse(await fetchChecked(ctx, `https://striive-cms.codebridge.nl/api/jobs?open=true&page=${page}`));
      if (!Array.isArray(result.data) || !Number.isFinite(result.total)) throw new Error('Striive response schema changed');
      let fresh = 0;
      for (const row of result.data) { if (seen.has(row.id)) continue; seen.add(row.id); fresh++; const job = parseStriive(row); if (job) jobs.push(job); }
      if (seen.size >= result.total) { complete = true; break; }
      if (!fresh) throw new Error('Striive pagination repeated; preserving existing jobs');
    }
    if (!jobs.length) throw new ZeroExtractionError('Striive returned no usable assignments', seen.size);
    return liveJobs(ctx, jobs, complete);
  },
};

export const overheidSource: JobSource = {
  type: 'freelance:overheid',
  async fetchJobs(_company, ctx) {
    const jobs: CanonicalJob[] = [], seen = new Set<string>(); let complete = false;
    for (let offset = 0; offset < 1000; offset += 25) {
      const filters = [
        { field_name: 'tender_offline_date', value: [new Date().toISOString().slice(0, 19).replace('T', ' ')], operator: '>=' },
        { field_name: 'publish', value: ['0'], operator: 'neq' },
        { field_name: 'oim_vacancy', value: ['true'], operator: 'neq' },
        { field_name: 'direct_recruitment_vacancy', value: ['true'], operator: 'neq' },
      ];
      const body = JSON.stringify({ single: false, userInput: null, limit: 25, offset, disjunction: 0, user_coordinates: {}, filters: { and_filters: [{ filters }], or_filters: [], or_disjunction: 0 }, order_by: [{ field: 'tender_first_seen', direction: 'desc' }] });
      const result = JSON.parse(await fetchChecked(ctx, 'https://kbenp-match-api.azurewebsites.net/v7/vacancies/search', body));
      if (!Array.isArray(result.negometrix_tenders)) throw new Error('Opdracht Overheid response schema changed');
      const rows: Row[] = result.negometrix_tenders; let fresh = 0;
      for (const row of rows) {
        const id = text(row.tender_id); if (!id || seen.has(id)) continue; seen.add(id); fresh++;
        // The original URL is the deduplication key; avoid importing the same listing through two boards.
        const job = parseOverheid(row); if (job) jobs.push(job);
      }
      if (rows.length < 25) { complete = true; break; }
      if (!fresh) throw new Error('Opdracht Overheid pagination repeated; preserving existing jobs');
    }
    if (!jobs.length) throw new ZeroExtractionError('Opdracht Overheid returned no usable assignments', seen.size);
    return liveJobs(ctx, jobs, complete);
  },
};

export const flextenderSource: JobSource = {
  type: 'freelance:flextender',
  async fetchJobs(company, ctx) {
    const listing = 'https://www.flextender.nl/opdrachten/';
    const $ = cheerio.load(await fetchChecked(ctx, listing));
    const form = $('form').filter((_, e) => $(e).find('input[name=kbs_flx_widget_config]').length > 0).last();
    const params = new URLSearchParams(); form.find('input[type=hidden]').each((_, e) => { const name = $(e).attr('name'); if (name) params.append(name, String($(e).val() || '')); });
    if (params.get('action') !== 'kbs_flx_searchjobs') throw new Error('Flextender public search form changed');
    const endpoint = 'https://www.flextender.nl/wp-admin/admin-ajax.php';
    if (!await ctx.robotsAllowed(endpoint)) throw new Error('Flextender public search is disallowed by robots policy');
    const r = await ctx.fetchText(endpoint, { method: 'POST', body: params.toString(), kind: 'api', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' } });
    if (r.status !== 200) throw new Error(`Flextender public search HTTP ${r.status}`);
    const html = JSON.parse(r.text).resultHtml;
    if (typeof html !== 'string') throw new Error('Flextender public search response changed');
    const results = cheerio.load(html), urls = new Set<string>();
    results('.css-foundjob[data-kbslinkurl]').each((_, e) => {
      const u = new URL(results(e).attr('data-kbslinkurl')!, listing);
      if (u.hostname !== 'www.flextender.nl' || !/^\d+$/.test(u.searchParams.get('aanvraagnr') || '')) return;
      u.pathname = '/opdracht'; u.searchParams.delete('resultatenlijst'); urls.add(u.toString());
    });
    if (!urls.size) throw new ZeroExtractionError('Flextender returned no assignment links', 0);
    ctx.liveUrls = urls; ctx.liveUrlsComplete = true;
    const cap = company.source_config?.max_details || 80;
    const fresh = [...urls].filter(u => !ctx.scrapedUrls?.has(u));
    const known = [...urls].filter(u => ctx.scrapedUrls?.has(u));
    const cursor = (company.source_config?.detail_cursor || 0) % Math.max(1, known.length);
    const ranked = [...fresh, ...known.slice(cursor), ...known.slice(0, cursor)];
    const jobs: CanonicalJob[] = []; let failures = 0;
    for (const url of ranked.slice(0, cap)) {
      try { const job = parseFlextender(await fetchChecked(ctx, url), url); if (job) jobs.push(job); else failures++; }
      catch (error) { failures++; ctx.log(`  Flextender detail failed: ${error instanceof Error ? error.message : error}`); }
    }
    if (failures) ctx.liveUrlsComplete = false;
    if (!jobs.length) throw new ZeroExtractionError('Flextender detail extraction failed', urls.size);
    if (company.source_config) company.source_config.detail_cursor = (cursor + Math.max(0, cap - fresh.length)) % Math.max(1, known.length);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(Date.now());
    return jobs.filter(j => !j.closing_date || j.closing_date >= today);
  },
};
