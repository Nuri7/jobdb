import { parseArgs } from 'node:util';
import { probeCommand } from './probe.js';
import { refreshCommand } from './refresh.js';
import { resolveCommand } from './resolve.js';
import { statsCommand } from './stats.js';

const HELP = `jobdb pipeline

Usage:
  tsx src/cli.ts resolve  [--limit N] [--company <uuid|name>] [--only-broken] [--force] [--dry-run]
  tsx src/cli.ts refresh  [--limit N] [--company <uuid|name>] [--budget-min 50] [--dry-run]
  tsx src/cli.ts stats    [--format text|md|json]
  tsx src/cli.ts probe <url> [name]      (DB-less: resolve + fetch one company, write nothing)

resolve  Verify career pages + fingerprint job sources (writes company rows only)
refresh  Scrape due companies via their fingerprinted source + reconcile job lifecycle
stats    Coverage / freshness / failure summary
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      limit: { type: 'string' },
      company: { type: 'string' },
      'only-broken': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'budget-min': { type: 'string', default: '50' },
      format: { type: 'string', default: 'text' },
      help: { type: 'boolean', default: false },
    },
  });

  const command = positionals[0];
  if (values.help || !command) {
    console.log(HELP);
    return;
  }
  const limit = values.limit ? Number(values.limit) : undefined;
  if (values.limit && (!Number.isInteger(limit) || limit! <= 0)) {
    console.error('--limit must be a positive integer');
    process.exit(1);
  }

  switch (command) {
    case 'resolve':
      await resolveCommand({
        limit,
        company: values.company,
        onlyBroken: values['only-broken'] ?? false,
        force: values.force ?? false,
        dryRun: values['dry-run'] ?? false,
      });
      break;
    case 'refresh':
      await refreshCommand({
        limit,
        company: values.company,
        budgetMin: Number(values['budget-min']) || 50,
        dryRun: values['dry-run'] ?? false,
      });
      break;
    case 'stats': {
      const format = values.format === 'md' ? 'md' : values.format === 'json' ? 'json' : 'text';
      await statsCommand(format);
      break;
    }
    case 'probe': {
      const url = positionals[1];
      if (!url) {
        console.error('Usage: probe <url> [company name]');
        process.exit(1);
      }
      await probeCommand(url, positionals[2]);
      break;
    }
    default:
      console.error(`Unknown command: ${command}\n${HELP}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
