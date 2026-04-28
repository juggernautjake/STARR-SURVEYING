// worker/src/cli/extract-video-thumbnails.ts
//
// Phase F4 — CLI entry point for the video-thumbnail extraction
// batch (Batch GG).
//
// Usage (after `npm run build`):
//   node dist/cli/extract-video-thumbnails.js              # one batch
//   node dist/cli/extract-video-thumbnails.js -b 10        # bigger batch
//   node dist/cli/extract-video-thumbnails.js --watch      # loop forever
//
// Or via the convenience npm script:
//   npm run extract-video-thumbnails -- --watch
//
// Designed to run from cron / pm2 / systemd alongside the other
// worker CLIs:
//   * --watch keeps the process alive and re-polls every WATCH_INTERVAL_MS
//   * one-shot mode exits 0 on success, 1 on infra failure
//
// Per-row failures (ffmpeg crash, malformed video, storage 4xx, etc.)
// are recorded as `thumbnail_extraction_status='failed'` on the
// field_media row but do NOT fail the CLI run — the next batch skips
// them and the mobile UI falls back to the 🎬 placeholder glyph.

import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';

import { processVideoThumbnailBatch } from '../services/video-thumbnail-extraction.js';

const WATCH_INTERVAL_MS = 60_000;

const program = new Command();
program
  .name('extract-video-thumbnails')
  .description('Run ffmpeg thumbnail extraction on queued video rows.')
  .option('-b, --batch-size <n>', 'Max videos per batch', (v) => parseInt(v, 10), 5)
  .option('-w, --watch', 'Loop forever, polling every 60 seconds', false)
  .parse(process.argv);

const opts = program.opts<{ batchSize: number; watch: boolean }>();

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      '[extract-video-thumbnails] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const runOnce = async () => {
    try {
      const summary = await processVideoThumbnailBatch(supabase, {
        batchSize: opts.batchSize,
      });
      // Always emit a summary line so a healthy idle worker is
      // distinguishable from a stuck cron / pm2 process.
      if (summary.total === 0) {
        console.log('[extract-video-thumbnails] batch: 0 rows queued');
      } else {
        const totalBytes = summary.results.reduce(
          (sum, r) => sum + (r.bytes ?? 0),
          0
        );
        console.log(
          `[extract-video-thumbnails] batch: ${summary.done} done, ` +
            `${summary.failed} failed, ${summary.skipped} skipped, ` +
            `${(totalBytes / 1024).toFixed(1)} KB written`
        );
      }
    } catch (err) {
      console.error('[extract-video-thumbnails] batch failed:', err);
      if (!opts.watch) process.exit(1);
    }
  };

  if (!opts.watch) {
    await runOnce();
    return;
  }

  console.log(
    `[extract-video-thumbnails] watch mode — polling every ${
      WATCH_INTERVAL_MS / 1000
    } s`
  );
  await runOnce();
  setInterval(() => {
    void runOnce();
  }, WATCH_INTERVAL_MS);
}

void main();
