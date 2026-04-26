// worker/src/cli/extract-receipts.ts
//
// Phase F2 #4 — CLI entry point for the receipt-extraction batch.
//
// Usage (after `npm run build`):
//   node dist/cli/extract-receipts.js                    # one batch
//   node dist/cli/extract-receipts.js --batch-size 25    # larger batch
//   node dist/cli/extract-receipts.js --watch            # loop forever
//
// Or via the convenience npm script:
//   npm run extract-receipts -- --watch
//
// Designed to run from cron / pm2 / a systemd timer:
//   * --watch keeps the process alive and re-polls every WATCH_INTERVAL_MS
//   * one-shot mode exits with code 0 on success, 1 on infra failure
//
// Per-row failures (Vision 4xx, JSON parse error, photo missing) are
// recorded as `extraction_status='failed'` on the receipt row but do
// NOT fail the CLI run — the next batch will skip them and the user
// fills out the receipt manually on mobile.

import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';

import { processQueuedReceipts } from '../services/receipt-extraction.js';

const WATCH_INTERVAL_MS = 30_000;

const program = new Command();
program
  .name('extract-receipts')
  .description('Run Claude Vision extraction on queued Starr Field receipts.')
  .option('-b, --batch-size <n>', 'Max receipts per batch', (v) => parseInt(v, 10), 10)
  .option('-w, --watch', 'Loop forever, polling every 30 seconds', false)
  .parse(process.argv);

const opts = program.opts<{ batchSize: number; watch: boolean }>();

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      '[extract-receipts] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[extract-receipts] ANTHROPIC_API_KEY is required.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const runOnce = async () => {
    try {
      const results = await processQueuedReceipts(supabase, {
        batchSize: opts.batchSize,
      });
      const done = results.filter((r) => r.status === 'done').length;
      const failed = results.filter((r) => r.status === 'failed').length;
      const cost = results.reduce((sum, r) => sum + (r.costCents ?? 0), 0);
      console.log(
        `[extract-receipts] batch: ${done} done, ${failed} failed, ${cost / 100} USD`
      );
    } catch (err) {
      console.error('[extract-receipts] batch failed:', err);
      // Don't kill --watch over a transient infra hiccup; one-shot
      // exits with 1 so cron retries on the next tick.
      if (!opts.watch) process.exit(1);
    }
  };

  if (!opts.watch) {
    await runOnce();
    return;
  }

  console.log(
    `[extract-receipts] watching — batch every ${WATCH_INTERVAL_MS / 1000}s, batch size ${opts.batchSize}.`
  );
  // Run immediately, then on the interval.
  await runOnce();
  setInterval(runOnce, WATCH_INTERVAL_MS);
}

void main();
