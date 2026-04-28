// worker/src/services/voice-transcription.ts
//
// Phase F4 — server-side voice memo transcription via OpenAI Whisper.
// Per STARR_FIELD_MOBILE_APP_PLAN.md §5.5:
//
//   1. Mobile records a voice memo (lib/voiceRecorder.ts), uploads to
//      starr-field-voice bucket, INSERTs a field_media row with
//      media_type='voice', upload_state='pending',
//      transcription_status='queued'.
//   2. Upload queue flips upload_state='done' once bytes land.
//   3. This worker polls for rows where upload_state='done' AND
//      transcription_status='queued', marks each 'running', fetches
//      the M4A via signed URL, calls Whisper, and UPDATEs the row
//      with transcription text + transcription_completed_at +
//      transcription_cost_cents.
//   4. Mobile + admin UIs reflect the updated fields within ms via
//      PowerSync (mobile) or fetch refresh (admin).
//
// Cost: Whisper API = $0.006/min ($0.0001/sec). Per-row cost lands
// on field_media.transcription_cost_cents for audit AND flows
// through the shared `getGlobalAiTracker()` circuit breaker
// (Batch SS — service='whisper-transcribe', explicit costUsd
// override since Whisper bills per-second rather than per-token).
// A runaway Whisper backlog will trip the same gate that protects
// Recon's vision-ocr spend.
//
// Failure modes:
//   - Signed URL fetch error → markFailed with 'fetch: ...'.
//   - Whisper API error → markFailed with 'whisper: ...'.
//   - Empty transcript → marked 'done' with empty string (Whisper
//     correctly outputs nothing for silent audio; surfaces as
//     "(no speech detected)" in the admin viewer).
//
// Process model: same as receipt-extraction — single-process loop
// processing up to BATCH_SIZE rows in sequence. Every step gets a
// breadcrumb via the ProcessLogger so Sentry can correlate failures
// with the exact row + Whisper-API outcome.
//
// Watchdog: rows stuck in 'running' past WATCHDOG_MS are re-queued
// on the next batch poll (claimRow's safety net). Crashed worker
// → max one row stuck for the watchdog window.

import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getGlobalAiTracker } from '../lib/ai-usage-tracker.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const BUCKET = 'starr-field-voice';
/** Whisper model id. STARR_FIELD_WHISPER_MODEL overrides if a newer
 *  variant becomes available without a redeploy. */
const WHISPER_MODEL = process.env.STARR_FIELD_WHISPER_MODEL ?? 'whisper-1';
/** Skip rows whose audio exceeds this duration. Whisper supports
 *  up to 25 MB; an M4A mono at 96 kbps is ~720 KB/min, so the
 *  practical cap is ~30 min. We cap at 10 min — surveyors record
 *  short field memos, anything longer is probably an
 *  accidentally-left-on recording. */
const MAX_DURATION_SEC = 10 * 60;
/** Whisper pricing snapshot: $0.006 per minute. */
const WHISPER_USD_PER_MINUTE = 0.006;
const DEFAULT_BATCH_SIZE = 5;

/** Watchdog window for crashed-worker detection. A row sitting in
 *  'running' state longer than this is considered abandoned. */
const WATCHDOG_MS = 5 * 60 * 1000; // 5 minutes

// ── Types ─────────────────────────────────────────────────────────────────────

interface VoiceRow {
  id: string;
  job_id: string;
  data_point_id: string | null;
  storage_url: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  transcription_status: string | null;
  transcription_started_at: string | null;
}

export interface ProcessLogger {
  info(msg: string, fields: Record<string, unknown>): void;
  warn(msg: string, fields: Record<string, unknown>): void;
  error(msg: string, err: unknown, fields: Record<string, unknown>): void;
}

const consoleLogger: ProcessLogger = {
  info: (msg, f) =>
    console.log(JSON.stringify({ level: 'info', svc: 'voice-tx', msg, ...f })),
  warn: (msg, f) =>
    console.warn(JSON.stringify({ level: 'warn', svc: 'voice-tx', msg, ...f })),
  error: (msg, err, f) =>
    console.error(
      JSON.stringify({
        level: 'error',
        svc: 'voice-tx',
        msg,
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        ...f,
      })
    ),
};

export interface VoiceTranscriptionResult {
  mediaId: string;
  status: 'done' | 'failed' | 'skipped';
  error?: string;
  costCents?: number;
  textLength?: number;
}

// ── Top-level batch ───────────────────────────────────────────────────────────

export async function processVoiceTranscriptionBatch(
  supabase: SupabaseClient,
  options: { batchSize?: number; logger?: ProcessLogger } = {}
): Promise<{
  total: number;
  done: number;
  failed: number;
  skipped: number;
  results: VoiceTranscriptionResult[];
}> {
  const logger = options.logger ?? consoleLogger;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  if (!process.env.OPENAI_API_KEY) {
    logger.warn(
      'OPENAI_API_KEY missing — voice transcription disabled',
      {}
    );
    return { total: 0, done: 0, failed: 0, skipped: 0, results: [] };
  }

  // 1. Sweep stale 'running' rows back to 'queued' so the watchdog
  //    re-tries on this run. Defensive — claimRow handles the
  //    same case row-by-row, but a sweep keeps the queue moving
  //    if many rows were stuck.
  await sweepWatchdog(supabase, logger);

  // 2. Fetch up to batchSize queued rows. The partial index on
  //    field_media (created_at) WHERE transcription_status='queued'
  //    AND upload_state='done' AND media_type='voice' makes this
  //    query cheap.
  const { data: rowsRaw, error: rowsErr } = await supabase
    .from('field_media')
    .select(
      'id, job_id, data_point_id, storage_url, duration_seconds, file_size_bytes, transcription_status, transcription_started_at'
    )
    .eq('media_type', 'voice')
    .eq('upload_state', 'done')
    .eq('transcription_status', 'queued')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (rowsErr) {
    logger.error(
      'queue fetch failed',
      rowsErr instanceof Error ? rowsErr : new Error(rowsErr.message),
      {}
    );
    return { total: 0, done: 0, failed: 0, skipped: 0, results: [] };
  }
  const rows = (rowsRaw ?? []) as VoiceRow[];
  if (rows.length === 0) {
    logger.info('no queued voice memos', {});
    return { total: 0, done: 0, failed: 0, skipped: 0, results: [] };
  }
  logger.info('processing batch', { count: rows.length });

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const results: VoiceTranscriptionResult[] = [];
  let done = 0;
  let failed = 0;
  let skipped = 0;

  // Pre-loop gate check — same shape as receipt-extraction. The
  // per-row pipeline re-checks before the Whisper call too, but
  // bailing out early when the breaker is wide-open avoids
  // claiming rows we won't process.
  const tracker = getGlobalAiTracker();
  const initialGate = tracker.canMakeCall();
  if (!initialGate.allowed) {
    logger.warn('AI usage tracker circuit open — skipping batch', {
      reason: initialGate.reason,
    });
    return { total: 0, done: 0, failed: 0, skipped: rows.length, results: [] };
  }

  for (const row of rows) {
    const result = await processOne(supabase, client, tracker, row, logger);
    results.push(result);
    if (result.status === 'done') done += 1;
    else if (result.status === 'failed') failed += 1;
    else skipped += 1;
  }

  logger.info('batch complete', {
    total: rows.length,
    done,
    failed,
    skipped,
  });

  return { total: rows.length, done, failed, skipped, results };
}

// ── Per-row pipeline ──────────────────────────────────────────────────────────

async function processOne(
  supabase: SupabaseClient,
  client: OpenAI,
  tracker: ReturnType<typeof getGlobalAiTracker>,
  row: VoiceRow,
  logger: ProcessLogger
): Promise<VoiceTranscriptionResult> {
  // 1. Length cap. Skip + mark failed (so we don't retry forever)
  //    when the audio is implausibly long.
  if (
    row.duration_seconds != null &&
    row.duration_seconds > MAX_DURATION_SEC
  ) {
    await markFailed(
      supabase,
      row.id,
      `duration ${row.duration_seconds}s exceeds ${MAX_DURATION_SEC}s cap`,
      logger
    );
    return {
      mediaId: row.id,
      status: 'failed',
      error: 'duration cap',
    };
  }
  if (!row.storage_url) {
    await markFailed(supabase, row.id, 'missing storage_url', logger);
    return {
      mediaId: row.id,
      status: 'failed',
      error: 'missing storage_url',
    };
  }

  // 2. Race-safe claim: flip queued → running ONLY if the row is
  //    still queued OR running-but-stale. Returns null on lost race
  //    so two concurrent workers can't double-process.
  const startedAt = new Date().toISOString();
  const claimed = await claimRow(supabase, row.id, startedAt, logger);
  if (!claimed) {
    return { mediaId: row.id, status: 'skipped', error: 'lost claim race' };
  }

  // 3. Fetch the audio bytes via signed URL.
  let audioBuffer: Buffer;
  try {
    const { data: signedRes, error: signedErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_url, 60 * 5); // 5 min plenty
    if (signedErr || !signedRes?.signedUrl) {
      throw new Error(signedErr?.message ?? 'signed URL missing');
    }
    const resp = await fetch(signedRes.signedUrl);
    if (!resp.ok) {
      throw new Error(`audio fetch ${resp.status}`);
    }
    const arr = await resp.arrayBuffer();
    audioBuffer = Buffer.from(arr);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markFailed(supabase, row.id, `fetch: ${msg}`, logger);
    logger.warn('audio fetch failed', { media_id: row.id, error: msg });
    return { mediaId: row.id, status: 'failed', error: msg };
  }

  // 4. Re-check the gate immediately before the Whisper call. The
  //    audio download might have taken seconds; a sibling row in
  //    the batch could have just opened the breaker. Without this
  //    check, we'd spend on a call we should have skipped. Mirror
  //    the receipt-extraction pattern.
  const gate = tracker.canMakeCall();
  if (!gate.allowed) {
    // Roll the row back to 'queued' so the next batch retries.
    // Don't markFailed — the breaker is a transient soft-stop.
    await releaseClaim(supabase, row.id, logger);
    logger.warn('circuit open after audio fetch — releasing row', {
      media_id: row.id,
      reason: gate.reason,
    });
    return {
      mediaId: row.id,
      status: 'failed',
      error: gate.reason ?? 'circuit open',
    };
  }

  // 5. Whisper API call. The OpenAI SDK accepts a File-like — Node
  //    fetch handles the multipart upload internally.
  let text = '';
  try {
    // Construct a File-like blob the SDK accepts. Filename must
    // include a recognised extension so Whisper picks the right
    // decoder; .m4a maps to AAC.
    const blob = new Blob([audioBuffer], { type: 'audio/mp4' });
    const file = new File([blob], `${row.id}.m4a`, { type: 'audio/mp4' });
    const transcript = await client.audio.transcriptions.create({
      file,
      model: WHISPER_MODEL,
      // language hint — leave undefined to auto-detect; surveyors are
      // English-speaking but specifying en hardens accuracy on
      // accented audio.
      language: 'en',
      response_format: 'json',
    });
    text = transcript.text ?? '';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Failed attempts go on the ledger too — consecutive failures
    // open the circuit (Whisper outage shouldn't drain credits).
    tracker.record({
      service: 'whisper-transcribe',
      address: `voice:${row.id}`,
      success: false,
    });
    await markFailed(supabase, row.id, `whisper: ${msg}`, logger);
    logger.warn('whisper call failed', { media_id: row.id, error: msg });
    return { mediaId: row.id, status: 'failed', error: msg };
  }

  // 6. Compute cost. duration_seconds is the source of truth from
  //    the mobile recorder; if missing we fall back to the file
  //    size / 96 kbps heuristic so we still get a reasonable
  //    estimate.
  const seconds =
    row.duration_seconds ??
    (row.file_size_bytes != null
      ? Math.round((row.file_size_bytes * 8) / 96000)
      : 0);
  const minutes = seconds / 60;
  const costUsd = minutes * WHISPER_USD_PER_MINUTE;
  const costCents = Math.round(costUsd * 100);

  // Land on the shared circuit breaker with the explicit costUsd
  // (Whisper bills per-second, not per-token, so the tracker's
  // Sonnet-token math would be wrong).
  tracker.record({
    service: 'whisper-transcribe',
    address: `voice:${row.id}`,
    success: true,
    costUsd,
  });

  const writeErr = await markDone(supabase, row.id, text, costCents);
  if (writeErr) {
    logger.warn('write-back failed', {
      media_id: row.id,
      error: writeErr,
    });
    return {
      mediaId: row.id,
      status: 'failed',
      error: writeErr,
      textLength: text.length,
    };
  }

  logger.info('transcription complete', {
    media_id: row.id,
    text_length: text.length,
    duration_seconds: seconds,
    cost_cents: costCents,
  });

  return {
    mediaId: row.id,
    status: 'done',
    costCents,
    textLength: text.length,
  };
}

// ── Watchdog sweep ────────────────────────────────────────────────────────────

async function sweepWatchdog(
  supabase: SupabaseClient,
  logger: ProcessLogger
): Promise<void> {
  const cutoff = new Date(Date.now() - WATCHDOG_MS).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('field_media')
    .update({
      transcription_status: 'queued',
      transcription_error: 'watchdog: re-queued after stale running',
    })
    .lt('transcription_started_at', cutoff)
    .eq('transcription_status', 'running')
    .select('id');
  if (error) {
    logger.warn('watchdog sweep failed', { error: error.message });
    return;
  }
  const swept = (data as Array<{ id: string }> | null)?.length ?? 0;
  if (swept > 0) {
    logger.info('watchdog re-queued stale rows', { count: swept });
  }
}

// ── Claim row (race-safe) ────────────────────────────────────────────────────

/**
 * Roll a `transcription_status='running'` row back to `'queued'`.
 * Used when the AI-usage tracker breaker flips open after we've
 * claimed the row but before we've called Whisper. Don't markFailed —
 * the breaker is a transient soft-stop; the next batch will pick the
 * row up.
 */
async function releaseClaim(
  supabase: SupabaseClient,
  mediaId: string,
  logger: ProcessLogger
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('field_media')
    .update({
      transcription_status: 'queued',
      transcription_started_at: null,
    })
    .eq('id', mediaId)
    .eq('transcription_status', 'running');
  if (error) {
    logger.warn('releaseClaim failed', {
      media_id: mediaId,
      error: error.message,
    });
  }
}

async function claimRow(
  supabase: SupabaseClient,
  mediaId: string,
  startedAt: string,
  logger: ProcessLogger
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('field_media')
      .update({
        transcription_status: 'running',
        transcription_started_at: startedAt,
      })
      .eq('id', mediaId)
      .eq('transcription_status', 'queued')
      .select('id')
      .single();
    if (error) {
      // PGRST116 = "no rows" — typical lost-race, not an error.
      if (error.code !== 'PGRST116') {
        logger.warn('claim failed', { media_id: mediaId, error: error.message });
      }
      return false;
    }
    return !!data;
  } catch (err) {
    logger.warn('claim threw', {
      media_id: mediaId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ── Mark done / failed ───────────────────────────────────────────────────────

async function markDone(
  supabase: SupabaseClient,
  mediaId: string,
  text: string,
  costCents: number
): Promise<string | null> {
  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('field_media')
    .update({
      transcription: text,
      transcription_status: 'done',
      transcription_completed_at: nowIso,
      transcription_cost_cents: costCents,
      transcription_error: null,
    })
    .eq('id', mediaId);
  return error?.message ?? null;
}

async function markFailed(
  supabase: SupabaseClient,
  mediaId: string,
  errorMessage: string,
  logger: ProcessLogger
): Promise<void> {
  const nowIso = new Date().toISOString();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('field_media')
      .update({
        transcription_status: 'failed',
        transcription_error: errorMessage.slice(0, 2000),
        transcription_completed_at: nowIso,
      })
      .eq('id', mediaId);
    if (error) {
      logger.warn('markFailed write failed', {
        media_id: mediaId,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn('markFailed threw', {
      media_id: mediaId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
