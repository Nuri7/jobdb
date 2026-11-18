import pLimit from 'p-limit';
import { createDb, pickResolvable } from './db.js';
import { buildCtx } from './refresh.js';
import { processCompany } from './lifecycle.js';
import { closeBrowser } from './sources/rendered.js';

/** Retry only due sources. Known adapters retain their config on transient errors/429s. */
export async function recoverCommand(limit = 100, budgetMin = 15, dryRun = false) {
  const db = createDb({readOnly: dryRun});
  const deadline = Date.now() + budgetMin * 60000;
  const ctx = buildCtx(dryRun, false, deadline);
  ctx.llm = null;
  const companies = await pickResolvable(db, limit, 'broken', true);
  const pool = pLimit(6);
  let checked = 0, recovered = 0, failed = 0;
  try {
    await Promise.all(companies.map(company => pool(async () => {
      if (Date.now() >= deadline) return;
      const result = await processCompany(db, ctx, company);
      checked++;
      if (['ok','nochange'].includes(result.status)) recovered++;
      else failed++;
      console.log(JSON.stringify({id: company.id, ...result}));
    })));
  } finally { await closeBrowser(); }
  console.log(JSON.stringify({selected: companies.length, checked, recovered, failed, ai_calls: 0}));
}
