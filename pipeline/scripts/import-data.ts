/**
 * One-time import of the data exported from the Lovable Cloud project
 * (migration-data/*.json) into the new self-owned Supabase project.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from pipeline/.env — make sure
 * those already point at the NEW project before running:
 *   npx tsx scripts/import-data.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', '..', 'migration-data');

function load<T>(name: string): T[] {
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file} — run the export first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const cfg = config();
if (!cfg.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY required (must be the NEW project).');
  process.exit(1);
}
if (cfg.SUPABASE_URL.includes('khsaaiguqwtxtkvzqbrm')) {
  console.error('SUPABASE_URL still points at the OLD (Lovable Cloud) project — refusing to import.');
  process.exit(1);
}
const db = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const companies = load<Record<string, unknown>>('companies.json');
console.log(`Importing ${companies.length} companies…`);
let done = 0;
for (const batch of chunk(companies, 500)) {
  const { error } = await db.from('company_career_sites').upsert(batch, { onConflict: 'id' });
  if (error) {
    console.error(`companies batch failed at ${done}: ${error.message}`);
    process.exit(1);
  }
  done += batch.length;
  console.log(`  ${done}/${companies.length}`);
}

const synonyms = load<Record<string, unknown>>('job_synonyms.json');
console.log(`Importing ${synonyms.length} synonym groups…`);
{
  const { error } = await db.from('job_synonyms').upsert(synonyms, { onConflict: 'id' });
  if (error) {
    console.error(`job_synonyms failed: ${error.message}`);
    process.exit(1);
  }
}

const settings = load<Record<string, unknown>>('scraper_settings.json');
console.log(`Importing ${settings.length} scraper settings…`);
{
  // Migration seeds defaults — exported values win, but ids differ: conflict on setting_key
  const cleaned = settings.map(({ id: _id, ...rest }) => rest);
  const { error } = await db.from('scraper_settings').upsert(cleaned, { onConflict: 'setting_key' });
  if (error) {
    console.error(`scraper_settings failed: ${error.message}`);
    process.exit(1);
  }
}

for (const table of ['company_career_sites', 'job_synonyms', 'scraper_settings'] as const) {
  const { count } = await db.from(table).select('id', { count: 'exact', head: true });
  console.log(`${table}: ${count} rows in new project`);
}
console.log('Import complete.');
