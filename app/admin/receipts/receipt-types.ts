// app/admin/receipts/receipt-types.ts — the receipt row shape, shared by the queue and the panels
// lifted out of it (platform audit item 18).
//
// ── NOW ACTUALLY ONE COPY (R6, 2026-08-11) ──────────────────────────────────────────────────────
//
// This file's header used to say it "mirrors app/api/admin/receipts/route.ts", which is a polite way
// of saying there were two hand-maintained declarations of the same row — and it named that as the
// reason an earlier refactor could not simply move code.
//
// The predicted bill arrived: adding `ai_extras`, `dedup_match_id` and `line_items` here made the
// route fail to compile, because the route's own copy had never heard of them. Two shapes for one
// row, drifting in exactly the way the comment warned about.
//
// So the route now imports these instead of redeclaring them, and the split below is the one the
// route actually needed: `ReceiptRow` is what Postgres returns, `AdminReceiptRow` is that plus the
// joins and signed URLs the API annotates on. One declaration, two views of it.

/** The `receipts` table's own columns — what a `select('*')` gives you, before any joining. */
export interface ReceiptRow {
  id: string;
  user_id: string | null;
  job_id: string | null;
  /** Set when the receipt was captured against a specific clock-in rather than a whole job. */
  job_time_entry_id: string | null;
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
  photo_url: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  // Soft-delete + retention (Batch CC). Non-null deleted_at means
  // the row is tombstoned. The bookkeeper page hides these by
  // default but the "Show deleted" toggle (Batch FF) brings them
  // back for audit review.
  deleted_at: string | null;
  deletion_reason: string | null;
  extraction_status: string | null;
  extraction_error: string | null;
  extraction_cost_cents: number | null;
  ai_confidence_per_field: Record<string, number> | null;
  // ── The thorough read (owner 2026-08-18) ─────────────────────────────────────────────────────
  // Evidence from `/api/admin/receipts/[id]/deep-read`, stored on the row by seed 598 so the panel
  // is populated on load rather than only after somebody presses the button. Null on every receipt
  // that has not had a deep read — which is the honest distinction from "read and found nothing".
  deep_read_at: string | null;
  deep_transcript: string[] | null;
  deep_discrepancies: {
    code: string; field?: string; severity: 'high' | 'medium' | 'low'; message: string;
    readings?: { source: string; value: string }[];
  }[] | null;
  deep_vendor_check: { status: string; detail: string } | null;
  deep_note_confirmations: string[] | null;
  deep_band_count: number | null;
  deep_duration_ms: number | null;
  deep_cost_cents: number | null;
  created_at: string;
  updated_at: string | null;
  /** F10.9 — set when a bookkeeper-approved receipt is promoted
   *  to a capital asset row in equipment_inventory. The Batch QQ
   *  tax summary excludes promoted receipts on the receipts side
   *  so the dollars don't land twice on Schedule C. */
  promoted_to_equipment_id: string | null;
  // ── R6 (2026-08-11) — what the AI actually read ──────────────────────────────────────────────
  //
  // The extractor returned roughly twenty fields plus line items; the queue rendered eight. A
  // bookkeeper answered "which card was this?" or "what was actually on this receipt?" by squinting
  // at the photo, which is the job the extraction exists to remove.

  /** Seed 580. Vision detail that is not an accounting field — nothing sums it and nobody edits it.
   *  NULL means no extraction has run, which is deliberately distinguishable from an extraction that
   *  ran and found nothing. */
  ai_extras: {
    summary?: string | null;
    review_flags?: string[];
    vendor_phone?: string | null;
    card_brand?: string | null;
    card_holder_name?: string | null;
    receipt_number?: string | null;
    discount_cents?: number | null;
    service_charge_cents?: number | null;
    currency?: string | null;
    /**
     * How readable the PAPER was, assessed separately from how sure the model was of the characters
     * (2026-08-16).
     *
     * The distinction is the whole point: a receipt printed 8/12/2016 was read as 8/2/2026, and a
     * missing ink stroke does not produce an uncertain answer — it produces a confident wrong one.
     * `fields_to_verify` is the model saying "these characters could be something else", which
     * `ai_confidence_per_field` had no way to express.
     *
     * Optional, and absent on every receipt extracted before this shipped — which is why
     * `parseLegibility` defaults to `good` rather than putting a warning on the whole back catalogue.
     */
    legibility?: {
      quality?: 'good' | 'fair' | 'poor' | null;
      issues?: string[] | null;
      fields_to_verify?: string[] | null;
    } | null;
  } | null;
  /** Batch Z. Set when this receipt fingerprints identically to an earlier non-rejected one from the
   *  same submitter. A WARNING, never an auto-discard — two $5 coffees on the same day are both
   *  real, and only a person can tell those from a receipt photographed twice. */
  dedup_match_id: string | null;
  /**
   * Whether the card printed on the receipt is one the firm owns (seed 584).
   *
   * `not_a_card` · `unknown` · `on_file` · `retired` · `not_on_file`, or null when the check has not
   * run — which is every receipt extracted before 2026-08-12, and is deliberately distinguishable
   * from `unknown` ("checked and could not tell").
   *
   * The column exists so *"show me every receipt this quarter charged to a card we do not own"* is a
   * QUERY: the matcher also writes a sentence into `ai_extras.review_flags`, which is enough to see
   * the problem on a row and not enough to ask the question. It was written, indexed and maintained
   * while nothing read it back — so the queryable answer the seed was added for did not exist.
   */
  card_match_status: string | null;

  // ── Seed 590 — two pieces of paper, one purchase ─────────────────────────────────────────────
  //
  // Distinct from `dedup_match_id` above, which is "this might be the same photo twice". These say
  // "these are the itemised bill and the card slip for one meal", which is not a suspicion but
  // arithmetic: the bill's total is the slip's subtotal.

  /** When set, this row is the itemisation and the named receipt is what was charged. Every expense
   *  total excludes rows where this is set — see the finance routes. */
  superseded_by_receipt_id: string | null;
  /** `bill_and_slip` | `duplicate_photo`, or null when nothing was paired. */
  same_purchase_kind: string | null;
  /** `certain` | `likely`. `likely` means a person should glance before trusting the exclusion. */
  same_purchase_confidence: string | null;
  /** Gratuity the BUSINESS added — auto-gratuity, service fee. The payer had no say. */
  service_charge_cents: number | null;
  /** The tip the PAYER chose, on the tip line. Often derived rather than printed. */
  customer_tip_cents: number | null;

  // ── Seed 591 — whose money, and was it business at all ───────────────────────────────────────

  /** The card the matcher suggested. A suggestion until `card_confirmed_at` is set. */
  payment_card_id: string | null;
  /** Set when a PERSON agreed the matched card really is the one that paid. Four printed digits are
   *  not an identifier, and nothing is filed on a suggestion. */
  card_confirmed_at: string | null;
  card_confirmed_by: string | null;
  /** `business` | `personal` | null. The one fact nothing can derive: a personal card is used for
   *  both kinds of purchase, and only a person knows which this was. */
  expense_nature: string | null;
  expense_nature_note: string | null;
}

/**
 * R7 — does this receipt need a person to look at it?
 *
 * Lives beside the type, and is used by BOTH the API (to count the tab) and the queue (to badge the
 * row), because the alternative is the number on a tab disagreeing with the rows behind it — the
 * kind of mismatch that makes people stop trusting the filter and go back to reading every receipt.
 *
 * The three conditions are not interchangeable, and each answers a different question:
 *   · `failed`         — the AI never read it. Somebody keys it in, or re-runs the extraction.
 *   · `dedup_match_id` — it may be the same receipt twice. Only a person can tell a duplicate photo
 *                        from two genuine $5 coffees on the same day.
 *   · `review_flags`   — the AI read it and saw something off (totals that do not add up, an
 *                        illegible date, what looks like a personal item).
 *
 * Note what is NOT here: a receipt that has never been extracted. `queued` is not "needs review",
 * it is "not looked at yet" — putting it in this view would bury the receipts that genuinely need
 * a decision under every receipt uploaded in the last five minutes.
 *
 * The SQL predicate in `app/api/admin/receipts/route.ts` mirrors this exactly; if one changes, the
 * other must.
 */
export function needsReview(row: {
  extraction_status: string | null;
  dedup_match_id: string | null;
  ai_extras: { review_flags?: string[] } | null;
  card_match_status?: string | null;
  expense_nature?: string | null;
}): boolean {
  if (row.extraction_status === 'failed') return true;
  if (row.dedup_match_id) return true;
  // A fourth condition (2026-08-13): a card nobody recognises, with nobody having said what it was.
  //
  // Owner: *"maybe one of the employees paid for something without using the business card… we might
  // reimburse them, or maybe not."* The matcher already writes a sentence into `review_flags`, which
  // makes the row appear here today — but only for receipts extracted since the matcher existed, and
  // a flag is prose. This is the state, so the tab and the SQL agree on it and a decision that HAS
  // been made removes the row from the queue.
  if (row.card_match_status === 'not_on_file' && !row.expense_nature) return true;
  return (row.ai_extras?.review_flags?.length ?? 0) > 0;
}

/**
 * A receipt as the bookkeeper queue receives it: the table's columns plus everything
 * `/api/admin/receipts` resolves on its behalf, batched across the page so the UI never fetches
 * per row.
 */
export interface AdminReceiptRow extends ReceiptRow {
  /** Joined from auth.users — bookkeeper-friendly view of who submitted. */
  submitted_by_email: string | null;
  submitted_by_name: string | null;
  /** Joined from jobs — saves the UI from a per-row fetch, and lets the job picker render the
   *  current selection without one either. */
  job_name: string | null;
  job_number: string | null;
  /** Pre-signed photo URL valid for 15 min. Null if signing failed. */
  photo_signed_url: string | null;
  /** R6 — transcribed lines, in printed order, from `receipt_line_items`. Empty for a fuel slip or
   *  a toll, which have none — that is a correct empty, not a failed extraction. */
  line_items: Array<{
    id: string;
    description: string | null;
    amount_cents: number | null;
    quantity: number | null;
    position: number | null;
  }>;
  /** F10.7 tail — maintenance events that link to this receipt
   *  via `linked_receipt_id`. Empty array when none. */
  linked_maintenance_events: Array<{
    id: string;
    summary: string;
    kind: string;
    state: string;
    scheduled_for: string | null;
    equipment_inventory_id: string | null;
    equipment_name: string | null;
  }>;
  /**
   * The card that paid, resolved from `payment_card_id` (2026-08-13).
   *
   * `role` is the field that matters and the reason this is the row rather than the id: whose money
   * paid outranks what was bought, and until this was resolved that rule had nothing to read.
   */
  payment_card: ReceiptPaymentCard | null;
}

/** One row of `payment_cards`, as the receipts queue receives it. */
export interface ReceiptPaymentCard {
  id: string;
  label: string | null;
  last4: string | null;
  brand: string | null;
  /** `COMPANY` | `OWNER_PERSONAL` | `EMPLOYEE_PERSONAL` | `CLIENT` | `UNKNOWN` — seed 572. */
  role: string | null;
  holder_name: string | null;
  retired_at: string | null;
}
