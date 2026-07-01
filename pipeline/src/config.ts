import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  SUPABASE_ANON_KEY: z.string().optional().default(''),
  LLM_BASE_URL: z.string().optional().default('https://ai.gateway.lovable.dev/v1'),
  LLM_API_KEY: z.string().optional().default(''),
  LLM_MODEL: z.string().optional().default('google/gemini-2.5-flash-lite'),
  LLM_MAX_CALLS: z.coerce.number().int().positive().optional().default(500),
  COMPANY_CONCURRENCY: z.coerce.number().int().min(1).max(30).optional().default(10),
  ROBOTS_RESPECT: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),
});

export type Config = z.infer<typeof envSchema>;

/** Load pipeline/.env if present (never required — CI passes real env vars). */
function loadDotEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(here, '..', '.env'), path.join(process.cwd(), '.env')];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1]!;
      let val = m[2] ?? '';
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
    break;
  }
}

let cached: Config | null = null;

export function config(): Config {
  if (cached) return cached;
  loadDotEnv();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}

export const USER_AGENT =
  'Mozilla/5.0 (compatible; jobdb-pipeline/1.0; +https://github.com/Nuri7/jobdb)';
