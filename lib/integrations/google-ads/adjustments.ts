// lib/integrations/google-ads/adjustments.ts — restate the value when the real number lands. A9.
//
// `job_created` is the primary bidding conversion, valued at the ACCEPTED QUOTE, because that is the last
// milestone that reliably lands inside the 90-day click window (Finding 5). The quote is an estimate. The
// final invoice is the truth, and it arrives weeks later.
//
// So the number Google bids on is, by construction, provisional. This module is what makes it eventually
// correct: a **RESTATEMENT** when the real amount differs, a **RETRACTION** when the job is cancelled or
// refunded.
//
// ── G4: OUR BOOKS NEVER BEND TO FIT GOOGLE'S WINDOW ─────────────────────────────────────────────────
//
// When the adjustment falls outside the window, we do NOT alter the internal figure to keep the two in
// agreement, and we do not quietly drop it. The event is marked `adjustment_skipped_window` and our
// number stays right. Google's report and our books disagreeing is a fact about Google's window; a wrong
// internal number is a fact about us.
//
// ── EVERY REFUSAL HERE IS A DOCUMENTED GOOGLE ERROR WE WOULD OTHERWISE EARN ─────────────────────────
//
// Read off `developers.google.com/google-ads/api/docs/conversions/upload-adjustments` on **2026-08-01**:
//
//   • `not-uploaded` → *"The adjustment fails with a CONVERSION_NOT_FOUND error if the conversion was
//     never imported, or was imported, but discarded due to being deemed invalid or spam."* Adjusting a
//     conversion Google never accepted is guaranteed to fail, and the failure looks identical to a real
//     problem. So: no successful upload row, no adjustment.
//   • `action-changed` → *"You cannot change the ConversionAction assigned to a conversion with an
//     adjustment. Instead, use a RETRACTION to remove the previous conversion and import a new
//     conversion."* Handled explicitly rather than sending a doomed restatement.
//   • `orderId` is always sent, never `gclidDateTimePair` → *"You must specify the order_id ... [if] the
//     original conversion you are adjusting was assigned an order_id."* Ours always are.
//
// ── "NO CHANGE" IS A SKIP, NOT A NO-OP UPLOAD ───────────────────────────────────────────────────────
//
// Most jobs invoice at the quoted figure. Re-uploading an identical restatement every night would turn a
// quiet log into noise and make the one adjustment that matters unfindable.

import { formatConversionTime, withinClickWindow } from './offline';
import { adjustmentHash, type ConversionAdjustment } from './client';

/** Cents, because money in this codebase is cents. Compared exactly — floats are not money. */
export interface AdjustmentInput {
  /** The lifecycle event whose conversion was uploaded. */
  eventId: string;
  /** The order id we sent, verbatim. Google matches on this exact string. */
  orderId: string;
  /** The conversion action the ORIGINAL conversion was uploaded against. */
  uploadedAction: string;
  /** What we told Google it was worth, in cents. */
  uploadedValueCents: number | null;
  /** Was the original upload accepted? Anything else guarantees CONVERSION_NOT_FOUND. */
  originalUploaded: boolean;
  /** The action the conversion WOULD be uploaded against today, if it differs. */
  currentAction?: string;
  /** The truth now, in cents. Null when the job is cancelled/refunded → retraction. */
  currentValueCents: number | null;
  /** Cancelled, refunded, or otherwise no longer a conversion at all. */
  retracted?: boolean;
  /** The click, for the 90-day window. */
  clickAt: string | null;
  /** When we noticed. Adjustment time is when the ADJUSTMENT was decided, not the conversion time. */
  decidedAt: string;
}

export type SkipReason =
  | 'not-uploaded'
  | 'no-change'
  | 'out-of-window'
  | 'action-changed'
  | 'no-value';

export interface PlannedAdjustment {
  eventId: string;
  adjustment: ConversionAdjustment;
  hash: string;
}

export interface AdjustmentPlan {
  adjustments: PlannedAdjustment[];
  skipped: Array<{ eventId: string; reason: SkipReason }>;
}

/** One input → an adjustment or a named refusal. Exported so a single case can be reasoned about. */
export function planAdjustment(input: AdjustmentInput): PlannedAdjustment | { skip: SkipReason } {
  // Order matters: an un-uploaded conversion cannot be adjusted for ANY reason, so it is checked first.
  if (!input.originalUploaded) return { skip: 'not-uploaded' };

  // A changed action needs retract-then-reupload, which is a different operation than a restatement.
  // Sending a restatement here would be rejected, and the rejection would read like a bug.
  if (input.currentAction && input.currentAction !== input.uploadedAction) return { skip: 'action-changed' };

  const retracting = Boolean(input.retracted) || input.currentValueCents === null;

  // Nothing to say: the invoice matched the quote. The common case, and it must stay silent.
  if (!retracting && input.currentValueCents === input.uploadedValueCents) return { skip: 'no-change' };

  // A restatement with no number is not a statement. (A retraction legitimately has none.)
  if (!retracting && typeof input.currentValueCents !== 'number') return { skip: 'no-value' };

  // G4. Outside the window we keep OUR number and record why Google's will differ.
  if (!withinClickWindow(input.clickAt, input.decidedAt)) return { skip: 'out-of-window' };

  const adjustment: ConversionAdjustment = {
    conversionAction: input.uploadedAction,
    orderId: input.orderId,
    adjustmentType: retracting ? 'RETRACTION' : 'RESTATEMENT',
    // The same formatter A7's CSV and A8's uploads use. One formatter, one timezone story.
    adjustmentDateTime: formatConversionTime(input.decidedAt),
    ...(retracting ? {} : { restatementValue: (input.currentValueCents as number) / 100, currencyCode: 'USD' }),
  };

  return { eventId: input.eventId, adjustment, hash: adjustmentHash(adjustment) };
}

/** The batch form. `sentHashes` holds `eventId:adjustmentHash` for adjustments already accepted. */
export function planAdjustments(inputs: AdjustmentInput[], sentHashes: Set<string> = new Set()): AdjustmentPlan {
  const adjustments: PlannedAdjustment[] = [];
  const skipped: AdjustmentPlan['skipped'] = [];

  for (const input of inputs) {
    const result = planAdjustment(input);
    if ('skip' in result) { skipped.push({ eventId: input.eventId, reason: result.skip }); continue; }
    // Already sent this exact adjustment. A SECOND identical restatement is not wrong, but it is noise,
    // and noise is what hides the one that failed.
    if (sentHashes.has(`${result.eventId}:${result.hash}`)) { skipped.push({ eventId: input.eventId, reason: 'no-change' }); continue; }
    adjustments.push(result);
  }

  return { adjustments, skipped };
}

/**
 * The metadata we stamp on an event whose adjustment could not be sent because the window closed.
 *
 * The plan names this key explicitly, and it is the mechanism behind G4: the discrepancy between our
 * revenue and Google's reported conversion value becomes a thing you can query, rather than a mystery.
 */
export const WINDOW_SKIP_KEY = 'adjustment_skipped_window';

export function windowSkipMetadata(input: Pick<AdjustmentInput, 'uploadedValueCents' | 'currentValueCents' | 'decidedAt'>): Record<string, unknown> {
  return {
    [WINDOW_SKIP_KEY]: {
      at: input.decidedAt,
      reportedCents: input.uploadedValueCents,
      // The internal truth, recorded ALONGSIDE the stale reported figure rather than replacing it — the
      // gap is the point.
      actualCents: input.currentValueCents,
    },
  };
}
