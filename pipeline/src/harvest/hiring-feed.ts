import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { cachedDiscovery } from './cache.js';
import { fingerprintAts, type AtsFingerprint } from '../resolver/fingerprint.js';
import type { Ctx } from '../types.js';

const API = 'https://hacker-news.firebaseio.com/v0';
type Item = {id?: number; title?: string; kids?: number[]; text?: string; time?: number; deleted?: boolean; dead?: boolean};

/** Employer-authored public hiring posts yield candidate boards, never trusted vacancy facts. */
export function boardsFromHiringHtml(html: string): AtsFingerprint[] {
  const $ = cheerio.load(html);
  const boards = new Map<string, AtsFingerprint>();
  $('a[href]').each((_index, element) => {
    const fp = fingerprintAts($(element).attr('href') ?? '', '', []);
    if (fp) boards.set(`${fp.ats}:${fp.boardId}`, fp);
  });
  return [...boards.values()];
}

let request: Promise<AtsFingerprint[]> | undefined;
export function hiringFeedBoards(ctx: Ctx): Promise<AtsFingerprint[]> {
  request ??= cachedDiscovery('hn-hiring-boards-v1', ctx, async () => {
    const user = await ctx.fetchText(`${API}/user/whoishiring.json`, {kind: 'api', retries: 1});
    if (user.status !== 200) throw new Error(`Hiring feed HTTP ${user.status}`);
    const ids = JSON.parse(user.text)?.submitted;
    if (!Array.isArray(ids)) throw new Error('Hiring feed has no submitted stories');
    const item = async (id: number): Promise<Item> => {
      const res = await ctx.fetchText(`${API}/item/${id}.json`, {kind: 'api', retries: 1});
      if (res.status !== 200) throw new Error(`Hiring item HTTP ${res.status}`);
      return JSON.parse(res.text) ?? {};
    };
    const stories: Item[] = [];
    for (const id of ids.slice(0, 12)) {
      const story = await item(Number(id));
      if (/^Ask HN: Who is hiring\?/i.test(story.title ?? '') && (story.time ?? 0) > Date.now()/1000 - 100*86400) stories.push(story);
      if (stories.length >= 2) break;
    }
    if (!stories.length) throw new Error('No current public hiring threads found');
    const pool = pLimit(6);
    const results = await Promise.allSettled(stories.flatMap(s => s.kids ?? []).slice(0, 500).map(id => pool(() => item(id))));
    if (results.filter(r => r.status === 'rejected').length > results.length / 4) throw new Error('Hiring feed is incomplete; retaining prior candidate cache');
    const all = new Map<string, AtsFingerprint>();
    for (const result of results) {
      if (result.status !== 'fulfilled' || result.value.deleted || result.value.dead) continue;
      for (const fp of boardsFromHiringHtml(result.value.text ?? '')) all.set(`${fp.ats}:${fp.boardId}`, fp);
    }
    ctx.log(`Independent hiring feed: ${stories.length} current threads, ${all.size} candidate ATS boards`);
    return [...all.values()].map(fp => JSON.stringify(fp));
  }).then(values => values.map(value => JSON.parse(value) as AtsFingerprint));
  return request;
}
