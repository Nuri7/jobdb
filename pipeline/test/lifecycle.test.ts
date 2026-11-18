import { expect, it, vi } from 'vitest';
import type { CompanyRow, Ctx } from '../src/types.js';
const state = vi.hoisted(() => ({touches: [] as string[][], misses: [] as string[][]}));
vi.mock('../src/db.js', () => ({
  listCompanyJobs: async (_db: unknown, id: string) => [{id,job_url: `https://example.org/jobs/${id}`, content_hash: 'same',status: 'open',verified: true}],
  touchJobs: async (_db: unknown, ids: string[]) => {state.touches.push(ids);},
  incrementMisses: async (_db: unknown, ids: string[]) => {state.misses.push(ids);return [];},
  upsertJobs: async () => 0, updateCompany: async () => {}, countOpenJobs: async () => 1,
  insertHistory: async () => 'history', completeHistory: async () => {}, closeCompanyJobs: async () => 0,
}));
vi.mock('../src/sources/registry.js', () => ({sourceFor: () => ({fetchJobs: async (company: CompanyRow, ctx: Ctx) => {
  ctx.liveUrls = new Set([`https://example.org/jobs/${company.id}`]);
  ctx.liveUrlsComplete = true;
  await new Promise(resolve => setTimeout(resolve, company.id === 'a' ? 20 : 5));
  return [{job_url: `https://example.org/jobs/${company.id}`, job_title: 'Engineer',content_hash: 'same',verified: true}];
}})}));
import {processCompany} from '../src/lifecycle.js';

it('keeps concurrent live rosters separate and never misses another company’s jobs', async () => {
  state.touches = []; state.misses = [];
  const ctx: Ctx = {dryRun: false, llm: null, log: () => {}, robotsAllowed: async () => true,fetchText: vi.fn()};
  const company = (id: string) => ({id, company_name: id,source_type: 'ats:ashby',source_config: {resolved_url: 'https://example.org'},career_url: 'https://example.org',career_page_status: 'verified',consecutive_failures: 0,check_interval_hours: 24}) as CompanyRow;
  const results = await Promise.all([processCompany({} as never,ctx,company('a')),processCompany({} as never,ctx,company('b'))]);
  expect(results.map(r => r.status)).toEqual(['ok','ok']);
  expect(state.touches).toEqual([['b'],['a']]);
  expect(state.misses).toEqual([[],[]]);
  expect(ctx.liveUrls).toBeUndefined();
});
