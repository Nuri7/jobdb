import assert from 'node:assert/strict';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createDb } from '../src/db.js';
import { config } from '../src/config.js';

const site = process.env.FAIRJOBS_VERIFY_SITE || 'https://fairjobs.app';
const checks: Record<string, unknown>[] = [];
async function jobs(params: string) {
  const started = performance.now();
  const response = await fetch(`${site}/api/jobs?${params}`, {
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, `${params}: HTTP ${response.status}`);
  const body = await response.json();
  assert(Array.isArray(body.data));
  checks.push({
    params,
    milliseconds: Math.round(performance.now() - started),
    total: body.meta.total,
  });
  return body;
}
const employment = await jobs('mode=employment&posted_within=30&limit=24');
assert(
  employment.data.every(
    (job: { employment_type_normalized: string }) =>
      job.employment_type_normalized !== 'freelance',
  ),
);
const freelance = await jobs('mode=freelance&posted_within=30&limit=24');
assert(
  freelance.data.every(
    (job: {
      freelance_eligible: boolean;
      employment_type_normalized: string;
    }) =>
      job.freelance_eligible === true &&
      job.employment_type_normalized === 'freelance',
  ),
);
const rate = await jobs('mode=freelance&pay_min=90&sort=salary&limit=50');
const amounts = rate.data.map(
  (job: { salary_max: number; salary_min: number; salary_period: string }) => {
    assert.equal(job.salary_period, 'hour');
    return Number(job.salary_max || job.salary_min);
  },
);
assert(
  amounts.every(
    (amount: number, index: number) =>
      amount >= 90 && (index === 0 || amount <= amounts[index - 1]),
  ),
);
const hours = await jobs('mode=freelance&hours_min=32&hours_max=40&limit=50');
assert(
  hours.data.every(
    (job: { freelance_details: { hours_max: number; hours_min: number } }) =>
      job.freelance_details.hours_max >= 32 &&
      job.freelance_details.hours_min <= 40,
  ),
);
await jobs(
  'mode=employment&search=product%20owner&near=Amsterdam&radius_km=25&limit=5',
);
const empty = await jobs(
  'mode=freelance&search=unlikelyroleverifynonexyz&limit=1',
);
assert.equal(empty.meta.total, 0);
const excluded = await fetch(
  `${site}/api/jobs/2295d041-2573-4108-842f-e0a0a264cbf3?verification=${Date.now()}`,
);
assert.equal(excluded.status, 404);
checks.push({ foreign_detail: 404 });

if (process.argv.includes('--with-fixtures')) {
  const admin = createDb();
  const cfg = config();
  assert(cfg.SUPABASE_URL.includes('sfdppcdzvwmdbqlehihz'));
  const frontendEnv = readFileSync(
    new URL('../../.env.production', import.meta.url),
    'utf8',
  );
  const publicKey =
    cfg.SUPABASE_ANON_KEY ||
    frontendEnv.match(/^VITE_SUPABASE_PUBLISHABLE_KEY=["']?([^"'\n]+)/m)?.[1];
  assert(publicKey, 'Public key required for RLS checks');
  const created: string[] = [];
  const clients: SupabaseClient[] = [];
  const cleanupErrors: string[] = [];
  try {
    for (let index = 0; index < 2; index++) {
      const email = `fairjobs-qa-${crypto.randomUUID()}@example.invalid`;
      const password = `${crypto.randomUUID()}Aa1!`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      created.push(data.user.id);
      const client = createClient(cfg.SUPABASE_URL, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signIn = await client.auth.signInWithPassword({ email, password });
      if (signIn.error) throw signIn.error;
      clients.push(client);
    }
    const criteria = {
      mode: 'freelance',
      location: 'Amsterdam',
      radiusKm: 25,
      hoursMin: 24,
      payMin: 90,
      workplaceType: 'hybrid',
    };
    const saved = await clients[0]!
      .from('job_saved_searches')
      .insert({
        user_id: created[0],
        name: 'Disposable QA search',
        criteria,
        email_enabled: false,
        email_frequency: 'weekly',
      })
      .select('id')
      .single();
    if (saved.error) throw saved.error;
    const lookup = await clients[0]!
      .from('job_saved_searches')
      .select('email_frequency,criteria')
      .eq('criteria', JSON.stringify(criteria))
      .single();
    if (lookup.error) throw lookup.error;
    assert.equal(lookup.data.email_frequency, 'weekly');
    assert.deepEqual(lookup.data.criteria, criteria);
    const other = await clients[1]!
      .from('job_saved_searches')
      .select('id')
      .eq('id', saved.data.id);
    assert.equal(other.error, null);
    assert.deepEqual(other.data, []);
    const updated = await clients[0]!
      .from('job_saved_searches')
      .update({ email_frequency: 'daily' })
      .eq('id', saved.data.id)
      .select('email_frequency')
      .single();
    if (updated.error) throw updated.error;
    assert.equal(updated.data.email_frequency, 'daily');
    for (let attempt = 0; attempt < 2; attempt++) {
      const item = await clients[0]!
        .from('job_saved_items')
        .upsert(
          { user_id: created[0], job_id: freelance.data[0].id },
          { onConflict: 'user_id,job_id' },
        );
      if (item.error) throw item.error;
    }
    const items = await clients[0]!.from('job_saved_items').select('job_id');
    assert.equal(items.data?.length, 1);
    checks.push({
      saved_search_persistence: true,
      weekly_daily: true,
      owner_isolation: true,
      idempotent_job_save: true,
    });
    const dryRun = await fetch(
      `${cfg.SUPABASE_URL}/functions/v1/send-job-alerts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dry_run: true }),
      },
    );
    const receipt = await dryRun.json();
    assert.equal(dryRun.status, 200);
    assert.equal(receipt.sent, 0);
    assert.equal(receipt.dry_run, true);
    checks.push({ alerts_dry_run: true, emails_sent: 0 });
  } finally {
    for (const client of clients) await client.auth.signOut();
    for (const id of created) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) cleanupErrors.push(error.message);
    }
    checks.push({ disposable_accounts_removed: created.length });
  }
  assert.deepEqual(cleanupErrors, [], 'Disposable fixture cleanup failed');
}
console.log(
  JSON.stringify(
    { checked_at: new Date().toISOString(), site, checks },
    null,
    2,
  ),
);
