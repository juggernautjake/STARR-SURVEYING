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

// ── Constants ─────────────────────────────────────────────────────────────────

const BUCKET = 'starr-field-receipts';
/** Per plan §5.11.2: Claude Sonnet 4.6 for receipt extraction.
 *  The default below is the 4.5 model id — bump when 4.6 ships and is
 *  available. STARR_FIELD_VISION_MODEL overrides without redeploying. */
const VISION_MODEL = process.env.STARR_FIELD_VISION_MODEL ?? 'claude-sonnet-4-5-20250929';
/** Cap per single extraction shot — receipts are short, no tool use. */
const MAX_TOKENS = 2048;
/** Default batch size when caller doesn't pass one. */
const DEFAULT_BATCH_SIZE = 10;
/** Sonnet 4.5/4.6 input pricing snapshot: $3/MTok in, $15/MTok out.
 *  Used for the per-receipt `extraction_cost_cents` write. The
 *  ai-usage-tracker singleton uses its own averaged constant for the
 *  circuit breaker — close enough for breaker-decision purposes; the
 *  per-row spend recorded here is the authoritative number for
 *  bookkeeping. */
const INPUT_PRICE_PER_MTOK = 3.0;
const OUTPUT_PRICE_PER_MTOK = 15.0;

/** Watchdog window for crashed-worker detection. A row sitting in
 *  'running' state longer than this is considered abandoned and is
 *  eligible for re-claim by a different worker. Five minutes is
 *  generous — typical Vision calls complete in <10 s. */
const STALE_RUNNING_MS = 5 * 60 * 1000;

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

/** Fields the worker reads back before deciding what to overwrite —
 *  see markDone(). Names match the column list in the .select() call. */
interface ReceiptCurrentSnapshot {
  vendor_name: string | null;
  vendor_address: string | null;
  transaction_at: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  tip_cents: number | null;
  total_cents: number | null;
  payment_method: string | null;
  payment_last4: string | null;
  category: string | null;
  category_source: string | null;
  tax_deductible_flag: string | null;
  notes: string | null;
}

/**
 * Write `value` into `update[key]` only when the current row already
 * has that field empty (NULL or empty string). Preserves any explicit
 * edits made by the mobile owner or the bookkeeper between
 * 'queued' and 'done'.
 */
function fillIfEmpty<K extends keyof ReceiptCurrentSnapshot>(
  update: Record<string, unknown>,
  current: Partial<ReceiptCurrentSnapshot>,
  key: K,
  value: ReceiptCurrentSnapshot[K] | null
): void {
  if (value === null || value === undefined) return;
  const existing = current[key];
  const isEmpty =
    existing === null || existing === undefined || existing === '';
  if (isEmpty) update[key] = value;
}

/** Plan §5.11.2 categories — must stay in sync with mobile RECEIPT_CATEGORIES. */
const CATEGORIES = [
  'fuel',
  'meals',
  'supplies',
  'equipment',
  'tolls',
  'parking',
  'lodging',
  'professional_services',
  'office_supplies',
  'client_entertainment',
  'other',
] as const;
type Category = (typeof CATEGORIES)[number];

interface ExtractedReceipt {
  vendor_name: string | null;
  vendor_address: string | null;
  /** ISO-8601 with TZ offset when the photo includes time of day. */
  transaction_at: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  tip_cents: number | null;
  total_cents: number | null;
  payment_method: string | null;
  payment_last4: string | null;
  category: Category | null;
  tax_deductible_flag: 'full' | 'partial_50' | 'none' | 'review' | null;
  line_items: Array<{
    description: string | null;
    amount_cents: number | null;
    quantity: number | null;
  }>;
  /** Free-form per-field 0..1 confidence Claude reports for itself. */
  confidence: Record<string, number>;
}

export interface ExtractionResult {
  receiptId: string;
  status: 'done' | 'failed';
  error?: string;
  costCents?: number;
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
      temperature: 0,
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
  const costUsd =
    (inputTokens / 1_000_000) * INPUT_PRICE_PER_MTOK +
    (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_MTOK;
  const costCents = Math.round(costUsd * 100);

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
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  // The PostgREST `.or()` filter inside an UPDATE+select gives us the
  // atomic claim semantics we need. If no row matches the predicate
  // (because another worker already flipped it), the result data is
  // empty and we know we lost. The timestamp is wrapped in double
  // quotes per PostgREST's logic-tree escaping (the colons in an
  // ISO-8601 string can confuse the parser otherwise).
  const { data, error } = await supabase
    .from('receipts')
    .update({
      extraction_status: 'running',
      extraction_started_at: startedAt,
    })
    .eq('id', receiptId)
    .or(`extraction_status.eq.queued,and(extraction_status.eq.running,extraction_started_at.lt."${staleBefore}")`)
    .select('id');

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
  const update: Record<string, unknown> = {
    ai_confidence_per_field: extracted.confidence,
    extraction_status: 'done',
    extraction_completed_at: completedAt,
    extraction_error: null,
    extraction_cost_cents: costCents,
  };

  fillIfEmpty(update, cur, 'vendor_name', extracted.vendor_name);
  fillIfEmpty(update, cur, 'vendor_address', extracted.vendor_address);
  fillIfEmpty(update, cur, 'transaction_at', extracted.transaction_at);
  fillIfEmpty(update, cur, 'subtotal_cents', extracted.subtotal_cents);
  fillIfEmpty(update, cur, 'tax_cents', extracted.tax_cents);
  fillIfEmpty(update, cur, 'tip_cents', extracted.tip_cents);
  fillIfEmpty(update, cur, 'total_cents', extracted.total_cents);
  fillIfEmpty(update, cur, 'payment_method', extracted.payment_method);
  fillIfEmpty(update, cur, 'payment_last4', extracted.payment_last4);
  fillIfEmpty(update, cur, 'tax_deductible_flag', extracted.tax_deductible_flag);

  // Category is special: only fill when no human (mobile owner OR
  // bookkeeper) has touched it. category_source tracks who set it.
  if (extracted.category && cur.category_source !== 'user') {
    update.category = extracted.category;
    update.category_source = 'ai';
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

  // Best-guess media_type from the path extension. The mobile capture
  // path always writes .jpg, but the storage bucket allows png/heic/
  // webp too — we coerce to one of Vision's supported types.
  const lower = storagePath.toLowerCase();
  let mediaType: DownloadedPhoto['mediaType'] = 'image/jpeg';
  if (lower.endsWith('.png')) mediaType = 'image/png';
  else if (lower.endsWith('.webp')) mediaType = 'image/webp';

  return { buffer, mediaType };
}

// ── JSON parsing ──────────────────────────────────────────────────────────────

function parseExtraction(raw: string): ExtractedReceipt {
  // Strip code fences if Claude added them despite the instruction.
  const jsonText = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `model returned non-JSON: ${(err as Error).message}; first 200 chars: ${jsonText.slice(0, 200)}`
    );
  }
  if (!isObject(parsed)) {
    throw new Error('model returned non-object JSON');
  }

  return {
    vendor_name: trimOrNull(parsed.vendor_name),
    vendor_address: trimOrNull(parsed.vendor_address),
    transaction_at: normalizeIsoOrNull(parsed.transaction_at),
    subtotal_cents: nonNegIntOrNull(parsed.subtotal_cents),
    tax_cents: nonNegIntOrNull(parsed.tax_cents),
    tip_cents: nonNegIntOrNull(parsed.tip_cents),
    total_cents: nonNegIntOrNull(parsed.total_cents),
    payment_method: trimOrNull(parsed.payment_method),
    payment_last4: digits4OrNull(parsed.payment_last4),
    category: enumOrNull(parsed.category, CATEGORIES),
    tax_deductible_flag: enumOrNull(parsed.tax_deductible_flag, [
      'full',
      'partial_50',
      'none',
      'review',
    ] as const),
    line_items: Array.isArray(parsed.line_items)
      ? parsed.line_items
          .filter((li: unknown): li is Record<string, unknown> => isObject(li))
          .map((li) => ({
            description: trimOrNull(li.description),
            amount_cents: nonNegIntOrNull(li.amount_cents),
            quantity: typeof li.quantity === 'number' ? li.quantity : null,
          }))
      : [],
    confidence: isObject(parsed.confidence) ? (parsed.confidence as Record<string, number>) : {},
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function nonNegIntOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v);
}

function digits4OrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const digits = v.replace(/\D/g, '').slice(-4);
  return digits.length === 4 ? digits : null;
}

function enumOrNull<T extends string>(
  v: unknown,
  allowed: ReadonlyArray<T>
): T | null {
  if (typeof v !== 'string') return null;
  return allowed.includes(v as T) ? (v as T) : null;
}

function normalizeIsoOrNull(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
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

// ── Prompt ────────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a receipt-field extractor for Starr Surveying's bookkeeping pipeline.

The user has uploaded a photo of a paper receipt (gas station, hardware store, restaurant, hotel, etc.). Read it and return ONLY a JSON object with exactly these keys:

{
  "vendor_name":          string | null,    // Business name as printed
  "vendor_address":       string | null,    // Street address line if visible
  "transaction_at":       string | null,    // ISO-8601 if date+time visible (e.g. "2026-04-26T14:35:00-05:00"); date-only if no time ("2026-04-26"); null if illegible
  "subtotal_cents":       int | null,       // Pre-tax pre-tip subtotal in cents
  "tax_cents":            int | null,       // Sales tax in cents
  "tip_cents":            int | null,       // Tip / gratuity in cents (restaurants only; null for retail)
  "total_cents":          int | null,       // Grand total in cents
  "payment_method":       string | null,    // 'card' | 'cash' | 'check' | 'other' or null if unclear
  "payment_last4":        string | null,    // Last 4 of card number, digits only; null if not visible
  "category":             string | null,    // EXACTLY one of: fuel, meals, supplies, equipment, tolls, parking, lodging, professional_services, office_supplies, client_entertainment, other
  "tax_deductible_flag":  string | null,    // EXACTLY one of: full, partial_50, none, review
  "line_items": [
    { "description": string | null, "amount_cents": int | null, "quantity": number | null }
  ],
  "confidence": {
    "vendor_name":  0..1,
    "total_cents":  0..1,
    "category":     0..1
    // ...one entry per field you populated; omit fields you set to null
  }
}

Rules:
- Currency is USD. Convert all dollar amounts to integer cents (e.g. $42.18 → 4218). Round to the nearest cent.
- If a field is illegible, blurry, or genuinely missing from the receipt, return null for it. Do NOT guess.
- Category guidelines:
    * fuel              — gas pump, fuel cards
    * meals             — restaurants, take-out, drinks at a counter
    * supplies          — hardware store, paint, lumber, consumable field gear
    * equipment         — durable goods over ~$200 (tools, instruments)
    * tolls             — toll plaza, EZ-Tag
    * parking           — meters, lots, garage
    * lodging           — hotels, motels, Airbnb
    * professional_services — surveyors, lawyers, contractors
    * office_supplies   — paper, ink, office consumables
    * client_entertainment — non-meal client gifts/events
    * other             — fallback when none of the above clearly fit
- tax_deductible_flag guidance (best-effort; bookkeeper has final say):
    * full         — fuel, supplies under $2,500, tolls, parking, lodging
    * partial_50   — meals (IRS 50% rule for 2026)
    * none         — client_entertainment (post-2018), personal items
    * review       — equipment over $2,500 (capitalisation question), anything ambiguous
- The "confidence" object: report 0..1 for each populated field. 1.0 = printed and clearly readable; 0.5 = inferred or partial; 0.2 = best-guess. Skip fields you set to null.
- DO NOT wrap your response in markdown code fences. Return raw JSON only.
`;
