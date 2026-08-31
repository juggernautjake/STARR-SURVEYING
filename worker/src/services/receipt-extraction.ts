// worker/src/services/receipt-extraction.ts
//
// Phase F2 #4 — Claude Vision extraction for receipts captured by the
// Starr Field mobile app. Per STARR_FIELD_MOBILE_APP_PLAN.md §5.11:
//
//   1. Mobile snaps a receipt → uploads to starr-field-receipts bucket
//      → INSERTs receipts row with status='pending',
//      extraction_status='queued', photo_url='{user_id}/{receipt_id}.jpg'.
//   2. This worker polls for queued rows, marks each 'running', fetches
//      the photo via signed URL, calls Claude Vision with the receipt-
//      extraction prompt, parses the JSON response, and UPDATEs the row.
//   3. Mobile useReceipts() reflects the updated fields within ms via
//      PowerSync.
//
// Cost attribution: every Vision call goes through getGlobalAiTracker()
// per the plan's shared-cap rule (§11). Per-call cost lands on the
// receipt row's extraction_cost_cents column for per-receipt audit.
//
// Failure modes:
//   - Circuit breaker open (cost ceiling, consecutive failures) →
//     leaves the row 'queued' so the next poll retries when the
//     window resets.
//   - Vision API error → marks 'failed' with extraction_error;
//     mobile surfaces "Needs your input" and the user fills out
//     fields manually.
//   - JSON parse error → same 'failed' path. The raw model output
//     is stored in extraction_error for debugging.
//
// Process model: a single shot processes up to BATCH_SIZE rows in
// sequence, awaiting each Vision call. The caller (CLI or scheduler)
// drives the loop frequency; we do NOT spawn parallel workers because
// the AI tracker's circuit breaker is a process-local singleton.

import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getGlobalAiTracker } from '../lib/ai-usage-tracker.js';
// R4b's last entry. This batch has no research run to belong to — see `recordOpsAiCall`, which gives
// it its own accounting key rather than borrowing a project id it would misattribute.
import { recordOpsAiCall, priceCall } from '../infra/usage.js';
import { samplingFor } from '../infra/model-sampling.js';
// ── THE PROMPT AND THE PARSER LIVE IN `-core` NOW (2026-08-11) ────────────────────────────────────
//
// Not a tidy-up. The web app has to be able to run this same extraction — on Vercel nothing runs the
// CLI below, so every receipt uploaded from the website sat 'queued' forever — and it cannot import
// THIS file, because `../infra/usage.js` reaches `services/pipeline.js` and drags the whole research
// pipeline (Playwright, Browserbase, BullMQ) with it.
//
// The obvious alternative, a second prompt on the web side, is the worse bug: two prompts drift
// silently, both keep returning plausible JSON, and the only symptom is that the books disagree
// depending on which door a receipt came in through. So the dependency-free half moved out and both
// runners import it. See `lib/receipts/extract.ts` for the web-side runner.
import {
  RECEIPTS_BUCKET as BUCKET,
  VISION_MODEL,
  MAX_TOKENS,
  STALE_RUNNING_MS,
  EXTRACTION_PROMPT,
  buildReceiptUpdate,
  computeDedupFingerprint,
  mediaTypeForPath,
  parseExtraction,
  type ExtractedReceipt,
  type ExtractionResult,
  type ReceiptCurrentSnapshot,
} from './receipt-extraction-core.js';

// Re-exported so existing importers of this module keep working unchanged.
export { computeDedupFingerprint };
export type { ExtractionResult };

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default batch size when caller doesn't pass one. */
const DEFAULT_BATCH_SIZE = 10;
// PRICING LIVED HERE, AND IT WAS THE THIRD COPY.
//
// This file used to carry `INPUT_PRICE_PER_MTOK = 3.0` / `OUTPUT_PRICE_PER_MTOK = 15.0` beside a
// comment admitting the ai-usage-tracker singleton uses *its own averaged constant* — two numbers
// for one question, and `infra/usage.ts`'s MODEL_PRICING is a third. They agree today. They agree
// only until Anthropic changes a rate, at which point the per-receipt `extraction_cost_cents` write
// silently keeps billing yesterday's price, and nothing fails.
//
// `priceCall` is now the single source, so this file is priced by the same table as everything else
// and a rate change is one edit. The figure is unchanged today — MODEL_PRICING prices
// `claude-sonnet-4-5` at exactly $3/$15 per MTok — so this is a de-duplication, not a re-pricing.

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Subset of receipt columns the worker reads + writes. Matches the
 * shape in seeds/220_starr_field_receipts.sql and mobile/lib/db/schema.ts.
 */
interface ReceiptRow {
  id: string;
  user_id: string;
  photo_url: string;
  extraction_status: string | null;
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Process up to `batchSize` queued receipts for the current process.
 * Returns one ExtractionResult per row attempted (skipped rows are not
 * included). Caller logs the summary; this function does not throw on
 * per-row failures — those land in the `failed` status on the row.
 *
 * Throws only on infrastructure failures (no Supabase, no Anthropic key).
 */
export async function processQueuedReceipts(
  supabase: SupabaseClient,
  options: { batchSize?: number; logger?: ProcessLogger } = {}
): Promise<ExtractionResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not set — cannot run Claude Vision extraction.'
    );
  }
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const logger = options.logger ?? defaultLogger;

  // Pull a batch of rows that need extraction. Worth-doing-now =
  // 'queued' OR (status='running' AND started_at older than the
  // watchdog window, i.e. crashed mid-extraction). claimRow() repeats
  // the same predicate atomically so two workers can't both grab the
  // same row.
  //
  // The timestamp inside `.or()` MUST be wrapped in double quotes —
  // PostgREST's logic-tree parser uses commas / parens / dots as
  // separators and the colons in an ISO-8601 string can confuse it
  // when nested under and(...). Quoting forces the value to be
  // treated as a literal.
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  const { data: rows, error: fetchErr } = await supabase
    .from('receipts')
    .select('id, user_id, photo_url, extraction_status, extraction_started_at')
    .or(
      `extraction_status.eq.queued,and(extraction_status.eq.running,extraction_started_at.lt."${staleBefore}")`
    )
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (fetchErr) {
    throw new Error(`receipts fetch failed: ${fetchErr.message}`);
  }
  if (!rows || rows.length === 0) {
    logger.info('no queued receipts', {});
    return [];
  }

  logger.info('processing batch', { count: rows.length });
  const client = new Anthropic({ apiKey });
  const tracker = getGlobalAiTracker();
  const results: ExtractionResult[] = [];

  for (const row of rows as ReceiptRow[]) {
    // Coarse gate at the loop top — bail early when the breaker is
    // already open. The fine-grained gate inside processOne re-checks
    // immediately before the Vision call so cost ceilings are
    // respected even after a slow photo download.
    const gate = tracker.canMakeCall();
    if (!gate.allowed) {
      logger.warn('circuit open, leaving row queued', {
        receipt_id: row.id,
        reason: gate.reason,
      });
      break;
    }

    const result = await processOne(supabase, client, tracker, row, logger);
    results.push(result);
  }

  return results;
}

// ── Per-receipt extraction ────────────────────────────────────────────────────

async function processOne(
  supabase: SupabaseClient,
  client: Anthropic,
  tracker: ReturnType<typeof getGlobalAiTracker>,
  row: ReceiptRow,
  logger: ProcessLogger
): Promise<ExtractionResult> {
  const startedAt = new Date().toISOString();

  // 1. Atomically claim the row. The UPDATE only succeeds when the
  //    extraction_status is still 'queued' OR is a stale 'running'
  //    older than the watchdog window. Two workers racing here: only
  //    one's UPDATE sees a row in the eligible state; the other gets
  //    zero rows back and bails out — preventing duplicate Vision
  //    spend AND duplicate line_items writes.
  const claimed = await claimRow(supabase, row.id, startedAt, logger);
  if (!claimed) {
    logger.info('row already claimed by another worker — skipping', {
      receipt_id: row.id,
    });
    return {
      receiptId: row.id,
      status: 'failed',
      error: 'already claimed',
    };
  }

  // 2. Pull the photo from the private bucket (service-role download
  //    bypasses signed-URL machinery).
  let imageBuffer: Buffer;
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  try {
    const fetched = await downloadReceiptPhoto(supabase, row.photo_url);
    imageBuffer = fetched.buffer;
    mediaType = fetched.mediaType;
  } catch (err) {
    // Photo missing / permission denied: terminal. We do NOT record
    // a Vision-call failure here — the breaker tracks AI spend, not
    // storage outages. A run of bad photos shouldn't open the AI gate.
    const msg = err instanceof Error ? err.message : String(err);
    await markFailed(supabase, row.id, `photo fetch: ${msg}`, logger);
    return { receiptId: row.id, status: 'failed', error: msg };
  }

  // 3. Re-check the gate immediately before the Vision call. Photo
  //    download might have taken seconds; another row in the batch
  //    could have just opened the breaker. Without this check, we
  //    might spend on a call we should have skipped.
  const gate = tracker.canMakeCall();
  if (!gate.allowed) {
    // Roll the row back to 'queued' so the next batch retries. Don't
    // mark 'failed' — the breaker is a transient soft-stop.
    await releaseClaim(supabase, row.id, logger);
    logger.warn('circuit open after photo fetch — releasing row', {
      receipt_id: row.id,
      reason: gate.reason,
    });
    return {
      receiptId: row.id,
      status: 'failed',
      error: gate.reason ?? 'circuit open',
    };
  }

  // 4. Call Claude Vision.
  let extracted: ExtractedReceipt;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const response = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: MAX_TOKENS,
      ...samplingFor(VISION_MODEL),
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBuffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text:
                'Extract the receipt fields per the JSON schema in your system instructions. ' +
                'Return ONLY the JSON object — no prose, no code fences.',
            },
          ],
        },
      ],
    });
    inputTokens = response.usage.input_tokens;
    outputTokens = response.usage.output_tokens;
    const textBlock = response.content.find((c) => c.type === 'text');
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    extracted = parseExtraction(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markFailed(supabase, row.id, `vision: ${msg}`, logger);
    tracker.record({
      service: 'vision-ocr',
      address: `receipt:${row.id}`,
      success: false,
    });
    logger.warn('vision call failed', {
      receipt_id: row.id,
      error: msg,
    });
    return { receiptId: row.id, status: 'failed', error: msg };
  }

  // 4. Compute cost in cents and write back.
  const costUsd = priceCall(VISION_MODEL, { input: inputTokens, output: outputTokens });
  const costCents = Math.round(costUsd * 100);

  // The ledger entry. Not fatal and not awaited into the critical path: an extraction a bookkeeper
  // is waiting on must not fail because a usage row would not save. `recordOpsAiCall` keys it as ops
  // spend, so it can never be counted against a research run's ceiling or a customer's bill.
  void recordOpsAiCall('receipt-extraction', VISION_MODEL, { input: inputTokens, output: outputTokens }, {
    receipt_id: row.id,
  });

  tracker.record({
    service: 'vision-ocr',
    address: `receipt:${row.id}`,
    success: true,
    inputTokens,
    outputTokens,
  });

  const writeErr = await markDone(supabase, row, extracted, costCents);
  if (writeErr) {
    logger.warn('write-back failed', {
      receipt_id: row.id,
      error: writeErr,
    });
    return {
      receiptId: row.id,
      status: 'failed',
      error: writeErr,
      costCents,
    };
  }

  logger.info('extracted', {
    receipt_id: row.id,
    vendor: extracted.vendor_name,
    total_cents: extracted.total_cents,
    category: extracted.category,
    cost_cents: costCents,
  });
  return { receiptId: row.id, status: 'done', costCents };
}

// ── DB writes ─────────────────────────────────────────────────────────────────

/**
 * Atomically claim a receipt row for extraction. Returns true when
 * THIS worker won the race; false when another worker beat us to it
 * (or the row state changed in some other way).
 *
 * The UPDATE clause is `WHERE id = ? AND (extraction_status = 'queued'
 * OR (extraction_status = 'running' AND extraction_started_at < stale_threshold))`.
 * Postgres serialises the UPDATE; only one transaction can flip a
 * given row, so the .select() return shape is the source of truth.
 */
async function claimRow(
  supabase: SupabaseClient,
  receiptId: string,
  startedAt: string,
  logger: ProcessLogger
): Promise<boolean> {
  // ── The `.or()` version of this claim never claimed anything (2026-08-13) ─────────────────────
  //
  // It read: `.update({…}).eq('id', …).or('extraction_status.eq.queued,and(…)')`, and PostgREST
  // rejects an `.or()` filter on an UPDATE to this table with `column receipts.extraction_status
  // does not exist` — while the identical filter on a SELECT matches the row. The error was then
  // "treated as a lost race", so the failure was indistinguishable from healthy contention and the
  // worker silently skipped every receipt it was given.
  //
  // Same defect and same fix as `lib/receipts/extract.ts`, which is the path production actually
  // runs; this copy is corrected too so the worker does not reintroduce the symptom the day somebody
  // starts running it.
  //
  // Eligibility is decided here and the UPDATE carries a single equality on the status just read —
  // still a compare-and-set, so a racing writer still makes this return false.
  const { data: cur, error: readErr } = await supabase
    .from('receipts')
    .select('extraction_status, extraction_started_at')
    .eq('id', receiptId)
    .maybeSingle();
  if (readErr || !cur) return false;

  const curStatus = (cur as { extraction_status: string | null }).extraction_status;
  const curStarted = (cur as { extraction_started_at: string | null }).extraction_started_at;
  const staleRunning =
    curStatus === 'running'
    && (!curStarted || Date.now() - new Date(curStarted).getTime() > STALE_RUNNING_MS);
  if (!(curStatus === null || curStatus === 'queued' || curStatus === 'failed' || staleRunning)) {
    return false;
  }

  let claimQuery = supabase
    .from('receipts')
    .update({
      extraction_status: 'running',
      extraction_started_at: startedAt,
    })
    .eq('id', receiptId);
  // `= NULL` is never true, so a NULL status needs `.is` or the claim refuses the rows that most
  // need claiming — the ones no extractor has ever touched.
  claimQuery = curStatus === null
    ? claimQuery.is('extraction_status', null)
    : claimQuery.eq('extraction_status', curStatus);
  const { data, error } = await claimQuery.select('id');

  if (error) {
    // DB error — treat as a lost race so the worker bails for this
    // row, but log the message so ops can distinguish a genuine
    // outage ("row not lost — Postgres is down") from a contention
    // loss ("another worker already grabbed it"). Without the log,
    // a Supabase outage manifests as silent skipped batches.
    logger.warn('claimRow error treated as lost race', {
      receipt_id: receiptId,
      error: error.message,
      code: (error as { code?: string }).code ?? null,
    });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Roll a row back to 'queued' so a future poll retries it. Used when
 * the breaker opens after we've already claimed but before we made
 * the Vision call — we don't want to leave the row stuck 'running'
 * for the watchdog window.
 */
async function releaseClaim(
  supabase: SupabaseClient,
  receiptId: string,
  logger: ProcessLogger
): Promise<void> {
  const { error } = await supabase
    .from('receipts')
    .update({
      extraction_status: 'queued',
      extraction_started_at: null,
    })
    .eq('id', receiptId)
    .eq('extraction_status', 'running');
  // Log but don't throw — the row stays 'running' until the watchdog
  // picks it back up. Without this log a Supabase outage during
  // release manifests as silently-stuck rows.
  if (error) {
    logger.warn('releaseClaim failed', {
      receipt_id: receiptId,
      error: error.message,
    });
  }
}

async function markFailed(
  supabase: SupabaseClient,
  receiptId: string,
  errorMessage: string,
  logger: ProcessLogger
): Promise<void> {
  const { error } = await supabase
    .from('receipts')
    .update({
      extraction_status: 'failed',
      extraction_completed_at: new Date().toISOString(),
      extraction_error: errorMessage.slice(0, 1000),
    })
    .eq('id', receiptId);
  // If markFailed itself fails, the row stays 'running' until the
  // watchdog reclaims, AND the user sees no extraction error message.
  // Log the meta-failure so ops can correlate.
  if (error) {
    logger.warn('markFailed write failed', {
      receipt_id: receiptId,
      original_error: errorMessage.slice(0, 200),
      write_error: error.message,
    });
  }
}

async function markDone(
  supabase: SupabaseClient,
  row: ReceiptRow,
  extracted: ExtractedReceipt,
  costCents: number
): Promise<string | null> {
  const completedAt = new Date().toISOString();

  // Re-fetch the row before writing so we can fill ONLY fields the
  // user (or bookkeeper) hasn't already edited. Without this, a user
  // editing during the queued→running window has their input
  // clobbered when extraction completes. Per-field source tracking
  // would be cleaner; for v1 the COALESCE-on-null heuristic preserves
  // explicit edits at the cost of overwriting empty re-extractions.
  const { data: current, error: readErr } = await supabase
    .from('receipts')
    .select(
      'vendor_name, vendor_address, transaction_at, subtotal_cents, ' +
        'tax_cents, tip_cents, total_cents, payment_method, payment_last4, ' +
        'category, category_source, tax_deductible_flag, notes'
    )
    .eq('id', row.id)
    .single();
  if (readErr) return `read-back failed: ${readErr.message}`;

  const cur = (current ?? {}) as Partial<ReceiptCurrentSnapshot>;
  // The merge rules (fill-if-empty, and never overwrite a human's category) now live in
  // `receipt-extraction-core` so the web-side runner applies exactly the same ones. They are the
  // part that decides whether a bookkeeper's typed correction survives the AI's answer, which is
  // precisely the behaviour that must not depend on which door the receipt came in through.
  const update = buildReceiptUpdate(cur, extracted, costCents, completedAt);

  // Duplicate detection (Batch Z) — compute the fingerprint from the
  // post-extraction values (preferring user edits via the same
  // COALESCE-on-null heuristic markDone uses for the writes above).
  // Then look up a prior non-rejected receipt for the same user with
  // the same fingerprint. If found, set dedup_match_id so the mobile
  // detail screen surfaces a duplicate-warning card; the user makes
  // the keep / discard call. We do NOT auto-discard — two $5 coffees
  // on the same day are legit.
  //
  // Done in the worker rather than the mobile insert path because:
  //   - The fingerprint depends on AI-extracted vendor + total + date,
  //     none of which are known at insert time.
  //   - Server-side computation guarantees consistent normalization
  //     across devices (no "phone A normalized 'LOWE'S' differently
  //     than phone B").
  const fingerprint = computeDedupFingerprint(
    (update.vendor_name as string | null | undefined) ?? cur.vendor_name ?? null,
    (update.total_cents as number | null | undefined) ?? cur.total_cents ?? null,
    (update.transaction_at as string | null | undefined) ??
      cur.transaction_at ??
      null
  );
  if (fingerprint) {
    update.dedup_fingerprint = fingerprint;
    const { data: matches, error: dupErr } = await supabase
      .from('receipts')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('dedup_fingerprint', fingerprint)
      .neq('id', row.id)
      .neq('status', 'rejected')
      .order('created_at', { ascending: true })
      .limit(1);
    if (dupErr) {
      // Non-fatal — log + continue. Worse case the user reviews a
      // possible-duplicate without the warning card.
      // (Worker logger isn't in scope here; the caller's logger
      //  already wraps markDone failures.)
    } else if (matches && matches.length > 0) {
      update.dedup_match_id = (matches[0] as { id: string }).id;
    }
  }

  const { error: updateErr } = await supabase
    .from('receipts')
    .update(update)
    .eq('id', row.id);

  if (updateErr) return updateErr.message;

  // Replace any previous line items (re-extraction would otherwise
  // duplicate). Receipt is the parent; ON DELETE CASCADE in the seed
  // would also handle this if we soft-deleted, but for re-extraction
  // we want the parent to stay.
  const { error: deleteErr } = await supabase
    .from('receipt_line_items')
    .delete()
    .eq('receipt_id', row.id);
  if (deleteErr) return `line-items clear: ${deleteErr.message}`;

  if (extracted.line_items.length > 0) {
    const rows = extracted.line_items.map((li, idx) => ({
      receipt_id: row.id,
      description: li.description,
      amount_cents: li.amount_cents,
      quantity: li.quantity,
      position: idx,
    }));
    const { error: insertErr } = await supabase
      .from('receipt_line_items')
      .insert(rows);
    if (insertErr) return `line-items insert: ${insertErr.message}`;
  }

  return null;
}

// ── Photo download ────────────────────────────────────────────────────────────

interface DownloadedPhoto {
  buffer: Buffer;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

async function downloadReceiptPhoto(
  supabase: SupabaseClient,
  storagePath: string
): Promise<DownloadedPhoto> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error('storage returned no data');

  // Supabase JS returns a Blob in Node 18+; convert to Buffer for the
  // base64 encode below.
  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Best-guess media_type from the path extension, shared with the web runner so both coerce the
  // same way. The mobile capture path always writes .jpg, but the bucket allows png/webp too.
  return { buffer, mediaType: mediaTypeForPath(storagePath) as DownloadedPhoto['mediaType'] };
}

// ── Logging ───────────────────────────────────────────────────────────────────

interface ProcessLogger {
  info(message: string, fields: Record<string, unknown>): void;
  warn(message: string, fields: Record<string, unknown>): void;
}

const defaultLogger: ProcessLogger = {
  info: (msg, fields) => {
    console.log(`[receipt-extraction] ${msg}`, fields);
  },
  warn: (msg, fields) => {
    console.warn(`[receipt-extraction] ${msg}`, fields);
  },
};

