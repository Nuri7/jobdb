import { dedupeJobs, finalizeJob, htmlToText } from '../extract/normalize.js';
import type { CanonicalJob, CompanyRow, Ctx, JobSource } from '../types.js';
import { SourceGoneError } from '../types.js';

/**
 * Generic JSON-API source for JS-heavy career sites that render jobs from their own
 * JSON endpoint (found via browser network inspection). Configure per company in
 * source_config.api:
 *   {
 *     url: "https://.../jobs?limit=500",   // the jobs endpoint (paginated all-in-one)
 *     jobs_path: "Jobs",                    // dot-path to the jobs array in the response
 *     base_url: "https://www.werkenbijasr.nl", // to resolve relative job urls
 *     map: { title:"JobTitle", url:"Url", location:"Location.Label",
 *            salary:"Salary", description:"JobIntroduction",
 *            employment_type:"WorkingHours", department:"JobDisciplines.0.Label" }
 *   }
 * Jobs from a structured API are genuine vacancies -> verified=true.
 */
export interface ApiSourceConfig {
  url: string;
  jobs_path?: string;
  base_url?: string;
  map: Record<string, string>;
}

/** Read a value at a dot/index path (e.g. "Location.Label", "JobDisciplines.0.Label"). */
function at(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) return cur[Number(key)];
    if (typeof cur === 'object') return (cur as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.Label === 'string') return o.Label;
    if (typeof o.label === 'string') return o.label;
    if (typeof o.name === 'string') return o.name;
  }
  return undefined;
}

export const apiSource: JobSource = {
  type: 'api',

  async fetchJobs(company: CompanyRow, ctx: Ctx): Promise<CanonicalJob[]> {
    const cfg = (company.source_config as unknown as { api?: ApiSourceConfig })?.api;
    if (!cfg?.url || !cfg.map?.title || !cfg.map?.url) {
      throw new SourceGoneError('api source: missing source_config.api {url, map.title, map.url}');
    }
    const res = await ctx.fetchText(cfg.url, { kind: 'api', timeoutMs: 25_000 });
    if (res.status === 404 || res.status === 410) throw new SourceGoneError(`api endpoint gone: ${cfg.url}`);
    if (res.status !== 200) throw new Error(`api HTTP ${res.status}`);

    let data: unknown;
    try {
      data = JSON.parse(res.text.replace(/^﻿/, '')); // tolerate UTF-8 BOM
    } catch {
      throw new Error('api: invalid JSON');
    }

    const arr = cfg.jobs_path ? at(data, cfg.jobs_path) : data;
    if (!Array.isArray(arr)) throw new SourceGoneError(`api: no jobs array at "${cfg.jobs_path ?? '<root>'}"`);

    const m = cfg.map;
    const jobs: CanonicalJob[] = [];
    for (const raw of arr) {
      const title = str(at(raw, m.title!)); // presence validated above
      const url = str(at(raw, m.url!));
      if (!title || !url) continue;
      const description = m.description ? str(at(raw, m.description)) : undefined;
      const job = finalizeJob(
        {
          job_url: url,
          job_title: title,
          location: m.location ? str(at(raw, m.location)) : undefined,
          salary_range: m.salary ? str(at(raw, m.salary)) : undefined,
          employment_type: m.employment_type ? str(at(raw, m.employment_type)) : undefined,
          department: m.department ? str(at(raw, m.department)) : undefined,
          description: description ? htmlToText(description) : undefined,
          posted_date: m.posted_date ? str(at(raw, m.posted_date)) : undefined,
          verified: true, // structured API = genuine vacancy
        },
        cfg.base_url,
      );
      if (job) jobs.push(job);
    }
    ctx.log(`  api: ${jobs.length} jobs from ${cfg.url}`);
    return dedupeJobs(jobs);
  },
};
