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
    receipt_number?: string | null;
    discount_cents?: number | null;
    currency?: string | null;
  } | null;
  /** Batch Z. Set when this receipt fingerprints identically to an earlier non-rejected one from the
   *  same submitter. A WARNING, never an auto-discard — two $5 coffees on the same day are both
   *  real, and only a person can tell those from a receipt photographed twice. */
  dedup_match_id: string | null;
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
}
