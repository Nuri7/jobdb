import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Ctx } from '../types.js';

type Entry = { savedAt: number; values: string[] };

/** Only discovery candidates are cached. Jobs must always pass current source validation. */
export async function cachedDiscovery(key: string, ctx: Ctx, load: () => Promise<string[]>): Promise<string[]> {
  const dir = process.env.DISCOVERY_CACHE_DIR ?? path.resolve('.cache/fairjobs-discovery');
  const file = path.join(dir, createHash('sha256').update(key).digest('hex') + '.json');
  let cached: Entry | undefined;
  try {
    const entry = JSON.parse(await readFile(file, 'utf8')) as Entry;
    if (Number.isFinite(entry.savedAt) && Array.isArray(entry.values) && entry.values.every(v => typeof v === 'string')) cached = entry;
  } catch { /* first run or invalid cache */ }
  const age = cached ? Date.now() - cached.savedAt : Infinity;
  if (cached && age >= 0 && age < 86400000) return cached.values;
  try {
    const values = await load();
    await mkdir(dir, {recursive: true});
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({savedAt: Date.now(), values}));
    await rename(temporary, file);
    return values;
  } catch (error) {
    if (cached && age >= 0 && age < 90 * 86400000) {
      ctx.log(`discovery unavailable (${key}); validating cached candidates from ${new Date(cached.savedAt).toISOString()}`);
      return cached.values;
    }
    throw error;
  }
}
