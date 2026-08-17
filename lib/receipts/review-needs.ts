// lib/receipts/review-needs.ts — "which parts of this receipt should a person actually check?"
//
// Owner, 2026-08-16: *"If the AI is not certain about a name/number/etc for anything on the receipt,
// it should inform the viewer that they should review those parts of the receipt."*
//
// ── WHY THIS IS NOT ALREADY ANSWERED BY THE CONFIDENCE MARKERS ──────────────────────────────────
//
// The receipts page already dims a field whose stored confidence is below a threshold. That is a
// per-field hint, and it only works if you are already looking at that field. Nothing said, at the
// top of the receipt, "three things here are doubtful and one of them is the total".
//
// It also only covered ONE of the four reasons a value is doubtful. The others were computed
// elsewhere, or not at all:
//
//   1. the model said so             — `ai_confidence_per_field`, already stored
//   2. the paper is hard to read     — NEW: the extractor now reports print quality per field
//   3. the card does not match       — `card_match_status`, computed since 2026-08-12 and rendered
//                                      only for the `retired` case
//   4. the arithmetic disagrees      — the prompt raises a review flag, but nothing tied it to the
//                                      FIELDS involved
//
// Four sources, one question. Merging them here means the banner, the field markers and any future
// export all answer it the same way.
//
// Pure module. Tested in `__tests__/receipts/review-needs.test.ts`.

/** Below this, a stored confidence counts as doubtful. Matches the receipts page's own marker so a
 *  field flagged in the banner is the same field the page dims — two thresholds would be two
 *  different answers to one question. */
export const LOW_CONFIDENCE = 0.75;

export type ReviewReason =
  /** The model reported low confidence for this field. */
  | 'low_confidence'
  /** The model said this field was hard to read on the paper (faded ink, glare, cut off). */
  | 'hard_to_read'
  /** The last four do not match any card on file. */
  | 'card_not_on_file'
  /** A card was used but no last four could be read, so it could not be checked at all. */
  | 'card_unverifiable'
  /** subtotal + tax + service + tip - discount does not equal the total. */
  | 'arithmetic';

export interface ReviewItem {
  field: string;
  label: string;
  reason: ReviewReason;
  /** One sentence a bookkeeper can act on. */
  detail: string;
}

/** The shape this module reads. Deliberately loose — it is fed a row from `receipts`. */
export interface ReviewableReceipt {
  vendor_name?: string | null;
  transaction_at?: string | null;
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  tip_cents?: number | null;
  service_charge_cents?: number | null;
  total_cents?: number | null;
  payment_method?: string | null;
  payment_last4?: string | null;
  card_match_status?: string | null;
  ai_confidence_per_field?: Record<string, number> | null;
  ai_extras?: {
    discount_cents?: number | null;
    /** NEW — what the extractor said about how readable the paper was. */
    legibility?: {
      quality?: 'good' | 'fair' | 'poor' | null;
      issues?: string[] | null;
      /** Field keys the model wants a human to confirm against the photo. */
      fields_to_verify?: string[] | null;
    } | null;
    [k: string]: unknown;
  } | null;
}

const LABELS: Record<string, string> = {
  vendor_name: 'Vendor',
  vendor_address: 'Vendor address',
  transaction_at: 'Date',
  subtotal_cents: 'Subtotal',
  tax_cents: 'Tax',
  tip_cents: 'Tip',
  service_charge_cents: 'Service charge',
  discount_cents: 'Discount',
  total_cents: 'Total',
  payment_method: 'Payment method',
  payment_last4: 'Card last four',
  card_brand: 'Card brand',
  card_holder_name: 'Cardholder name',
  receipt_number: 'Receipt number',
  category: 'Category',
};

export function labelFor(field: string): string {
  return LABELS[field] ?? field.replace(/_cents$/, '').replace(/_/g, ' ');
}

/** Money fields, for the arithmetic check. */
function cents(v: number | null | undefined): number { return typeof v === 'number' ? v : 0; }

/**
 * Does `subtotal + tax + service + tip - discount` equal the total?
 *
 * Only asked when a total AND at least one part are present — a receipt with only a total is
 * complete, not broken, and flagging it would train people to ignore the flag. A dollar of slack
 * absorbs rounding on percentage-based service charges.
 */
export function arithmeticIsOff(r: ReviewableReceipt, toleranceCents = 100): boolean {
  const total = r.total_cents;
  if (typeof total !== 'number') return false;
  const parts = [r.subtotal_cents, r.tax_cents, r.tip_cents, r.service_charge_cents];
  if (!parts.some((p) => typeof p === 'number')) return false;
  const sum = cents(r.subtotal_cents) + cents(r.tax_cents) + cents(r.tip_cents)
    + cents(r.service_charge_cents) - cents(r.ai_extras?.discount_cents);
  return Math.abs(sum - total) > toleranceCents;
}

/**
 * Everything a person should confirm against the photo, most important first.
 *
 * One entry per FIELD, not per reason: a total that is both low-confidence and part of arithmetic
 * that does not balance is one thing to check, and listing it twice makes the banner look longer
 * than the work actually is.
 */
export function reviewNeeds(r: ReviewableReceipt): ReviewItem[] {
  const byField = new Map<string, ReviewItem>();
  /** First reason wins, and the order below IS the priority. */
  const add = (field: string, reason: ReviewReason, detail: string) => {
    if (!byField.has(field)) byField.set(field, { field, label: labelFor(field), reason, detail });
  };

  // 1. The paper itself. Ranked first because it explains the others: if the ink is faded, "the AI
  //    was unsure of the date" and "the date is wrong" are the same sentence.
  const leg = r.ai_extras?.legibility ?? null;
  for (const f of leg?.fields_to_verify ?? []) {
    add(f, 'hard_to_read', `The AI could not read this cleanly on the paper — check it against the photo.`);
  }

  // 2. The card. A last four read off a faded slip is the single most-reported mistake, and unlike
  //    the other fields there is something to check it AGAINST.
  if (r.card_match_status === 'not_on_file') {
    add('payment_last4', 'card_not_on_file',
      'This last four does not match any card on file — either the digits were misread, or the purchase was not on a company card.');
  } else if (r.card_match_status === 'unknown') {
    add('payment_last4', 'card_unverifiable',
      'A card was used but no last four could be read, so it could not be checked against the cards on file.');
  }

  // 3. Arithmetic. Attached to the total, because that is the figure that goes into the books.
  if (arithmeticIsOff(r)) {
    add('total_cents', 'arithmetic',
      'The parts do not add up to the total — one of the amounts has been misread.');
  }

  // 4. Whatever the model was unsure of, last: it is the weakest signal and the most numerous.
  for (const [field, score] of Object.entries(r.ai_confidence_per_field ?? {})) {
    if (typeof score === 'number' && score < LOW_CONFIDENCE) {
      add(field, 'low_confidence', `The AI was ${Math.round(score * 100)}% sure of this.`);
    }
  }

  const order: ReviewReason[] = ['hard_to_read', 'card_not_on_file', 'card_unverifiable', 'arithmetic', 'low_confidence'];
  return [...byField.values()].sort((a, b) => order.indexOf(a.reason) - order.indexOf(b.reason));
}

/**
 * One line for the top of the receipt.
 *
 * `null` when there is nothing to say — an unqualified "looks clean" banner on every receipt is
 * noise, and a banner that is always present stops being read.
 */
export function reviewSummary(r: ReviewableReceipt): { severity: 'poor' | 'warn'; text: string } | null {
  const needs = reviewNeeds(r);
  const quality = r.ai_extras?.legibility?.quality ?? null;
  if (needs.length === 0 && quality !== 'poor') return null;

  const names = needs.map((n) => n.label);
  const list = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;

  if (quality === 'poor') {
    return {
      severity: 'poor',
      text: needs.length
        ? `This receipt is hard to read — check every figure against the photo, starting with ${list}.`
        : 'This receipt is hard to read. Check the figures against the photo before approving.',
    };
  }
  return { severity: 'warn', text: `Worth checking against the photo: ${list}.` };
}
