// worker/src/cli/scan-missing-receipts.ts
//
// Phase F6 — CLI entry point for the missing-receipt cross-reference
// scan (Batch DD).
//
// Usage (after `npm run build`):
//   node dist/cli/scan-missing-receipts.js                # one batch
//   node dist/cli/scan-missing-receipts.js --watch        # loop forever
//
// Or via the convenience npm script:
//   npm run scan-missing-receipts -- --watch
//
// Designed to run from cron / pm2 / systemd timer once an hour.
// Idempotent — encodes the stop_id in the notification's link so a
// re-run within the dedup window finds the prior row and skips.
//
// One-shot mode exits 0 on success, 1 on infra failure. --watch mode
// loops every WATCH_INTERVAL_MS regardless of per-stop errors so a
// single bad row doesn't kill the cron.

import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';

import { processMissingReceiptScan } from '../services/missing-receipt-detection.js';

const WATCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const program = new Command();
program
  .name('scan-missing-receipts')
  .description('Scan for stops without a corresponding receipt and notify the surveyor.')
  .option(
    '-c, --per-user-cap <n>',
    'Max notifications per user per scan',
    (v) => parseInt(v, 10),
    5
  )
  .option(
    '-d, --min-duration <n>',
    'Minimum stop duration in minutes',
    (v) => parseInt(v, 10),
    5
  )
  .option(
    '-r, --receipt-window <n>',
    'Receipt-window padding in minutes (±)',
    (v) => parseInt(v, 10),
    30
  )
  .option(
    '-h, --hours-back <n>',
    'Hours of history to scan',
    (v) => parseInt(v, 10),
    24
  )
  .option('-w, --watch', 'Loop forever, polling every hour', false)
  .parse(process.argv);

const opts = program.opts<{
  perUserCap: number;
  minDuration: number;
  receiptWindow: number;
  hoursBack: number;
  watch: boolean;
}>();

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      '[scan-missing-receipts] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const runOnce = async () => {
    try {
      const sinceIso = new Date(
        Date.now() - opts.hoursBack * 60 * 60 * 1000
      ).toISOString();
      const summary = await processMissingReceiptScan(supabase, {
        sinceIso,
        perUserCap: opts.perUserCap,
        minDurationMinutes: opts.minDuration,
        receiptWindowMinutes: opts.receiptWindow,
      });
      // Always emit a summary line so a healthy idle worker is
      // distinguishable from a stuck cron / pm2 process.
      console.log(
        `[scan-missing-receipts] candidates=${summary.candidateStops} ` +
          `inserted=${summary.inserted} ` +
          `receipt-covered=${summary.receiptCovered} ` +
          `already-notified=${summary.alreadyNotified} ` +
          `capped=${summary.capped} ` +
          `errors=${summary.errors.length}`
      );
      if (summary.errors.length > 0) {
        for (const e of summary.errors.slice(0, 5)) {
          console.warn('[scan-missing-receipts] error:', e);
        }
      }
    } catch (err) {
      console.error('[scan-missing-receipts] scan failed:', err);
      if (!opts.watch) process.exit(1);
    }
  };

  if (!opts.watch) {
    await runOnce();
    return;
  }

  // Watch loop — fire-and-forget timer. We also run on tick
  // boundaries (every WATCH_INTERVAL_MS) rather than precise
  // hourly clocks; cron is the right tool for "exactly at :00".
  console.log(
    `[scan-missing-receipts] watch mode — polling every ${
      WATCH_INTERVAL_MS / 60_000
    } min`
  );
  await runOnce();
  setInterval(() => {
    void runOnce();
  }, WATCH_INTERVAL_MS);
}

void main();
