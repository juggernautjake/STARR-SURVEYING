// worker/src/cli/transcribe-voice.ts
//
// Phase F4 — CLI entry point for the voice-memo transcription batch.
//
// Usage (after `npm run build`):
//   node dist/cli/transcribe-voice.js                   # one batch
//   node dist/cli/transcribe-voice.js --batch-size 10   # larger batch
//   node dist/cli/transcribe-voice.js --watch           # loop forever
//
// Or via the convenience npm script:
//   npm run transcribe-voice -- --watch
//
// Designed to run from cron / pm2 / a systemd timer alongside
// extract-receipts:
//   * --watch keeps the process alive and re-polls every WATCH_INTERVAL_MS
//   * one-shot mode exits 0 on success, 1 on infra failure
//
// Per-row failures (audio 4xx, Whisper rate limit, etc.) are
// recorded as `transcription_status='failed'` on the field_media
// row but do NOT fail the CLI run — the next batch skips them
// and the office reviewer plays the audio manually.

import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';

import { processVoiceTranscriptionBatch } from '../services/voice-transcription.js';

const WATCH_INTERVAL_MS = 60_000;

const program = new Command();
program
  .name('transcribe-voice')
  .description('Run OpenAI Whisper transcription on queued voice memos.')
  .option('-b, --batch-size <n>', 'Max memos per batch', (v) => parseInt(v, 10), 5)
  .option('-w, --watch', 'Loop forever, polling every 60 seconds', false)
  .parse(process.argv);

const opts = program.opts<{ batchSize: number; watch: boolean }>();

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      '[transcribe-voice] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('[transcribe-voice] OPENAI_API_KEY is required.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const runOnce = async () => {
    try {
      const summary = await processVoiceTranscriptionBatch(supabase, {
        batchSize: opts.batchSize,
      });
      // Always emit a summary line so a healthy idle worker is
      // distinguishable from a stuck cron / pm2 process.
      const cost = summary.results.reduce(
        (sum, r) => sum + (r.costCents ?? 0),
        0
      );
      if (summary.total === 0) {
        console.log('[transcribe-voice] batch: 0 rows queued');
      } else {
        console.log(
          `[transcribe-voice] batch: ${summary.done} done, ${summary.failed} failed, ${summary.skipped} skipped, ${cost / 100} USD`
        );
      }
    } catch (err) {
      console.error('[transcribe-voice] batch failed:', err);
      if (!opts.watch) process.exit(1);
    }
  };

  if (!opts.watch) {
    await runOnce();
    return;
  }

  console.log(
    `[transcribe-voice] watching — batch every ${WATCH_INTERVAL_MS / 1000}s, batch size ${opts.batchSize}.`
  );
  await runOnce();
  setInterval(runOnce, WATCH_INTERVAL_MS);
}

void main();
