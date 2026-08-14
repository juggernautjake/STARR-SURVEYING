// lib/receipts/extract.ts — run Claude Vision over a receipt, from the web app.
//
// WHY THIS FILE EXISTS AT ALL
//
// The extraction was written once, in `worker/src/services/receipt-extraction.ts`, and driven by a
// CLI meant for a droplet: `node dist/cli/extract-receipts.js --watch`. Production is Vercel, where
// no such process runs. So every receipt uploaded through the website was inserted with
// `extraction_status = 'queued'` and then sat there — indefinitely, silently, with the queue's own
// UI cheerfully reporting "AI working…" about a worker that was never going to arrive.
//
// The AI was not misconfigured. It was **unreachable**, which looks identical from the outside and
// is this codebase's signature defect: authored, tested, and never wired to anything a person can
// touch. Owner, 2026-08-11: *"Let's make sure that AI is actually fully hooked up to the receipt
// recording/analysis section."*
//
// THREE WAYS IN, ONE EXTRACTOR
//
//   1. Straight after an upload — the capture page fires this per receipt (see the route).
//   2. A "Run AI" button on any row in the bookkeeper queue, including ones that already failed.
//   3. `/api/cron/receipt-extraction`, nightly, which sweeps anything the first two missed.
//
// All three call `extractReceipt` here, which shares its prompt, parser and merge rules with the
// worker via `receipt-extraction-core`. The worker CLI still works; it is now one caller of a shared
// extractor rather than the only place the behaviour exists.
//
// WHAT IS DELIBERATELY NOT SHARED WITH THE WORKER
//
// The worker's circuit breaker and its `recordOpsAiCall` ledger live behind `worker/src/infra/
// usage.ts`, which imports the entire research pipeline (Playwright, Browserbase, BullMQ). Pulling
// that into a route handler to get a cost figure is not a trade worth making, so the web path prices
// the call from the same table and writes the same `extraction_cost_cents`, and the per-run AI
// ledger stays a worker concern. The number on the receipt row — the one anybody actually audits —
// is identical either way.

import Anthropic from '@anthropic-ai/sdk';

import { supabaseAdmin } from '@/lib/supabase';
import { matchCardOnFile } from './card-on-file';
import { breakdownCharges } from './charges';
import { reconcileAmounts } from './reconcile';
import { findSamePurchase, type ComparableReceipt } from './same-purchase';
import {
  EXTRACTION_PROMPT,
  MAX_TOKENS,
  RECEIPTS_BUCKET,
  STALE_RUNNING_MS,
  VISION_MODEL,
  buildReceiptUpdate,
  computeDedupFingerprint,
  mediaTypeForPath,
  parseExtraction,
  type ExtractedReceipt,
  type ExtractionResult,
  type ReceiptCurrentSnapshot,
} from '@/worker/src/services/receipt-extraction-core';

/** $/MTok for the vision model. Mirrors `worker/src/infra/usage.ts`'s MODEL_PRICING entry for
 *  claude-sonnet-4-5. Kept as a pair of named constants rather than a lookup because there is
 *  exactly one model on this path, and an unmatched lookup that silently prices at zero is worse
 *  than a constant somebody can see is stale. */
const INPUT_USD_PER_MTOK = 3.0;
const OUTPUT_USD_PER_MTOK = 15.0;

function costCentsFor(inputTokens: number, outputTokens: number): number {
  const usd =
    (inputTokens / 1_000_000) * INPUT_USD_PER_MTOK +
    (outputTokens / 1_000_000) * OUTPUT_USD_PER_MTOK;
  return Math.round(usd * 100);
}

interface ClaimableReceipt {
  id: string;
  user_id: string;
  photo_url: string;
}

export interface ExtractOptions {
  /** Re-run over a receipt that is already `done`. The queue's "Run AI again" button sets this;
   *  the automatic paths never do, so a nightly sweep can't quietly re-bill every receipt. */
  force?: boolean;
}

/**
 * Extract one receipt. Never throws for a per-receipt problem — a bad photo or a model error is
 * recorded on the row as `extraction_status = 'failed'` with a message a person can act on, because
 * the alternative (a 500 from the upload endpoint) loses the receipt entirely.
 *
 * Throws only when the environment cannot do the work at all: no API key.
 */
export async function extractReceipt(
  receiptId: string,
  options: ExtractOptions = {},
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set — receipt extraction cannot run.');
  }

  const { data: row, error: readErr } = await supabaseAdmin
    .from('receipts')
    .select('id, user_id, photo_url, extraction_status')
    .eq('id', receiptId)
    .maybeSingle();
  if (readErr) return { receiptId, status: 'failed', error: readErr.message };
  if (!row) return { receiptId, status: 'failed', error: 'receipt not found' };
  if (!row.photo_url) {
    await markFailed(receiptId, 'receipt has no photo to read');
    return { receiptId, status: 'failed', error: 'receipt has no photo to read' };
  }

  const claimed = await claimRow(receiptId, !!options.force);
  if (!claimed) {
    // Somebody (or something) else is already on it. Not an error: two of the three entry points
    // firing at once is the NORMAL case — the capture page kicks an extraction, and the cron sweep
    // may reach the same row seconds later. Reporting this as a failure would put a red banner on a
    // receipt that is being processed correctly.
    return { receiptId, status: 'skipped', error: 'already being extracted' };
  }

  return runExtraction({
    id: row.id,
    user_id: row.user_id as string,
    photo_url: row.photo_url as string,
  });
}

export interface SweepOptions {
  /**
   * How long the sweep may keep STARTING new extractions, in ms. It always finishes the one it is
   * on, so the real ceiling is this plus one extraction — which is what `RESERVE_MS` reserves for.
   */
  budgetMs?: number;
}

/** Roughly one extraction: photo download + Vision + write-back, with room for a slow one. A sweep
 *  that starts a call it cannot finish gets killed mid-flight and leaves a `running` row for the
 *  stale-reclaim to clean up later — work done and thrown away. */
const RESERVE_MS = 45_000;

/** Default budget. The cron declares `maxDuration = 300`, and the pairing and card sweeps run before
 *  this one, so the extraction phase is given a little under four minutes of it. */
const DEFAULT_BUDGET_MS = 210_000;

/** Fetched per round trip. Not the total — see the loop. */
const PAGE_SIZE = 25;

/** How many rows are still waiting, after a sweep has done what it could. */
export async function countQueuedReceipts(): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  const { count } = await supabaseAdmin
    .from('receipts')
    .select('id', { count: 'exact', head: true })
    .or(
      `extraction_status.eq.queued,extraction_status.is.null,and(extraction_status.eq.running,extraction_started_at.lt."${staleBefore}")`,
    )
    .not('photo_url', 'is', null)
    .is('deleted_at', null);
  return count ?? 0;
}

/**
 * Sweep the queue until it is EMPTY, or until the time budget runs out.
 *
 * ── WHY THIS LOOPS (2026-08-13) ─────────────────────────────────────────────────────────────────
 *
 * It used to fetch one page of `batchSize` rows, extract those, and return. With an hourly cron that
 * made the drain rate 25 receipts per hour: photograph a shoebox of sixty and the last of them is
 * read the morning after. Owner: *"it should work through all queued receipts until it has analyzed
 * all of them."*
 *
 * So it now re-fetches after each page and keeps going while there is work and time. A page is a
 * round trip, not a quota.
 *
 * ── WHY IT IS STILL SEQUENTIAL ──────────────────────────────────────────────────────────────────
 *
 * Twenty concurrent Vision calls is how a sweep turns into a rate-limit wall and marks a pile of
 * perfectly good receipts `failed`. One at a time is slower per batch and finishes more of them.
 * (The capture page still fires its own extraction per receipt the moment each upload lands, so the
 * common case — a few receipts, photographed now — does not wait for this at all.)
 *
 * ── WHY IT CANNOT SPIN ──────────────────────────────────────────────────────────────────────────
 *
 * Three independent stops: rows already seen are never re-processed, a page with nothing new ends
 * the loop, and the budget ends it regardless. A receipt that fails is marked `failed`, and `failed`
 * is not in the fetch predicate — so a permanently bad photo cannot be picked up forever.
 */
export async function sweepQueuedReceipts(
  batchSize = PAGE_SIZE,
  options: SweepOptions = {},
): Promise<ExtractionResult[]> {
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const outOfTime = () => Date.now() - startedAt > budgetMs - RESERVE_MS;

  const results: ExtractionResult[] = [];
  const seen = new Set<string>();

  while (!outOfTime()) {
    const staleBefore = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from('receipts')
      .select('id, user_id, photo_url')
      .or(
        `extraction_status.eq.queued,extraction_status.is.null,and(extraction_status.eq.running,extraction_started_at.lt."${staleBefore}")`,
      )
      .not('photo_url', 'is', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(batchSize);
    if (error) throw new Error(`receipts fetch failed: ${error.message}`);

    // Rows this sweep has already handled are excluded rather than re-claimed. Without it, a row
    // another process is extracting stays in the fetch result and the loop reads the same page
    // forever, doing nothing, until the budget expires.
    const fresh = ((rows ?? []) as ClaimableReceipt[]).filter((r) => !seen.has(r.id));
    if (fresh.length === 0) break;

    for (const row of fresh) {
      seen.add(row.id);
      if (outOfTime()) break;
      if (!(await claimRow(row.id, false))) continue;
      results.push(await runExtraction(row));
    }
  }

  return results;
}

// ── The actual work ─────────────────────────────────────────────────────────────────────────────

async function runExtraction(row: ClaimableReceipt): Promise<ExtractionResult> {
  let imageBase64: string;
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(RECEIPTS_BUCKET)
      .download(row.photo_url);
    if (error) throw error;
    if (!data) throw new Error('storage returned no data');
    imageBase64 = Buffer.from(await data.arrayBuffer()).toString('base64');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markFailed(row.id, `photo fetch: ${msg}`);
    return { receiptId: row.id, status: 'failed', error: msg };
  }

  // A PDF receipt is a legitimate upload the storage bucket accepts, and Vision's image blocks do
  // not take one. Saying so plainly beats sending the bytes and letting the API return something a
  // bookkeeper has to decode.
  if (row.photo_url.toLowerCase().endsWith('.pdf')) {
    const msg = 'PDF receipts are stored but not yet read by the AI — enter the fields by hand.';
    await markFailed(row.id, msg);
    return { receiptId: row.id, status: 'failed', error: msg };
  }

  let extracted: ExtractedReceipt;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
                media_type: mediaTypeForPath(row.photo_url),
                data: imageBase64,
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
    extracted = parseExtraction(textBlock && textBlock.type === 'text' ? textBlock.text : '');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markFailed(row.id, `vision: ${msg}`);
    return { receiptId: row.id, status: 'failed', error: msg };
  }

  const costCents = costCentsFor(inputTokens, outputTokens);
  const writeErr = await writeBack(row, extracted, costCents);
  if (writeErr) {
    await markFailed(row.id, `write-back: ${writeErr}`);
    return { receiptId: row.id, status: 'failed', error: writeErr, costCents };
  }
  return { receiptId: row.id, status: 'done', costCents };
}

/**
 * Claim the row atomically.
 *
 * Two callers racing must produce one winner and one empty result — not two Vision calls billed for
 * the same photo and two sets of line items written over each other. `force` claims regardless of
 * status, which is what the manual "Run AI again" button needs and what nothing automatic may do.
 *
 * ── WHY THIS IS NOT ONE UPDATE WITH AN `.or()` (2026-08-13) ──────────────────────────────────────
 *
 * It was, and **it never claimed anything**. PostgREST rejects an `.or()` filter on an UPDATE to this
 * table with `column receipts.extraction_status does not exist` — the same filter on a SELECT matches
 * the row perfectly. So every claim errored, and `if (error) return false` reported that as "somebody
 * else has it": indistinguishable, from the caller's side, from the healthy race this function exists
 * to handle.
 *
 * The effect was that **no receipt was ever extracted through this path**. An upload sat at `queued`,
 * the hourly cron called `extractReceipt`, the claim silently failed, and the sweep moved on
 * reporting `skipped` — no error, no failed row, no log. Owner, 2026-08-13: *"It stored it, but it
 * did not actually analyze it."* The receipt uploaded that morning had a photo, no cost, no error and
 * no extraction, and the AI had never been called about it.
 *
 * So the eligibility test is now made in code and the UPDATE carries a single equality on the status
 * it read. That is still a compare-and-set and still atomic: if anything moves the row between the
 * read and the write, the equality does not match, the update touches nothing, and this returns
 * false. It gives up the one-round-trip version for a version that works.
 */
async function claimRow(receiptId: string, force: boolean): Promise<boolean> {
  const { data: cur, error: readErr } = await supabaseAdmin
    .from('receipts')
    .select('extraction_status, extraction_started_at')
    .eq('id', receiptId)
    .maybeSingle();
  if (readErr || !cur) return false;

  const status = (cur as { extraction_status: string | null }).extraction_status;
  const startedAt = (cur as { extraction_started_at: string | null }).extraction_started_at;

  // A `running` row whose start is older than the stale window was abandoned mid-flight — a killed
  // lambda leaves one behind — and must be reclaimable, or one crash parks a receipt forever.
  const staleRunning =
    status === 'running'
    && (!startedAt || Date.now() - new Date(startedAt).getTime() > STALE_RUNNING_MS);
  const claimable =
    force || status === null || status === 'queued' || status === 'failed' || staleRunning;
  if (!claimable) return false;

  let q = supabaseAdmin
    .from('receipts')
    .update({ extraction_status: 'running', extraction_started_at: new Date().toISOString() })
    .eq('id', receiptId);
  // The compare half of compare-and-set. `null` needs `.is`, not `.eq` — `= NULL` is never true, so
  // an `.eq` here would silently refuse to claim exactly the rows that most need claiming.
  if (!force) q = status === null ? q.is('extraction_status', null) : q.eq('extraction_status', status);

  const { data, error } = await q.select('id');
  if (error) {
    // Logged, not swallowed. A claim that cannot run is a different fact from a claim that lost a
    // race, and reporting them identically is what hid this bug for as long as it hid.
    console.error('[receipts/extract] claim failed', { receiptId, error: error.message });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function markFailed(receiptId: string, message: string): Promise<void> {
  await supabaseAdmin
    .from('receipts')
    .update({
      extraction_status: 'failed',
      extraction_completed_at: new Date().toISOString(),
      extraction_error: message.slice(0, 1000),
    })
    .eq('id', receiptId);
}

async function writeBack(
  row: ClaimableReceipt,
  extracted: ExtractedReceipt,
  costCents: number,
): Promise<string | null> {
  // Read the row back first so a correction typed while the AI was thinking survives the answer.
  // Without this, somebody who fixes a total during the ten seconds an extraction takes watches
  // their edit disappear, and has no way to know why.
  const { data: current, error: readErr } = await supabaseAdmin
    .from('receipts')
    .select(
      'vendor_name, vendor_address, transaction_at, subtotal_cents, tax_cents, tip_cents, ' +
        'total_cents, payment_method, payment_last4, category, category_source, ' +
        'tax_deductible_flag, notes',
    )
    .eq('id', row.id)
    .single();
  if (readErr) return `read-back failed: ${readErr.message}`;

  const cur = (current ?? {}) as Partial<ReceiptCurrentSnapshot>;
  const update = buildReceiptUpdate(cur, extracted, costCents, new Date().toISOString());

  // ── THE ARITHMETIC IS CHECKED IN CODE, NOT TRUSTED TO THE MODEL ────────────────────────────────
  //
  // The prompt asks for this and the model mostly complies, but "mostly" is the wrong standard for
  // money. On the very first real test one meal produced both failure directions: the card slip
  // correctly inferred an unprinted $15.66 tip, while the itemised bill for the same meal invented a
  // $6.00 tip whose own numbers then summed to $90.34 against a printed total of $84.34 — and raised
  // no flag. Subtraction settles this; a language model should not be the last line of defence on it.
  const recon = reconcileAmounts({
    subtotal_cents: (update.subtotal_cents as number | null) ?? cur.subtotal_cents ?? extracted.subtotal_cents,
    tax_cents: (update.tax_cents as number | null) ?? cur.tax_cents ?? extracted.tax_cents,
    tip_cents: (update.tip_cents as number | null) ?? cur.tip_cents ?? extracted.tip_cents,
    discount_cents: extracted.discount_cents,
    total_cents: (update.total_cents as number | null) ?? cur.total_cents ?? extracted.total_cents,
    category: (update.category as string | null) ?? cur.category ?? extracted.category,
  });
  // Only ever writes the tip, and only when the figure is derived rather than read: an inferred
  // gratuity, or the removal of one that cannot exist. Nothing else is rewritten — a receipt whose
  // numbers disagree needs a person, and silently "correcting" one would destroy the evidence.
  if (recon.tipCents !== null) {
    // `fillIfEmpty` would refuse to overwrite a tip the model wrongly supplied, which is exactly the
    // case being corrected, so this is a deliberate direct write.
    update.tip_cents = recon.tipCents;
  }
  if (recon.flag) {
    const extras = update.ai_extras as { review_flags?: string[] } | undefined;
    if (extras) extras.review_flags = [...(extras.review_flags ?? []), recon.flag];
  }

  // ── IS THIS CARD ONE OF OURS? (owner request, 2026-08-12) ──────────────────────────────────────
  //
  // *"if a receipt uses a card that is not on file, it needs to be flagged."*
  //
  // Deliberately here and not in the prompt: the model reads what is printed on the slip and has no
  // idea which cards the firm owns. Asking it would be asking it to invent a fact it cannot see, so it
  // reports last four / brand / cardholder and the database answers the actual question.
  //
  // Best-effort. If the lookup fails the extraction still lands — losing every read field because the
  // card table was briefly unavailable would be a much worse trade than a missing flag.
  try {
    const { data: cards } = await supabaseAdmin
      .from('payment_cards')
      .select('id, last4, brand, label, holder_name, retired_at');
    const match = matchCardOnFile(
      {
        payment_method: (update.payment_method as string | null) ?? cur.payment_method ?? extracted.payment_method,
        payment_last4: (update.payment_last4 as string | null) ?? cur.payment_last4 ?? extracted.payment_last4,
        card_brand: extracted.card_brand,
        card_holder_name: extracted.card_holder_name,
      },
      cards ?? [],
    );
    if (match.cardId) update.payment_card_id = match.cardId;
    if (match.flag) {
      // Appended to whatever the model already flagged, not replacing it: the two are independent
      // questions and a bookkeeper needs both. `ai_extras` was built above, so this edits that object.
      const extras = update.ai_extras as { review_flags?: string[] } | undefined;
      if (extras) extras.review_flags = [...(extras.review_flags ?? []), match.flag];
    }
    update.card_match_status = match.status;
  } catch {
    /* card check unavailable — the extracted fields still save */
  }

  // Duplicate detection: the fingerprint can only be computed once vendor + total + date exist, so
  // it lives here rather than at insert time. A match is surfaced, never auto-discarded — two $5
  // coffees on the same day are both real.
  const fingerprint = computeDedupFingerprint(
    (update.vendor_name as string | null | undefined) ?? cur.vendor_name ?? null,
    (update.total_cents as number | null | undefined) ?? cur.total_cents ?? null,
    (update.transaction_at as string | null | undefined) ?? cur.transaction_at ?? null,
  );
  if (fingerprint) {
    update.dedup_fingerprint = fingerprint;
    const { data: matches } = await supabaseAdmin
      .from('receipts')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('dedup_fingerprint', fingerprint)
      .neq('id', row.id)
      .neq('status', 'rejected')
      .order('created_at', { ascending: true })
      .limit(1);
    if (matches && matches.length > 0) {
      update.dedup_match_id = (matches[0] as { id: string }).id;
    }
  }

  // ── TWO PIECES OF PAPER, ONE MEAL (owner request, 2026-08-13) ──────────────────────────────────
  //
  // *"I think I added two receipts for texas roadhouse… one that is $100 and one that is $84.34, but
  // really they are for the same meal… so that we don't count the purchase twice."*
  //
  // The fingerprint above cannot find this pair and never could: it is vendor|total|date, and these
  // two receipts have different totals (the tip) on different dates (23:59 and 00:04). What finds
  // them is that the bill's TOTAL is the slip's SUBTOTAL — see `same-purchase.ts`.
  //
  // The link is written but nothing is deleted or hidden: the superseded row stops counting toward
  // expenses and keeps its itemisation, which is the only record of what the food and the tax were.
  let settledBillTotalCents: number | null = null;
  const amounts = {
    vendor_name: (update.vendor_name as string | null) ?? cur.vendor_name ?? null,
    transaction_at: (update.transaction_at as string | null) ?? cur.transaction_at ?? null,
    subtotal_cents: (update.subtotal_cents as number | null) ?? cur.subtotal_cents ?? null,
    tax_cents: (update.tax_cents as number | null) ?? cur.tax_cents ?? null,
    tip_cents: (update.tip_cents as number | null) ?? cur.tip_cents ?? null,
    total_cents: (update.total_cents as number | null) ?? cur.total_cents ?? null,
  };
  try {
    const candidate: ComparableReceipt = { id: row.id, ...amounts, created_at: null };
    const { data: nearby } = await supabaseAdmin
      .from('receipts')
      .select('id, vendor_name, transaction_at, subtotal_cents, tax_cents, tip_cents, total_cents, created_at, category')
      .eq('user_id', row.user_id)
      .neq('id', row.id)
      .neq('status', 'rejected')
      // Rows already superseded are spoken for; pairing a third receipt to one of them would build a
      // chain, and a chain is how a total starts double-counting again from the other end.
      .is('superseded_by_receipt_id', null)
      .order('created_at', { ascending: false })
      .limit(200);

    const match = findSamePurchase(candidate, (nearby ?? []) as ComparableReceipt[]);
    if (match) {
      if (match.supersededId === row.id) {
        // This receipt is the itemisation; the one already on file is what left the account.
        update.superseded_by_receipt_id = match.countId;
        update.same_purchase_kind = match.kind;
        update.same_purchase_confidence = match.confidence;
      } else {
        // This receipt is the card slip. The bill on file becomes the itemisation — and its total is
        // exactly the figure that lets the handwritten tip be recovered below.
        const bill = ((nearby ?? []) as ComparableReceipt[]).find((r) => r.id === match.supersededId);
        settledBillTotalCents = bill?.total_cents ?? null;
        await supabaseAdmin
          .from('receipts')
          .update({
            superseded_by_receipt_id: row.id,
            same_purchase_kind: match.kind,
            same_purchase_confidence: match.confidence,
          })
          .eq('id', match.supersededId);
      }
      const extras = update.ai_extras as { review_flags?: string[] } | undefined;
      if (extras) extras.review_flags = [...(extras.review_flags ?? []), match.reason];
    }
  } catch {
    /* pairing unavailable — the extracted fields still save, and the nightly sweep retries */
  }

  // ── WHO ADDED WHAT (same request) ──────────────────────────────────────────────────────────────
  //
  // *"we need to recognize how much tax and tip the business applied, and how much tip I gave besides
  // that."* An 18% auto-gratuity and a figure written on the tip line are different facts, and when
  // this receipt settles a known bill the second one is pure arithmetic. See `charges.ts`.
  const charges = breakdownCharges({
    subtotal_cents: amounts.subtotal_cents,
    tax_cents: amounts.tax_cents,
    service_charge_cents: extracted.service_charge_cents,
    tip_cents: amounts.tip_cents,
    discount_cents: extracted.discount_cents,
    total_cents: amounts.total_cents,
    settledBillTotalCents,
    // Decides whether an unexplained gap may be called a tip — a fuel receipt's is unread tax.
    category: (update.category as string | null) ?? cur.category ?? null,
  });
  update.service_charge_cents = charges.businessGratuityCents;
  update.customer_tip_cents = charges.customerTipCents;
  if (settledBillTotalCents !== null && charges.customerTipCents > 0) {
    // The slip's own tip line and the arithmetic against the settled bill are the same figure; when
    // the bill is known the arithmetic is the better source, because the tip line is handwritten.
    update.tip_cents = charges.customerTipCents;
  }

  const { error: updateErr } = await supabaseAdmin
    .from('receipts')
    .update(update)
    .eq('id', row.id);
  if (updateErr) {
    // `ai_extras` arrives with seed 580. If a deploy runs ahead of the seed, the whole extraction
    // would otherwise be recorded as failed over a column that only feeds a detail panel — the
    // money fields in the same UPDATE would be lost with it. Retry once without it so the receipt
    // still gets its vendor, total and category.
    if (/ai_extras/i.test(updateErr.message)) {
      const { ai_extras: _dropped, ...withoutExtras } = update;
      const { error: retryErr } = await supabaseAdmin
        .from('receipts')
        .update(withoutExtras)
        .eq('id', row.id);
      if (retryErr) return retryErr.message;
      console.warn(
        '[receipts/extract] receipts.ai_extras is missing — apply seed 580_receipt_ai_extras.sql. ' +
          'Extraction saved without the detail panel fields.',
      );
    } else {
      return updateErr.message;
    }
  }

  // Replace line items rather than append — a re-extraction would otherwise double every line.
  const { error: deleteErr } = await supabaseAdmin
    .from('receipt_line_items')
    .delete()
    .eq('receipt_id', row.id);
  if (deleteErr) return `line-items clear: ${deleteErr.message}`;

  if (extracted.line_items.length > 0) {
    const { error: insertErr } = await supabaseAdmin.from('receipt_line_items').insert(
      extracted.line_items.map((li, idx) => ({
        receipt_id: row.id,
        description: li.description,
        amount_cents: li.amount_cents,
        quantity: li.quantity,
        position: idx,
      })),
    );
    if (insertErr) return `line-items insert: ${insertErr.message}`;
  }

  return null;
}
