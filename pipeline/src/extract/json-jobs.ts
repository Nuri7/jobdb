import { finalizeJob, htmlToText } from './normalize.js';
import type { CanonicalJob } from '../types.js';

// Field-name heuristics for mapping an arbitrary JSON job object → CanonicalJob.
const FIELD_RE = {
  title: /^(jobtitle|job_title|title|name|vacancytitle|vacancy_title|functietitel|functie|positiontitle|position|rol|role)$/i,
  url: /^(url|joburl|job_url|link|permalink|href|applyurl|apply_url|detailurl|detail_url|vacancyurl|weburl|posturl|jobposturl|canonicalurl|slug)$/i,
  location: /^(location|locations|city|plaats|standplaats|region|regio|place|worklocation|locatie|vestiging|office)$/i,
  salary: /(salary|salaris|compensation|wage)/i,
  description: /^(description|intro|introduction|jobintroduction|body|content|omschrijving|samenvatting|summary|excerpt|jobdescription)$/i,
  employment: /(employmenttype|employment_type|contracttype|dienstverband|workinghours|working_hours|hours|uren|jobtype|type)$/i,
  department: /^(department|discipline|disciplines|jobdisciplines|vakgebied|category|categorie|team|afdeling|businessline|sector)$/i,
  date: /(dateposted|date_posted|publisheddate|publicationdate|created|createdat|posteddate|startdate)/i,
};

/** Pull a display string out of a scalar, {Label|name|value|title}, or array-of-those. */
function toStr(v: unknown, depth = 0): string | undefined {
  if (v == null || depth > 3) return undefined;
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    const parts = v.map((x) => toStr(x, depth + 1)).filter(Boolean);
    return parts.length ? [...new Set(parts)].slice(0, 3).join(', ') : undefined;
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['Label', 'label', 'name', 'Name', 'value', 'Value', 'title', 'Title', 'text']) {
      if (typeof o[k] === 'string') return (o[k] as string).trim() || undefined;
    }
  }
  return undefined;
}

function pick(obj: Record<string, unknown>, re: RegExp): unknown {
  for (const k of Object.keys(obj)) if (re.test(k)) return obj[k];
  return undefined;
}

/** Does this object look like a job posting? (has a title-ish field + a url or several job fields) */
function looksLikeJob(o: Record<string, unknown>): boolean {
  const hasTitle = Boolean(toStr(pick(o, FIELD_RE.title)));
  if (!hasTitle) return false;
  const hasUrl = Boolean(toStr(pick(o, FIELD_RE.url)));
  const jobFields = [FIELD_RE.location, FIELD_RE.salary, FIELD_RE.employment, FIELD_RE.department, FIELD_RE.description].filter(
    (re) => pick(o, re) !== undefined,
  ).length;
  return hasUrl || jobFields >= 2;
}

/** Recursively collect every array-of-objects in a JSON value (capped). */
function collectArrays(node: unknown, out: Array<Record<string, unknown>[]>, depth = 0): void {
  if (depth > 8 || node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    if (node.length >= 3 && node.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      out.push(node as Record<string, unknown>[]);
    }
    for (const x of node.slice(0, 50)) collectArrays(x, out, depth + 1);
    return;
  }
  for (const v of Object.values(node as Record<string, unknown>)) collectArrays(v, out, depth + 1);
}

/** Find the array in a parsed JSON doc that most looks like a list of vacancies. */
export function findJobArray(json: unknown): Record<string, unknown>[] | null {
  const arrays: Array<Record<string, unknown>[]> = [];
  collectArrays(json, arrays);
  let best: { arr: Record<string, unknown>[]; score: number } | null = null;
  for (const arr of arrays) {
    const sample = arr.slice(0, 30);
    const jobish = sample.filter(looksLikeJob).length / sample.length;
    if (jobish < 0.6) continue;
    const score = jobish * Math.min(arr.length, 500);
    if (!best || score > best.score) best = { arr, score };
  }
  return best?.arr ?? null;
}

/** Map a detected job array to CanonicalJobs (verified — structured API data). */
export function mapJsonJobs(arr: Record<string, unknown>[], baseUrl?: string): CanonicalJob[] {
  const jobs: CanonicalJob[] = [];
  for (const o of arr) {
    const title = toStr(pick(o, FIELD_RE.title));
    const url = toStr(pick(o, FIELD_RE.url));
    if (!title || !url) continue;
    const desc = toStr(pick(o, FIELD_RE.description));
    const job = finalizeJob(
      {
        job_url: url,
        job_title: title,
        location: toStr(pick(o, FIELD_RE.location)),
        salary_range: toStr(pick(o, FIELD_RE.salary)),
        employment_type: toStr(pick(o, FIELD_RE.employment)),
        department: toStr(pick(o, FIELD_RE.department)),
        description: desc ? htmlToText(desc) : undefined,
        posted_date: toStr(pick(o, FIELD_RE.date)),
        verified: true,
      },
      baseUrl,
    );
    if (job) jobs.push(job);
  }
  return jobs;
}

/** Scan captured API bodies, return jobs from the best job-array found (BOM-tolerant). */
export function jobsFromApiBodies(bodies: Array<{ url: string; body: string }>, baseUrl?: string): CanonicalJob[] {
  let best: CanonicalJob[] = [];
  for (const { body } of bodies) {
    let json: unknown;
    try {
      json = JSON.parse(body.replace(/^﻿/, ''));
    } catch {
      continue;
    }
    const arr = findJobArray(json);
    if (!arr) continue;
    const jobs = mapJsonJobs(arr, baseUrl);
    if (jobs.length > best.length) best = jobs;
  }
  return best;
}
