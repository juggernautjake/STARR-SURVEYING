// worker/src/cli/sweep-receipt-retention.ts
//
// CLI entry point for the receipt retention sweep
// (closes Batch CC v2 polish — the missing half of seeds/230).
//
// Usage (after `npm run build`):
//   node dist/cli/sweep-receipt-retention.js                  # dry-run (default)
//   node dist/cli/sweep-receipt-retention.js --execute        # actually purge
//   node dist/cli/sweep-receipt-retention.js --watch          # nightly loop
//   node dist/cli/sweep-receipt-retention.js -l 50            # smaller batch
//   node dist/cli/sweep-receipt-retention.js --rejected-days 60 --standard-days 1095
//
// Or via npm:
//   npm run sweep-receipt-retention -- --execute
//
// **DRY-RUN BY DEFAULT.** The sweep only deletes anything when
// `--execute` is supplied. Cron should run this dry-run nightly
// and email the report; a separate human-reviewed weekly cron
// runs `--execute`. No accidental mass-deletes from a misconfigured
// crontab.
//
// One-shot mode exits 0 on clean run, 1 on infra failure, 2 if
// any per-row errors landed in the report. --watch mode loops
// every 24h regardless of per-row errors so a single bad row
// doesn't kill the cron.

import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';

import { processRetentionSweep } from '../services/receipt-retention-sweep.js';

const WATCH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

const program = new Command();
program
  .name('sweep-receipt-retention')
  .description(
    'Hard-delete soft-deleted receipts past the IRS retention window. DRY-RUN BY DEFAULT.'
  )
  .option(
    '-e, --execute',
    'Actually perform deletes. Without this flag, we report what WOULD be purged and exit 0.',
    false
  )
  .option(
    '-l, --batch-limit <n>',
    'Max rows hard-deleted per run',
    (v) => parseInt(v, 10),
    100
  )
  .option(
    '--rejected-days <n>',
    'Retention days for status=rejected receipts (default 90)',
    (v) => parseInt(v, 10)
  )
  .option(
    '--standard-days <n>',
    'Retention days for everything else (default 7y = 2557 days)',
    (v) => parseInt(v, 10)
  )
  .option('-w, --watch', 'Loop forever, polling every 24h', false)
  .parse(process.argv);

const opts = program.opts<{
  execute: boolean;
  batchLimit: number;
  rejectedDays?: number;
  standardDays?: number;
  watch: boolean;
}>();

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      '[sweep-receipt-retention] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const runOnce = async (): Promise<number> => {
    try {
      const result = await processRetentionSweep(supabase, {
        dryRun: !opts.execute,
        batchLimit: opts.batchLimit,
        rejectedRetentionDays: opts.rejectedDays,
        standardRetentionDays: opts.standardDays,
      });

      const mode = opts.execute ? 'EXECUTE' : 'DRY-RUN';
      console.log(
        `[sweep-receipt-retention] ${mode} ` +
          `scanned=${result.scanned} ` +
          `purged=${result.purged} ` +
          `rejected.eligible=${result.buckets.rejected.eligible} ` +
          `rejected.purged=${result.buckets.rejected.purged} ` +
          `standard.eligible=${result.buckets.standard.eligible} ` +
          `standard.purged=${result.buckets.standard.purged} ` +
          `storage-only-skips=${result.storageOnlySkips} ` +
          `errors=${result.errors.length}`
      );

      if (!opts.execute && (result.buckets.rejected.eligible > 0 ||
          result.buckets.standard.eligible > 0)) {
        console.log(
          `[sweep-receipt-retention] DRY-RUN — re-run with --execute to actually purge ` +
            `${result.buckets.rejected.eligible + result.buckets.standard.eligible} ` +
            `eligible row(s).`
        );
      }

      if (result.errors.length > 0) {
        for (const e of result.errors.slice(0, 10)) {
          console.warn('[sweep-receipt-retention] error:', e);
        }
        return 2; // Per-row errors — surface to cron monitoring.
      }
      return 0;
    } catch (err) {
      console.error('[sweep-receipt-retention] sweep failed:', err);
      return 1;
    }
  };

  if (!opts.watch) {
    const code = await runOnce();
    if (code !== 0) process.exit(code);
    return;
  }

  console.log(
    `[sweep-receipt-retention] watch mode — polling every ${
      WATCH_INTERVAL_MS / (60 * 60 * 1000)
    }h, mode=${opts.execute ? 'EXECUTE' : 'DRY-RUN'}`
  );
  await runOnce();
  setInterval(() => {
    void runOnce();
  }, WATCH_INTERVAL_MS);
}

void main();
